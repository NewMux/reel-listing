import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getPilotGallery, pilotGalleryIds } from "../shared/pilotGalleries";
import { MAX_PROPERTY_PHOTOS, STAGING_STYLES } from "../shared/video";
import { cameraPresetIds, findUnsupportedMove, getCameraPreset, ROOM_TYPE_CHOICES } from "../shared/shotPresets";
import { getReelStyle, reelStyleIds } from "../shared/reelStyles";
import { AUTH_UNAVAILABLE_ERR_MSG, COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  claimRenderLock,
  createVideoProject,
  decrementStagingCredits,
  ensureBillingAccount,
  getClipCredits,
  getUserByEmail,
  getVideoProject,
  getVideoProjectByShareToken,
  incrementStagingCredits,
  insertContactMessage,
  listCreditLedger,
  listVideoProjects,
  moveCredits,
  releaseRenderLock,
  updateVideoProject,
} from "./db";
import { stagePhoto } from "./stagingPipeline";
import { checkRateLimit, type RateLimitName } from "./rateLimit";
import {
  getApprovalTransition,
  getChangeRequestTransition,
  getCompletionTransition,
  validateUploadedPropertyMedia,
} from "./projects";
import { signStoredUrl, storageCreatePutTarget, storageGetSignedUrl } from "./storage";
import { getProjectRenderStatus, getShotPlan } from "./renderPipeline";
import { buildCinematicPrompt, refreshFalRender, refreshShotClassification, submitFalRender, submitShotClassification } from "./falPipeline";

const fileSchema = z.object({
  name: z.string().min(1).max(240),
  type: z.string().min(1).max(100),
  key: z.string().min(1).max(600),
  url: z.string().min(1).max(900),
});

function projectIdInput(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid project." });
  }
}

/**
 * Kicks off per-photo vision classification for a freshly created project, but only for an
 * account that could actually pay to render it.
 *
 * Classification is ten fal.ai vision calls. It used to run on every project creation with no
 * quota and no limit, so an account with no credit -- and therefore no way to ever render --
 * could still run up an unbounded vision bill just by creating projects in a loop.
 */
async function startClassificationIfFunded(
  userId: number,
  project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>,
  accessToken: string | null,
) {
  const credits = await getClipCredits(userId);
  if (credits < project.mediaUrls.length) {
    console.info(`[Projects] skipping pre-approval classification for project ${project.id}: ${credits} credits for ${project.mediaUrls.length} photos.`);
    return;
  }
  try {
    await submitShotClassification(userId, project, accessToken);
  } catch (error) {
    console.error(`[Projects] pre-approval classification submission failed for project ${project.id}:`, error);
  }
}

/** 32 bytes of randomness, hex-encoded: long enough that a share link cannot be guessed. */
function newShareToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
}

function isPilotMediaKey(key: string) {
  return key.startsWith("pilot:");
}

function asOverrideArray<T>(value: (T | null)[] | null | undefined, length: number): (T | null)[] {
  const source = value || [];
  return Array.from({ length }, (_, index) => source[index] ?? null);
}

/**
 * Enforces a named rate limit, or rejects. Spend-bearing limits fail closed (see
 * server/rateLimit.ts), so an Upstash outage refuses the request rather than uncapping a
 * fal.ai bill.
 */
async function requireRateLimit(name: RateLimitName, subject: string) {
  const { allowed } = await checkRateLimit(name, subject);
  if (!allowed) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Please wait a moment and try again." });
  }
}

function clientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }) {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return first?.trim() || req.socket.remoteAddress || "unknown";
}

async function presentSourceUrls(project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>, accessToken: string | null) {
  if (!accessToken) return project.mediaUrls;
  return Promise.all(project.mediaKeys.map((key, index) => isPilotMediaKey(key) ? project.mediaUrls[index] : storageGetSignedUrl(key, accessToken)));
}

async function presentProject(project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>, accessToken: string | null, sourceUrls?: string[]) {
  if (!project) return project;
  const mediaUrls = sourceUrls ?? await presentSourceUrls(project, accessToken);
  return { ...project, mediaUrls, finalVideoUrl: await signStoredUrl(project.finalVideoUrl, accessToken) };
}

