/**
 * Client-side WAV exporter.
 *
 * Spawns an inline Web Worker that mirrors the audio engine math, renders the
 * mix offline, encodes 16-bit stereo PCM, and returns a downloadable Blob.
 *
 * Memory note: 60 min stereo 44.1 kHz 16-bit = ~635 MB. We cap at 60 min and
 * warn the UI above 30 min.
 */
import type { EngineConfig } from "./audioEngine";

export interface ExportProgress {
  type: "progress";
  percent: number;
}

export interface ExportDone {
  type: "done";
  blob: Blob;
}

export type ExportEvent = ExportProgress | ExportDone;

const workerSource = /* js */ `
self.onmessage = function(e) {
  const cfg = e.data;
  const SR = 44100;
  const totalSamples = Math.floor(cfg.minutes * 60 * SR);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  // Pre-compute reusable angular velocities.
  const TWO_PI = Math.PI * 2;
  const carrierW = cfg.carrierHz * TWO_PI;
  const beatW = cfg.beatHz * TWO_PI;
  const droneFundW = cfg.droneHz * TWO_PI;
  const droneFifthW = cfg.droneHz * 1.5 * TWO_PI;
  const droneOctW = cfg.droneHz * 2 * TWO_PI;
  const gammaCarrierW = 1000 * TWO_PI;
  const gammaW = 40 * TWO_PI;
  const bpmW = cfg.bpmSync > 0 ? (cfg.bpmSync / 60) * 2 * TWO_PI : 0;
  const breathW = 0.1 * TWO_PI;
  const emdrW = 0.5 * TWO_PI;
  // 8-bar swell: at BPM, 8 bars = 32 beats; if no BPM, fall back to 24 s cycle.
  const swellW = cfg.bpmSync > 0
    ? (cfg.bpmSync / 60 / 32) * TWO_PI
    : (1 / 24) * TWO_PI;

  // Brown noise state (Brownian integrator).
  let brown = 0;
  // Pink noise state (Kellet).
  let p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0;

  const progressEvery = Math.max(1, Math.floor(totalSamples / 50));

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SR;

    // === Entrainment ===
    let entrainL = 0, entrainR = 0;
    if (cfg.mode === "binaural") {
      entrainL = Math.sin(carrierW * t) * cfg.entrainmentGain;
      entrainR = Math.sin((cfg.carrierHz + cfg.beatHz) * TWO_PI * t) * cfg.entrainmentGain;
    } else if (cfg.mode === "isochronic") {
      const carrier = Math.sin(carrierW * t);
      const rawLfo = Math.sin(beatW * t);
      const lfo = cfg.lfoShape === "square"
        ? (rawLfo >= 0 ? 1 : 0)
        : (rawLfo + 1) / 2;
      const sample = carrier * lfo * cfg.entrainmentGain;
      entrainL = sample;
      entrainR = sample;
    }

    // === Gamma boost (40 Hz isochronic) ===
    let gammaSample = 0;
    if (cfg.gammaBoost) {
      const gCarrier = Math.sin(gammaCarrierW * t);
      const gLfo = Math.sin(gammaW * t) >= 0 ? 1 : 0;
      let g = gCarrier * gLfo * 0.05;
      if (cfg.bpmSync > 0) {
        g *= (Math.sin(bpmW * t - Math.PI) + 1) / 2;
      }
      gammaSample = g;
    }

    // === Drone ===
    let droneL = 0, droneR = 0;
    if (cfg.droneGain > 0) {
      const d =
        Math.sin(droneFundW * t) * 0.7 +
        Math.sin(droneFundW * 1.0008 * t) * 0.25 +
        Math.sin(droneFifthW * t) * 0.35 +
        Math.sin(droneOctW * t) * 0.18;
      let droneAmp = cfg.droneGain * 0.4;
      if (cfg.breathPacer) {
        droneAmp *= (Math.sin(breathW * t) + 1.4) / 2.4;
      }
      const droneSample = d * droneAmp;
      if (cfg.emdrPan) {
        const pan = (Math.sin(emdrW * t) + 1) / 2;
        droneL = droneSample * (1 - pan);
        droneR = droneSample * pan;
      } else {
        droneL = droneSample;
        droneR = droneSample;
      }
    }

    // === Noise ===
    let noiseSample = 0;
    if (cfg.noise !== "off" && cfg.noiseGain > 0) {
      const white = Math.random() * 2 - 1;
      if (cfg.noise === "brown") {
        brown = (brown + 0.02 * white) / 1.02;
        noiseSample = brown * 3.5;
      } else {
        p0 = 0.99886 * p0 + white * 0.0555179;
        p1 = 0.99332 * p1 + white * 0.0750759;
        p2 = 0.969 * p2 + white * 0.153852;
        p3 = 0.8665 * p3 + white * 0.3104856;
        p4 = 0.55 * p4 + white * 0.5329522;
        p5 = -0.7616 * p5 - white * 0.016898;
        noiseSample = (p0 + p1 + p2 + p3 + p4 + p5 + p6 + white * 0.5362) * 0.11;
        p6 = white * 0.115926;
      }
      noiseSample *= cfg.noiseGain;
    }

    // === 8-bar swell on whole mix (gentle dynamics for engagement) ===
    const swell = 0.85 + 0.15 * ((Math.sin(swellW * t - Math.PI / 2) + 1) / 2);

    let l = (entrainL + gammaSample + droneL + noiseSample) * cfg.masterGain * swell;
    let r = (entrainR + gammaSample + droneR + noiseSample) * cfg.masterGain * swell;

    // Soft clipper - avoid harsh distortion at peaks.
    if (l > 0.95) l = 0.95 + (l - 0.95) * 0.1;
    else if (l < -0.95) l = -0.95 + (l + 0.95) * 0.1;
    if (r > 0.95) r = 0.95 + (r - 0.95) * 0.1;
    else if (r < -0.95) r = -0.95 + (r + 0.95) * 0.1;

    left[i] = l;
    right[i] = r;

    if (i % progressEvery === 0) {
      self.postMessage({ type: "progress", percent: Math.floor((i / totalSamples) * 100) });
    }
  }

  // === Apply 2-second fade in/out ===
  const fade = Math.min(SR * 2, Math.floor(totalSamples / 2));
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    left[i] *= k; right[i] *= k;
    left[totalSamples - 1 - i] *= k;
    right[totalSamples - 1 - i] *= k;
  }

  // === Encode 16-bit stereo PCM WAV ===
  const dataBytes = totalSamples * 4; // 2 channels * 2 bytes
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, 2, true);            // stereo
  view.setUint32(24, SR, true);
  view.setUint32(28, SR * 4, true);       // byte rate
  view.setUint16(32, 4, true);            // block align
  view.setUint16(34, 16, true);           // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);

  let off = 44;
  for (let i = 0; i < totalSamples; i++) {
    const ls = Math.max(-1, Math.min(1, left[i]));
    const rs = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(off, ls < 0 ? ls * 0x8000 : ls * 0x7fff, true); off += 2;
    view.setInt16(off, rs < 0 ? rs * 0x8000 : rs * 0x7fff, true); off += 2;
  }

  self.postMessage({ type: "done", buffer: buf }, [buf]);
};
`;

export interface ExportPayload extends EngineConfig {
  minutes: number;
}

export function exportWav(
  payload: ExportPayload,
  onEvent: (e: ExportEvent) => void,
): () => void {
  const blob = new Blob([workerSource], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  worker.onmessage = (e: MessageEvent) => {
    const data = e.data as
      | { type: "progress"; percent: number }
      | { type: "done"; buffer: ArrayBuffer };
    if (data.type === "progress") {
      onEvent({ type: "progress", percent: data.percent });
    } else {
      const wavBlob = new Blob([data.buffer], { type: "audio/wav" });
      onEvent({ type: "done", blob: wavBlob });
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  };

  worker.postMessage(payload);

  return () => {
    worker.terminate();
    URL.revokeObjectURL(url);
  };
}

export function downloadWav(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}
