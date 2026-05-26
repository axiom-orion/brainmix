/**
 * Public playlist preview page.
 *
 * RLS allows SELECT on a playlist row when is_public = true, and likewise
 * for its playlist_tracks rows + the referenced tracks rows (metadata only).
 * Audio bytes remain private — this is a browse/discover surface, not a
 * streaming surface. Visitors who own the same tracks can play them in their
 * own library; everyone else sees the listing.
 */

import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DBPlaylist, DBTrack } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ token: string }>;
}

interface JoinRow {
  position: number;
  tracks: DBTrack;
}

export default async function PlaylistPage({ params }: Params) {
  const { token } = await params;
  const sb = await getSupabaseServerClient();

  const { data: playlist, error: pErr } = await sb
    .from("playlists")
    .select("*")
    .eq("share_token", token)
    .eq("is_public", true)
    .maybeSingle();

  if (pErr || !playlist) notFound();
  const p = playlist as DBPlaylist;

  const { data: rows } = await sb
    .from("playlist_tracks")
    .select("position, tracks(*)")
    .eq("playlist_id", p.id)
    .order("position", { ascending: true });

  const tracks = (rows as JoinRow[] | null) ?? [];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans">
      <div className="mx-auto max-w-md md:max-w-lg px-6 py-12">
        <a
          href="/"
          className="text-xs uppercase tracking-wider text-zinc-500 hover:text-[#00ffcc]"
        >
          ← brainmix
        </a>
        <div className="mt-6">
          <div className="text-[11px] uppercase tracking-widest text-[#a78bfa] mb-1">
            Shared playlist
          </div>
          <h1 className="text-2xl md:text-3xl font-light tracking-tight mb-2 text-zinc-100">
            {p.name}
          </h1>
          <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-mono mb-6">
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
          </p>
        </div>

        {tracks.length === 0 ? (
          <p className="text-sm text-zinc-500 leading-relaxed">
            This playlist is empty.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {tracks.map((r, i) => {
              const t = r.tracks;
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/40"
                >
                  <span className="text-[11px] text-zinc-600 font-mono w-6 text-right">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{t.name}</div>
                    {(t.artist || t.album) && (
                      <div className="text-[11px] text-zinc-500 truncate">
                        {t.artist}
                        {t.artist && t.album && " · "}
                        {t.album}
                      </div>
                    )}
                  </div>
                  {t.bpm != null && (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {t.bpm} BPM
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-10 p-4 rounded-xl border border-zinc-800 bg-zinc-950/40">
          <p className="text-xs text-zinc-400 leading-relaxed">
            This is a public playlist on{" "}
            <span className="text-[#a78bfa]">brainmix</span> — track metadata is
            visible but audio stays with the owner. Sign in to build your own.
          </p>
          <a
            href="/"
            className="block mt-3 text-center py-2 rounded-lg border border-[#a78bfa]/40 text-[#a78bfa] text-xs uppercase tracking-wider hover:bg-[#a78bfa]/10"
          >
            Make your own
          </a>
        </div>
      </div>
    </div>
  );
}
