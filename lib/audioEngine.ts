/**
 * BrainMix Audio Engine (v2)
 *
 * Layered Web Audio entrainment engine. No external deps. Browser only.
 *
 * Layers (any subset can be active):
 *   1. Entrainment   - binaural (headphones) OR isochronic (speakers) at a target Hz
 *   2. Gamma boost   - optional 40 Hz isochronic layer for cognition
 *   3. BPM gate      - off-beat amplitude gating that syncs the gamma layer to your music's tempo
 *   4. Drone         - sustained pad of pure-fifth + octave intervals (low anxiety)
 *   5. Noise         - brown or pink, lowpass-shaped
 *   6. Breath pacer  - 0.1 Hz LFO modulating drone amplitude (~6 breaths/min)
 *   7. EMDR panning  - 0.5 Hz bilateral L/R sweep for hemisphere cross-communication
 *
 * Volumes are tuned for "just above ambient" - the entrainment literature is
 * pretty clear that loud carriers keep cortex aroused and defeat the purpose.
 *
 * Honest framing: 40 Hz gamma has strong evidence (Tsai lab, MIT, Nature 2016+).
 * 528 Hz / 432 Hz / 110 Hz tunings are mostly subjective. They might feel good
 * (vibes are real), but don't believe the "DNA repair" or "cosmic frequency" mythology.
 */

export type NoiseColor = "brown" | "pink" | "off";
export type EntrainmentMode = "binaural" | "isochronic" | "off";
export type LFOShape = "sine" | "square";

export interface PresetParams {
  /** Audible base tone for the entrainment layer (Hz). */
  carrierHz: number;
  /** Target brainwave frequency (Hz). 2 = delta, 6 = theta, 10 = alpha, 14 = low beta, 40 = gamma. */
  beatHz: number;
  /** Drone fundamental (Hz). Pick a low, calm note - A2 = 110, G2 = 98, F2 = 87. */
  droneHz: number;
  /** Noise color and gain. */
  noise: NoiseColor;
  noiseGain: number;
  /** Drone amplitude (0..1). */
  droneGain: number;
  /** Layer master gains (0..1). */
  entrainmentGain: number;
  /** Add a 40 Hz gamma layer on top (the MIT Tsai protocol). */
  gammaBoost: boolean;
  /** LFO shape for isochronic - square = sharper entrainment, sine = subtler. */
  lfoShape: LFOShape;
  /** Optional BPM for off-beat gating of the gamma layer. 0 = off. */
  bpmSync: number;
}

export interface EngineConfig extends PresetParams {
  mode: EntrainmentMode;
  masterGain: number;
  /** Slow LFO breathing modulation on drone (0.1 Hz). Helps vagal tone. */
  breathPacer: boolean;
  /** 0.5 Hz bilateral L/R sweep on the drone layer. Headphones only. */
  emdrPan: boolean;
}

interface ActiveNodes {
  ctx: AudioContext;
  master: GainNode;
  /** True when ctx was supplied externally (e.g. by DJBus) - do not close on stop. */
  externalCtx: boolean;
  /** Snapshot of the config the engine was started with. Mutated by live setters. */
  config?: EngineConfig;
  // Entrainment - binaural
  binauralL?: OscillatorNode;
  binauralR?: OscillatorNode;
  // Entrainment - isochronic
  isoCarrier?: OscillatorNode;
  isoLfo?: OscillatorNode;
  isoLfoGain?: GainNode;
  isoGate?: GainNode;
  // Gamma layer
  gammaCarrier?: OscillatorNode;
  gammaLfo?: OscillatorNode;
  gammaLfoGain?: GainNode;
  gammaGate?: GainNode;
  gammaBpmLfo?: OscillatorNode;
  gammaBpmLfoGain?: GainNode;
  // Drone
  droneOscs: OscillatorNode[];
  droneGain?: GainNode;
  breathLfo?: OscillatorNode;
  breathLfoGain?: GainNode;
  emdrPanner?: StereoPannerNode;
  emdrLfo?: OscillatorNode;
  emdrLfoGain?: GainNode;
  // Noise
  noiseSource?: AudioBufferSourceNode;
  noiseFilter?: BiquadFilterNode;
  noiseGain?: GainNode;
}

