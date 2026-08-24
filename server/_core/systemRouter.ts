import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { FAL_CLIP_SECONDS, FAL_IMAGE_TO_VIDEO_MODEL } from "../../shared/video";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
      videoModel: FAL_IMAGE_TO_VIDEO_MODEL,
      clipSeconds: FAL_CLIP_SECONDS,
      promptStyle: "cinematic-gimbal-immediate-v2",
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
