import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DBMix } from "@/lib/supabase/types";
import { MixPlayer } from "./MixPlayer";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ token: string }>;
}

export default async function MixPage({ params }: Params) {
  const { token } = await params;
  const sb = await getSupabaseServerClient();

  const { data: mix, error } = await sb
    .from("mixes")
    .select("*")
    .eq("share_token", token)
    .eq("is_public", true)
    .maybeSingle();

  if (error || !mix) {
    notFound();
  }

  const m = mix as DBMix;
  const { data: pub } = sb.storage.from("mixes").getPublicUrl(m.storage_path);

  // Best-effort: increment play count.
  void sb.rpc("increment_mix_plays", { token });

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans">
      <div className="mx-auto max-w-md md:max-w-lg px-6 py-12">
        <a
          href="/"
          className="text-xs uppercase tracking-wider text-zinc-500 hover:text-[#00ffcc]"
        >
          ← brainmix
        </a>
        <h1 className="text-2xl md:text-3xl font-light tracking-tight mt-6 mb-2 text-zinc-100">
          {m.name}
        </h1>
        <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-mono mb-6">
          {formatDuration(m.duration_ms)} · {formatBytes(m.size)} ·{" "}
          {(m.plays ?? 0) + 1} play{m.plays === 0 ? "" : "s"}
        </p>

        <MixPlayer src={pub.publicUrl} durationMs={m.duration_ms} />

        <div className="mt-10 p-4 rounded-xl border border-zinc-800 bg-zinc-950/40">
          <p className="text-xs text-zinc-400 leading-relaxed">
            This is a mix recorded in <span className="text-[#00ffcc]">brainmix</span>{" "}
            - a layered brainwave + DJ studio in your browser.
          </p>
          <a
            href="/"
            className="block mt-3 text-center py-2 rounded-lg border border-[#00ffcc]/40 text-[#00ffcc] text-xs uppercase tracking-wider hover:bg-[#00ffcc]/10"
          >
            Make your own
          </a>
        </div>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
