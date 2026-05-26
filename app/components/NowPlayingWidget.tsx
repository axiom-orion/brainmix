/**
 * Music player widget. Two surfaces:
 *   - StickyNowPlaying: chrome wrapper for the fixed-bottom mini-player.
 *   - NowPlayingWidget: the full controls (cover + scrub + transport + volume).
 *
 * Pure presentational — no audio API logic. The parent owns the audio element
 * and feeds in position / duration / play-state.
 */

"use client";

import { useEffect, useState } from "react";
import { signCoverUrl } from "@/lib/cloudLibrary";
import { formatTime } from "./utils";

export interface NowPlayingEntry {
  name: string;
  artist: string | null;
  album: string | null;
  coverPath: string | null;
}

interface NowPlayingProps {
  entry: NowPlayingEntry;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  queueIndex: number;
  queueLength: number;
  shuffle: boolean;
  repeatMode: "off" | "one" | "all";
  crossfade: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
  onShuffle: () => void;
  onRepeat: () => void;
  onCrossfade: () => void;
  onClose: () => void;
}

export function StickyNowPlaying(props: NowPlayingProps) {
  return (
    <div
      className="backdrop-blur-md rounded-xl border shadow-lg"
      style={{
        backgroundColor: "rgba(22, 22, 26, 0.95)",
        borderColor: "var(--mint-40)",
        boxShadow: "var(--shadow-widget)",
      }}
    >
      <NowPlayingWidget {...props} />
    </div>
  );
}

export function NowPlayingWidget({
  entry,
  playing,
  position,
  duration,
  volume,
  queueIndex,
  queueLength,
  shuffle,
  repeatMode,
  crossfade,
  onToggle,
  onPrev,
  onNext,
  onSeek,
  onVolume,
  onShuffle,
  onRepeat,
  onCrossfade,
  onClose,
}: NowPlayingProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (entry.coverPath) {
      signCoverUrl(entry.coverPath).then((url) => {
        if (!cancelled) setCoverUrl(url);
      });
    } else {
      setCoverUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [entry.coverPath]);

  return (
    <div className="p-3 md:p-4">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          Now playing · {queueIndex + 1} of {queueLength}
        </span>
        <button
          onClick={onClose}
          className="text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400"
          aria-label="Stop player"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-3 mb-3">
        {coverUrl ? (
          <div className="w-14 h-14 rounded shrink-0 overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          // Spinning vinyl fallback. Pauses when not playing.
          <div
            className={`w-14 h-14 shrink-0 jog ${playing ? "" : "paused"}`}
            style={{ ["--jog-dur" as string]: "8s" } as React.CSSProperties}
            aria-hidden="true"
          >
            <span
              className="jog-hub text-[14px]"
              style={{ width: 22, height: 22 }}
            >
              ♪
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-zinc-100 font-medium truncate">{entry.name}</div>
          {(entry.artist || entry.album) && (
            <div className="text-[11px] text-zinc-400 truncate">
              {entry.artist}
              {entry.artist && entry.album && " · "}
              {entry.album}
            </div>
          )}
        </div>
      </div>

      <div className="mb-2">
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={0.5}
          value={Math.min(position, duration)}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-[11px] text-zinc-500 font-mono mt-1">
          <span>{formatTime(position)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onShuffle}
          className={`w-9 h-9 rounded-full text-sm border ${
            shuffle
              ? "border-[#00ffcc]/60 text-[#00ffcc] bg-[#00ffcc]/10"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}
          aria-label="Shuffle"
          title="Shuffle"
        >
          ⇄
        </button>
        <button
          onClick={onPrev}
          disabled={!shuffle && queueIndex <= 0}
          className="w-10 h-10 rounded-full border border-zinc-800 text-zinc-300 text-base hover:bg-zinc-900 disabled:opacity-30"
          aria-label="Previous"
        >
          ⏮
        </button>
        <button
          onClick={onToggle}
          className="w-12 h-12 rounded-full bg-[#00ffcc] text-zinc-950 text-lg font-medium hover:bg-[#00ffcc]/85"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          onClick={onNext}
          disabled={!shuffle && repeatMode === "off" && queueIndex >= queueLength - 1}
          className="w-10 h-10 rounded-full border border-zinc-800 text-zinc-300 text-base hover:bg-zinc-900 disabled:opacity-30"
          aria-label="Next"
        >
          ⏭
        </button>
        <button
          onClick={onRepeat}
          className={`w-9 h-9 rounded-full text-sm border ${
            repeatMode !== "off"
              ? "border-[#00ffcc]/60 text-[#00ffcc] bg-[#00ffcc]/10"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}
          aria-label="Repeat"
          title={`Repeat ${repeatMode}`}
        >
          {repeatMode === "one" ? "↻¹" : "↻"}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onCrossfade}
          className={`shrink-0 px-2 h-7 text-[10px] uppercase tracking-wider rounded border ${
            crossfade
              ? "border-[#a78bfa]/60 text-[#a78bfa] bg-[#a78bfa]/10"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}
          aria-label="Auto-crossfade"
          title={crossfade ? "Auto-crossfade ON (6s)" : "Auto-crossfade OFF"}
        >
          ⤲ x-fade
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolume(parseFloat(e.target.value))}
          className="flex-1"
        />
      </div>
    </div>
  );
}
