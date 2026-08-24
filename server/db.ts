import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  researches,
  researchSources,
  researchPlans,
  desktopActivities,
  InsertResearch,
  InsertResearchSource,
  InsertResearchPlan,
  InsertDesktopActivity,
  User,
  Research,
  ResearchSource,
  ResearchPlan,
  DesktopActivity,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to initialize Drizzle:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── In-Memory Fallback Storage ──────────────────────────────────────────────
const memUsers: User[] = [];
const memResearches: Research[] = [];
const memResearchSources: ResearchSource[] = [];
const memResearchPlans: ResearchPlan[] = [];
const memDesktopActivities: DesktopActivity[] = [];

let userAutoId = 1;
let researchAutoId = 1;
let sourceAutoId = 1;
let planAutoId = 1;
let desktopActivityAutoId = 1;

let isDbAvailable = false;
let dbCheckDone = false;

export async function checkDbConnection(): Promise<boolean> {
  if (dbCheckDone) return isDbAvailable;

  const db = await getDb();
  if (!db) {
    console.warn("[Database] No DATABASE_URL provided. Using In-Memory Database.");
    isDbAvailable = false;
    dbCheckDone = true;
    return false;
  }

  try {
    // Run a query to test if the MySQL database is actually accessible
    await db.select().from(users).limit(1);
    isDbAvailable = true;
    console.log("[Database] MySQL Connection successful!");
  } catch (error) {
    console.warn("[Database] MySQL connection failed. Falling back to In-Memory Database:", String(error));
    isDbAvailable = false;
  }
  dbCheckDone = true;
  return isDbAvailable;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");

  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        const values: InsertUser = { openId: user.openId };
        const updateSet: Record<string, unknown> = {};
        const textFields = ["name", "email", "loginMethod"] as const;
        type TextField = (typeof textFields)[number];
        const assignNullable = (field: TextField) => {
          const value = user[field];
          if (value === undefined) return;
          const normalized = value ?? null;
          values[field] = normalized;
          updateSet[field] = normalized;
        };
        textFields.forEach(assignNullable);
        if (user.lastSignedIn !== undefined) {
          values.lastSignedIn = user.lastSignedIn;
          updateSet.lastSignedIn = user.lastSignedIn;
        }
        if (user.role !== undefined) {
          values.role = user.role;
          updateSet.role = user.role;
        } else if (user.openId === ENV.ownerOpenId) {
          values.role = "admin";
          updateSet.role = "admin";
        }
        if (!values.lastSignedIn) values.lastSignedIn = new Date();
        if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
        await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
        return;
      } catch (error) {
        console.error("[Database] Failed to upsert user in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  const now = new Date();
  const existingIdx = memUsers.findIndex((u) => u.openId === user.openId);
  const resolvedRole = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  if (existingIdx >= 0) {
    memUsers[existingIdx] = {
      ...memUsers[existingIdx],
      name: user.name !== undefined ? (user.name ?? null) : memUsers[existingIdx].name,
      email: user.email !== undefined ? (user.email ?? null) : memUsers[existingIdx].email,
      loginMethod: user.loginMethod !== undefined ? (user.loginMethod ?? null) : memUsers[existingIdx].loginMethod,
      role: resolvedRole,
      lastSignedIn: user.lastSignedIn ?? now,
      updatedAt: now,
    };
  } else {
    memUsers.push({
      id: userAutoId++,
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: resolvedRole,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: user.lastSignedIn ?? now,
    });
  }
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
        return result.length > 0 ? result[0] : undefined;
      } catch (error) {
        console.error("[Database] Failed to get user by openId in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  return memUsers.find((u) => u.openId === openId);
}

// ─── Research helpers ───────────────────────────────────────────────────────

export async function createResearch(data: InsertResearch): Promise<number> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        const [result] = await db.insert(researches).values(data);
        return result.insertId as number;
      } catch (error) {
        console.error("[Database] Failed to create research in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  const now = new Date();
  const id = researchAutoId++;
  memResearches.push({
    id,
    userId: data.userId,
    keyword: data.keyword,
    mode: data.mode ?? "keyword",
    attachments: data.attachments ?? null,
    targetProduct: data.targetProduct ?? null,
    targetUrl: data.targetUrl ?? null,
    status: data.status ?? "pending",
    errorMessage: data.errorMessage ?? null,
    createdAt: now,
    updatedAt: now,
    scheduleCronTaskUid: data.scheduleCronTaskUid ?? null,
    refreshInterval: data.refreshInterval ?? "none",
    lastRefreshedAt: data.lastRefreshedAt ?? null,
  });
  return id;
}

export async function updateResearchStatus(
  id: number,
  status: "pending" | "collecting" | "analyzing" | "done" | "error",
  errorMessage?: string
): Promise<void> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        await db
          .update(researches)
          .set({ status, ...(errorMessage ? { errorMessage } : {}) })
          .where(eq(researches.id, id));
        return;
      } catch (error) {
        console.error("[Database] Failed to update research status in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  const idx = memResearches.findIndex((r) => r.id === id);
  if (idx >= 0) {
    memResearches[idx].status = status;
    if (errorMessage !== undefined) {
      memResearches[idx].errorMessage = errorMessage;
    }
    memResearches[idx].updatedAt = new Date();
  }
}

export async function updateResearchCronSettings(
  id: number,
  scheduleCronTaskUid: string | null,
  refreshInterval: string
): Promise<void> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        await db
          .update(researches)
          .set({ scheduleCronTaskUid, refreshInterval })
          .where(eq(researches.id, id));
        return;
      } catch (error) {
        console.error("[Database] Failed to update research cron settings in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  const idx = memResearches.findIndex((r) => r.id === id);
  if (idx >= 0) {
    memResearches[idx].scheduleCronTaskUid = scheduleCronTaskUid;
    memResearches[idx].refreshInterval = refreshInterval;
    memResearches[idx].updatedAt = new Date();
  }
}

export async function updateResearchLastRefreshed(id: number, lastRefreshedAt: Date): Promise<void> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        await db
          .update(researches)
          .set({ lastRefreshedAt })
          .where(eq(researches.id, id));
        return;
      } catch (error) {
        console.error("[Database] Failed to update research lastRefreshedAt in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  const idx = memResearches.findIndex((r) => r.id === id);
  if (idx >= 0) {
    memResearches[idx].lastRefreshedAt = lastRefreshedAt;
    memResearches[idx].updatedAt = new Date();
  }
}

export async function getResearchByCronTaskUid(taskUid: string): Promise<Research | undefined> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        const result = await db
          .select()
          .from(researches)
          .where(eq(researches.scheduleCronTaskUid, taskUid))
          .limit(1);
        return result[0];
      } catch (error) {
        console.error("[Database] Failed to get research by cron task UID in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  return memResearches.find((r) => r.scheduleCronTaskUid === taskUid);
}

export async function getResearchById(id: number): Promise<Research | undefined> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        const result = await db.select().from(researches).where(eq(researches.id, id)).limit(1);
        return result[0];
      } catch (error) {
        console.error("[Database] Failed to get research by id in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  return memResearches.find((r) => r.id === id);
}

export async function getUserResearches(userId: number): Promise<Research[]> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        return db
          .select()
          .from(researches)
          .where(eq(researches.userId, userId))
          .orderBy(desc(researches.createdAt))
          .limit(50);
      } catch (error) {
        console.error("[Database] Failed to get user researches in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  return memResearches
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);
}

export async function insertResearchSources(sources: InsertResearchSource[]): Promise<void> {
  if (sources.length === 0) return;

  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        await db.insert(researchSources).values(sources);
        return;
      } catch (error) {
        console.error("[Database] Failed to insert research sources in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  const now = new Date();
  for (const src of sources) {
    memResearchSources.push({
      id: sourceAutoId++,
      researchId: src.researchId,
      sourceType: src.sourceType,
      title: src.title,
      url: src.url,
      description: src.description ?? null,
      score: src.score ?? 0,
      metadata: src.metadata ?? null,
      createdAt: now,
    });
  }
}

export async function getResearchSources(researchId: number): Promise<ResearchSource[]> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        return db
          .select()
          .from(researchSources)
          .where(eq(researchSources.researchId, researchId))
          .orderBy(desc(researchSources.score));
      } catch (error) {
        console.error("[Database] Failed to get research sources in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  return memResearchSources
    .filter((s) => s.researchId === researchId)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export async function upsertResearchPlan(data: InsertResearchPlan): Promise<void> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        // Only overwrite the columns the caller actually supplied — a keyword-mode
        // re-run must not wipe an existing teardown payload, and vice versa.
        const updateSet: Record<string, unknown> = {};
        if (data.analysisJson !== undefined) updateSet.analysisJson = data.analysisJson;
        if (data.teardownJson !== undefined) updateSet.teardownJson = data.teardownJson;
        if (data.markdownContent !== undefined) updateSet.markdownContent = data.markdownContent;
        if (Object.keys(updateSet).length === 0) updateSet.updatedAt = new Date();

        await db.insert(researchPlans).values(data).onDuplicateKeyUpdate({ set: updateSet });
        return;
      } catch (error) {
        console.error("[Database] Failed to upsert research plan in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  const now = new Date();
  const existingIdx = memResearchPlans.findIndex((p) => p.researchId === data.researchId);
  if (existingIdx >= 0) {
    const prev = memResearchPlans[existingIdx];
    memResearchPlans[existingIdx] = {
      ...prev,
      analysisJson: data.analysisJson !== undefined ? data.analysisJson : prev.analysisJson,
      teardownJson: data.teardownJson !== undefined ? data.teardownJson : prev.teardownJson,
      markdownContent:
        data.markdownContent !== undefined ? data.markdownContent : prev.markdownContent,
      updatedAt: now,
    };
  } else {
    memResearchPlans.push({
      id: planAutoId++,
      researchId: data.researchId,
      analysisJson: data.analysisJson ?? null,
      teardownJson: data.teardownJson ?? null,
      markdownContent: data.markdownContent ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function getResearchPlan(researchId: number): Promise<ResearchPlan | undefined> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        const result = await db
          .select()
          .from(researchPlans)
          .where(eq(researchPlans.researchId, researchId))
          .limit(1);
        return result[0];
      } catch (error) {
        console.error("[Database] Failed to get research plan in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  return memResearchPlans.find((p) => p.researchId === researchId);
}

export async function insertDesktopActivities(activities: InsertDesktopActivity[]): Promise<void> {
  if (activities.length === 0) return;

  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        await db.insert(desktopActivities).values(activities);
        return;
      } catch (error) {
        console.error("[Database] Failed to insert desktop activities in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  const now = new Date();
  for (const act of activities) {
    memDesktopActivities.push({
      id: desktopActivityAutoId++,
      userId: act.userId,
      windowTitle: act.windowTitle,
      processName: act.processName,
      duration: act.duration ?? 0,
      activityType: act.activityType ?? "unknown",
      createdAt: act.createdAt ?? now,
    });
  }
}

export async function getWeeklyActivities(userId: number, daysLimit = 7): Promise<DesktopActivity[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysLimit);

  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        const { gte, and } = await import("drizzle-orm");
        return db
          .select()
          .from(desktopActivities)
          .where(and(eq(desktopActivities.userId, userId), gte(desktopActivities.createdAt, cutoffDate)))
          .orderBy(desc(desktopActivities.createdAt));
      } catch (error) {
        console.error("[Database] Failed to get weekly activities in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  return memDesktopActivities
    .filter((a) => a.userId === userId && a.createdAt >= cutoffDate)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function deleteUserDesktopActivities(userId: number): Promise<void> {
  if (await checkDbConnection()) {
    const db = await getDb();
    if (db) {
      try {
        await db.delete(desktopActivities).where(eq(desktopActivities.userId, userId));
        return;
      } catch (error) {
        console.error("[Database] Failed to delete desktop activities in MySQL:", error);
      }
    }
  }

  // Fallback to memory
  const remaining = memDesktopActivities.filter((a) => a.userId !== userId);
  memDesktopActivities.splice(0, memDesktopActivities.length, ...remaining);
}
