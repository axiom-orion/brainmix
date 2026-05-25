/**
 * Library modal with three views: track list, album grid, single-album detail.
 *
 * Sort + filter (title/artist/album/BPM/recent) and search across name fields.
 * Each row routes to player, DJ slot A, DJ slot B (when present), or playlist.
 */

"use client";

import { useEffect, useState } from "react";
import { signCoverUrl } from "@/lib/cloudLibrary";
import type { SongSlot } from "@/lib/songSlots";
import { formatTime, formatSize } from "./utils";
import type { LibraryEntryShape, SlotId } from "./types";

interface Props {
  entries: LibraryEntryShape[];
  slots: SongSlot[];
  importing: { total: number; done: number } | null;
  onClose: () => void;
  onLoad: (e: LibraryEntryShape, slotId: SlotId) => void;
  onDelete: (e: LibraryEntryShape) => void;
  onPlay: (e: LibraryEntryShape, idx: number) => void;
  onPlayMany: (entries: LibraryEntryShape[]) => void;
  onAddToPlaylist: (e: LibraryEntryShape) => void;
  onEdit: (
    e: LibraryEntryShape,
    patch: { name?: string; artist?: string | null; album?: string | null; year?: number | null },
  ) => Promise<void>;
  onBulkImport: () => void;
}

