import { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import {
  getResearchByCronTaskUid,
  getResearchPlan,
  updateResearchLastRefreshed,
} from "../db";
import { runIncrementalAnalysisPipeline } from "../analyzer";
import { generateTeardownMarkdown, type TeardownResult } from "../teardown";
import { parseAttachments } from "@shared/attachments";
import { normalizeLanguage } from "@shared/languages";

export async function refreshScheduledResearchHandler(req: Request, res: Response) {
  console.log("[Scheduled Refresh] Received trigger request.");
  try {
    // 1. Authenticate the request from platform cron scheduler
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "권한 오류: 스케줄러를 통한 요청만 허용됩니다." });
    }

    console.log(`[Scheduled Refresh] Authenticated successfully. taskUid: ${user.taskUid}`);

    // 2. Fetch the research project associated with the taskUid
    const research = await getResearchByCronTaskUid(user.taskUid);
    if (!research) {
      console.warn(`[Scheduled Refresh] No research found mapping to taskUid: ${user.taskUid}. Skipping.`);
      return res.status(200).json({ ok: true, skipped: "연결된 프로젝트를 찾을 수 없습니다." });
    }

    console.log(`[Scheduled Refresh] Found project: "${research.keyword}" (ID: ${research.id})`);

    // 3. Get existing build plan
    const oldPlan = await getResearchPlan(research.id);

    // 4. Run incremental analysis
    const geminiKey = req.headers["x-gemini-key"] as string | undefined;
    const openaiKey = req.headers["x-openai-key"] as string | undefined;
    const anthropicKey = req.headers["x-anthropic-key"] as string | undefined;
    const customModel = req.headers["x-custom-model"] as string | undefined;
    const language = normalizeLanguage(req.headers["x-analysis-language"]);

    // Teardown projects keep their own report template; without this the refresh would
    // silently replace the principles/fault-line analysis with a keyword-mode plan.
    const teardown = (oldPlan?.teardownJson ?? null) as TeardownResult | null;
    const isTeardown = research.mode === "teardown" && !!teardown;

    await runIncrementalAnalysisPipeline(
      research.id,
      isTeardown ? research.targetProduct ?? research.keyword : research.keyword,
      oldPlan ?? null,
      { geminiKey, openaiKey, anthropicKey, customModel, language },
      isTeardown
        ? (analysis, sources) => generateTeardownMarkdown(teardown!, analysis, sources, language)
        : undefined,
      parseAttachments(research.attachments)
    );

    // 5. Update last refreshed timestamp
    await updateResearchLastRefreshed(research.id, new Date());

    return res.json({ ok: true, refreshedId: research.id });
  } catch (error: any) {
    console.error("[Scheduled Refresh Error]:", error);
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
      context: { timestamp: new Date().toISOString() }
    });
  }
}
