# fal.ai integration research

The selected provider is fal.ai: https://fal.ai/

Official documentation confirms that fal.ai exposes unified model APIs for image, video, audio, and other generative media. The API supports synchronous calls and asynchronous queue calls, and model requests can return hosted result URLs. Source: https://fal.ai/docs/documentation

The official Video Generation API reference confirms that fal.ai supports text-to-video, image-to-video, and video-to-video workflows. It lists multiple model families, including Kling Video, Sora 2, Veo 3.1, Grok Imagine Video, and others. The JavaScript/Python quick-start examples use fal_client.subscribe with a model endpoint and arguments. Source: https://fal.ai/docs/model-api-reference/video-generation-api/overview

Implementation implication: the fal.ai API key must remain server-side. The reel-listing backend should submit one queued image-to-video job per property photo, persist the provider request ID and source-photo index, poll or receive queue updates, store the resulting hosted clip URL, then stitch the clips in original upload order and persist the final video URL. A specific image-to-video model endpoint and its exact input schema still need to be selected from the fal.ai model catalog.

## Selected model candidate

The official model page https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video identifies `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` as an image-to-video endpoint with cinematic visuals and prompt control. Its visible input schema requires a `prompt` and `image_url`; it accepts JPG, JPEG, PNG, WEBP, GIF, and AVIF. The page’s visible pricing guidance states that a 5-second request costs $0.35 and each additional second costs $0.07, subject to current fal.ai pricing. The model page provides a JavaScript/Python-compatible model API surface and a hosted video result.

The implementation should use the model’s queue/API interface from the server, not expose the fal.ai API key in the browser. The property workflow can submit one 5-second or short-duration request per source photo with a property-safe motion prompt, preserve the source index, collect returned video URLs, then send the ordered clips to the stitching stage.
