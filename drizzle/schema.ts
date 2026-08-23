import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Core account record populated from Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const videoProjects = mysqlTable(
  "video_projects",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    location: varchar("location", { length: 180 }).notNull(),
    mediaUrls: json("mediaUrls").$type<string[]>().notNull(),
    mediaKeys: json("mediaKeys").$type<string[]>().notNull(),
    mediaNames: json("mediaNames").$type<string[]>().notNull(),
    mediaTypes: json("mediaTypes").$type<string[]>().notNull(),
    status: mysqlEnum("status", ["Uploading", "Processing", "Review", "Done"])
      .default("Review")
      .notNull(),
    revisionNotes: text("revisionNotes"),
    finalVideoUrl: text("finalVideoUrl"),
    falRequestIds: json("falRequestIds").$type<(string | null)[]>().default([]),
    clipUrls: json("clipUrls").$type<(string | null)[]>().default([]),
    renderProgress: int("renderProgress").default(0).notNull(),
    renderPhase: mysqlEnum("renderPhase", ["idle", "generating", "assembly", "complete", "failed"]).default("idle").notNull(),
    renderError: text("renderError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("video_projects_user_idx").on(table.userId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type VideoProject = typeof videoProjects.$inferSelect;
export type InsertVideoProject = typeof videoProjects.$inferInsert;
