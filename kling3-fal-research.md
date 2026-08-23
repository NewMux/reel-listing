# Kling 3 on fal.ai — Verified Notes

**Official Pro image-to-video endpoint:** `fal-ai/kling-video/v3/pro/image-to-video`

**Required image field:** `start_image_url` rather than the Kling 2.5 field `image_url`.

**Prompt fields:** `prompt` or `multi_prompt`, but not both. Kling 3 supports multi-shot prompting, although reel-listing will continue using one five-second clip per property photo so each source image remains independently reviewable and stitchable.

**Duration:** 3–15 seconds are supported; the test workflow will retain five seconds per photo.

**Audio:** `generate_audio` defaults to true on the official page. For the property workflow, native audio will be explicitly disabled for now because the final reel is assembled from silent source clips and music/sound design is not yet implemented.

**Optional controls:** `end_image_url`, `elements`, `shot_type`, `negative_prompt`, and `cfg_scale` are supported. For this exact-image property workflow, the initial Kling 3 migration will use `start_image_url`, prompt, five-second duration, `generate_audio: false`, negative prompt, and `cfg_scale`; it will not invent an end image or custom element.

**Aspect ratio:** The official Kling 3 Pro image-to-video page states that aspect ratio is determined by the start image rather than a separate parameter. The existing source images are landscape, so the Kling 3 test will remain landscape before the editorial stitch.

**Pricing:** The official page states $0.112 per second with audio off, $0.168 per second with audio on, and $0.196 per second with voice control. A five-photo, five-second Kling 3 Pro run with audio off is therefore listed at approximately $2.80 before any vision-prompt or other platform charges. Actual account balance and final provider pricing should be checked in fal.ai before a paid rerender.

**Queue behavior:** The official API page recommends queue submission and status/result polling for long jobs, with webhooks also supported. The existing reel-listing workflow uses durable request IDs and polling; this migration preserves that behavior.

**Sources:**

1. https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video — official Kling 3 Pro image-to-video model page, schema, features, and pricing.
2. https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/api — official Kling 3 Pro API page, queue calls, schema, and output format.
3. https://fal.ai/docs/model-api-reference/video-generation-api/kling-video-v3-standard — official Kling 3 Standard API reference, including Kling 3 input conventions and queue usage.
