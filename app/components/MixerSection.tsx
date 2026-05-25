/**
 * MixerSection — the DJ studio.
 *
 * Contains the slot-A/B decks, EQ + filter, crossfader, recording bar,
 * loop/cue controls, and beatgrid overlay. Stateless: parent owns the slot
 * data and recording state.
 */

"use client";

import { useState } from "react";
import type { SongSlot, SlotId } from "@/lib/songSlots";
import { formatTime } from "./utils";

function InfoButton({ onClick }: { onClick: () => void }) {
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

export function MixerSection({
  mode,
  slots,
  syncMatrixBpm,
  tempoScale,
  crossfader,
  recording,
  recordElapsed,
  lastRecording,
  libraryCount,
  isAuthenticated,
  savingMix,
  lastShareUrl,
  onModeChange,
  onPickFile,
  onRemoveSlot,
  onAddSlotB,
  onUpdateSlot,
  onSyncChange,
  onTempoScale,
  onCrossfader,
  onStartRecording,
  onStopRecording,
  onDownloadRecording,
  onSaveMixToCloud,
  onClearShareUrl,
  onOpenLibrary,
  onSaveSlot,
  onSeek,
  onInfo,
}: {
  mode: "easy" | "remix";
  slots: SongSlot[];
  syncMatrixBpm: boolean;
  tempoScale: number;
  crossfader: number;
  recording: boolean;
  recordElapsed: number;
  lastRecording: { durationMs: number } | null;
  libraryCount: number;
  isAuthenticated: boolean;
  savingMix: boolean;
  lastShareUrl: string | null;
  onModeChange: (m: "easy" | "remix") => void;
  onPickFile: (id: SlotId) => void;
  onRemoveSlot: (id: SlotId) => void;
  onAddSlotB: () => void;
  onUpdateSlot: (id: SlotId, patch: Partial<SongSlot>) => void;
  onSyncChange: (v: boolean) => void;
  onTempoScale: (v: number) => void;
  onCrossfader: (v: number) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDownloadRecording: () => void;
  onSaveMixToCloud: () => void;
  onClearShareUrl: () => void;
  onOpenLibrary: () => void;
  onSaveSlot: (id: SlotId) => void;
  onSeek: (id: SlotId, t: number) => void;
  onInfo: () => void;
}) {
  const slotA = slots.find((s) => s.id === "A") ?? slots[0];
  const slotB = slots.find((s) => s.id === "B");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          {mode === "easy" ? "The Mixer" : "DJ Studio"}
          <InfoButton onClick={onInfo} />
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenLibrary}
            className="px-2.5 py-1 text-[11px] uppercase tracking-wider rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-900"
          >
            Library {libraryCount > 0 && `(${libraryCount})`}
          </button>
          <div className="flex gap-1 p-1 bg-black/40 border border-zinc-900 rounded">
            {(["easy", "remix"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`px-3 py-1 text-[11px] uppercase tracking-wider rounded transition-colors ${
                  mode === m
                    ? "bg-zinc-900 text-[#00ffcc]"
                    : "text-zinc-600 hover:text-zinc-300"
                }`}
              >
                {m === "easy" ? "Easy Mix" : "Remix"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "remix" && (
        <RecordingBar
          recording={recording}
          elapsed={recordElapsed}
          lastRecording={lastRecording}
          isAuthenticated={isAuthenticated}
          savingMix={savingMix}
          lastShareUrl={lastShareUrl}
          onStart={onStartRecording}
          onStop={onStopRecording}
          onDownload={onDownloadRecording}
          onSaveCloud={onSaveMixToCloud}
          onClearShareUrl={onClearShareUrl}
        />
      )}

      <SlotPlayer
        slot={slotA}
        showAdvanced={mode === "remix"}
        syncMatrixBpm={syncMatrixBpm}
        onSyncChange={onSyncChange}
        onPick={() => onPickFile("A")}
        onRemove={() => onRemoveSlot("A")}
        onUpdate={(p) => onUpdateSlot("A", p)}
        onSeek={(t) => onSeek("A", t)}
        onSave={() => onSaveSlot("A")}
        accent="#00ffcc"
      />

      {mode === "remix" && (
        <>
          {/* Crossfader between A and B */}
          <Crossfader value={crossfader} onChange={onCrossfader} />

          {slotB ? (
            <SlotPlayer
              slot={slotB}
              showAdvanced
              syncMatrixBpm={false}
              onSyncChange={() => {}}
              onPick={() => onPickFile("B")}
              onRemove={() => onRemoveSlot("B")}
              onUpdate={(p) => onUpdateSlot("B", p)}
              onSeek={(t) => onSeek("B", t)}
              onSave={() => onSaveSlot("B")}
              accent="#a78bfa"
            />
          ) : (
            <button
              onClick={onAddSlotB}
              className="w-full h-12 rounded-xl border border-dashed border-[#a78bfa]/40 text-[#a78bfa] text-sm uppercase tracking-wider hover:bg-[#a78bfa]/5"
            >
              + Add second song (Slot B)
            </button>
          )}

          {/* Master tempo - scales matrix bpmSync only */}
          <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-lg">
            <div className="flex justify-between items-baseline mb-2">
              <label className="text-[11px] uppercase tracking-wider text-zinc-400">
                Matrix tempo scale
              </label>
              <span className="text-[11px] text-[#00ffcc] font-mono">
                {tempoScale.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={tempoScale}
              onChange={(e) => onTempoScale(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              Scales only the matrix gamma off-beat gate. Per-track tempo lives on each slot.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function RecordingBar({
  recording,
  elapsed,
  lastRecording,
  isAuthenticated,
  savingMix,
  lastShareUrl,
  onStart,
  onStop,
  onDownload,
  onSaveCloud,
  onClearShareUrl,
}: {
  recording: boolean;
  elapsed: number;
  lastRecording: { durationMs: number } | null;
  isAuthenticated: boolean;
  savingMix: boolean;
  lastShareUrl: string | null;
  onStart: () => void;
  onStop: () => void;
  onDownload: () => void;
  onSaveCloud: () => void;
  onClearShareUrl: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <div
        className={`p-3 rounded-xl border flex items-center gap-2 flex-wrap ${
          recording
            ? "border-rose-500/50 bg-rose-500/[0.05]"
            : "border-zinc-800 bg-zinc-950/50"
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              recording ? "bg-rose-500 animate-pulse" : "bg-zinc-700"
            }`}
          />
          <span className="text-[11px] uppercase tracking-wider text-zinc-400">
            {recording ? "Recording" : "Recorder"}
          </span>
          <span
            className={`text-xs font-mono tabular-nums ${
              recording ? "text-rose-300" : "text-zinc-500"
            }`}
          >
            {formatTime(elapsed)}
          </span>
        </div>
        {recording ? (
          <button
            onClick={onStop}
            className="px-3 py-1.5 text-[11px] uppercase tracking-wider rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={onStart}
            className="px-3 py-1.5 text-[11px] uppercase tracking-wider rounded border border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
          >
            ● Record
          </button>
        )}
        {lastRecording && !recording && (
          <>
            <button
              onClick={onDownload}
              className="px-3 py-1.5 text-[11px] uppercase tracking-wider rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
            >
              ↓ Download
            </button>
            {isAuthenticated && !lastShareUrl && (
              <button
                onClick={onSaveCloud}
                disabled={savingMix}
                className="px-3 py-1.5 text-[11px] uppercase tracking-wider rounded border border-[#00ffcc]/40 text-[#00ffcc] hover:bg-[#00ffcc]/10 disabled:opacity-50"
              >
                {savingMix ? "Saving…" : "☁ Save to cloud"}
              </button>
            )}
          </>
        )}
      </div>
      {lastShareUrl && (
        <div className="p-3 rounded-xl border border-[#00ffcc]/40 bg-[#00ffcc]/[0.04] flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-[#00ffcc]">
            Mix saved · share URL
          </span>
          <code className="text-[11px] text-zinc-300 font-mono truncate flex-1 min-w-0">
            {lastShareUrl}
          </code>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(lastShareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard may be blocked */
              }
            }}
            className="px-2 py-1 text-[10px] uppercase tracking-wider rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={lastShareUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2 py-1 text-[10px] uppercase tracking-wider rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
          >
            Open
          </a>
          <button
            onClick={onClearShareUrl}
            className="px-2 py-1 text-[10px] uppercase tracking-wider rounded text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function Crossfader({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="p-3 rounded-xl border border-zinc-800 bg-gradient-to-r from-[#00ffcc]/[0.05] to-[#a78bfa]/[0.05]">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[11px] uppercase tracking-wider text-[#00ffcc]">A</span>
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          Crossfader
        </span>
        <span className="text-[11px] uppercase tracking-wider text-[#a78bfa]">B</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-center mt-1">
        <button
          onClick={() => onChange(0.5)}
          className="text-[9px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400"
        >
          center
        </button>
      </div>
    </div>
  );
}

function SlotPlayer({
  slot,
  showAdvanced,
  syncMatrixBpm,
  onSyncChange,
  onPick,
  onRemove,
  onUpdate,
  onSeek,
  onSave,
  accent,
}: {
  slot: SongSlot;
  showAdvanced: boolean;
  syncMatrixBpm: boolean;
  onSyncChange: (v: boolean) => void;
  onPick: () => void;
  onRemove: () => void;
  onUpdate: (p: Partial<SongSlot>) => void;
  onSeek: (t: number) => void;
  onSave: () => void;
  accent: string;
}) {
  if (!slot.url) {
    return (
      <div
        className="p-4 rounded-xl border border-dashed text-center"
        style={{ borderColor: `${accent}44`, backgroundColor: `${accent}05` }}
      >
        <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
          Slot {slot.id} - empty
        </div>
        <button
          onClick={onPick}
          className="w-full h-11 rounded-lg text-sm uppercase tracking-wider"
          style={{
            color: accent,
            backgroundColor: `${accent}0d`,
            border: `1px solid ${accent}66`,
          }}
        >
          + Import song
        </button>
        <p className="text-[11px] text-zinc-600 mt-3 leading-relaxed">
          MP3 · M4A · WAV · FLAC · OGG. Stays on your device.
        </p>
      </div>
    );
  }

  const progress = slot.duration > 0 ? slot.position / slot.duration : 0;
  const effective = slot.bpm != null ? Math.round(slot.bpm * slot.playbackRate) : null;

  return (
    <div
      className="p-4 rounded-xl border space-y-3"
      style={{ borderColor: `${accent}55`, backgroundColor: `${accent}05` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: accent }}>
            Slot {slot.id}
          </div>
          <div className="text-sm text-zinc-200 font-medium truncate">
            {slot.name || "Untitled"}
          </div>
        </div>
        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
          <button
            onClick={() => onUpdate({ muted: !slot.muted })}
            className={`px-2 py-1 text-[11px] uppercase tracking-wider border rounded ${
              slot.muted
                ? "border-rose-500/40 text-rose-400 bg-rose-500/5"
                : "border-zinc-800 text-zinc-400 hover:bg-zinc-900"
            }`}
          >
            {slot.muted ? "Muted" : "Mute"}
          </button>
          <button
            onClick={onSave}
            title="Save to library"
            className="px-2 py-1 text-[11px] uppercase tracking-wider border border-zinc-800 text-zinc-400 rounded hover:bg-zinc-900"
          >
            ⭑ Save
          </button>
          <button
            onClick={onPick}
            className="px-2 py-1 text-[11px] uppercase tracking-wider border border-zinc-800 text-zinc-400 rounded hover:bg-zinc-900"
          >
            Change
          </button>
          <button
            onClick={onRemove}
            className="px-2 py-1 text-[11px] uppercase tracking-wider border border-zinc-800 text-zinc-500 rounded hover:border-rose-500/40 hover:text-rose-400"
          >
            ✕
          </button>
        </div>
      </div>

      <div>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={Math.max(1, slot.duration)}
            step={0.1}
            value={Math.min(slot.position, slot.duration)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full relative z-10"
          />
          {showAdvanced && <BeatGrid slot={slot} accent={accent} />}
        </div>
        <div className="flex justify-between text-[11px] text-zinc-500 font-mono mt-1">
          <span>{formatTime(slot.position)}</span>
          <span>{formatTime(slot.duration)}</span>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-1">
          <label className="text-[11px] uppercase tracking-wider text-zinc-500">
            Volume
          </label>
          <span className="text-[11px] text-zinc-500 font-mono">
            {Math.round(slot.volume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={slot.volume}
          onChange={(e) => onUpdate({ volume: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      {showAdvanced && (
        <>
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-[11px] uppercase tracking-wider text-zinc-500">
                Tempo
              </label>
              <span className="text-[11px] font-mono" style={{ color: accent }}>
                {slot.playbackRate.toFixed(2)}x
                {effective != null ? ` · ${effective} BPM` : ""}
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.01}
              value={slot.playbackRate}
              onChange={(e) => onUpdate({ playbackRate: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onUpdate({ playbackRate: 1 })}
                className="flex-1 text-[10px] uppercase tracking-wider py-1 border border-zinc-800 text-zinc-500 rounded hover:bg-zinc-900"
              >
                Reset 1.00x
              </button>
              <button
                onClick={() => onUpdate({ preservePitch: !slot.preservePitch })}
                className={`flex-1 text-[10px] uppercase tracking-wider py-1 border rounded ${
                  slot.preservePitch
                    ? "border-[#00ffcc]/40 text-[#00ffcc] bg-[#00ffcc]/5"
                    : "border-zinc-800 text-zinc-500"
                }`}
              >
                Pitch: {slot.preservePitch ? "preserved" : "follows tempo"}
              </button>
            </div>
          </div>

          {/* 3-band EQ */}
          <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-950/40">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
              EQ
            </div>
            <div className="grid grid-cols-3 gap-2">
              <EQBand label="Low" value={slot.eqLow} onChange={(v) => onUpdate({ eqLow: v })} accent={accent} />
              <EQBand label="Mid" value={slot.eqMid} onChange={(v) => onUpdate({ eqMid: v })} accent={accent} />
              <EQBand label="High" value={slot.eqHigh} onChange={(v) => onUpdate({ eqHigh: v })} accent={accent} />
            </div>
          </div>

          {/* Filter sweep */}
          <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-950/40">
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500">
                Low-pass filter
              </label>
              <span className="text-[10px] font-mono" style={{ color: accent }}>
                {slot.filterCutoff >= 20000 ? "OPEN" : `${Math.round(slot.filterCutoff)} Hz`}
              </span>
            </div>
            <input
              type="range"
              min={120}
              max={22050}
              step={10}
              value={slot.filterCutoff}
              onChange={(e) => onUpdate({ filterCutoff: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-end mt-1">
              <button
                onClick={() => onUpdate({ filterCutoff: 22050 })}
                className="text-[9px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400"
              >
                Open
              </button>
            </div>
          </div>

          {/* Loop in/out */}
          <LoopControls slot={slot} onUpdate={onUpdate} accent={accent} />

          {/* Hot cues */}
          <HotCues slot={slot} onUpdate={onUpdate} onSeek={onSeek} accent={accent} />
        </>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="p-2 bg-zinc-900/40 border border-zinc-800 rounded">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">
            {slot.bpmDetecting ? "Detecting…" : "Song BPM"}
          </label>
          <input
            type="number"
            min={40}
            max={220}
            value={slot.bpm ?? ""}
            placeholder={slot.bpmDetecting ? "analyzing…" : "e.g. 82"}
            disabled={slot.bpmDetecting}
            onChange={(e) => {
              const v = e.target.value;
              onUpdate({ bpm: v === "" ? null : Math.max(0, parseInt(v) || 0) });
            }}
            className="w-full bg-black/40 border border-zinc-800 rounded px-2 py-1 text-sm font-mono focus:outline-none disabled:opacity-50"
            style={{ color: accent, borderColor: `${accent}33` }}
          />
        </div>
        {slot.id === "A" ? (
          <button
            onClick={() => onSyncChange(!syncMatrixBpm)}
            className={`p-2 rounded border text-left ${
              syncMatrixBpm
                ? "border-[#00ffcc]/40 bg-[#00ffcc]/5"
                : "border-zinc-800 bg-zinc-900/40"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Sync matrix
            </div>
            <div className={`text-xs ${syncMatrixBpm ? "text-[#00ffcc]" : "text-zinc-400"}`}>
              {syncMatrixBpm ? "On" : "Off"}
            </div>
          </button>
        ) : (
          <button
            onClick={() => onUpdate({ loop: !slot.loop })}
            className="p-2 rounded border border-zinc-800 bg-zinc-900/40 text-left"
          >
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Loop
            </div>
            <div className="text-xs text-zinc-400">
              {slot.loop ? "On" : "Off"}
            </div>
          </button>
        )}
      </div>

      {slot.id === "A" && (
        <button
          onClick={() => onUpdate({ loop: !slot.loop })}
          className={`w-full py-2 text-[11px] uppercase tracking-wider rounded border transition-colors ${
            slot.loop
              ? "border-zinc-700 text-zinc-300 bg-zinc-900"
              : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
          }`}
        >
          Loop: {slot.loop ? "On" : "Off"}
        </button>
      )}

      <div className="h-0.5 bg-zinc-900 rounded-full overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${progress * 100}%`, backgroundColor: `${accent}66` }}
        />
      </div>
    </div>
  );
}

// =====================================================================
// Engineer card
// =====================================================================

function EQBand({
  label,
  value,
  onChange,
  accent,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-widest text-zinc-500 mb-0.5">
        {label}
      </span>
      <input
        type="range"
        min={-15}
        max={15}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => onChange(0)}
        className="w-full"
      />
      <span className="text-[10px] font-mono mt-0.5" style={{ color: accent }}>
        {value > 0 ? "+" : ""}
        {value.toFixed(1)} dB
      </span>
    </div>
  );
}

function LoopControls({
  slot,
  onUpdate,
  accent,
}: {
  slot: SongSlot;
  onUpdate: (p: Partial<SongSlot>) => void;
  accent: string;
}) {
  const hasLoop = slot.loopStart != null && slot.loopEnd != null;
  const barSeconds = (bars: number) =>
    slot.bpm && slot.bpm > 0 ? (60 / (slot.bpm * slot.playbackRate)) * 4 * bars : null;

  const setQuickLoop = (bars: number) => {
    const len = barSeconds(bars);
    if (len == null) return;
    const start = slot.position;
    onUpdate({ loopStart: start, loopEnd: Math.min(start + len, slot.duration) });
  };

  return (
    <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-950/40">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">
          Loop {hasLoop && "·"}
        </span>
        {hasLoop && (
          <span className="text-[10px] font-mono" style={{ color: accent }}>
            {formatTime(slot.loopStart!)} - {formatTime(slot.loopEnd!)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1">
        <button
          onClick={() => onUpdate({ loopStart: slot.position })}
          className="text-[9px] uppercase tracking-wider py-1 border border-zinc-800 text-zinc-400 rounded hover:bg-zinc-900"
        >
          Set in
        </button>
        <button
          onClick={() => onUpdate({ loopEnd: slot.position })}
          className="text-[9px] uppercase tracking-wider py-1 border border-zinc-800 text-zinc-400 rounded hover:bg-zinc-900"
        >
          Set out
        </button>
        <button
          onClick={() => onUpdate({ loopStart: null, loopEnd: null })}
          className="text-[9px] uppercase tracking-wider py-1 border border-zinc-800 text-zinc-500 rounded hover:border-rose-500/40 hover:text-rose-400"
        >
          Clear
        </button>
        <button
          disabled={!hasLoop}
          onClick={() => {
            if (slot.loopStart != null) onUpdate({ position: slot.loopStart });
          }}
          className="text-[9px] uppercase tracking-wider py-1 border border-zinc-800 text-zinc-400 rounded hover:bg-zinc-900 disabled:opacity-40"
        >
          Jump
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1 mt-1">
        {[1, 2, 4].map((bars) => (
          <button
            key={bars}
            disabled={!slot.bpm}
            onClick={() => setQuickLoop(bars)}
            className="text-[9px] uppercase tracking-wider py-1 border border-zinc-800 text-zinc-500 rounded hover:bg-zinc-900 disabled:opacity-30"
          >
            {bars} bar
          </button>
        ))}
      </div>
      {!slot.bpm && (
        <p className="text-[9px] text-zinc-600 mt-1">
          Quick-bar buttons need a BPM.
        </p>
      )}
    </div>
  );
}

function BeatGrid({ slot, accent }: { slot: SongSlot; accent: string }) {
  if (!slot.bpm || slot.bpm <= 0 || !slot.duration || slot.duration < 2) return null;
  const effectiveBpm = slot.bpm * slot.playbackRate;
  const beatSec = 60 / effectiveBpm;
  const downbeatSec = beatSec * 4; // 1 bar
  const numDownbeats = Math.floor(slot.duration / downbeatSec);
  if (numDownbeats < 2) return null;
  const stride = numDownbeats > 80 ? Math.ceil(numDownbeats / 80) : 1;
  const markers: number[] = [];
  for (let i = 0; i < numDownbeats; i += stride) {
    markers.push((i * downbeatSec) / slot.duration);
  }
  return (
    <div className="absolute inset-0 pointer-events-none">
      {markers.map((pct, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: `${pct * 100}%`,
            backgroundColor: accent,
            opacity: 0.22,
          }}
        />
      ))}
    </div>
  );
}

function HotCues({
  slot,
  onUpdate,
  onSeek,
  accent,
}: {
  slot: SongSlot;
  onUpdate: (p: Partial<SongSlot>) => void;
  onSeek: (t: number) => void;
  accent: string;
}) {
  const handleClick = (idx: number) => {
    const cue = slot.hotCues[idx];
    if (cue == null) {
      // Set cue at current position.
      const next = [...slot.hotCues];
      next[idx] = slot.position;
      onUpdate({ hotCues: next });
    } else {
      onSeek(cue);
    }
  };

  const handleClear = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = [...slot.hotCues];
    next[idx] = null;
    onUpdate({ hotCues: next });
  };

  return (
    <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-950/40">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
        Hot cues
      </div>
      <div className="grid grid-cols-4 gap-1">
        {slot.hotCues.map((cue, i) => {
          const set = cue != null;
          return (
            <div
              key={i}
              className={`relative rounded border text-center ${
                set
                  ? "border-zinc-700 bg-zinc-900"
                  : "border-zinc-800 bg-zinc-900/40 border-dashed"
              }`}
            >
              <button
                onClick={() => handleClick(i)}
                className="w-full py-1.5 text-[10px] font-mono"
                style={{ color: set ? accent : "#71717a" }}
              >
                <div className="text-[8px] uppercase tracking-widest opacity-60">
                  {i + 1}
                </div>
                <div>{set ? formatTime(cue) : "Set"}</div>
              </button>
              {set && (
                <button
                  onClick={(e) => handleClear(i, e)}
                  className="absolute top-0 right-0.5 text-[10px] text-zinc-600 hover:text-rose-400 leading-none"
                  aria-label="Clear cue"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-zinc-600 mt-1">
        Tap empty to set · tap set to jump · × clears
      </p>
    </div>
  );
}
