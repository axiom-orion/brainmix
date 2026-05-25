/**
 * EngineerCard — collapsible panel surfacing rule-based tips, an Ask-the-LLM
 * button, and the deep-dive library. Stateless: parent owns tips + LLM state.
 */

"use client";

import { DEEP_DIVES, type EngineerTip, type DeepDive } from "@/lib/engineer";

export function EngineerCard({
  tips,
  engineerOpen,
  onToggleOpen,
  onApply,
  onDismiss,
  onOpenDeepDive,
  llmAsking,
  llmResponse,
  llmError,
  onAskLLM,
  onClearLLM,
}: {
  tips: EngineerTip[];
  engineerOpen: boolean;
  onToggleOpen: () => void;
  onApply: (t: EngineerTip) => void;
  onDismiss: (id: string) => void;
  onOpenDeepDive: (d: DeepDive) => void;
  llmAsking: boolean;
  llmResponse: string;
  llmError: string | null;
  onAskLLM: () => void;
  onClearLLM: () => void;
}) {
  const topTip = tips[0];
  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900/60 to-zinc-950 overflow-hidden">
      <button
        onClick={onToggleOpen}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-900/40"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            The Engineer
          </span>
          {tips.length > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                topTip.tone === "fix"
                  ? "bg-amber-500/15 text-amber-300"
                  : topTip.tone === "enhance"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {tips.length} {tips.length === 1 ? "note" : "notes"}
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-500">{engineerOpen ? "−" : "+"}</span>
      </button>

      {!engineerOpen && topTip && (
        <div className="px-4 pb-4 text-xs text-zinc-400 leading-relaxed">
          <span className="text-zinc-200 font-medium">{topTip.title}.</span>{" "}
          {topTip.body.split(".")[0]}.
        </div>
      )}

      {engineerOpen && (
        <div className="p-4 pt-0 space-y-3">
          {tips.length === 0 && (
            <p className="text-xs text-zinc-500 leading-relaxed">
              Mix is balanced. Stay with it. Or explore the engineer&apos;s library below.
            </p>
          )}
          {tips.map((t) => (
            <div
              key={t.id}
              className={`p-3 rounded-lg border ${
                t.tone === "fix"
                  ? "border-amber-500/30 bg-amber-500/[0.03]"
                  : t.tone === "enhance"
                    ? "border-sky-500/30 bg-sky-500/[0.03]"
                    : "border-emerald-500/30 bg-emerald-500/[0.03]"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium text-zinc-200">{t.title}</div>
                <span
                  className={`text-[9px] uppercase tracking-widest ${
                    t.tone === "fix"
                      ? "text-amber-400"
                      : t.tone === "enhance"
                        ? "text-sky-400"
                        : "text-emerald-400"
                  }`}
                >
                  {t.tone}
                </span>
              </div>
              <div className="text-xs text-zinc-400 leading-relaxed mb-2">
                {t.body}
              </div>
              <div className="flex gap-2">
                {t.apply && (
                  <button
                    onClick={() => {
                      onApply(t);
                      onDismiss(t.id);
                    }}
                    className="text-[11px] uppercase tracking-wider px-3 py-1.5 rounded border border-[#00ffcc]/40 text-[#00ffcc] hover:bg-[#00ffcc]/10"
                  >
                    Try this fix
                  </button>
                )}
                <button
                  onClick={() => onDismiss(t.id)}
                  className="text-[11px] uppercase tracking-wider px-3 py-1.5 rounded border border-zinc-800 text-zinc-500 hover:text-zinc-300"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}

          {/* Ask the (LLM-backed) engineer */}
          <div className="pt-2 border-t border-zinc-900">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                Ask the engineer
              </div>
              {(llmResponse || llmError) && (
                <button
                  onClick={onClearLLM}
                  className="text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400"
                >
                  Clear
                </button>
              )}
            </div>
            {!llmResponse && !llmError && (
              <button
                onClick={onAskLLM}
                disabled={llmAsking}
                className="w-full py-2 text-[11px] uppercase tracking-wider rounded border border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/10 disabled:opacity-50"
              >
                {llmAsking ? "Thinking…" : "Get a 30-yr engineer's take on this mix"}
              </button>
            )}
            {llmResponse && (
              <div className="p-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/[0.04] text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                {llmResponse}
                {llmAsking && <span className="ml-1 text-fuchsia-400 animate-pulse">▍</span>}
              </div>
            )}
            {llmError && (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] text-xs text-amber-200 leading-relaxed">
                {llmError}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-zinc-900">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
              Library · global studio
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {DEEP_DIVES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onOpenDeepDive(d)}
                  className="text-left p-2 rounded border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40"
                >
                  <div className="text-[11px] text-zinc-300">{d.title}</div>
                  <div className="text-[9px] uppercase tracking-wider text-zinc-600 mt-0.5">
                    {d.origin}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
