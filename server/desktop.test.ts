import { describe, expect, it, vi } from "vitest";
import { uploadDesktopActivitiesHandler } from "./scheduled/desktop";
import { generateWeeklyAppProposals } from "./analyzer";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

vi.mock("./db", () => ({
  insertDesktopActivities: vi.fn(),
  getUserResearches: vi.fn().mockResolvedValue([]),
  createResearch: vi.fn().mockResolvedValue(100),
  upsertResearchPlan: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

describe("uploadDesktopActivitiesHandler", () => {
  it("successfully ingests activities for authorized user", async () => {
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
    });

    const req = {
      body: {
        activities: [
          { windowTitle: "Vite App", processName: "chrome.exe", duration: 60, activityType: "browsing" }
        ]
      }
    } as any;

    const jsonMock = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      json: jsonMock,
    } as any;

    await uploadDesktopActivitiesHandler(req, res);

    expect(sdk.authenticateRequest).toHaveBeenCalledWith(req);
    expect(db.insertDesktopActivities).toHaveBeenCalled();
    expect(jsonMock).toHaveBeenCalledWith({ success: true, count: 1 });
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(null as any);

    const req = {} as any;
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnThis();
    const res = {
      status: statusMock,
      json: jsonMock,
    } as any;

    await uploadDesktopActivitiesHandler(req, res);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ error: "Unauthorized" });
  });
});

describe("generateWeeklyAppProposals", () => {
  it("returns diagnosis and seeds proposals when activities are present", async () => {
    const mockLLMResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              diagnosis: "자주 개발 도구를 켜두고 코딩하는 것으로 보입니다.",
              proposals: [
                {
                  title: "코드 파일 백업 툴",
                  keyword: "code backup tool",
                  reason: "코딩 시간 비중이 아주 높습니다.",
                  difficulty: "중급",
                  features: ["실시간 백업", "로컬 이력 복구"]
                }
              ]
            })
          }
        }
      ]
    };
    vi.mocked(invokeLLM).mockResolvedValue(mockLLMResponse as any);

    const activities = [
      { id: 1, userId: 1, windowTitle: "index.ts", processName: "Code.exe", duration: 120, activityType: "coding", createdAt: new Date() }
    ];

    const result = await generateWeeklyAppProposals(1, activities);

    expect(result.diagnosis).toContain("자주 개발 도구를 켜두고");
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0].title).toBe("코드 파일 백업 툴");
    expect(db.createResearch).toHaveBeenCalled();
    expect(db.upsertResearchPlan).toHaveBeenCalled();
  });

  it("returns empty diagnosis if no activities", async () => {
    const result = await generateWeeklyAppProposals(1, []);
    expect(result.proposals.length).toBe(0);
    expect(result.diagnosis).toContain("Not enough activity was collected");
  });

  it("writes the empty diagnosis in the selected language", async () => {
    const result = await generateWeeklyAppProposals(1, [], { language: "ko" });
    expect(result.diagnosis).toContain("작업 활동 로그가 충분하지 않습니다");
  });
});
