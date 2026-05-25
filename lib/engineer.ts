/**
 * The Engineer.
 *
 * Persona: 30-year veteran sound engineer. Trained in Kingston dub studios,
 * Berlin techno bunkers, Bombay film orchestras, and a damp basement in Bristol.
 * Doesn't lecture. References traditions only when they actually clarify.
 *
 * Architecture: deterministic rule engine for now (no LLM dependency, no API key,
 * works fully offline). Each tip has a trigger that fires on certain state, a
 * voice (the message), and an optional one-tap apply() that mutates state.
 *
 * Designed to be swappable: when you deploy and wire up Vercel AI Gateway,
 * the same TIPS array can seed an LLM system prompt, and the analyzer can fall
 * back to rules when offline.
 */

import type { EntrainmentMode, NoiseColor } from "./audioEngine";
import type { PresetId } from "./presets";
import type { SongSlot, SlotId } from "./songSlots";

export interface EngineerState {
  preset: PresetId | null;
  beatHz: number;
  carrierHz: number;
  droneHz: number;
  bpmSync: number;
  noise: NoiseColor;
  noiseGain: number;
  droneGain: number;
  entrainmentGain: number;
  mode: EntrainmentMode;
  gammaBoost: boolean;
  emdrPan: boolean;
  breathPacer: boolean;
  volume: number;
  tempoScale: number;
  syncMatrixBpm: boolean;
  slots: SongSlot[];
  playing: boolean;
  /** DJ studio: 0 = A only, 1 = B only, 0.5 = both equal. */
  crossfader: number;
  /** Active recording duration in ms, 0 if not recording. */
  recordingDurationMs: number;
}

export interface AppStatePatch {
  beatHz?: number;
  bpmSync?: number;
  noiseGain?: number;
  droneGain?: number;
  mode?: EntrainmentMode;
  gammaBoost?: boolean;
  breathPacer?: boolean;
  emdrPan?: boolean;
  volume?: number;
  carrierHz?: number;
  droneHz?: number;
}

export interface SlotPatch {
  id: SlotId;
  patch: Partial<SongSlot>;
}

export interface ApplyResult {
  appState?: AppStatePatch;
  slotPatches?: SlotPatch[];
  /** Auxiliary instruction the page handles (e.g. focus a field). */
  hint?: string;
}

export type Tone = "fix" | "enhance" | "praise";

export interface EngineerTip {
  id: string;
  priority: number;
  tone: Tone;
  title: string;
  body: string;
  trigger: (s: EngineerState) => boolean;
  apply?: (s: EngineerState) => ApplyResult;
}

const slot = (s: EngineerState, id: SlotId) => s.slots.find((x) => x.id === id);
const effBpm = (sl: SongSlot | undefined) =>
  sl && sl.bpm != null ? sl.bpm * sl.playbackRate : null;

