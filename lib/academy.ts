/**
 * The Academy: tooltip content shown when the user taps a [?] icon.
 *
 * Each entry is written with a "what + why + honest evidence rating" structure.
 * Strong = peer-reviewed; mixed = some studies, debated; vibes = subjective, unsupported.
 */

export interface AcademyEntry {
  title: string;
  evidence: "strong" | "mixed" | "vibes";
  body: string;
}

export const ACADEMY: Record<string, AcademyEntry> = {
  brainstate: {
    title: "Target Brain State",
    evidence: "mixed",
    body:
      "The brain has dominant rhythms in known bands.\n\n" +
      "Delta (0.5-4 Hz): deep sleep, immune/repair.\n" +
      "Theta (4-8 Hz): hypnagogia, deep meditation, insight.\n" +
      "Alpha (8-13 Hz): relaxed wakefulness, flow lite.\n" +
      "Beta (13-30 Hz): focused thinking, alertness.\n" +
      "Gamma (30-100 Hz, esp. 40 Hz): peak cognition, binding consciousness.\n\n" +
      "The Frequency Following Response (FFR) is the real mechanism - brainstem and cortex literally phase-lock to periodic stimuli. Effect sizes vary; works best on calm, focus, and meditation states.",
  },
  bpmsync: {
    title: "Music Pocket Sync (BPM)",
    evidence: "mixed",
    body:
      "When this is set to your music's BPM, the gamma layer's amplitude is gated to the 8th-note off-beat - it pulses *in between* the kick drums of your music instead of fighting them.\n\n" +
      "Most reggae-rock (Iration, Dirty Heads, Stick Figure) sits 75-90 BPM. EDM 120-130. Lofi hip-hop 70-90. Set this to your YouTube Music tempo so the entrainment hides inside the groove instead of buzzing on top.\n\n" +
      "Set to 0 to disable the gate (continuous tone).",
  },
  carrier: {
    title: "Carrier Tuning",
    evidence: "vibes",
    body:
      "The audible base tone the entrainment rides on.\n\n" +
      "528 Hz - sometimes called the Solfeggio 'repair' frequency. The DNA-repair / cellular-coherence claims are NOT scientifically supported; the 'ancient Gregorian' origin is a 1970s invention. But it's a pleasant, bright tone.\n\n" +
      "432 Hz - 'cosmic tuning'. No reproducible advantage over 440 Hz. People who prefer it usually like it for slightly warmer feel.\n\n" +
      "110 Hz - the Hypogeum frequency. One small study (Cook et al, 2008) found right-hemisphere activation in resonant chambers tuned to this. Never replicated, but the low body resonance does stimulate the vagus nerve.\n\n" +
      "Bottom line: pick what sounds good. The vibes are real even if the mythology isn't.",
  },
  waveform: {
    title: "LFO Waveform",
    evidence: "strong",
    body:
      "Controls the *shape* of the pulse, not the audible tone itself.\n\n" +
      "Sine - smooth amplitude swell. Subtler entrainment, more pleasant background.\n\n" +
      "Square - sharp on/off transients. Strongest measurable EEG entrainment in head-to-head studies, but the rhythmic 'pulsing' is more noticeable. Use when you want firm lock-in.",
  },
  emdr: {
    title: "EMDR Bilateral Panning",
    evidence: "mixed",
    body:
      "The drone sweeps left-to-right at 0.5 Hz (1 cycle every 2 seconds), mimicking the bilateral stimulation used in EMDR trauma therapy.\n\n" +
      "The mechanism is debated, but bilateral stim has solid clinical evidence for processing stuck emotional content. Headphones required - on speakers the effect is just stereo wobble.\n\n" +
      "Pairs well with the Archaic Reset preset for nervous-system regulation.",
  },
  breath: {
    title: "Breath Pacer (0.1 Hz)",
    evidence: "strong",
    body:
      "The drone volume swells slowly at 0.1 Hz - that's 6 breaths per minute, the resonant breathing frequency for heart rate variability.\n\n" +
      "When you breathe along with the swell (inhale on rise, exhale on fall), vagal tone goes up and cortisol drops. This is one of the most robustly replicated psychophysiology findings.",
  },
  gamma: {
    title: "40 Hz Gamma Boost",
    evidence: "strong",
    body:
      "Layers a 40 Hz isochronic pulse on top of everything. Based on the MIT Tsai lab GENUS protocol - 40 Hz audio/visual stimulation triggered measurable amyloid plaque clearance in mice (Nature 2016+) and is in active human trials for Alzheimer's.\n\n" +
      "Cognition benefits in healthy adults are less established but suggestive. This is the entrainment frequency with the strongest neuroscience.",
  },
  noise: {
    title: "Noise Floor",
    evidence: "strong",
    body:
      "Broad-spectrum noise masks sudden environmental sounds, which calms the amygdala's threat-detection circuit. Real and well-replicated.\n\n" +
      "Brown noise - heavy lows, soft highs. Better for sleep and deep work.\n\n" +
      "Pink noise - balanced 1/f spectrum. Closer to nature sounds (rain, surf). Better for focus and reading.",
  },
  mode: {
    title: "Headphones vs Speakers",
    evidence: "strong",
    body:
      "Binaural - left ear hears 200 Hz, right ear hears 200 + beat Hz. Your superior olivary complex creates a 'phantom' beat at the difference. Requires headphones.\n\n" +
      "Isochronic - single tone pulsed on/off at the beat frequency. Works on speakers. Often stronger entrainment than binaural in head-to-head EEG studies.\n\n" +
      "Off - no entrainment layer, just drone and noise. Use when you want quiet background without any pulsing.",
  },
  export: {
    title: "Export to WAV",
    evidence: "strong",
    body:
      "Renders your current config as a stereo 16-bit WAV file at 44.1 kHz, downloads to your device. Render happens offline in a Web Worker so the UI stays responsive.\n\n" +
      "Why bother? On iOS/Android, opening YouTube Music pauses background web audio. The reliable workaround: export a long WAV (30-60 min), play it via your phone's native Files / Voice Memos app at low volume, then open YouTube Music. The OS will mix both streams natively.\n\n" +
      "Cap at 60 min - longer files use a lot of memory.",
  },
  songmix: {
    title: "Mix In Your Own Song",
    evidence: "strong",
    body:
      "Import any audio file from your device (MP3, M4A, WAV, FLAC). The file stays local - nothing uploads anywhere.\n\n" +
      "When you tap Play, BrainMix plays your song AND the matrix together. Volume sliders are independent so you can dial in the mix - typically song around 70%, matrix around 30% works well.\n\n" +
      "Type your song's BPM in the field below the player. Iration, Dirty Heads, Stick Figure are typically 75-90 BPM. With 'Sync to matrix' ON, the 40 Hz gamma layer pulses on your song's off-beats so it hides in the groove instead of buzzing on top.\n\n" +
      "Tip: download the MP3s you actually own (Bandcamp, your iTunes library, ripped CDs). YouTube Music streams are DRM-protected and can't be imported directly - use the WAV export workaround for those.",
  },
  ytmusic: {
    title: "YouTube Music Integration",
    evidence: "strong",
    body:
      "Mobile OSes aggressively pause one audio source when another starts. Two ways to layer BrainMix under YT Music:\n\n" +
      "1. THE RELIABLE WAY (recommended): Tap Export .WAV, save the file, play it on loop via your phone's native Files app or a basic audio player. Then open YouTube Music. The OS mixes both natively.\n\n" +
      "2. THE LIVE WAY: Tap Play in BrainMix. Open YouTube Music (BrainMix audio will pause). Swipe down your notification shade, find the BrainMix audio session, tap play again. They will mix - until one of them gets backgrounded too aggressively.\n\n" +
      "iOS Safari is the trickiest. Android Chrome is more permissive.",
  },
  evidence: {
    title: "Science vs Vibes",
    evidence: "strong",
    body:
      "BrainMix is built on a mix of strong neuroscience and well-known acoustic mythology. The Academy entries label each by evidence level:\n\n" +
      "STRONG: 40 Hz gamma (MIT Tsai), frequency following response, 6-breath HRV resonance, noise-masking attention, isochronic > binaural for some bands.\n\n" +
      "MIXED: theta meditation entrainment (replicated but small effects), 110 Hz hemisphere shift (one paper), EMDR bilateral panning (clinical effects without consensus mechanism).\n\n" +
      "VIBES: Solfeggio 'healing frequencies', 432 Hz cosmic tuning, water-coherence claims. They might still feel good - placebo is also real and useful - but the mythology isn't science.",
  },
};
