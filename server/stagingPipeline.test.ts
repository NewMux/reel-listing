import { describe, expect, it } from "vitest";
import { stagingPrompt } from "./stagingPipeline";
import { STAGING_STYLES } from "../shared/video";

describe("virtual staging prompt construction", () => {
  it("builds a distinct prompt for every style and always requires structure preservation", () => {
    const prompts = STAGING_STYLES.map(style => stagingPrompt(style));
    const unique = new Set(prompts);
    expect(unique.size).toBe(STAGING_STYLES.length);
    for (const prompt of prompts) {
      expect(prompt).toContain("Preserve the exact architecture");
      expect(prompt).toContain("Do not alter structural elements");
    }
  });

  it("names the requested style in its own prompt", () => {
    expect(stagingPrompt("scandinavian")).toContain("Scandinavian");
    expect(stagingPrompt("contemporary-gulf")).toContain("Gulf");
  });
});
