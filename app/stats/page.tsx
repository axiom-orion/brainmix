/**
 * /stats — your library at a glance.
 *
 * Server-rendered. Pulls totals from Supabase via the user's session. If not
 * signed in, shows a sign-in prompt instead of zero-state numbers.
 */

import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DBMix, DBTrack } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface AlbumCount {
  album: string;
  count: number;
}

export default async function StatsPage() {
  const sb = await getSupabaseServerClient();
  const { data: userData } = await sb.auth.getUser();
  const user = userData?.user ?? null;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans">
        <div className="mx-auto max-w-md md:max-w-lg px-6 py-12">
          <Link
            href="/"
            className="text-xs uppercase tracking-wider text-zinc-500 hover:text-[#00ffcc]"
          >
            ← brainmix
          </Link>
          <h1 className="text-2xl md:text-3xl font-light tracking-tight mt-6 mb-2">
            Stats
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            Sign in on the main app to see your library totals, top albums, and
            total listen-time minutes.
          </p>
          <Link
            href="/"
            className="block text-center py-3 rounded-lg border border-[#00ffcc]/40 text-[#00ffcc] text-sm uppercase tracking-wider hover:bg-[#00ffcc]/10"
          >
            Go to brainmix
          </Link>
        </div>
      </div>
    );
  }

  // Pull aggregates in parallel.
  const [
    { count: trackCount },
    { count: mixCount },
    { count: playlistCount },
    { data: durationRows },
    { data: tracksForAlbums },
  ] = await Promise.all([
    sb.from("tracks").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    sb.from("mixes").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    sb.from("playlists").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    sb.from("mixes").select("duration_ms").eq("user_id", user.id),
    sb.from("tracks").select("album").eq("user_id", user.id).not("album", "is", null),
  ]);

  const totalMixMs =
    ((durationRows as Pick<DBMix, "duration_ms">[] | null) ?? []).reduce(
      (acc, m) => acc + (m.duration_ms ?? 0),
      0,
    );

  const totalMixMinutes = Math.floor(totalMixMs / 60000);
  const totalMixHours = (totalMixMs / 3600000).toFixed(1);

  // Build top albums list (descending by track count).
  const albumCounts = new Map<string, number>();
  for (const row of (tracksForAlbums as Pick<DBTrack, "album">[] | null) ?? []) {
    const a = row.album?.trim();
    if (!a) continue;
    albumCounts.set(a, (albumCounts.get(a) ?? 0) + 1);
  }
  const topAlbums: AlbumCount[] = Array.from(albumCounts.entries())
    .map(([album, count]) => ({ album, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans">
      <div className="mx-auto max-w-md md:max-w-2xl px-6 py-10">
        <Link
          href="/"
          className="text-xs uppercase tracking-wider text-zinc-500 hover:text-[#00ffcc]"
        >
          ← brainmix
        </Link>
        <h1 className="text-2xl md:text-3xl font-light tracking-tight mt-6 mb-1">
          Your stats
        </h1>
        <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-8">
          {user.email}
        </p>

        {/* Top-line tile grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <Tile label="Tracks" value={trackCount ?? 0} accent="#00ffcc" />
          <Tile label="Mixes" value={mixCount ?? 0} accent="#a78bfa" />
          <Tile label="Playlists" value={playlistCount ?? 0} accent="#fb7185" />
          <Tile
            label="Mix hours"
            value={totalMixHours}
            accent="#00ffcc"
            sub={`${totalMixMinutes} min`}
          />
        </div>

        {/* Top albums */}
        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-widest text-[#00ffcc] mb-3">
            Top albums
          </h2>
          {topAlbums.length === 0 ? (
            <p className="text-sm text-zinc-500 leading-relaxed">
              No albums tagged yet. Import some MP3s with album ID3 fields, or
              edit metadata from the library.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {topAlbums.map((a, i) => (
                <li
                  key={a.album}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/40"
                >
                  <span className="text-[11px] text-zinc-600 font-mono w-6 text-right">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-zinc-200 truncate">
                    {a.album}
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {a.count} track{a.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Footer nav */}
        <div className="flex gap-2 text-[11px] uppercase tracking-wider">
          <Link
            href="/"
            className="flex-1 py-2.5 text-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
          >
            Mobile app
          </Link>
          <Link
            href="/console"
            className="flex-1 py-2.5 text-center rounded-lg border border-[#a78bfa]/40 text-[#a78bfa] hover:bg-[#a78bfa]/10"
          >
            Console
          </Link>
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent: string;
}) {
  return (
    <div
      className="p-4 rounded-xl border bg-zinc-900/40"
      style={{ borderColor: `${accent}55` }}
    >
      <div
        className="text-[10px] uppercase tracking-widest mb-1"
        style={{ color: accent }}
      >
        {label}
      </div>
      <div className="text-2xl md:text-3xl font-light tabular-nums" style={{ color: "#fafafa" }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5 font-mono">
          {sub}
        </div>
      )}
    </div>
  );
}
