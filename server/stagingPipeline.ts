import { fal } from "@fal-ai/client";
import type { VideoProject } from "../drizzle/schema";
import { FAL_STAGING_MODEL, StagingStyle } from "../shared/video";
import { ENV } from "./_core/env";
import { storageGetSignedUrl, storagePut } from "./storage";
import { withRetry } from "@shared/retry";

const STAGING_STYLE_PROMPTS: Record<StagingStyle, string> = {
  modern: "a modern interior design style: clean lines, neutral palette, minimal ornamentation, sleek furniture",
  bohemian: "a bohemian interior design style: warm layered textiles, rattan and wood furniture, plants, eclectic patterns",
  traditional: "a traditional interior design style: classic wood furniture, rich fabrics, symmetrical arrangement, timeless details",
  scandinavian: "a Scandinavian interior design style: light wood tones, soft neutral colors, simple functional furniture, cozy textiles",
  minimalist: "a minimalist interior design style: sparse furnishing, monochrome palette, uncluttered surfaces, quiet negative space",
  "contemporary-gulf": "a contemporary Gulf interior design style: refined majlis-inspired seating, warm neutral and gold accents, elegant modern furniture",
};

export function stagingPrompt(style: StagingStyle) {
  return [
    `Furnish this empty or under-furnished room in ${STAGING_STYLE_PROMPTS[style]}.`,
    "Preserve the exact architecture, walls, windows, doors, floor, ceiling, and room proportions exactly as shown.",
    "Do not alter structural elements, add or remove windows or doors, or change the room's shape or perspective.",
    "Add only furniture, decor, and soft furnishings appropriate to the style. Keep lighting consistent with the original photo.",
    "Photorealistic result, no people, no text, no watermarks.",
  ].join(" ");
}

function getFalClient() {
  if (!ENV.falKey) {
    throw new Error("fal.ai is not configured yet. Add FAL_KEY to the server environment before staging.");
  }
  fal.config({ credentials: ENV.falKey });
  return fal;
}

function normalizeStagedImageUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const images = (data as { images?: Array<{ url?: unknown }> }).images;
  const image = (data as { image?: { url?: unknown } }).image;
  const fromImages = Array.isArray(images) ? images[0]?.url : undefined;
  const url = fromImages ?? image?.url;
  return typeof url === "string" ? url : null;
}

/**
 * Furnishes one property photo in the requested style via fal.ai, then re-uploads the
 * result into our own storage (mediaUrls/mediaKeys are the project's long-lived source
 * of truth, re-signed on every load -- unlike the ephemeral fal.ai output URL, which
 * isn't guaranteed to stay valid for the life of the project).
 */
export async function stagePhoto(
  userId: number,
  project: VideoProject,
  index: number,
  style: StagingStyle,
  accessToken?: string | null,
): Promise<{ url: string; key: string; type: string }> {
  const client = getFalClient();
  const key = project.mediaKeys[index];
  const sourceUrl = key.startsWith("pilot:") ? project.mediaUrls[index] : await storageGetSignedUrl(key, accessToken ?? undefined);

  const result = await client.subscribe(FAL_STAGING_MODEL, {
    input: {
      image_urls: [sourceUrl],
      prompt: stagingPrompt(style),
      lora_scale: 1,
      output_format: "png",
    },
  });

  const stagedUrl = normalizeStagedImageUrl(result.data);
  if (!stagedUrl) throw new Error("fal.ai did not return a staged image.");

  const imageBytes = await withRetry(async () => {
    const response = await fetch(stagedUrl);
    if (!response.ok) throw new Error(`Could not download the staged image (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
  }, { label: "staged image download" });

  const uploaded = await storagePut(
    `property-projects/${userId}/staged/${Date.now()}-${index}.png`,
    imageBytes,
    "image/png",
    accessToken ?? undefined,
  );

  return { url: uploaded.url, key: uploaded.key, type: "image/png" };
}
