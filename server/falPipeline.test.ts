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
      timeOfDay: "evening",
      cameraMove: "camera movement ".repeat(40),
      lighting: "natural light description ".repeat(40),
      focus: "architectural focus description ".repeat(40),
    }, project);

    expect(prompt.length).toBeLessThanOrEqual(FAL_PROMPT_MAX_CHARS);
    expect(prompt).toContain("No audio.");
    expect(prompt).toContain("a short eye-level dolly move");
  });

  it("describes the detected time of day and asks for it to be preserved", () => {
    const prompt = buildCinematicPrompt(0, {
      shotType: "living-room",
      timeOfDay: "morning",
      cameraMove: "a forward gimbal push",
      lighting: "soft morning light",
      focus: "the main seating area",
    }, project);

    expect(prompt).toContain("Time of day: morning.");
    expect(prompt).toContain("do not introduce artificial day-to-night");
  });

  it("does not assert a time of day when it is unknown", () => {
    const prompt = buildCinematicPrompt(0, {
      shotType: "bathroom",
      timeOfDay: "unknown",
      cameraMove: "a forward gimbal push",
      lighting: "stable interior light",
      focus: "the vanity",
    }, project);

    expect(prompt).toContain("Time of day is not clearly evident");
    expect(prompt).not.toContain("Time of day: unknown");
  });
});
