import { fal } from "@fal-ai/client";
import type { VideoProject } from "../drizzle/schema";
import {
  FAL_CLIP_SECONDS,
  FAL_GENERATE_AUDIO,
  FAL_IMAGE_TO_VIDEO_MODEL,
  FAL_PROMPT_MAX_CHARS,
  FAL_VISION_LLM_MODEL,
  FAL_VISION_PROMPT_MODEL,
} from "../shared/video";
import { ENV } from "./_core/env";
import { getProjectRenderStatus, type RenderStatusSnapshot } from "./renderPipeline";
import { storageGetSignedUrl } from "./storage";
import { updateVideoProject } from "./db";

const VISION_SYSTEM_PROMPT = [
  "You are the shot designer for a premium architectural real-estate film.",
  "Analyze only the attached property photo and return one JSON object with exactly these string keys: shotType, confidence, timeOfDay, cameraMove, lighting, focus.",
  "shotType must be one of: outdoor-view, living-room, kitchen-dining, bedroom, bathroom, detail, unknown.",
  "confidence must be one of: high, medium, low. Use low whenever the room type is not clearly supported by visible evidence.",
  "timeOfDay must be one of: morning, midday, afternoon, evening, night, unknown. Infer it only from visible cues such as sky tone, shadow length, window light color, or interior artificial lighting. Use unknown whenever the photo has no reliable time-of-day evidence, such as an interior shot with no visible windows or sky.",
  "cameraMove must describe one restrained, physically plausible ten-second eye-level move using a grounded gimbal, dolly, slider, or shallow arc, and must follow the required movement assignment in the user prompt.",
  "Unless shotType is outdoor-view, the move must stay committed to the interior space: never describe the camera traveling toward, through, or out a window, glass door, or mirror, even if it is the brightest or most visually prominent feature in the photo.",
  "lighting must describe only light behavior visible or safely implied by the reference image, and must remain consistent with the detected timeOfDay.",
  "focus must name one visible architectural or lifestyle feature without inventing anything.",
  "Never claim a room or object that is not clearly visible. If uncertain, use unknown and neutral language.",
  "Never choose a crane, lift, drop, tilt, overhead, drone, low-to-high angle, high-to-low angle, orbit, spin, or floating camera move. Return JSON only. No markdown, title, explanation, or extra keys.",
].join(" ");

const MOVEMENT_DIRECTIVES = [
  "a forward gimbal push that follows the room’s strongest interior depth line while staying inside the space, stopping short of any window or exterior opening",
  "a smooth lateral gimbal track that creates clear foreground-to-background parallax",
  "a measured diagonal gimbal move that travels across the room’s main perspective",
  "a gentle gimbal arc around the dominant architectural feature while keeping verticals straight",
  "a smooth parallel gimbal track along the nearest visible architectural edge at constant height",
  "a slow backward gimbal pull at constant height that reveals more context while preserving the exact composition",
  "a precise side-to-side gimbal glide past the nearest visible foreground edge",
  "a calm horizontal corner-to-corner gimbal travel at constant height that follows the strongest sightline",
  "a subtle forward-and-lateral gimbal drift across the room toward its brightest interior feature, stopping short of any window or exterior opening",
  "a short eye-level dolly move toward the nearest visible material plane",
] as const;

function movementDirective(index: number) {
  return MOVEMENT_DIRECTIVES[index % MOVEMENT_DIRECTIVES.length];
}

const CINEMATIC_LOCK = [
  "Use the supplied image as the exact first frame and preserve its room, architecture, furniture, finishes, windows, landscaping, horizon, and proportions.",
  "Create a premium editorial property-film shot with a natural architectural perspective, restrained luxury, realistic exposure, subtle depth, and believable parallax.",
  "Use one continuous ten-second camera move that starts immediately on the first frame, with a single physically plausible grounded forward, lateral, diagonal, or shallow arcing travel at constant camera height selected to suit the composition, sustained parallax through the middle, and natural motion through the final frame.",
  "The camera should feel as if it is operated on a stabilized professional gimbal at eye level, with purposeful grounded movement from start to finish, constant height, smooth acceleration and deceleration, no static opening or closing hold, no abrupt changes, and no presentation-style slideshow motion.",
  "Use a rectilinear 24–35mm architectural-lens look with straight verticals; no handheld shake, snap zoom, whip pan, time lapse, orbiting spin, or exaggerated lens distortion.",
  "Keep the shot camera-led and continuous. Do not stage a sequence of visual steps, object reveals, lighting changes, before-and-after moments, or artificial scene progression. Do not make the camera orbit, spin, or float through walls. Allow only minimal natural movement already supported by the image.",
  "No audio. Generate a completely silent video with no voice, dialogue, ambience, sound effects, or music.",
  "Do not change the room, add or remove furniture, move walls, invent doors or windows, alter the view, or introduce people, animals, text, logos, or watermarks.",
].join(" ");

