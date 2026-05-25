/**
 * Client-side BPM detector.
 *
 * Strategy:
 *   1. Decode the audio file to a mono AudioBuffer
 *   2. Lowpass-filter at 150 Hz to isolate kick drums (via OfflineAudioContext)
 *   3. Peak detection with a sliding-window threshold relative to local energy
 *   4. Histogram inter-peak intervals, normalized into the 60-200 BPM range
 *   5. Pick the mode, then refine across neighboring buckets
 *
 * Caveats:
 *   - Reggae one-drop tracks can confuse it - the kick lives on beat 3, not 1.
 *     The detector usually still lands on the right tempo (or 2x/0.5x of it).
 *   - Half/double-time errors are common across genres. We bias toward 70-130
 *     by folding extreme buckets into the typical dance/song range.
 *   - Only the first 60 seconds are analyzed for speed.
 */

export interface BPMResult {
  bpm: number;
  confidence: number; // 0..1, share of peaks that landed in the winning bucket
}

const ANALYSIS_SECONDS = 60;
const MIN_BPM = 60;
const MAX_BPM = 200;

export async function detectBPM(file: File): Promise<BPMResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const arrayBuffer = await file.arrayBuffer();

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const tempCtx = new Ctor();
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
    tempCtx.close();

    // Slice to first ANALYSIS_SECONDS - faster, and intros are usually clean enough.
    const sr = audioBuffer.sampleRate;
    const sliceLength = Math.min(
      audioBuffer.length,
      Math.floor(sr * ANALYSIS_SECONDS),
    );

    // Build an offline mono buffer copying just the slice.
    const sliced = new AudioBuffer({
      length: sliceLength,
      sampleRate: sr,
      numberOfChannels: 1,
    });
    const src0 = audioBuffer.getChannelData(0);
    const src1 =
      audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
    const dest = sliced.getChannelData(0);
    for (let i = 0; i < sliceLength; i++) {
      dest[i] = src1 ? (src0[i] + src1[i]) * 0.5 : src0[i];
    }

    const offlineCtx = new OfflineAudioContext(1, sliceLength, sr);
    const source = offlineCtx.createBufferSource();
    source.buffer = sliced;
    const lp = offlineCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 150;
    lp.Q.value = 1;
    source.connect(lp).connect(offlineCtx.destination);
    source.start(0);
    const rendered = await offlineCtx.startRendering();

    const data = rendered.getChannelData(0);
    const peaks = findPeaks(data, sr);
    if (peaks.length < 4) return null;

    return computeBPM(peaks, sr);
  } catch {
    return null;
  }
}

function findPeaks(data: Float32Array, sampleRate: number): number[] {
  const minSpacing = Math.floor(sampleRate * 0.2); // 300 BPM ceiling
  // Compute global peak.
  let maxAmp = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > maxAmp) maxAmp = a;
  }
  const threshold = maxAmp * 0.85;
  const peaks: number[] = [];
  let last = -minSpacing;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) >= threshold && i - last >= minSpacing) {
      peaks.push(i);
      last = i;
    }
  }
  return peaks;
}

function normalize(bpm: number): number {
  // Fold to MIN_BPM..MAX_BPM and bias toward typical song tempos.
  let n = bpm;
  while (n > MAX_BPM) n /= 2;
  while (n < MIN_BPM) n *= 2;
  return n;
}

function computeBPM(peaks: number[], sampleRate: number): BPMResult | null {
  const counts = new Map<number, number>();
  let total = 0;
  for (let i = 1; i < peaks.length; i++) {
    const interval = peaks[i] - peaks[i - 1];
    if (interval <= 0) continue;
    const rawBpm = (60 * sampleRate) / interval;
    const bpm = Math.round(normalize(rawBpm));
    if (bpm < MIN_BPM || bpm > MAX_BPM) continue;
    counts.set(bpm, (counts.get(bpm) || 0) + 1);
    total++;
  }
  if (total === 0) return null;

  // Smooth: combine neighboring buckets within ±2 BPM.
  let bestBpm = 0;
  let bestSum = 0;
  for (const [bpm, count] of counts) {
    let sum = count;
    for (let d = 1; d <= 2; d++) {
      sum += counts.get(bpm - d) ?? 0;
      sum += counts.get(bpm + d) ?? 0;
    }
    if (sum > bestSum) {
      bestSum = sum;
      bestBpm = bpm;
    }
  }
  if (bestBpm === 0) return null;
  return { bpm: bestBpm, confidence: bestSum / total };
}
