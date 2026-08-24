import type { VideoProject } from "../drizzle/schema";
import { FAL_CLIP_SECONDS } from "../shared/video";

export { FAL_CLIP_SECONDS };
export const CINEMATIC_CLIP_SECONDS = FAL_CLIP_SECONDS;

type ShotState = "queued" | "rendering" | "complete" | "failed";

export type Shot = {
  index: number;
  sourceUrl: string;
  roomType: string;
  prompt: string;
  state: ShotState;
  clipUrl: string | null;
};

export type RenderStatusSnapshot = {
  jobId: string | null;
  status: "Review" | "Processing" | "Done";
  phase: "review" | "generating" | "assembly" | "complete" | "failed";
  currentStep: string;
  overallProgress: number;
  completedPrompts: number;
  completedShots: number;
  totalShots: number;
  finalVideoUrl: string | null;
  generatedPrompts: (string | null)[];
  clipUrls: (string | null)[];
  shots: Shot[];
  error: string | null;
};

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

export function getShotPlan(mediaUrls: string[], generatedPrompts: (string | null)[] = []) {
  return mediaUrls.map((sourceUrl, index) => {
    const blueprint = SHOT_BLUEPRINTS[index % SHOT_BLUEPRINTS.length];
    return {
      index,
      sourceUrl,
      roomType: blueprint.roomType,
      prompt: generatedPrompts[index] || blueprint.prompt,
    };
  });
}

function makeShots(
  mediaUrls: string[],
  clipUrls: (string | null)[],
  requestIds: (string | null)[],
  phase: RenderStatusSnapshot["phase"],
  generatedPrompts: (string | null)[],
): Shot[] {
  return getShotPlan(mediaUrls, generatedPrompts).map(shot => ({
    ...shot,
    state: clipUrls[shot.index] || phase === "complete"
      ? "complete"
      : phase === "failed" && requestIds[shot.index]
        ? "failed"
        : phase === "generating" && requestIds[shot.index]
          ? "rendering"
          : "queued",
    clipUrl: clipUrls[shot.index] || null,
  }));
}

export function buildRenderSnapshot(input: {
  projectId: number;
  status: string;
  mediaUrls: string[];
  finalVideoUrl?: string | null;
  promptRequestIds?: (string | null)[] | null;
  generatedPrompts?: (string | null)[] | null;
  falRequestIds?: (string | null)[] | null;
  clipUrls?: (string | null)[] | null;
  renderProgress?: number | null;
  renderPhase?: RenderStatusSnapshot["phase"] | "idle" | null;
  renderError?: string | null;
}): RenderStatusSnapshot {
  const promptRequestIds = input.promptRequestIds || [];
  const generatedPrompts = input.generatedPrompts || [];
  const requestIds = input.falRequestIds || [];
  const clipUrls = input.clipUrls || [];
  const totalShots = input.mediaUrls.length;
  const completedPrompts = generatedPrompts.filter(Boolean).length;
  const normalizedStatus = input.status === "Done" ? "Done" : input.status === "Processing" ? "Processing" : "Review";
  const completedShots = normalizedStatus === "Done" ? totalShots : clipUrls.filter(Boolean).length;
  const promptsPending = normalizedStatus === "Processing" && promptRequestIds.length > 0 && completedPrompts < totalShots;
  const phase = normalizedStatus === "Done"
    ? "complete"
    : normalizedStatus === "Review"
      ? "review"
      : input.renderPhase === "failed"
        ? "failed"
        : input.renderPhase === "assembly" || completedShots === totalShots
          ? "assembly"
          : "generating";

  const currentStep = phase === "review"
    ? "Awaiting your approval."
    : phase === "failed"
      ? input.renderError || "The cinematic render needs another try."
      : phase === "assembly"
        ? "All clips are ready for final assembly."
        : promptsPending
          ? completedPrompts > 0
            ? `Creating AI direction ${Math.min(completedPrompts + 1, totalShots)} of ${totalShots}…`
            : "Studying each property photo to create cinematic direction…"
          : completedShots > 0
            ? `Generating cinematic clip ${Math.min(completedShots + 1, totalShots)} of ${totalShots}…`
            : "Preparing AI direction before cinematic rendering…";

  const overallProgress = normalizedStatus === "Done"
    ? 100
    : phase === "assembly"
      ? Math.max(95, input.renderProgress || 95)
      : promptsPending
        ? Math.max(0, Math.min(15, input.renderProgress || Math.round((completedPrompts / totalShots) * 15)))
        : Math.max(15, Math.min(90, input.renderProgress || 15));

  return {
    jobId: null,
    status: normalizedStatus,
    phase,
    currentStep,
    overallProgress,
    completedPrompts,
    completedShots,
    totalShots,
    finalVideoUrl: input.finalVideoUrl || null,
    generatedPrompts,
    clipUrls,
    shots: makeShots(input.mediaUrls, clipUrls, requestIds, phase, generatedPrompts),
    error: input.renderError || null,
  };
}

export function getRenderStatus(
  projectId: number,
  projectStatus: string,
  mediaUrls: string[],
  finalVideoUrl: string | null,
  clipUrls: (string | null)[] = [],
  requestIds: (string | null)[] = [],
  renderProgress = projectStatus === "Done" ? 100 : 0,
  renderPhase: RenderStatusSnapshot["phase"] | "idle" = "idle",
  renderError: string | null = null,
  generatedPrompts: (string | null)[] = [],
  promptRequestIds: (string | null)[] = [],
) {
  return buildRenderSnapshot({ projectId, status: projectStatus, mediaUrls, finalVideoUrl, clipUrls, falRequestIds: requestIds, renderProgress, renderPhase, renderError, generatedPrompts, promptRequestIds });
}

export function getProjectRenderStatus(project: VideoProject) {
  return buildRenderSnapshot({
    projectId: project.id,
    status: project.status,
    mediaUrls: project.mediaUrls,
    finalVideoUrl: project.finalVideoUrl,
    promptRequestIds: project.promptRequestIds,
    generatedPrompts: project.generatedPrompts,
    falRequestIds: project.falRequestIds,
    clipUrls: project.clipUrls,
    renderProgress: project.renderProgress,
    renderPhase: project.renderPhase,
    renderError: project.renderError,
  });
}
