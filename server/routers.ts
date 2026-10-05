import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getPilotGallery, pilotGalleryIds } from "../shared/pilotGalleries";
import { MAX_PROPERTY_PHOTOS, STAGING_STYLES } from "../shared/video";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createVideoProject,
  decrementStagingCredits,
  decrementVideoQuota,
  getVideoProject,
  incrementStagingCredits,
  incrementVideoQuota,
  insertContactMessage,
  listVideoProjects,
  updateVideoProject,
} from "./db";
import { stagePhoto } from "./stagingPipeline";
import { checkRateLimit } from "./rateLimit";
import { authRouter, clientIp } from "./auth/router";
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

function isPilotMediaKey(key: string) {
  return key.startsWith("pilot:");
}

function asOverrideArray<T>(value: (T | null)[] | null | undefined, length: number): (T | null)[] {
  const source = value || [];
  return Array.from({ length }, (_, index) => source[index] ?? null);
}


async function presentSourceUrls(project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>) {
  return Promise.all(project.mediaKeys.map((key, index) => isPilotMediaKey(key) ? project.mediaUrls[index] : storageGetSignedUrl(key)));
}

async function presentProject(project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>, sourceUrls?: string[]) {
  if (!project) return project;
  const mediaUrls = sourceUrls ?? await presentSourceUrls(project);
  return { ...project, mediaUrls, finalVideoUrl: await signStoredUrl(project.finalVideoUrl) };
}

