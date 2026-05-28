/**
 * Mix-preset bundles — one-tap "vibes" that stack the matrix preset, a
 * Sequencer plan, and a hint about which music genre / albums pair well.
 *
 * Bundles bridge the gap between "tap a preset" (matrix only) and "build a
 * 3-step sequencer plan" (manual). The user picks a vibe and the app sets
 * everything up at once.
 */

import type { PresetId } from "./presets";

export interface BundleStep {
  presetId: PresetId;
  minutes: number;
}

export interface MixBundle {
  id: string;
  emoji: string;
  name: string;
  tagline: string;
  /** Pairing copy — what music plays best underneath. */
  pairing: string;
  /** Sequencer plan that walks through this bundle. */
  steps: BundleStep[];
  /** Lowercased artist tokens. If a library track's artist contains any of
   * these, it's a match candidate for the bundle's auto-play. */
  pairingArtists: string[];
}

export const BUNDLES: MixBundle[] = [
  {
    id: "reggae-focus",
    emoji: "🌴",
    name: "Reggae Focus",
    tagline: "90-min deep work on the off-beat",
    pairing: "Iration · Pepper · Slightly Stoopid · Bob Marley dub remixes",
    pairingArtists: ["iration", "pepper", "slightly stoopid", "bob marley", "marley"],
    steps: [
      { presetId: "deskflow", minutes: 45 },
      { presetId: "poolside", minutes: 5 },
      { presetId: "deskflow", minutes: 40 },
    ],
  },
  {
    id: "berlin-deep",
    emoji: "🌑",
    name: "Berlin Deep",
    tagline: "Late-night minimal techno session",
    pairing: "Donato Dozzy · Voices from the Lake · Burial · DJ Stingray",
    pairingArtists: ["donato dozzy", "voices from the lake", "burial", "stingray"],
    steps: [
      { presetId: "energy", minutes: 30 },
      { presetId: "archaic", minutes: 30 },
      { presetId: "theta", minutes: 30 },
    ],
  },
  {
    id: "sleep-drift",
    emoji: "🌙",
    name: "Sleep Drift",
    tagline: "Slow descent into delta — pair with ambient",
    pairing: "Stars of the Lid · Tim Hecker · Brian Eno's Discreet Music",
    pairingArtists: ["stars of the lid", "tim hecker", "brian eno", "eno"],
    steps: [
      { presetId: "theta", minutes: 15 },
      { presetId: "sleep", minutes: 45 },
    ],
  },
];

/** Match library entries to a bundle's pairingArtists tokens. Case-insensitive
 *  substring match against each entry's artist field. */
export function matchBundleTracks<T extends { artist: string | null }>(
  bundle: MixBundle,
  entries: T[],
): T[] {
  if (bundle.pairingArtists.length === 0) return [];
  return entries.filter((e) => {
    if (!e.artist) return false;
    const a = e.artist.toLowerCase();
    return bundle.pairingArtists.some((token) => a.includes(token));
  });
}

export function bundleById(id: string): MixBundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}
