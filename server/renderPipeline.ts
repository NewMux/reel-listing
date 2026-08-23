export const CINEMATIC_CLIP_SECONDS = 10;

type ShotState = "queued" | "rendering" | "complete";

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
  phase: "generation" | "assembly" | "complete" | "failed";
  currentStep: string;
  overallProgress: number;
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

const SHOT_BLUEPRINTS = [
  { roomType: "Exterior", prompt: "Slow cinematic push-in with a refined editorial feel." },
  { roomType: "Living room", prompt: "Gentle left-to-right drift across the property details." },
  { roomType: "Kitchen", prompt: "Measured upward reveal with soft natural movement." },
  { roomType: "Dining room", prompt: "Subtle parallax move that keeps the architecture calm and clear." },
  { roomType: "Primary bedroom", prompt: "Quiet forward reveal with a refined editorial feel." },
  { roomType: "Bathroom", prompt: "Subtle floating move through the detail." },
  { roomType: "Outdoor living", prompt: "Slow arc across the outdoor setting." },
  { roomType: "View", prompt: "Steady reveal toward the horizon." },
  { roomType: "Detail", prompt: "Delicate architectural drift across the material." },
  { roomType: "Closing frame", prompt: "Unhurried pull-back to the hero composition." },
] as const;

export function getShotPlan(mediaUrls: string[]) {
  return mediaUrls.map((sourceUrl, index) => {
    const blueprint = SHOT_BLUEPRINTS[index % SHOT_BLUEPRINTS.length];
    return { index, sourceUrl, roomType: blueprint.roomType, prompt: blueprint.prompt };
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
      phase: "generation",
      currentStep: "Ready to create your cinematic clips in this browser.",
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
    phase: "generation",
    currentStep: "Your browser is ready to build the cinematic clips.",
    overallProgress: 0,
    finalVideoUrl: null,
    shots: makeShots(mediaUrls),
  };
  jobs.set(projectId, job);
  return snapshot(job);
}