export const TIPS: EngineerTip[] = [
  // ───────────────────────────────── HIGH PRIORITY FIXES ─────────────────────────────────

  {
    id: "gamma_no_bpm",
    priority: 95,
    tone: "fix",
    title: "Gamma is exposed",
    body:
      "A bare 40 Hz pulse sounds like a small motor. Pin it to a tempo and it hides inside the off-beats. Same trick dub producers use: a sound lives or dies by what it pulses against, not its own loudness. If you don't have a song loaded, 82 is a safe reggae-rock default.",
    trigger: (s) => s.gammaBoost && s.bpmSync === 0,
    apply: (s) => {
      const a = slot(s, "A");
      const bpm = a?.bpm ?? 82;
      return { appState: { bpmSync: bpm } };
    },
  },

  {
    id: "noise_drone_clash",
    priority: 90,
    tone: "fix",
    title: "Sub-bass is fighting itself",
    body:
      "Brown noise and your drone fundamental are wrestling for the 60-200 Hz pocket. One of them needs to back off. Japanese aesthetics has a word for this: ma — the meaningful empty space between sounds. Without ma the ear gives up.",
    trigger: (s) =>
      s.noiseGain > 0.18 &&
      s.droneGain > 0.15 &&
      (s.noise === "brown" || s.droneHz < 130),
    apply: () => ({ appState: { noiseGain: 0.08 } }),
  },

  {
    id: "binaural_too_high",
    priority: 88,
    tone: "fix",
    title: "Binaural breaks down up here",
    body:
      "Phantom beats stop phase-locking above ~30 Hz — the brainstem can't decode the interaural difference reliably. For gamma territory you want isochronic. Or stack a quiet 40 Hz isochronic on top of binaural alpha — that's exactly what Monroe Institute Hemi-Sync did.",
    trigger: (s) => s.mode === "binaural" && s.beatHz > 30,
    apply: () => ({ appState: { mode: "isochronic" } }),
  },

  {
    id: "volume_too_high",
    priority: 85,
    tone: "fix",
    title: "Too loud to work",
    body:
      "Entrainment is paradoxical — the louder you make it, the harder it is for the cortex to settle. Pull back to 30-50%. Eno's Music for Airports rule: at the right volume you forget it's there, and that's when it starts working.",
    trigger: (s) => s.volume > 0.7,
    apply: () => ({ appState: { volume: 0.45 } }),
  },

  {
    id: "sleep_headphones",
    priority: 82,
    tone: "fix",
    title: "Headphones in bed end careers",
    body:
      "Cables wrap, ears bruise, you wake up wired. Switch to isochronic. It works on a phone speaker on the nightstand and leaves your sleep posture free. Tibetan monks never needed headphones either.",
    trigger: (s) => s.preset === "sleep" && s.mode === "binaural",
    apply: () => ({ appState: { mode: "isochronic" } }),
  },

  {
    id: "tempo_mismatch",
    priority: 80,
    tone: "fix",
    title: "Decks are fighting",
    body: "Slot A and Slot B are more than 4 BPM apart at current playback rates. The motor cortex picks a winner — you can hear the brain choose. Match B's rate to A, or commit to a real polyrhythm. Gnawa music plays 6 against 4 on purpose.",
    trigger: (s) => {
      const a = effBpm(slot(s, "A"));
      const b = effBpm(slot(s, "B"));
      if (a == null || b == null) return false;
      return Math.abs(a - b) > 4;
    },
    apply: (s) => {
      const a = slot(s, "A");
      const b = slot(s, "B");
      if (!a || !b || a.bpm == null || b.bpm == null) return {};
      const targetEffective = a.bpm * a.playbackRate;
      const newRate = +(targetEffective / b.bpm).toFixed(3);
      return {
        slotPatches: [
          { id: "B", patch: { playbackRate: Math.max(0.5, Math.min(2, newRate)) } },
        ],
      };
    },
  },

  {
    id: "carrier_high_sleep",
    priority: 78,
    tone: "fix",
    title: "Sleep carrier is alerting",
    body:
      "Above ~130 Hz the ear treats a steady tone as something to attend to — the orienting response fires. Drop the carrier under 100 Hz for sleep, the ear stops noticing.",
    trigger: (s) => s.preset === "sleep" && s.carrierHz > 130,
    apply: () => ({ appState: { carrierHz: 90 } }),
  },

  {
    id: "gamma_meditation_conflict",
    priority: 75,
    tone: "fix",
    title: "Gamma is fighting the theta",
    body:
      "You're asking the brain to relax AND hyper-focus at the same time. Pick a lane. For meditation, kill the gamma boost — let the theta breathe.",
    trigger: (s) => s.gammaBoost && s.beatHz < 10,
    apply: () => ({ appState: { gammaBoost: false } }),
  },

  // ───────────────────────────────── ENHANCE / NUDGE ─────────────────────────────────

  {
    id: "theta_no_breath",
    priority: 65,
    tone: "enhance",
    title: "Anchor the theta to breath",
    body:
      "Theta entrainment without a breath anchor leaves the body adrift. Turn on the breath pacer — 6 breaths per minute is the HRV resonance, the most replicated psychophysiology finding we have. Indian pranayama traditions figured this out three thousand years ago.",
    trigger: (s) => s.beatHz <= 8 && s.beatHz >= 4 && !s.breathPacer,
    apply: () => ({ appState: { breathPacer: true } }),
  },

  {
    id: "too_many_layers",
    priority: 62,
    tone: "enhance",
    title: "Five layers is a wall",
    body:
      "Drone + noise + entrainment + gamma + EMDR + music. The brain decides it's a wall and stops parsing. Strip one — usually the noise. Aphex Twin's rule: every sound earns its place by what it does that nothing else can.",
    trigger: (s) =>
      s.droneGain > 0 &&
      s.noiseGain > 0.06 &&
      s.gammaBoost &&
      s.mode !== "off" &&
      s.emdrPan &&
      s.slots.some((x) => x.url),
    apply: () => ({ appState: { noiseGain: 0 } }),
  },

  {
    id: "emdr_no_song",
    priority: 55,
    tone: "enhance",
    title: "EMDR works better with foreground",
    body:
      "Bilateral panning on a bare drone is hypnotic on headphones but adrift on speakers. Pair it with a song — the bilateral sweep does more work when there's a stable foreground for the hemispheres to share.",
    trigger: (s) => s.emdrPan && !s.slots.some((x) => x.url),
  },

  {
    id: "sync_no_bpm",
    priority: 52,
    tone: "enhance",
    title: "Sync is on, BPM is blank",
    body:
      "You've got 'sync to matrix' enabled but no song BPM entered. Type one. Iration usually around 80, Dirty Heads 82-88, Stick Figure 78, Pepper 92. Or use a tap-tempo phone app on the first chorus.",
    trigger: (s) => s.syncMatrixBpm && (slot(s, "A")?.bpm == null) && !!slot(s, "A")?.url,
  },

  {
    id: "speed_extreme",
    priority: 50,
    tone: "enhance",
    title: "Going beyond ±20%",
    body:
      "Pitch-preserved playback above 1.2x or below 0.8x starts adding artifacts — granular smearing on transients. Stick within ±20% if you care about preserving the original vocal feel. Below 0.7x the algorithm starts to ghost.",
    trigger: (s) => s.slots.some((sl) => sl.url && (sl.playbackRate > 1.2 || sl.playbackRate < 0.8)),
  },

  // ───────────────────────────────── DJ STUDIO (fix/enhance) ─────────────────────────────────

  {
    id: "filter_both_slammed",
    priority: 73,
    tone: "fix",
    title: "Filter slammed on both decks",
    body:
      "Both decks have low-pass under 1 kHz. The mix turns to mud - you've removed every overtone the brain uses to separate sources. Open one of them up. Berlin rule: one element can be dark at a time, not both.",
    trigger: (s) => {
      const a = slot(s, "A");
      const b = slot(s, "B");
      return !!a?.url && !!b?.url && a.filterCutoff < 1000 && b.filterCutoff < 1000;
    },
    apply: (s) => {
      // Open the deck the crossfader leans away from.
      const targetId: SlotId = s.crossfader >= 0.5 ? "A" : "B";
      return { slotPatches: [{ id: targetId, patch: { filterCutoff: 22050 } }] };
    },
  },

  {
    id: "eq_low_both_boosted",
    priority: 71,
    tone: "fix",
    title: "Low end is fighting",
    body:
      "Both decks have low-EQ boosted past +6 dB. Two heavy bass sources in the same band cancel and rumble. Boost one, cut the other. Dub mixers call this 'subtractive EQ' - the bass becomes louder by removing the other deck's competing lows.",
    trigger: (s) => {
      const a = slot(s, "A");
      const b = slot(s, "B");
      return !!a?.url && !!b?.url && a.eqLow > 6 && b.eqLow > 6;
    },
    apply: (s) => {
      const targetId: SlotId = s.crossfader >= 0.5 ? "A" : "B";
      return { slotPatches: [{ id: targetId, patch: { eqLow: -6 } }] };
    },
  },

  {
    id: "tempo_no_pitch_preserve",
    priority: 68,
    tone: "fix",
    title: "Tempo offset, pitch follows",
    body:
      "You're playing at a non-1.00x speed with pitch preservation off. At anything past ±3% the chipmunk effect (or doom-voice slowdown) starts to bite. Turn pitch preservation on unless you specifically want it.",
    trigger: (s) =>
      s.slots.some(
        (sl) => sl.url && !sl.preservePitch && Math.abs(sl.playbackRate - 1) > 0.03,
      ),
    apply: (s) => {
      const target = s.slots.find(
        (sl) => sl.url && !sl.preservePitch && Math.abs(sl.playbackRate - 1) > 0.03,
      );
      if (!target) return {};
      return { slotPatches: [{ id: target.id, patch: { preservePitch: true } }] };
    },
  },

  {
    id: "crossfader_extreme_unused_deck",
    priority: 58,
    tone: "enhance",
    title: "B is loaded but inaudible",
    body:
      "Crossfader is hard one direction and the silent deck is still playing into the void. Either start fading in to use it, or pause that deck to save CPU and ears.",
    trigger: (s) => {
      const a = slot(s, "A");
      const b = slot(s, "B");
      if (!a?.url || !b?.url) return false;
      return s.crossfader < 0.1 || s.crossfader > 0.9;
    },
  },

  {
    id: "long_recording",
    priority: 45,
    tone: "enhance",
    title: "Recording is past an hour",
    body:
      "Long takes get harder to share and harder to come back to. Consider stopping here, saving this cut, and starting a fresh recording for the next stretch. Helps you decide what was good after the fact too.",
    trigger: (s) => s.recordingDurationMs > 60 * 60 * 1000,
  },

  // ───────────────────────────────── PRAISE / CONFIRMATION ─────────────────────────────────

  {
    id: "praise_emdr_binaural",
    priority: 30,
    tone: "praise",
    title: "Good combination",
    body:
      "EMDR bilateral pan + binaural beat is the closest a regular listener gets to the Stanford bilateral stim protocols. Headphones, low volume, eyes closed — stay with this 8-15 minutes.",
    trigger: (s) => s.emdrPan && s.mode === "binaural",
  },

  {
    id: "praise_sleep_stack",
    priority: 28,
    tone: "praise",
    title: "Canonical sleep stack",
    body:
      "Heavy brown noise, delta carrier under 100 Hz, drone fundamental in the low F to A range. Mariana Trench territory. Don't touch it.",
    trigger: (s) =>
      s.preset === "sleep" &&
      s.noise === "brown" &&
      s.noiseGain >= 0.18 &&
      s.beatHz <= 4 &&
      s.carrierHz <= 110,
  },

  {
    id: "praise_dub_pocket",
    priority: 26,
    tone: "praise",
    title: "Locked in the pocket",
    body:
      "Song loaded, BPM matched, gamma gated to the off-beat. This is the dub principle as a working tool — the brain-stim layer hides in the spaces the drummer left empty. Lee 'Scratch' Perry would have nodded.",
    trigger: (s) => {
      const a = slot(s, "A");
      return (
        !!a?.url &&
        s.syncMatrixBpm &&
        s.gammaBoost &&
        s.bpmSync > 0 &&
        (a.bpm ?? 0) > 0
      );
    },
  },
];

