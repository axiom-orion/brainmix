"use client";

import { useEffect, useRef, useState } from "react";

export function MixPlayer({ src, durationMs }: { src: string; durationMs: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch((e) => setError(e.message));
    }
  };

  const seek = (t: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      setPosition(t);
    }
  };

  const total = durationMs / 1000;

  return (
    <div className="p-5 rounded-xl border border-[#00ffcc]/30 bg-[#00ffcc]/[0.02]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError("Couldn't load the mix file.")}
      />
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={toggle}
          className="w-12 h-12 rounded-full bg-[#00ffcc] text-zinc-950 text-xl font-medium flex items-center justify-center hover:bg-[#00ffcc]/85"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(1, total)}
            step={0.1}
            value={Math.min(position, total)}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[11px] text-zinc-500 font-mono mt-1">
            <span>{formatTime(position)}</span>
            <span>{formatTime(total)}</span>
          </div>
        </div>
      </div>
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <label className="text-[11px] uppercase tracking-wider text-zinc-500">
            Volume
          </label>
          <span className="text-[11px] text-zinc-500 font-mono">
            {Math.round(volume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>
      {error && (
        <p className="mt-3 text-xs text-rose-400">{error}</p>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
