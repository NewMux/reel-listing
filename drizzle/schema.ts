import { boolean, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/** Core account record populated from Manus OAuth. */
export const userRole = pgEnum("user_role", ["user", "admin"]);
export const projectStatus = pgEnum("project_status", ["Uploading", "Processing", "Review", "Done"]);
export const renderPhase = pgEnum("render_phase", ["idle", "generating", "assembly", "complete", "failed"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "trialing", "past_due", "paused", "canceled"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  videosRemaining: integer("videosRemaining").default(3).notNull(),
  stagingCreditsRemaining: integer("stagingCreditsRemaining").default(0).notNull(),
  // Set once a user's first Paddle checkout completes; null means they've never subscribed/purchased.
  paddleCustomerId: varchar("paddleCustomerId", { length: 64 }).unique(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

// One row per user's Paddle subscription. userId is unique -- Paddle Billing gives each customer
// at most one subscription that matters for our purposes; a resubscribe/upgrade upserts this same
// row rather than creating a second one.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull().unique(),
    paddleSubscriptionId: varchar("paddleSubscriptionId", { length: 64 }).notNull().unique(),
    paddlePriceId: varchar("paddlePriceId", { length: 64 }).notNull(),
    status: subscriptionStatus("status").notNull(),
    currentPeriodEnd: timestamp("currentPeriodEnd", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("subscriptions_user_idx").on(table.userId)],
);

// Idempotency ledger for Paddle webhook deliveries: a row here means that event id has already
// been processed, so a Paddle retry (or a genuine duplicate delivery) is a safe no-op instead of
// double-granting quota.
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  eventId: varchar("eventId", { length: 64 }).primaryKey(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  processedAt: timestamp("processedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ShotAnalysis = { shotType: string; timeOfDay: string; cameraMove: string; lighting: string; focus: string };

export const videoProjects = pgTable(
  "video_projects",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    location: varchar("location", { length: 180 }).notNull(),
    mediaUrls: jsonb("mediaUrls").$type<string[]>().notNull(),
    mediaKeys: jsonb("mediaKeys").$type<string[]>().notNull(),
    mediaNames: jsonb("mediaNames").$type<string[]>().notNull(),
    mediaTypes: jsonb("mediaTypes").$type<string[]>().notNull(),
    status: projectStatus("status").default("Review").notNull(),
    revisionNotes: text("revisionNotes"),
    finalVideoUrl: text("finalVideoUrl"),
    promptRequestIds: jsonb("promptRequestIds").$type<(string | null)[]>().default([]),
    generatedPrompts: jsonb("generatedPrompts").$type<(string | null)[]>().default([]),
    // Parsed per-photo vision output (shotType/timeOfDay/cameraMove/lighting/focus), persisted
    // separately from generatedPrompts so a client's customCameraMoves override can be applied
    // (or changed) and generatedPrompts rebuilt from it without paying for reclassification.
    shotAnalysis: jsonb("shotAnalysis").$type<(ShotAnalysis | null)[]>().default([]),
    // A client-supplied camera-move override per photo; null means use shotAnalysis[index]'s
    // AI-suggested cameraMove. Every other shotAnalysis field (shotType, lighting, etc.) and all
    // of CINEMATIC_LOCK's safety/style rules still apply -- this only replaces the movement text.
    customCameraMoves: jsonb("customCameraMoves").$type<(string | null)[]>().default([]),
    // Per-photo clip length in seconds; null defaults to FAL_CLIP_SECONDS (10). Kling only
    // accepts "5" or "10" as a duration, so this is a toggle, not a free value.
    clipDurations: jsonb("clipDurations").$type<(number | null)[]>().default([]),
    falRequestIds: jsonb("falRequestIds").$type<(string | null)[]>().default([]),
    clipUrls: jsonb("clipUrls").$type<(string | null)[]>().default([]),
    renderProgress: integer("renderProgress").default(0).notNull(),
    renderPhase: renderPhase("renderPhase").default("idle").notNull(),
    renderError: text("renderError"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("video_projects_user_idx").on(table.userId),
    index("video_projects_prompt_request_ids_gin_idx").using("gin", table.promptRequestIds),
    index("video_projects_fal_request_ids_gin_idx").using("gin", table.falRequestIds),
  ],
);

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type VideoProject = typeof videoProjects.$inferSelect;
export type InsertVideoProject = typeof videoProjects.$inferInsert;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
