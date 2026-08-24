import { describe, expect, it } from "vitest";
import type { VideoProject } from "../drizzle/schema";
import { buildCinematicPrompt } from "./falPipeline";
import { FAL_PROMPT_MAX_CHARS } from "../shared/video";

const project = {
  mediaUrls: Array.from({ length: 10 }, (_, index) => `https://example.com/villa-${index + 1}.png`),
  title: "Villa test",
  location: "Amwaj",
  description: null,
} as VideoProject;

describe("fal.ai prompt construction", () => {
  it("keeps long vision direction text below the provider limit", () => {
    const prompt = buildCinematicPrompt(9, {
      shotType: "detail",
      cameraMove: "camera movement ".repeat(40),
      lighting: "natural light description ".repeat(40),
      focus: "architectural focus description ".repeat(40),
    }, project);

    expect(prompt.length).toBeLessThanOrEqual(FAL_PROMPT_MAX_CHARS);
    expect(prompt).toContain("No audio.");
    expect(prompt).toContain("a short eye-level dolly move");
  });
});