let active: ActiveNodes | null = null;

const RAMP = 0.4; // seconds for graceful starts/stops

function makeNoiseBuffer(
  ctx: AudioContext,
  color: NoiseColor,
  seconds = 10,
): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);

  if (color === "brown") {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  } else if (color === "pink") {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }
  return buf;
}

function startEntrainment(
  ctx: AudioContext,
  bus: GainNode,
  cfg: EngineConfig,
  nodes: ActiveNodes,
) {
  if (cfg.mode === "off") return;
  const entrainBus = ctx.createGain();
  entrainBus.gain.value = 0;
  entrainBus.gain.linearRampToValueAtTime(
    cfg.entrainmentGain,
    ctx.currentTime + RAMP,
  );
  entrainBus.connect(bus);

  if (cfg.mode === "binaural") {
    const left = ctx.createOscillator();
    const right = ctx.createOscillator();
    left.type = "sine";
    right.type = "sine";
    left.frequency.value = cfg.carrierHz;
    right.frequency.value = cfg.carrierHz + cfg.beatHz;

    const lPan = ctx.createStereoPanner();
    const rPan = ctx.createStereoPanner();
    lPan.pan.value = -1;
    rPan.pan.value = 1;

    left.connect(lPan).connect(entrainBus);
    right.connect(rPan).connect(entrainBus);
    left.start();
    right.start();

    nodes.binauralL = left;
    nodes.binauralR = right;
  } else {
    // Isochronic: audible carrier is sine; the LFO gates its amplitude at beatHz.
    // This is the right way - the carrier never goes square.
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = cfg.carrierHz;

    const gate = ctx.createGain();
    gate.gain.value = 0.5;

    const lfo = ctx.createOscillator();
    lfo.type = cfg.lfoShape; // square = sharper attacks = stronger entrainment
    lfo.frequency.value = cfg.beatHz;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;

    lfo.connect(lfoGain).connect(gate.gain);
    carrier.connect(gate).connect(entrainBus);

    carrier.start();
    lfo.start();

    nodes.isoCarrier = carrier;
    nodes.isoLfo = lfo;
    nodes.isoLfoGain = lfoGain;
    nodes.isoGate = gate;
  }
}

function startGammaBoost(
  ctx: AudioContext,
  bus: GainNode,
  cfg: EngineConfig,
  nodes: ActiveNodes,
) {
  // 40 Hz isochronic at a high carrier (1 kHz) - the MIT GENUS-style stimulus.
  // Quietly layered so it doesn't dominate.
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = 1000;

  const gate = ctx.createGain();
  gate.gain.value = 0;

  const lfo = ctx.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 40;

  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.04;

  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(0.05, ctx.currentTime + RAMP);

  lfo.connect(lfoGain).connect(gate.gain);
  carrier.connect(gate).connect(out);

  // Optional BPM-synced amplitude modulation - hides the gamma flutter in the
  // off-beats of reggae/dub at 80 BPM, etc.
  if (cfg.bpmSync > 0) {
    const beatsPerSec = cfg.bpmSync / 60;
    const bpmLfo = ctx.createOscillator();
    bpmLfo.type = "sine";
    // 2x beatsPerSec gives us an 8th-note pulse for that reggae one-drop off-beat
    bpmLfo.frequency.value = beatsPerSec * 2;
    const bpmLfoGain = ctx.createGain();
    bpmLfoGain.gain.value = 0.5;
    bpmLfo.connect(bpmLfoGain).connect(out.gain);
    bpmLfo.start();
    nodes.gammaBpmLfo = bpmLfo;
    nodes.gammaBpmLfoGain = bpmLfoGain;
  }

  out.connect(bus);

  carrier.start();
  lfo.start();

  nodes.gammaCarrier = carrier;
  nodes.gammaLfo = lfo;
  nodes.gammaLfoGain = lfoGain;
  nodes.gammaGate = out;
}

