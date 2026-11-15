# Stalled-render sweep

A render normally moves forward in two ways:
- **fal.ai's webhook** (`/api/webhooks/fal`), called when each job finishes.
- **The customer's project page**, which checks every 3 seconds while it's open.

If a webhook is lost and nobody has the page open, the render would sit still forever. The
sweep is the safety net for that.

`GET /api/cron/advance-renders` finds projects that are `Processing` (phase `generating` or
`assembly`) and haven't been touched for 3 minutes, oldest first, and advances each one exactly
like the webhook does. It handles up to 25 per call and stops early to stay inside the
10-second function limit; anything left over is picked up on the next call. Failed renders are
skipped because they wait for the customer.

## Setup

1. **Set `CRON_SECRET`** in the Vercel project's environment variables. Use a long random
   value. Without it the endpoint refuses every request.
2. **Set `SUPABASE_SERVICE_ROLE_KEY`** if it isn't set already. The sweep has no customer
   session, so it needs this to sign the photo URLs fal.ai downloads (the fal.ai webhook needs
   it too).
3. **Call the endpoint every 5 minutes**, sending the header
   `Authorization: Bearer <CRON_SECRET>`. Pick one:
   - **An external scheduler (works on any Vercel plan).** For example, in
     [cron-job.org](https://cron-job.org): URL `https://reel-listing.com/api/cron/advance-renders`,
     method GET, every 5 minutes, with the header above.
   - **Vercel Cron (Pro plan or higher only).** Add this to `vercel.json`. Vercel sends the
     `CRON_SECRET` header automatically. On the Hobby plan a cron that runs more than once a day
     makes every deployment fail, so don't add it there.

     ```json
     "crons": [{ "path": "/api/cron/advance-renders", "schedule": "*/5 * * * *" }]
     ```

## Checking it

A manual call returns a summary:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://reel-listing.com/api/cron/advance-renders
```

`{"found":0,"advanced":0,"failed":0,"skipped":0}` means nothing was stalled. Runs that find
stalled renders are also logged as `[StalledRenders]` in the function logs.
