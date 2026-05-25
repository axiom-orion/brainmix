/**
 * AcademyModal — surfaces the "what is this?" explanation for any control,
 * with an evidence badge. DeepDiveModal is the longer-form companion shown
 * from the Engineer card's "Library · global studio" buttons.
 */

"use client";

import type { AcademyEntry } from "@/lib/academy";
import type { DeepDive } from "@/lib/engineer";
import { EvidenceBadge } from "./primitives";

export function DeepDiveModal({
  dive,
  onClose,
}: {
  dive: DeepDive;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16161a] border border-zinc-800 rounded-xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-medium text-[#00ffcc] uppercase tracking-wider mb-1">
          {dive.title}
        </h2>
        <div className="text-[11px] uppercase tracking-widest text-zinc-500 mb-3">
          {dive.origin}
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line mb-4">
          {dive.body}
        </p>
        <button
          onClick={onClose}
          className="w-full h-10 rounded-lg bg-zinc-800 text-zinc-200 text-sm uppercase tracking-wider hover:bg-zinc-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function AcademyModal({
  entry,
  onClose,
}: {
  entry: AcademyEntry;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16161a] border border-zinc-800 rounded-xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3">
          <h2 className="text-base font-medium text-[#00ffcc] uppercase tracking-wider">
            {entry.title}
          </h2>
          <EvidenceBadge level={entry.evidence} />
        </div>
        <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line mb-4">
          {entry.body}
        </div>
        <button
          onClick={onClose}
          className="w-full h-10 rounded-lg bg-zinc-800 text-zinc-200 text-sm uppercase tracking-wider hover:bg-zinc-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
