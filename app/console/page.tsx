"use client";

/**
 * /console — wide DJ-console route, NOW WIRED to the real audio engine.
 *
 * Each deck binds an HTMLAudioElement through djBus.ensureDeck(). Crossfader
 * drives djBus.setCrossfader. The LPF bar drives djBus.setFilterCutoff.
 * Preset cards start the brainwave matrix engine with the picked preset.
 *
 * State is local to this route — it does not sync with the mobile app at /.
 * If you want cross-route sync, lift the slot state into a context provider
 * at app/layout.tsx (or persist to Supabase realtime).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./console.css";
import { djBus, downloadBlob } from "@/lib/djBus";
import {
  start as startEngine,
  stop as stopEngine,
  smoothRestart,
  setDroneGain,
  setNoiseGain,
  type EngineConfig,
} from "@/lib/audioEngine";
import { PRESETS, type PresetId } from "@/lib/presets";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  listCloudTracks,
  downloadTrack,
  updateTrackHotCues,
  type CloudTrack,
} from "@/lib/cloudLibrary";
import { writeSlots, subscribeSlots, readSlots } from "@/lib/routeSync";

// ─────────────────────────────────────────────────────────────────────────────
// Slot state
// ─────────────────────────────────────────────────────────────────────────────

interface DeckState {
  /** Object URL of the loaded file, or null if empty. */
  url: string | null;
  name: string;
  artist: string;
  bpm: number | null;
  position: number;
  duration: number;
  playing: boolean;
  /** EQ in dB, -15..+15. */
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  /** Filter cutoff in Hz. 22050 = open. */
  filterHz: number;
  /** Playback rate 0.7..1.3 (preservesPitch). */
  tempo: number;
  /** 4 hot cues, position in seconds or null. */
  hotCues: (number | null)[];
  /** When loaded from the cloud library, the track id (for persisting cues). */
  cloudTrackId: string | null;
}

const EMPTY_DECK = (): DeckState => ({
  url: null,
  name: "— empty —",
  artist: "Click the platter to load a file",
  bpm: null,
  position: 0,
  duration: 0,
  playing: false,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  filterHz: 22050,
  tempo: 1.0,
  hotCues: [null, null, null, null],
  cloudTrackId: null,
});

interface ConsolePreset {
  id: PresetId;
  emoji: string;
  name: string;
  hz: string;
}

const CONSOLE_PRESETS: ConsolePreset[] = [
  { id: "deskflow", emoji: "⚡", name: "Desk Flow", hz: "14 Hz · 80 BPM" },
  { id: "poolside", emoji: "🌴", name: "Poolside", hz: "8 Hz · 85 BPM" },
  { id: "archaic", emoji: "🌑", name: "Archaic", hz: "7 Hz · EMDR" },
  { id: "theta", emoji: "🧘", name: "Theta", hz: "6 Hz · breath" },
  { id: "sleep", emoji: "🌙", name: "Sleep", hz: "2 Hz · delta" },
  { id: "energy", emoji: "🔥", name: "Energy", hz: "18 Hz · 95 BPM" },
];

