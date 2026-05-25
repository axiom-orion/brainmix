/**
 * DJBus - the shared audio bus.
 *
 * All sound (matrix + decks A/B) flows through here. That means the recording
 * tap can capture EVERYTHING the user hears, which is what makes a 90-min
 * live-recorded mix possible.
 *
 * Graph:
 *   matrix engine    ───┐
 *   deck A: src→EQ→filt→vol→xfade ──┐
 *   deck B: src→EQ→filt→vol→xfade ──┼─→ master ─→ destination (speakers)
 *                                   │           └─→ recordTap (MediaStream)
 *
 * Equal-power crossfade: at center, both decks at √2/2 ≈ 0.707 so the
 * combined RMS stays constant. DJ-standard, sounds natural through the move.
 */

import type { SlotId } from "./songSlots";

export interface DeckChain {
  source: MediaElementAudioSourceNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  filter: BiquadFilterNode;
  volume: GainNode;
  xfade: GainNode;
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  extension: string;
  durationMs: number;
}

function pickMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === "undefined") return { mimeType: "", extension: "webm" };
  const candidates: { mimeType: string; extension: string }[] = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4;codecs=mp4a.40.2", extension: "m4a" },
    { mimeType: "audio/mp4", extension: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "", extension: "webm" };
}

interface PlayerChannel {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

/** Two-deck variant used by the music player's auto-crossfade. */
interface PlayerPair {
  a: PlayerChannel;
  b: PlayerChannel;
}

class DJBus {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  matrixInput: GainNode | null = null;
  recordTap: MediaStreamAudioDestinationNode | null = null;
  decks: Map<SlotId, DeckChain> = new Map();
  player: PlayerChannel | null = null;
  playerPair: PlayerPair | null = null;
  crossfader = 0.5;

  private recorder: MediaRecorder | null = null;
  private recordChunks: Blob[] = [];
  private recordStartedAt = 0;
  private recordMime: { mimeType: string; extension: string } = { mimeType: "", extension: "webm" };

  ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.recordTap = this.ctx.createMediaStreamDestination();
    this.matrixInput = this.ctx.createGain();
    this.matrixInput.gain.value = 1;

    this.master.connect(this.ctx.destination);
    this.master.connect(this.recordTap);
    this.matrixInput.connect(this.master);
    return this.ctx;
  }

  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  /**
   * Bind an HTMLAudioElement to a deck chain. Idempotent per element -
   * MediaElementAudioSourceNode can only be created once per element, so we
   * track decks by slot id and refuse to recreate.
   */
  ensureDeck(slotId: SlotId, audio: HTMLAudioElement): DeckChain {
    const ctx = this.ensureContext();
    const existing = this.decks.get(slotId);
    if (existing) return existing;

    const source = ctx.createMediaElementSource(audio);

    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 250;
    low.gain.value = 0;

    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 1;
    mid.gain.value = 0;

    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 4000;
    high.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 22050; // wide open
    filter.Q.value = 0.7;

    const volume = ctx.createGain();
    volume.gain.value = 1;

    const xfade = ctx.createGain();
    // Equal-power curve at the default 0.5 crossfader position.
    const initialGain =
      slotId === "A"
        ? Math.cos((this.crossfader * Math.PI) / 2)
        : Math.sin((this.crossfader * Math.PI) / 2);
    xfade.gain.value = initialGain;

    source
      .connect(low)
      .connect(mid)
      .connect(high)
      .connect(filter)
      .connect(volume)
      .connect(xfade)
      .connect(this.master!);

    const chain: DeckChain = { source, low, mid, high, filter, volume, xfade };
    this.decks.set(slotId, chain);
    return chain;
  }

