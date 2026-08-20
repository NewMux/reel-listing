# Video Generation API Research

## Runway

Official documentation states that Runway exposes generative models through its API and demonstrates an asynchronous image-to-video task workflow. Its current documentation describes Gen-4.5 image-to-video generation, 5-second output in the quickstart, and a separate Seedance 2.5 capability for up to 1080p, 30-second cinematic video with a large reference budget for images, videos, and audio. The documentation also describes enterprise scale and higher usage paths.

Source: https://docs.dev.runwayml.com/

## Kling

Kling offers an official image-to-video API documentation surface for its 3.0 Omni model. The dynamically rendered documentation did not expose parameter details to the browser text extractor, so pricing, request semantics, availability, and operational controls require confirmation from the official developer documentation before selecting it as the primary provider.

Source: https://kling.ai/document-api/api/video/3-0-omni/image-to-video

## Luma

Luma’s current documentation presents image and video generation API capabilities, keys, billing, rate limits, errors, and video-specific SDK documentation. It redirects developers to the newer Luma Agents API documentation for current guides and reference material. This makes Luma a plausible secondary option, but its product transition creates additional integration and documentation-change risk for an MVP that needs a stable provider abstraction.

Source: https://docs.lumalabs.ai/docs/welcome

## Runway pricing and model breadth

Runway’s official pricing page states that API credits are purchased at $0.01 per credit. It currently lists multiple routed video models, including Gen-4.5 at 12 credits per output second, Gen-4 Turbo at 5 credits per output second, Veo 3.1 options, and Seedance 2.5 variants. For example, a 5-second Gen-4.5 generation is listed at 60 credits ($0.60) before any retries. The pricing page also describes a Model Router that reports the actual selected model and realized credit cost, which is useful for a tiered commercial product.

Source: https://docs.dev.runwayml.com/guides/pricing/
