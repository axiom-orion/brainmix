"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export function SignInModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      const redirect = `${window.location.origin}/auth/callback`;
      const { error: err } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect, shouldCreateUser: true },
      });
      if (err) {
        setError(err.message);
      } else {
        setSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send link");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16161a] border border-zinc-800 rounded-xl p-5 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-medium text-[#00ffcc] uppercase tracking-wider mb-2">
          Sign in
        </h2>
        <p className="text-xs text-zinc-500 leading-relaxed mb-4">
          We'll email you a one-tap magic link. No password. Signing in unlocks
          your cloud library and mix sharing.
        </p>

        {sent ? (
          <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
            <p className="text-sm text-emerald-300">Check your email.</p>
            <p className="text-xs text-zinc-400 mt-1">
              The link will sign you in and bring you back here.
            </p>
            <button
              onClick={onClose}
              className="w-full mt-3 h-9 rounded-lg bg-zinc-800 text-zinc-200 text-sm uppercase tracking-wider hover:bg-zinc-700"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-black/40 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-[#00ffcc]/40"
              autoFocus
            />
            {error && (
              <p className="text-xs text-rose-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={sending || !email}
              className="w-full h-10 rounded-lg bg-[#00ffcc] text-zinc-950 text-sm uppercase tracking-wider font-medium hover:bg-[#00ffcc]/85 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send magic link"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-9 rounded-lg bg-zinc-800 text-zinc-400 text-sm uppercase tracking-wider hover:bg-zinc-700"
            >
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
