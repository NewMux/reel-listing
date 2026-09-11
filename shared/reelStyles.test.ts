import { describe, expect, it } from "vitest";
import { DEFAULT_REEL_STYLE, getReelStyle, REEL_STYLES, reelDurationSeconds } from "./reelStyles";

describe("reel styles", () => {
  it("only offers clip lengths the video model accepts", () => {
    for (const style of REEL_STYLES) {
      expect([5, 10]).toContain(style.clipSeconds);
    }
  });

  it("never lets a crossfade eat a whole clip", () => {
    for (const style of REEL_STYLES) {
      expect(style.transitionSeconds).toBeGreaterThan(0);
      expect(style.transitionSeconds).toBeLessThan(style.clipSeconds / 2);
    }
  });

  it("falls back to the default for an unknown or missing style", () => {
    expect(getReelStyle(undefined).id).toBe(DEFAULT_REEL_STYLE);
    expect(getReelStyle(null).id).toBe(DEFAULT_REEL_STYLE);
    expect(getReelStyle("something-else").id).toBe(DEFAULT_REEL_STYLE);
  });

  it("reports the finished length with the crossfade overlap removed", () => {
    // Ten 10s clips with nine 0.6s dissolves: 100 - 5.4.
    expect(reelDurationSeconds(10, "balanced")).toBeCloseTo(94.6);
    // A single clip has nothing to cross-fade into.
    expect(reelDurationSeconds(1, "balanced")).toBe(10);
    expect(reelDurationSeconds(0, "balanced")).toBe(0);
  });

  it("makes the quick style a materially shorter reel", () => {
    expect(reelDurationSeconds(10, "quick")).toBeLessThan(reelDurationSeconds(10, "balanced") / 1.8);
  });
});
