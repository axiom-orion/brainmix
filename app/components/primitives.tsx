/**
 * Shared presentational primitives used across the page.
 *
 * These are stateless, accept no domain types beyond what's in their props,
 * and are safe to import from anywhere. Kept in one file so the boundary is
 * easy to grok at a glance.
 */

"use client";

import { formatTime } from "./utils";

export function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 text-[11px] font-bold leading-none"
      aria-label="What is this?"
    >
      ?
    </button>
  );
}

export function EvidenceBadge({
  level,
}: {
  level: "strong" | "mixed" | "vibes";
}) {
  const styles =
    level === "strong"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
      : level === "mixed"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
        : "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/40";
  const label = level === "strong" ? "evidence" : level === "mixed" ? "mixed" : "vibes";
  return (
    <span
      className={`ml-auto text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${styles}`}
    >
      {label}
    </span>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  info,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  info?: () => void;
  onChange: (v: number) => void;
}) {
  return (
    <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          {label}
          {info && <InfoButton onClick={info} />}
        </label>
        <span className="text-xs text-[#00ffcc] font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function Toggle({
  label,
  checked,
  info,
  onChange,
}: {
  label: string;
  checked: boolean;
  info?: () => void;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`p-3 rounded-lg border text-left transition-colors ${
        checked
          ? "border-[#00ffcc]/40 bg-[#00ffcc]/5"
          : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
      }`}
    >
      <div className="flex justify-between items-center">
        <span
          className={`text-sm flex items-center gap-2 ${
            checked ? "text-[#00ffcc]" : "text-zinc-400"
          }`}
        >
          {label}
          {info && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                info();
              }}
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-bold"
            >
              ?
            </span>
          )}
        </span>
        <span
          className={`text-[10px] uppercase tracking-wider ${
            checked ? "text-[#00ffcc]" : "text-zinc-600"
          }`}
        >
          {checked ? "On" : "Off"}
        </span>
      </div>
    </button>
  );
}

export function SelectBox({
  label,
  value,
  options,
  info,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  info?: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-lg">
      <label className="text-xs uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-2">
        {label}
        {info && <InfoButton onClick={info} />}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-[#00ffcc]/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SessionDisplay({
  phase,
  cycle,
  total,
  remaining,
  progress,
}: {
  phase: "focus" | "rest" | "done";
  cycle: number;
  total: number;
  remaining: number;
  progress: number;
}) {
  if (phase === "done") {
    return (
      <div className="p-5 rounded-xl border border-[#00ffcc]/40 bg-[#00ffcc]/5 text-center">
        <div className="text-lg text-[#00ffcc]">Session complete</div>
        <div className="text-xs text-zinc-500 mt-1">
          {total} cycle{total > 1 ? "s" : ""} done. Hydrate, walk, sunlight.
        </div>
      </div>
    );
  }
  const phaseColor = phase === "focus" ? "#00ffcc" : "#a78bfa";
  return (
    <div
      className="p-5 rounded-xl border bg-zinc-900/40"
      style={{ borderColor: `${phaseColor}66` }}
    >
      <div className="flex justify-between items-baseline mb-2">
        <span
          className="text-xs uppercase tracking-widest font-medium"
          style={{ color: phaseColor }}
        >
          {phase === "focus" ? "Focus" : "Rest"}
        </span>
        <span className="text-[11px] text-zinc-500 font-mono">
          Cycle {cycle} / {total}
        </span>
      </div>
      <div className="text-4xl font-mono text-zinc-200 tabular-nums mb-3">
        {formatTime(remaining)}
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: phaseColor,
          }}
        />
      </div>
    </div>
  );
}