function startDrone(
  ctx: AudioContext,
  bus: GainNode,
  cfg: EngineConfig,
  nodes: ActiveNodes,
) {
  if (cfg.droneGain <= 0) return;

  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(cfg.droneGain, ctx.currentTime + RAMP);

  // Optional EMDR bilateral pan. Routes drone through a stereo panner that
  // sweeps 0.5 Hz. Without EMDR, route drone direct to the bus.
  if (cfg.emdrPan) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.9;
    lfo.connect(lfoGain).connect(panner.pan);
    out.connect(panner).connect(bus);
    lfo.start();
    nodes.emdrPanner = panner;
    nodes.emdrLfo = lfo;
    nodes.emdrLfoGain = lfoGain;
  } else {
    out.connect(bus);
  }

  const partials: { ratio: number; type: OscillatorType; gain: number; detune: number }[] = [
    { ratio: 1, type: "sine", gain: 0.7, detune: -3 },
    { ratio: 1, type: "triangle", gain: 0.25, detune: +4 },
    { ratio: 1.5, type: "sine", gain: 0.35, detune: -2 },
    { ratio: 2, type: "sine", gain: 0.18, detune: +6 },
  ];

  for (const p of partials) {
    const osc = ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.value = cfg.droneHz * p.ratio;
    osc.detune.value = p.detune;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    osc.connect(g).connect(out);
    osc.start();
    nodes.droneOscs.push(osc);
  }

  nodes.droneGain = out;

  if (cfg.breathPacer) {
    // 0.1 Hz = 6 breaths/min, resonant breathing frequency for HRV/vagal tone.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.1;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cfg.droneGain * 0.4;
    lfo.connect(lfoGain).connect(out.gain);
    lfo.start();
    nodes.breathLfo = lfo;
    nodes.breathLfoGain = lfoGain;
  }
}

function startNoise(
  ctx: AudioContext,
  bus: GainNode,
  cfg: EngineConfig,
  nodes: ActiveNodes,
) {
  if (cfg.noise === "off" || cfg.noiseGain <= 0) return;
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, cfg.noise, 10);
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cfg.noise === "brown" ? 1200 : 2400;
  filter.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(cfg.noiseGain, ctx.currentTime + RAMP);

  src.connect(filter).connect(g).connect(bus);
  src.start();

  nodes.noiseSource = src;
  nodes.noiseFilter = filter;
  nodes.noiseGain = g;
}

export interface StartOptions {
  /** Optional external AudioContext (e.g. shared DJ bus). If provided, the
   * engine won't close it on stop. */
  ctx?: AudioContext;
  /** Where the matrix master routes. Defaults to ctx.destination. */
  destination?: AudioNode;
}

export function start(cfg: EngineConfig, opts?: StartOptions) {
  if (active) stop();

  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = opts?.ctx ?? new Ctor();
  const externalCtx = !!opts?.ctx;
  if (ctx.state === "suspended") ctx.resume();

  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(cfg.masterGain, ctx.currentTime + RAMP);
  master.connect(opts?.destination ?? ctx.destination);

  const nodes: ActiveNodes = { ctx, master, externalCtx, droneOscs: [], config: { ...cfg } };

  startEntrainment(ctx, master, cfg, nodes);
  if (cfg.gammaBoost) startGammaBoost(ctx, master, cfg, nodes);
  startDrone(ctx, master, cfg, nodes);
  startNoise(ctx, master, cfg, nodes);

  active = nodes;
}

export function setMasterGain(gain: number) {
  if (!active) return;
  const { ctx, master } = active;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.15);
}

/** Live setter for the drone layer's amplitude. No-op when engine isn't running. */
export function setDroneGain(gain: number) {
  if (!active || !active.droneGain) return;
  const t = active.ctx.currentTime;
  active.droneGain.gain.cancelScheduledValues(t);
  active.droneGain.gain.linearRampToValueAtTime(Math.max(0, gain), t + 0.15);
}

/** Live setter for the noise-layer amplitude. No-op when engine isn't running. */
export function setNoiseGain(gain: number) {
  if (!active || !active.noiseGain) return;
  const t = active.ctx.currentTime;
  active.noiseGain.gain.cancelScheduledValues(t);
  active.noiseGain.gain.linearRampToValueAtTime(Math.max(0, gain), t + 0.15);
}

