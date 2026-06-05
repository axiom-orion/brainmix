"use client";

/**
 * /live/[token] — join a live broadcast as a listener.
 *
 * Subscribes to the broadcast channel, gets a peer-connection offer from
 * the host, sends back an answer, plays the incoming MediaStream through
 * an audio element. Volume slider for local listener level.
 *
 * If the host hasn't started yet or the token is wrong, the listener page
 * just waits — no error UI, since the host could start at any moment.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { joinListener, type ListenerHandle } from "@/lib/liveRoom";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getFlag } from "@/lib/flags";
import { LiveChat } from "@/app/components/LiveChat";

interface Props {
  params: Promise<{ token: string }>;
}

export default function LiveListenerPage({ params }: Props) {
  const { token } = use(params);
  const [state, setState] = useState<ListenerHandle | null>(null);
  const [volume, setVolume] = useState(0.85);
  const [roomMeta, setRoomMeta] = useState<{ name: string; isActive: boolean } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  // Look up the room row (if any) so we can show is_active state.
  useEffect(() => {
    const sb = getSupabaseClient();
    sb.from("live_rooms")
      .select("name, is_active")
      .eq("token", token)
      .maybeSingle()
      .then((r: { data: { name: string; is_active: boolean } | null }) => {
        if (r.data) {
          setRoomMeta({ name: r.data.name, isActive: r.data.is_active });
        }
      });
    // Realtime: refresh when the row changes (host starts/stops).
    if (!getFlag("realtime_sync")) return;
    const channel = sb
      .channel(`live-room-meta-${token}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_rooms", filter: `token=eq.${token}` },
        (payload: { new: { name: string; is_active: boolean } }) => {
          setRoomMeta({ name: payload.new.name, isActive: payload.new.is_active });
        },
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [token]);

  useEffect(() => {
    const handle = joinListener(token, (s) => setState(s));
    stopRef.current = handle.stop;
    return () => {
      stopRef.current?.().catch(() => {});
    };
  }, [token]);

  // Attach the incoming stream when ontrack fires.
  useEffect(() => {
    if (state?.audio && audioRef.current) {
      audioRef.current.srcObject = state.audio;
      audioRef.current.play().catch(() => {
        // Autoplay gate — listener has to tap "Play" to unlock.
      });
    }
  }, [state?.audio]);

  // Apply volume.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const onTapPlay = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const connState = state?.connectionState ?? "joining";
  const connColor =
    connState === "connected"
      ? "var(--mint)"
      : connState === "joining" || connState === "connecting"
        ? "var(--violet)"
        : "var(--fg-4)";

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
          {roomMeta?.name ?? "Listening room"}
        </h1>
        <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-mono mb-2">
          Token · {token}
        </p>
        {roomMeta && !roomMeta.isActive && (
          <p className="text-xs text-amber-400 mb-8">
            Host is offline. The room will reactivate when they start
            broadcasting again.
          </p>
        )}
        {!roomMeta && (
          <p className="text-xs text-zinc-600 mb-8">
            Unregistered room — anyone hosting this token will reach you.
          </p>
        )}

        {/* Status pill */}
        <div
          className="mb-6 p-3 rounded-xl border flex items-center gap-3"
          style={{
            borderColor:
              connState === "connected"
                ? "var(--mint-40)"
                : "var(--hairline)",
            background:
              connState === "connected"
                ? "var(--mint-05)"
                : "var(--surface-mute)",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: connColor,
              animation:
                connState === "joining" || connState === "connecting"
                  ? "pulse 1.2s ease-in-out infinite"
                  : undefined,
            }}
          />
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              Connection
            </div>
            <div className="text-sm text-zinc-100 capitalize">{connState}</div>
          </div>
        </div>

        {/* Audio element */}
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          className="hidden"
        />

        {/* Tap-to-play (for autoplay-blocked browsers) */}
        {state?.audio && (
          <button
            onClick={onTapPlay}
            className="w-full h-12 rounded-xl bg-[#00ffcc] text-zinc-950 text-sm uppercase tracking-wider font-medium mb-4"
          >
            ▶ Play
          </button>
        )}

        {/* Volume */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Volume
            </span>
            <span className="text-[11px] text-zinc-400 font-mono">
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

        <div className="mt-10 p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 text-xs text-zinc-500 leading-relaxed">
          <p className="mb-2">
            <strong className="text-zinc-300">How this works.</strong> You&apos;re
            connected via WebRTC directly to the host&apos;s browser. No server
            relays the audio — it&apos;s peer-to-peer with public STUN.
          </p>
          <p>
            If you stay on &quot;joining&quot; or &quot;connecting&quot; for
            more than 10 seconds, the host hasn&apos;t started broadcasting yet
            or there&apos;s a NAT/firewall blocking the peer connection.
          </p>
        </div>

        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      </div>
      <LiveChat token={token} />
    </div>
  );
}
