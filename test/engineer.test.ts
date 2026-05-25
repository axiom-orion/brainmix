import { describe, it, expect } from "vitest";
import { analyzeState, TIPS } from "@/lib/engineer";
import type { EngineerState } from "@/lib/engineer";
import { defaultSlot } from "@/lib/songSlots";

function baseState(): EngineerState {
  return {
    preset: "deskflow",
    beatHz: 14,
    carrierHz: 200,
    droneHz: 110,
    bpmSync: 80,
    noise: "brown",
    noiseGain: 0.1,
    droneGain: 0.18,
    entrainmentGain: 0.07,
    mode: "isochronic",
    gammaBoost: false,
    emdrPan: false,
    breathPacer: false,
    volume: 0.5,
    tempoScale: 1,
    syncMatrixBpm: true,
    slots: [defaultSlot("A")],
    playing: false,
    crossfader: 0.5,
    recordingDurationMs: 0,
  };
}

describe("Engineer rule engine", () => {
  it("fires 'gamma is exposed' when gamma is on but bpmSync is 0", () => {
    const s = baseState();
    s.gammaBoost = true;
    s.bpmSync = 0;
    const tips = analyzeState(s);
    expect(tips.map((t) => t.id)).toContain("gamma_no_bpm");
  });

  it("'gamma is exposed' apply() sets a non-zero bpmSync", () => {
    const s = baseState();
    s.gammaBoost = true;
    s.bpmSync = 0;
    const tip = TIPS.find((t) => t.id === "gamma_no_bpm")!;
    const result = tip.apply!(s);
    expect(result.appState?.bpmSync).toBeGreaterThan(0);
  });

  it("fires 'binaural breaks down up here' on binaural mode > 30 Hz", () => {
    const s = baseState();
    s.mode = "binaural";
    s.beatHz = 35;
    const tips = analyzeState(s);
    expect(tips.map((t) => t.id)).toContain("binaural_too_high");
  });

  it("fires 'volume too high' above 0.7", () => {
    const s = baseState();
    s.volume = 0.85;
    const tips = analyzeState(s);
    expect(tips.map((t) => t.id)).toContain("volume_too_high");
  });

  it("returns at most 3 tips", () => {
    const s = baseState();
    s.gammaBoost = true;
    s.bpmSync = 0;
    s.mode = "binaural";
    s.beatHz = 50;
    s.volume = 0.9;
    s.noiseGain = 0.3;
    s.droneGain = 0.3;
    s.carrierHz = 200;
    const tips = analyzeState(s);
    expect(tips.length).toBeLessThanOrEqual(3);
  });

  it("respects dismissed set", () => {
    const s = baseState();
    s.gammaBoost = true;
    s.bpmSync = 0;
    const tips = analyzeState(s, new Set(["gamma_no_bpm"]));
    expect(tips.map((t) => t.id)).not.toContain("gamma_no_bpm");
  });

  it("fires the dub-pocket praise tip when everything aligns", () => {
    const s = baseState();
    s.gammaBoost = true;
    s.bpmSync = 82;
    s.syncMatrixBpm = true;
    s.slots = [
      { ...defaultSlot("A"), url: "blob:test", bpm: 82, name: "iration" },
    ];
    const tips = analyzeState(s);
    expect(tips.map((t) => t.id)).toContain("praise_dub_pocket");
  });
});
