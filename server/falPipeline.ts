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
  "You are the shot designer for a premium architectural real-estate film.",
  "Analyze only the attached property photo and return one JSON object with exactly these string keys: shotType, cameraMove, lighting, focus.",
  "shotType must be one of: outdoor-view, living-room, kitchen-dining, bedroom, bathroom, detail, unknown.",
  "cameraMove must describe one restrained, physically plausible five-second move using a stabilized dolly, slider, or gentle arc.",
  "lighting must describe only light behavior visible or safely implied by the reference image.",
  "focus must name one visible architectural or lifestyle feature without inventing anything.",
  "Never claim a room or object that is not clearly visible. If uncertain, use unknown and neutral language.",
  "Return JSON only. No markdown, title, explanation, or extra keys.",
].join(" ");

const CINEMATIC_LOCK = [
  "Use the supplied image as the exact first frame and preserve its room, architecture, furniture, finishes, windows, landscaping, horizon, and proportions.",
  "Create a premium architectural property-film shot: restrained luxury, natural perspective, stabilized camera, subtle depth and parallax, realistic exposure, and elegant editorial pacing.",
  "Begin with a brief settled hold, execute one continuous intentional camera move, then ease into a clean final hold within five seconds.",
  "Use a rectilinear 24–35mm architectural-lens look with straight verticals; no handheld shake, snap zoom, whip pan, time lapse, or exaggerated lens distortion.",
  "Animate only believable environmental motion such as a gentle change in daylight, water shimmer, curtain movement, or controlled specular highlights when supported by the image.",
  "Do not change the room, add or remove furniture, move walls, invent doors or windows, alter the view, or introduce people, animals, text, logos, or watermarks.",
].join(" ");

function cleanDirection(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length >= 3 ? cleaned.slice(0, 360) : fallback;
}

function normalizeShotType(value: unknown) {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text.includes("outdoor") || text.includes("terrace") || text.includes("balcony") || text.includes("view") || text.includes("water")) return "outdoor-view";
  if (text.includes("bath")) return "bathroom";
  if (text.includes("bed") || text.includes("sleep")) return "bedroom";
  if (text.includes("kitchen") || text.includes("dining")) return "kitchen-dining";
  if (text.includes("living") || text.includes("lounge")) return "living-room";
  if (text.includes("detail") || text.includes("material")) return "detail";
  return "unknown";
}

function fallbackDirection(index: number) {
  const directions = [
    { shotType: "outdoor-view", cameraMove: "a slow forward dolly with a barely perceptible arc that reveals depth toward the horizon", lighting: "sunlight remains natural and stable while highlights on the water or glass shimmer subtly", focus: "the strongest view and the relationship between the terrace edge and the horizon" },
    { shotType: "living-room", cameraMove: "a slow stabilized slider move that glides laterally past the nearest foreground detail toward the room beyond", lighting: "soft daylight falls naturally through the glazing with gentle shadow continuity", focus: "the room’s main seating composition and its strongest architectural sightline" },
    { shotType: "kitchen-dining", cameraMove: "a measured diagonal push-in that reveals the depth from the kitchen work plane toward the dining composition", lighting: "warm practical light and ambient daylight remain balanced without changing the room’s exposure", focus: "the material contrast, joinery, and connection between kitchen and dining areas" },
    { shotType: "bedroom", cameraMove: "a quiet lateral dolly toward the brightest opening, maintaining a calm eye-level perspective", lighting: "natural light gently shifts across the floor and fabric while the room remains evenly exposed", focus: "the bed, primary wall, and the room’s sense of calm and openness" },
    { shotType: "bathroom", cameraMove: "a slow precise dolly along the vanity line with a subtle foreground-to-background parallax", lighting: "warm architectural lighting creates restrained specular movement across the stone and metal finishes", focus: "the vanity, mirrors, and premium material details" },
  ];
  return directions[index % directions.length];
}

function buildCinematicPrompt(index: number, direction: { shotType: string; cameraMove: string; lighting: string; focus: string }, project: VideoProject) {
  return [
    CINEMATIC_LOCK,
    `Shot type: ${direction.shotType}.`,
    `Camera choreography: ${direction.cameraMove}.`,
    `Light behavior: ${direction.lighting}.`,
    `Visual focus: ${direction.focus}.`,
    `This is shot ${index + 1} in a five-second property sequence for ${propertyContext(project)}.`,
    "Generate a premium architectural image-to-video shot with Kling 3 Pro. Favor filmic movement, clear shot intention, realistic spatial depth, and continuity over generic lateral panning.",
  ].join(" ");
}

async function getFalSourceUrls(project: VideoProject, accessToken?: string | null) {
  return Promise.all(project.mediaKeys.map((key, index) => key.startsWith("pilot:")
    ? project.mediaUrls[index]
    : storageGetSignedUrl(key, accessToken ?? undefined)));
}

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
    `This is property photo ${index + 1} of a five-photo listing sequence.`,
    `Listing context: ${propertyContext(project)}.`,
    "Analyze the attached image and return the requested JSON shot design.",
    "Use only visible evidence. The shot design must prioritize exact-image preservation over decorative description.",
  ].join(" ");
}

function normalizeDirection(value: unknown, index: number, project: VideoProject) {
  const fallback = fallbackDirection(index);
  if (!value || typeof value !== "object") return buildCinematicPrompt(index, fallback, project);
  const output = (value as { output?: unknown }).output;
  if (typeof output !== "string") return buildCinematicPrompt(index, fallback, project);
  const cleaned = output.replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { shotType?: unknown; cameraMove?: unknown; lighting?: unknown; focus?: unknown };
    const direction = {
      shotType: normalizeShotType(parsed.shotType),
      cameraMove: cleanDirection(parsed.cameraMove, fallback.cameraMove),
      lighting: cleanDirection(parsed.lighting, fallback.lighting),
      focus: cleanDirection(parsed.focus, fallback.focus),
    };
    return buildCinematicPrompt(index, direction, project);
  } catch {
    return buildCinematicPrompt(index, { ...fallback, cameraMove: cleanDirection(cleaned, fallback.cameraMove) }, project);
  }
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
      start_image_url: imageUrl,
      duration: String(FAL_CLIP_SECONDS) as "5",
      generate_audio: false,
      negative_prompt: "scene change, room change, invented architecture, new furniture, disappearing furniture, geometry drift, bending lines, warped perspective, lens wobble, snap zoom, whip pan, handheld shake, excessive motion, artificial light bloom, blur, distort, low quality, people, animals, text, logo, watermark",
      cfg_scale: 0.5,
    },
  })));
  return responses.map(response => response.request_id);
}

export async function submitFalRender(userId: number, project: VideoProject, accessToken?: string | null) {
  const client = getFalClient();
  const signedImages = await getFalSourceUrls(project, accessToken);
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
    ? await getFalSourceUrls(project, accessToken)
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
          generatedPrompts[index] = normalizeDirection(result.data, index, project);
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
