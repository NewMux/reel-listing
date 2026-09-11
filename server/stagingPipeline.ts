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

/** Leaves headroom inside the 10s function budget for signing, download, and re-upload. */
const STAGING_POLL_BUDGET_MS = 6_000;
const STAGING_POLL_INTERVAL_MS = 700;

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
 * Waits, inside the function's own time budget, for a queued staging job to finish.
 *
 * Returns null rather than throwing when the job is simply still running: the credit has
 * already been spent on work fal.ai is genuinely doing, so the caller should tell the
 * customer to come back rather than refund and abandon a job that will still be billed.
 */
async function pollStagingResult(client: typeof fal, requestId: string): Promise<string | null> {
  const deadline = Date.now() + STAGING_POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    const status = await client.queue.status(FAL_STAGING_MODEL, { requestId, logs: false });
    if (status.status === "COMPLETED") {
      const result = await client.queue.result(FAL_STAGING_MODEL, { requestId });
      const url = normalizeStagedImageUrl(result.data);
      if (!url) throw new Error("The staging model did not return an image.");
      return url;
    }
    if ((status.status as string) === "FAILED") throw new Error("The staging model could not furnish this photo.");
    await new Promise(resolve => setTimeout(resolve, STAGING_POLL_INTERVAL_MS));
  }
  return null;
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

  // `client.subscribe` blocks until the model finishes, which for staging is tens of seconds.
  // Vercel gives this function 10 seconds (vercel.json), so a blocking call could never
  // succeed: it always timed out, the credit was refunded, and the fal.ai job ran and billed
  // anyway. Submit to the queue and poll within our own budget instead, matching the pattern
  // server/falPipeline.ts already uses for video jobs.
  const { request_id: requestId } = await client.queue.submit(FAL_STAGING_MODEL, {
    input: {
      image_urls: [sourceUrl],
      prompt: stagingPrompt(style),
      lora_scale: 1,
      output_format: "png",
    },
  });

  const stagedUrl = await pollStagingResult(client, requestId);
  if (!stagedUrl) throw new Error("The staged photo is still being generated. Open the project again in a moment to see it.");

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
