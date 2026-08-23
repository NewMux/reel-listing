import { fal } from "@fal-ai/client";
import type { VideoProject } from "../drizzle/schema";
import {
  FAL_CLIP_SECONDS,
  FAL_IMAGE_TO_VIDEO_MODEL,
  FAL_VISION_LLM_MODEL,
  FAL_VISION_PROMPT_MODEL,
} from "../shared/video";
import { ENV } from "./_core/env";
import { getProjectRenderStatus, type RenderStatusSnapshot } from "./renderPipeline";
import { storageGetSignedUrl } from "./storage";
import { updateVideoProject } from "./db";

const VISION_SYSTEM_PROMPT = [
  "You are the cinematic director for a premium real-estate listing video.",
  "Return only one production-ready image-to-video prompt, with no title, markdown, quotes, or explanation.",
  "Describe the visible room or exterior accurately, then specify one restrained camera move, natural light behavior, and an elegant editorial mood.",
  "Preserve the reference image exactly: do not invent rooms, furniture, architecture, windows, landscaping, people, signs, logos, or text.",
  "Keep the result realistic and suitable for a five-second property clip.",
].join(" ");

function getFalClient() {
  if (!ENV.falKey) {
    throw new Error("fal.ai is not configured yet. Add FAL_KEY to the server environment before rendering.");
  }
  fal.config({ credentials: ENV.falKey });
  return fal;
}

function propertyContext(project: VideoProject) {
  return [project.title, project.location, project.description].filter(Boolean).join(". ") || "high-end property listing";
}

function fallbackPrompt(index: number, project: VideoProject) {
  const movements = [
    "slow cinematic push-in",
    "gentle left-to-right camera drift",
    "measured upward reveal",
    "subtle parallax movement",
  ];
  return `Create a refined real-estate property video from this still image. Use a ${movements[index % movements.length]}, natural light, stable architecture, realistic materials, premium editorial property-film style, no people, no text, no logos, no warping. Property context: ${propertyContext(project)}. Keep the structure, room layout, furniture, and finishes faithful to the reference image.`;
}

function promptInstruction(index: number, project: VideoProject) {
  return [
    `This is property photo ${index + 1}.`,
    `Listing context: ${propertyContext(project)}.`,
    "Write the complete prompt that will be sent to an image-to-video model.",
    "The motion must be subtle and physically plausible for a five-second cinematic real-estate shot.",
  ].join(" ");
}

function normalizePrompt(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const output = (value as { output?: unknown }).output;
  if (typeof output !== "string") return null;
  const prompt = output.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/i, "").replace(/^prompt:\s*/i, "").trim();
  return prompt.length >= 20 ? prompt.slice(0, 2_000) : null;
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

function allReady(values: (string | null)[], length: number) {
  return values.length === length && values.every(Boolean);
}

async function submitVisionPromptJobs(client: typeof fal, signedImages: string[], project: VideoProject) {
  const responses = await Promise.all(signedImages.map((imageUrl, index) => client.queue.submit(FAL_VISION_PROMPT_MODEL, {
    input: {
      image_urls: [imageUrl],
      prompt: promptInstruction(index, project),
      system_prompt: VISION_SYSTEM_PROMPT,
      model: FAL_VISION_LLM_MODEL,
      temperature: 0.2,
      max_tokens: 220,
    },
  })));
  return responses.map(response => response.request_id);
}

async function submitVideoJobs(client: typeof fal, signedImages: string[], prompts: string[]) {
  const responses = await Promise.all(signedImages.map((imageUrl, index) => client.queue.submit(FAL_IMAGE_TO_VIDEO_MODEL, {
    input: {
      prompt: prompts[index],
      image_url: imageUrl,
      duration: String(FAL_CLIP_SECONDS) as "5" | "10",
      negative_prompt: "blur, distort, low quality, warped architecture, duplicated furniture, people, text, watermark",
      cfg_scale: 0.5,
    },
  })));
  return responses.map(response => response.request_id);
}

export async function submitFalRender(userId: number, project: VideoProject, accessToken?: string | null) {
  const client = getFalClient();
  const signedImages = await Promise.all(project.mediaKeys.map(key => storageGetSignedUrl(key, accessToken ?? undefined)));
  const promptRequestIds = await submitVisionPromptJobs(client, signedImages, project);
  const emptyPrompts = Array.from({ length: project.mediaUrls.length }, () => null as string | null);
  const emptyClips = Array.from({ length: project.mediaUrls.length }, () => null as string | null);

  await updateVideoProject(userId, project.id, {
    promptRequestIds,
    generatedPrompts: emptyPrompts,
    falRequestIds: [],
    clipUrls: emptyClips,
    renderProgress: 0,
    renderPhase: "generating",
    renderError: null,
  });

  return getProjectRenderStatus({
    ...project,
    status: "Processing",
    promptRequestIds,
    generatedPrompts: emptyPrompts,
    falRequestIds: [],
    clipUrls: emptyClips,
    renderProgress: 0,
    renderPhase: "generating",
    renderError: null,
  });
}

