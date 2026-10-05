import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { projectStatuses, renderPhases } from "../shared/video";

const createdAt = () => integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()).notNull();

/** Core account record. Credentials live in authCredentials so a user row never carries a password hash. */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerifiedAt: integer("emailVerifiedAt", { mode: "timestamp_ms" }),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  videosRemaining: integer("videosRemaining").default(3).notNull(),
  stagingCreditsRemaining: integer("stagingCreditsRemaining").default(0).notNull(),
  createdAt: createdAt(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()).notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp_ms" }).$defaultFn(() => new Date()).notNull(),
});

export const authCredentials = sqliteTable("auth_credentials", {
  userId: integer("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("passwordHash").notNull(),
  salt: text("salt").notNull(),
  iterations: integer("iterations").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()).notNull(),
});

/** Signed-in browser sessions. id is the SHA-256 of the cookie token, so a leaked table can't be replayed. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  table => [index("sessions_user_idx").on(table.userId)],
);

/** One-time email links (verification, password reset). id is the SHA-256 of the emailed token. */
export const authTokens = sqliteTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(),
    userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["verify_email", "reset_password"] }).notNull(),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("usedAt", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  table => [index("auth_tokens_user_idx").on(table.userId)],
);

export type ShotAnalysis = { shotType: string; timeOfDay: string; cameraMove: string; lighting: string; focus: string };

export const videoProjects = sqliteTable(
  "video_projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("userId").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location").notNull(),
    mediaUrls: text("mediaUrls", { mode: "json" }).$type<string[]>().notNull(),
    mediaKeys: text("mediaKeys", { mode: "json" }).$type<string[]>().notNull(),
    mediaNames: text("mediaNames", { mode: "json" }).$type<string[]>().notNull(),
    mediaTypes: text("mediaTypes", { mode: "json" }).$type<string[]>().notNull(),
    status: text("status", { enum: projectStatuses }).default("Review").notNull(),
    revisionNotes: text("revisionNotes"),
    finalVideoUrl: text("finalVideoUrl"),
    promptRequestIds: text("promptRequestIds", { mode: "json" }).$type<(string | null)[]>().$defaultFn(() => []),
    generatedPrompts: text("generatedPrompts", { mode: "json" }).$type<(string | null)[]>().$defaultFn(() => []),
    // Parsed per-photo vision output (shotType/timeOfDay/cameraMove/lighting/focus), persisted
    // separately from generatedPrompts so a client's customCameraMoves override can be applied
    // (or changed) and generatedPrompts rebuilt from it without paying for reclassification.
    shotAnalysis: text("shotAnalysis", { mode: "json" }).$type<(ShotAnalysis | null)[]>().$defaultFn(() => []),
    // A client-supplied camera-move override per photo; null means use shotAnalysis[index]'s
    // AI-suggested cameraMove. Every other shotAnalysis field (shotType, lighting, etc.) and all
    // of CINEMATIC_LOCK's safety/style rules still apply -- this only replaces the movement text.
    customCameraMoves: text("customCameraMoves", { mode: "json" }).$type<(string | null)[]>().$defaultFn(() => []),
    // Per-photo clip length in seconds; null defaults to FAL_CLIP_SECONDS (10). Kling only
    // accepts "5" or "10" as a duration, so this is a toggle, not a free value.
    clipDurations: text("clipDurations", { mode: "json" }).$type<(number | null)[]>().$defaultFn(() => []),
    falRequestIds: text("falRequestIds", { mode: "json" }).$type<(string | null)[]>().$defaultFn(() => []),
    clipUrls: text("clipUrls", { mode: "json" }).$type<(string | null)[]>().$defaultFn(() => []),
    renderProgress: integer("renderProgress").default(0).notNull(),
    renderPhase: text("renderPhase", { enum: renderPhases }).default("idle").notNull(),
    renderError: text("renderError"),
    createdAt: createdAt(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(() => new Date()).notNull(),
  },
  table => [index("video_projects_user_idx").on(table.userId)],
);

export const contactMessages = sqliteTable("contact_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: createdAt(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type VideoProject = typeof videoProjects.$inferSelect;
export type InsertVideoProject = typeof videoProjects.$inferInsert;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = typeof contactMessages.$inferInsert;
