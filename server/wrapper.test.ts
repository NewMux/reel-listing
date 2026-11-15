import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoProject } from "../drizzle/schema";

const state = vi.hoisted(() => {
  process.env.FAL_KEY = "test-key";
  return {
    project: null as any,
    credits: 0,
    references: new Set<string>(),
    jobs: {} as Record<string, { model: string; input: any; status: string; data?: unknown }>,
    nextJob: 1,
  };
});

vi.mock("./db", () => ({
  claimRenderLock: async () => true,
  releaseRenderLock: async () => {},
  getVideoProject: async () => state.project,
  updateVideoProject: async (_userId: number, _id: number, updates: object) => Object.assign(state.project, updates),
  grantCredits: async (_userId: number, amount: number, _reason: string, reference: string) => {
    if (state.references.has(reference)) return false;
    state.references.add(reference);
    state.credits += amount;
    return true;
  },
  spendCredits: async (_userId: number, amount: number) => {
    if (state.credits < amount) return null;
    state.credits -= amount;
    return state.credits;
  },
}));

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: () => {},
    queue: {
      submit: async (model: string, options: { input: unknown }) => {
        const request_id = `job-${state.nextJob++}`;
        state.jobs[request_id] = { model, input: options.input, status: "IN_QUEUE" };
        return { request_id };
      },
      status: async (_model: string, { requestId }: { requestId: string }) => ({ status: state.jobs[requestId].status }),
      result: async (_model: string, { requestId }: { requestId: string }) => ({ data: state.jobs[requestId].data }),
    },
  },
}));

import { refreshFalRender, regenerateClip } from "./falPipeline";
import { invoiceMetadata, verifyStripeSignature } from "./billing";
import { renderCost } from "../shared/billing";
import { getProjectRenderStatus } from "./renderPipeline";

function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    id: 7,
    userId: 1,
    title: "Villa",
    description: null,
    location: "Amwaj",
    mediaUrls: ["https://example.com/a.png", "https://example.com/b.png"],
    mediaKeys: ["pilot:g/a", "pilot:g/b"],
    mediaNames: ["a.png", "b.png"],
    mediaTypes: ["image/png", "image/png"],
    status: "Processing",
    revisionNotes: null,
    finalVideoUrl: null,
    promptRequestIds: [],
    generatedPrompts: ["guided prompt one", "guided prompt two"],
    shotAnalysis: [],
    customCameraMoves: [],
    clipDurations: [],
    customPrompts: [],
    clipErrors: [],
    assemblyRequestId: null,
    renderLockedAt: null,
    shareToken: null,
    falRequestIds: [],
    clipUrls: [],
    renderProgress: 0,
    renderPhase: "generating",
    renderError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as VideoProject;
}

const complete = (requestId: string, url: string) => Object.assign(state.jobs[requestId], { status: "COMPLETED", data: { video: { url } } });

beforeEach(() => {
  state.project = makeProject();
  state.credits = 0;
  state.references.clear();
  state.jobs = {};
  state.nextJob = 1;
});

describe("render loop", () => {
  it("refunds a failed clip once, lets it be retried alone, then assembles on the server", async () => {
    await refreshFalRender(1, state.project);
    expect(state.project.falRequestIds).toEqual(["job-1", "job-2"]);

    complete("job-1", "https://fal.media/one.mp4");
    state.jobs["job-2"].status = "FAILED";
    let snapshot = await refreshFalRender(1, state.project);
    expect(snapshot.phase).toBe("failed");
    expect(snapshot.shots.map(shot => shot.state)).toEqual(["complete", "failed"]);
    expect(state.credits).toBe(10);

    // Further polls must not refund again or resubmit anything.
    await refreshFalRender(1, state.project);
    await refreshFalRender(1, state.project);
    expect(state.credits).toBe(10);
    expect(Object.keys(state.jobs)).toHaveLength(2);

    await regenerateClip(1, 7, 1, { durationSeconds: 5 });
    expect(state.credits).toBe(5);
    expect(state.project.falRequestIds[1]).toBe("job-3");
    expect(state.jobs["job-3"].input.duration).toBe("5");
    expect(state.project.clipUrls[0]).toBe("https://fal.media/one.mp4");

    complete("job-3", "https://fal.media/two.mp4");
    snapshot = await refreshFalRender(1, state.project);
    expect(snapshot.phase).toBe("assembly");
    expect(state.jobs["job-4"].model).toBe("fal-ai/ffmpeg-api/merge-videos");
    expect(state.jobs["job-4"].input.video_urls).toEqual(["https://fal.media/one.mp4", "https://fal.media/two.mp4"]);

    complete("job-4", "https://fal.media/final.mp4");
    snapshot = await refreshFalRender(1, state.project);
    expect(snapshot).toMatchObject({ status: "Done", phase: "complete", finalVideoUrl: "https://fal.media/final.mp4" });
  });

  it("sends a customer's own prompt as written, without the real-estate guardrails", async () => {
    state.project = makeProject({ customPrompts: ["A dog runs across the lawn at sunset", null] });
    await refreshFalRender(1, state.project);
    expect(state.jobs["job-1"].input.prompt).toBe("A dog runs across the lawn at sunset");
    expect(state.jobs["job-1"].input.negative_prompt).not.toContain("animals");
    expect(state.jobs["job-2"].input.prompt).toBe("guided prompt two");
    expect(getProjectRenderStatus(state.project).shots[0]).toMatchObject({ isCustomPrompt: true, prompt: "A dog runs across the lawn at sunset" });
  });

  it("re-opens a finished reel when one clip is re-rolled, and refuses without credits", async () => {
    state.project = makeProject({ status: "Done", finalVideoUrl: "https://fal.media/final.mp4", falRequestIds: ["job-a", "job-b"], clipUrls: ["https://fal.media/one.mp4", "https://fal.media/two.mp4"], renderPhase: "complete" });
    await expect(regenerateClip(1, 7, 0, { prompt: "slow push in" })).rejects.toThrow(/Not enough credits/);
    expect(state.project.status).toBe("Done");

    state.credits = 10;
    await regenerateClip(1, 7, 0, { prompt: "slow push in" });
    expect(state.credits).toBe(0);
    expect(state.project).toMatchObject({ status: "Processing", finalVideoUrl: null, customPrompts: ["slow push in", null] });
    expect(state.project.clipUrls).toEqual([null, "https://fal.media/two.mp4"]);
  });
});

describe("billing", () => {
  it("prices a render at one credit per second", () => {
    expect(renderCost([10, 10, 5])).toBe(25);
  });

  it("accepts only a correctly signed, recent Stripe payload", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ type: "invoice.paid" });
    const now = 1_800_000_000;
    const sign = (payload: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
    expect(verifyStripeSignature(body, sign(body, now), secret, now)).toBe(true);
    expect(verifyStripeSignature(`${body} `, sign(body, now), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, now - 3_600), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, undefined, secret, now)).toBe(false);
  });

  it("finds plan metadata wherever the Stripe API version puts it", () => {
    const metadata = { userId: "4", plan: "pro" };
    expect(invoiceMetadata({ parent: { subscription_details: { metadata } } })).toEqual(metadata);
    expect(invoiceMetadata({ subscription_details: { metadata } })).toEqual(metadata);
    expect(invoiceMetadata({ lines: { data: [{ metadata }] } })).toEqual(metadata);
    expect(invoiceMetadata({ lines: { data: [{ metadata: {} }] } })).toBeUndefined();
  });
});
