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
    expect(prompt).toContain("Camera choreography -- the movement chosen specifically for this room");
  });

  // Regression test: a prior version of CINEMATIC_LOCK grew large enough that the per-photo
  // camera move -- the entire point of the vision-classification pipeline -- was silently cut
  // off mid-sentence by limitPrompt's tail truncation on every real render, even though the
  // above test still passed (it only checked for the label prefix, not that real content
  // followed it). Assert the actual cameraMove text survives verbatim, not just its label.
  it("never truncates away the actual camera move, even with maximal lighting/focus text", () => {
    const cameraMove = "a lateral gimbal track across the living area that keeps the sofa and fireplace in frame while revealing the far wall UNIQUE-CAMERA-MOVE-TAIL";
    const prompt = buildCinematicPrompt(9, {
      shotType: "detail",
      timeOfDay: "evening",
      cameraMove,
      lighting: "natural light description ".repeat(40),
      focus: "architectural focus description ".repeat(40),
    }, project);

    expect(prompt.length).toBeLessThanOrEqual(FAL_PROMPT_MAX_CHARS);
    expect(prompt).toContain(cameraMove);
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

  it("lets a client's customCameraMoves override replace the AI-suggested cameraMove", () => {
    const projectWithOverride = { ...project, customCameraMoves: ["a slow orbit around the pool, never crossing the water's edge"] } as VideoProject;
    const prompt = buildCinematicPrompt(0, {
      shotType: "outdoor-view",
      timeOfDay: "midday",
      cameraMove: "the AI's own suggestion that should be replaced",
      lighting: "bright midday sun",
      focus: "the pool",
    }, projectWithOverride);

    expect(prompt).toContain("a slow orbit around the pool, never crossing the water's edge");
    expect(prompt).not.toContain("the AI's own suggestion that should be replaced");
  });

  it("interpolates the actual per-photo clip duration into the prompt", () => {
    const project5s = { ...project, clipDurations: [5] } as VideoProject;
    const prompt5s = buildCinematicPrompt(0, { shotType: "detail", timeOfDay: "unknown", cameraMove: "a lateral track", lighting: "stable light", focus: "the finish" }, project5s);
    expect(prompt5s).toContain("Use one continuous 5-second camera move");

    const project10s = { ...project, clipDurations: [10] } as VideoProject;
    const prompt10s = buildCinematicPrompt(0, { shotType: "detail", timeOfDay: "unknown", cameraMove: "a lateral track", lighting: "stable light", focus: "the finish" }, project10s);
    expect(prompt10s).toContain("Use one continuous 10-second camera move");
  });
});
