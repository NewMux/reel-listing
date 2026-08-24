export const projectStatuses = ["Uploading", "Processing", "Review", "Done"] as const;
export const renderPhases = ["idle", "generating", "assembly", "complete", "failed"] as const;
export type RenderPhase = (typeof renderPhases)[number];
export const FAL_IMAGE_TO_VIDEO_MODEL = "fal-ai/kling-video/v3/pro/image-to-video";
export const FAL_VISION_PROMPT_MODEL = "openrouter/router/vision";
export const FAL_VISION_LLM_MODEL = "google/gemini-2.5-flash";
export const FAL_CLIP_SECONDS = 10;

export type ProjectStatus = (typeof projectStatuses)[number];

export type ProjectMedia = {
  name: string;
  type: string;
  url: string;
};

export const MAX_PROPERTY_MEDIA_BYTES = 25 * 1024 * 1024;
export const MAX_PROPERTY_PHOTOS = 10;
/** @deprecated Use MAX_PROPERTY_PHOTOS for the upper bound. */
export const REQUIRED_PROPERTY_IMAGES = MAX_PROPERTY_PHOTOS;
