# Package economics

## What a reel actually costs

The app calls `fal-ai/kling-video/v3/pro/image-to-video` (see `shared/video.ts`).
fal.ai bills that model at **$0.112 per second of generated video with audio off**,
which is the mode this app uses (`FAL_GENERATE_AUDIO = false`).

Source: https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video

Credits are counted per clip, because cost is per clip:

| Unit | Cost |
|---|---|
| One 10-second clip | $1.12 |
| Vision classification for one photo (Gemini 2.5 Flash via fal) | about $0.002 |
| **One clip credit, all in** | **about $1.13** |
| A full ten-photo listing reel | **about $11.27** |

A five-second clip costs half of a ten-second one, which is why per-photo clip
length is a customer-facing control rather than a fixed constant.

## Correction to the original business plan

`business-plan-notes.md` records the uploaded plan's assumption of **$2.80** per
ten-image tour, based on Kling 2.1 Standard at $0.056/s. The shipped product
calls Kling v3 Pro, which is **four times that rate**. Every margin figure that
descends from the $2.80 number is wrong by the same factor.

This is a decision to make deliberately, not a bug to fix:

- Keep Kling v3 Pro and price at roughly $11.27 per reel of cost. This is what
  the current plans assume.
- Or switch `FAL_IMAGE_TO_VIDEO_MODEL` to a cheaper tier and re-test output
  quality on real property photos before committing to it.

## Current plans, and the margin behind each

Priced against $1.13 per clip credit:

| Plan | Price / month | Clip credits | Direct cost | Gross margin |
|---|---|---|---|---|
| Starter | $99 | 30 | $33.90 | 66% |
| Pro | $249 | 80 | $90.40 | 64% |
| Agency | $599 | 200 | $226.00 | 62% |
| Extra credits | $4 each | 1 | $1.13 | 72% |

These are before payment-processing fees and before the fixed infrastructure
below. No payment gateway is wired up yet, so credits are granted by an admin
after payment is taken out of band (`admin.grantCredits`).

## Why the 35 BHD package does not work as written

`todo.md` proposed 35 BHD for five completed listings. At the fixed BHD peg of
1 BHD = 2.659 USD that is $93.07 of revenue against five ten-photo reels, or
$56.35 of direct cost. That is a **39% gross margin** before any payment fee or
infrastructure, against 62-66% on the plans above. It should be repriced or
retired.

Source for the peg: https://www.cbb.gov.bh/facilities-interest-rates/

## Fixed monthly costs

| Item | Cost | Note |
|---|---|---|
| Vercel Pro | $20 | Required. Hobby prohibits commercial use. |
| Supabase Pro | $25 | Once past 500 MB database, 1 GB storage, or 5 GB egress. |
| Upstash Redis | $0 to low | Free tier covers 10k commands/day. |
| Domain | about $1 | reel-listing.com renewal, amortised. |

Storage grows with every project: ten source photos, ten persisted clips, and
one final reel each. Budget for a retention policy rather than unbounded growth.

## Managed composition, if browser assembly is ever replaced

Shotstack lists pay-as-you-go rendering at $0.30 per rendered minute with a $75
one-time minimum, and subscription rendering at $0.20 per rendered minute with a
$39 monthly minimum. A 100-second reel is 1.667 rendered minutes, so about $0.50
or $0.33 per reel depending on tier. Assembly currently runs in the customer's
browser at no marginal cost.

Source: https://shotstack.io/pricing/
