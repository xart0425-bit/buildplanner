import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  float,
} from "drizzle-orm/mysql-core";

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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Research sessions
export const researches = mysqlTable("researches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Holds the full idea text, not just a search term — the home page accepts a long
  // free-form description, so 255 chars is not enough.
  keyword: varchar("keyword", { length: 1000 }).notNull(),
  // "keyword" = idea-first research, "teardown" = reverse-engineer an existing product
  mode: mysqlEnum("mode", ["keyword", "teardown"]).default("keyword").notNull(),
  // { docs: [{name, content}], images: [{name, mimeType, dataUrl}] } — see shared/attachments.ts
  attachments: json("attachments"),
  targetProduct: varchar("target_product", { length: 255 }),
  targetUrl: text("target_url"),
  status: mysqlEnum("status", ["pending", "collecting", "analyzing", "done", "error"])
    .default("pending")
    .notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }).unique(),
  refreshInterval: varchar("refresh_interval", { length: 20 }).default("none").notNull(),
  lastRefreshedAt: timestamp("last_refreshed_at"),
});

export type Research = typeof researches.$inferSelect;
export type InsertResearch = typeof researches.$inferInsert;

// Individual sources collected from APIs
export const researchSources = mysqlTable("research_sources", {
  id: int("id").autoincrement().primaryKey(),
  researchId: int("researchId").notNull(),
  sourceType: mysqlEnum("sourceType", [
    "github",
    "huggingface",
    "papers",
    "hackernews",
    // teardown-only: public pages of the target product, and community reactions to it
    "web",
    "review",
  ]).notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  score: float("score").default(0),
  metadata: json("metadata"), // stars, downloads, date, etc.
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ResearchSource = typeof researchSources.$inferSelect;
export type InsertResearchSource = typeof researchSources.$inferInsert;

// LLM analysis + generated plan
export const researchPlans = mysqlTable("research_plans", {
  id: int("id").autoincrement().primaryKey(),
  researchId: int("researchId").notNull().unique(),
  analysisJson: json("analysisJson"), // structured LLM analysis
  teardownJson: json("teardownJson"), // principles / fault lines / leapfrog design (teardown mode only)
  markdownContent: text("markdownContent"), // full .md plan
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ResearchPlan = typeof researchPlans.$inferSelect;
export type InsertResearchPlan = typeof researchPlans.$inferInsert;

export const desktopActivities = mysqlTable("desktop_activities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  windowTitle: text("windowTitle").notNull(),
  processName: varchar("processName", { length: 255 }).notNull(),
  duration: int("duration").default(0).notNull(),
  activityType: varchar("activityType", { length: 50 }).default("unknown").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DesktopActivity = typeof desktopActivities.$inferSelect;
export type InsertDesktopActivity = typeof desktopActivities.$inferInsert;