async function presentRender(snapshot: Awaited<ReturnType<typeof getProjectRenderStatus>>, project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>, sourceUrls?: string[]) {
  if (!project) return snapshot;
  const resolvedSourceUrls = sourceUrls ?? await presentSourceUrls(project);
  return {
    ...snapshot,
    finalVideoUrl: await signStoredUrl(snapshot.finalVideoUrl),
    shots: snapshot.shots.map((shot, index) => ({ ...shot, sourceUrl: resolvedSourceUrls[index] || shot.sourceUrl })),
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
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
        const { allowed } = await checkRateLimit(ENV.contactRateLimiter, `contact:${clientIp(ctx.req)}`);
        if (!allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many messages sent. Please try again later." });
        }
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
    list: protectedProcedure.query(async ({ ctx }) => Promise.all((await listVideoProjects(ctx.user.id)).map(project => presentProject(project)))),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      projectIdInput(input.id);
      const project = await getVideoProject(ctx.user.id, input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      return presentProject(project);
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
          if (created) {
            try {
              await submitShotClassification(ctx.user.id, created);
            } catch (error) {
              console.error(`[Projects] pre-approval classification submission failed for project ${id}:`, error);
            }
          }
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
        if (created) {
          try {
            await submitShotClassification(ctx.user.id, created);
          } catch (error) {
            console.error(`[Projects] pre-approval classification submission failed for project ${id}:`, error);
          }
        }
        return { id };
      }),
    approve: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      projectIdInput(input.id);
      const project = await getVideoProject(ctx.user.id, input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      try {
        const transition = getApprovalTransition(project.status);
        const remaining = await decrementVideoQuota(ctx.user.id);
        if (remaining === null) {
          throw new Error("You've used all of your included videos. Contact us to add more before rendering another reel.");
        }
        try {
          const render = await submitFalRender(ctx.user.id, project);
          const updated = await updateVideoProject(ctx.user.id, input.id, transition);
          if (!updated) throw new Error("The project could not be updated after rendering started.");
          // mediaKeys don't change across approval -- sign them once and hand the same array to
          // both presenters instead of paying for two full signing round-trips in series, which
          // was enough to blow past the 10s function budget under any Storage-signing latency.
          const sourceUrls = await presentSourceUrls(updated);
          const [presentedProject, presentedRender] = await Promise.all([
            presentProject(updated, sourceUrls),
            presentRender(render, project, sourceUrls),
          ]);
          return { project: presentedProject, render: presentedRender };
        } catch (renderError) {
          await incrementVideoQuota(ctx.user.id).catch(() => {});
          throw renderError;
        }
      } catch (error) {
        console.error(`[Projects] approve failed for project ${input.id}:`, error);
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to start fal.ai rendering." });
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
          return presentProject(updated);
        } catch (error) {
          console.error(`[Projects] reorder failed for project ${input.id}:`, error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to reorder these photos." });
        }
      }),
    stagePhoto: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), index: z.number().int().nonnegative(), style: z.enum(STAGING_STYLES) }))
      .mutation(async ({ ctx, input }) => {
        projectIdInput(input.id);
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
            const staged = await stagePhoto(ctx.user.id, project, input.index, input.style);
            const mediaUrls = [...project.mediaUrls];
            const mediaKeys = [...project.mediaKeys];
            const mediaTypes = [...project.mediaTypes];
            mediaUrls[input.index] = staged.url;
            mediaKeys[input.index] = staged.key;
            mediaTypes[input.index] = staged.type;
            const updated = await updateVideoProject(ctx.user.id, input.id, { mediaUrls, mediaKeys, mediaTypes });
            if (!updated) throw new Error("The project could not be updated.");
            return presentProject(updated);
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
            return await presentRender(await refreshFalRender(ctx.user.id, project), project);
          } catch (error) {
            console.error(`[Projects] renderStatus refresh failed for project ${input.id}:`, error);
            throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to refresh fal.ai rendering." });
          }
        }
        return presentRender(getProjectRenderStatus(project), project);
      }),
    shotDirections: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        const overrides = { customCameraMoves: project.customCameraMoves || [], clipDurations: project.clipDurations || [] };
        if (project.status !== "Review" || !project.promptRequestIds?.length) {
          return { shots: getShotPlan(project.mediaUrls, project.generatedPrompts || []), shotAnalysis: project.shotAnalysis || [], ready: true, ...overrides };
        }
        try {
          const { generatedPrompts, ready } = await refreshShotClassification(ctx.user.id, project);
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
        cameraMove: z.string().trim().max(360).nullable().optional(),
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
          if (input.cameraMove !== undefined) customCameraMoves[input.index] = input.cameraMove || null;
          if (input.durationSeconds !== undefined) clipDurations[input.index] = input.durationSeconds;

          const updatedProject = { ...project, customCameraMoves, clipDurations };
          const shotAnalysis = project.shotAnalysis?.[input.index];
          const generatedPrompts = project.generatedPrompts ? [...project.generatedPrompts] : [];
          // Rebuild this one photo's prompt immediately from its already-persisted shotAnalysis --
          // no fal.ai call needed, so editing an override is instant and free.
          if (shotAnalysis) generatedPrompts[input.index] = buildCinematicPrompt(input.index, shotAnalysis, updatedProject);

          const updated = await updateVideoProject(ctx.user.id, input.id, { customCameraMoves, clipDurations, generatedPrompts });
          if (!updated) throw new Error("The project could not be updated.");
          return { shots: getShotPlan(updated.mediaUrls, updated.generatedPrompts || []), shotAnalysis: updated.shotAnalysis || [], customCameraMoves: updated.customCameraMoves || [], clipDurations: updated.clipDurations || [], ready: true };
        } catch (error) {
          console.error(`[Projects] updateShotOverride failed for project ${input.id}, index ${input.index}:`, error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to update this shot." });
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
          return updateVideoProject(ctx.user.id, input.id, { ...getCompletionTransition(input.finalVideoUrl), renderProgress: 100, renderPhase: "complete", renderError: null });
        } catch (error) {
          console.error(`[Projects] complete failed for project ${input.id}:`, error);
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to complete this project." });
        }
      }),
  }),
  media: router({
    createUploadTarget: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(240), type: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "video/webm", "video/mp4"];
        if (!allowedTypes.includes(input.type)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Use JPG, PNG, WEBP, WEBM, or MP4 media files." });
        }
        const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
        return storageCreatePutTarget(`property-projects/${ctx.user.id}/outputs/${Date.now()}-${safeName}`);
      }),
  }),
});

export type AppRouter = typeof appRouter;
