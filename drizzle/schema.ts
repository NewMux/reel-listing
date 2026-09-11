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
  /**
   * Credits are counted in CLIPS, not whole videos: one photo becomes one clip, and a
   * ten-photo reel costs ten. Billing per project charged a one-photo reel the same as a
   * ten-photo one despite costing a tenth as much to produce.
   *
   * Defaults to zero. A render spends real money at fal.ai, so credit must follow a
   * payment or an explicit admin grant -- never a bare signup.
   */
  clipCreditsRemaining: integer("clipCreditsRemaining").default(0).notNull(),
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
    falRequestIds: jsonb("falRequestIds").$type<(string | null)[]>().default([]),
    clipUrls: jsonb("clipUrls").$type<(string | null)[]>().default([]),
    renderProgress: integer("renderProgress").default(0).notNull(),
    renderPhase: renderPhase("renderPhase").default("idle").notNull(),
    renderError: text("renderError"),
    /** Clip credits this project actually consumed, so a refund returns exactly that many. */
    creditsSpent: integer("creditsSpent").default(0).notNull(),
    /**
     * Idempotency guard for paid work. Claimed with a conditional UPDATE before any fal.ai
     * video job is submitted, so two concurrent callers cannot each submit a full set of
     * clips and bill the account twice.
     */
    renderLockedAt: timestamp("renderLockedAt", { withTimezone: true }),
    /** Unguessable token behind the public share link; null once the owner revokes sharing. */
    shareToken: varchar("shareToken", { length: 64 }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("video_projects_user_idx").on(table.userId),
    index("video_projects_prompt_request_ids_gin_idx").using("gin", table.promptRequestIds),
    index("video_projects_fal_request_ids_gin_idx").using("gin", table.falRequestIds),
    uniqueIndex("video_projects_share_token_idx").on(table.shareToken),
  ],
);

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** One row per user: the plan they are on, and the handle a payment gateway will key off. */
export const billingAccounts = pgTable("billing_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  plan: varchar("plan", { length: 64 }).default("none").notNull(),
  status: varchar("status", { length: 32 }).default("inactive").notNull(),
  /** Customer id at whichever gateway is eventually wired up. Null until then. */
  externalCustomerId: varchar("externalCustomerId", { length: 160 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("billing_accounts_user_idx").on(table.userId)]);

export const creditLedgerKinds = ["grant", "spend", "refund", "adjustment"] as const;
export type CreditLedgerKind = (typeof creditLedgerKinds)[number];

/**
 * Every movement of credit, in order. `users.clipCreditsRemaining` is the materialised
 * balance -- it stays a plain integer so the oversell guard can remain one atomic
 * conditional UPDATE -- and this table is the audit trail that explains how it got there.
 */
export const creditLedger = pgTable("credit_ledger", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  /** Signed: positive for grants and refunds, negative for spends. */
  delta: integer("delta").notNull(),
  kind: varchar("kind", { length: 32 }).$type<CreditLedgerKind>().notNull(),
  reason: text("reason"),
  projectId: integer("projectId"),
  /** Makes a retried grant or spend a no-op rather than a second charge. */
  idempotencyKey: varchar("idempotencyKey", { length: 160 }),
  balanceAfter: integer("balanceAfter"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("credit_ledger_user_idx").on(table.userId, table.createdAt),
  uniqueIndex("credit_ledger_idempotency_idx").on(table.idempotencyKey),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type VideoProject = typeof videoProjects.$inferSelect;
export type InsertVideoProject = typeof videoProjects.$inferInsert;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;
export type BillingAccount = typeof billingAccounts.$inferSelect;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type InsertCreditLedgerEntry = typeof creditLedger.$inferInsert;
