import { describe, it, expect } from "vitest";
import { guessFromFilename } from "@/lib/idTags";

describe("guessFromFilename", () => {
  it("splits Artist - Title.mp3", () => {
    expect(guessFromFilename("Iration - Rise Up.mp3")).toEqual({
      artist: "Iration",
      title: "Rise Up",
    });
  });

  it("handles multiple dashes - joining the title halves", () => {
    expect(guessFromFilename("Pepper - Stone Love - Live.mp3")).toEqual({
      artist: "Pepper",
      title: "Stone Love - Live",
    });
  });

  it("returns artist null when no separator", () => {
    expect(guessFromFilename("untitled.mp3")).toEqual({
      artist: null,
      title: "untitled",
    });
  });

  it("strips file extension", () => {
    expect(guessFromFilename("song.flac").title).toBe("song");
  });

  it("trims whitespace around the separator", () => {
    expect(guessFromFilename("Sublime  -  Santeria.mp3")).toEqual({
      artist: "Sublime",
      title: "Santeria",
    });
  });
});
