/**
 * Playlists modals — listing/creating/deleting + a single-track add-to picker.
 */

"use client";

import { useState } from "react";
import type { Playlist } from "@/lib/cloudLibrary";

export function PlaylistsModal({
  playlists,
  onClose,
  onCreate,
  onDelete,
  onPlay,
}: {
  playlists: Playlist[];
  onClose: () => void;
  onCreate: (name: string) => Promise<Playlist | null>;
  onDelete: (id: string) => Promise<void>;
  onPlay: (id: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16161a] border border-zinc-800 rounded-xl p-5 max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-medium text-[#a78bfa] uppercase tracking-wider mb-3">
          Playlists
        </h2>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            setCreating(true);
            await onCreate(newName);
            setNewName("");
            setCreating(false);
          }}
          className="flex gap-2 mb-4"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New playlist name"
            className="flex-1 bg-black/40 border border-zinc-800 rounded px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-[#a78bfa]/40"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="px-3 py-1.5 text-[11px] uppercase tracking-wider rounded border border-[#a78bfa]/40 text-[#a78bfa] hover:bg-[#a78bfa]/10 disabled:opacity-50"
          >
            Create
          </button>
        </form>

        {playlists.length === 0 ? (
          <p className="text-sm text-zinc-500 leading-relaxed mb-4">
            No playlists yet. Create one above. Add tracks via the
            <strong className="text-[#a78bfa]"> + Playlist</strong> button on any library row.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {playlists.map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/40 flex items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 font-medium truncate">
                    {p.name}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                    {p.trackCount} track{p.trackCount !== 1 ? "s" : ""}
                  </div>
                </div>
                <button
                  onClick={() => onPlay(p.id)}
                  disabled={p.trackCount === 0}
                  className="px-2.5 py-1 text-[11px] uppercase tracking-wider rounded bg-[#a78bfa] text-zinc-950 font-medium hover:bg-[#a78bfa]/85 disabled:opacity-30"
                >
                  ▶
                </button>
                <button
                  onClick={() => onDelete(p.id)}
                  className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 border border-zinc-800 rounded hover:border-rose-500/40 hover:text-rose-400"
                >
                  ✕
                </button>
              </div>
            ))}
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

export function PickPlaylistModal({
  playlists,
  track,
  onClose,
  onPick,
  onCreate,
}: {
  playlists: Playlist[];
  track: { name: string };
  onClose: () => void;
  onPick: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<string | null>;
}) {
  const [newName, setNewName] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16161a] border border-zinc-800 rounded-xl p-5 max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-medium text-[#a78bfa] uppercase tracking-wider mb-1">
          Add to playlist
        </h2>
        <p className="text-xs text-zinc-500 mb-4 truncate">{track.name}</p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            const id = await onCreate(newName.trim());
            if (id) await onPick(id);
          }}
          className="flex gap-2 mb-4"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Create new…"
            className="flex-1 bg-black/40 border border-zinc-800 rounded px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-[#a78bfa]/40"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="px-3 py-1.5 text-[11px] uppercase tracking-wider rounded border border-[#a78bfa]/40 text-[#a78bfa] hover:bg-[#a78bfa]/10 disabled:opacity-50"
          >
            Create + Add
          </button>
        </form>

        {playlists.length > 0 && (
          <div className="space-y-1 mb-4">
            {playlists.map((p) => (
              <button
                key={p.id}
                onClick={() => onPick(p.id)}
                className="w-full text-left p-3 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:border-[#a78bfa]/40"
              >
                <div className="text-sm text-zinc-200 truncate">{p.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                  {p.trackCount} track{p.trackCount !== 1 ? "s" : ""}
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full h-10 rounded-lg bg-zinc-800 text-zinc-200 text-sm uppercase tracking-wider hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
