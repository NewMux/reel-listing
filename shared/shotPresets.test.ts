import { describe, expect, it } from "vitest";
import { CAMERA_PRESETS, findUnsupportedMove, getCameraPreset, matchCameraPreset, ROOM_TYPE_CHOICES } from "./shotPresets";

describe("camera presets", () => {
  it("resolves every offered choice to a directive", () => {
    for (const preset of CAMERA_PRESETS) {
      expect(getCameraPreset(preset.id)?.directive).toBe(preset.directive);
      expect(preset.directive.length).toBeGreaterThan(10);
    }
  });

  it("round-trips a stored directive back to the chip that produced it", () => {
    for (const preset of CAMERA_PRESETS) {
      expect(matchCameraPreset(preset.directive)).toBe(preset.id);
    }
  });

  it("reports no selected chip for free text or an empty override", () => {
    expect(matchCameraPreset(null)).toBeNull();
    expect(matchCameraPreset("")).toBeNull();
    expect(matchCameraPreset("something the customer typed")).toBeNull();
  });

  it("offers a way to let the model decide the room", () => {
    expect(ROOM_TYPE_CHOICES[0]).toBe("unknown");
  });
});

describe("unsupported camera moves", () => {
  it("catches the moves the render prompt forbids, however they are phrased", () => {
    const rejected = [
      "drone shot flying through the window",
      "Crane up over the kitchen",
      "orbit around the island",
      "tilt down to the floor",
      "birds eye view of the pool",
      "snap zoom to the fireplace",
      "handheld walk through the hall",
    ];
    for (const move of rejected) {
      expect(findUnsupportedMove(move), move).not.toBeNull();
    }
  });

  it("allows the movements the model actually renders well", () => {
    const accepted = [
      "move slowly towards the balcony doors",
      "glide left to right across the living space",
      "ease forward and reveal the view",
      "step back to show the whole room",
      ...CAMERA_PRESETS.map(preset => preset.directive),
    ];
    for (const move of accepted) {
      expect(findUnsupportedMove(move), move).toBeNull();
    }
  });

  it("matches whole words, so an innocent word containing a banned one passes", () => {
    // "panorama" contains "pan", "floorboards" contains "floor".
    expect(findUnsupportedMove("show the panorama from the terrace")).toBeNull();
    expect(findUnsupportedMove("move across the floorboards")).toBeNull();
  });
});
