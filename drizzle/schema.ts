import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

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
    falRequestIds: jsonb("falRequestIds").$type<(string | null)[]>().default([]),
    clipUrls: jsonb("clipUrls").$type<(string | null)[]>().default([]),
    renderProgress: integer("renderProgress").default(0).notNull(),
    renderPhase: renderPhase("renderPhase").default("idle").notNull(),
    renderError: text("renderError"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("video_projects_user_idx").on(table.userId)],
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
