import { fal } from "@fal-ai/client";
import type { ShotAnalysis, VideoProject } from "../drizzle/schema";
import {
  FAL_CLIP_SECONDS,
  FAL_GENERATE_AUDIO,
  FAL_IMAGE_TO_VIDEO_MODEL,
  FAL_MERGE_VIDEOS_MODEL,
  FAL_PROMPT_MAX_CHARS,
  FAL_VISION_LLM_MODEL,
  FAL_VISION_PROMPT_MODEL,
} from "../shared/video";
import { ENV } from "./_core/env";
import { clipCost } from "../shared/billing";
import { getProjectRenderStatus, type RenderStatusSnapshot } from "./renderPipeline";
import { storageGetSignedUrl } from "./storage";
import { claimRenderLock, getVideoProject, grantCredits, releaseRenderLock, spendCredits, updateVideoProject } from "./db";

// Clip length is now per-photo (project.clipDurations), so any prompt text that names the
// duration has to be built per-index instead of being a flat constant.
function visionSystemPrompt(durationSeconds: number) {
  return [
    "You are the shot designer for a premium architectural real-estate film.",
    "Analyze only the attached property photo and return one JSON object with exactly these string keys: shotType, confidence, timeOfDay, cameraMove, lighting, focus.",
    "shotType must be one of: outdoor-view, living-room, kitchen-dining, bedroom, bathroom, detail, unknown.",
    "confidence must be one of: high, medium, low. Use low whenever the room type is not clearly supported by visible evidence.",
    "timeOfDay must be one of: morning, midday, afternoon, evening, night, unknown. Infer it only from visible cues such as sky tone, shadow length, window light color, or interior artificial lighting. Use unknown whenever the photo has no reliable time-of-day evidence, such as an interior shot with no visible windows or sky.",
    `cameraMove must describe the one grounded, physically plausible ${durationSeconds}-second eye-level move that best fits this specific photo's actual room type and composition -- freely choose among a forward gimbal push, backward pull, lateral track, diagonal travel, gentle arc around a focal feature, side-to-side glide, corner-to-corner travel, or short dolly move based on what genuinely suits the space (for example an arc for a kitchen island, a forward glide for a hallway or entrance, a lateral track for a wide living area, a backward reveal for a compact room), not by rotating through a fixed list.`,
    "lighting must describe only light behavior visible or safely implied by the reference image, and must remain consistent with the detected timeOfDay.",
    "focus must name one visible architectural or lifestyle feature without inventing anything.",
    "Never claim a room or object that is not clearly visible. If uncertain, use unknown and neutral language.",
    "Never choose a crane, lift, drop, tilt, overhead, drone, low-to-high angle, high-to-low angle, orbit, spin, or floating camera move. Return JSON only. No markdown, title, explanation, or extra keys.",
  ].join(" ");
}

const MOVEMENT_DIRECTIVES = [
  "a forward gimbal push toward the strongest depth line",
  "a smooth lateral gimbal track that creates clear foreground-to-background parallax",
  "a measured diagonal gimbal move that travels across the room’s main perspective",
  "a gentle gimbal arc around the dominant architectural feature while keeping verticals straight",
  "a smooth parallel gimbal track along the nearest visible architectural edge at constant height",
  "a slow backward gimbal pull at constant height that reveals more context while preserving the exact composition",
  "a precise side-to-side gimbal glide past the nearest visible foreground edge",
  "a calm horizontal corner-to-corner gimbal travel at constant height that follows the strongest sightline",
  "a subtle forward-and-lateral gimbal drift toward the brightest visible opening",
  "a short eye-level dolly move toward the nearest visible material plane",
] as const;

