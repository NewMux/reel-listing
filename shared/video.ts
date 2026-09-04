export const projectStatuses = ["Uploading", "Processing", "Review", "Done"] as const;
export const renderPhases = ["idle", "generating", "assembly", "complete", "failed"] as const;
export type RenderPhase = (typeof renderPhases)[number];
export const FAL_IMAGE_TO_VIDEO_MODEL = "fal-ai/kling-video/v3/pro/image-to-video";
export const FAL_VISION_PROMPT_MODEL = "openrouter/router/vision";
export const FAL_VISION_LLM_MODEL = "google/gemini-2.5-flash";
export const FAL_CLIP_SECONDS = 10;
export const FAL_GENERATE_AUDIO = false;
/** Keep Kling prompt payloads below fal.ai's documented 2,500-character input ceiling. */
export const FAL_PROMPT_MAX_CHARS = 2_300;

export type ProjectStatus = (typeof projectStatuses)[number];

export type ProjectMedia = {
  name: string;
  type: string;
  url: string;
};

export const MAX_PROPERTY_MEDIA_BYTES = 25 * 1024 * 1024;
export const MAX_PROPERTY_PHOTOS = 10;

// The model ID and input/output shape (image_urls/prompt/lora_scale -> images[]) are
// confirmed real via @fal-ai/client's own bundled endpoint type catalog
// (node_modules/.pnpm/@fal-ai+client@*/.../src/types/endpoints.d.ts), not just search
// results -- network egress to fal.ai itself is still blocked in this dev environment,
// so actual STAGING QUALITY for real-estate photos is unverified until a real call is
// made. If results are poor, fal-ai/flux-pro/v1/fill (mask-based inpainting) is the
// documented fallback -- see server/stagingPipeline.ts.
export const FAL_STAGING_MODEL = "fal-ai/flux-2-lora-gallery/apartment-staging";

export const STAGING_STYLES = ["modern", "bohemian", "traditional", "scandinavian", "minimalist", "contemporary-gulf"] as const;
export type StagingStyle = (typeof STAGING_STYLES)[number];
/** @deprecated Use MAX_PROPERTY_PHOTOS for the upper bound. */
export const REQUIRED_PROPERTY_IMAGES = MAX_PROPERTY_PHOTOS;
