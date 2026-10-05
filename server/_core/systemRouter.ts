import { z } from "zod";
import { publicProcedure, router } from "./trpc";
import { FAL_CLIP_SECONDS, FAL_GENERATE_AUDIO, FAL_IMAGE_TO_VIDEO_MODEL } from "../../shared/video";

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
      promptStyle: "silent-camera-only-gimbal-v3",
      audioEnabled: FAL_GENERATE_AUDIO,
    })),

});
