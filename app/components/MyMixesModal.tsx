/**
 * MyMixesModal — list of cloud-saved mixes with share URL, open, download, delete.
 */

"use client";

import { useState } from "react";
import { publicMixUrl, shareUrl as buildShareUrl } from "@/lib/cloudLibrary";
import type { CloudMix } from "@/lib/cloudLibrary";
import { formatSize, formatDurationMs } from "./utils";

export function MyMixesModal({
  mixes,
  onClose,
  onDelete,
}: {
  mixes: CloudMix[];
  onClose: () => void;
  onDelete: (m: CloudMix) => void;
}) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const copy = async (token: string) => {
    const url = buildShareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16161a] border border-zinc-800 rounded-xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-medium text-[#00ffcc] uppercase tracking-wider">
            My Mixes
          </h2>
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            {mixes.length}
          </span>
        </div>
        {mixes.length === 0 ? (
          <p className="text-sm text-zinc-500 leading-relaxed mb-4">
            No mixes saved yet. Record one in the DJ studio and tap &quot;Save to cloud&quot;.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {mixes.map((m) => (
              <div key={m.id} className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
                <div className="flex justify-between items-start gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 font-medium truncate">
                      {m.name}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5 font-mono">
                      {formatDurationMs(m.durationMs)} · {formatSize(m.size)} · {m.plays} play{m.plays === 1 ? "" : "s"}
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(m)}
                    className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 border border-zinc-800 rounded hover:border-rose-500/40 hover:text-rose-400 shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/m/${m.shareToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-1.5 text-[11px] uppercase tracking-wider rounded border border-[#00ffcc]/40 text-[#00ffcc] hover:bg-[#00ffcc]/10 text-center"
                  >
                    Open
                  </a>
                  <button
                    onClick={() => copy(m.shareToken)}
                    className="flex-1 py-1.5 text-[11px] uppercase tracking-wider rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                  >
                    {copiedToken === m.shareToken ? "Copied!" : "Copy URL"}
                  </button>
                  <a
                    href={publicMixUrl(m.storagePath)}
                    download={`${m.name}.${m.mimeType?.includes("mp4") ? "m4a" : "webm"}`}
                    className="flex-1 py-1.5 text-[11px] uppercase tracking-wider rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-900 text-center"
                  >
                    ↓
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
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
