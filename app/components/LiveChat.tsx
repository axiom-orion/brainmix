"use client";

/**
 * LiveChat — collapsible chat panel for /live/host and /live/[token].
 *
 * Uses a Supabase Realtime broadcast channel (`chat-${token}`) — messages
 * aren't persisted, they vanish when the session ends. Each message carries
 * a sender id, display name, body, and timestamp.
 *
 * Anonymous senders pick a random adjective+animal handle on first send.
 * Signed-in senders use their email's local-part.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getFlag } from "@/lib/flags";

interface ChatMessage {
  id: string;
  sender: string;
  body: string;
  ts: number;
}

const ANON_ADJECTIVES = ["mint", "violet", "rose", "amber", "ice", "ash", "ember"];
const ANON_ANIMALS = ["lynx", "raven", "otter", "moth", "fox", "newt", "wren"];

function makeAnonHandle(): string {
  const a = ANON_ADJECTIVES[Math.floor(Math.random() * ANON_ADJECTIVES.length)];
  const b = ANON_ANIMALS[Math.floor(Math.random() * ANON_ANIMALS.length)];
  return `${a}-${b}`;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 5_000) return "now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  return `${Math.floor(diff / 3_600_000)}h`;
}

export function LiveChat({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sender, setSender] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null>(null);

  // Resolve sender once.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data } = await sb.auth.getUser();
        const email = data?.user?.email;
        if (mounted) {
          setSender(email ? email.split("@")[0] : makeAnonHandle());
        }
      } catch {
        if (mounted) setSender(makeAnonHandle());
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Subscribe to chat channel for this token.
  useEffect(() => {
    if (!getFlag("realtime_sync")) return;
    const sb = getSupabaseClient();
    const channel = sb.channel(`chat-${token}`, {
      config: { broadcast: { self: true } },
    });
    channel.on(
      "broadcast",
      { event: "msg" },
      ({ payload }: { payload: ChatMessage }) => {
        setMessages((cur) => {
          // Cap at 100 messages so memory doesn't grow forever.
          const next = [...cur, payload];
          return next.length > 100 ? next.slice(-100) : next;
        });
      },
    );
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [token]);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    if (scrollRef.current && open) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const body = input.trim();
      if (!body || !sender || !channelRef.current) return;
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        sender,
        body: body.slice(0, 200),
        ts: Date.now(),
      };
      channelRef.current.send({ type: "broadcast", event: "msg", payload: msg });
      setInput("");
    },
    [input, sender],
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 px-4 py-2 rounded-full bg-zinc-900/95 backdrop-blur border border-zinc-700 text-zinc-200 text-xs uppercase tracking-wider hover:bg-zinc-800"
        aria-label="Open chat"
      >
        💬 Chat {messages.length > 0 && `(${messages.length})`}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-30 flex flex-col"
      style={{
        width: 320,
        maxHeight: "70vh",
        background: "var(--surface-1)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-widget)",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: "var(--hairline)" }}
      >
        <span className="text-[10px] uppercase tracking-widest text-zinc-400">
          Chat · {sender || "…"}
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:text-zinc-200"
          aria-label="Close chat"
        >
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[160px]">
        {messages.length === 0 ? (
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            No messages yet. Say hi while the host spins.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender === sender;
            return (
              <div key={m.id} className="text-[12px]">
                <div className="flex items-baseline gap-2 text-[10px] text-zinc-500 mb-0.5">
                  <span style={{ color: mine ? "var(--mint)" : "var(--violet)" }}>
                    {m.sender}
                  </span>
                  <span className="font-mono">{relativeTime(m.ts)}</span>
                </div>
                <div className="text-zinc-200 break-words">{m.body}</div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={send}
        className="flex gap-2 p-2 border-t"
        style={{ borderColor: "var(--hairline)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something…"
          maxLength={200}
          className="flex-1 bg-black/40 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-[#00ffcc]/40"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-3 py-1 text-[11px] uppercase tracking-wider rounded border border-[#00ffcc]/40 text-[#00ffcc] hover:bg-[#00ffcc]/10 disabled:opacity-30"
        >
          Send
        </button>
      </form>
    </div>
  );
}
