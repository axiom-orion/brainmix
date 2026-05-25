/**
 * Shared types used across UI components in app/components/.
 *
 * Kept separate from lib/ types because these describe the shape passed BETWEEN
 * components, not the underlying storage shapes (CloudTrack, LibraryTrack).
 */

import type { SlotId } from "@/lib/songSlots";

/**
 * The flattened library entry shape passed to UI components. Doesn't carry
 * the underlying source (local/cloud) — that's an implementation detail of
 * the parent page.
 */
export interface LibraryEntryShape {
  id: string;
  name: string;
  bpm: number | null;
  hotCues: (number | null)[];
  loopStart: number | null;
  loopEnd: number | null;
  size: number;
  source: "local" | "cloud";
  artist: string | null;
  album: string | null;
  durationSec: number | null;
  coverPath: string | null;
}

export type { SlotId };
