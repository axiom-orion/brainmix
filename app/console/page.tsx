"use client";

/**
 * /console — wide DJ-console preview layout.
 *
 * Ports the BrainMix Design System's ui_kits/web/ JSX into TSX. This is a
 * visual prototype right now: two turntables, sticky mixer column, optional
 * manual panel, sticky now-playing rail. State is local + mocked — actual
 * audio still lives in the mobile-first app at /. A future round can wire
 * these controls to djBus + the real slot/preset state.
 *
 * Best viewed on a desktop (≥1180px). Narrower viewports collapse to a
 * single column.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import "./console.css";

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

interface MockTrack {
  title: string;
  sub: string;
  bpm: number;
  tempo: string;
  key: string;
  cue: string;
  position: number;
  duration: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  filterHz: number;
  loopOn: boolean;
  loopStart: string;
  hotCues: (string | null)[];
}

const TRACK_A: MockTrack = {
  title: "Cumbia Sobre El Mar — Quantic Remix",
  sub: "Quantic & Nidia Góngora · The Curao Sessions",
  bpm: 82,
  tempo: "1.04x",
  key: "F♯m",
  cue: "00:32",
  position: 134,
  duration: 318,
  eqLow: 2.5,
  eqMid: -1.5,
  eqHigh: 3.0,
  filterHz: 22050,
  loopOn: false,
  loopStart: "02:14",
  hotCues: ["00:00", "00:32", "01:04", "02:12", "03:08", null, null, null],
};

const TRACK_B: MockTrack = {
  title: "Frio en el Alma — Bareto Edit",
  sub: "Bareto · Cumbia · 4:32",
  bpm: 94,
  tempo: "0.87x",
  key: "A♭m",
  cue: "00:48",
  position: 48,
  duration: 272,
  eqLow: -2.0,
  eqMid: 0,
  eqHigh: 1.5,
  filterHz: 4200,
  loopOn: true,
  loopStart: "00:48",
  hotCues: ["00:00", "00:48", null, null, null, null, null, null],
};

interface PresetSpec {
  id: string;
  emoji: string;
  name: string;
  hz: string;
}

const PRESETS: PresetSpec[] = [
  { id: "deskflow", emoji: "⚡", name: "Desk Flow", hz: "14 Hz · 80 BPM" },
  { id: "poolside", emoji: "🌴", name: "Poolside", hz: "8 Hz · 85 BPM" },
  { id: "archaic", emoji: "🌑", name: "Archaic", hz: "7 Hz · EMDR" },
  { id: "theta", emoji: "🧘", name: "Theta", hz: "6 Hz · breath" },
  { id: "sleep", emoji: "🌙", name: "Sleep", hz: "2 Hz · delta" },
  { id: "energy", emoji: "🔥", name: "Energy", hz: "18 Hz · 95 BPM" },
];

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
        {/* Brand mark — inline SVG so it renders without an extra request. */}
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
        <button className="pill">Library</button>
        <button className="pill">☁ My Mixes</button>
        <button className="signin">Sign in</button>
      </div>
    </header>
  );
}