async function presentRender(snapshot: Awaited<ReturnType<typeof getProjectRenderStatus>>, project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>, accessToken: string | null, sourceUrls?: string[]) {
  if (!project) return snapshot;
  const resolvedSourceUrls = sourceUrls ?? await presentSourceUrls(project, accessToken);
  // Clips that have been copied into our own storage are stored as /manus-storage keys and
  // have to be signed before the browser can fetch them for assembly. Clips still living on
  // fal.ai are already fetchable and pass through untouched.
  const [finalVideoUrl, clipUrls] = await Promise.all([
    signStoredUrl(snapshot.finalVideoUrl, accessToken),
    Promise.all(snapshot.clipUrls.map(url => signStoredUrl(url, accessToken))),
  ]);
  return {
    ...snapshot,
    finalVideoUrl,
    clipUrls,
    shots: snapshot.shots.map((shot, index) => ({
      ...shot,
      sourceUrl: resolvedSourceUrls[index] || shot.sourceUrl,
      clipUrl: clipUrls[index] ?? shot.clipUrl,
    })),
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      // Signed in, but we could not read the account. Reporting "signed out"
      // here would send the client back to the login page in a loop.
      if (opts.ctx.authUnavailable) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: AUTH_UNAVAILABLE_ERR_MSG });
      }
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  contact: router({
    submit: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(160),
          email: z.string().trim().email().max(320),
          message: z.string().trim().min(1).max(4_000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireRateLimit("contact", clientIp(ctx.req));
        try {
          await insertContactMessage(input);
        } catch (error) {
          console.error("[Contact] Failed to save message:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Unable to send your message.",
          });
        }
        return { success: true } as const;
      }),
  }),
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => Promise.all((await listVideoProjects(ctx.user.id)).map(project => presentProject(project, ctx.supabaseAccessToken)))),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      projectIdInput(input.id);
      const project = await getVideoProject(ctx.user.id, input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      return presentProject(project, ctx.supabaseAccessToken);
    }),
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().trim().min(2).max(160),
          description: z.string().trim().max(1_000).optional(),
          location: z.string().trim().min(2).max(180),
          files: z.array(fileSchema).min(1).max(MAX_PROPERTY_PHOTOS),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireRateLimit("projectCreate", String(ctx.user.id));
        try {
          validateUploadedPropertyMedia(input.files);
          if (input.files.some(file => !file.key.startsWith(`property-projects/${ctx.user.id}/`))) {
            throw new Error("Property media must be uploaded by this account before creating a project.");
          }
          const id = await createVideoProject({
            userId: ctx.user.id,
            title: input.title,
            description: input.description || null,
            location: input.location,
            mediaUrls: input.files.map(file => file.url),
            mediaKeys: input.files.map(file => file.key),
            mediaNames: input.files.map(file => file.name),
            mediaTypes: input.files.map(file => file.type),
            status: "Review",
          });
          const created = await getVideoProject(ctx.user.id, id);
          if (created) await startClassificationIfFunded(ctx.user.id, created, ctx.supabaseAccessToken);
          return { id };
        } catch (error) {
          console.error("[Projects] create failed:", error);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Unable to create this project.",
          });
        }
      }),
    createPilot: protectedProcedure
      .input(z.object({
        gallery: z.enum(pilotGalleryIds),
        imageIds: z.array(z.string().min(1).max(80)).min(1).max(MAX_PROPERTY_PHOTOS),
        title: z.string().trim().min(2).max(160),
        description: z.string().trim().max(1_000).optional(),
        location: z.string().trim().min(2).max(180),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireRateLimit("projectCreate", String(ctx.user.id));
        const gallery = getPilotGallery(input.gallery);
        const selected = input.imageIds.map(id => gallery.find(image => image.id === id));
        if (gallery.length === 0 || input.imageIds.length !== gallery.length || selected.some(image => !image) || new Set(input.imageIds).size !== input.imageIds.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose all owner-provided photos from this pilot gallery." });
        }
        const images = selected.filter((image): image is NonNullable<typeof image> => Boolean(image));
        const id = await createVideoProject({
          userId: ctx.user.id,
          title: input.title,
          description: input.description || null,
          location: input.location,
          mediaUrls: images.map(image => image.url),
          mediaKeys: images.map(image => `pilot:${input.gallery}/${image.id}`),
          mediaNames: images.map(image => image.name),
          mediaTypes: images.map(() => "image/png"),
          status: "Review",
        });
        const created = await getVideoProject(ctx.user.id, id);
        if (created) await startClassificationIfFunded(ctx.user.id, created, ctx.supabaseAccessToken);
        return { id };
      }),
    approve: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      projectIdInput(input.id);
      await requireRateLimit("renderApprove", String(ctx.user.id));
      const project = await getVideoProject(ctx.user.id, input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      if (project.status !== "Review") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This project is already in production." });
      }

      // Take the render lock BEFORE reading credit or calling fal.ai. Reading the status above
      // is not enough on its own: two approvals arriving together would both see "Review" and
      // both buy a full set of clips. The lock is a conditional UPDATE, so exactly one wins.
      if (!(await claimRenderLock(ctx.user.id, input.id))) {
        throw new TRPCError({ code: "CONFLICT", message: "This project is already starting. Give it a moment." });
      }

      // Credits are per clip, and one photo becomes one clip.
      const cost = project.mediaUrls.length;
      // Unique per approval attempt. A project sent back for changes and approved again is a
      // second, legitimate render that must be charged again, so this cannot be derived from
      // the project id alone. Duplicate-submission safety comes from the render lock above,
      // which only one caller can hold; this reference is the ledger's audit key and the
      // handle the release below uses to pair with the reservation.
      const attemptRef = newShareToken().slice(0, 16);
      let reserved = false;
      try {
        const transition = getApprovalTransition(project.status);
        const remaining = await moveCredits({
          userId: ctx.user.id,
          amount: -cost,
          entryType: "reservation",
          referenceId: `reservation:project:${input.id}:${attemptRef}`,
          description: `Render ${cost} clip${cost === 1 ? "" : "s"} for project ${input.id}`,
          projectId: input.id,
        });
        if (remaining === null) {
          const available = await getClipCredits(ctx.user.id);
          throw new Error(`This reel needs ${cost} clip credit${cost === 1 ? "" : "s"} and you have ${available}. Contact us to top up before rendering.`);
        }
        reserved = true;

        const render = await submitFalRender(ctx.user.id, project, ctx.supabaseAccessToken);
        const updated = await updateVideoProject(ctx.user.id, input.id, { ...transition, creditsSpent: cost });
        if (!updated) throw new Error("The project could not be updated after rendering started.");
        // mediaKeys don't change across approval -- sign them once and hand the same array to
        // both presenters instead of paying for two full signing round-trips in series, which
        // was enough to blow past the 10s function budget under any Storage-signing latency.
        const sourceUrls = await presentSourceUrls(updated, ctx.supabaseAccessToken);
        const [presentedProject, presentedRender] = await Promise.all([
          presentProject(updated, ctx.supabaseAccessToken, sourceUrls),
          presentRender(render, project, ctx.supabaseAccessToken, sourceUrls),
        ]);
        return { project: presentedProject, render: presentedRender };
      } catch (error) {
        // Nothing was rendered, so release the reservation -- exactly what it took.
        if (reserved) {
          await moveCredits({
            userId: ctx.user.id,
            amount: cost,
            entryType: "release",
            referenceId: `release:project:${input.id}:${attemptRef}`,
            description: `Render never started for project ${input.id}`,
            projectId: input.id,
          }).catch(releaseError => console.error(`[Projects] credit release failed for project ${input.id}:`, releaseError));
        }
        console.error(`[Projects] approve failed for project ${input.id}:`, error);
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to start rendering." });
      } finally {
        await releaseRenderLock(ctx.user.id, input.id).catch(() => {});
      }
    }),
    reorder: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), order: z.array(z.number().int().nonnegative()).min(1).max(MAX_PROPERTY_PHOTOS) }))
      .mutation(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        try {
          if (project.status !== "Review") {
            throw new Error("Photo order can only be changed before production starts.");
          }
          const length = project.mediaUrls.length;
          const isPermutation = input.order.length === length && new Set(input.order).size === length && input.order.every(index => index < length);
          if (!isPermutation) {
            throw new Error("Invalid photo order.");
          }
          const reindex = <T,>(values: T[]) => input.order.map(index => values[index]);
          const updated = await updateVideoProject(ctx.user.id, input.id, {
            mediaUrls: reindex(project.mediaUrls),
            mediaKeys: reindex(project.mediaKeys),
            mediaNames: reindex(project.mediaNames),
            mediaTypes: reindex(project.mediaTypes),
          });
          if (!updated) throw new Error("The project could not be updated.");
          return presentProject(updated, ctx.supabaseAccessToken);
        } catch (error) {
          console.error(`[Projects] reorder failed for project ${input.id}:`, error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to reorder these photos." });
        }
      }),
    stagePhoto: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), index: z.number().int().nonnegative(), style: z.enum(STAGING_STYLES) }))
      .mutation(async ({ ctx, input }) => {
        projectIdInput(input.id);
        await requireRateLimit("stagePhoto", String(ctx.user.id));
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        try {
          if (project.status !== "Review") {
            throw new Error("Photos can only be staged before production starts.");
          }
          if (input.index >= project.mediaUrls.length) {
            throw new Error("Invalid photo.");
          }
          const remaining = await decrementStagingCredits(ctx.user.id);
          if (remaining === null) {
            throw new Error("You've used all of your staging credits. Contact us to add more.");
          }
          try {
            const staged = await stagePhoto(ctx.user.id, project, input.index, input.style, ctx.supabaseAccessToken);
            const mediaUrls = [...project.mediaUrls];
            const mediaKeys = [...project.mediaKeys];
            const mediaTypes = [...project.mediaTypes];
            mediaUrls[input.index] = staged.url;
            mediaKeys[input.index] = staged.key;
            mediaTypes[input.index] = staged.type;
            const updated = await updateVideoProject(ctx.user.id, input.id, { mediaUrls, mediaKeys, mediaTypes });
            if (!updated) throw new Error("The project could not be updated.");
            return presentProject(updated, ctx.supabaseAccessToken);
          } catch (stagingError) {
            await incrementStagingCredits(ctx.user.id).catch(() => {});
            throw stagingError;
          }
        } catch (error) {
          console.error(`[Projects] stagePhoto failed for project ${input.id}, index ${input.index}:`, error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to stage this photo." });
        }
      }),
    requestChanges: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), notes: z.string().trim().min(3).max(1_000) }))
      .mutation(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        try {
          return updateVideoProject(ctx.user.id, input.id, getChangeRequestTransition(input.notes));
        } catch (error) {
          console.error(`[Projects] requestChanges failed for project ${input.id}:`, error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to save changes." });
        }
      }),
    renderStatus: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        if (project.status === "Processing" && (project.promptRequestIds?.length || project.falRequestIds?.length)) {
          try {
            // Read-only: polls fal.ai and persists what has landed, but never buys the next
            // batch. When a purchase is due the snapshot comes back with needsAdvance set and
            // the client calls advanceRender, which holds the lock while it spends.
            return await presentRender(await refreshFalRender(ctx.user.id, project, ctx.supabaseAccessToken), project, ctx.supabaseAccessToken);
          } catch (error) {
            console.error(`[Projects] renderStatus refresh failed for project ${input.id}:`, error);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to refresh this render right now." });
          }
        }
        return presentRender(getProjectRenderStatus(project), project, ctx.supabaseAccessToken);
      }),
    /**
     * Buys the next batch of fal.ai clips for a project already in production.
     *
     * A mutation rather than part of the status query on purpose: this spends money, and a
     * polled query can be retried by the client at will. The render lock makes a duplicate
     * call a no-op instead of a second charge.
     */
    advanceRender: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        if (project.status !== "Processing") {
          return presentRender(getProjectRenderStatus(project), project, ctx.supabaseAccessToken);
        }
        if (!(await claimRenderLock(ctx.user.id, input.id))) {
          // Someone else is already submitting this batch. Report current state, do not buy.
          return presentRender(getProjectRenderStatus(project), project, ctx.supabaseAccessToken);
        }
        try {
          const snapshot = await refreshFalRender(ctx.user.id, project, ctx.supabaseAccessToken, { allowSubmission: true });
          return await presentRender(snapshot, project, ctx.supabaseAccessToken);
        } catch (error) {
          console.error(`[Projects] advanceRender failed for project ${input.id}:`, error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to continue this render right now." });
        } finally {
          await releaseRenderLock(ctx.user.id, input.id).catch(() => {});
        }
      }),
    shotDirections: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        const overrides = { customCameraMoves: project.customCameraMoves || [], clipDurations: project.clipDurations || [], reelStyle: project.reelStyle };
        if (project.status !== "Review" || !project.promptRequestIds?.length) {
          return { shots: getShotPlan(project.mediaUrls, project.generatedPrompts || []), shotAnalysis: project.shotAnalysis || [], ready: true, ...overrides };
        }
        try {
          const { generatedPrompts, ready } = await refreshShotClassification(ctx.user.id, project, ctx.supabaseAccessToken);
          const refreshed = await getVideoProject(ctx.user.id, input.id);
          return { shots: getShotPlan(project.mediaUrls, generatedPrompts), shotAnalysis: refreshed?.shotAnalysis || [], ready, ...overrides };
        } catch (error) {
          console.error(`[Projects] shotDirections refresh failed for project ${input.id}:`, error);
          return { shots: getShotPlan(project.mediaUrls, project.generatedPrompts || []), shotAnalysis: project.shotAnalysis || [], ready: false, ...overrides };
        }
      }),
    updateShotOverride: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        index: z.number().int().nonnegative(),
        /** A named camera choice. Resolves server-side to a directive proven against the model. */
        cameraPreset: z.enum(cameraPresetIds).nullable().optional(),
        /** Free-text camera move, from the advanced control. Validated before it can be used. */
        cameraMove: z.string().trim().max(360).nullable().optional(),
        /** The customer correcting the room the model detected. */
        roomType: z.enum(ROOM_TYPE_CHOICES).optional(),
        durationSeconds: z.union([z.literal(5), z.literal(10)]).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        try {
          if (project.status !== "Review") {
            throw new Error("Camera direction and length can only be edited before production starts.");
          }
          if (input.index >= project.mediaUrls.length) {
            throw new Error("Invalid photo.");
          }
          const customCameraMoves = asOverrideArray(project.customCameraMoves, project.mediaUrls.length);
          const clipDurations = asOverrideArray(project.clipDurations, project.mediaUrls.length);

          if (input.cameraPreset !== undefined) {
            // A named choice wins outright and clears any free text behind it, so the chip the
            // customer sees selected is always the move that will actually be rendered.
            customCameraMoves[input.index] = input.cameraPreset ? getCameraPreset(input.cameraPreset)!.directive : null;
          } else if (input.cameraMove !== undefined) {
            const cameraMove = input.cameraMove || null;
            // Refuse a move the render prompt already forbids rather than passing it through to
            // contradict those rules and spend a credit on a clip that will come back warped.
            const unsupported = cameraMove ? findUnsupportedMove(cameraMove) : null;
            if (unsupported) {
              throw new Error(`This model cannot do "${unsupported}" moves -- they come back warped. Try one of the suggested movements instead.`);
            }
            customCameraMoves[input.index] = cameraMove;
          }

          if (input.durationSeconds !== undefined) clipDurations[input.index] = input.durationSeconds;

          // A room correction is written into the persisted analysis, which is what the prompt
          // builder reads. The customer knows a kitchen from a dining room instantly; the
          // model does not always, and says so with a low-confidence "unknown".
          const analysisList = asOverrideArray(project.shotAnalysis, project.mediaUrls.length);
          if (input.roomType !== undefined && analysisList[input.index]) {
            analysisList[input.index] = { ...analysisList[input.index]!, shotType: input.roomType };
          }

          const updatedProject = { ...project, customCameraMoves, clipDurations, shotAnalysis: analysisList };
          const shotAnalysis = analysisList[input.index];
          const generatedPrompts = project.generatedPrompts ? [...project.generatedPrompts] : [];
          // Rebuild this one photo's prompt immediately from its already-persisted shotAnalysis --
          // no fal.ai call needed, so editing an override is instant and free.
          if (shotAnalysis) generatedPrompts[input.index] = buildCinematicPrompt(input.index, shotAnalysis, updatedProject);

          const updated = await updateVideoProject(ctx.user.id, input.id, { customCameraMoves, clipDurations, shotAnalysis: analysisList, generatedPrompts });
          if (!updated) throw new Error("The project could not be updated.");
          return { shots: getShotPlan(updated.mediaUrls, updated.generatedPrompts || []), shotAnalysis: updated.shotAnalysis || [], customCameraMoves: updated.customCameraMoves || [], clipDurations: updated.clipDurations || [], reelStyle: updated.reelStyle, ready: true };
        } catch (error) {
          console.error(`[Projects] updateShotOverride failed for project ${input.id}, index ${input.index}:`, error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to update this shot." });
        }
      }),
    /**
     * Sets the listing-level pacing style, applying its clip length to every shot at once.
     *
     * Free, like every other pre-approval edit: prompts are rebuilt from the analysis already
     * on the project, so no fal.ai call is involved.
     */
    setReelStyle: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), style: z.enum(reelStyleIds) }))
      .mutation(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        try {
          if (project.status !== "Review") {
            throw new Error("The style can only be changed before production starts.");
          }
          const style = getReelStyle(input.style);
          const clipDurations = project.mediaUrls.map(() => style.clipSeconds as number | null);
          const shotAnalysis = asOverrideArray(project.shotAnalysis, project.mediaUrls.length);
          const updatedProject = { ...project, clipDurations, reelStyle: input.style };
          // Clip length is named inside each prompt, so every prompt has to be rebuilt when it
          // changes -- otherwise a 5-second clip would still be directed as a 10-second one.
          const generatedPrompts = shotAnalysis.map((analysis, index) =>
            analysis ? buildCinematicPrompt(index, analysis, updatedProject) : project.generatedPrompts?.[index] ?? null);

          const updated = await updateVideoProject(ctx.user.id, input.id, { reelStyle: input.style, clipDurations, generatedPrompts });
          if (!updated) throw new Error("The project could not be updated.");
          return {
            shots: getShotPlan(updated.mediaUrls, updated.generatedPrompts || []),
            shotAnalysis: updated.shotAnalysis || [],
            customCameraMoves: updated.customCameraMoves || [],
            clipDurations: updated.clipDurations || [],
            reelStyle: updated.reelStyle,
            ready: true,
          };
        } catch (error) {
          console.error(`[Projects] setReelStyle failed for project ${input.id}:`, error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to change the style." });
        }
      }),
    complete: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), finalVideoUrl: z.string().min(1).max(2_000) }))
      .mutation(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        try {
          if (!input.finalVideoUrl.startsWith(`/manus-storage/property-projects/${ctx.user.id}/outputs/`)) {
            throw new Error("Final delivery must belong to this project account.");
          }
          if (project.status !== "Processing" || !project.clipUrls?.length || project.clipUrls.some(url => !url)) {
            throw new Error("All cinematic clips must be ready before final delivery.");
          }
          const updated = await updateVideoProject(ctx.user.id, input.id, { ...getCompletionTransition(input.finalVideoUrl), renderProgress: 100, renderPhase: "complete", renderError: null });
          if (!updated) throw new Error("The project could not be completed.");
          // Signed, not the raw /manus-storage key: there is no storage proxy to resolve
          // that path, so handing the browser the key would leave the player blank.
          return presentProject(updated, ctx.supabaseAccessToken);
        } catch (error) {
          console.error(`[Projects] complete failed for project ${input.id}:`, error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to complete this project." });
        }
      }),
    /** Mints (or returns) this project's public share token. Owner only. */
    share: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      projectIdInput(input.id);
      const project = await getVideoProject(ctx.user.id, input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      if (project.status !== "Done" || !project.finalVideoUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The reel has to finish before you can share it." });
      }
      const shareToken = project.shareToken || newShareToken();
      if (!project.shareToken) await updateVideoProject(ctx.user.id, input.id, { shareToken });
      return { shareToken };
    }),
    /** Revokes the public link. Anyone holding the old URL stops being able to open it. */
    unshare: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      projectIdInput(input.id);
      const project = await getVideoProject(ctx.user.id, input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      await updateVideoProject(ctx.user.id, input.id, { shareToken: null });
      return { success: true } as const;
    }),
    /**
     * The signed-out share page.
     *
     * Deliberately returns only what a viewer needs to watch the reel -- title, location, and
     * the finished video. No owner identity, no source photos, no render internals, no
     * project id. The Share button used to copy the owner-scoped dashboard URL, which showed
     * the recipient nothing but "Project not found".
     */
    getShared: publicProcedure.input(z.object({ token: z.string().min(16).max(64) })).query(async ({ ctx, input }) => {
      await requireRateLimit("shareView", clientIp(ctx.req));
      const project = await getVideoProjectByShareToken(input.token);
      if (!project || project.status !== "Done" || !project.finalVideoUrl) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This link is no longer available." });
      }
      return {
        title: project.title,
        location: project.location,
        description: project.description,
        // Signed with the service credentials: a share viewer has no Supabase session.
        finalVideoUrl: await signStoredUrl(project.finalVideoUrl, null),
      };
    }),
  }),
  billing: router({
    /** What this account can spend, and the history behind it. */
    summary: protectedProcedure.query(async ({ ctx }) => {
      // ensureBillingAccount creates the trial row on first read, so it has to settle before
      // the balance is read -- otherwise a brand-new account reports 0 from a row that does
      // not exist yet and the two disagree.
      const account = await ensureBillingAccount(ctx.user.id);
      const ledger = await listCreditLedger(ctx.user.id);
      return {
        clipCredits: account?.creditBalance ?? 0,
        stagingCredits: ctx.user.stagingCreditsRemaining,
        plan: account?.plan ?? "trial",
        status: account?.status ?? "inactive",
        ledger,
      };
    }),
  }),
  admin: router({
    /**
     * Grants clip credits to an account by email.
     *
     * This is the billing seam until a payment gateway is wired up: the owner takes payment
     * out of band and grants the matching credits here. `referenceId` is what stops a
     * double-submitted grant from handing out twice the credit.
     */
    grantCredits: adminProcedure
      .input(z.object({
        email: z.string().trim().email().max(320),
        clipCredits: z.number().int().min(1).max(10_000),
        reason: z.string().trim().min(3).max(500),
        /** Unique per grant, e.g. an invoice number. Re-sending the same one grants nothing. */
        referenceId: z.string().trim().min(4).max(120),
      }))
      .mutation(async ({ input }) => {
        const target = await getUserByEmail(input.email);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "No account with that email address." });
        const balance = await moveCredits({
          userId: target.id,
          amount: input.clipCredits,
          entryType: "purchase",
          referenceId: `purchase:${input.referenceId}`,
          description: input.reason,
        });
        return { userId: target.id, email: input.email, clipCredits: balance };
      }),
  }),
  media: router({
    createUploadTarget: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(240), type: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        await requireRateLimit("uploadTarget", String(ctx.user.id));
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "video/webm", "video/mp4"];
        if (!allowedTypes.includes(input.type)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Use JPG, PNG, WEBP, WEBM, or MP4 media files." });
        }
        const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
        return storageCreatePutTarget(`property-projects/${ctx.user.id}/outputs/${Date.now()}-${safeName}`, ctx.supabaseAccessToken ?? undefined);
      }),
  }),
});

export type AppRouter = typeof appRouter;