/** Returns whether the matrix engine is currently running. */
export function isRunning(): boolean {
  return active !== null;
}

/** Returns the active engine config (shallow copy) or null. */
export function currentConfig(): EngineConfig | null {
  return active?.config ? { ...active.config } : null;
}

/**
 * Live setter for the entrainment beat frequency.
 * Smoothly ramps the relevant oscillators / LFOs to the new rate.
 */
export function setBeatHz(hz: number) {
  if (!active) return;
  const { ctx } = active;
  const t = ctx.currentTime;
  // Binaural: shift the right ear by ±beatHz from carrier.
  if (active.binauralL && active.binauralR && active.config) {
    active.binauralR.frequency.cancelScheduledValues(t);
    active.binauralR.frequency.linearRampToValueAtTime(
      active.config.carrierHz + hz,
      t + 0.15,
    );
  }
  // Isochronic: the gating LFO runs at beatHz.
  if (active.isoLfo) {
    active.isoLfo.frequency.cancelScheduledValues(t);
    active.isoLfo.frequency.linearRampToValueAtTime(hz, t + 0.15);
  }
  if (active.config) active.config.beatHz = hz;
}

/**
 * Live setter for the audible carrier frequency. Drift smoothly so the
 * pitch change doesn't click.
 */
export function setCarrierHz(hz: number) {
  if (!active) return;
  const { ctx } = active;
  const t = ctx.currentTime;
  if (active.binauralL) {
    active.binauralL.frequency.cancelScheduledValues(t);
    active.binauralL.frequency.linearRampToValueAtTime(hz, t + 0.15);
  }
  if (active.binauralR && active.config) {
    active.binauralR.frequency.cancelScheduledValues(t);
    active.binauralR.frequency.linearRampToValueAtTime(
      hz + active.config.beatHz,
      t + 0.15,
    );
  }
  if (active.isoCarrier) {
    active.isoCarrier.frequency.cancelScheduledValues(t);
    active.isoCarrier.frequency.linearRampToValueAtTime(hz, t + 0.15);
  }
  if (active.config) active.config.carrierHz = hz;
}

/**
 * Live setter for the gamma-boost layer. Creates/destroys the 40 Hz
 * isochronic stack on the fly. Smooth: fades the out-going stack to zero
 * before destroying, ramps the new stack up.
 */