export function analyzeState(
  state: EngineerState,
  dismissed: Set<string> = new Set(),
): EngineerTip[] {
  const active = TIPS.filter((t) => !dismissed.has(t.id) && t.trigger(state));
  // Surface at most 3 tips, prioritized by score. Mix fix > enhance > praise.
  return active.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

/**
 * Standalone deep-dive essays the user can read from the engineer's library.
 * Not tied to current state - just background depth.
 */
export interface DeepDive {
  id: string;
  title: string;
  origin: string;
  body: string;
}

export const DEEP_DIVES: DeepDive[] = [
  {
    id: "dub",
    title: "Dub: sound by negation",
    origin: "Kingston, Jamaica · late 1960s onward",
    body:
      "King Tubby and Lee 'Scratch' Perry inverted the production hierarchy. The mix wasn't the song with effects on top — it was the effects making space for what got left in. Stripped drums, vast echo, the bassline appearing and dissolving. The technical secret: their echo was almost always quieter than the original, but its decay shaped where the next sound was allowed to go. For BrainMix: stop thinking of layers as additive. Use the gamma flutter to define where the song's pocket lives, not to compete with it.",
  },
  {
    id: "ma",
    title: "Ma: the loaded silence",
    origin: "Japanese aesthetics · centuries old",
    body:
      "Ma (間) is the meaningful interval between things — the pause before the taiko hit, the negative space in a brushstroke, the empty room around an ikebana arrangement. Modern Western mixing treats silence as dead time to be filled. Ma treats it as the most active part of the composition. Practical application: when your mix feels muddy, the answer is almost never 'more EQ' — it's giving each element its own pocket of silence to be heard against.",
  },
  {
    id: "gnawa",
    title: "Gnawa: trance via polyrhythm",
    origin: "Morocco · West African diaspora roots",
    body:
      "Gnawa lila ceremonies use the qraqeb (iron castanets) at fast 6/8 over a slow 4/4 bass on the guembri. The two meters phase against each other. The conscious brain tries to resolve which meter is 'right,' fails, and gives up — and at the moment of giving up, the participant drops into trance. For BrainMix: don't always slave everything to one BPM. Try setting the matrix BPM to 1.5x your song's BPM (i.e., a 12/8 against the 4/4) and see what happens to the felt time.",
  },
  {
    id: "raga",
    title: "Tanpura and the rooted mind",
    origin: "Indian classical · medieval to present",
    body:
      "A tanpura sounds four notes endlessly — the sa, the pa, and two octaves. It's not background; it's the gravitational center the raga melodies orbit. The brain entrains to the drone's overtone series within 90 seconds of listening, and the harmonic horizon contracts. Practical: a single drone fundamental held longer than four minutes does more for focus than a five-layer pad changing every bar. The Indian classical instinct: less surface variation, more depth in what stays the same.",
  },
  {
    id: "berlin",
    title: "Repetition as content",
    origin: "Berlin / Detroit · late 1980s onward",
    body:
      "Techno made repetition the subject of the music, not the chassis. The kick on every quarter for six minutes wasn't a backing track — it was the work. Plastikman, Robert Hood, Jeff Mills understood that on the eighth repeat the listener stops hearing the kick and starts hearing the room. For BrainMix: don't over-vary. A drone held for ten minutes lets the brain construct micro-variations that aren't actually in the audio. That's where the state-shift lives.",
  },
  {
    id: "eno",
    title: "Generative listening",
    origin: "Brian Eno · 1978",
    body:
      "Eno's Music for Airports wasn't background music — it was a system designed to never demand attention but always reward it. The lengths of his loops were prime numbers so they'd never re-sync exactly. Practical: your matrix should follow this. Breath pacer at 0.1 Hz, gamma at 40 Hz, EMDR at 0.5 Hz — none of those numbers share a common period. They drift against each other forever, which is why long sessions don't get boring.",
  },
];