function cinematicLock(durationSeconds: number) {
  return [
    "Use the supplied image as the exact first frame and preserve its room, architecture, furniture, finishes, windows, landscaping, horizon, and proportions.",
    "Create a premium editorial property-film shot with a natural architectural perspective, restrained luxury, realistic exposure, subtle depth, and believable parallax.",
    `Use one continuous ${durationSeconds}-second camera move that starts immediately on the first frame, with a single physically plausible grounded forward, lateral, diagonal, or shallow arcing travel at constant camera height selected to suit the composition, sustained parallax through the middle, and natural motion through the final frame.`,
    "The camera should feel as if it is operated on a stabilized professional gimbal at eye level, with purposeful grounded movement from start to finish, constant height, smooth acceleration and deceleration, no static opening or closing hold, no abrupt changes, and no presentation-style slideshow motion; movement stays visibly active throughout, never settling still mid-shot.",
    "Use a rectilinear 24–35mm architectural-lens look with straight verticals; no handheld shake, snap zoom, whip pan, time lapse, orbiting spin, or exaggerated lens distortion.",
    "Keep the shot camera-led and continuous. Do not stage a sequence of visual steps, object reveals, lighting changes, before-and-after moments, or artificial scene progression. Do not make the camera orbit, spin, or float through walls. Allow only minimal natural movement already supported by the image.",
    "No audio. Generate a completely silent video with no voice, dialogue, ambience, sound effects, or music.",
    "Do not change the room, add or remove furniture, move walls, invent doors or windows, alter the view, move a door, window, curtain, or object, let the subject drift out of frame, or introduce people, animals, text, logos, or watermarks.",
  ].join(" ");
}

function clipDuration(project: VideoProject, index: number) {
  return project.clipDurations?.[index] ?? FAL_CLIP_SECONDS;
}

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

