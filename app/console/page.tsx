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
  type EngineConfig,
} from "@/lib/audioEngine";
import { PRESETS, type PresetId } from "@/lib/presets";

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
}

const EMPTY_DECK = (): DeckState => ({
  url: null,
  name: "— empty —",
  artist: "Drop a file or click the deck",
  bpm: null,
  position: 0,
  duration: 0,
  playing: false,
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
  filterHz,
  onTogglePlay,
  onLoad,
  onSeek,
  onFilter,
}: {
  side: "a" | "b";
  spinning: boolean;
  state: DeckState;
  filterHz: number;
  onTogglePlay: () => void;
  onLoad: () => void;
  onSeek: (t: number) => void;
  onFilter: (hz: number) => void;
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
            <span className="v">0.0/0.0/0.0</span>
          </div>
          <div className="eq3">
            <EqBand label="Low" value={0} />
            <EqBand label="Mid" value={0} />
            <EqBand label="High" value={0} />
          </div>
        </div>
        <div className="panel">
          <div className="head">
            <span className="name">LPF · cutoff</span>
            <span className="v">
              {filterHz >= 22000 ? "OPEN" : `${Math.round(filterHz)} Hz`}
            </span>
          </div>
          {/* Draggable LPF bar. Click anywhere to jump cutoff. */}
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
                width: `${Math.min(100, (filterHz / 22050) * 100)}%`,
                background: isA ? "var(--mint)" : "var(--violet)",
                borderRadius: 2,
              }}
            />
          </div>
          <div className="head" style={{ marginTop: 14 }}>
            <span className="name">Loop · 4 bar</span>
            <span className="v">off</span>
          </div>
        </div>
      </div>

      <div className="hot-cues">
        <div className="label">Hot cues · 8 slots · live wiring TBD</div>
        <div className="grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="cell">
              {i + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EqBand({ label, value }: { label: string; value: number }) {
  const isPos = value >= 0;
  const pct = (Math.abs(value) / 15) * 50;
  return (
    <div className="band">
      <div className="name">{label}</div>
      <div className="vert">
        <div
          className="vf"
          style={
            isPos
              ? { bottom: "50%", height: `${pct}%` }
              : { top: "50%", height: `${pct}%` }
          }
        />
        <div
          className="vt"
          style={{ top: `${isPos ? 50 - pct : 50 + pct - 9}%` }}
        />
      </div>
      <div className="val">
        {isPos ? "+" : ""}
        {value.toFixed(1)}
      </div>
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
        <Knob name="Gain" val="0.62" rot={45} />
        <Knob name="Mix" val="50%" rot={-30} />
        <Knob name="Drone" val="0.18" rot={90} />
        <Knob name="Noise" val="brown" rot={-60} />
      </div>

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
  const [filterA, setFilterA] = useState(22050);
  const [filterB, setFilterB] = useState(22050);
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

  // Apply LPF to djBus.
  useEffect(() => {
    djBus.setFilterCutoff("A", filterA);
  }, [filterA]);
  useEffect(() => {
    djBus.setFilterCutoff("B", filterB);
  }, [filterB]);

  const loadFile = useCallback(
    async (side: "a" | "b", file: File) => {
      const setDeck = side === "a" ? setDeckA : setDeckB;
      const url = URL.createObjectURL(file);
      const el = side === "a" ? audioARef.current : audioBRef.current;
      if (!el) return;
      el.src = url;
      el.currentTime = 0;
      setDeck((cur) => {
        // Revoke any previous blob URL.
        if (cur.url) URL.revokeObjectURL(cur.url);
        return {
          url,
          name: file.name.replace(/\.[^.]+$/, ""),
          artist: `${(file.size / 1024 / 1024).toFixed(1)} MB · ${file.type || "audio"}`,
          bpm: null,
          position: 0,
          duration: 0,
          playing: false,
        };
      });
    },
    [],
  );

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

  // Preset card click: start/stop matrix engine.
  const onPreset = useCallback(
    (id: PresetId) => {
      djBus.ensureContext();
      djBus.resume();
      if (activePreset === id && matrixRunning) {
        stopEngine();
        setMatrixRunning(false);
        setActivePreset(null);
        return;
      }
      if (matrixRunning) stopEngine();
      const cfg = presetToEngineConfig(id);
      const ctx = djBus.ensureContext();
      const matrixInput = djBus.matrixInput;
      startEngine(cfg, { ctx, destination: matrixInput ?? undefined });
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
    <div className={`console-app ${ambienceClass}`}>
      <ConsoleTopBar view={view} onView={setView} />

      <main className="console" style={consoleStyle}>
        <DeckPanel
          side="a"
          spinning={deckA.playing && tweaks.spinSpeed > 0}
          state={deckA}
          filterHz={filterA}
          onTogglePlay={() => togglePlay("a")}
          onLoad={() => fileARef.current?.click()}
          onSeek={(t) => seekDeck("a", t)}
          onFilter={setFilterA}
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
        />
        {tweaks.deckCount === 2 && (
          <DeckPanel
            side="b"
            spinning={deckB.playing && tweaks.spinSpeed > 0}
            state={deckB}
            filterHz={filterB}
            onTogglePlay={() => togglePlay("b")}
            onLoad={() => fileBRef.current?.click()}
            onSeek={(t) => seekDeck("b", t)}
            onFilter={setFilterB}
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
