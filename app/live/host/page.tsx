"use client";

/**
 * /live/host — broadcast your current djBus master to listeners via WebRTC.
 *
 * Click Start → opens a session, generates an 8-char token, shows the
 * share URL. As listeners join the channel, peer connections come up
 * and counter ticks. Click Stop → tears down all peers + channel.
 *
 * Source: djBus.recordTap.stream — already a live capture of everything
 * the user hears (matrix + decks). The same stream the recorder uses.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { djBus } from "@/lib/djBus";
import { startHost, type HostHandle } from "@/lib/liveRoom";

export default function LiveHostPage() {
  const [handle, setHandle] = useState<HostHandle | null>(null);
  const [listeners, setListeners] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<HostHandle | null>(null);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      handleRef.current?.stop().catch(() => {});
    };
  }, []);

  const onStart = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      // Ensure the bus exists and is producing audio.
      djBus.ensureContext();
      djBus.resume();
      const tap = djBus.recordTap;
      if (!tap) {
        setError("Audio bus not ready — play something first on /console.");
        return;
      }
      const h = await startHost(tap.stream);
      handleRef.current = h;
      h.onListenersChange(setListeners);
      setHandle(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start broadcast");
    } finally {
      setStarting(false);
    }
  }, []);

  const onStop = useCallback(async () => {
    if (!handleRef.current) return;
    await handleRef.current.stop();
    handleRef.current = null;
    setHandle(null);
    setListeners(0);
  }, []);

  const shareUrl = handle
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/live/${handle.token}`
    : "";

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans">
      <div className="mx-auto max-w-md md:max-w-lg px-6 py-12">
        <Link
          href="/console"
          className="text-xs uppercase tracking-wider text-zinc-500 hover:text-[#00ffcc]"
        >
          ← console
        </Link>

        <h1 className="text-2xl md:text-3xl font-light tracking-tight mt-6 mb-2">
          Live broadcast
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed mb-8">
          Broadcast your current master output — matrix + decks + everything —
          to friends over WebRTC. They hit the share URL and tune in. Up to ~5
          listeners over a typical home connection.
        </p>

        {!handle ? (
          <button
            onClick={onStart}
            disabled={starting}
            className="w-full h-12 rounded-xl bg-[#00ffcc] text-zinc-950 text-sm uppercase tracking-wider font-medium hover:bg-[#00ffcc]/85 disabled:opacity-50"
          >
            {starting ? "Starting…" : "● Start broadcast"}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-[#00ffcc]/40 bg-[#00ffcc]/[0.04]">
              <div className="text-[10px] uppercase tracking-widest text-[#00ffcc] mb-1">
                Live · share this URL
              </div>
              <div className="text-sm text-zinc-100 font-mono break-all mb-3">
                {shareUrl}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => {})}
                  className="flex-1 h-9 rounded-lg border border-zinc-700 text-zinc-300 text-xs uppercase tracking-wider hover:bg-zinc-900"
                >
                  Copy URL
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 h-9 rounded-lg border border-zinc-700 text-zinc-300 text-xs uppercase tracking-wider hover:bg-zinc-900 flex items-center justify-center"
                >
                  Open
                </a>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Listeners
                </div>
                <div className="text-3xl font-light tabular-nums mt-0.5">
                  {listeners}
                </div>
              </div>
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
            </div>

            <button
              onClick={onStop}
              className="w-full h-10 rounded-lg border border-rose-500/40 text-rose-400 text-xs uppercase tracking-wider hover:bg-rose-500/10"
            >
              ■ Stop broadcast
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 text-xs text-rose-400 leading-relaxed">{error}</p>
        )}

        <div className="mt-12 p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 text-xs text-zinc-500 leading-relaxed">
          <p className="mb-2">
            <strong className="text-zinc-300">How it works.</strong> Mesh
            WebRTC — one peer connection per listener. STUN-only (no TURN),
            so users behind symmetric NAT may not connect. Audio source is{" "}
            <code className="text-[#00ffcc]">djBus.recordTap</code> — the same
            stream the recorder uses.
          </p>
          <p>
            Open <Link href="/console" className="text-[#00ffcc]">/console</Link>{" "}
            in another tab to load tracks, play them, and switch presets while
            broadcasting. Listeners hear everything you hear.
          </p>
        </div>
      </div>
    </div>
  );
}
