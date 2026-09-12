import { boolean, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/** Core account record populated from Manus OAuth. */
export const userRole = pgEnum("user_role", ["user", "admin"]);
export const projectStatus = pgEnum("project_status", ["Uploading", "Processing", "Review", "Done"]);
export const renderPhase = pgEnum("render_phase", ["idle", "generating", "assembly", "complete", "failed"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  // Permanent credit. One-time packs plus grandfathered signup credit -- never reset.
  videosRemaining: integer("videosRemaining").default(0).notNull(),
  stagingCreditsRemaining: integer("stagingCreditsRemaining").default(0).notNull(),
  // Perishable credit. Reset to the plan allowance at the start of each billing period.
  // Kept separate from the permanent bucket so a renewal cannot wipe a purchased pack.
  subscriptionVideosRemaining: integer("subscriptionVideosRemaining").default(0).notNull(),
  subscriptionStagingRemaining: integer("subscriptionStagingRemaining").default(0).notNull(),
  paddleCustomerId: varchar("paddleCustomerId", { length: 64 }),
  billingBlocked: boolean("billingBlocked").default(false).notNull(),
  trialGrantedAt: timestamp("trialGrantedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
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

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    paddleSubscriptionId: varchar("paddleSubscriptionId", { length: 64 }).notNull(),
    paddleCustomerId: varchar("paddleCustomerId", { length: 64 }),
    planId: varchar("planId", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    currentPeriodStart: timestamp("currentPeriodStart", { withTimezone: true }),
    currentPeriodEnd: timestamp("currentPeriodEnd", { withTimezone: true }),
    // The billing period we last granted for. This -- not the webhook event id -- is what
    // makes granting idempotent: one new subscription fires both subscription.activated
    // and transaction.completed, two distinct events describing the same period, so
    // per-event dedupe would grant the allowance twice on every signup.
    lastGrantedPeriodStart: timestamp("lastGrantedPeriodStart", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
    // Paddle does not guarantee ordering; an out-of-order update is dropped.
    occurredAt: timestamp("occurredAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("subscriptions_paddle_id_idx").on(table.paddleSubscriptionId),
    index("subscriptions_user_idx").on(table.userId),
  ],
);

export const billingEvents = pgTable(
  "billing_events",
  {
    id: serial("id").primaryKey(),
    paddleEventId: varchar("paddleEventId", { length: 64 }).notNull(),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    userId: integer("userId"),
    payload: jsonb("payload"),
    occurredAt: timestamp("occurredAt", { withTimezone: true }),
    receivedAt: timestamp("receivedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("billing_events_event_id_idx").on(table.paddleEventId),
    index("billing_events_user_idx").on(table.userId),
  ],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    /** "video" | "staging" */
    creditType: varchar("creditType", { length: 16 }).notNull(),
    /** "subscription" | "permanent" */
    bucket: varchar("bucket", { length: 16 }).notNull(),
    delta: integer("delta").notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    reason: text("reason"),
    refId: varchar("refId", { length: 64 }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("credit_ledger_user_idx").on(table.userId), index("credit_ledger_ref_idx").on(table.refId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type VideoProject = typeof videoProjects.$inferSelect;
export type InsertVideoProject = typeof videoProjects.$inferInsert;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
export type BillingEvent = typeof billingEvents.$inferSelect;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
