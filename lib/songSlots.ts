/**
 * Song slot data model for the mixer.
 *
 * Easy Mix uses 1 slot. Remix mode adds slot B.
 * Each slot wraps an HTMLAudioElement with its own state.
 */

export type SlotId = "A" | "B";

export interface SongSlot {
  id: SlotId;
  url: string | null;
  name: string;
  duration: number;
  position: number;
  /** 0..1, applied via HTMLAudioElement.volume */
  volume: number;
  loop: boolean;
  /** User-entered tempo. Used for matrix BPM sync. */
  bpm: number | null;
  /** Playback speed multiplier, 0.5..2.0. Applied via HTMLAudioElement.playbackRate. */
  playbackRate: number;
  /** Time-stretch without changing pitch. Applied via HTMLAudioElement.preservesPitch. */
  preservePitch: boolean;
  muted: boolean;

  // DJ controls
  /** 3-band EQ in decibels, -15..+15. 0 = flat. */
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  /** Low-pass filter cutoff in Hz. 22050 = wide open. */
  filterCutoff: number;
  /** Loop region in seconds. Both null = no loop set. */
  loopStart: number | null;
  loopEnd: number | null;
  /** 4 hot cues in seconds. null = empty slot. */
  hotCues: (number | null)[];
  /** Auto-detect status, transient UI. */
  bpmDetecting?: boolean;
}

export function defaultSlot(id: SlotId): SongSlot {
  return {
    id,
    url: null,
    name: "",
    duration: 0,
    position: 0,
    volume: 0.7,
    loop: true,
    bpm: null,
    playbackRate: 1,
    preservePitch: true,
    muted: false,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    filterCutoff: 22050,
    loopStart: null,
    loopEnd: null,
    hotCues: [null, null, null, null],
  };
}

/**
 * Effective BPM after applying playback rate.
 * E.g. an 80 BPM track at 1.1x = 88 effective BPM.
 */
export function effectiveBpm(slot: SongSlot): number | null {
  if (slot.bpm == null) return null;
  return slot.bpm * slot.playbackRate;
}
