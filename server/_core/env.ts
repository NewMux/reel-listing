import { env } from "cloudflare:workers";

// Bindings (D1, R2, email, rate limiters) and vars/secrets from wrangler.jsonc / .dev.vars.
// Read lazily so a value is always the one bound to the current Worker, never a stale copy.
export const ENV = {
  get db() {
    return env.DB;
  },
  get media() {
    return env.MEDIA;
  },
  get email() {
    return env.EMAIL;
  },
  get contactRateLimiter() {
    return env.CONTACT_RATE_LIMITER;
  },
  get authRateLimiter() {
    return env.AUTH_RATE_LIMITER;
  },
  get falKey(): string {
    return env.FAL_KEY ?? "";
  },
  get ownerEmail(): string {
    return (env.OWNER_EMAIL ?? "").trim().toLowerCase();
  },
  get emailFrom(): string {
    return env.EMAIL_FROM ?? "";
  },
  get r2(): { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string } {
    return {
      accountId: env.R2_ACCOUNT_ID ?? "",
      accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
      bucket: env.R2_BUCKET ?? "",
    };
  },
  // The stable production domain, used to build callback URLs (fal.ai webhooks, emailed
  // auth links) that must keep working across redeploys.
  get publicUrl(): string {
    return (env.PUBLIC_URL || "https://reel-listing.com").replace(/\/+$/, "");
  },
};
