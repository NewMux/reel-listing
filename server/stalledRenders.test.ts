import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stalled: [] as Array<{ id: number; userId: number }>,
  cutoff: null as Date | null,
  refreshed: [] as number[],
  failOn: new Set<number>(),
}));

vi.mock("./db", () => ({
  listStalledRenders: async (cutoff: Date) => { state.cutoff = cutoff; return state.stalled; },
}));
vi.mock("./falPipeline", () => ({
  refreshFalRender: async (_userId: number, project: { id: number }) => {
    if (state.failOn.has(project.id)) throw new Error("fal down");
    state.refreshed.push(project.id);
  },
}));

import { advanceStalledRenders, isAuthorizedCronRequest, STALLED_AFTER_MS } from "./stalledRenders";

describe("stalled render sweep", () => {
  beforeEach(() => {
    state.stalled = [];
    state.refreshed = [];
    state.failOn = new Set();
  });

  it("only accepts the exact cron secret", () => {
    expect(isAuthorizedCronRequest("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCronRequest("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(undefined, "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
  });

  it("advances renders untouched for the stall window, and keeps going past a failure", async () => {
    state.stalled = [{ id: 1, userId: 9 }, { id: 2, userId: 9 }, { id: 3, userId: 8 }];
    state.failOn.add(2);
    const now = 1_800_000_000_000;
    const summary = await advanceStalledRenders(now, () => 0);
    expect(state.cutoff?.getTime()).toBe(now - STALLED_AFTER_MS);
    expect(state.refreshed).toEqual([1, 3]);
    expect(summary).toEqual({ found: 3, advanced: 2, failed: 1, skipped: 0 });
  });

  it("stops starting new projects when the function's time budget runs low", async () => {
    state.stalled = [{ id: 1, userId: 1 }, { id: 2, userId: 1 }, { id: 3, userId: 1 }];
    let elapsed = 0;
    const summary = await advanceStalledRenders(Date.now(), () => { const t = elapsed; elapsed += 3_000; return t; });
    expect(state.refreshed).toEqual([1]);
    expect(summary.skipped).toBe(2);
  });
});
