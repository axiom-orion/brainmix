import { describe, it, expect } from "vitest";
import { defaultSlot, effectiveBpm } from "@/lib/songSlots";

describe("defaultSlot", () => {
  it("creates an empty slot with sensible defaults", () => {
    const s = defaultSlot("A");
    expect(s.id).toBe("A");
    expect(s.volume).toBe(0.7);
    expect(s.playbackRate).toBe(1);
    expect(s.preservePitch).toBe(true);
    expect(s.loop).toBe(true);
    expect(s.eqLow).toBe(0);
    expect(s.filterCutoff).toBe(22050);
    expect(s.hotCues).toEqual([null, null, null, null]);
  });
});

describe("effectiveBpm", () => {
  it("returns null when bpm is null", () => {
    const s = defaultSlot("A");
    expect(effectiveBpm(s)).toBeNull();
  });

  it("multiplies bpm by playback rate", () => {
    const s = { ...defaultSlot("A"), bpm: 80, playbackRate: 1.1 };
    expect(effectiveBpm(s)).toBeCloseTo(88, 5);
  });

  it("returns the raw bpm when playbackRate is 1", () => {
    const s = { ...defaultSlot("A"), bpm: 120, playbackRate: 1 };
    expect(effectiveBpm(s)).toBe(120);
  });
});
