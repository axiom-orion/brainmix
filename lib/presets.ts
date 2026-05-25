import type { PresetParams } from "./audioEngine";

export type PresetId =
  | "deskflow"
  | "poolside"
  | "archaic"
  | "theta"
  | "sleep"
  | "energy";

export interface Preset {
  id: PresetId;
  name: string;
  emoji: string;
  band: string;
  hz: string;
  blurb: string;
  science: string;
  /** Highest-evidence | mixed-evidence | feels-good-but-unsupported. */
  evidence: "strong" | "mixed" | "vibes";
  params: PresetParams;
  defaultVolume: number;
}

export const PRESETS: Record<PresetId, Preset> = {
  deskflow: {
    id: "deskflow",
    name: "Desk Flow",
    emoji: "⚡",
    band: "Gamma + low-beta",
    hz: "40 Hz boost, 14 Hz pulse, 80 BPM",
    blurb:
      "Lock-in for coding, writing, analytical work. Designed to layer under reggae-rock at ~80 BPM.",
    science:
      "40 Hz gamma is the only entrainment frequency with strong neuroscience (MIT Tsai lab, Nature 2016+ - measurable amyloid clearance in mice, ongoing human trials). The 14 Hz low-beta drives sustained attention. 80 BPM gate hides the gamma flutter in reggae off-beats so it doesn't sound like a buzzsaw.",
    evidence: "strong",
    params: {
      carrierHz: 200,
      beatHz: 14,
      droneHz: 110, // A2
      noise: "brown",
      noiseGain: 0.12,
      droneGain: 0.18,
      entrainmentGain: 0.07,
      gammaBoost: true,
      lfoShape: "square",
      bpmSync: 80,
    },
    defaultVolume: 0.5,
  },
  poolside: {
    id: "poolside",
    name: "Poolside Chill",
    emoji: "🌴",
    band: "Alpha",
    hz: "8 Hz pulse, 85 BPM",
    blurb:
      "Sunlight + dopamine. 8 Hz alpha at a slightly faster ska/reggae tempo. Friction-free creativity.",
    science:
      "Alpha (8-13 Hz) is the band of relaxed wakefulness and flow. At 85 BPM, 16th-note triplets of a reggae shuffle hit ~8.5 Hz - your music naturally entrains you, this just reinforces it. Sunlight on the retina spikes serotonin and dopamine independently.",
    evidence: "mixed",
    params: {
      carrierHz: 220,
      beatHz: 8,
      droneHz: 131, // C3
      noise: "pink",
      noiseGain: 0.08,
      droneGain: 0.2,
      entrainmentGain: 0.07,
      gammaBoost: false,
      lfoShape: "sine",
      bpmSync: 85,
    },
    defaultVolume: 0.55,
  },
  archaic: {
    id: "archaic",
    name: "Archaic Reset",
    emoji: "🌑",
    band: "Sub-bass + theta",
    hz: "110 Hz drone, 7 Hz pulse, EMDR",
    blurb:
      "Anti-anxiety kill switch. 110 Hz vagal sub-bass with bilateral panning for hemisphere cross-talk.",
    science:
      "A single small study (Cook et al, 2008) found 110 Hz exposure in resonant chambers correlated with right-hemisphere activation. Never replicated, but the low-frequency body resonance does measurably drop heart rate via vagus stimulation. EMDR panning mimics bilateral stimulation used in trauma therapy - mechanism debated, clinical effect real.",
    evidence: "mixed",
    params: {
      carrierHz: 220,
      beatHz: 7,
      droneHz: 110, // A2 - the famous Hypogeum frequency
      noise: "brown",
      noiseGain: 0.18,
      droneGain: 0.24,
      entrainmentGain: 0.05,
      gammaBoost: false,
      lfoShape: "sine",
      bpmSync: 0,
    },
    defaultVolume: 0.45,
  },
  theta: {
    id: "theta",
    name: "Meditative Theta",
    emoji: "🧘",
    band: "Theta",
    hz: "6 Hz pulse",
    blurb: "Drop into insight, calm, ego-quiet, deep introspection.",
    science:
      "6 Hz sits in the heart of theta - the band experienced meditators show on EEG. Pink noise + slow drone with breath-paced amplitude (0.1 Hz = 6 breaths/min) primes vagal tone and HRV resonance.",
    evidence: "mixed",
    params: {
      carrierHz: 144,
      beatHz: 6,
      droneHz: 98, // G2
      noise: "pink",
      noiseGain: 0.08,
      droneGain: 0.22,
      entrainmentGain: 0.06,
      gammaBoost: false,
      lfoShape: "sine",
      bpmSync: 0,
    },
    defaultVolume: 0.45,
  },
  sleep: {
    id: "sleep",
    name: "Sleep / Recovery",
    emoji: "🌙",
    band: "Delta",
    hz: "2 Hz pulse",
    blurb:
      "Slow descent into delta-dominant sleep. Use lying down, lights off, speakers not headphones.",
    science:
      "2 Hz is mid-delta - the band of deep dreamless sleep where GH and immune repair peak. Brown noise masks the auditory startle response. Drone set low (F2 ~ 87 Hz) - lower fundamentals correlate with calming responses cross-culturally.",
    evidence: "mixed",
    params: {
      carrierHz: 90,
      beatHz: 2,
      droneHz: 87, // F2
      noise: "brown",
      noiseGain: 0.22,
      droneGain: 0.15,
      entrainmentGain: 0.05,
      gammaBoost: false,
      lfoShape: "sine",
      bpmSync: 0,
    },
    defaultVolume: 0.32,
  },
  energy: {
    id: "energy",
    name: "Energy Lift",
    emoji: "🔥",
    band: "Mid-beta",
    hz: "18 Hz pulse, 95 BPM",
    blurb: "Mood lift, motivation, pre-workout activation.",
    science:
      "18 Hz mid-beta correlates with alertness and motor readiness. Brighter carrier, 95 BPM gate (most pop/dance hits around this tempo). Honest caveat: this state is best driven by music you actually love - dopamine from anticipation > entrainment. Use as a base layer.",
    evidence: "vibes",
    params: {
      carrierHz: 256,
      beatHz: 18,
      droneHz: 131, // C3
      noise: "pink",
      noiseGain: 0.06,
      droneGain: 0.16,
      entrainmentGain: 0.07,
      gammaBoost: false,
      lfoShape: "square",
      bpmSync: 95,
    },
    defaultVolume: 0.55,
  },
};

export const PRESET_LIST: Preset[] = [
  PRESETS.deskflow,
  PRESETS.poolside,
  PRESETS.archaic,
  PRESETS.theta,
  PRESETS.sleep,
  PRESETS.energy,
];
