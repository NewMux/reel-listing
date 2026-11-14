import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

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
  /** @deprecated Superseded by `credits`; kept so the 0010 migration can convert old balances. */
  videosRemaining: integer("videosRemaining").default(3).notNull(),
  // 1 credit = 1 second of generated video. New accounts start with FREE_TRIAL_CREDITS
  // (shared/billing.ts); every change to this balance also writes a credit_ledger row.
  credits: integer("credits").default(30).notNull(),
  plan: varchar("plan", { length: 32 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  stagingCreditsRemaining: integer("stagingCreditsRemaining").default(0).notNull(),
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
    // A client-written full prompt per photo; when set it is sent to the video model as-is
    // (length-limited only) instead of the guided real-estate prompt -- the customer's footage,
    // the customer's direction.
    customPrompts: jsonb("customPrompts").$type<(string | null)[]>().default([]),
    // Per-clip failure message. A failed clip is refunded and can be retried on its own; it
    // no longer fails the whole project.
    clipErrors: jsonb("clipErrors").$type<(string | null)[]>().default([]),
    // fal.ai request id of the server-side merge that produces the final reel.
    assemblyRequestId: varchar("assemblyRequestId", { length: 80 }),
    // Short-lived mutex so a status poll, a webhook and a regenerate can't interleave their
    // read-modify-write of the per-clip arrays (which previously could double-submit paid jobs).
    renderLockedAt: timestamp("renderLockedAt", { withTimezone: true }),
    // Unguessable token for the public watch page (/r/:token); null until the owner shares.
    shareToken: varchar("shareToken", { length: 40 }),
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
    uniqueIndex("video_projects_share_token_idx").on(table.shareToken),
    index("video_projects_assembly_request_idx").on(table.assemblyRequestId),
  ],
);

/** Append-only record of every credit grant, spend and refund. `reference` is unique so a
 *  retried webhook or a racing poll can never apply the same grant or refund twice. */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    delta: integer("delta").notNull(),
    reason: varchar("reason", { length: 40 }).notNull(),
    reference: varchar("reference", { length: 160 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("credit_ledger_reference_idx").on(table.reference),
    index("credit_ledger_user_idx").on(table.userId),
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