  /**
   * Dedicated music-player channel: simple gain → master.
   * Used by the standalone NowPlaying widget so playback routes through the
   * bus (matrix layers under it, recording captures it).
   */
  ensurePlayer(audio: HTMLAudioElement): PlayerChannel {
    const ctx = this.ensureContext();
    if (this.player) return this.player;
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain).connect(this.master!);
    this.player = { source, gain };
    return this.player;
  }

  setPlayerGain(v: number) {
    if (!this.player || !this.ctx) return;
    this.player.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /**
   * Music-player auto-crossfade pair: two audio elements, each with its own
   * gain, both → master. The page alternates between them and ramps gains
   * to overlap one track ending with the next starting.
   */
  ensurePlayerPair(audioA: HTMLAudioElement, audioB: HTMLAudioElement): PlayerPair {
    const ctx = this.ensureContext();
    if (this.playerPair) return this.playerPair;
    const make = (audio: HTMLAudioElement): PlayerChannel => {
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(this.master!);
      return { source, gain };
    };
    this.playerPair = { a: make(audioA), b: make(audioB) };
    // The first deck starts at full gain so the very first play isn't silent.
    this.playerPair.a.gain.gain.value = 1;
    return this.playerPair;
  }

  /**
   * Smooth equal-power crossfade between the two player decks over `seconds`.
   * Pass which deck the audio is fading INTO (the one that should end at 1.0).
   */
  crossfadePlayer(toDeck: "a" | "b", seconds: number) {
    if (!this.playerPair || !this.ctx) return;
    const now = this.ctx.currentTime;
    const fadeIn = toDeck === "a" ? this.playerPair.a.gain.gain : this.playerPair.b.gain.gain;
    const fadeOut = toDeck === "a" ? this.playerPair.b.gain.gain : this.playerPair.a.gain.gain;
    fadeIn.cancelScheduledValues(now);
    fadeOut.cancelScheduledValues(now);
    fadeIn.setValueAtTime(fadeIn.value, now);
    fadeOut.setValueAtTime(fadeOut.value, now);
    // Linear ramp keeps it simple and recordable.
    fadeIn.linearRampToValueAtTime(1, now + seconds);
    fadeOut.linearRampToValueAtTime(0, now + seconds);
  }

  setPlayerPairGain(v: number) {
    if (!this.playerPair || !this.ctx) return;
    const now = this.ctx.currentTime;
    // Scale both decks — useful for a master volume slider.
    this.playerPair.a.gain.gain.setTargetAtTime(
      v * (this.playerPair.a.gain.gain.value > 0.5 ? 1 : 0),
      now,
      0.02,
    );
    this.playerPair.b.gain.gain.setTargetAtTime(
      v * (this.playerPair.b.gain.gain.value > 0.5 ? 1 : 0),
      now,
      0.02,
    );
  }

  setCrossfader(v: number) {
    this.crossfader = Math.max(0, Math.min(1, v));
    if (!this.ctx) return;
    const aGain = Math.cos((this.crossfader * Math.PI) / 2);
    const bGain = Math.sin((this.crossfader * Math.PI) / 2);
    const a = this.decks.get("A");
    const b = this.decks.get("B");
    const t = this.ctx.currentTime;
    if (a) a.xfade.gain.setTargetAtTime(aGain, t, 0.01);
    if (b) b.xfade.gain.setTargetAtTime(bGain, t, 0.01);
  }

  setEQ(slotId: SlotId, band: "low" | "mid" | "high", db: number) {
    const deck = this.decks.get(slotId);
    if (!deck || !this.ctx) return;
    const node = band === "low" ? deck.low : band === "mid" ? deck.mid : deck.high;
    node.gain.setTargetAtTime(db, this.ctx.currentTime, 0.03);
  }

  /**
   * Filter cutoff in Hz. 22050 = wide open, lower values close down a
   * low-pass for that "filter sweep" sound.
   */
  setFilterCutoff(slotId: SlotId, hz: number) {
    const deck = this.decks.get(slotId);
    if (!deck || !this.ctx) return;
    deck.filter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.03);
  }

  setDeckVolume(slotId: SlotId, v: number) {
    const deck = this.decks.get(slotId);
    if (!deck || !this.ctx) return;
    deck.volume.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setMatrixGain(v: number) {
    if (!this.matrixInput || !this.ctx) return;
    this.matrixInput.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setMasterGain(v: number) {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // ───── Recording ─────

  startRecording(): boolean {
    this.ensureContext();
    if (!this.recordTap) return false;
    if (this.recorder && this.recorder.state === "recording") return false;

    this.recordMime = pickMimeType();
    try {
      this.recorder = new MediaRecorder(this.recordTap.stream, {
        mimeType: this.recordMime.mimeType || undefined,
        audioBitsPerSecond: 192_000,
      });
    } catch {
      try {
        this.recorder = new MediaRecorder(this.recordTap.stream);
      } catch {
        return false;
      }
    }

    this.recordChunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.recordChunks.push(e.data);
    };
    this.recordStartedAt = Date.now();
    // Chunk every 1s so memory doesn't balloon for long recordings.
    this.recorder.start(1000);
    return true;
  }

  async stopRecording(): Promise<RecordingResult | null> {
    if (!this.recorder) return null;
    if (this.recorder.state === "inactive") return null;
    const mime = this.recordMime;
    const started = this.recordStartedAt;
    return new Promise((resolve) => {
      this.recorder!.onstop = () => {
        const blob = new Blob(this.recordChunks, {
          type: mime.mimeType || "audio/webm",
        });
        const result: RecordingResult = {
          blob,
          mimeType: mime.mimeType || "audio/webm",
          extension: mime.extension,
          durationMs: Date.now() - started,
        };
        this.recordChunks = [];
        this.recorder = null;
        resolve(result);
      };
      this.recorder!.stop();
    });
  }

  isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === "recording";
  }

  recordingStartedAt(): number | null {
    return this.isRecording() ? this.recordStartedAt : null;
  }
}

export const djBus = new DJBus();

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 250);
}