function cleanDirection(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length >= 3 ? cleaned.slice(0, 360) : fallback;
}

function limitPrompt(value: string) {
  const normalized = value.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length <= FAL_PROMPT_MAX_CHARS) return normalized;
  return `${normalized.slice(0, FAL_PROMPT_MAX_CHARS - 1).trimEnd()}.`;
}

function compactDirection(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}.`;
}

function normalizeConfidence(value: unknown) {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  return text === "high" || text === "medium" ? text : "low";
}

function normalizeShotType(value: unknown, confidence: string) {
  if (confidence === "low") return "unknown";
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text.includes("outdoor") || text.includes("terrace") || text.includes("balcony") || text.includes("view") || text.includes("water")) return "outdoor-view";
  if (text.includes("bath")) return "bathroom";
  if (text.includes("bed") || text.includes("sleep")) return "bedroom";
  if (text.includes("kitchen") || text.includes("dining")) return "kitchen-dining";
  if (text.includes("living") || text.includes("lounge")) return "living-room";
  if (text.includes("detail") || text.includes("material")) return "detail";
  return "unknown";
}

function normalizeTimeOfDay(value: unknown) {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text.includes("morning") || text.includes("sunrise") || text.includes("dawn")) return "morning";
  if (text.includes("midday") || text.includes("noon")) return "midday";
  if (text.includes("afternoon")) return "afternoon";
  if (text.includes("evening") || text.includes("dusk") || text.includes("sunset") || text.includes("golden hour")) return "evening";
  if (text.includes("night")) return "night";
  return "unknown";
}

function fallbackDirection(index: number) {
  const directions = [
    { shotType: "outdoor-view", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[0], lighting: "sunlight remains natural and stable while highlights on the water or glass shimmer subtly", focus: "the strongest view and the relationship between the terrace edge and the horizon" },
    { shotType: "living-room", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[1], lighting: "soft daylight falls naturally through the glazing with gentle shadow continuity", focus: "the room’s main seating composition and its strongest architectural sightline" },
    { shotType: "kitchen-dining", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[2], lighting: "warm practical light and ambient daylight remain balanced without changing the room’s exposure", focus: "the material contrast, joinery, and connection between kitchen and dining areas" },
    { shotType: "bedroom", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[3], lighting: "natural light gently shifts across the floor and fabric while the room remains evenly exposed", focus: "the bed, primary wall, and the room’s sense of calm and openness" },
    { shotType: "bathroom", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[4], lighting: "warm architectural lighting creates restrained specular movement across the stone and metal finishes", focus: "the vanity, mirrors, and premium material details" },
    { shotType: "detail", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[5], lighting: "the visible light remains stable with gentle tonal continuity", focus: "the strongest visible finish or architectural detail" },
    { shotType: "living-room", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[6], lighting: "soft daylight remains consistent across the visible surfaces", focus: "the nearest visible material and its relationship to the room" },
    { shotType: "kitchen-dining", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[7], lighting: "ambient daylight and practical light remain balanced and unchanged", focus: "the strongest visible sightline through the space" },
    { shotType: "outdoor-view", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[8], lighting: "the natural exterior light remains stable with restrained highlight movement", focus: "the brightest opening and the view beyond it" },
    { shotType: "detail", timeOfDay: "unknown", cameraMove: MOVEMENT_DIRECTIVES[9], lighting: "the visible light remains stable across the material surface", focus: "the most important visible material detail" },
  ];
  return directions[index % directions.length];
}

export function buildCinematicPrompt(index: number, direction: { shotType: string; timeOfDay: string; cameraMove: string; lighting: string; focus: string }, project: VideoProject) {
  const cameraMove = compactDirection(direction.cameraMove, 220);
  const lighting = compactDirection(direction.lighting, 140);
  const focus = compactDirection(direction.focus, 140);
  return limitPrompt([
    CINEMATIC_LOCK,
    `Shot type: ${direction.shotType}. Classification confidence is conservative; if the room is not clearly visible, treat it as a property detail rather than guessing.`,
    direction.timeOfDay === "unknown"
      ? "Time of day is not clearly evident from the photo; keep the lighting exactly as shown without implying a specific time of day."
      : `Time of day: ${direction.timeOfDay}. Preserve the natural lighting condition of this time of day throughout the shot; do not introduce artificial day-to-night, night-to-day, or golden-hour transitions that are not already present in the photo.`,
    `Required movement variation for this shot: ${movementDirective(index)}. Use this movement family and do not repeat a generic lateral pan.`,
    direction.shotType === "outdoor-view"
      ? "The window, glazing, or open view may be part of the composition and the natural destination of the movement."
      : "Stay committed to this interior room for the full ten seconds: never travel toward, through, or out a window, glass door, or mirror, even if it is the brightest or most prominent feature in the photo. Keep the room's furniture and layout in frame throughout.",
    `Camera choreography: ${cameraMove}.`,
    `Light behavior: ${lighting}.`,
    `Visual focus: ${focus}.`,
    `This is shot ${index + 1} in a ${project.mediaUrls.length}-shot property film for ${propertyContext(project)}.`,
    "Generate a premium architectural image-to-video shot with Kling 3 Pro. Favor a smooth gimbal-like move, clear shot intention, realistic spatial depth, and continuity over generic lateral panning.",
  ].join(" "));
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

// Lets fal.ai notify us the instant a job finishes instead of only ever finding out on the
// next client poll -- keeps a render moving even if the customer closes the tab mid-generation.
// The webhook handler treats this purely as a "go re-check now" hint (see server/_core/webhooks.ts);
// it never trusts the webhook body itself, so this URL doesn't need to be a secret.
const FAL_WEBHOOK_URL = `${ENV.publicUrl.replace(/\/+$/, "")}/api/webhooks/fal`;

function propertyContext(project: VideoProject) {
  return [project.title, project.location, project.description].filter(Boolean).join(". ") || "high-end property listing";
}

function fallbackPrompt(index: number, project: VideoProject) {
  return [
    CINEMATIC_LOCK,
    `This is fallback shot ${index + 1} in a ${project.mediaUrls.length}-shot property film for ${propertyContext(project)}.`,
    "Use a smooth grounded eye-level gimbal push, lateral track, or shallow arc selected to suit the visible composition, with realistic parallax and a composed editorial finish.",
  ].join(" ");
}

function promptInstruction(index: number, project: VideoProject) {
  return [
    `This is property photo ${index + 1} of a ${project.mediaUrls.length}-photo listing sequence.`,
    `Listing context: ${propertyContext(project)}.`,
    `Required movement assignment: ${movementDirective(index)}. Return a cameraMove that follows this assignment without adding a second movement or a visual step sequence.`,
    "Analyze the attached image and return the requested JSON shot design. The final clip will be ten seconds long.",
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
    const parsed = JSON.parse(cleaned) as { shotType?: unknown; confidence?: unknown; timeOfDay?: unknown; cameraMove?: unknown; lighting?: unknown; focus?: unknown };
    const confidence = normalizeConfidence(parsed.confidence);
    const direction = {
      shotType: normalizeShotType(parsed.shotType, confidence),
      timeOfDay: normalizeTimeOfDay(parsed.timeOfDay),
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
      max_tokens: 260,
    },
    webhookUrl: FAL_WEBHOOK_URL,
  })));
  return responses.map(response => response.request_id);
}

async function submitVideoJobs(client: typeof fal, signedImages: string[], prompts: string[]) {
  const responses = await Promise.all(signedImages.map((imageUrl, index) => client.queue.submit(FAL_IMAGE_TO_VIDEO_MODEL, {
    input: {
      prompt: limitPrompt(prompts[index]),
      start_image_url: imageUrl,
      duration: String(FAL_CLIP_SECONDS) as "10",
      generate_audio: FAL_GENERATE_AUDIO,
      negative_prompt: "scene change, room change, invented architecture, new furniture, disappearing furniture, geometry drift, bending lines, warped perspective, lens wobble, snap zoom, whip pan, handheld shake, excessive motion, generic left-to-right pan, slideshow motion, static frame, visual step change, object reveal, lighting change, before-and-after effect, artificial light bloom, blur, distort, low quality, audio, voice, dialogue, music, people, animals, text, logo, watermark",
      cfg_scale: 0.5,
    },
    webhookUrl: FAL_WEBHOOK_URL,
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
        console.error(`[FalPipeline] vision prompt poll failed for project ${project.id}, photo ${index + 1}:`, error);
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
    const signedImages = project.mediaKeys.length === project.mediaUrls.length
      ? await getFalSourceUrls(project, accessToken)
      : [];
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
      console.error(`[FalPipeline] video render poll failed for project ${project.id}, photo ${index + 1}:`, error);
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