export async function refreshFalRender(userId: number, project: VideoProject, accessToken?: string | null): Promise<RenderStatusSnapshot> {
  const promptRequestIds = asStringArray(project.promptRequestIds, project.mediaUrls.length);
  const generatedPrompts = asStringArray(project.generatedPrompts, project.mediaUrls.length);
  const signedImages = project.mediaKeys.length === project.mediaUrls.length
    ? await Promise.all(project.mediaKeys.map(key => storageGetSignedUrl(key, accessToken ?? undefined)))
    : [];
  const client = getFalClient();
  let failedMessage: string | null = null;

  if (promptRequestIds.some(Boolean) && !allReady(generatedPrompts, project.mediaUrls.length)) {
    await Promise.all(promptRequestIds.map(async (requestId, index) => {
      if (!requestId || generatedPrompts[index]) return;
      try {
        const status = await client.queue.status(FAL_VISION_PROMPT_MODEL, { requestId, logs: false });
        const state = status.status as string;
        if (state === "COMPLETED") {
          const result = await client.queue.result(FAL_VISION_PROMPT_MODEL, { requestId });
          generatedPrompts[index] = normalizePrompt(result.data);
          if (!generatedPrompts[index]) failedMessage = `fal.ai could not create direction for photo ${index + 1}.`;
        } else if (state === "FAILED") {
          failedMessage = `fal.ai could not create direction for photo ${index + 1}.`;
        }
      } catch (error) {
        failedMessage = error instanceof Error ? error.message : `fal.ai could not create direction for photo ${index + 1}.`;
      }
    }));

    if (failedMessage) {
      await updateVideoProject(userId, project.id, { generatedPrompts, renderProgress: Math.round((generatedPrompts.filter(Boolean).length / project.mediaUrls.length) * 15), renderPhase: "failed", renderError: failedMessage });
      return getProjectRenderStatus({ ...project, promptRequestIds, generatedPrompts, renderProgress: 0, renderPhase: "failed", renderError: failedMessage });
    }

    if (!allReady(generatedPrompts, project.mediaUrls.length)) {
      const progress = Math.round((generatedPrompts.filter(Boolean).length / project.mediaUrls.length) * 15);
      await updateVideoProject(userId, project.id, { generatedPrompts, renderProgress: progress, renderPhase: "generating", renderError: null });
      return getProjectRenderStatus({ ...project, promptRequestIds, generatedPrompts, renderProgress: progress, renderPhase: "generating", renderError: null });
    }
  }

  const prompts = generatedPrompts.map((prompt, index) => prompt || fallbackPrompt(index, project));
  let requestIds = asStringArray(project.falRequestIds, project.mediaUrls.length);
  const clipUrls = asStringArray(project.clipUrls, project.mediaUrls.length);

  if (!allReady(requestIds, project.mediaUrls.length)) {
    if (!signedImages.length) throw new Error("Property images could not be prepared for fal.ai.");
    requestIds = await submitVideoJobs(client, signedImages, prompts);
    await updateVideoProject(userId, project.id, {
      promptRequestIds,
      generatedPrompts: prompts,
      falRequestIds: requestIds,
      clipUrls,
      renderProgress: 15,
      renderPhase: "generating",
      renderError: null,
    });
    return getProjectRenderStatus({ ...project, promptRequestIds, generatedPrompts: prompts, falRequestIds: requestIds, clipUrls, renderProgress: 15, renderPhase: "generating", renderError: null });
  }

  await Promise.all(requestIds.map(async (requestId, index) => {
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
  const renderProgress = renderPhase === "assembly" ? 95 : 15 + Math.round((completed / total) * 75);
  await updateVideoProject(userId, project.id, {
    promptRequestIds,
    generatedPrompts: prompts,
    falRequestIds: requestIds,
    clipUrls,
    renderProgress,
    renderPhase,
    renderError: failedMessage,
  });

  return getProjectRenderStatus({
    ...project,
    promptRequestIds,
    generatedPrompts: prompts,
    falRequestIds: requestIds,
    clipUrls,
    renderProgress,
    renderPhase,
    renderError: failedMessage,
  });
}
