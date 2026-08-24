import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

let trackerProcess: ChildProcess | null = null;
let trackerErrorMsg: string | null = null;
let trackerLogs: string[] = [];

type TrackerResult = { success: boolean; error?: string; message?: string };

function resolvePythonPath(): string {
  const appData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData/Local");
  const programsPath = path.join(appData, "Programs/Python");
  
  if (fs.existsSync(programsPath)) {
    try {
      const dirs = fs.readdirSync(programsPath);
      const pythonDirs = dirs.filter(d => d.startsWith("Python")).sort().reverse();
      for (const pyDir of pythonDirs) {
        const fullPath = path.join(programsPath, pyDir, "python.exe");
        if (fs.existsSync(fullPath)) {
          console.log(`[Tracker] Resolved Python executable dynamically: ${fullPath}`);
          return fullPath;
        }
      }
    } catch (e) {
      console.error("[Tracker] Error reading Python programs directory:", e);
    }
  }
  return "python";
}

function getLocalTrackerStatus() {
  const isRunning = trackerProcess !== null && trackerProcess.exitCode === null;
  return {
    isRunning,
    error: isRunning ? null : trackerErrorMsg,
  };
}

function stopLocalTracker(): TrackerResult {
  if (trackerProcess) {
    try {
      trackerProcess.kill();
      trackerProcess = null;
      trackerErrorMsg = null;
      console.log("[Tracker] Killed local tracker process.");
      return { success: true };
    } catch (err: any) {
      console.error("[Tracker] Failed to kill tracker process:", err);
      return { success: false, error: err.message };
    }
  }
  return { success: true, message: "Tracker is not running" };
}

async function startLocalTracker(): Promise<TrackerResult> {
  if (trackerProcess && trackerProcess.exitCode === null) {
    return { success: true, message: "Already running" };
  }

  trackerErrorMsg = null;
  trackerLogs = ["실시간 트래커 연결 수립 중..."];
  const trackerPath = path.resolve(process.cwd(), "tracker.py");
  const pythonBin = resolvePythonPath();
  
  return new Promise<TrackerResult>((resolve) => {
    let resolved = false;

    try {
      console.log(`[Tracker] Spawning Python tracker script at: ${trackerPath} using ${pythonBin}`);
      trackerLogs.push(`[SYSTEM] Python 트래커 구동 중: ${trackerPath}`);
      trackerProcess = spawn(pythonBin, ["-u", trackerPath], {
        cwd: process.cwd(),
        stdio: "pipe",
      });

      trackerProcess.stdout?.on("data", (data) => {
        const text = data.toString().trim();
        console.log(`[Tracker Stdout]: ${text}`);
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          if (line.trim()) {
            trackerLogs.push(line.trim());
          }
        }
        if (trackerLogs.length > 100) {
          trackerLogs = trackerLogs.slice(trackerLogs.length - 100);
        }
      });

      trackerProcess.stderr?.on("data", (data) => {
        const errStr = data.toString().trim();
        console.error(`[Tracker Stderr]: ${errStr}`);
        const lines = errStr.split(/\r?\n/);
        for (const line of lines) {
          if (line.trim()) {
            trackerLogs.push(`[ERROR] ${line.trim()}`);
          }
        }
        if (trackerLogs.length > 100) {
          trackerLogs = trackerLogs.slice(trackerLogs.length - 100);
        }
      });

      trackerProcess.on("error", (err: any) => {
        console.error("[Tracker] Process startup error:", err);
        trackerProcess = null;
        trackerErrorMsg = "Python을 실행할 수 없습니다. Python 3가 설치되어 있고 환경 변수(PATH)에 등록되어 있는지 확인해주세요.";
        trackerLogs.push(`[SYSTEM_ERROR] 트래커 실행 오류: ${err.message}`);
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: trackerErrorMsg });
        }
      });

      trackerProcess.on("exit", (code, signal) => {
        console.log(`[Tracker] Process exited with code ${code}, signal ${signal}`);
        trackerProcess = null;
        trackerLogs.push(`[SYSTEM] 트래커 프로세스가 종료되었습니다 (Code: ${code}, Signal: ${signal}).`);
        if (code !== 0 && code !== null) {
          trackerErrorMsg = `트래커가 오류 코드(${code})로 종료되었습니다. Python 설치 상태 또는 에러 로그를 확인해주세요.`;
        }
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: trackerErrorMsg || "트래커가 시작된 후 곧바로 종료되었습니다." });
        }
      });

      // Wait 800ms to confirm process remains running
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          trackerLogs.push(`[SYSTEM] 트래킹 엔진 활성화 완료 (실시간 수집 진행 중)`);
          resolve({ success: true });
        }
      }, 800);

    } catch (err: any) {
      trackerProcess = null;
      trackerErrorMsg = err.message;
      trackerLogs.push(`[SYSTEM_ERROR] 트래커 실행 도중 예외가 발생했습니다: ${err.message}`);
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: err.message });
      }
    }
  });
}
import {
  createResearch,
  updateResearchStatus,
  getResearchById,
  getUserResearches,
  insertResearchSources,
  getResearchSources,
  upsertResearchPlan,
  getResearchPlan,
  updateResearchCronSettings,
  getWeeklyActivities,
  deleteUserDesktopActivities,
} from "./db";
import { collectAllSources, collectTargetIntel } from "./collector";
import {
  analyzeWithLLM,
  generateMarkdown,
  updatePlanWithLLM,
  extractSearchKeyword,
  generateWeeklyAppProposals,
  type AnalysisResult,
} from "./analyzer";
import {
  buildScaffoldZip,
  describeModel,
  resolveTargetAgent,
  TARGET_AGENTS,
} from "./scaffold";
import { isLocalFsAllowed, pickFolderDialog, scanProject } from "./projectScan";
import {
  identifyTargetDomain,
  runTeardownChain,
  generateTeardownMarkdown,
  type TeardownResult,
} from "./teardown";
import { normalizeTargetUrl } from "./webIntel";
import {
  ideaAttachmentsSchema,
  isEmptyAttachments,
  parseAttachments,
  type IdeaAttachments,
} from "@shared/attachments";
import { createHeartbeatJob, deleteHeartbeatJob } from "./_core/heartbeat";
import { parse as parseCookie } from "cookie";

