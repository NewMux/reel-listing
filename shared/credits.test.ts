import { describe, expect, it } from "vitest";
import { CREDIT_SECONDS, creditsForClip, creditsForReel } from "./credits";
import { getReelStyle, REEL_STYLES } from "./reelStyles";

describe("credit pricing", () => {
  it("charges one credit per five seconds of video", () => {
    expect(CREDIT_SECONDS).toBe(5);
    expect(creditsForClip(5)).toBe(1);
    expect(creditsForClip(10)).toBe(2);
  });

  it("falls back to the default clip length for a shot nobody overrode", () => {
    expect(creditsForClip(null)).toBe(2);
    expect(creditsForClip(undefined)).toBe(2);
  });

  it("prices a full ten-photo reel of ten-second shots at twenty credits", () => {
    expect(creditsForReel(10, [])).toBe(20);
  });

  it("charges the short style half of what the long style charges", () => {
    const long = creditsForReel(10, Array(10).fill(getReelStyle("balanced").clipSeconds));
    const short = creditsForReel(10, Array(10).fill(getReelStyle("quick").clipSeconds));
    expect(short).toBe(long / 2);
  });

  it("counts every shot even when only some have an override stored", () => {
    // Sparse overrides: the first two were shortened, the rest keep the default length.
    expect(creditsForReel(5, [5, 5])).toBe(1 + 1 + 2 + 2 + 2);
  });

  it("prices every offered style without ever charging zero", () => {
    for (const style of REEL_STYLES) {
      expect(creditsForReel(10, Array(10).fill(style.clipSeconds))).toBeGreaterThan(0);
    }
  });

  it("costs nothing for a reel with no photos", () => {
    expect(creditsForReel(0, [])).toBe(0);
  });
});
