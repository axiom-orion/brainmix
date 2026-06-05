/**
 * Feature flags — runtime kill switches for risky features.
 *
 * Backed by GrowthBook when NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY is set: the
 * feature payload (keys `brainmix.{flag}`) is fetched from the CDN with a
 * 60s stale-while-revalidate cache, on both server and client. Flags can be
 * toggled from the GrowthBook dashboard with no redeploy.
 *
 * Without the env key, every flag returns its default (current behavior).
 *
 * Kill-switch semantics: once a payload has loaded, a flag missing from it
 * means its environment toggle is off in GrowthBook — we return false, not
 * the default.
 */

const FLAG_PREFIX = "brainmix.";
const CLIENT_KEY = process.env.NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY || "";
const API_HOST =
  process.env.NEXT_PUBLIC_GROWTHBOOK_API_HOST || "https://cdn.growthbook.io";
const REFRESH_INTERVAL_MS = 60_000;

export type FlagKey = "webrtc_console" | "llm_engineer" | "realtime_sync";

const DEFAULTS: Record<FlagKey, boolean> = {
  /** The /console multi-deck DJ interface. */
  webrtc_console: true,
  /** The /api/engineer LLM streaming endpoint (the rule engine always runs). */
  llm_engineer: true,
  /** Supabase Realtime channels: live chat, presence, room metadata, slot sync. */
  realtime_sync: true,
};

let features: Record<string, { defaultValue?: unknown }> | null = null;
let lastFetchAt = 0;
let inFlight: Promise<void> | null = null;

function refresh(): Promise<void> {
  if (!CLIENT_KEY || typeof fetch === "undefined") return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = fetch(`${API_HOST}/api/features/${CLIENT_KEY}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`GrowthBook fetch failed: ${res.status}`);
      const data = (await res.json()) as {
        features?: Record<string, { defaultValue?: unknown }>;
      };
      features = data.features ?? null;
      lastFetchAt = Date.now();
    })
    .catch(() => {
      /* network/config errors: keep stale payload or defaults */
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Synchronous flag read. Returns the default until the payload has loaded
 * (it starts loading on module import), then the live GrowthBook value.
 */
export function getFlag(key: FlagKey): boolean {
  if (!features) {
    void refresh();
    return DEFAULTS[key];
  }

  // Stale-while-revalidate: serve the cached payload, refresh in background.
  if (Date.now() - lastFetchAt > REFRESH_INTERVAL_MS) void refresh();

  const feature = features[FLAG_PREFIX + key];
  if (!feature) return false; // missing from loaded payload = kill switch
  return feature.defaultValue === true;
}

/**
 * Async flag read that waits for the first payload load — use in API routes
 * where one await guarantees the remote value even on a cold start.
 */
export async function getFlagAsync(key: FlagKey): Promise<boolean> {
  if (!features) await refresh();
  return getFlag(key);
}

// Begin loading remote flags as soon as the module is imported.
void refresh();
