import { describe, expect, it } from "vitest";
import {
  getApprovalTransition,
  getChangeRequestTransition,
  getCompletionTransition,
  isProjectStatus,
  validatePropertyMedia,
} from "./projects";
import { appendUploadChunk, createUploadSession } from "./uploadSessions";

const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("property media validation", () => {
  it("requires exactly ten images", () => {
    expect(() =>
      validatePropertyMedia([
        { name: "one.png", type: "image/png", base64: pixel },
        { name: "two.png", type: "image/png", base64: pixel },
      ]),
    ).toThrow("Upload exactly 10 property images.");
  });

  it("accepts ten property images", () => {
    expect(
      validatePropertyMedia(
        Array.from({ length: 10 }).map((_, i) => ({ name: `${i}.png`, type: "image/png", base64: pixel }))
      ),
    ).toMatchObject({ isVideo: false });
  });

  it("rejects video uploads", () => {
    expect(() =>
      validatePropertyMedia(
        Array.from({ length: 10 }).map((_, i) => ({ name: `${i}.mp4`, type: "video/mp4", base64: pixel }))
      ),
    ).toThrow("Upload exactly 10 property images. Walkthrough videos are no longer accepted.");
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

  it("accepts bounded authenticated upload chunks and accounts for their bytes", () => {
    const session = createUploadSession(42, "villa.jpg", "image/jpeg", 3);
    expect(appendUploadChunk(42, session.id, "QUJD")).toEqual({ receivedBytes: 3, totalBytes: 3 });
    expect(() => appendUploadChunk(41, session.id, "QQ==")).toThrow("expired");
  });
});
