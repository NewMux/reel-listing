// Safety net for renders that stop moving. A render normally advances on fal.ai's webhook or
// the customer's 3s poll; if a webhook is lost while nobody has the page open, nothing would
// ever advance it. A scheduled call to /api/cron/advance-renders picks those up.
import { timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import { ENV } from "./_core/env";
import { listStalledRenders } from "./db";
import { refreshFalRender } from "./falPipeline";

/** A render untouched this long is considered stalled (webhooks and polls touch it far sooner). */
export const STALLED_AFTER_MS = 3 * 60 * 1000;
const BATCH_LIMIT = 25;
/** Functions are capped at 10s; stop starting new projects with less than this left. */
const TIME_BUDGET_MS = 7_000;
const PER_PROJECT_RESERVE_MS = 2_000;

export async function advanceStalledRenders(now = Date.now(), clock: () => number = Date.now) {
  const started = clock();
  const projects = await listStalledRenders(new Date(now - STALLED_AFTER_MS), BATCH_LIMIT);
  let advanced = 0;
  let failed = 0;
  for (const project of projects) {
    if (clock() - started > TIME_BUDGET_MS - PER_PROJECT_RESERVE_MS) break;
    try {
      // No customer session here: Storage URLs are signed with the service-role key, exactly as
      // on the fal.ai webhook path.
      await refreshFalRender(project.userId, project);
      advanced++;
    } catch (error) {
      failed++;
      console.error(`[StalledRenders] project ${project.id} could not be advanced:`, error);
    }
  }
  return { found: projects.length, advanced, failed, skipped: projects.length - advanced - failed };
}

export function isAuthorizedCronRequest(header: string | undefined, secret: string) {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function registerStalledRenderSweep(app: Express) {
  app.get("/api/cron/advance-renders", async (req, res) => {
    if (!isAuthorizedCronRequest(req.get("authorization"), ENV.cronSecret)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const summary = await advanceStalledRenders();
      if (summary.found) console.log("[StalledRenders]", summary);
      res.status(200).json(summary);
    } catch (error) {
      console.error("[StalledRenders] sweep failed:", error);
      res.status(500).json({ error: "sweep failed" });
    }
  });
}