function Turntable({ deck, spinning }: { deck: "a" | "b"; spinning: boolean }) {
  return (
    <div className="jog-wrap">
      <div className={"console-jog" + (spinning ? "" : " paused")}>
        <div className="console-hub">{deck.toUpperCase()}</div>
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

function DeckPanel({
  side,
  spinning,
  onTogglePlay,
  track,
}: {
  side: "a" | "b";
  spinning: boolean;
  onTogglePlay: () => void;
  track: MockTrack;
}) {
  const isA = side === "a";
  const accentLabel = isA ? "Deck A · active" : "Deck B · cueing";
  const accentClass = isA ? "act-a" : "act-b";
  const playClass = isA ? "play-a" : "play-b";
  const ticks: number[] = [];
  for (let i = 1; i < 12; i++) ticks.push(i * 8.3);
  const pct = (track.position / track.duration) * 100;

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
          {spinning ? "▶ live" : "❚❚ paused"}
        </span>
      </div>

      <Turntable deck={side} spinning={spinning} />

      <div className="deck-meta">
        <div className="title">{track.title}</div>
        <div className="sub">{track.sub}</div>
      </div>

      <div className="deck-scrub">
        <div className="bar">
          <div className="fill" style={{ width: `${pct}%` }} />
          <div className="ticks">
            {ticks.map((p, i) => (
              <div key={i} className="tk" style={{ left: `${p}%` }} />
            ))}
          </div>
        </div>
        <div className="times">
          <span>{formatTime(track.position)}</span>
          <span>{formatTime(track.duration)}</span>
        </div>
      </div>

      <div className="deck-tp">
        <button className={`btn ${accentClass}`} aria-label="Hot cue prev">⏮</button>
        <button className={`btn ${accentClass}`} aria-label="Cue">⏯</button>
        <button
          className={`btn ${playClass}`}
          onClick={onTogglePlay}
          aria-label={spinning ? "Pause" : "Play"}
        >
          {spinning ? "❚❚" : "▶"}
        </button>
        <button className={`btn ${accentClass}`} aria-label="Loop">↻</button>
        <button className={`btn ${accentClass}`} aria-label="Hot cue next">⏭</button>
      </div>

      <div className="deck-stats">
        <div className="s"><div className="l">BPM</div><div className="v">{track.bpm}</div></div>
        <div className="s"><div className="l">Tempo</div><div className="v">{track.tempo}</div></div>
        <div className="s"><div className="l">Key</div><div className="v">{track.key}</div></div>
        <div className="s"><div className="l">Cue</div><div className="v">{track.cue}</div></div>
      </div>

      <div className="deck-eq">
        <div className="panel">
          <div className="head">
            <span className="name">EQ · 3-band</span>
            <span className="v">
              {track.eqLow > 0 ? "+" : ""}{track.eqLow.toFixed(1)}/
              {track.eqMid > 0 ? "+" : ""}{track.eqMid.toFixed(1)}/
              {track.eqHigh > 0 ? "+" : ""}{track.eqHigh.toFixed(1)}
            </span>
          </div>
          <div className="eq3">
            <EqBand label="Low" value={track.eqLow} />
            <EqBand label="Mid" value={track.eqMid} />
            <EqBand label="High" value={track.eqHigh} />
          </div>
        </div>
        <div className="panel">
          <div className="head">
            <span className="name">LPF · cutoff</span>
            <span className="v">
              {track.filterHz >= 22000 ? "OPEN" : `${track.filterHz} Hz`}
            </span>
          </div>
          <div
            style={{
              height: 4,
              background: "var(--surface-3)",
              borderRadius: 2,
              marginTop: 2,
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
                width: `${Math.min(100, (track.filterHz / 22050) * 100)}%`,
                background: isA ? "var(--mint)" : "var(--violet)",
                borderRadius: 2,
              }}
            />
          </div>
          <div className="head" style={{ marginTop: 14 }}>
            <span className="name">Loop · 4 bar</span>
            <span className="v">
              {track.loopOn ? `ON @ ${track.loopStart}` : "off"}
            </span>
          </div>
        </div>
      </div>

      <div className="hot-cues">
        <div className="label">Hot cues · 8 slots · tap empty to set, tap set to jump</div>
        <div className="grid">
          {track.hotCues.map((c, i) => (
            <div key={i} className={"cell" + (c ? " set" : "")}>
              {c || i + 1}
            </div>
          ))}
        </div>
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
  activePreset: string;
  onPreset: (id: string) => void;
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
              <>gate <span className="v">off</span></>
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
        <div className="label">Brainwave preset · 6 options</div>
        <div className="grid">
          {PRESETS.map((p) => (
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
          Two independent decks. Load any file you own — MP3, M4A, WAV, FLAC, OGG.
          Stays on your device until you sign in.
        </p>
        <div className="step"><span className="n">A</span><span>Mint deck. Primary playback. Synced to the matrix BPM gate.</span></div>
        <div className="step"><span className="n">B</span><span>Violet deck. Beat-matched to A. Use for transitions, layering, mashups.</span></div>
        <div className="step"><span className="n">▶</span><span>Big play button starts the platter; the jog wheel spins. ❚❚ pauses.</span></div>
        <div className="step"><span className="n">⏯</span><span>Cue: jump to the last hot cue, hold to preview.</span></div>
        <div className="step"><span className="n">↻</span><span>Loop: re-trigger the current 4-bar segment from the in-point.</span></div>
      </div>

      <div className="group violet">
        <h4>② The mixer column</h4>
        <p>Everything that mixes the two decks together — and the brain-state layer too.</p>
        <div className="step"><span className="n">▮</span><span>Crossfader. Equal-power curve. Drag to mix A → B. Auto x-fade at 6s.</span></div>
        <div className="step"><span className="n">◯</span><span>Gain · Mix · Drone · Noise. Four master rotaries.</span></div>
        <div className="step"><span className="n">3-band</span><span>Per-deck low / mid / high cuts in dB. Double-click a band to zero it.</span></div>
        <div className="step"><span className="n">LPF</span><span>Low-pass filter sweep. Click &quot;OPEN&quot; to bypass entirely.</span></div>
        <div className="step"><span className="n">8 cue</span><span>Hot cues per deck. Tap empty to set, tap set to jump, × clears.</span></div>
      </div>

      <div className="group">
        <h4>③ The brain matrix</h4>
        <p>
          Layered binaural / isochronic tones that ride underneath the music. Six
          presets, one active at a time. Evidence-graded.
        </p>
        <div className="step"><span className="n">⚡</span><span><b>Desk Flow.</b> 40 Hz gamma boost · 14 Hz beat · 80 BPM gate. Strong evidence (MIT Tsai lab).</span></div>
        <div className="step"><span className="n">🌴</span><span><b>Poolside.</b> 8 Hz alpha · 85 BPM. Mixed evidence.</span></div>
        <div className="step"><span className="n">🌑</span><span><b>Archaic.</b> 110 Hz sub-bass · 7 Hz pulse · EMDR pan. Mixed evidence.</span></div>
        <div className="step"><span className="n">🔥</span><span><b>Energy.</b> 18 Hz mid-beta · 95 BPM. Vibes only — admitted.</span></div>
      </div>

      <div className="group rose">
        <h4>④ Sessions &amp; recording</h4>
        <p>Run a Pomodoro plan that auto-swaps presets at intervals. Record everything you mix.</p>
        <div className="step"><span className="n">●</span><span>Hit Record to capture the master output as you mix. Stop saves it locally.</span></div>
        <div className="step"><span className="n">☁</span><span>Sign in to save mixes to the cloud and get a public share URL.</span></div>
        <div className="step"><span className="n">⌚</span><span>Sequencer: stack Focus / Rest steps, walk a plan automatically.</span></div>
        <div className="step"><span className="n">🩺</span><span>The Engineer panel surfaces tips: &quot;mid clipping on A&quot;, &quot;try a 4-bar loop at 02:14&quot;.</span></div>
      </div>
    </section>
  );
}

function NowPlayingRail({
  trackA,
  trackB,
  crossfader,
  playingA,
  playingB,
  onTogglePlay,
}: {
  trackA: MockTrack;
  trackB: MockTrack;
  crossfader: number;
  playingA: boolean;
  playingB: boolean;
  onTogglePlay: (side: "a" | "b") => void;
}) {
  const primary: "a" | "b" = crossfader < 0.5 ? "a" : "b";
  const track = primary === "a" ? trackA : trackB;
  const playing = primary === "a" ? playingA : playingB;
  const accent = primary === "a" ? "var(--mint)" : "var(--violet)";

  return (
    <div className="console-rail">
      <div className="row">
        <div className="cover">♪</div>
        <div className="meta">
          <div className="title">{track.title}</div>
          <div className="sub" style={{ color: accent }}>
            {primary.toUpperCase()} · {track.bpm} BPM · {track.tempo}
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
                width: `${(track.position / track.duration) * 100}%`,
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
            {formatTime(track.position)} / {formatTime(track.duration)}
          </span>
        </div>
        <div className="tp">
          <button aria-label="Previous">⏮</button>
          <button
            className="play"
            onClick={() => onTogglePlay(primary)}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button aria-label="Next">⏭</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Tweaks panel (simplified — no host protocol)
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
  const [crossfader, setCrossfader] = useState(0.42);
  const [activePreset, setActivePreset] = useState("deskflow");
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [playingA, setPlayingA] = useState(true);
  const [playingB, setPlayingB] = useState(false);

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

  // Apply spin speed + LCD color as CSS variables on document root.
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

  // Recording timer tick.
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setRecordElapsed((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  const togglePlay = (side: "a" | "b") => {
    if (side === "a") setPlayingA((v) => !v);
    else setPlayingB((v) => !v);
  };

  const ambienceClass = tweaks.ambience !== "none" ? `amb-${tweaks.ambience}` : "";
  const consoleStyle =
    tweaks.deckCount === 1 ? { gridTemplateColumns: "1fr 420px" } : undefined;

  return (
    <div className={`console-app ${ambienceClass}`}>
      <ConsoleTopBar view={view} onView={setView} />

      <main className="console" style={consoleStyle}>
        <DeckPanel
          side="a"
          spinning={playingA && tweaks.spinSpeed > 0}
          onTogglePlay={() => togglePlay("a")}
          track={TRACK_A}
        />
        <MixerColumn
          crossfader={crossfader}
          onCrossfader={setCrossfader}
          activePreset={activePreset}
          onPreset={setActivePreset}
          beatHz={14.0}
          carrierHz={200}
          bpmSync={80}
          recording={recording}
          recordElapsed={recordElapsed}
          onToggleRecord={() => {
            setRecording((r) => !r);
            if (recording) setRecordElapsed(0);
          }}
        />
        {tweaks.deckCount === 2 && (
          <DeckPanel
            side="b"
            spinning={playingB && tweaks.spinSpeed > 0}
            onTogglePlay={() => togglePlay("b")}
            track={TRACK_B}
          />
        )}
      </main>

      {tweaks.showManual && <Manual />}

      <NowPlayingRail
        trackA={TRACK_A}
        trackB={TRACK_B}
        crossfader={crossfader}
        playingA={playingA}
        playingB={playingB}
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
