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
  // Optional. Lets the server sign Storage URLs with no customer session -- needed for a
  // render to keep going from a webhook after the customer closes the tab, and for public
  // share pages of reels kept in Storage.
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  // Paddle Billing. The client-side token is public; it is handed to the browser per checkout.
  paddleApiKey: process.env.PADDLE_API_KEY ?? "",
  paddleClientToken: process.env.PADDLE_CLIENT_TOKEN ?? "",
  paddleWebhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? "",
  paddleEnvironment: (process.env.PADDLE_ENVIRONMENT === "sandbox" ? "sandbox" : "production") as "sandbox" | "production",
  paddlePrices: {
    starter: process.env.PADDLE_PRICE_STARTER ?? "",
    pro: process.env.PADDLE_PRICE_PRO ?? "",
    agency: process.env.PADDLE_PRICE_AGENCY ?? "",
  },
  // The stable production domain, used to build callback URLs (e.g. fal.ai webhooks) that
  // must keep working across redeploys -- deliberately not derived from Vercel's per-deployment URL.
  publicUrl: process.env.PUBLIC_URL ?? "https://reel-listing.com",
  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
};