export const appRouter = router({
  system: systemRouter,

  /**
   * Browsing/scanning the machine the server runs on. Login-gated: on a shared host these
   * would expose that host's filesystem, so they must never become public procedures.
   */
  localProjects: router({
    /**
     * Lets the UI hide what this host cannot do: the whole feature when local access is
     * switched off, and the native browse dialog on non-Windows hosts (Codespaces, Docker),
     * where typing a path is the only route.
     */
    status: protectedProcedure.query(() => ({
      enabled: isLocalFsAllowed(),
      canBrowse: isLocalFsAllowed() && process.platform === "win32",
    })),

    scan: protectedProcedure
      .input(z.object({ path: z.string().min(1).max(1000) }))
      .mutation(async ({ input }) => scanProject(input.path)),

    /** Opens the OS folder-browse dialog on the server machine. Windows only. */
    pickFolder: protectedProcedure
      .input(z.object({ initialPath: z.string().max(1000).optional() }))
      .mutation(async ({ input }) => ({ path: await pickFolderDialog(input.initialPath) })),
  }),
  auth: router({
    me: publicProcedure.query((opts) => {
      console.log("[DEBUG] auth.me query. ctx.user:", opts.ctx.user);
      return opts.ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  research: router({
    // Start a new research session
    start: protectedProcedure
      .input(
        z.object({
          // The home page takes a full free-form description of what to build, not just
          // a search term — the column is varchar(1000) to match.
          keyword: z.string().min(1).max(1000),
          attachments: ideaAttachmentsSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const attachments = isEmptyAttachments(input.attachments) ? null : input.attachments!;

        const researchId = await createResearch({
          userId: ctx.user.id,
          keyword: input.keyword,
          attachments,
          status: "pending",
        });

        const geminiKey = ctx.req.headers["x-gemini-key"] as string | undefined;
        const openaiKey = ctx.req.headers["x-openai-key"] as string | undefined;
        const customModel = ctx.req.headers["x-custom-model"] as string | undefined;

        // Run async (fire-and-forget) — client polls for status
        runResearchPipeline(
          researchId,
          input.keyword,
          { geminiKey, openaiKey, customModel },
          attachments
        ).catch((err) => {
          console.error("[Research] Pipeline error:", err);
          updateResearchStatus(researchId, "error", String(err));
        });

        return { researchId };
      }),

    // Start a teardown: reverse-engineer an existing product into a superior design
    startTeardown: protectedProcedure
      .input(
        z.object({
          product: z.string().min(1).max(200),
          url: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const product = input.product.trim();
        const targetUrl = input.url ? normalizeTargetUrl(input.url) : null;

        if (input.url && input.url.trim() && !targetUrl) {
          throw new Error("올바른 URL 형식이 아닙니다. (예: https://example.com)");
        }

        const researchId = await createResearch({
          userId: ctx.user.id,
          keyword: product,
          mode: "teardown",
          targetProduct: product,
          targetUrl,
          status: "pending",
        });

        const geminiKey = ctx.req.headers["x-gemini-key"] as string | undefined;
        const openaiKey = ctx.req.headers["x-openai-key"] as string | undefined;
        const customModel = ctx.req.headers["x-custom-model"] as string | undefined;

        // Fire-and-forget — client polls for status, same as keyword mode
        runTeardownPipeline(researchId, product, targetUrl, {
          geminiKey,
          openaiKey,
          customModel,
        }).catch((err) => {
          console.error("[Teardown] Pipeline error:", err);
          updateResearchStatus(researchId, "error", String(err));
        });

        return { researchId };
      }),

    // Import a saved project JSON
    import: protectedProcedure
      .input(
        z.object({
          research: z.object({
            keyword: z.string(),
            mode: z.enum(["keyword", "teardown"]).optional(),
            targetProduct: z.string().nullable().optional(),
            targetUrl: z.string().nullable().optional(),
            status: z.enum(["pending", "collecting", "analyzing", "done", "error"]),
            errorMessage: z.string().nullable().optional(),
          }),
          sources: z.array(
            z.object({
              sourceType: z.enum([
                "github",
                "huggingface",
                "papers",
                "hackernews",
                "web",
                "review",
              ]),
              title: z.string(),
              url: z.string(),
              description: z.string().nullable().optional(),
              score: z.number().nullable().optional(),
              metadata: z.any().optional(),
            })
          ),
          plan: z.object({
            analysisJson: z.any().nullable().optional(),
            teardownJson: z.any().nullable().optional(),
            markdownContent: z.string().nullable().optional(),
          }).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const researchId = await createResearch({
          userId: ctx.user.id,
          keyword: input.research.keyword,
          mode: input.research.mode ?? "keyword",
          targetProduct: input.research.targetProduct ?? null,
          targetUrl: input.research.targetUrl ?? null,
          status: input.research.status,
          errorMessage: input.research.errorMessage ?? null,
        });

        if (input.sources.length > 0) {
          await insertResearchSources(
            input.sources.map((s) => ({
              researchId,
              sourceType: s.sourceType,
              title: s.title,
              url: s.url,
              description: s.description ?? null,
              score: s.score ?? 0,
              metadata: s.metadata ?? null,
            }))
          );
        }

        if (input.plan) {
          await upsertResearchPlan({
            researchId,
            analysisJson: input.plan.analysisJson ?? null,
            teardownJson: input.plan.teardownJson ?? null,
            markdownContent: input.plan.markdownContent ?? null,
          });
        }

        return { researchId };
      }),

    // Poll status
    getStatus: protectedProcedure
      .input(z.object({ researchId: z.number() }))
      .query(async ({ ctx, input }) => {
        const research = await getResearchById(input.researchId);
        if (!research || research.userId !== ctx.user.id) {
          throw new Error("Research not found");
        }
        return research;
      }),

    // Get collected sources
    getSources: protectedProcedure
      .input(z.object({ researchId: z.number() }))
      .query(async ({ ctx, input }) => {
        const research = await getResearchById(input.researchId);
        if (!research || research.userId !== ctx.user.id) {
          throw new Error("Research not found");
        }
        const sources = await getResearchSources(input.researchId);
        return sources;
      }),

    // Get analysis + plan
    getPlan: protectedProcedure
      .input(z.object({ researchId: z.number() }))
      .query(async ({ ctx, input }) => {
        const research = await getResearchById(input.researchId);
        if (!research || research.userId !== ctx.user.id) {
          throw new Error("Research not found");
        }
        const plan = await getResearchPlan(input.researchId);
        return plan ?? null;
      }),

    // List user's research history
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserResearches(ctx.user.id);
    }),

    // Get a single research with sources and plan
    getDetail: protectedProcedure
      .input(z.object({ researchId: z.number() }))
      .query(async ({ ctx, input }) => {
        const research = await getResearchById(input.researchId);
        if (!research || research.userId !== ctx.user.id) {
          throw new Error("Research not found");
        }
        const [sources, plan] = await Promise.all([
          getResearchSources(input.researchId),
          getResearchPlan(input.researchId),
        ]);
        return { research, sources, plan: plan ?? null };
      }),

    // Modify existing plan based on feedback
    modifyPlan: protectedProcedure
      .input(
        z.object({
          researchId: z.number(),
          instruction: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const research = await getResearchById(input.researchId);
        if (!research || research.userId !== ctx.user.id) {
          throw new Error("Research not found");
        }
        if (research.status !== "done") {
          throw new Error("Research is not in 'done' state");
        }

        // Set to 'analyzing' to trigger loader and polling
        await updateResearchStatus(input.researchId, "analyzing");

        const geminiKey = ctx.req.headers["x-gemini-key"] as string | undefined;
        const openaiKey = ctx.req.headers["x-openai-key"] as string | undefined;
        const customModel = ctx.req.headers["x-custom-model"] as string | undefined;

        runModifyPipeline(input.researchId, input.instruction, {
          geminiKey,
          openaiKey,
          customModel,
        }).catch((err) => {
          console.error("[Research] modifyPlan background pipeline catch error:", err);
          updateResearchStatus(input.researchId, "done", String(err));
        });

        return { success: true };
      }),

    toggleCronSchedule: protectedProcedure
      .input(
        z.object({
          researchId: z.number(),
          interval: z.enum(["none", "daily", "weekly"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const research = await getResearchById(input.researchId);
        if (!research || research.userId !== ctx.user.id) {
          throw new Error("리서치 프로젝트를 찾을 수 없거나 권한이 없습니다.");
        }

        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";

        // 1. Delete old cron job if exists
        if (research.scheduleCronTaskUid) {
          try {
            await deleteHeartbeatJob(research.scheduleCronTaskUid, sessionToken);
          } catch (err) {
            console.warn("[Cron] 기존 스케줄 삭제 실패 (무시 가능):", err);
          }
        }

        let newTaskUid: string | null = null;

        // 2. Register new cron job if interval is not none
        if (input.interval !== "none") {
          const cronExpression =
            input.interval === "daily"
              ? "0 0 9 * * *" // Daily at 09:00 UTC
              : "0 0 9 * * 1"; // Weekly on Mondays at 09:00 UTC

          const job = await createHeartbeatJob(
            {
              name: `buildplan-refresh-${input.researchId}`,
              cron: cronExpression,
              path: "/api/scheduled/refresh",
              payload: { researchId: input.researchId },
              description: `주기적 R&D 소스 수집 및 빌드 플랜 갱신 (${input.interval})`,
            },
            sessionToken
          );

          newTaskUid = job.taskUid;
        }

        // 3. Save to database
        await updateResearchCronSettings(input.researchId, newTaskUid, input.interval);

        return { success: true, interval: input.interval };
      }),

    getWeeklyDashboardData: protectedProcedure
      .input(z.object({ daysLimit: z.number().default(7) }))
      .query(async ({ ctx, input }) => {
        const activities = await getWeeklyActivities(ctx.user.id, input.daysLimit);
        return {
          activities,
        };
      }),

    clearWeeklyActivities: protectedProcedure
      .mutation(async ({ ctx }) => {
        await deleteUserDesktopActivities(ctx.user.id);
        return { success: true };
      }),

    triggerWeeklyAnalysis: protectedProcedure
      .mutation(async ({ ctx }) => {
        const activities = await getWeeklyActivities(ctx.user.id, 7);
        const geminiKey = ctx.req.headers["x-gemini-key"] as string | undefined;
        const openaiKey = ctx.req.headers["x-openai-key"] as string | undefined;
        const customModel = ctx.req.headers["x-custom-model"] as string | undefined;

        const result = await generateWeeklyAppProposals(ctx.user.id, activities, {
          geminiKey,
          openaiKey,
          customModel,
        });

        return result;
      }),

    startTracker: protectedProcedure
      .mutation(async () => {
        return startLocalTracker();
      }),

    stopTracker: protectedProcedure
      .mutation(async () => {
        return stopLocalTracker();
      }),

    getTrackerStatus: protectedProcedure
      .query(async () => {
        return getLocalTrackerStatus();
      }),

    getTrackerLogs: protectedProcedure
      .query(async () => {
        return trackerLogs;
      }),

    reRun: protectedProcedure
      .input(z.object({ researchId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const research = await getResearchById(input.researchId);
        if (!research || research.userId !== ctx.user.id) {
          throw new Error("Research project not found");
        }

        // Reset status to 'pending' to trigger the pipeline
        await updateResearchStatus(input.researchId, "pending", "");

        const geminiKey = ctx.req.headers["x-gemini-key"] as string | undefined;
        const openaiKey = ctx.req.headers["x-openai-key"] as string | undefined;
        const customModel = ctx.req.headers["x-custom-model"] as string | undefined;
        const apiKeys = { geminiKey, openaiKey, customModel };

        // Run background pipeline (fire-and-forget), matching the project's own mode
        const pipeline =
          research.mode === "teardown"
            ? runTeardownPipeline(
                input.researchId,
                research.targetProduct ?? research.keyword,
                research.targetUrl ?? null,
                apiKeys
              )
            : runResearchPipeline(
                input.researchId,
                research.keyword,
                apiKeys,
                parseAttachments(research.attachments)
              );

        pipeline.catch((err) => {
          console.error("[Research] Pipeline re-run error:", err);
          updateResearchStatus(input.researchId, "error", String(err));
        });

        return { success: true };
      }),

    /**
     * Packages the finished plan as an agent-ready project folder (.zip): spec pack,
     * loop files, context docs and the memory file for whichever agent will run it.
     */
    buildDevKit: protectedProcedure
      .input(
        z.object({
          researchId: z.number(),
          agent: z.enum(TARGET_AGENTS).default("auto"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const research = await getResearchById(input.researchId);
        if (!research || research.userId !== ctx.user.id) {
          throw new Error("Research project not found");
        }

        const plan = await getResearchPlan(input.researchId);
        if (!plan?.analysisJson) {
          throw new Error("분석이 완료된 프로젝트만 개발 킷을 생성할 수 있습니다.");
        }

        const apiKeys = {
          geminiKey: ctx.req.headers["x-gemini-key"] as string | undefined,
          openaiKey: ctx.req.headers["x-openai-key"] as string | undefined,
          customModel: ctx.req.headers["x-custom-model"] as string | undefined,
        };

        const sources = await getResearchSources(input.researchId);
        const teardown = (plan.teardownJson ?? null) as TeardownResult | null;
        const keyword =
          research.mode === "teardown" && teardown
            ? teardown.leapfrog.conceptName || research.keyword
            : research.keyword;

        return buildScaffoldZip(
          {
            keyword,
            mode: research.mode,
            analysis: plan.analysisJson as AnalysisResult,
            teardown,
            sources: sources.map((s) => ({
              sourceType: s.sourceType,
              title: s.title,
              url: s.url,
              description: s.description ?? "",
              score: s.score ?? 0,
              metadata: (s.metadata as Record<string, unknown>) ?? {},
            })),
            planMarkdown: plan.markdownContent ?? null,
            attachments: parseAttachments(research.attachments),
            agent: resolveTargetAgent(input.agent, apiKeys),
            modelLabel: describeModel(apiKeys),
          },
          apiKeys
        );
      }),
  }),
});

export type AppRouter = typeof appRouter;

// ─── Background pipeline ──────────────────────────────────────────────────────

async function runResearchPipeline(
  researchId: number,
  keyword: string,
  apiKeys: { geminiKey?: string; openaiKey?: string; customModel?: string },
  attachments: IdeaAttachments | null = null
) {
  try {
    // 1. Collecting
    await updateResearchStatus(researchId, "collecting");
    
    // Extract a refined English search keyword for multi-source scraping
    const searchKeyword = await extractSearchKeyword(keyword, apiKeys);
    console.log(`[Research] Extracted search keyword for "${keyword}": "${searchKeyword}"`);

    const rawSources = await collectAllSources(searchKeyword);

    // Sort by score descending
    const sorted = rawSources.sort((a, b) => b.score - a.score);

    // Save sources to DB
    if (sorted.length > 0) {
      await insertResearchSources(
        sorted.map((s) => ({
          researchId,
          sourceType: s.sourceType,
          title: s.title,
          url: s.url,
          description: s.description,
          score: s.score,
          metadata: s.metadata,
        }))
      );
    }

    // 2. Analyzing
    await updateResearchStatus(researchId, "analyzing");
    const analysis = await analyzeWithLLM(keyword, sorted, apiKeys, attachments);
    const markdown = generateMarkdown(keyword, analysis, sorted, attachments);

    // Save plan
    await upsertResearchPlan({
      researchId,
      analysisJson: analysis,
      markdownContent: markdown,
    });

    // 3. Done
    await updateResearchStatus(researchId, "done");
  } catch (err) {
    await updateResearchStatus(researchId, "error", String(err));
    throw err;
  }
}

/**
 * Teardown pipeline: principles → fault lines → leapfrog design → divergence audit,
 * then the ordinary implementation plan generated *for the new concept* rather than for
 * the product that was analysed.
 */
async function runTeardownPipeline(
  researchId: number,
  productName: string,
  targetUrl: string | null,
  apiKeys: { geminiKey?: string; openaiKey?: string; customModel?: string }
) {
  try {
    // 1. Collecting
    await updateResearchStatus(researchId, "collecting");

    // Searching the product name alone finds press; the tech domain finds the parts.
    const domain = await identifyTargetDomain(productName, targetUrl, apiKeys);
    console.log(
      `[Teardown] "${productName}" → 기술 도메인 "${domain.techKeyword}" (${domain.category})`
    );

    const rawSources = await collectTargetIntel(productName, targetUrl, domain.techKeyword);
    const sorted = rawSources.sort((a, b) => b.score - a.score);

    if (sorted.length > 0) {
      await insertResearchSources(
        sorted.map((s) => ({
          researchId,
          sourceType: s.sourceType,
          title: s.title,
          url: s.url,
          description: s.description,
          score: s.score,
          metadata: s.metadata,
        }))
      );
    }

    // 2. Analyzing — the four-stage chain
    await updateResearchStatus(researchId, "analyzing");
    const teardown = await runTeardownChain(productName, targetUrl, domain, sorted, apiKeys);

    // 3. Implementation plan for the *new* concept
    const planKeyword = `${teardown.leapfrog.conceptName}${
      teardown.leapfrog.positioning ? ` — ${teardown.leapfrog.positioning}` : ""
    }`;
    const analysis = await analyzeWithLLM(planKeyword, sorted, apiKeys);
    const markdown = generateTeardownMarkdown(teardown, analysis, sorted);

    await upsertResearchPlan({
      researchId,
      analysisJson: analysis,
      teardownJson: teardown,
      markdownContent: markdown,
    });

    await updateResearchStatus(researchId, "done");
  } catch (err) {
    await updateResearchStatus(researchId, "error", String(err));
    throw err;
  }
}

async function runModifyPipeline(
  researchId: number,
  instruction: string,
  apiKeys: { geminiKey?: string; openaiKey?: string; customModel?: string }
) {
  try {
    const research = await getResearchById(researchId);
    if (!research) throw new Error("Research not found");
    const keyword = research.keyword;

    const [sources, plan] = await Promise.all([
      getResearchSources(researchId),
      getResearchPlan(researchId),
    ]);

    if (!plan || !plan.analysisJson) {
      throw new Error("No existing plan/analysis found to modify");
    }

    const mappedSources = sources.map((s) => ({
      sourceType: s.sourceType,
      title: s.title,
      url: s.url,
      description: s.description ?? "",
      score: s.score ?? 0,
      metadata: (s.metadata as Record<string, unknown>) ?? {},
    }));

    // Call LLM editor helper
    const updatedAnalysis = await updatePlanWithLLM(
      keyword,
      mappedSources,
      plan.analysisJson as any,
      instruction,
      apiKeys
    );

    // An edit request never re-derives the design guidelines from the reference images,
    // so keep the previous ones rather than dropping them from the regenerated report.
    const previousGuidelines = (plan.analysisJson as any)?.designGuidelines;
    if (!updatedAnalysis.designGuidelines?.length && Array.isArray(previousGuidelines)) {
      updatedAnalysis.designGuidelines = previousGuidelines;
    }

    // A teardown report must keep its principles/fault-lines/leapfrog sections — rendering
    // it with the keyword-mode template would silently discard the whole analysis.
    const teardown = plan.teardownJson as TeardownResult | null;
    const markdown =
      research.mode === "teardown" && teardown
        ? generateTeardownMarkdown(teardown, updatedAnalysis, mappedSources)
        : generateMarkdown(keyword, updatedAnalysis, mappedSources, parseAttachments(research.attachments));

    await upsertResearchPlan({
      researchId,
      analysisJson: updatedAnalysis,
      markdownContent: markdown,
    });

    // Restore status to 'done'
    await updateResearchStatus(researchId, "done");
  } catch (err) {
    console.error("[Research] Modify Pipeline error:", err);
    // Fallback: restore status to 'done' and log error, ensuring user isn't stuck
    await updateResearchStatus(researchId, "done", String(err));
  }
}
