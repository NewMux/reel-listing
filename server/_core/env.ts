export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  falKey: process.env.FAL_KEY ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  // The stable production domain, used to build callback URLs (e.g. fal.ai webhooks) that
  // must keep working across redeploys -- deliberately not derived from Vercel's per-deployment URL.
  publicUrl: process.env.PUBLIC_URL ?? "https://reel-listing.com",
  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  /**
   * Secret for the Paddle webhook endpoint, used to verify every incoming signature. This
   * webhook is the only evidence the app ever gets that money changed hands, so without this
   * the endpoint refuses everything rather than trusting an unverified body.
   */
  paddleWebhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? "",
  /** Maps a Paddle price to one of our plans. Sandbox and production use different ids. */
  paddlePriceIds: {
    solo: process.env.PADDLE_PRICE_SOLO ?? "",
    pro: process.env.PADDLE_PRICE_PRO ?? "",
    agency: process.env.PADDLE_PRICE_AGENCY ?? "",
  },
};
