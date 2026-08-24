import { describe, expect, it } from "vitest";
import { getRenderStatus, getShotPlan } from "./renderPipeline";

describe("render pipeline", () => {
  it("creates one ordered shot direction per property photo", () => {
    const shots = getShotPlan(Array.from({ length: 10 }, (_, index) => `/manus-storage/photo-${index}.jpg`));
    expect(shots).toHaveLength(10);
    expect(shots[0]).toMatchObject({ index: 0, roomType: "Property detail 1" });
    expect(shots[9]).toMatchObject({ index: 9, roomType: "Property detail 10" });
    expect(shots.map(shot => shot.index)).toEqual(Array.from({ length: 10 }, (_, index) => index));
  });

  it("uses generated AI direction and a confirmed room label when available", () => {
    const shots = getShotPlan(["/manus-storage/one.jpg"], ["Shot type: kitchen-dining. Classification confidence is conservative."]);
    expect(shots[0]?.prompt).toContain("Shot type: kitchen-dining.");
    expect(shots[0]?.roomType).toBe("Kitchen / dining");
  });

  it("uses a generic property label when no generated classification is available", () => {
    const shots = getShotPlan(["/manus-storage/one.jpg"], [null]);
    expect(shots[0]?.roomType).toBe("Property detail 1");
  });

  it("reports a completed project as a fully assembled reel", () => {
    const status = getRenderStatus(
      1,
      "Done",
      ["/manus-storage/one.jpg", "/manus-storage/two.jpg"],
      "/manus-storage/final.mp4",
    );
    expect(status).toMatchObject({
      status: "Done",
      phase: "complete",
      overallProgress: 100,
      completedShots: 2,
      totalShots: 2,
      finalVideoUrl: "/manus-storage/final.mp4",
    });
    expect(status.shots.every(shot => shot.state === "complete")).toBe(true);
  });
});
