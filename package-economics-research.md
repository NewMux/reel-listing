# Package economics

## What a reel actually costs

The app calls `fal-ai/kling-video/v3/pro/image-to-video` (see `shared/video.ts`).
fal.ai bills that model at **$0.112 per second of generated video with audio off**,
which is the mode this app uses (`FAL_GENERATE_AUDIO = false`).

Source: https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video

Credits are counted in five-second units, because that is how the model bills:

| Unit | Cost |
|---|---|
| One credit (5 seconds of video) | $0.56 |
| One 10-second shot (2 credits) | $1.12 |
| Vision classification for one photo (Gemini 2.5 Flash via fal) | about $0.002 |
| A full ten-photo reel of 10-second shots (20 credits) | **about $11.22** |

Pricing per clip rather than per second was the earlier model, and it charged a five-second
shot the same as a ten-second one. That never lost money, but it made the short "Bright and
quick" reel style cost a customer exactly as much as the long one while using half the
compute. Pricing in seconds removes the oddity and tracks the bill.

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

Priced against $0.56 per credit:

| Plan | Price / month | Credits | Full reels | Direct cost | Gross margin |
|---|---|---|---|---|---|
| Solo | $99 | 60 | 3 | $33.60 | 66% |
| Pro | $249 | 160 | 8 | $89.60 | 64% |
| Agency | $599 | 400 | 20 | $224.00 | 63% |
| Extra credits | $2 each | 1 | — | $0.56 | 72% |

A "full reel" is ten photos at ten seconds each. A customer choosing the shorter social style
gets twice as many reels from the same credits, and costs correspondingly less to serve.

These figures are before payment-processing fees and before the fixed infrastructure below.
No payment gateway is wired up yet, so credits are granted by an admin after payment is taken
out of band (`admin.grantCredits`).

Plan names match the `billing_plan` database enum deliberately, so a granted plan and a
displayed plan are the same word.

## Local-currency pricing

GCC customers see the same plans priced in Bahraini dinar at the fixed peg of
1 BHD = 2.659 USD. Same credits, same product, same margin band:

| Plan | BHD | USD equivalent | Credits | Direct cost | Gross margin |
|---|---|---|---|---|---|
| Solo | 35 | $93.07 | 60 | $33.60 | 64% |
| Pro | 94 | $249.95 | 160 | $89.60 | 64% |
| Agency | 225 | $598.28 | 400 | $224.00 | 63% |
| Extra credits | 0.750 | $1.99 | 1 | $0.56 | 72% |

Source for the peg: https://www.cbb.gov.bh/facilities-interest-rates/

## The retired 35 BHD five-listing package

`todo.md` originally proposed 35 BHD for five completed listings. That is $93.07 against
$56.10 of direct cost: a **40% gross margin**, versus 63-66% everywhere else. The margin was
not the main problem. Two other things were:

**It undercut the cheapest plan by 44%.** At five listings it worked out to $18.61 a reel
against $31.02 on Solo, so any customer who could see both would take it, making the worst
margin in the range the most popular product.

**It left no room for a re-render.** A reel a customer rejects costs a full $11.22 again with
no new revenue. The package carried $36.97 of gross profit, or 3.3 re-renders across five
listings -- about two-thirds of one per listing. Solo absorbs nearly two per listing. Estate
agents are particular about how a listing looks, so this is a cost that will be incurred, not
a hypothetical.

The price point is kept, because 35 BHD is what the local market was quoted. It now buys the
Solo plan: three full reels at 60 credits, on the same economics as every other plan.

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