export function LibraryModal({
  entries,
  slots,
  importing,
  onClose,
  onLoad,
  onDelete,
  onPlay,
  onPlayMany,
  onAddToPlaylist,
  onEdit,
  onBulkImport,
}: Props) {
  const hasSlotB = slots.some((s) => s.id === "B");
  const isCloud = entries.some((e) => e.source === "cloud") || entries.length === 0;
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"tracks" | "albums">("tracks");
  const [sortBy, setSortBy] = useState<"recent" | "title" | "artist" | "album" | "bpm">("recent");
  const [openAlbum, setOpenAlbum] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const searched = query
    ? entries.filter((e) => {
        const q = query.toLowerCase();
        return (
          e.name.toLowerCase().includes(q) ||
          (e.artist && e.artist.toLowerCase().includes(q)) ||
          (e.album && e.album.toLowerCase().includes(q))
        );
      })
    : entries;

  const sorted = [...searched].sort((a, b) => {
    switch (sortBy) {
      case "title": return a.name.localeCompare(b.name);
      case "artist": return (a.artist ?? "").localeCompare(b.artist ?? "");
      case "album": return (a.album ?? "").localeCompare(b.album ?? "");
      case "bpm": return (a.bpm ?? 0) - (b.bpm ?? 0);
      case "recent":
      default: return 0;
    }
  });

  const albumGroups = new Map<string, LibraryEntryShape[]>();
  for (const e of sorted) {
    const key = e.album?.trim() || (e.artist ? `${e.artist} — singles` : "Untitled album");
    const arr = albumGroups.get(key) ?? [];
    arr.push(e);
    albumGroups.set(key, arr);
  }
  const filtered = sorted.map((e) => ({ e, i: entries.indexOf(e) }));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16161a] border border-zinc-800 rounded-xl p-5 max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-base font-medium text-[#00ffcc] uppercase tracking-wider">
            Track Library
          </h2>
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            {entries.length} track{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
          {isCloud ? "Cloud · syncs across devices" : "Local · this device only"}
        </p>

        <div className="flex gap-2 mb-3">
          <button
            onClick={onBulkImport}
            disabled={!!importing}
            className="flex-1 h-9 rounded-lg border border-[#00ffcc]/40 text-[#00ffcc] text-[11px] uppercase tracking-wider hover:bg-[#00ffcc]/10 disabled:opacity-50"
          >
            + Import many
          </button>
        </div>

        {importing && (
          <div className="mb-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="text-zinc-400 uppercase tracking-wider">Importing</span>
              <span className="text-[#00ffcc] font-mono">
                {importing.done} / {importing.total}
              </span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00ffcc] transition-all"
                style={{ width: `${(importing.done / importing.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, artist, album…"
              className="w-full mb-3 bg-black/40 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#00ffcc]/40"
            />
            <div className="flex items-center gap-2 mb-3">
              <div className="flex gap-1 p-1 bg-black/40 border border-zinc-900 rounded">
                {(["tracks", "albums"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-2.5 py-1 text-[10px] uppercase tracking-wider rounded ${
                      view === v ? "bg-zinc-900 text-[#00ffcc]" : "text-zinc-600 hover:text-zinc-300"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as "recent" | "title" | "artist" | "album" | "bpm")
                }
                className="flex-1 bg-black/40 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="recent">Recently added</option>
                <option value="title">Title</option>
                <option value="artist">Artist</option>
                <option value="album">Album</option>
                <option value="bpm">BPM</option>
              </select>
            </div>
          </>
        )}

        {entries.length === 0 ? (
          <p className="text-sm text-zinc-500 leading-relaxed mb-4">
            Empty. Tap <strong className="text-[#00ffcc]">+ Import many</strong> to bulk-add files,
            drag-and-drop audio files anywhere on the page, or load one into a slot and tap ⭑ Save.
          </p>
        ) : view === "albums" ? (
          openAlbum ? (
            <AlbumDetail
              album={openAlbum}
              tracks={albumGroups.get(openAlbum) ?? []}
              onBack={() => setOpenAlbum(null)}
              onPlayAlbum={(entries) => onPlayMany(entries)}
              onPlayTrack={(_e, i) => {
                const all = albumGroups.get(openAlbum) ?? [];
                onPlayMany(all.slice(i).concat(all.slice(0, i)));
              }}
              onLoad={onLoad}
              hasSlotB={hasSlotB}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {Array.from(albumGroups.entries()).map(([albumName, tracks]) => (
                <AlbumCard
                  key={albumName}
                  name={albumName}
                  tracks={tracks}
                  onOpen={() => setOpenAlbum(albumName)}
                  onPlay={() => onPlayMany(tracks)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-2 mb-4">
            {filtered.map(({ e: t, i }) =>
              editingId === t.id ? (
                <EditTrackRow
                  key={t.id}
                  entry={t}
                  onCancel={() => setEditingId(null)}
                  onSave={async (patch) => {
                    await onEdit(t, patch);
                    setEditingId(null);
                  }}
                />
              ) : (
                <div
                  key={t.id}
                  className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/40"
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-200 font-medium truncate">
                        {t.name}
                      </div>
                      {(t.artist || t.album) && (
                        <div className="text-[11px] text-zinc-400 truncate">
                          {t.artist}
                          {t.artist && t.album && " · "}
                          {t.album}
                        </div>
                      )}
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5 font-mono">
                        {t.bpm ? `${t.bpm} BPM` : "—"} · {formatSize(t.size)}
                        {t.durationSec ? ` · ${formatTime(t.durationSec)}` : ""}
                        {" · "}
                        {t.source === "cloud" ? "☁" : "▢"}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {t.source === "cloud" && (
                        <button
                          onClick={() => setEditingId(t.id)}
                          className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 border border-zinc-800 rounded hover:border-zinc-600 hover:text-zinc-300"
                          aria-label="Edit metadata"
                          title="Edit title / artist / album / year"
                        >
                          ✎
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(t)}
                        className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 border border-zinc-800 rounded hover:border-rose-500/40 hover:text-rose-400"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => onPlay(t, i)}
                      className="flex-1 min-w-[80px] py-1.5 text-[11px] uppercase tracking-wider rounded bg-[#00ffcc] text-zinc-950 font-medium hover:bg-[#00ffcc]/85"
                    >
                      ▶ Play
                    </button>
                    {t.source === "cloud" && (
                      <button
                        onClick={() => onAddToPlaylist(t)}
                        className="flex-1 min-w-[80px] py-1.5 text-[11px] uppercase tracking-wider rounded border border-[#a78bfa]/40 text-[#a78bfa] hover:bg-[#a78bfa]/10"
                      >
                        + Playlist
                      </button>
                    )}
                    <button
                      onClick={() => onLoad(t, "A")}
                      className="flex-1 min-w-[60px] py-1.5 text-[11px] uppercase tracking-wider rounded border border-[#00ffcc]/40 text-[#00ffcc] hover:bg-[#00ffcc]/10"
                    >
                      → A
                    </button>
                    {hasSlotB && (
                      <button
                        onClick={() => onLoad(t, "B")}
                        className="flex-1 min-w-[60px] py-1.5 text-[11px] uppercase tracking-wider rounded border border-[#a78bfa]/40 text-[#a78bfa] hover:bg-[#a78bfa]/10"
                      >
                        → B
                      </button>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full h-10 rounded-lg bg-zinc-800 text-zinc-200 text-sm uppercase tracking-wider hover:bg-zinc-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function EditTrackRow({
  entry,
  onCancel,
  onSave,
}: {
  entry: LibraryEntryShape;
  onCancel: () => void;
  onSave: (patch: {
    name?: string;
    artist?: string | null;
    album?: string | null;
    year?: number | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(entry.name);
  const [artist, setArtist] = useState(entry.artist ?? "");
  const [album, setAlbum] = useState(entry.album ?? "");
  // year isn't on LibraryEntryShape — defer it until needed.
  const [saving, setSaving] = useState(false);
  return (
    <div className="p-3 rounded-lg border border-[#00ffcc]/40 bg-[#00ffcc]/[0.02]">
      <div className="text-[10px] uppercase tracking-widest text-[#00ffcc]/80 mb-2">
        Edit metadata
      </div>
      <div className="space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Title"
          className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-[#00ffcc]/40"
        />
        <input
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="Artist"
          className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-[#00ffcc]/40"
        />
        <input
          value={album}
          onChange={(e) => setAlbum(e.target.value)}
          placeholder="Album"
          className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-[#00ffcc]/40"
        />
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({
                name: name.trim() || entry.name,
                artist: artist.trim() || null,
                album: album.trim() || null,
              });
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
          className="flex-1 py-1.5 text-[11px] uppercase tracking-wider rounded bg-[#00ffcc] text-zinc-950 font-medium hover:bg-[#00ffcc]/85 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-1.5 text-[11px] uppercase tracking-wider rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AlbumCard({
  name,
  tracks,
  onOpen,
  onPlay,
}: {
  name: string;
  tracks: LibraryEntryShape[];
  onOpen: () => void;
  onPlay: () => void;
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const coverSource = tracks.find((t) => t.coverPath)?.coverPath ?? null;
  useEffect(() => {
    let cancelled = false;
    if (coverSource) {
      signCoverUrl(coverSource).then((u) => {
        if (!cancelled) setCoverUrl(u);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [coverSource]);
  const artist = tracks[0]?.artist;
  return (
    <button
      onClick={onOpen}
      className="text-left p-2 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
    >
      <div className="aspect-square w-full mb-2 rounded overflow-hidden bg-zinc-900 flex items-center justify-center relative group">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl text-zinc-700">♪</span>
        )}
        <span
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-[#00ffcc] text-zinc-950 text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ▶
        </span>
      </div>
      <div className="text-[12px] text-zinc-200 font-medium truncate">{name}</div>
      <div className="text-[10px] text-zinc-500 truncate">
        {artist || "Various"} · {tracks.length} track{tracks.length !== 1 ? "s" : ""}
      </div>
    </button>
  );
}

function AlbumDetail({
  album,
  tracks,
  onBack,
  onPlayAlbum,
  onPlayTrack,
  onLoad,
  hasSlotB,
}: {
  album: string;
  tracks: LibraryEntryShape[];
  onBack: () => void;
  onPlayAlbum: (entries: LibraryEntryShape[]) => void;
  onPlayTrack: (e: LibraryEntryShape, idx: number) => void;
  onLoad: (e: LibraryEntryShape, slotId: SlotId) => void;
  hasSlotB: boolean;
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const coverSource = tracks.find((t) => t.coverPath)?.coverPath ?? null;
  useEffect(() => {
    let cancelled = false;
    if (coverSource) {
      signCoverUrl(coverSource).then((u) => {
        if (!cancelled) setCoverUrl(u);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [coverSource]);
  return (
    <div className="mb-4">
      <button
        onClick={onBack}
        className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-[#00ffcc] mb-3"
      >
        ← Back to albums
      </button>
      <div className="flex gap-3 mb-3">
        <div className="w-20 h-20 rounded overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0 flex items-center justify-center">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl text-zinc-700">♪</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-100 font-medium truncate">{album}</div>
          <div className="text-[11px] text-zinc-500 truncate">
            {tracks[0]?.artist ?? "Various"} · {tracks.length} tracks
          </div>
          <button
            onClick={() => onPlayAlbum(tracks)}
            className="mt-2 px-3 py-1.5 text-[11px] uppercase tracking-wider rounded bg-[#00ffcc] text-zinc-950 font-medium hover:bg-[#00ffcc]/85"
          >
            ▶ Play album
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {tracks.map((t, i) => (
          <div
            key={t.id}
            className="p-2 rounded border border-zinc-800 bg-zinc-900/40 flex items-center gap-2"
          >
            <span className="text-[11px] text-zinc-600 font-mono w-6 text-right">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-zinc-200 truncate">{t.name}</div>
              <div className="text-[10px] text-zinc-500 truncate">
                {t.durationSec ? formatTime(t.durationSec) : "—"}
                {t.bpm ? ` · ${t.bpm} BPM` : ""}
              </div>
            </div>
            <button
              onClick={() => onPlayTrack(t, i)}
              className="px-2 py-1 text-[10px] uppercase tracking-wider rounded bg-[#00ffcc] text-zinc-950 hover:bg-[#00ffcc]/85"
            >
              ▶
            </button>
            <button
              onClick={() => onLoad(t, "A")}
              className="px-2 py-1 text-[10px] uppercase tracking-wider rounded border border-[#00ffcc]/40 text-[#00ffcc] hover:bg-[#00ffcc]/10"
            >
              A
            </button>
            {hasSlotB && (
              <button
                onClick={() => onLoad(t, "B")}
                className="px-2 py-1 text-[10px] uppercase tracking-wider rounded border border-[#a78bfa]/40 text-[#a78bfa] hover:bg-[#a78bfa]/10"
              >
                B
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
