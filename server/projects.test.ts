import { describe, expect, it } from "vitest";
import {
  getApprovalTransition,
  getChangeRequestTransition,
  getCompletionTransition,
  isProjectStatus,
  validateUploadedPropertyMedia,
} from "./projects";

function uploaded(count: number, overrides: Partial<{ name: string; type: string; key: string; url: string }> = {}) {
  return Array.from({ length: count }).map((_, i) => ({
    name: `${i}.png`,
    type: "image/png",
    key: `property-projects/42/${i}.png`,
    url: `/manus-storage/property-projects/42/${i}.png`,
    ...overrides,
  }));
}

describe("property media validation", () => {
  it("accepts one through ten securely uploaded property images", () => {
    expect(validateUploadedPropertyMedia(uploaded(1))).toMatchObject({ isVideo: false });
    expect(validateUploadedPropertyMedia(uploaded(10))).toMatchObject({ isVideo: false });
  });

  it("rejects more than ten property images", () => {
    expect(() => validateUploadedPropertyMedia(uploaded(11))).toThrow("Upload up to 10 property photos.");
  });

  it("rejects video uploads", () => {
    expect(() => validateUploadedPropertyMedia(uploaded(2, { type: "video/mp4" }))).toThrow("Upload property images only");
  });

  it("rejects media that was not uploaded through our own storage", () => {
    expect(() => validateUploadedPropertyMedia(uploaded(1, { url: "https://untrusted.example/photo.png" })))
      .toThrow("uploaded securely");
    expect(() => validateUploadedPropertyMedia(uploaded(1, { key: "somewhere-else/photo.png" })))
      .toThrow("uploaded securely");
  });

  it("preserves the required project status vocabulary and review transition", () => {
    expect(["Uploading", "Processing", "Review", "Done"].every(isProjectStatus)).toBe(true);
    expect(getApprovalTransition("Review")).toEqual({ status: "Processing", revisionNotes: null });
    expect(() => getApprovalTransition("Processing")).toThrow("already in production");
  });

  it("stores a trimmed change request and only completes to a secure delivery URL", () => {
    expect(getChangeRequestTransition("  Lead with the terrace.  ")).toEqual({
      status: "Review",
      revisionNotes: "Lead with the terrace.",
    });
    expect(getCompletionTransition("/manus-storage/final-film.mp4")).toEqual({
      status: "Done",
      finalVideoUrl: "/manus-storage/final-film.mp4",
    });
    expect(() => getCompletionTransition("http://untrusted.example/film.mp4")).toThrow("secure media URL");
  });
});