// console.error's default inspection depth flattens a fal.ai ValidationError's nested
// `body.detail` into an unhelpful "[Object]" -- surface the real validation reason instead so a
// future failure like that is diagnosable from logs alone, not a guessing game.
function describeFalError(error: unknown) {
  if (error && typeof error === "object" && "body" in error) {
    try {
      return `${String(error)} ${JSON.stringify((error as { body?: unknown }).body)}`;
    } catch {
      // fall through to the generic branch below
    }
  }
  return error instanceof Error ? error.message : String(error);
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

export function buildCinematicPrompt(index: number, direction: ShotAnalysis, project: VideoProject) {
  // A client-supplied camera-move override (Review page) replaces only this one field -- every
  // other shotAnalysis field and all of cinematicLock's safety/style rules still apply.
  const cameraMoveSource = project.customCameraMoves?.[index] || direction.cameraMove;
  const cameraMove = compactDirection(cameraMoveSource, 220);
  const lighting = compactDirection(direction.lighting, 140);
  const focus = compactDirection(direction.focus, 140);
  const duration = clipDuration(project, index);
  // Ordered by how badly the render suffers if limitPrompt has to truncate the tail: the
  // per-photo camera choreography is the entire point of the vision-classification pipeline
  // and must never be cut, so it goes immediately after the fixed cinematicLock rules --
  // ahead of shot type/time-of-day/light/focus, which degrade gracefully with a generic
  // fallback if trimmed, and well ahead of the closing reinforcement line, which is pure
  // restatement and safe to lose first.
  return limitPrompt([
    cinematicLock(duration),
    `Camera choreography -- the movement chosen specifically for this room, not a repeated generic lateral pan: ${cameraMove}.`,
    direction.timeOfDay === "unknown"
      ? "Time of day is not clearly evident from the photo; keep the lighting exactly as shown without implying a specific time of day."
      : `Time of day: ${direction.timeOfDay}. Preserve the natural lighting condition of this time of day throughout the shot; do not introduce artificial day-to-night, night-to-day, or golden-hour transitions that are not already present in the photo.`,
    `Shot type: ${direction.shotType} (treat as a property detail if not clearly visible).`,
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
    cinematicLock(clipDuration(project, index)),
    `This is fallback shot ${index + 1} in a ${project.mediaUrls.length}-shot property film for ${propertyContext(project)}.`,
    "Use a smooth grounded eye-level gimbal push, lateral track, or shallow arc selected to suit the visible composition, with realistic parallax and a composed editorial finish.",
  ].join(" ");
}

function promptInstruction(index: number, project: VideoProject) {
  return [
    `This is property photo ${index + 1} of a ${project.mediaUrls.length}-photo listing sequence.`,
    `Listing context: ${propertyContext(project)}.`,
    "Choose the camera move that best fits this specific photo's room type and composition -- do not default to a generic lateral pan, and do not add a second movement or a visual step sequence.",
    `Analyze the attached image and return the requested JSON shot design. The final clip will be ${clipDuration(project, index)} seconds long.`,
    "Use only visible evidence. The shot design must prioritize exact-image preservation over decorative description.",
  ].join(" ");
}

// Parses the vision model's raw response into a normalized ShotAnalysis -- always returns a
// usable direction (falling back to fallbackDirection's canned data whenever anything is
// missing or unparseable), never null, matching this function's previous all-in-one behavior.
// Deliberately separate from prompt-building: the result gets persisted (shotAnalysis) so a
// later customCameraMoves edit can rebuild the prompt from it without paying for reclassification.
function parseDirection(value: unknown, index: number): ShotAnalysis {
  const fallback = fallbackDirection(index);
  if (!value || typeof value !== "object") return fallback;
  const output = (value as { output?: unknown }).output;
  if (typeof output !== "string") return fallback;
  const cleaned = output.replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { shotType?: unknown; confidence?: unknown; timeOfDay?: unknown; cameraMove?: unknown; lighting?: unknown; focus?: unknown };
    const confidence = normalizeConfidence(parsed.confidence);
    return {
      shotType: normalizeShotType(parsed.shotType, confidence),
      timeOfDay: normalizeTimeOfDay(parsed.timeOfDay),
      cameraMove: cleanDirection(parsed.cameraMove, fallback.cameraMove),
      lighting: cleanDirection(parsed.lighting, fallback.lighting),
      focus: cleanDirection(parsed.focus, fallback.focus),
    };
  } catch {
    return { ...fallback, cameraMove: cleanDirection(cleaned, fallback.cameraMove) };
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

function asShotAnalysisArray(value: unknown, length: number) {
  if (!Array.isArray(value)) return Array.from({ length }, () => null as ShotAnalysis | null);
  return Array.from({ length }, (_, index) => {
    const entry = value[index];
    return entry && typeof entry === "object" ? entry as ShotAnalysis : null;
  });
}

function allReady(values: (string | null)[], length: number) {
  return values.length === length && values.every(Boolean);
}

async function submitVisionPromptJobs(client: typeof fal, signedImages: string[], project: VideoProject) {
  const responses = await Promise.all(signedImages.map((imageUrl, index) => client.queue.submit(FAL_VISION_PROMPT_MODEL, {
    input: {
      image_urls: [imageUrl],
      prompt: promptInstruction(index, project),
      system_prompt: visionSystemPrompt(clipDuration(project, index)),
      model: FAL_VISION_LLM_MODEL,
      temperature: 0.2,
      max_tokens: 260,
    },
    webhookUrl: FAL_WEBHOOK_URL,
  })));
  return responses.map(response => response.request_id);
}

// Guardrails for the guided real-estate prompt. Deliberately NOT applied to a customer's own
// prompt: it forbids exactly the things (people, object motion, lighting changes) a customer
// writing their own direction may be asking for.
const GUIDED_NEGATIVE_PROMPT = "scene change, room change, invented architecture, new furniture, disappearing furniture, geometry drift, bending lines, warped perspective, lens wobble, snap zoom, whip pan, handheld shake, excessive motion, generic left-to-right pan, slideshow motion, static frame, static camera, frozen camera, motionless camera, no camera movement, visual step change, object reveal, lighting change, before-and-after effect, artificial light bloom, door opening, door closing, window opening, window closing, curtains moving, blinds moving, cabinet opening, cabinet closing, objects animating independently, self-moving objects, subject leaving frame, camera drifting away from main subject, blur, distort, low quality, audio, voice, dialogue, music, people, animals, text, logo, watermark";
const CUSTOM_NEGATIVE_PROMPT = "blur, low quality, compression artifacts, flicker, warped geometry, text, watermark";

/** The customer's own full prompt for this photo, or null when they're using guided direction. */
export function customPrompt(project: Pick<VideoProject, "customPrompts">, index: number) {
  const value = project.customPrompts?.[index];
  return typeof value === "string" && value.trim() ? limitPrompt(value) : null;
}

/** The prompt actually sent for one clip: the customer's own if set, otherwise guided direction. */
export function effectivePrompt(index: number, project: VideoProject, generatedPrompts: (string | null)[]) {
  return customPrompt(project, index) || generatedPrompts[index] || fallbackPrompt(index, project);
}

async function submitVideoJob(client: typeof fal, imageUrl: string, index: number, project: VideoProject, prompt: string) {
  const response = await client.queue.submit(FAL_IMAGE_TO_VIDEO_MODEL, {
    input: {
      prompt: limitPrompt(prompt),
      start_image_url: imageUrl,
      duration: String(clipDuration(project, index)) as "5" | "10",
      generate_audio: FAL_GENERATE_AUDIO,
      negative_prompt: customPrompt(project, index) ? CUSTOM_NEGATIVE_PROMPT : GUIDED_NEGATIVE_PROMPT,
      cfg_scale: 0.6,
    },
    webhookUrl: FAL_WEBHOOK_URL,
  });
  return response.request_id;
}

// A 4xx from fal.ai (other than timeout/rate-limit) will never succeed on a later poll; anything
// else -- network blips, 5xx -- is worth simply polling again.
function isPermanentFalError(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function asNumberArray(value: unknown, length: number) {
  if (!Array.isArray(value)) return Array.from({ length }, () => null as number | null);
  return Array.from({ length }, (_, index) => typeof value[index] === "number" ? value[index] as number : null);
}

// Kicks off per-photo vision classification as soon as a project is created, well before the
// user approves it -- lets the Review page show real per-photo shot direction instead of
// decorative placeholders. Deliberately mirrors only the vision-submission half of
// submitFalRender; it must never touch video jobs.
export async function submitShotClassification(userId: number, project: VideoProject, accessToken?: string | null) {
  const client = getFalClient();
  const signedImages = await getFalSourceUrls(project, accessToken);
  const promptRequestIds = await submitVisionPromptJobs(client, signedImages, project);
  const generatedPrompts = Array.from({ length: project.mediaUrls.length }, () => null as string | null);
  await updateVideoProject(userId, project.id, { promptRequestIds, generatedPrompts });
}

// Polls whatever vision jobs submitShotClassification already started and persists results as
// they land. Pre-approval, a single photo's classification failing or still being in flight is
// cosmetic, not fatal -- fallbackPrompt already covers an unresolved photo at render time -- so
// this never reports a hard failure and never submits a video job under any circumstance.
export async function refreshShotClassification(userId: number, project: VideoProject, accessToken?: string | null) {
  const promptRequestIds = asStringArray(project.promptRequestIds, project.mediaUrls.length);
  const generatedPrompts = asStringArray(project.generatedPrompts, project.mediaUrls.length);
  const shotAnalysis = asShotAnalysisArray(project.shotAnalysis, project.mediaUrls.length);
  if (!promptRequestIds.some(Boolean) || allReady(generatedPrompts, project.mediaUrls.length)) {
    return { generatedPrompts, ready: allReady(generatedPrompts, project.mediaUrls.length) };
  }

  const client = getFalClient();
  await Promise.all(promptRequestIds.map(async (requestId, index) => {
    if (!requestId || generatedPrompts[index]) return;
    try {
      const status = await client.queue.status(FAL_VISION_PROMPT_MODEL, { requestId, logs: false });
      if (status.status === "COMPLETED") {
        const result = await client.queue.result(FAL_VISION_PROMPT_MODEL, { requestId });
        const direction = parseDirection(result.data, index);
        shotAnalysis[index] = direction;
        generatedPrompts[index] = buildCinematicPrompt(index, direction, project);
      }
    } catch (error) {
      console.error(`[FalPipeline] pre-approval classification poll failed for project ${project.id}, photo ${index + 1}:`, describeFalError(error));
    }
  }));

  await updateVideoProject(userId, project.id, { generatedPrompts, shotAnalysis });
  return { generatedPrompts, ready: allReady(generatedPrompts, project.mediaUrls.length) };
}

export async function submitFalRender(userId: number, project: VideoProject, accessToken?: string | null) {
  const client = getFalClient();
  const existingPromptRequestIds = asStringArray(project.promptRequestIds, project.mediaUrls.length);
  const alreadyClassifying = existingPromptRequestIds.some(Boolean);

  // If pre-approval classification (submitShotClassification) already submitted vision jobs,
  // keep them and whatever's already resolved instead of re-submitting -- approving a project
  // must not pay for a second round of vision classification. refreshFalRender's existing
  // polling picks up any still-pending prompts and falls through to video jobs once ready.
  let promptRequestIds = existingPromptRequestIds;
  let generatedPrompts = asStringArray(project.generatedPrompts, project.mediaUrls.length);
  let shotAnalysis = asShotAnalysisArray(project.shotAnalysis, project.mediaUrls.length);
  if (!alreadyClassifying) {
    const signedImages = await getFalSourceUrls(project, accessToken);
    promptRequestIds = await submitVisionPromptJobs(client, signedImages, project);
    generatedPrompts = Array.from({ length: project.mediaUrls.length }, () => null as string | null);
    shotAnalysis = Array.from({ length: project.mediaUrls.length }, () => null as ShotAnalysis | null);
  }
  const empty = Array.from({ length: project.mediaUrls.length }, () => null as string | null);
  const renderProgress = alreadyClassifying ? Math.round((generatedPrompts.filter(Boolean).length / project.mediaUrls.length) * 15) : 0;
  const updates = {
    promptRequestIds,
    generatedPrompts,
    shotAnalysis,
    falRequestIds: [] as (string | null)[],
    clipUrls: empty,
    clipErrors: empty,
    assemblyRequestId: null,
    renderProgress,
    renderPhase: "generating" as const,
    renderError: null,
  };

  await updateVideoProject(userId, project.id, updates);
  return getProjectRenderStatus({ ...project, status: "Processing", ...updates });
}

/**
 * Advances a render by one step: resolves direction, submits clips, collects finished clips
 * (refunding any that failed), then assembles the final reel on fal.ai. Safe to call from
 * both the client poll and the fal.ai webhook -- the per-project lock means only one caller
 * advances at a time, and the other just gets the current snapshot.
 */
export async function refreshFalRender(userId: number, staleProject: VideoProject, accessToken?: string | null): Promise<RenderStatusSnapshot> {
  if (!(await claimRenderLock(staleProject.id))) return getProjectRenderStatus(staleProject);
  try {
    // Re-read under the lock: the caller's copy may predate another request's writes.
    const project = (await getVideoProject(userId, staleProject.id)) ?? staleProject;
    if (project.status !== "Processing") return getProjectRenderStatus(project);
    return await advanceRender(userId, project, accessToken);
  } finally {
    await releaseRenderLock(staleProject.id).catch(() => {});
  }
}

type ProjectUpdates = Parameters<typeof updateVideoProject>[2];

async function advanceRender(userId: number, project: VideoProject, accessToken?: string | null): Promise<RenderStatusSnapshot> {
  // A failed render waits for the customer (retry a clip, or resume assembly) rather than
  // silently re-spending on every poll.
  if (project.renderPhase === "failed") return getProjectRenderStatus(project);

  const total = project.mediaUrls.length;
  const indices = Array.from({ length: total }, (_, index) => index);
  const client = getFalClient();
  const promptRequestIds = asStringArray(project.promptRequestIds, total);
  const generatedPrompts = asStringArray(project.generatedPrompts, total);
  const shotAnalysis = asShotAnalysisArray(project.shotAnalysis, total);
  const requestIds = asStringArray(project.falRequestIds, total);
  const clipUrls = asStringArray(project.clipUrls, total);
  const clipErrors = asStringArray(project.clipErrors, total);

  const save = async (updates: ProjectUpdates) => {
    await updateVideoProject(userId, project.id, updates);
    return getProjectRenderStatus({ ...project, ...updates } as VideoProject);
  };

  // 1. Direction. A photo with the customer's own prompt needs none; a vision job that fails
  //    falls back to a generic guided prompt instead of failing the render.
  const awaitingDirection = (index: number) => Boolean(promptRequestIds[index]) && !generatedPrompts[index] && !customPrompt(project, index);
  if (indices.some(awaitingDirection)) {
    await Promise.all(indices.filter(awaitingDirection).map(async index => {
      const requestId = promptRequestIds[index]!;
      try {
        const status = await client.queue.status(FAL_VISION_PROMPT_MODEL, { requestId, logs: false });
        const state = status.status as string;
        if (state === "COMPLETED") {
          const result = await client.queue.result(FAL_VISION_PROMPT_MODEL, { requestId });
          const direction = parseDirection(result.data, index);
          shotAnalysis[index] = direction;
          generatedPrompts[index] = buildCinematicPrompt(index, direction, project);
        } else if (state === "FAILED") {
          generatedPrompts[index] = fallbackPrompt(index, project);
        }
      } catch (error) {
        console.error(`[FalPipeline] vision prompt poll failed for project ${project.id}, photo ${index + 1}:`, describeFalError(error));
        if (isPermanentFalError(error)) generatedPrompts[index] = fallbackPrompt(index, project);
      }
    }));

    if (indices.some(awaitingDirection)) {
      const ready = indices.filter(index => generatedPrompts[index] || customPrompt(project, index)).length;
      return save({ generatedPrompts, shotAnalysis, renderProgress: Math.round((ready / total) * 15), renderPhase: "generating", renderError: null });
    }
  }

  const refunds: Promise<unknown>[] = [];
  const failClip = (index: number, message: string, reference: string) => {
    clipErrors[index] = message.slice(0, 300);
    refunds.push(grantCredits(userId, clipCost(clipDuration(project, index)), "refund", reference)
      .catch(error => console.error(`[FalPipeline] refund ${reference} failed for project ${project.id}:`, error)));
  };

  // 2. First submission of every clip. A clip that can't even be submitted is refunded and
  //    left retryable; the rest carry on.
  const neverSubmitted = indices.every(index => !requestIds[index] && !clipUrls[index] && !clipErrors[index]);
  if (neverSubmitted) {
    const signedImages = await getFalSourceUrls(project, accessToken);
    const submitted = await Promise.allSettled(indices.map(index =>
      submitVideoJob(client, signedImages[index], index, project, effectivePrompt(index, project, generatedPrompts))));
    const batch = Date.now();
    submitted.forEach((result, index) => {
      if (result.status === "fulfilled") {
        requestIds[index] = result.value;
      } else {
        console.error(`[FalPipeline] video submit failed for project ${project.id}, photo ${index + 1}:`, describeFalError(result.reason));
        failClip(index, describeFalError(result.reason) || `Photo ${index + 1} could not be sent for rendering.`, `refund:submit:${project.id}:${index}:${batch}`);
      }
    });
    // Persist the paid request ids before anything else can go wrong.
    await updateVideoProject(userId, project.id, { generatedPrompts, shotAnalysis, falRequestIds: requestIds, clipErrors, renderProgress: 15, renderPhase: "generating", renderError: null });
  } else {
    // 3. Collect finished clips.
    await Promise.all(indices.map(async index => {
      const requestId = requestIds[index];
      if (!requestId || clipUrls[index] || clipErrors[index]) return;
      try {
        const status = await client.queue.status(FAL_IMAGE_TO_VIDEO_MODEL, { requestId, logs: false });
        const state = status.status as string;
        if (state === "COMPLETED") {
          const result = await client.queue.result(FAL_IMAGE_TO_VIDEO_MODEL, { requestId });
          const url = normalizeClipUrl(result.data);
          if (url) clipUrls[index] = url;
          else failClip(index, `No video was returned for photo ${index + 1}.`, `refund:${requestId}`);
        } else if (state === "FAILED") {
          failClip(index, `Photo ${index + 1} could not be rendered.`, `refund:${requestId}`);
        }
      } catch (error) {
        console.error(`[FalPipeline] video render poll failed for project ${project.id}, photo ${index + 1}:`, describeFalError(error));
        if (isPermanentFalError(error)) failClip(index, describeFalError(error) || `Photo ${index + 1} could not be rendered.`, `refund:${requestId}`);
      }
    }));
  }
  await Promise.all(refunds);

  const done = clipUrls.filter(Boolean).length;
  const failed = clipErrors.filter(Boolean).length;
  const base = { generatedPrompts, shotAnalysis, falRequestIds: requestIds, clipUrls, clipErrors };
  const clipProgress = 15 + Math.round((done / total) * 75);

  if (done + failed < total) {
    return save({ ...base, renderProgress: clipProgress, renderPhase: "generating", renderError: null });
  }
  if (failed > 0) {
    return save({
      ...base,
      renderProgress: clipProgress,
      renderPhase: "failed",
      renderError: failed === 1
        ? "1 clip could not be generated and its credits were refunded. Retry it to finish your reel."
        : `${failed} clips could not be generated and their credits were refunded. Retry them to finish your reel.`,
    });
  }

  // 4. Assembly, on fal.ai rather than in the customer's browser -- so the reel finishes even
  //    if nobody is watching the page.
  const finish = (finalVideoUrl: string) => save({ ...base, status: "Done", finalVideoUrl, renderProgress: 100, renderPhase: "complete", renderError: null });
  const assemblyFailed = () => save({ ...base, assemblyRequestId: null, renderProgress: 95, renderPhase: "failed", renderError: "Your clips are ready, but the final reel could not be assembled. Try again -- assembly is free." });

  if (total === 1) return finish(clipUrls[0]!);

  if (!project.assemblyRequestId) {
    const response = await client.queue.submit(FAL_MERGE_VIDEOS_MODEL as string, {
      // Clips can differ in aspect ratio when the photos do; follow the opening clip rather
      // than the default (smallest width x smallest height across all clips).
      input: { video_urls: clipUrls, resolution_aspect_ratio_video_index: 0 },
      webhookUrl: FAL_WEBHOOK_URL,
    });
    return save({ ...base, assemblyRequestId: response.request_id, renderProgress: 95, renderPhase: "assembly", renderError: null });
  }

  try {
    const status = await client.queue.status(FAL_MERGE_VIDEOS_MODEL as string, { requestId: project.assemblyRequestId, logs: false });
    const state = status.status as string;
    if (state === "COMPLETED") {
      const result = await client.queue.result(FAL_MERGE_VIDEOS_MODEL as string, { requestId: project.assemblyRequestId });
      const url = normalizeClipUrl(result.data);
      return url ? finish(url) : assemblyFailed();
    }
    if (state === "FAILED") return assemblyFailed();
  } catch (error) {
    console.error(`[FalPipeline] assembly poll failed for project ${project.id}:`, describeFalError(error));
    if (isPermanentFalError(error)) return assemblyFailed();
  }
  return save({ ...base, renderProgress: 95, renderPhase: "assembly", renderError: null });
}

export class InsufficientCreditsError extends Error {
  constructor(public readonly required: number) {
    super(`Not enough credits: this needs ${required}.`);
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Re-rolls one clip -- to retry a failure, or because the customer wants a different take,
 * prompt or length. Charges that clip's seconds, re-opens a finished project, and lets the
 * normal render loop pick the new clip up and re-assemble the reel.
 */
export async function regenerateClip(
  userId: number,
  projectId: number,
  index: number,
  options: { prompt?: string | null; durationSeconds?: 5 | 10 },
  accessToken?: string | null,
) {
  let locked = false;
  for (let attempt = 0; attempt < 8 && !locked; attempt += 1) {
    locked = await claimRenderLock(projectId);
    if (!locked) await sleep(350);
  }
  if (!locked) throw new Error("This project is updating. Try again in a moment.");

  try {
    const project = await getVideoProject(userId, projectId);
    if (!project) throw new Error("Project not found.");
    if (project.status !== "Processing" && project.status !== "Done") {
      throw new Error("Clips can be regenerated once production has started.");
    }
    const total = project.mediaUrls.length;
    if (index >= total) throw new Error("Invalid photo.");

    const requestIds = asStringArray(project.falRequestIds, total);
    const clipUrls = asStringArray(project.clipUrls, total);
    const clipErrors = asStringArray(project.clipErrors, total);
    if (![...requestIds, ...clipUrls, ...clipErrors].some(Boolean)) throw new Error("Your clips are still being prepared.");
    if (requestIds[index] && !clipUrls[index] && !clipErrors[index]) throw new Error("This clip is already rendering.");

    const customPrompts = asStringArray(project.customPrompts, total);
    const clipDurations = asNumberArray(project.clipDurations, total);
    if (options.prompt !== undefined) customPrompts[index] = options.prompt?.trim() || null;
    if (options.durationSeconds) clipDurations[index] = options.durationSeconds;
    const next = { ...project, customPrompts, clipDurations } as VideoProject;

    // Keep the stored guided prompt in step with a changed duration.
    const generatedPrompts = asStringArray(project.generatedPrompts, total);
    const analysis = project.shotAnalysis?.[index];
    if (analysis) generatedPrompts[index] = buildCinematicPrompt(index, analysis, next);

    const cost = clipCost(clipDuration(next, index));
    const reference = `regen:${project.id}:${index}:${Date.now()}`;
    if ((await spendCredits(userId, cost, "regenerate", reference)) === null) throw new InsufficientCreditsError(cost);

    try {
      const key = project.mediaKeys[index];
      const imageUrl = key.startsWith("pilot:") ? project.mediaUrls[index] : await storageGetSignedUrl(key, accessToken ?? undefined);
      requestIds[index] = await submitVideoJob(getFalClient(), imageUrl, index, next, effectivePrompt(index, next, generatedPrompts));
    } catch (error) {
      await grantCredits(userId, cost, "refund", `refund:${reference}`).catch(() => {});
      throw new Error(describeFalError(error) || "This clip could not be sent for rendering.");
    }

    clipUrls[index] = null;
    clipErrors[index] = null;
    const done = clipUrls.filter(Boolean).length;
    const updated = await updateVideoProject(userId, project.id, {
      customPrompts,
      clipDurations,
      generatedPrompts,
      falRequestIds: requestIds,
      clipUrls,
      clipErrors,
      status: "Processing",
      finalVideoUrl: null,
      assemblyRequestId: null,
      renderProgress: 15 + Math.round((done / total) * 75),
      renderPhase: "generating",
      renderError: null,
    });
    if (!updated) throw new Error("The project could not be updated.");
    return updated;
  } finally {
    await releaseRenderLock(projectId).catch(() => {});
  }
}
