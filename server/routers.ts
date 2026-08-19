import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
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
import { storageCreatePutTarget } from "./storage";
import { appendUploadChunk, createUploadSession, finalizeUploadSession } from "./uploadSessions";

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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  projects: router({
    list: protectedProcedure.query(({ ctx }) => listVideoProjects(ctx.user.id)),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      projectIdInput(input.id);
      const project = await getVideoProject(ctx.user.id, input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      return project;
    }),
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().trim().min(2).max(160),
          description: z.string().trim().max(1_000).optional(),
          location: z.string().trim().min(2).max(180),
          files: z.array(fileSchema).min(1).max(10),
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
    approve: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      projectIdInput(input.id);
      const project = await getVideoProject(ctx.user.id, input.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      try {
        return updateVideoProject(ctx.user.id, input.id, getApprovalTransition(project.status));
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to approve this project." });
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
    complete: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), finalVideoUrl: z.string().min(1).max(2_000) }))
      .mutation(async ({ ctx, input }) => {
        projectIdInput(input.id);
        const project = await getVideoProject(ctx.user.id, input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
        try {
          return updateVideoProject(ctx.user.id, input.id, getCompletionTransition(input.finalVideoUrl));
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to complete this project." });
        }
      }),
  }),
  media: router({
    createUploadSession: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(240), type: z.string().min(1).max(100), totalBytes: z.number().int().positive().max(25 * 1024 * 1024) }))
      .mutation(({ ctx, input }) => {
        try {
          return createUploadSession(ctx.user.id, input.name, input.type, input.totalBytes);
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
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];
        if (!allowedTypes.includes(input.type)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Use JPG, PNG, WEBP, MP4, or MOV media files." });
        }
        const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
        return storageCreatePutTarget(`property-projects/${ctx.user.id}/${Date.now()}-${safeName}`);
      }),
  }),
});

export type AppRouter = typeof appRouter;
