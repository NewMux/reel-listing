import { describe, expect, it } from "vitest";
import { blendArgs, buildCrossfadeFilter, concatManifest, mergeArchivedClipUrls, normalizeArgs, resolveDurations, TRANSITION_SECONDS } from "./assembly";

describe("buildCrossfadeFilter", () => {
  it("offsets each transition by the running length of what has already been merged", () => {
    // Three 10s clips with 0.6s overlaps: the second starts at 9.4s, the third at 18.8s --
    // not 10 and 20, because each completed transition eats one overlap.
    const filter = buildCrossfadeFilter([10, 10, 10]);
    expect(filter).toContain("offset=9.40");
    expect(filter).toContain("offset=18.80");
    expect(filter.endsWith("[vout]")).toBe(true);
  });

  it("handles mixed 5s and 10s clips, which the per-photo duration toggle produces", () => {
    const filter = buildCrossfadeFilter([5, 10, 5]);
    expect(filter).toContain("offset=4.40");
    expect(filter).toContain("offset=13.80");
  });

  it("chains labels so each stage consumes the previous one", () => {
    const filter = buildCrossfadeFilter([5, 5, 5, 5]);
    expect(filter).toContain("[0:v][1:v]");
    expect(filter).toContain("[v1][2:v]");
    expect(filter).toContain("[v2][3:v]");
  });

  it("produces a single stage straight to vout for two clips", () => {
    expect(buildCrossfadeFilter([5, 5]).split(";")).toHaveLength(1);
  });
});

describe("ffmpeg argument construction", () => {
  it("normalizes every clip to one geometry and frame rate, which xfade requires", () => {
    const args = normalizeArgs("in.mp4", "out.mp4", 10);
    expect(args).toContain("scale=720:-2:flags=lanczos,setsar=1,format=yuv420p");
    expect(args.join(" ")).toContain("-r 24");
    expect(args.join(" ")).toContain("-t 10");
    // Silent by design: the reel is assembled from audio-off source clips.
    expect(args).toContain("-an");
  });

  it("maps the crossfade output and never the raw first input", () => {
    const args = blendArgs(["a.mp4", "b.mp4"], "filter", "out.mp4");
    expect(args[args.indexOf("-map") + 1]).toBe("[vout]");
    expect(args.filter(a => a === "-i")).toHaveLength(2);
  });

  it("quotes filenames in the concat manifest used by the hard-cut fallback", () => {
    expect(concatManifest(["a.mp4", "b.mp4"])).toBe("file 'a.mp4'\nfile 'b.mp4'");
  });
});

describe("resolveDurations", () => {
  it("falls back to the default clip length for unset entries", () => {
    expect(resolveDurations(3, [5, null, undefined as unknown as null])).toEqual([5, 10, 10]);
  });
});

describe("transition length", () => {
  it("matches the browser implementation it replaced", () => {
    // Output must be identical whichever path assembled it.
    expect(TRANSITION_SECONDS).toBe(0.6);
  });
});

describe("mergeArchivedClipUrls", () => {
  it("replaces only the indices that archived successfully", () => {
    const original = ["fal://a", "fal://b", "fal://c"];
    const archived = [null, "/manus-storage/property-projects/1/outputs/clip-2.mp4", null];
    expect(mergeArchivedClipUrls(original, archived)).toEqual([
      "fal://a",
      "/manus-storage/property-projects/1/outputs/clip-2.mp4",
      "fal://c",
    ]);
  });

  it("keeps every original value when nothing archived, e.g. a total archive failure", () => {
    const original = ["fal://a", "fal://b"];
    expect(mergeArchivedClipUrls(original, [null, null])).toEqual(original);
    expect(mergeArchivedClipUrls(original, [undefined, undefined])).toEqual(original);
  });

  it("replaces every index when the whole archive pass succeeds", () => {
    const original = ["fal://a", "fal://b"];
    const archived = ["/manus-storage/a.mp4", "/manus-storage/b.mp4"];
    expect(mergeArchivedClipUrls(original, archived)).toEqual(archived);
  });

  it("tolerates an archived array shorter than the original -- a clip index never reached", () => {
    const original = ["fal://a", "fal://b", "fal://c"];
    expect(mergeArchivedClipUrls(original, ["/manus-storage/a.mp4"])).toEqual([
      "/manus-storage/a.mp4",
      "fal://b",
      "fal://c",
    ]);
  });
});