// Mirror of presetToState → engine config, simplified for the console.
function presetToEngineConfig(presetId: PresetId): EngineConfig {
  const p = PRESETS[presetId];
  return {
    ...p.params,
    // EngineConfig fields beyond PresetParams:
    mode: "isochronic",
    masterGain: p.defaultVolume,
    breathPacer: false,
    emdrPan: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ConsoleTopBar({
  view,
  onView,
}: {
  view: string;
  onView: (v: string) => void;
}) {
  return (
    <header className="console-topbar">
      <div className="brand">
        <svg
          className="brand-mark"
          viewBox="0 0 28 28"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="14" cy="14" r="13" fill="none" stroke="#00ffcc" strokeWidth="2" />
          <circle cx="14" cy="14" r="4" fill="#00ffcc" />
        </svg>
        <div>
          <div className="wm">
            Brain<span className="accent">Mix</span>
          </div>
          <div className="tag">Neuro-Acoustic Matrix · DJ Studio</div>
        </div>
      </div>

      <div className="views" role="tablist">
        {["Studio", "Music", "Timer"].map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={view === v ? "act" : ""}
            onClick={() => onView(v)}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="actions">
        <Link href="/" className="console-back">
          ← Mobile app
        </Link>
        <Link
          href="/live/host"
          className="pill"
          style={{ textDecoration: "none", color: "var(--rose)", borderColor: "var(--rose-40)" }}
        >
          ● Live
        </Link>
        <Link href="/stats" className="pill" style={{ textDecoration: "none" }}>
          📊 Stats
        </Link>
      </div>
    </header>
  );
}

function Turntable({
  deck,
  spinning,
  onClick,
}: {
  deck: "a" | "b";
  spinning: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="jog-wrap">
      <div
        className={"console-jog" + (spinning ? "" : " paused")}
        onClick={onClick}
        style={{ cursor: onClick ? "pointer" : undefined }}
      >
        <div className="console-hub">{deck.toUpperCase()}</div>
      </div>
    </div>
  );
}

function DeckPanel({
  side,
  spinning,
  state,
  onTogglePlay,
  onLoad,
  onSeek,
  onFilter,
  onEq,
  onTempo,
  onSetCue,
  onJumpCue,
  onClearCue,
}: {
  side: "a" | "b";
  spinning: boolean;
  state: DeckState;
  onTogglePlay: () => void;
  onLoad: () => void;
  onSeek: (t: number) => void;
  onFilter: (hz: number) => void;
  onEq: (band: "low" | "mid" | "high", db: number) => void;
  onTempo: (rate: number) => void;
  onSetCue: (idx: number) => void;
  onJumpCue: (idx: number) => void;
  onClearCue: (idx: number) => void;
}) {
  const isA = side === "a";
  const accentLabel = state.url
    ? isA
      ? "Deck A · ready"
      : "Deck B · ready"
    : `Deck ${side.toUpperCase()} · empty`;
  const accentClass = isA ? "act-a" : "act-b";
  const playClass = isA ? "play-a" : "play-b";

  // Mini beat-grid ticks.
  const ticks: number[] = [];
  for (let i = 1; i < 12; i++) ticks.push(i * 8.3);
  const pct = state.duration > 0 ? (state.position / state.duration) * 100 : 0;

  return (
    <div className={`deck ${side}`}>
      <div
        style={{
          width: 320,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: isA ? "var(--mint)" : "var(--violet)",
          }}
        >
          {accentLabel}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--fg-4)",
          }}
        >
          {state.url ? (spinning ? "▶ live" : "❚❚ paused") : "no file"}
        </span>
      </div>

      <Turntable deck={side} spinning={spinning} onClick={onLoad} />

      <div className="deck-meta">
        <div className="title">{state.name}</div>
        <div className="sub">{state.artist}</div>
      </div>

      <div className="deck-scrub">
        <div
          className="bar"
          onClick={(e) => {
            if (state.duration <= 0) return;
            const r = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - r.left) / r.width;
            onSeek(ratio * state.duration);
          }}
          style={{ cursor: state.duration > 0 ? "pointer" : "default" }}
        >
          <div className="fill" style={{ width: `${pct}%` }} />
          <div className="ticks">
            {ticks.map((p, i) => (
              <div key={i} className="tk" style={{ left: `${p}%` }} />
            ))}
          </div>
        </div>
        <div className="times">
          <span>{formatTime(state.position)}</span>
          <span>{formatTime(state.duration)}</span>
        </div>
      </div>

      <div className="deck-tp">
        <button
          className={`btn ${accentClass}`}
          aria-label="Hot cue prev"
          onClick={() => onSeek(Math.max(0, state.position - 10))}
        >
          ⏮
        </button>
        <button
          className={`btn ${accentClass}`}
          aria-label="Cue (jump to start)"
          onClick={() => onSeek(0)}
        >
          ⏯
        </button>
        <button
          className={`btn ${playClass}`}
          onClick={onTogglePlay}
          aria-label={spinning ? "Pause" : "Play"}
          disabled={!state.url}
          style={!state.url ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
        >
          {spinning ? "❚❚" : "▶"}
        </button>
        <button className={`btn ${accentClass}`} aria-label="Loop">↻</button>
        <button
          className={`btn ${accentClass}`}
          aria-label="Forward 10s"
          onClick={() => onSeek(Math.min(state.duration, state.position + 10))}
        >
          ⏭
        </button>
      </div>

      <div className="deck-stats">
        <div className="s">
          <div className="l">BPM</div>
          <div className="v">{state.bpm ?? "—"}</div>
        </div>
        <div className="s">
          <div className="l">Tempo</div>
          <div className="v">1.00x</div>
        </div>
        <div className="s">
          <div className="l">Key</div>
          <div className="v">—</div>
        </div>
        <div className="s">
          <div className="l">Cue</div>
          <div className="v">{formatTime(state.position)}</div>
        </div>
      </div>

      <div className="deck-eq">
        <div className="panel">
          <div className="head">
            <span className="name">EQ · 3-band</span>
            <span className="v">
              {fmtDb(state.eqLow)}/{fmtDb(state.eqMid)}/{fmtDb(state.eqHigh)}
            </span>
          </div>
          <div className="eq3">
            <EqBand label="Low" value={state.eqLow} onChange={(v) => onEq("low", v)} />
            <EqBand label="Mid" value={state.eqMid} onChange={(v) => onEq("mid", v)} />
            <EqBand label="High" value={state.eqHigh} onChange={(v) => onEq("high", v)} />
          </div>
        </div>
        <div className="panel">
          <div className="head">
            <span className="name">LPF · cutoff</span>
            <span className="v">
              {state.filterHz >= 22000 ? "OPEN" : `${Math.round(state.filterHz)} Hz`}
            </span>
          </div>
          {/* Draggable LPF bar. Click/drag to set cutoff. */}
          <div
            onMouseDown={(e) => {
              const rail = e.currentTarget;
              const rect = rail.getBoundingClientRect();
              const apply = (x: number) => {
                const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
                onFilter(ratio * 22050);
              };
              apply(e.clientX);
              const move = (ev: MouseEvent) => apply(ev.clientX);
              const up = () => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
            style={{
              height: 8,
              background: "var(--surface-3)",
              borderRadius: 2,
              marginTop: 2,
              position: "relative",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,.5)",
              cursor: "ew-resize",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${Math.min(100, (state.filterHz / 22050) * 100)}%`,
                background: isA ? "var(--mint)" : "var(--violet)",
                borderRadius: 2,
              }}
            />
          </div>
          {/* Tempo slider — 0.7×..1.3× with preservesPitch. */}
          <div className="head" style={{ marginTop: 14 }}>
            <span className="name">Tempo</span>
            <span className="v">{state.tempo.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={0.7}
            max={1.3}
            step={0.01}
            value={state.tempo}
            onChange={(e) => onTempo(parseFloat(e.target.value))}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>
      </div>

      <div className="hot-cues">
        <div className="label">
          Hot cues · 4 · tap empty to set @ now, tap set to jump, long-press to clear
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          {state.hotCues.map((cuePos, i) => {
            const set = cuePos != null;
            return (
              <div
                key={i}
                className={"cell" + (set ? " set" : "")}
                onClick={() => (set ? onJumpCue(i) : onSetCue(i))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (set) onClearCue(i);
                }}
              >
                {set ? formatTime(cuePos as number) : i + 1}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function fmtDb(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

/**
 * EqBand — vertical -15..+15 dB. Drag the thumb (or anywhere on the track) to
 * change the value. Double-click to zero. Calls onChange continuously.
 */
function EqBand({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const isPos = value >= 0;
  const pct = (Math.abs(value) / 15) * 50;
  const startDrag = (e: React.MouseEvent) => {
    const rail = (e.currentTarget as HTMLElement);
    const rect = rail.getBoundingClientRect();
    const apply = (clientY: number) => {
      // 0 at center, top = +15, bottom = -15. Clamp.
      const ratio = (clientY - rect.top) / rect.height; // 0..1, 0 = top
      const v = (1 - ratio * 2) * 15; // 1 → -15, 0 → +15
      onChange(Math.max(-15, Math.min(15, v)));
    };
    apply(e.clientY);
    const move = (ev: MouseEvent) => apply(ev.clientY);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div className="band">
      <div className="name">{label}</div>
      <div
        className="vert"
        onMouseDown={startDrag}
        onDoubleClick={() => onChange(0)}
        style={{ cursor: "ns-resize" }}
        role="slider"
        aria-label={`${label} band`}
        aria-valuemin={-15}
        aria-valuemax={15}
        aria-valuenow={value}
      >
        <div
          className="vf"
          style={
            isPos
              ? { bottom: "50%", height: `${pct}%` }
              : { top: "50%", height: `${pct}%` }
          }
        />
        <div className="vt" style={{ top: `${isPos ? 50 - pct : 50 + pct - 9}%` }} />
      </div>
      <div className="val">{fmtDb(value)}</div>
    </div>
  );
}

function Knob({ name, val, rot }: { name: string; val: string; rot: number }) {
  return (
    <div className="kstack">
      <div
        className="k-knob"
        style={{ ["--rot" as string]: `${rot}deg` } as React.CSSProperties}
      />
      <div className="name">{name}</div>
      <div className="val">{val}</div>
    </div>
  );
}

/**
 * LiveKnob — vertical-drag rotary control 0..1. Used for every knob in the
 * mixer column that's actually wired to audio. Double-click to reset to the
 * "default" value passed in. Rotation reflects current value.
 */
function LiveKnob({
  name,
  value,
  onChange,
  format = (v) => v.toFixed(2),
  resetValue = 0,
  ariaLabel,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  resetValue?: number;
  ariaLabel?: string;
}) {
  const rot = -135 + value * 270;
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startV = value;
    const move = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      onChange(Math.max(0, Math.min(1, startV + dy / 200)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div className="kstack">
      <div
        className="k-knob"
        onMouseDown={startDrag}
        onDoubleClick={() => onChange(resetValue)}
        style={
          {
            ["--rot" as string]: `${rot}deg`,
            cursor: "ns-resize",
          } as React.CSSProperties
        }
        role="slider"
        aria-label={ariaLabel ?? name}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
      />
      <div className="name">{name}</div>
      <div className="val">{format(value)}</div>
    </div>
  );
}

function MixerColumn({
  crossfader,
  onCrossfader,
  activePreset,
  matrixRunning,
  onPreset,
  beatHz,
  carrierHz,
  bpmSync,
  recording,
  recordElapsed,
  onToggleRecord,
  masterGain,
  onMasterGain,
  mixBalance,
  onMixBalance,
  droneGain,
  onDroneGain,
  noiseGain,
  onNoiseGain,
  listenerCount,
}: {
  crossfader: number;
  onCrossfader: (v: number) => void;
  activePreset: PresetId | null;
  matrixRunning: boolean;
  onPreset: (id: PresetId) => void;
  beatHz: number;
  carrierHz: number;
  bpmSync: number;
  recording: boolean;
  recordElapsed: number;
  onToggleRecord: () => void;
  masterGain: number;
  onMasterGain: (v: number) => void;
  mixBalance: number;
  onMixBalance: (v: number) => void;
  droneGain: number;
  onDroneGain: (v: number) => void;
  noiseGain: number;
  onNoiseGain: (v: number) => void;
  listenerCount: number;
}) {
  const xfPct = (1 - crossfader) * 100;
  const knobLeft = `calc(${crossfader * 100}% - 18px)`;

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const rail = (e.currentTarget as HTMLElement).parentElement;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    const move = (ev: MouseEvent) => {
      const x = (ev.clientX - rect.left) / rect.width;
      onCrossfader(Math.max(0, Math.min(1, x)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <aside className="mixer">
      <div className="lcd">
        <div className="l">Matrix · entrainment</div>
        <div className="big">{beatHz.toFixed(2)} Hz</div>
        <div className="row">
          <span>
            carrier <span className="v">{carrierHz}</span>
          </span>
          <span>
            {bpmSync > 0 ? (
              <>gate <span className="v">{bpmSync} BPM</span></>
            ) : (
              <>gate <span className="v">{matrixRunning ? "live" : "off"}</span></>
            )}
          </span>
        </div>
      </div>

      <div className="xf-wrap">
        <div className="xf-top">
          <span className="a">A</span>
          <span className="mid">Crossfader · {crossfader.toFixed(2)}</span>
          <span className="b">B</span>
        </div>
        <div className="xf-rail">
          <div className="channel" />
          <div className="fill-a" style={{ width: `${xfPct}%` }} />
          <div
            className="xf-knob"
            style={{ left: knobLeft }}
            onMouseDown={startDrag}
            role="slider"
            aria-label="Crossfader"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={crossfader}
          />
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            color: "var(--fg-5)",
          }}
        >
          equal-power · 6s auto x-fade
        </div>
      </div>

      <div className="knobs">
        <LiveKnob
          name="Gain"
          value={masterGain}
          onChange={onMasterGain}
          resetValue={1}
          ariaLabel="Master gain"
        />
        <LiveKnob
          name="Mix"
          value={mixBalance}
          onChange={onMixBalance}
          format={(v) => `${Math.round(v * 100)}%`}
          resetValue={0.5}
          ariaLabel="Matrix-vs-decks mix"
        />
        <LiveKnob
          name="Drone"
          value={droneGain}
          onChange={onDroneGain}
          resetValue={0.18}
          ariaLabel="Drone layer gain"
        />
        <LiveKnob
          name="Noise"
          value={noiseGain}
          onChange={onNoiseGain}
          resetValue={0.12}
          ariaLabel="Noise layer gain"
        />
      </div>
      {listenerCount > 1 && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background: "var(--violet-10)",
            border: "1px solid var(--violet-40)",
            color: "var(--violet)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            textAlign: "center",
          }}
        >
          ● {listenerCount} listening · live
        </div>
      )}

      <div className="preset-row">
        <div className="label">
          Brainwave preset · 6 options
          {matrixRunning && (
            <span style={{ color: "var(--mint)", marginLeft: 8 }}>
              · matrix live
            </span>
          )}
        </div>
        <div className="grid">
          {CONSOLE_PRESETS.map((p) => (
            <button
              key={p.id}
              className={"pcard" + (p.id === activePreset ? " act" : "")}
              onClick={() => onPreset(p.id)}
            >
              <div className="emoji">{p.emoji}</div>
              <div className="name">{p.name}</div>
              <div className="hz">{p.hz}</div>
            </button>
          ))}
        </div>
      </div>

      <div className={"rec-row" + (recording ? " live" : "")}>
        <span className="dot" />
        <span className="label">{recording ? "Recording" : "Recorder"}</span>
        <span className="time">{formatTime(recordElapsed)}</span>
        <button onClick={onToggleRecord}>{recording ? "Stop" : "● Record"}</button>
      </div>
    </aside>
  );
}

function Manual() {
  return (
    <section className="manual">
      <div className="group">
        <h4>① The turntables</h4>
        <p>
          Two independent decks. Click a turntable to load a file (MP3 / M4A /
          WAV / FLAC / OGG). Stays on your device — no upload.
        </p>
        <div className="step"><span className="n">A</span><span>Mint deck. Click to load. Play button spins the platter.</span></div>
        <div className="step"><span className="n">B</span><span>Violet deck. Same flow. Both feed into the crossfader.</span></div>
        <div className="step"><span className="n">▶</span><span>Big play button starts the audio + platter spin.</span></div>
        <div className="step"><span className="n">⏮ ⏭</span><span>Skip back / forward 10 seconds.</span></div>
        <div className="step"><span className="n">⏯</span><span>Jump to the start (cue point).</span></div>
      </div>

      <div className="group violet">
        <h4>② The mixer column</h4>
        <p>Where the two decks mix together, with the brain-state layer underneath.</p>
        <div className="step"><span className="n">▮</span><span>Crossfader. Drag to balance A ↔ B. Updates djBus equal-power gains live.</span></div>
        <div className="step"><span className="n">LPF</span><span>Per-deck low-pass cutoff. Drag the bar for the classic filter sweep.</span></div>
        <div className="step"><span className="n">3-band</span><span>EQ readouts are visual for now — drag wiring TBD.</span></div>
        <div className="step"><span className="n">Knobs</span><span>Master gain / mix / drone / noise — visual reference only.</span></div>
      </div>

      <div className="group">
        <h4>③ The brain matrix</h4>
        <p>Layered binaural / isochronic tones that ride underneath the music. Click a preset to start; click again to stop.</p>
        <div className="step"><span className="n">⚡</span><span><b>Desk Flow.</b> 40 Hz gamma · 14 Hz beat · 80 BPM gate.</span></div>
        <div className="step"><span className="n">🌴</span><span><b>Poolside.</b> 8 Hz alpha · 85 BPM.</span></div>
        <div className="step"><span className="n">🌑</span><span><b>Archaic.</b> 110 Hz sub · 7 Hz pulse · EMDR pan.</span></div>
        <div className="step"><span className="n">🔥</span><span><b>Energy.</b> 18 Hz mid-beta · 95 BPM.</span></div>
      </div>

      <div className="group rose">
        <h4>④ Sessions &amp; recording</h4>
        <p>Hit Record to capture the master output — the full mix, music + matrix together.</p>
        <div className="step"><span className="n">●</span><span>Record uses MediaRecorder on the djBus tap. Stop downloads the file.</span></div>
        <div className="step"><span className="n">☁</span><span>To save mixes to the cloud, use the mobile app at /.</span></div>
        <div className="step"><span className="n">📊</span><span><Link href="/stats" style={{ color: "var(--mint)" }}>Stats</Link> page tallies your library and listening time.</span></div>
      </div>
    </section>
  );
}

function NowPlayingRail({
  deckA,
  deckB,
  crossfader,
  onTogglePlay,
}: {
  deckA: DeckState;
  deckB: DeckState;
  crossfader: number;
  onTogglePlay: (side: "a" | "b") => void;
}) {
  const primary: "a" | "b" = crossfader < 0.5 ? "a" : "b";
  const deck = primary === "a" ? deckA : deckB;
  const accent = primary === "a" ? "var(--mint)" : "var(--violet)";
  const dur = deck.duration > 0 ? deck.duration : 1;

  return (
    <div className="console-rail">
      <div className="row">
        <div className="cover">♪</div>
        <div className="meta">
          <div className="title">{deck.name}</div>
          <div className="sub" style={{ color: accent }}>
            {primary.toUpperCase()} · {deck.bpm ? `${deck.bpm} BPM` : "no BPM"}
          </div>
        </div>
        <div className="grow" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              flex: 1,
              height: 4,
              background: "var(--surface-3)",
              borderRadius: 2,
              position: "relative",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,.5)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(deck.position / dur) * 100}%`,
                background: accent,
                borderRadius: 2,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--fg-4)",
            }}
          >
            {formatTime(deck.position)} / {formatTime(deck.duration)}
          </span>
        </div>
        <div className="tp">
          <button aria-label="Previous">⏮</button>
          <button
            className="play"
            onClick={() => onTogglePlay(primary)}
            aria-label={deck.playing ? "Pause" : "Play"}
          >
            {deck.playing ? "❚❚" : "▶"}
          </button>
          <button aria-label="Next">⏭</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Tweaks panel (simplified)
// ─────────────────────────────────────────────────────────────────────────────

type Ambience = "none" | "glow" | "grid";
type LcdColor = "mint" | "amber" | "ice";

interface Tweaks {
  ambience: Ambience;
  deckCount: 1 | 2;
  showManual: boolean;
  spinSpeed: number;
  lcdColor: LcdColor;
}

const TWEAK_DEFAULTS: Tweaks = {
  ambience: "glow",
  deckCount: 2,
  showManual: true,
  spinSpeed: 6,
  lcdColor: "mint",
};

function TweaksPanel({
  t,
  onChange,
  onClose,
}: {
  t: Tweaks;
  onChange: <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => void;
  onClose: () => void;
}) {
  return (
    <div className="tweaks-panel">
      <div className="twk-section">Look</div>
      <div className="twk-row">
        <span>Background</span>
        <select
          value={t.ambience}
          onChange={(e) => onChange("ambience", e.target.value as Ambience)}
        >
          <option value="none">Pure black</option>
          <option value="glow">Corner glow</option>
          <option value="grid">Faint grid</option>
        </select>
      </div>
      <div className="twk-row">
        <span>LCD</span>
        <select
          value={t.lcdColor}
          onChange={(e) => onChange("lcdColor", e.target.value as LcdColor)}
        >
          <option value="mint">Mint</option>
          <option value="amber">Amber</option>
          <option value="ice">Ice</option>
        </select>
      </div>
      <div className="twk-section">Decks</div>
      <div className="twk-row">
        <span>Decks</span>
        <select
          value={t.deckCount}
          onChange={(e) => onChange("deckCount", Number(e.target.value) as 1 | 2)}
        >
          <option value={1}>A only</option>
          <option value={2}>A + B</option>
        </select>
      </div>
      <div className="twk-row">
        <span>Jog spin · {t.spinSpeed} rpm</span>
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={t.spinSpeed}
          onChange={(e) => onChange("spinSpeed", Number(e.target.value))}
        />
      </div>
      <div className="twk-section">Layout</div>
      <div className="twk-row">
        <span>Show manual</span>
        <input
          type="checkbox"
          checked={t.showManual}
          onChange={(e) => onChange("showManual", e.target.checked)}
        />
      </div>
      <div className="twk-row">
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "6px 8px",
            background: "transparent",
            border: "1px solid var(--hairline)",
            color: "var(--fg-3)",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root page
// ─────────────────────────────────────────────────────────────────────────────

export default function ConsolePage() {
  const [tweaks, setTweaks] = useState<Tweaks>(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [view, setView] = useState("Studio");
  const [crossfader, setCrossfader] = useState(0.5);
  const [activePreset, setActivePreset] = useState<PresetId | null>(null);
  const [matrixRunning, setMatrixRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);

  // Per-deck slot state + audio elements + file inputs.
  const [deckA, setDeckA] = useState<DeckState>(EMPTY_DECK);
  const [deckB, setDeckB] = useState<DeckState>(EMPTY_DECK);
  const [masterGain, setMasterGain] = useState(1);
  // Mix/Drone/Noise knob values 0..1. Mix is matrix-vs-decks balance.
  const [mixBalance, setMixBalance] = useState(0.5);
  const [droneGain, setDroneGainState] = useState(0.18);
  const [noiseGain, setNoiseGainState] = useState(0.12);
  const [listenerCount, setListenerCount] = useState(1);
  // Library picker state.
  const [cloudTracks, setCloudTracks] = useState<CloudTrack[]>([]);
  const [pickerSide, setPickerSide] = useState<"a" | "b" | null>(null);
  // Drag-drop UI state. Tracks which deck the cursor is hovering over so we
  // can route the drop to the correct one (A vs B by left/right half).
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);
  const audioARef = useRef<HTMLAudioElement>(null);
  const audioBRef = useRef<HTMLAudioElement>(null);
  const fileARef = useRef<HTMLInputElement>(null);
  const fileBRef = useRef<HTMLInputElement>(null);

  // Persist tweaks.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("brainmix:console-tweaks");
      if (raw) setTweaks({ ...TWEAK_DEFAULTS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("brainmix:console-tweaks", JSON.stringify(tweaks));
    } catch { /* ignore */ }
  }, [tweaks]);

  // CSS var hooks for spin + LCD color.
  useEffect(() => {
    const r = document.documentElement;
    const dur =
      tweaks.spinSpeed === 0 ? "0s" : `${Math.max(0.5, 18 / tweaks.spinSpeed)}s`;
    r.style.setProperty("--spin-dur", dur);
    const lcd =
      tweaks.lcdColor === "amber"
        ? "#fbbf24"
        : tweaks.lcdColor === "ice"
          ? "#7dd3fc"
          : "var(--mint)";
    r.style.setProperty("--lcd", lcd);
    return () => {
      r.style.removeProperty("--spin-dur");
      r.style.removeProperty("--lcd");
    };
  }, [tweaks.spinSpeed, tweaks.lcdColor]);

  // Recording timer.
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setRecordElapsed((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  // Bind audio elements to djBus once they're available.
  useEffect(() => {
    djBus.ensureContext();
    if (audioARef.current) {
      try { djBus.ensureDeck("A", audioARef.current); } catch { /* already bound */ }
    }
    if (audioBRef.current) {
      try { djBus.ensureDeck("B", audioBRef.current); } catch { /* already bound */ }
    }
  }, []);

  // Apply crossfader to djBus whenever it changes.
  useEffect(() => {
    djBus.setCrossfader(crossfader);
  }, [crossfader]);

  // Apply per-deck LPF / EQ / tempo to djBus + audio element.
  useEffect(() => { djBus.setFilterCutoff("A", deckA.filterHz); }, [deckA.filterHz]);
  useEffect(() => { djBus.setFilterCutoff("B", deckB.filterHz); }, [deckB.filterHz]);
  useEffect(() => { djBus.setEQ("A", "low", deckA.eqLow); }, [deckA.eqLow]);
  useEffect(() => { djBus.setEQ("A", "mid", deckA.eqMid); }, [deckA.eqMid]);
  useEffect(() => { djBus.setEQ("A", "high", deckA.eqHigh); }, [deckA.eqHigh]);
  useEffect(() => { djBus.setEQ("B", "low", deckB.eqLow); }, [deckB.eqLow]);
  useEffect(() => { djBus.setEQ("B", "mid", deckB.eqMid); }, [deckB.eqMid]);
  useEffect(() => { djBus.setEQ("B", "high", deckB.eqHigh); }, [deckB.eqHigh]);
  useEffect(() => {
    if (audioARef.current) {
      audioARef.current.playbackRate = deckA.tempo;
      // preservesPitch isn't on all browsers; ts-ignore the assignment.
      (audioARef.current as unknown as { preservesPitch?: boolean }).preservesPitch = true;
    }
  }, [deckA.tempo]);
  useEffect(() => {
    if (audioBRef.current) {
      audioBRef.current.playbackRate = deckB.tempo;
      (audioBRef.current as unknown as { preservesPitch?: boolean }).preservesPitch = true;
    }
  }, [deckB.tempo]);

  // Master gain → djBus.
  useEffect(() => { djBus.setMasterGain(masterGain); }, [masterGain]);

  // Mix balance: 0 = all matrix, 1 = all decks. Set the matrix layer's input
  // gain inversely — the decks already pass through their own xfade chain.
  useEffect(() => {
    djBus.setMatrixGain(1 - mixBalance);
  }, [mixBalance]);

  // Drone + Noise: live engine setters (no-op when engine isn't running).
  useEffect(() => { setDroneGain(droneGain); }, [droneGain]);
  useEffect(() => { setNoiseGain(noiseGain); }, [noiseGain]);

  // Persist deck metadata + master gain across reloads.
  const CONSOLE_STATE_KEY = "brainmix:console-decks";
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CONSOLE_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        a?: Partial<DeckState>;
        b?: Partial<DeckState>;
        masterGain?: number;
      };
      // Don't restore url / playing — files don't survive reloads.
      const restore = (s: Partial<DeckState>): Partial<DeckState> => ({
        eqLow: s.eqLow,
        eqMid: s.eqMid,
        eqHigh: s.eqHigh,
        filterHz: s.filterHz,
        tempo: s.tempo,
        hotCues: s.hotCues,
      });
      if (saved.a) setDeckA((d) => ({ ...d, ...restore(saved.a!) }));
      if (saved.b) setDeckB((d) => ({ ...d, ...restore(saved.b!) }));
      if (saved.masterGain != null) setMasterGain(saved.masterGain);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        CONSOLE_STATE_KEY,
        JSON.stringify({ a: deckA, b: deckB, masterGain }),
      );
    } catch { /* ignore */ }
  }, [deckA, deckB, masterGain]);

  // Listening-room presence via Supabase Realtime. Each visitor tracks a
  // unique ephemeral key and we count the channel size. No audio relay yet —
  // this is just "who else is here looking at the console".
  useEffect(() => {
    let mounted = true;
    const sb = getSupabaseClient();
    const channel = sb.channel("console-presence", {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channel.on("presence", { event: "sync" }, () => {
      if (!mounted) return;
      const state = channel.presenceState();
      setListenerCount(Object.keys(state).length);
    });
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        channel.track({ at: new Date().toISOString() }).catch(() => {});
      }
    });
    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, []);

  const loadFile = useCallback(
    async (side: "a" | "b", file: File) => {
      const setDeck = side === "a" ? setDeckA : setDeckB;
      const url = URL.createObjectURL(file);
      const el = side === "a" ? audioARef.current : audioBRef.current;
      if (!el) return;
      el.src = url;
      el.currentTime = 0;
      setDeck((cur) => {
        if (cur.url) URL.revokeObjectURL(cur.url);
        return {
          ...cur,
          url,
          name: file.name.replace(/\.[^.]+$/, ""),
          artist: `${(file.size / 1024 / 1024).toFixed(1)} MB · ${file.type || "audio"}`,
          bpm: null,
          position: 0,
          duration: 0,
          playing: false,
          hotCues: [null, null, null, null],
          cloudTrackId: null,
        };
      });
    },
    [],
  );

  // Load a CloudTrack into a deck — downloads the file via Supabase, creates
  // a blob URL, then routes it through the same path as loadFile.
  const loadCloudTrack = useCallback(
    async (side: "a" | "b", track: CloudTrack) => {
      try {
        const blob = await downloadTrack(track.storagePath);
        const url = URL.createObjectURL(blob);
        const el = side === "a" ? audioARef.current : audioBRef.current;
        const setDeck = side === "a" ? setDeckA : setDeckB;
        if (!el) return;
        el.src = url;
        el.currentTime = 0;
        // Restore the 4 hot cues from the cloud row (pad/truncate to exactly 4).
        const restoredCues: (number | null)[] = [null, null, null, null];
        (track.hotCues ?? []).slice(0, 4).forEach((c, i) => {
          if (typeof c === "number") restoredCues[i] = c;
        });
        setDeck((cur) => {
          if (cur.url) URL.revokeObjectURL(cur.url);
          return {
            ...cur,
            url,
            name: track.name,
            artist: track.artist || (track.album ?? "Cloud library"),
            bpm: track.bpm,
            position: 0,
            duration: 0,
            playing: false,
            hotCues: restoredCues,
            cloudTrackId: track.id,
          };
        });
        // Broadcast to other tabs.
        if (side === "a") writeSlots({ trackIdA: track.id });
        else writeSlots({ trackIdB: track.id });
      } catch (e) {
        console.error("loadCloudTrack failed:", e);
      }
    },
    [],
  );

  // Lazy-load the cloud library when the picker first opens.
  useEffect(() => {
    if (pickerSide && cloudTracks.length === 0) {
      listCloudTracks().then(setCloudTracks).catch(() => {});
    }
  }, [pickerSide, cloudTracks.length]);

  // Listen for cross-route slot changes — if /(mobile) starts playing a cloud
  // track, mirror it to deck A here. Best-effort: only when we don't already
  // have something loaded on A.
  useEffect(() => {
    const unsubscribe = subscribeSlots((snap) => {
      if (snap.trackIdA && !deckA.url) {
        // Need the track row to load. Resolve via Supabase.
        (async () => {
          try {
            const all = await listCloudTracks();
            setCloudTracks(all);
            const t = all.find((x) => x.id === snap.trackIdA);
            if (t) loadCloudTrack("a", t);
          } catch { /* ignore */ }
        })();
      }
    });
    // Initial sync on mount.
    const initial = readSlots();
    if (initial?.trackIdA && !deckA.url) {
      (async () => {
        try {
          const all = await listCloudTracks();
          setCloudTracks(all);
          const t = all.find((x) => x.id === initial.trackIdA);
          if (t) loadCloudTrack("a", t);
        } catch { /* ignore */ }
      })();
    }
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = useCallback(async (side: "a" | "b") => {
    const el = side === "a" ? audioARef.current : audioBRef.current;
    const setDeck = side === "a" ? setDeckA : setDeckB;
    if (!el) return;
    djBus.resume();
    if (el.paused) {
      try {
        await el.play();
        setDeck((cur) => ({ ...cur, playing: true }));
      } catch { /* autoplay or load not ready */ }
    } else {
      el.pause();
      setDeck((cur) => ({ ...cur, playing: false }));
    }
  }, []);

  const seekDeck = useCallback((side: "a" | "b", t: number) => {
    const el = side === "a" ? audioARef.current : audioBRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, t);
  }, []);

  const setEq = useCallback(
    (side: "a" | "b", band: "low" | "mid" | "high", db: number) => {
      const setter = side === "a" ? setDeckA : setDeckB;
      setter((d) => ({
        ...d,
        ...(band === "low" ? { eqLow: db } : band === "mid" ? { eqMid: db } : { eqHigh: db }),
      }));
    },
    [],
  );

  const setTempo = useCallback((side: "a" | "b", rate: number) => {
    const setter = side === "a" ? setDeckA : setDeckB;
    setter((d) => ({ ...d, tempo: rate }));
  }, []);

  const setFilter = useCallback((side: "a" | "b", hz: number) => {
    const setter = side === "a" ? setDeckA : setDeckB;
    setter((d) => ({ ...d, filterHz: hz }));
  }, []);

  // Persist cue arrays to Supabase when they change on a cloud-loaded track.
  // Debounce slightly so a flurry of set/clear/set doesn't spam the network.
  useEffect(() => {
    if (!deckA.cloudTrackId) return;
    const id = window.setTimeout(() => {
      updateTrackHotCues(deckA.cloudTrackId!, deckA.hotCues).catch(() => {});
    }, 500);
    return () => window.clearTimeout(id);
  }, [deckA.cloudTrackId, deckA.hotCues]);
  useEffect(() => {
    if (!deckB.cloudTrackId) return;
    const id = window.setTimeout(() => {
      updateTrackHotCues(deckB.cloudTrackId!, deckB.hotCues).catch(() => {});
    }, 500);
    return () => window.clearTimeout(id);
  }, [deckB.cloudTrackId, deckB.hotCues]);

  // Hot cues — store currentTime, jump to it, or clear.
  const setCue = useCallback((side: "a" | "b", idx: number) => {
    const el = side === "a" ? audioARef.current : audioBRef.current;
    if (!el) return;
    const t = el.currentTime;
    const setter = side === "a" ? setDeckA : setDeckB;
    setter((d) => {
      const cues = [...d.hotCues];
      cues[idx] = t;
      return { ...d, hotCues: cues };
    });
  }, []);

  const jumpCue = useCallback((side: "a" | "b", idx: number) => {
    const el = side === "a" ? audioARef.current : audioBRef.current;
    if (!el) return;
    const deck = side === "a" ? deckA : deckB;
    const t = deck.hotCues[idx];
    if (t != null) el.currentTime = t;
  }, [deckA, deckB]);

  const clearCue = useCallback((side: "a" | "b", idx: number) => {
    const setter = side === "a" ? setDeckA : setDeckB;
    setter((d) => {
      const cues = [...d.hotCues];
      cues[idx] = null;
      return { ...d, hotCues: cues };
    });
  }, []);

  // Preset card click: start / smoothly transition / stop.
  const onPreset = useCallback(
    async (id: PresetId) => {
      djBus.ensureContext();
      djBus.resume();
      // Click the active preset to stop.
      if (activePreset === id && matrixRunning) {
        stopEngine();
        setMatrixRunning(false);
        setActivePreset(null);
        return;
      }
      const cfg = presetToEngineConfig(id);
      const ctx = djBus.ensureContext();
      const matrixInput = djBus.matrixInput;
      if (matrixRunning) {
        // Smooth crossfade restart so the swap doesn't click.
        await smoothRestart(cfg, { ctx, destination: matrixInput ?? undefined });
      } else {
        startEngine(cfg, { ctx, destination: matrixInput ?? undefined });
      }
      setActivePreset(id);
      setMatrixRunning(true);
    },
    [activePreset, matrixRunning],
  );

  // Recording via djBus.
  const toggleRecord = useCallback(async () => {
    if (recording) {
      const result = await djBus.stopRecording();
      setRecording(false);
      setRecordElapsed(0);
      if (result) {
        downloadBlob(result.blob, `brainmix-${Date.now()}.${result.extension}`);
      }
    } else {
      djBus.ensureContext();
      djBus.resume();
      const ok = djBus.startRecording();
      if (ok) setRecording(true);
    }
  }, [recording]);

  const ambienceClass = tweaks.ambience !== "none" ? `amb-${tweaks.ambience}` : "";
  const consoleStyle =
    tweaks.deckCount === 1 ? { gridTemplateColumns: "1fr 420px" } : undefined;

  // Convenient handle for the currently-active preset's beatHz for the LCD.
  const presetCfg = activePreset ? PRESETS[activePreset] : null;
  const lcdBeatHz = presetCfg?.params.beatHz ?? 14.0;
  const lcdCarrier = presetCfg?.params.carrierHz ?? 200;
  const lcdGate = presetCfg?.params.bpmSync ?? 0;

  return (
    <div
      className={`console-app ${ambienceClass}`}
      onDragEnter={(e) => {
        if (e.dataTransfer.types?.includes("Files")) {
          e.preventDefault();
          dragCounter.current++;
          setDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.dataTransfer.types?.includes("Files")) {
          e.preventDefault();
          dragCounter.current--;
          if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setDragActive(false);
          }
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types?.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragActive(false);
        const files = Array.from(e.dataTransfer.files ?? []).filter(
          (f) =>
            /^audio\//.test(f.type) ||
            /\.(mp3|m4a|wav|flac|ogg|aac|opus)$/i.test(f.name),
        );
        if (files.length === 0) return;
        // Route by left/right half of the viewport.
        const half = window.innerWidth / 2;
        const targetSide: "a" | "b" = e.clientX < half ? "a" : "b";
        loadFile(targetSide, files[0]);
        // If a second file is dropped at the same time, send it to the other side.
        if (files.length > 1) {
          const other = targetSide === "a" ? "b" : "a";
          loadFile(other, files[1]);
        }
      }}
    >
      {dragActive && (
        <div
          className="pointer-events-none"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            background: "rgba(0, 255, 204, 0.06)",
            border: "2px dashed var(--mint-40)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--mint)",
            fontSize: 20,
          }}
        >
          Drop on the left half → Deck A · right → Deck B
        </div>
      )}
      <ConsoleTopBar view={view} onView={setView} />

      <main className="console" style={consoleStyle}>
        <DeckPanel
          side="a"
          spinning={deckA.playing && tweaks.spinSpeed > 0}
          state={deckA}
          onTogglePlay={() => togglePlay("a")}
          onLoad={() => setPickerSide("a")}
          onSeek={(t) => seekDeck("a", t)}
          onFilter={(hz) => setFilter("a", hz)}
          onEq={(band, db) => setEq("a", band, db)}
          onTempo={(r) => setTempo("a", r)}
          onSetCue={(i) => setCue("a", i)}
          onJumpCue={(i) => jumpCue("a", i)}
          onClearCue={(i) => clearCue("a", i)}
        />
        <MixerColumn
          crossfader={crossfader}
          onCrossfader={setCrossfader}
          activePreset={activePreset}
          matrixRunning={matrixRunning}
          onPreset={onPreset}
          beatHz={lcdBeatHz}
          carrierHz={lcdCarrier}
          bpmSync={lcdGate}
          recording={recording}
          recordElapsed={recordElapsed}
          onToggleRecord={toggleRecord}
          masterGain={masterGain}
          onMasterGain={setMasterGain}
          mixBalance={mixBalance}
          onMixBalance={setMixBalance}
          droneGain={droneGain}
          onDroneGain={setDroneGainState}
          noiseGain={noiseGain}
          onNoiseGain={setNoiseGainState}
          listenerCount={listenerCount}
        />
        {tweaks.deckCount === 2 && (
          <DeckPanel
            side="b"
            spinning={deckB.playing && tweaks.spinSpeed > 0}
            state={deckB}
            onTogglePlay={() => togglePlay("b")}
            onLoad={() => setPickerSide("b")}
            onSeek={(t) => seekDeck("b", t)}
            onFilter={(hz) => setFilter("b", hz)}
            onEq={(band, db) => setEq("b", band, db)}
            onTempo={(r) => setTempo("b", r)}
            onSetCue={(i) => setCue("b", i)}
            onJumpCue={(i) => jumpCue("b", i)}
            onClearCue={(i) => clearCue("b", i)}
          />
        )}
      </main>

      {tweaks.showManual && <Manual />}

      {/* Hidden audio elements (bound via djBus.ensureDeck). */}
      <audio
        ref={audioARef}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) =>
          setDeckA((d) => ({ ...d, duration: e.currentTarget.duration || 0 }))
        }
        onTimeUpdate={(e) =>
          setDeckA((d) => ({ ...d, position: e.currentTarget.currentTime || 0 }))
        }
        onEnded={() => setDeckA((d) => ({ ...d, playing: false }))}
      />
      <audio
        ref={audioBRef}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) =>
          setDeckB((d) => ({ ...d, duration: e.currentTarget.duration || 0 }))
        }
        onTimeUpdate={(e) =>
          setDeckB((d) => ({ ...d, position: e.currentTarget.currentTime || 0 }))
        }
        onEnded={() => setDeckB((d) => ({ ...d, playing: false }))}
      />
      {/* Hidden file inputs */}
      <input
        ref={fileARef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFile("a", f);
          e.target.value = "";
        }}
      />
      <input
        ref={fileBRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFile("b", f);
          e.target.value = "";
        }}
      />

      <NowPlayingRail
        deckA={deckA}
        deckB={deckB}
        crossfader={crossfader}
        onTogglePlay={togglePlay}
      />

      {/* Deck-load picker modal: disk or cloud library. */}
      {pickerSide && (
        <div
          onClick={() => setPickerSide(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--hairline)",
              borderRadius: "var(--r-xl)",
              padding: 18,
              maxWidth: 420,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              color: "var(--fg-1)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: pickerSide === "a" ? "var(--mint)" : "var(--violet)",
                marginBottom: 4,
              }}
            >
              Load into Deck {pickerSide.toUpperCase()}
            </div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: "var(--fg-1)",
                margin: "0 0 14px 0",
              }}
            >
              Pick a source
            </h3>

            <button
              onClick={() => {
                const ref = pickerSide === "a" ? fileARef : fileBRef;
                ref.current?.click();
                setPickerSide(null);
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                marginBottom: 8,
                borderRadius: "var(--r-md)",
                border: "1px solid var(--mint-40)",
                background: "var(--mint-05)",
                color: "var(--mint)",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              📁 From disk (drag-drop also works)
            </button>

            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "var(--fg-4)",
                margin: "14px 0 6px 0",
              }}
            >
              ☁ From cloud library · {cloudTracks.length}
            </div>
            {cloudTracks.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--fg-4)",
                  lineHeight: 1.5,
                }}
              >
                Sign in on the mobile app and import tracks first — they sync
                here automatically.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {cloudTracks.slice(0, 60).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      loadCloudTrack(pickerSide, t);
                      setPickerSide(null);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: "var(--r-sm)",
                      border: "1px solid var(--hairline)",
                      background: "var(--surface-mute)",
                      color: "var(--fg-2)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 13, color: "var(--fg-1)" }}>{t.name}</div>
                    {(t.artist || t.album) && (
                      <div style={{ fontSize: 11, color: "var(--fg-4)" }}>
                        {t.artist}
                        {t.artist && t.album && " · "}
                        {t.album}
                      </div>
                    )}
                    {t.bpm && (
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          color: "var(--fg-5)",
                          marginTop: 2,
                        }}
                      >
                        {t.bpm} BPM
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setPickerSide(null)}
              style={{
                width: "100%",
                marginTop: 14,
                padding: "8px 12px",
                borderRadius: "var(--r-sm)",
                background: "transparent",
                border: "1px solid var(--hairline)",
                color: "var(--fg-4)",
                cursor: "pointer",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        className="tweaks-fab"
        onClick={() => setTweaksOpen((o) => !o)}
        aria-label="Tweaks"
        title="Open Tweaks"
      >
        ✦
      </button>
      {tweaksOpen && (
        <TweaksPanel
          t={tweaks}
          onChange={(k, v) => setTweaks((cur) => ({ ...cur, [k]: v }))}
          onClose={() => setTweaksOpen(false)}
        />
      )}
    </div>
  );
}
