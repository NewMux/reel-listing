import { updateVideoProject } from "./db";

export const FINAL_PREVIEW_URL = "/manus-storage/vistaflow-demo-final_adcb2313.mp4";

const SHOT_BLUEPRINTS = [
  { roomType: "Exterior", prompt: "Slow cinematic rise revealing the facade, warm golden-hour light." },
  { roomType: "Living room", prompt: "Gentle push-in across the living space, soft afternoon light." },
  { roomType: "Kitchen", prompt: "Measured pan across the kitchen surfaces, bright natural light." },
  { roomType: "Dining room", prompt: "Smooth lateral move past the dining setting, calm editorial light." },
  { roomType: "Primary bedroom", prompt: "Slow dolly toward the window, quiet morning light." },
  { roomType: "Bathroom", prompt: "Subtle floating camera movement, clean reflective light." },
  { roomType: "Outdoor living", prompt: "Slow arc around the terrace, late-afternoon warmth." },
  { roomType: "View", prompt: "Steady reveal toward the horizon, airy blue-hour atmosphere." },
  { roomType: "Detail", prompt: "Close, delicate drift across the architectural detail, soft contrast." },
  { roomType: "Closing frame", prompt: "Unhurried pull-back to the hero composition, polished twilight light." },
] as const;

type ShotState = "queued" | "analyzing" | "ready" | "generating" | "complete";

type Shot = {
  index: number;
  sourceUrl: string;
  roomType: string;
  prompt: string;
  state: ShotState;
  clipUrl: string | null;
};

type RenderJob = {
  jobId: string;
  projectId: number;
  userId: number;
  status: "Processing" | "Done" | "Failed";
  phase: "analysis" | "generation" | "assembly" | "complete" | "failed";
  currentStep: string;
  overallProgress: number;
  startedAt: number;
  finalVideoUrl: string | null;
  shots: Shot[];
};

export type RenderStatusSnapshot = {
  jobId: string | null;
  status: "Review" | "Processing" | "Done" | "Failed";
  phase: RenderJob["phase"] | "review";
  currentStep: string;
  overallProgress: number;
  completedShots: number;
  totalShots: number;
  finalVideoUrl: string | null;
  shots: Shot[];
};

const jobs = new Map<number, RenderJob>();

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

export function getShotPlan(mediaUrls: string[]) {
  return mediaUrls.map((sourceUrl, index) => {
    const blueprint = SHOT_BLUEPRINTS[index % SHOT_BLUEPRINTS.length];
    return {
      index,
      sourceUrl,
      roomType: blueprint.roomType,
      prompt: blueprint.prompt,
    };
  });
}

function makeShots(mediaUrls: string[], state: ShotState = "queued"): Shot[] {
  return getShotPlan(mediaUrls).map(shot => ({ ...shot, state, clipUrl: null }));
}

function snapshot(job: RenderJob): RenderStatusSnapshot {
  return {
    jobId: job.jobId,
    status: job.status,
    phase: job.phase,
    currentStep: job.currentStep,
    overallProgress: job.overallProgress,
    completedShots: job.shots.filter(shot => shot.state === "complete").length,
    totalShots: job.shots.length,
    finalVideoUrl: job.finalVideoUrl,
    shots: job.shots,
  };
}

function fallbackSnapshot(projectStatus: string, mediaUrls: string[], finalVideoUrl: string | null): RenderStatusSnapshot {
  if (projectStatus === "Done") {
    return {
      jobId: null,
      status: "Done",
      phase: "complete",
      currentStep: "Your reel is ready to share.",
      overallProgress: 100,
      completedShots: mediaUrls.length,
      totalShots: mediaUrls.length,
      finalVideoUrl,
      shots: makeShots(mediaUrls, "complete"),
    };
  }

  if (projectStatus === "Processing") {
    return {
      jobId: null,
      status: "Processing",
      phase: "analysis",
      currentStep: "Preparing your shot list…",
      overallProgress: 0,
      completedShots: 0,
      totalShots: mediaUrls.length,
      finalVideoUrl: null,
      shots: makeShots(mediaUrls),
    };
  }

  return {
    jobId: null,
    status: projectStatus === "Review" ? "Review" : "Failed",
    phase: "review",
    currentStep: "Awaiting your approval.",
    overallProgress: 0,
    completedShots: 0,
    totalShots: mediaUrls.length,
    finalVideoUrl: null,
    shots: makeShots(mediaUrls),
  };
}

export function getRenderStatus(projectId: number, projectStatus: string, mediaUrls: string[], finalVideoUrl: string | null) {
  const job = jobs.get(projectId);
  return job ? snapshot(job) : fallbackSnapshot(projectStatus, mediaUrls, finalVideoUrl);
}

export function startRenderJob(userId: number, projectId: number, mediaUrls: string[]) {
  const existing = jobs.get(projectId);
  if (existing && existing.status === "Processing") return snapshot(existing);

  const job: RenderJob = {
    jobId: crypto.randomUUID(),
    projectId,
    userId,
    status: "Processing",
    phase: "analysis",
    currentStep: "Analyzing each property photo…",
    overallProgress: 3,
    startedAt: Date.now(),
    finalVideoUrl: null,
    shots: makeShots(mediaUrls),
  };
  jobs.set(projectId, job);
  void runRenderJob(job);
  return snapshot(job);
}

async function runRenderJob(job: RenderJob) {
  try {
    for (let index = 0; index < job.shots.length; index += 1) {
      const shot = job.shots[index];
      shot.state = "analyzing";
      job.phase = "analysis";
      job.currentStep = `Reading shot ${index + 1} of ${job.shots.length}…`;
      job.overallProgress = Math.min(24, 4 + Math.round(((index + 1) / job.shots.length) * 20));
      await wait(260);
      shot.state = "ready";
    }

    for (let index = 0; index < job.shots.length; index += 1) {
      const shot = job.shots[index];
      shot.state = "generating";
      job.phase = "generation";
      job.currentStep = `Generating clip ${index + 1} of ${job.shots.length}…`;
      job.overallProgress = 25 + Math.round((index / job.shots.length) * 60);
      await wait(420);
      shot.state = "complete";
      job.overallProgress = 25 + Math.round(((index + 1) / job.shots.length) * 60);
    }

    job.phase = "assembly";
    job.currentStep = "Stitching clips with clean crossfades…";
    job.overallProgress = 92;
    await wait(650);
    job.phase = "complete";
    job.status = "Done";
    job.overallProgress = 100;
    job.currentStep = "Your reel is ready to share.";
    job.finalVideoUrl = FINAL_PREVIEW_URL;

    try {
      await updateVideoProject(job.userId, job.projectId, {
        status: "Done",
        finalVideoUrl: FINAL_PREVIEW_URL,
      });
    } catch (error) {
      console.warn("[Render] Preview completed in memory; project persistence was unavailable.", error);
    }
  } catch (error) {
    job.status = "Failed";
    job.phase = "failed";
    job.currentStep = error instanceof Error ? error.message : "Render failed. Please try again.";
  }
}
