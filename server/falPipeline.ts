import { fal } from "@fal-ai/client";
import type { VideoProject } from "../drizzle/schema";
import { FAL_CLIP_SECONDS, FAL_IMAGE_TO_VIDEO_MODEL } from "../shared/video";
import { ENV } from "./_core/env";
import { getProjectRenderStatus, type RenderStatusSnapshot } from "./renderPipeline";
import { storageGetSignedUrl } from "./storage";
import { updateVideoProject } from "./db";

function getFalClient() {
  if (!ENV.falKey) {
    throw new Error("fal.ai is not configured yet. Add FAL_KEY to the server environment before rendering.");
  }
  fal.config({ credentials: ENV.falKey });
  return fal;
}

function buildPrompt(index: number, project: VideoProject) {
  const propertyContext = [project.title, project.location, project.description].filter(Boolean).join(". ");
  const movements = [
    "slow cinematic push-in",
    "gentle left-to-right camera drift",
    "measured upward reveal",
    "subtle parallax movement",
  ];
  return `Create a refined real-estate property video from this still image. ${movements[index % movements.length]}, natural light, stable architecture, realistic materials, premium editorial property-film style, no people, no text, no logos, no warping. Property context: ${propertyContext || "high-end property listing"}. Keep the structure, room layout, furniture, and finishes faithful to the reference image.`;
}

function normalizeClipUrl(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const video = (value as { video?: { url?: unknown } }).video;
  return video && typeof video.url === "string" ? video.url : null;
}

function asStringArray(value: unknown, length: number) {
  if (!Array.isArray(value)) return Array.from({ length }, () => null as string | null);
  return Array.from({ length }, (_, index) => typeof value[index] === "string" ? value[index] : null);
}

export async function submitFalRender(userId: number, project: VideoProject) {
  const client = getFalClient();
  const signedImages = await Promise.all(project.mediaKeys.map(key => storageGetSignedUrl(key)));
  const responses = await Promise.all(signedImages.map((imageUrl, index) => client.queue.submit(FAL_IMAGE_TO_VIDEO_MODEL, {
    input: {
      prompt: buildPrompt(index, project),
      image_url: imageUrl,
      duration: String(FAL_CLIP_SECONDS) as "5" | "10",
      negative_prompt: "blur, distort, low quality, warped architecture, duplicated furniture, people, text, watermark",
      cfg_scale: 0.5,
    },
  })));
  const requestIds = responses.map(response => response.request_id);

  const emptyClips = Array.from({ length: project.mediaUrls.length }, () => null as string | null);
  await updateVideoProject(userId, project.id, {
    falRequestIds: requestIds,
    clipUrls: emptyClips,
    renderProgress: 0,
    renderPhase: "generating",
    renderError: null,
  });

  return getProjectRenderStatus({
    ...project,
    falRequestIds: requestIds,
    clipUrls: emptyClips,
    renderProgress: 0,
    renderPhase: "generating",
    renderError: null,
  });
}

export async function refreshFalRender(userId: number, project: VideoProject): Promise<RenderStatusSnapshot> {
  if (!project.falRequestIds?.length) return getProjectRenderStatus(project);
  const client = getFalClient();
  const clipUrls = asStringArray(project.clipUrls, project.mediaUrls.length);
  let failedMessage: string | null = null;

  await Promise.all(project.falRequestIds.map(async (requestId, index) => {
    if (!requestId || clipUrls[index]) return;
    try {
      const status = await client.queue.status(FAL_IMAGE_TO_VIDEO_MODEL, { requestId, logs: false });
      const state = status.status as string;
      if (state === "COMPLETED") {
        const result = await client.queue.result(FAL_IMAGE_TO_VIDEO_MODEL, { requestId });
        clipUrls[index] = normalizeClipUrl(result.data);
        if (!clipUrls[index]) failedMessage = `fal.ai returned no video for photo ${index + 1}.`;
      } else if (state === "FAILED") {
        failedMessage = `fal.ai could not render photo ${index + 1}.`;
      }
    } catch (error) {
      failedMessage = error instanceof Error ? error.message : `fal.ai could not render photo ${index + 1}.`;
    }
  }));

  const completed = clipUrls.filter(Boolean).length;
  const total = project.mediaUrls.length;
  const renderPhase = failedMessage ? "failed" : completed === total ? "assembly" : "generating";
  const renderProgress = renderPhase === "assembly" ? 95 : Math.round((completed / total) * 90);
  await updateVideoProject(userId, project.id, {
    clipUrls,
    renderProgress,
    renderPhase,
    renderError: failedMessage,
  });

  return getProjectRenderStatus({
    ...project,
    clipUrls,
    renderProgress,
    renderPhase,
    renderError: failedMessage,
  });
}
