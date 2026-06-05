/**
 * Cross-route slot sharing via localStorage + storage events.
 *
 * The mobile app at / and the desktop console at /console run separate React
 * trees with separate state. We bridge them by writing a small JSON snapshot
 * to localStorage and listening for `storage` events (which fire across tabs
 * in the same browser session).
 *
 * Limitation: blob URLs (loaded-from-disk files) are document-scoped and
 * cannot cross routes. We only sync TRACK IDS for cloud tracks. Local-only
 * files stay where they were loaded.
 */

import { getFlag } from "@/lib/flags";

export interface RouteSlotSnapshot {
  /** Cloud track id loaded into deck A, or null. */
  trackIdA: string | null;
  /** Cloud track id loaded into deck B, or null. */
  trackIdB: string | null;
  /** Last update timestamp, used for conflict resolution. */
  ts: number;
}

const STORAGE_KEY = "brainmix:route-slots";

export function readSlots(): RouteSlotSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RouteSlotSnapshot;
  } catch {
    return null;
  }
}

export function writeSlots(snapshot: Partial<RouteSlotSnapshot>): void {
  if (typeof window === "undefined") return;
  const prev = readSlots() ?? { trackIdA: null, trackIdB: null, ts: 0 };
  const next: RouteSlotSnapshot = {
    ...prev,
    ...snapshot,
    ts: Date.now(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage full / unavailable */
  }
}

/**
 * Subscribe to slot-snapshot changes from other tabs/routes. Returns a cleanup.
 * The handler is called with the new snapshot; the `storage` event already
 * filters by key, so we re-parse here.
 */
export function subscribeSlots(
  handler: (snapshot: RouteSlotSnapshot) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  if (!getFlag("realtime_sync")) return () => {};
  const listener = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      handler(JSON.parse(e.newValue) as RouteSlotSnapshot);
    } catch {
      /* ignore corrupt snapshots */
    }
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
