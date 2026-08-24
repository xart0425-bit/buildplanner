import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import { createResearch } from "./db";
import { analyzeWithLLM } from "./analyzer";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  createResearch: vi.fn().mockResolvedValue(42),
  updateResearchStatus: vi.fn().mockResolvedValue(undefined),
  getResearchById: vi.fn().mockResolvedValue({
    id: 42,
    userId: 1,
    keyword: "AI chatbot",
    status: "done",
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getUserResearches: vi.fn().mockResolvedValue([
    {
      id: 42,
      userId: 1,
      keyword: "AI chatbot",
      status: "done",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  insertResearchSources: vi.fn().mockResolvedValue(undefined),
  getResearchSources: vi.fn().mockResolvedValue([
    {
      id: 1,
      researchId: 42,
      sourceType: "github",
      title: "test/repo",
      url: "https://github.com/test/repo",
      description: "Test",
      score: 0.8,
      metadata: { stars: 1000 },
      createdAt: new Date(),
    },
  ]),
  upsertResearchPlan: vi.fn().mockResolvedValue(undefined),
  getResearchPlan: vi.fn().mockResolvedValue({
    id: 1,
    researchId: 42,
    analysisJson: { summary: "Test summary", implementationDifficulty: "중급" },
    markdownContent: "# 앱 개발 계획서: AI chatbot\n\n## 1. 아이디어 개요\n\nTest",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getDb: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

// Mock collector and analyzer to avoid real network calls
vi.mock("./collector", () => ({
  collectAllSources: vi.fn().mockResolvedValue([]),
}));

vi.mock("./analyzer", () => ({
  analyzeWithLLM: vi.fn().mockResolvedValue({
    coreTechnologies: ["React"],
    openSourceReferences: [],
    similarServices: [],
    implementationDifficulty: "중급",
    difficultyReason: "Test",
    licenseNotes: [],
    techStack: { frontend: [], backend: [], ai: [], database: [], deployment: [] },
    coreFeatures: [],
    developmentPhases: [],
    risks: [],
    summary: "Test summary",
  }),
  updatePlanWithLLM: vi.fn().mockResolvedValue({
    coreTechnologies: ["React", "PostgreSQL"],
    openSourceReferences: [],
    similarServices: [],
    implementationDifficulty: "중급",
    difficultyReason: "Test",
    licenseNotes: [],
    techStack: { frontend: [], backend: [], ai: [], database: [], deployment: [] },
    coreFeatures: [],
    developmentPhases: [],
    risks: [],
    summary: "Test summary updated",
  }),
  generateMarkdown: vi.fn().mockReturnValue("# Test Plan"),
  extractSearchKeyword: vi.fn().mockResolvedValue("AI chatbot"),
}));

// ─── Context factory ──────────────────────────────────────────────────────────

function createAuthCtx(userId = 1): TrpcContext {
  const user: User = {
    id: userId,
    openId: "test-open-id",
    name: "Test User",
    email: "test@example.com",
    loginMethod: "agent",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAnonCtx(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("research.start", () => {
  it("returns researchId for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthCtx());
    const result = await caller.research.start({ keyword: "AI chatbot" });
    expect(result).toHaveProperty("researchId");
    expect(typeof result.researchId).toBe("number");
  });

  it("throws UNAUTHORIZED for anonymous user", async () => {
    const caller = appRouter.createCaller(createAnonCtx());
    await expect(caller.research.start({ keyword: "AI chatbot" })).rejects.toThrow();
  });

  it("rejects empty keyword", async () => {
    const caller = appRouter.createCaller(createAuthCtx());
    await expect(caller.research.start({ keyword: "" })).rejects.toThrow();
  });

  it("stores attachments and feeds them to the analysis", async () => {
    const caller = appRouter.createCaller(createAuthCtx());
    const attachments = {
      docs: [{ name: "spec.md", content: "# 요구사항" }],
      images: [
        { name: "ui.png", mimeType: "image/png" as const, dataUrl: "data:image/png;base64,iVBORw0KGgo=" },
      ],
      projects: [
        {
          path: "Z:\\work\\legacy-app",
          name: "legacy-app",
          fileCount: 12,
          languages: ["TypeScript"],
          tree: "src/",
          manifests: [],
          readme: "",
          truncated: false,
        },
      ],
    };

    await caller.research.start({ keyword: "AI chatbot", attachments });

    expect(vi.mocked(createResearch)).toHaveBeenCalledWith(
      expect.objectContaining({ attachments })
    );
    // The pipeline is fire-and-forget; let its awaits settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(analyzeWithLLM)).toHaveBeenCalledWith(
      "AI chatbot",
      expect.anything(),
      expect.anything(),
      attachments
    );
  });

  it("rejects an image with an unsupported mime type", async () => {
    const caller = appRouter.createCaller(createAuthCtx());
    await expect(
      caller.research.start({
        keyword: "AI chatbot",
        attachments: {
          docs: [],
          images: [
            { name: "bad.svg", mimeType: "image/svg+xml" as any, dataUrl: "data:image/svg+xml,<svg/>" },
          ],
        },
      })
    ).rejects.toThrow();
  });
});

describe("research.getStatus", () => {
  it("returns research status for owner", async () => {
    const caller = appRouter.createCaller(createAuthCtx(1));
    const result = await caller.research.getStatus({ researchId: 42 });
    expect(result.id).toBe(42);
    expect(result.keyword).toBe("AI chatbot");
    expect(result.status).toBe("done");
  });

  it("throws for non-owner", async () => {
    const caller = appRouter.createCaller(createAuthCtx(999));
    await expect(caller.research.getStatus({ researchId: 42 })).rejects.toThrow("Research not found");
  });
});

describe("research.getSources", () => {
  it("returns sources for owner", async () => {
    const caller = appRouter.createCaller(createAuthCtx(1));
    const sources = await caller.research.getSources({ researchId: 42 });
    expect(Array.isArray(sources)).toBe(true);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0].sourceType).toBe("github");
  });
});

describe("research.getPlan", () => {
  it("returns plan for owner", async () => {
    const caller = appRouter.createCaller(createAuthCtx(1));
    const plan = await caller.research.getPlan({ researchId: 42 });
    expect(plan).not.toBeNull();
    expect(plan?.markdownContent).toContain("앱 개발 계획서");
  });
});

describe("research.list", () => {
  it("returns list of researches for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthCtx(1));
    const list = await caller.research.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list[0].keyword).toBe("AI chatbot");
  });

  it("throws UNAUTHORIZED for anonymous user", async () => {
    const caller = appRouter.createCaller(createAnonCtx());
    await expect(caller.research.list()).rejects.toThrow();
  });
});

describe("research.getDetail", () => {
  it("returns research, sources, and plan together", async () => {
    const caller = appRouter.createCaller(createAuthCtx(1));
    const detail = await caller.research.getDetail({ researchId: 42 });
    expect(detail.research.id).toBe(42);
    expect(Array.isArray(detail.sources)).toBe(true);
    expect(detail.plan).not.toBeNull();
  });
});

describe("research.modifyPlan", () => {
  it("triggers plan modification and returns success", async () => {
    const caller = appRouter.createCaller(createAuthCtx(1));
    const result = await caller.research.modifyPlan({
      researchId: 42,
      instruction: "Change DB to PostgreSQL",
    });
    expect(result).toEqual({ success: true });
  });

  it("throws for non-owner", async () => {
    const caller = appRouter.createCaller(createAuthCtx(999));
    await expect(
      caller.research.modifyPlan({
        researchId: 42,
        instruction: "Change DB to PostgreSQL",
      })
    ).rejects.toThrow("Research not found");
  });
});
