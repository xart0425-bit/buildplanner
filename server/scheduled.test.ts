import { describe, expect, it, vi } from "vitest";
import { refreshScheduledResearchHandler } from "./scheduled/refresh";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { runIncrementalAnalysisPipeline } from "./analyzer";

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

vi.mock("./db", () => ({
  getResearchByCronTaskUid: vi.fn(),
  getResearchPlan: vi.fn(),
  updateResearchLastRefreshed: vi.fn(),
}));

vi.mock("./analyzer", () => ({
  runIncrementalAnalysisPipeline: vi.fn(),
}));

describe("refreshScheduledResearchHandler", () => {
  it("authenticates and runs incremental analysis", async () => {
    // mock authenticateRequest
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({
      id: 1,
      openId: "cron_user",
      name: "Cron User",
      email: null,
      loginMethod: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      isCron: true,
      taskUid: "mock-task-uid",
    } as any);

    // mock getResearchByCronTaskUid
    vi.mocked(db.getResearchByCronTaskUid).mockResolvedValue({
      id: 42,
      userId: 1,
      keyword: "AI chatbot",
      status: "done",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduleCronTaskUid: "mock-task-uid",
      refreshInterval: "daily",
      lastRefreshedAt: null,
    });

    vi.mocked(db.getResearchPlan).mockResolvedValue({
      id: 1,
      researchId: 42,
      analysisJson: { summary: "test" },
      markdownContent: "test plan",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = {
      headers: {},
    } as any;

    const jsonMock = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      json: jsonMock,
    } as any;

    await refreshScheduledResearchHandler(req, res);

    expect(sdk.authenticateRequest).toHaveBeenCalledWith(req);
    expect(db.getResearchByCronTaskUid).toHaveBeenCalledWith("mock-task-uid");
    expect(runIncrementalAnalysisPipeline).toHaveBeenCalled();
    expect(db.updateResearchLastRefreshed).toHaveBeenCalledWith(42, expect.any(Date));
    expect(jsonMock).toHaveBeenCalledWith({ ok: true, refreshedId: 42 });
  });

  it("returns 403 when request is not from cron scheduler", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({
      id: 1,
      openId: "local-user",
      name: "Guest User",
      email: "guest@example.com",
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any);

    const req = {
      headers: {},
    } as any;

    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnThis();
    const res = {
      status: statusMock,
      json: jsonMock,
    } as any;

    await refreshScheduledResearchHandler(req, res);

    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({ error: "권한 오류: 스케줄러를 통한 요청만 허용됩니다." });
  });
});
