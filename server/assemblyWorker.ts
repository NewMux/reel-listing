/**
 * Polls for projects whose clips are all rendered and joins them into the final reel.
 *
 * Before this existed, assembly only happened while the customer's browser tab was open.
 * Closing it lost the reel: the clips completed on fal.ai, were charged for, and nothing
 * ever stitched them. Once money is involved that is a refund request with us in the
 * wrong, so delivery no longer depends on the customer staying on the page.
 *
 * Runs only in the long-running server (server/_core/index.prod.ts and dev). The Vercel
 * entrypoint does not start it, which is why the client keeps its browser-side fallback --
 * see `serverAssembly` in the render snapshot.
 */

import { assembleReel, isFfmpegAvailable } from "./assembly";
import { MAX_ASSEMBLY_ATTEMPTS, claimProjectForAssembly, finishAssembly, releaseAssemblyClaim } from "./db";
import { hasServiceRoleStorage, storagePutAsService } from "./storage";

const POLL_INTERVAL_MS = 15_000;
/** Backs off when the database is unreachable so a dead DB does not spin the log. */
const ERROR_BACKOFF_MS = 60_000;

let running = false;
let ready = false;

/**
 * Whether finished reels are produced server-side. The client reads this through the
 * render snapshot and only falls back to browser stitching when it is false.
 */
export const isServerAssemblyEnabled = (): boolean => ready;

function safeFileName(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").slice(0, 60);
  return cleaned || "reel-listing-film";
}

async function processOne(): Promise<boolean> {
  const project = await claimProjectForAssembly();
  if (!project) return false;

  const clipUrls = (project.clipUrls ?? []).filter((url): url is string => Boolean(url));
  const attempts = project.assemblyAttempts ?? 1;
  console.log(`[Assembly] project ${project.id}: starting (attempt ${attempts}/${MAX_ASSEMBLY_ATTEMPTS})`);

  try {
    if (clipUrls.length !== project.mediaUrls.length) {
      throw new Error("Not every clip finished rendering, so the reel cannot be assembled.");
    }

    const video = await assembleReel(clipUrls, project.clipDurations ?? [], progress => {
      if (progress.progress % 20 === 0) console.log(`[Assembly] project ${project.id}: ${progress.step}`);
    });

    // Same key layout the browser upload used, so the ownership prefix checks elsewhere
    // (projects.complete, the storage RLS policies) still hold.
    const key = `property-projects/${project.userId}/outputs/${Date.now()}-${safeFileName(project.title)}.mp4`;
    const stored = await storagePutAsService(key, video, "video/mp4");
    await finishAssembly(project.id, stored.url);
    console.log(`[Assembly] project ${project.id}: delivered (${(video.length / 1_000_000).toFixed(1)} MB)`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Final assembly failed.";
    console.error(`[Assembly] project ${project.id}: attempt ${attempts} failed -`, message);
    await releaseAssemblyClaim(project.id, attempts, message).catch(() => {});
    return true;
  }
}

async function tick(): Promise<void> {
  // Drain rather than doing one per interval, so a backlog clears promptly.
  while (await processOne()) {
    /* keep going while work remains */
  }
}

/**
 * Starts the worker. Safe to call once per process; returns whether it actually started.
 */
export async function startAssemblyWorker(): Promise<boolean> {
  if (running) return ready;
  running = true;

  if (!(await isFfmpegAvailable())) {
    console.error(
      "[Assembly] ffmpeg was not found on PATH -- final reels will fall back to browser-side assembly, " +
        "which means a customer who closes the tab loses the video. Install ffmpeg in the runtime image.",
    );
    return false;
  }
  if (!hasServiceRoleStorage()) {
    console.error(
      "[Assembly] SUPABASE_SERVICE_ROLE_KEY is not set -- the worker cannot upload finished reels, " +
        "so assembly stays in the browser. Set it to enable server-side delivery.",
    );
    return false;
  }

  ready = true;
  console.log("[Assembly] worker started");

  const loop = async () => {
    try {
      await tick();
      setTimeout(loop, POLL_INTERVAL_MS).unref();
    } catch (error) {
      console.error("[Assembly] worker tick failed:", error);
      setTimeout(loop, ERROR_BACKOFF_MS).unref();
    }
  };
  void loop();
  return true;
}
