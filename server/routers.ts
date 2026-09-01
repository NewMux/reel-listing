import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getPilotGallery, pilotGalleryIds } from "../shared/pilotGalleries";
import { MAX_PROPERTY_MEDIA_BYTES, MAX_PROPERTY_PHOTOS } from "../shared/video";
import { AUTH_UNAVAILABLE_ERR_MSG, COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createVideoProject, getVideoProject, listVideoProjects, updateVideoProject } from "./db";
import {
  getApprovalTransition,
  getChangeRequestTransition,
  getCompletionTransition,
  validateUploadedPropertyMedia,
} from "./projects";
import { signStoredUrl, storageCreatePutTarget, storageGetSignedUrl } from "./storage";
import { appendUploadChunk, createUploadSession, finalizeUploadSession } from "./uploadSessions";
import { getProjectRenderStatus } from "./renderPipeline";
import { refreshFalRender, submitFalRender } from "./falPipeline";

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

async function presentSourceUrls(project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>, accessToken: string | null) {
  if (!accessToken) return project.mediaUrls;
  return Promise.all(project.mediaKeys.map((key, index) => isPilotMediaKey(key) ? project.mediaUrls[index] : storageGetSignedUrl(key, accessToken)));
}

async function presentProject(project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>, accessToken: string | null) {
  if (!project) return project;
  const mediaUrls = await presentSourceUrls(project, accessToken);
  return { ...project, mediaUrls, finalVideoUrl: await signStoredUrl(project.finalVideoUrl, accessToken) };
}

async function presentRender(snapshot: Awaited<ReturnType<typeof getProjectRenderStatus>>, project: NonNullable<Awaited<ReturnType<typeof getVideoProject>>>, accessToken: string | null) {
  if (!project) return snapshot;
  const sourceUrls = await presentSourceUrls(project, accessToken);
  return {
    ...snapshot,
    finalVideoUrl: await signStoredUrl(snapshot.finalVideoUrl, accessToken),
    shots: snapshot.shots.map((shot, index) => ({ ...shot, sourceUrl: sourceUrls[index] || shot.sourceUrl })),
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
          return { id };
        } catch (error) {
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
        return { id };
      }),
    approve: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      projectIdInput(input.id);
      const project = await getVideoProject(ctx.user.id, input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      try {
        const transition = getApprovalTransition(project.status);
        const render = await submitFalRender(ctx.user.id, project, ctx.supabaseAccessToken);
        const updated = await updateVideoProject(ctx.user.id, input.id, transition);
        if (!updated) throw new Error("The project could not be updated after rendering started.");
        return { project: await presentProject(updated, ctx.supabaseAccessToken), render: await presentRender(render, project, ctx.supabaseAccessToken) };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to start fal.ai rendering." });
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
            return await presentRender(await refreshFalRender(ctx.user.id, project, ctx.supabaseAccessToken), project, ctx.supabaseAccessToken);
          } catch (error) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to refresh fal.ai rendering." });
          }
        }
        return presentRender(getProjectRenderStatus(project), project, ctx.supabaseAccessToken);
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
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to complete this project." });
        }
      }),
  }),
  media: router({
    createUploadSession: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(240), type: z.string().min(1).max(100), totalBytes: z.number().int().positive().max(MAX_PROPERTY_MEDIA_BYTES) }))
      .mutation(({ ctx, input }) => {
        try {
          return createUploadSession(ctx.user.id, input.name, input.type, input.totalBytes, ctx.supabaseAccessToken);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to prepare upload." });
        }
      }),
    appendUploadChunk: protectedProcedure
      .input(z.object({ uploadId: z.string().uuid(), chunk: z.string().min(4).max(100_000) }))
      .mutation(({ ctx, input }) => {
        try {
          return appendUploadChunk(ctx.user.id, input.uploadId, input.chunk);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to upload this part." });
        }
      }),
    finalizeUploadSession: protectedProcedure
      .input(z.object({ uploadId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await finalizeUploadSession(ctx.user.id, input.uploadId);
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to secure this media." });
        }
      }),
    createUploadTarget: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(240), type: z.string().min(1).max(100) }))
      .mutation(async ({ ctx, input }) => {
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
