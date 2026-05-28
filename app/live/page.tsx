"use client";

/**
 * /live — discover active broadcast rooms.
 *
 * Realtime list of live_rooms where is_active=true. Hosts come and go;
 * the list updates within ~1s of each row change via Supabase Realtime.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

interface LiveRoomRow {
  token: string;
  name: string;
  is_active: boolean;
  listener_count: number;
  last_active_at: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function LiveIndexPage() {
  const [rooms, setRooms] = useState<LiveRoomRow[]>([]);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    const sb = getSupabaseClient();
    const fetchRooms = () => {
      sb.from("live_rooms")
        .select("token, name, is_active, listener_count, last_active_at")
        .order("last_active_at", { ascending: false })
        .limit(50)
        .then((r: { data: LiveRoomRow[] | null }) => {
          if (r.data) setRooms(r.data);
        });
    };
    fetchRooms();
    // Realtime: refresh on any row change.
    const channel = sb
      .channel("live-rooms-index")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_rooms" },
        () => fetchRooms(),
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, []);

  const visible = showInactive ? rooms : rooms.filter((r) => r.is_active);

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
          Live rooms
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed mb-8">
          Rooms hosted on brainmix right now. Tap a row to tune in. Mesh
          WebRTC — up to ~5 listeners per room.
        </p>

        <div className="flex justify-between items-center mb-4">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            {visible.length} room{visible.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
          >
            {showInactive ? "Hide offline" : "Show offline"}
          </button>
        </div>

        {visible.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-zinc-800 text-center">
            <p className="text-sm text-zinc-400 mb-3">
              No active rooms right now.
            </p>
            <Link
              href="/live/host"
              className="inline-block px-4 py-2 rounded-lg border border-[#00ffcc]/40 text-[#00ffcc] text-xs uppercase tracking-wider hover:bg-[#00ffcc]/10"
            >
              Start one
            </Link>
          </div>
        ) : (
          <div className="space-y-2 mb-8">
            {visible.map((r) => (
              <Link
                key={r.token}
                href={`/live/${r.token}`}
                className="block p-3 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:border-[#00ffcc]/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={
                      r.is_active
                        ? "w-2 h-2 rounded-full bg-[#00ffcc]"
                        : "w-2 h-2 rounded-full bg-zinc-700"
                    }
                    style={
                      r.is_active
                        ? { animation: "live-pulse 1.5s ease-in-out infinite" }
                        : undefined
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-100 truncate">{r.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
                      {r.is_active
                        ? `${r.listener_count} listening`
                        : `Last live ${relativeTime(r.last_active_at)}`}
                      {" · "}
                      <span className="text-zinc-600">{r.token}</span>
                    </div>
                  </div>
                  <span className="text-zinc-600">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="pt-6 border-t border-zinc-900 flex gap-2">
          <Link
            href="/live/host"
            className="flex-1 text-center py-2.5 rounded-lg bg-[#00ffcc] text-zinc-950 text-xs uppercase tracking-wider font-medium hover:bg-[#00ffcc]/85"
          >
            ● Start broadcast
          </Link>
          <Link
            href="/console"
            className="flex-1 text-center py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-xs uppercase tracking-wider hover:bg-zinc-900"
          >
            Console
          </Link>
        </div>

        <style>{`@keyframes live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      </div>
    </div>
  );
}