export function setGammaBoost(on: boolean) {
  if (!active || !active.config) return;
  const ctx = active.ctx;
  const t = ctx.currentTime;

  if (on && !active.gammaGate) {
    // Spin up.
    startGammaBoost(ctx, active.master, active.config, active);
    active.config.gammaBoost = true;
  } else if (!on && active.gammaGate) {
    // Ramp down, then disconnect.
    const out = active.gammaGate;
    out.gain.cancelScheduledValues(t);
    out.gain.linearRampToValueAtTime(0, t + 0.25);
    const { gammaCarrier, gammaLfo, gammaBpmLfo } = active;
    window.setTimeout(() => {
      try { gammaCarrier?.stop(); gammaCarrier?.disconnect(); } catch {}
      try { gammaLfo?.stop(); gammaLfo?.disconnect(); } catch {}
      try { gammaBpmLfo?.stop(); gammaBpmLfo?.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    }, 280);
    active.gammaCarrier = undefined;
    active.gammaLfo = undefined;
    active.gammaLfoGain = undefined;
    active.gammaGate = undefined;
    active.gammaBpmLfo = undefined;
    active.gammaBpmLfoGain = undefined;
    active.config.gammaBoost = false;
  }
}

/**
 * Live setter for BPM gating on the gamma layer. Attaches or detaches the
 * BPM-synced amplitude LFO without restarting the whole gamma stack.
 */
export function setBpmSync(bpm: number) {
  if (!active || !active.config) return;
  const ctx = active.ctx;
  const t = ctx.currentTime;

  if (active.gammaBpmLfo && active.gammaBpmLfoGain) {
    if (bpm > 0) {
      // Just retune the LFO to the new BPM.
      const beatsPerSec = bpm / 60;
      active.gammaBpmLfo.frequency.cancelScheduledValues(t);
      active.gammaBpmLfo.frequency.linearRampToValueAtTime(beatsPerSec * 2, t + 0.1);
    } else {
      // Tear down — disconnect the LFO from out.gain.
      try { active.gammaBpmLfo.stop(); active.gammaBpmLfo.disconnect(); } catch {}
      try { active.gammaBpmLfoGain.disconnect(); } catch {}
      active.gammaBpmLfo = undefined;
      active.gammaBpmLfoGain = undefined;
    }
  } else if (bpm > 0 && active.gammaGate) {
    // Spin up a fresh BPM LFO if we don't have one but gamma is running.
    const beatsPerSec = bpm / 60;
    const bpmLfo = ctx.createOscillator();
    bpmLfo.type = "sine";
    bpmLfo.frequency.value = beatsPerSec * 2;
    const bpmLfoGain = ctx.createGain();
    bpmLfoGain.gain.value = 0.5;
    bpmLfo.connect(bpmLfoGain).connect(active.gammaGate.gain);
    bpmLfo.start();
    active.gammaBpmLfo = bpmLfo;
    active.gammaBpmLfoGain = bpmLfoGain;
  }

  active.config.bpmSync = bpm;
}

/**
 * Smooth restart: fade-out the existing engine, swap to a new config, fade in.
 * Use when changes can't be applied live (mode swap, gammaBoost toggle,
 * bpmSync change — all require oscillator topology changes).
 */
export async function smoothRestart(cfg: EngineConfig, opts?: StartOptions) {
  if (!active) {
    start(cfg, opts);
    return;
  }
  // Fade the current master to 0 over a short ramp.
  const { ctx, master } = active;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.linearRampToValueAtTime(0, t + 0.3);
  // Wait for the fade, then stop + start fresh.
  await new Promise((r) => setTimeout(r, 320));
  stop();
  start(cfg, opts);
}

/**
 * Play a synthesized 432 Hz singing-bowl bell as a state-transition cue.
 * Used by the Pomodoro timer between focus/rest blocks.
 */
export function playBell(durationSec = 6) {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);

  // Singing bowls are inharmonic - stack a few partials at irrational ratios.
  const partials = [
    { hz: 432, gain: 0.5, decay: 0.55 },
    { hz: 432 * 2.76, gain: 0.25, decay: 1.1 },
    { hz: 432 * 5.4, gain: 0.12, decay: 1.6 },
  ];

  const now = ctx.currentTime;
  for (const p of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = p.hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(p.gain, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay * durationSec);
    osc.connect(g).connect(out);
    osc.start(now);
    osc.stop(now + durationSec + 0.5);
  }

  out.gain.linearRampToValueAtTime(0.8, now + 0.05);

  setTimeout(() => {
    try { ctx.close(); } catch { /* noop */ }
  }, (durationSec + 1) * 1000);
}

export function stop() {
  if (!active) return;
  const { ctx, master } = active;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.linearRampToValueAtTime(0, t + RAMP);

  const stopAt = t + RAMP + 0.05;
  const oscs = [
    active.binauralL,
    active.binauralR,
    active.isoCarrier,
    active.isoLfo,
    active.gammaCarrier,
    active.gammaLfo,
    active.gammaBpmLfo,
    active.breathLfo,
    active.emdrLfo,
    ...active.droneOscs,
  ].filter(Boolean) as OscillatorNode[];
  for (const o of oscs) {
    try { o.stop(stopAt); } catch { /* already stopped */ }
  }
  if (active.noiseSource) {
    try { active.noiseSource.stop(stopAt); } catch { /* noop */ }
  }
  const externalCtx = active.externalCtx;
  setTimeout(() => {
    if (!externalCtx) {
      try { ctx.close(); } catch { /* noop */ }
    }
  }, (RAMP + 0.2) * 1000);

  active = null;
}

export function isPlaying() {
  return active !== null;
}
