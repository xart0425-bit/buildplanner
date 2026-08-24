/**
 * Turns a finished build plan into an agent-ready project folder ("개발 킷").
 *
 * The layout follows the 2026 loop-engineering shape rather than a plain document dump:
 * a Spec pack is the source of truth, `loop/` holds the goal + done conditions + the
 * repeatable Ralph prompt, `context/` holds what the agent must know to decide, and the
 * memory file (CLAUDE.md / AGENTS.md / GEMINI.md …) is written for whichever agent the
 * user actually runs. Everything is zipped so it can be extracted into an empty folder
 * and driven immediately.
 */
import { invokeLLM, type ResponseFormat } from "./_core/llm";
import { parseLlmJson } from "./teardown";
import type { AnalysisResult } from "./analyzer";
import type { SourceItem } from "./collector";
import type { TeardownResult } from "./teardown";
import { createZip, type ZipEntry } from "./zip";
import { isEmptyAttachments, type IdeaAttachments } from "@shared/attachments";

export const TARGET_AGENTS = ["auto", "claude", "codex", "gemini", "cursor", "generic"] as const;
export type TargetAgentInput = (typeof TARGET_AGENTS)[number];
export type TargetAgent = Exclude<TargetAgentInput, "auto">;

type ApiKeys = { geminiKey?: string; openaiKey?: string; customModel?: string };

export interface SpecItem {
  id: string;
  title: string;
  priority: "P0" | "P1" | "P2";
  goal: string;
  requirements: string[];
  acceptanceCriteria: string[];
  verification: string;
  dependsOn: string[];
  outOfScope: string[];
}

export interface SpecPack {
  projectName: string;
  projectSlug: string;
  oneLiner: string;
  goal: string;
  doneCriteria: string[];
  stack: {
    runtime: string;
    packageManager: string;
    devCommand: string;
    testCommand: string;
    lintCommand: string;
    buildCommand: string;
  };
  directories: Array<{ path: string; purpose: string }>;
  specs: SpecItem[];
  loopRules: string[];
  firstTask: string;
}

export interface ScaffoldInput {
  keyword: string;
  mode: "keyword" | "teardown";
  analysis: AnalysisResult;
  teardown?: TeardownResult | null;
  sources: SourceItem[];
  planMarkdown: string | null;
  attachments?: IdeaAttachments | null;
  agent: TargetAgent;
  modelLabel: string;
}

// ─── Agent profiles ───────────────────────────────────────────────────────────

interface AgentProfile {
  id: TargetAgent;
  label: string;
  /** The file the agent reads automatically at the start of every session. */
  memoryFile: string;
  cli: string;
  /** Shell snippet that runs one loop iteration with `loop/RALPH.md` as the prompt. */
  runIteration: { bash: string; powershell: string };
  /** Files that only make sense for this agent (slash commands, rule files, …). */
  extras: (pack: SpecPack) => ZipEntry[];
}

const RALPH_COMMAND_BODY = (pack: SpecPack) => `아래 순서를 정확히 지켜 한 번의 반복(iteration)을 수행하라.

1. \`loop/GOAL.md\`와 \`loop/PROGRESS.md\`를 읽고 현재 상태를 파악한다.
2. \`specs/INDEX.md\`에서 상태가 TODO 또는 DOING인 스펙 중 **우선순위가 가장 높은 것 하나**를 고른다.
3. 해당 스펙 파일과 \`context/\` 문서를 읽는다.
4. 그 스펙 하나만 구현한다. 범위를 넘는 작업은 하지 않는다.
5. \`${pack.stack.testCommand}\` 와 \`${pack.stack.lintCommand}\` 를 실행해 통과시킨다.
6. 스펙의 Acceptance Criteria를 하나씩 대조해 **실제로 충족했는지 스스로 검증**한다.
7. \`loop/PROGRESS.md\`에 수행 내용·검증 결과·다음 작업을 append하고, \`specs/INDEX.md\`의 상태를 갱신한다.
8. 커밋한다. 커밋 메시지는 \`<SPEC-ID>: <한 줄 요약>\`.
9. 모든 스펙이 DONE이고 \`loop/GOAL.md\`의 DONE 조건을 전부 만족하면 \`loop/PROGRESS.md\` 마지막 줄에 \`ALL-SPECS-DONE\`을 기록한다.

규칙:
${pack.loopRules.map((r) => `- ${r}`).join("\n")}`;

const AGENT_PROFILES: Record<TargetAgent, AgentProfile> = {
  claude: {
    id: "claude",
    label: "Claude Code",
    memoryFile: "CLAUDE.md",
    cli: "claude",
    runIteration: {
      bash: 'claude -p "$(cat loop/RALPH.md)" --permission-mode acceptEdits',
      powershell: 'claude -p (Get-Content -Raw -Encoding UTF8 loop/RALPH.md) --permission-mode acceptEdits',
    },
    extras: (pack) => [
      {
        path: ".claude/commands/loop.md",
        content: `---\ndescription: 스펙 하나를 골라 구현·검증·기록하는 루프 1회 실행\n---\n\n${RALPH_COMMAND_BODY(pack)}\n`,
      },
      {
        path: ".claude/commands/status.md",
        content:
          "---\ndescription: 현재 진행 상태 요약\n---\n\n`loop/PROGRESS.md`와 `specs/INDEX.md`를 읽고, 완료/진행/대기 스펙 수와 다음에 해야 할 작업 하나를 표로 요약하라. 코드는 수정하지 마라.\n",
      },
      {
        path: ".claude/agents/evaluator.md",
        content: `---\nname: evaluator\ndescription: 구현 결과를 스펙의 Acceptance Criteria와 대조해 독립적으로 판정한다. 구현 직후 사용한다.\ntools: Read, Grep, Glob, Bash\n---\n\n너는 Evaluator다. 코드를 **작성하지 않는다.** 오직 판정만 한다.\n\n1. 대상 스펙 파일의 Acceptance Criteria를 하나씩 읽는다.\n2. 각 항목마다 실제 코드/테스트 실행 결과로 충족 여부를 확인한다. 추측 금지.\n3. \`${pack.stack.testCommand}\`를 직접 실행해 결과를 확인한다.\n4. 다음 형식으로만 답한다.\n\n\`\`\`\nVERDICT: PASS | FAIL\n- [x] 기준1 — 근거(파일:라인 또는 테스트명)\n- [ ] 기준2 — 실패 이유와 재현 방법\nNEXT: FAIL일 때 Generator가 고쳐야 할 것 한 가지\n\`\`\`\n\n의심스러우면 FAIL이다.\n`,
      },
    ],
  },
  codex: {
    id: "codex",
    label: "OpenAI Codex",
    memoryFile: "AGENTS.md",
    cli: "codex",
    runIteration: {
      bash: 'codex exec "$(cat loop/RALPH.md)"',
      powershell: 'codex exec (Get-Content -Raw -Encoding UTF8 loop/RALPH.md)',
    },
    extras: (pack) => [
      { path: "prompts/loop.md", content: `${RALPH_COMMAND_BODY(pack)}\n` },
      {
        path: "prompts/evaluate.md",
        content: `너는 Evaluator다. 코드를 수정하지 말고, 방금 구현된 스펙의 Acceptance Criteria를 하나씩 실제 실행 결과로 검증하라.\n\`${pack.stack.testCommand}\`를 실행하고 VERDICT: PASS 또는 FAIL과 근거를 남겨라. 의심스러우면 FAIL이다.\n`,
      },
    ],
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    memoryFile: "GEMINI.md",
    cli: "gemini",
    runIteration: {
      bash: 'gemini -p "$(cat loop/RALPH.md)" --yolo',
      powershell: 'gemini -p (Get-Content -Raw -Encoding UTF8 loop/RALPH.md) --yolo',
    },
    extras: (pack) => [
      {
        path: ".gemini/commands/loop.toml",
        content: `description = "스펙 하나를 골라 구현·검증·기록하는 루프 1회 실행"\n\nprompt = """\n${RALPH_COMMAND_BODY(pack).replace(/"""/g, '\\"\\"\\"')}\n"""\n`,
      },
    ],
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    memoryFile: "AGENTS.md",
    cli: "cursor-agent",
    runIteration: {
      bash: 'cursor-agent -p "$(cat loop/RALPH.md)"',
      powershell: 'cursor-agent -p (Get-Content -Raw -Encoding UTF8 loop/RALPH.md)',
    },
    extras: (pack) => [
      {
        path: ".cursor/rules/00-project.mdc",
        content: `---\ndescription: 프로젝트 기본 규칙\nalwaysApply: true\n---\n\n- 이 저장소는 Spec 주도로 개발한다. 진실의 원천은 \`specs/\` 이다.\n- 작업 전 \`loop/GOAL.md\`, \`loop/PROGRESS.md\`, 해당 스펙 파일을 읽는다.\n- 한 번에 스펙 하나만 구현하고, 완료 후 \`${pack.stack.testCommand}\`로 검증한다.\n- 결과는 \`loop/PROGRESS.md\`에 기록한다.\n`,
      },
      { path: ".cursor/rules/10-loop.mdc", content: `---\ndescription: 루프 실행 절차\n---\n\n${RALPH_COMMAND_BODY(pack)}\n` },
    ],
  },
  generic: {
    id: "generic",
    label: "범용 에이전트",
    memoryFile: "AGENTS.md",
    cli: "<your-agent-cli>",
    runIteration: {
      bash: '<your-agent-cli> -p "$(cat loop/RALPH.md)"',
      powershell: '<your-agent-cli> -p (Get-Content -Raw -Encoding UTF8 loop/RALPH.md)',
    },
    extras: (pack) => [{ path: "prompts/loop.md", content: `${RALPH_COMMAND_BODY(pack)}\n` }],
  },
};

/**
 * Picks the agent whose conventions match the model actually configured, so the kit
 * lands with the right memory file instead of a generic one.
 */
export function resolveTargetAgent(requested: TargetAgentInput, apiKeys: ApiKeys): TargetAgent {
  if (requested !== "auto") return requested;

  const model = (apiKeys.customModel || process.env.LLM_MODEL || "").toLowerCase();
  if (model.includes("claude")) return "claude";
  if (model.includes("gemini")) return "gemini";
  if (model.includes("gpt") || model.includes("o1") || model.includes("o3")) return "codex";

  if (apiKeys.geminiKey || (!apiKeys.openaiKey && process.env.GEMINI_API_KEY)) return "gemini";
  if (apiKeys.openaiKey || process.env.OPENAI_API_KEY) return "codex";
  return "claude";
}

export function describeModel(apiKeys: ApiKeys): string {
  if (apiKeys.customModel) return apiKeys.customModel;
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  if (apiKeys.geminiKey || (!apiKeys.openaiKey && process.env.GEMINI_API_KEY)) return "gemini-2.5-flash";
  if (apiKeys.openaiKey || process.env.OPENAI_API_KEY) return "gpt-4o-mini";
  return "기본 모델";
}

// ─── Spec pack generation ─────────────────────────────────────────────────────

/** ASCII, filesystem-safe folder name. Korean keywords fall back to a stable default. */
export function toSlug(input: string, fallback = "buildplanner-app"): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length >= 3 ? slug : fallback;
}

const SPEC_ID = (i: number) => `SPEC-${String(i + 1).padStart(3, "0")}`;

export function fallbackSpecPack(input: ScaffoldInput): SpecPack {
  const { analysis, keyword } = input;
  const features = analysis.coreFeatures.length > 0 ? analysis.coreFeatures : [`${keyword} 핵심 기능`];

  const specs: SpecItem[] = features.slice(0, 10).map((feature, i) => ({
    id: SPEC_ID(i),
    title: feature.length > 60 ? `${feature.slice(0, 60)}…` : feature,
    priority: i === 0 ? "P0" : i < 3 ? "P1" : "P2",
    goal: feature,
    requirements: [feature, "기존 기능에 회귀(regression)를 일으키지 않는다."],
    acceptanceCriteria: [
      `${feature} 이(가) 실제로 동작한다.`,
      "해당 기능을 검증하는 자동 테스트가 존재하고 통과한다.",
      "전체 테스트 스위트가 통과한다.",
    ],
    verification: "pnpm test",
    dependsOn: i === 0 ? [] : [SPEC_ID(0)],
    outOfScope: [],
  }));

  return {
    projectName: keyword,
    projectSlug: toSlug(keyword),
    oneLiner: analysis.summary,
    goal: analysis.summary,
    doneCriteria: [
      ...features.slice(0, 5).map((f) => `${f} 이(가) 동작한다.`),
      "모든 자동 테스트가 통과한다.",
      "기존 기능에 회귀가 없다.",
    ],
    stack: {
      runtime: analysis.techStack.backend[0] ?? "Node.js",
      packageManager: "pnpm",
      devCommand: "pnpm dev",
      testCommand: "pnpm test",
      lintCommand: "pnpm lint",
      buildCommand: "pnpm build",
    },
    directories: [
      { path: "src/", purpose: "애플리케이션 소스" },
      { path: "tests/", purpose: "자동 테스트" },
    ],
    specs,
    loopRules: [
      "한 번의 반복에서는 스펙 하나만 처리한다.",
      "테스트가 실패한 상태로 반복을 끝내지 않는다.",
      "스펙에 없는 기능을 임의로 추가하지 않는다.",
      "진행 상황은 반드시 loop/PROGRESS.md에 기록한다. 대화 기억에 의존하지 않는다.",
    ],
    firstTask: `${SPEC_ID(0)} 구현`,
  };
}

/** Normalises whatever the model returned so every downstream template is safe. */
function normalizeSpecPack(raw: Partial<SpecPack> | null, input: ScaffoldInput): SpecPack {
  const fallback = fallbackSpecPack(input);
  if (!raw) return fallback;

  const specs = Array.isArray(raw.specs) && raw.specs.length > 0 ? raw.specs : fallback.specs;

  return {
    projectName: raw.projectName?.trim() || fallback.projectName,
    projectSlug: toSlug(raw.projectSlug || raw.projectName || fallback.projectSlug, fallback.projectSlug),
    oneLiner: raw.oneLiner?.trim() || fallback.oneLiner,
    goal: raw.goal?.trim() || fallback.goal,
    doneCriteria: raw.doneCriteria?.length ? raw.doneCriteria : fallback.doneCriteria,
    stack: {
      runtime: raw.stack?.runtime || fallback.stack.runtime,
      packageManager: raw.stack?.packageManager || fallback.stack.packageManager,
      devCommand: raw.stack?.devCommand || fallback.stack.devCommand,
      testCommand: raw.stack?.testCommand || fallback.stack.testCommand,
      lintCommand: raw.stack?.lintCommand || fallback.stack.lintCommand,
      buildCommand: raw.stack?.buildCommand || fallback.stack.buildCommand,
    },
    directories: raw.directories?.length ? raw.directories : fallback.directories,
    specs: specs.slice(0, 12).map((spec, i) => ({
      id: /^SPEC-\d{3}$/.test(spec?.id ?? "") ? spec.id : SPEC_ID(i),
      title: spec?.title?.trim() || fallback.specs[Math.min(i, fallback.specs.length - 1)].title,
      priority: spec?.priority === "P0" || spec?.priority === "P2" ? spec.priority : "P1",
      goal: spec?.goal?.trim() || spec?.title?.trim() || "",
      requirements: Array.isArray(spec?.requirements) ? spec.requirements : [],
      acceptanceCriteria: Array.isArray(spec?.acceptanceCriteria) && spec.acceptanceCriteria.length > 0
        ? spec.acceptanceCriteria
        : ["기능이 동작한다.", "자동 테스트가 통과한다."],
      verification: spec?.verification?.trim() || raw.stack?.testCommand || fallback.stack.testCommand,
      dependsOn: Array.isArray(spec?.dependsOn) ? spec.dependsOn : [],
      outOfScope: Array.isArray(spec?.outOfScope) ? spec.outOfScope : [],
    })),
    loopRules: raw.loopRules?.length ? raw.loopRules : fallback.loopRules,
    firstTask: raw.firstTask?.trim() || fallback.firstTask,
  };
}

export async function generateSpecPack(input: ScaffoldInput, apiKeys?: ApiKeys): Promise<SpecPack> {
  const { analysis, keyword, teardown, attachments } = input;

  const docsHint =
    attachments && attachments.docs.length > 0
      ? `\n사용자가 첨부한 요구사항 문서(우선 반영):\n${attachments.docs
          .map((d) => `--- ${d.name} ---\n${d.content.slice(0, 8_000)}`)
          .join("\n")}\n`
      : "";

  const projectsHint =
    attachments?.projects?.length
      ? `\n이 작업은 **기존 로컬 프로젝트를 확장**하는 것이다. 새 프로젝트를 처음부터 만드는 스펙을 쓰지 마라.\n${attachments.projects
          .map(
            (p) =>
              `- ${p.name} (\`${p.path}\`, 파일 ${p.fileCount}개${p.languages.length ? `, ${p.languages.join("/")}` : ""})\n${
                p.tree ? `  구조:\n${p.tree.split("\n").slice(0, 40).map((l) => `    ${l}`).join("\n")}` : ""
              }`
          )
          .join("\n")}\nSPEC-001은 부트스트랩이 아니라 이 코드베이스에서 **현재 상태 확인과 테스트 러너 동작 검증**이어야 한다.\n`
      : "";

  const teardownHint = teardown
    ? `\n이 프로젝트는 "${teardown.target.product}" 역설계 결과인 새 제품 "${teardown.leapfrog.conceptName}"이다.\n핵심 논지: ${teardown.leapfrog.thesis}\n차별 기능: ${teardown.leapfrog.features.map((f) => f.name).join(", ")}\n`
    : "";

  const prompt = `당신은 Spec-Driven Development와 자율 에이전트 루프(Loop Engineering)에 능숙한 테크리드입니다.
아래 분석 결과를 코딩 에이전트가 **사람 개입 없이 반복 실행**할 수 있는 스펙 팩으로 변환하세요.

프로젝트: "${keyword}"
요약: ${analysis.summary}
난이도: ${analysis.implementationDifficulty} (${analysis.difficultyReason})
핵심 기능: ${analysis.coreFeatures.join(", ")}
기술 스택: frontend=${analysis.techStack.frontend.join("/")}, backend=${analysis.techStack.backend.join("/")}, ai=${analysis.techStack.ai.join("/")}, db=${analysis.techStack.database.join("/")}, deploy=${analysis.techStack.deployment.join("/")}
개발 단계: ${analysis.developmentPhases.map((p) => `${p.phase}(${p.duration})`).join(" → ")}
리스크: ${analysis.risks.map((r) => r.risk).join(", ")}${teardownHint}${projectsHint}${docsHint}

작성 규칙:
1. 스펙은 5~8개. 각 스펙은 **한 번의 에이전트 반복으로 끝낼 수 있는 크기**여야 한다.
2. 첫 스펙(SPEC-001)은 반드시 "프로젝트 부트스트랩 + 테스트 러너 동작"처럼 이후 모든 검증의 토대가 되는 것이어야 한다.
3. acceptanceCriteria는 **기계적으로 확인 가능한 문장**으로 쓴다. ("사용성이 좋다" 금지, "POST /api/x가 201과 id를 반환한다" 같은 형태)
4. verification에는 실제로 실행할 명령을 적는다.
5. 명령(devCommand 등)은 선택한 스택에서 실제로 통용되는 것으로 적는다.
6. 모든 서술은 한국어. id/slug/경로/명령은 영문.

다음 JSON만 반환하세요:
{
  "projectName": "프로젝트 이름",
  "projectSlug": "kebab-case-영문-폴더명",
  "oneLiner": "한 줄 설명",
  "goal": "에이전트가 달성해야 할 최종 목표 (WHAT)",
  "doneCriteria": ["전체 프로젝트의 완료(DONE) 조건 5~8개"],
  "stack": {"runtime": "", "packageManager": "", "devCommand": "", "testCommand": "", "lintCommand": "", "buildCommand": ""},
  "directories": [{"path": "src/", "purpose": "역할"}],
  "specs": [
    {"id": "SPEC-001", "title": "", "priority": "P0", "goal": "", "requirements": [""], "acceptanceCriteria": [""], "verification": "", "dependsOn": [], "outOfScope": [""]}
  ],
  "loopRules": ["에이전트가 매 반복에서 지켜야 할 규칙 4~6개"],
  "firstTask": "가장 먼저 해야 할 작업 한 문장"
}`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "당신은 Spec-Driven Development 전문가입니다. 항상 스키마에 정확히 맞는 유효한 JSON만 반환하세요.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" } as ResponseFormat,
      ...apiKeys,
    });

    const content = response.choices?.[0]?.message?.content;
    const raw = parseLlmJson<Partial<SpecPack> | null>(
      typeof content === "string" ? content : undefined,
      null
    );
    return normalizeSpecPack(raw, input);
  } catch (err) {
    console.error("[Scaffold] Spec pack generation failed, using deterministic fallback:", err);
    return fallbackSpecPack(input);
  }
}

// ─── File templates ───────────────────────────────────────────────────────────

/** Korean titles have no usable ASCII slug — those specs are just `SPEC-001.md`. */
const specFileName = (spec: SpecItem) => {
  const slug = toSlug(spec.title, "");
  return `specs/${spec.id}${slug ? `-${slug}` : ""}.md`;
};

const checklist = (items: string[]) => items.map((c) => `- [ ] ${c}`).join("\n");
const bullets = (items: string[]) => items.map((c) => `- ${c}`).join("\n");

function renderSpec(spec: SpecItem): string {
  return `# ${spec.id} — ${spec.title}

| 항목 | 값 |
|------|-----|
| 상태 | TODO |
| 우선순위 | ${spec.priority} |
| 선행 스펙 | ${spec.dependsOn.length > 0 ? spec.dependsOn.join(", ") : "없음"} |

## Goal

${spec.goal}

## Requirements

${spec.requirements.length > 0 ? bullets(spec.requirements) : "- (스펙 본문 참조)"}

## Acceptance Criteria

> 이 체크박스가 전부 채워져야 이 스펙은 DONE이다. 추측이 아니라 **실행 결과**로 확인한다.

${checklist(spec.acceptanceCriteria)}

## Verification

\`\`\`bash
${spec.verification}
\`\`\`

## Out of scope

${spec.outOfScope.length > 0 ? bullets(spec.outOfScope) : "- 이 스펙에 명시되지 않은 모든 것"}

## 작업 로그

<!-- 에이전트가 이 스펙을 처리할 때마다 한 줄씩 append 한다 -->
`;
}

function renderSpecIndex(pack: SpecPack): string {
  return `# 스펙 인덱스

> 에이전트는 매 반복마다 이 표에서 **상태가 TODO/DOING 인 것 중 우선순위가 가장 높은 스펙 하나**를 고른다.
> 스펙을 끝내면 이 표의 상태를 직접 갱신한다. (TODO → DOING → DONE)

| ID | 제목 | 우선순위 | 선행 | 상태 | 파일 |
|----|------|----------|------|------|------|
${pack.specs
  .map(
    (s) =>
      `| ${s.id} | ${s.title} | ${s.priority} | ${s.dependsOn.join(", ") || "-"} | TODO | [${specFileName(s).replace("specs/", "")}](${specFileName(s).replace("specs/", "./")}) |`
  )
  .join("\n")}

## 첫 작업

${pack.firstTask}
`;
}

function renderGoal(pack: SpecPack, input: ScaffoldInput): string {
  return `# GOAL — 무엇을, 어디까지

> Loop Engineering의 핵심: 사람은 **HOW를 지시하지 않는다.** WHAT과 DONE 조건만 정의하고,
> 에이전트가 판단 → 구현 → 검증 → 수정 루프를 스스로 돌린다.

## WHAT

${pack.goal}

## DONE (완료 조건)

${checklist(pack.doneCriteria)}

## 하지 말아야 할 것

- 스펙에 없는 기능 추가
- 테스트를 삭제하거나 skip 처리해서 통과시키기
- 실패한 상태로 반복 종료
- 진행 상황을 대화 기억에만 남기기 (반드시 \`loop/PROGRESS.md\`에 기록)

## 검증 명령

\`\`\`bash
${pack.stack.testCommand}
${pack.stack.lintCommand}
${pack.stack.buildCommand}
\`\`\`

---

원본 아이디어: ${input.keyword}
난이도: ${input.analysis.implementationDifficulty} — ${input.analysis.difficultyReason}
`;
}

function renderProgress(pack: SpecPack): string {
  return `# PROGRESS

> **프로젝트의 기억이 사는 곳.** 에이전트의 컨텍스트는 매 반복마다 사라지지만 이 파일은 남는다.
> 새 반복은 항상 이 파일을 먼저 읽고 시작한다. 매 반복 끝에 한 블록씩 append 한다.

## 현재 상태

- 활성 스펙: ${pack.specs[0]?.id ?? "-"}
- 완료: 0 / ${pack.specs.length}
- 마지막 검증: (아직 실행 안 됨)

## 로그

### [초기화] 킷 생성됨

- 스펙 ${pack.specs.length}건 생성
- 다음 작업: ${pack.firstTask}

<!--
매 반복 뒤 아래 형식으로 추가:

### [YYYY-MM-DD HH:mm] SPEC-00X — 제목

- 한 일:
- 검증 결과: PASS/FAIL (명령과 출력 요약)
- 남은 문제:
- 다음 작업:
-->
`;
}

function renderEvaluator(pack: SpecPack): string {
  return `# EVALUATOR — Generator ⇄ Evaluator 체크리스트

> 만든 주체가 스스로 합격 판정을 내리면 루프는 조용히 망가진다.
> 구현(Generator)이 끝날 때마다 **다른 컨텍스트/세션**에서 이 절차로 판정한다.

## 절차

1. 대상 스펙의 Acceptance Criteria를 하나씩 읽는다.
2. 각 항목을 **실행 결과**로 확인한다. 코드를 읽고 "될 것 같다"는 근거로 삼지 않는다.
3. 아래 명령을 직접 실행한다.

\`\`\`bash
${pack.stack.testCommand}
${pack.stack.lintCommand}
\`\`\`

4. 다음 형식으로만 판정을 남긴다.

\`\`\`
VERDICT: PASS | FAIL
- [x] 기준 1 — 근거 (파일:라인 / 테스트 이름 / 출력)
- [ ] 기준 2 — 실패 이유와 재현 절차
NEXT: FAIL이면 Generator가 고쳐야 할 것 하나
\`\`\`

## 판정 원칙

- 의심스러우면 **FAIL**이다.
- 테스트가 없어서 확인이 불가능하면 FAIL이다. (테스트부터 요구한다)
- 스펙 범위를 넘어선 변경이 섞여 있으면 FAIL이다.
- PASS일 때만 \`specs/INDEX.md\`의 상태를 DONE으로 바꾼다.
`;
}

function renderRalph(pack: SpecPack, profile: AgentProfile): string {
  return `${RALPH_COMMAND_BODY(pack)}

---

이 파일은 ${profile.label} 에 그대로 전달되는 **루프 1회분 프롬프트**다.
\`scripts/loop.sh\` 또는 \`scripts/loop.ps1\` 이 매 반복마다 새 컨텍스트로 이 내용을 다시 전달한다.
긴 대화 하나로 개발하지 말고, 짧은 반복을 여러 번 돌려라 — 상태는 대화가 아니라 파일에 있다.
`;
}

function renderMemoryFile(pack: SpecPack, input: ScaffoldInput, profile: AgentProfile): string {
  const { analysis, attachments } = input;
  return `# ${pack.projectName}

${pack.oneLiner}

> 이 파일은 ${profile.label}가 세션 시작 시 자동으로 읽는 프로젝트 메모리다.
> BuildPlanner가 "${input.keyword}" 분석 결과로 생성했다. (대상 모델: ${input.modelLabel})

## 이 저장소의 작동 방식

이 프로젝트는 **Spec 주도 + 자율 루프** 방식으로 개발한다.

| 경로 | 역할 |
|------|------|
| \`loop/GOAL.md\` | 최종 목표(WHAT)와 완료 조건(DONE) |
| \`loop/PROGRESS.md\` | 프로젝트의 기억. 매 반복마다 읽고, 매 반복 끝에 기록 |
| \`loop/RALPH.md\` | 반복 1회분 실행 프롬프트 |
| \`loop/EVALUATOR.md\` | 독립 검증(Generator ⇄ Evaluator) 절차 |
| \`specs/INDEX.md\` | 스펙 목록과 상태 (TODO / DOING / DONE) |
| \`specs/SPEC-*.md\` | 개별 스펙. 진실의 원천 |
| \`context/\` | 아키텍처·기술스택·리스크·참고자료 |
| \`docs/BUILD-PLAN.md\` | 원본 개발 계획서 전문 |

## 매 세션 시작 시

1. \`loop/GOAL.md\` → \`loop/PROGRESS.md\` → \`specs/INDEX.md\` 순서로 읽는다.
2. 다음에 할 스펙 **하나**를 고른다.
3. 구현 → \`${pack.stack.testCommand}\` → Acceptance Criteria 대조 → \`loop/PROGRESS.md\` 기록.

## 명령어

\`\`\`bash
${pack.stack.devCommand}     # 개발 서버
${pack.stack.testCommand}    # 테스트 (모든 검증의 기준)
${pack.stack.lintCommand}    # 린트
${pack.stack.buildCommand}   # 빌드
\`\`\`

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | ${analysis.techStack.frontend.join(", ") || "-"} |
| Backend | ${analysis.techStack.backend.join(", ") || "-"} |
| AI/ML | ${analysis.techStack.ai.join(", ") || "-"} |
| Database | ${analysis.techStack.database.join(", ") || "-"} |
| Deployment | ${analysis.techStack.deployment.join(", ") || "-"} |

## 규칙

${bullets(pack.loopRules)}
${
  analysis.designGuidelines?.length
    ? `\n## 디자인 지침 (참고 이미지 기반)\n\n${bullets(analysis.designGuidelines)}\n\n참고 이미지: \`assets/references/\`\n`
    : ""
}${
    attachments && attachments.docs.length > 0
      ? `\n## 사용자 첨부 요구사항\n\n${attachments.docs
          .map((d) => `- \`docs/attachments/${d.name}\` — 이 문서의 요구사항이 다른 판단보다 우선한다.`)
          .join("\n")}\n`
      : ""
  }${
    attachments?.projects?.length
      ? `\n## 이어받을 기존 프로젝트\n\n이 작업은 새 프로젝트가 아니라 아래 코드베이스의 확장이다. 구현 전에 실제 경로를 열어 현재 상태를 확인한다.\n\n${attachments.projects
          .map((p) => `- \`${p.path}\` (${p.name}${p.languages.length ? ` · ${p.languages.join(", ")}` : ""})`)
          .join("\n")}\n\n자세한 구조는 \`context/local-projects.md\` 참조.\n`
      : ""
  }`;
}

function renderReadme(pack: SpecPack, input: ScaffoldInput, profile: AgentProfile): string {
  return `# ${pack.projectName}

${pack.oneLiner}

BuildPlanner가 생성한 **개발 시작 킷**입니다. 압축을 풀고 이 폴더를 그대로 에이전트에게 열어주면 됩니다.

## 빠른 시작

\`\`\`bash
cd ${pack.projectSlug}
git init && git add -A && git commit -m "chore: BuildPlanner 킷으로 시작"

# 1) 한 번만 돌려보기
${profile.runIteration.bash}

# 2) 루프로 계속 돌리기 (기본 10회)
bash scripts/loop.sh 10          # macOS / Linux
powershell -File scripts/loop.ps1 -Iterations 10   # Windows
\`\`\`

> \`${profile.cli}\` CLI의 플래그는 버전에 따라 다를 수 있습니다. 스크립트 첫 부분의 명령만 바꿔 쓰면 됩니다.

## 폴더 구조

\`\`\`
${pack.projectSlug}/
├─ ${profile.memoryFile}          # 에이전트가 자동으로 읽는 프로젝트 메모리
├─ README.md
├─ loop/
│  ├─ GOAL.md            # WHAT + DONE 조건
│  ├─ PROGRESS.md        # 프로젝트의 기억 (매 반복 기록)
│  ├─ RALPH.md           # 반복 1회분 프롬프트
│  └─ EVALUATOR.md       # 독립 검증 절차
├─ specs/
│  ├─ INDEX.md           # 스펙 목록 + 상태
${pack.specs.map((s) => `│  ├─ ${specFileName(s).replace("specs/", "")}`).join("\n")}
├─ context/              # 아키텍처 / 기술스택 / 리스크 / 참고자료
├─ docs/                 # 원본 계획서, 첨부 문서
├─ assets/references/    # 참고 이미지 (디자인 기준)
└─ scripts/              # 루프 실행 스크립트
\`\`\`

## 작동 원리

\`\`\`
GOAL(WHAT + DONE)
      ↓
  스펙 하나 선택  ← specs/INDEX.md
      ↓
    구현        ← Generator
      ↓
  테스트 실행
      ↓
    검증        ← Evaluator (loop/EVALUATOR.md)
   ↓        ↓
 FAIL      PASS
   ↓        ↓
 수정 반복   다음 스펙
\`\`\`

사람이 할 일은 **목표와 완료 조건을 정의하고 결과를 검토하는 것**이고,
"어떻게"는 에이전트가 루프를 돌며 스스로 찾습니다.

## 생성 정보

- 원본 아이디어: ${input.keyword}
- 대상 에이전트: ${profile.label} (메모리 파일: \`${profile.memoryFile}\`)
- 분석 모델: ${input.modelLabel}
- 스펙 수: ${pack.specs.length}
`;
}

function renderLoopScripts(pack: SpecPack, profile: AgentProfile): ZipEntry[] {
  const bash = `#!/usr/bin/env bash
# BuildPlanner 자율 루프 러너 (${profile.label})
# 매 반복마다 새 컨텍스트로 loop/RALPH.md를 전달한다. 상태는 대화가 아니라 파일에 남는다.
set -u
ITERATIONS="\${1:-10}"

for i in $(seq 1 "$ITERATIONS"); do
  echo ""
  echo "=========== LOOP $i / $ITERATIONS ==========="

  ${profile.runIteration.bash} || echo "(반복 $i 실패 — 다음 반복에서 이어서 시도합니다)"

  if grep -q "ALL-SPECS-DONE" loop/PROGRESS.md 2>/dev/null; then
    echo "모든 스펙 완료. 루프를 종료합니다."
    break
  fi

  # 검증은 루프의 브레이크. 실패해도 멈추지 않고 다음 반복이 고치게 한다.
  ${pack.stack.testCommand} || echo "(테스트 실패 — 다음 반복의 작업으로 넘깁니다)"
done
`;

  // A UTF-8 BOM is required: Windows PowerShell 5.1 reads BOM-less .ps1 files as ANSI,
  // which would turn every Korean string in this script into mojibake.
  const powershell = `﻿# BuildPlanner 자율 루프 러너 (${profile.label})
# 매 반복마다 새 컨텍스트로 loop/RALPH.md를 전달한다. 상태는 대화가 아니라 파일에 남는다.
param([int]$Iterations = 10)

$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8

for ($i = 1; $i -le $Iterations; $i++) {
    Write-Host ""
    Write-Host "=========== LOOP $i / $Iterations ==========="

    try { ${profile.runIteration.powershell} } catch { Write-Host "(반복 $i 실패 - 다음 반복에서 이어서 시도합니다)" }

    if (Select-String -Path "loop/PROGRESS.md" -Pattern "ALL-SPECS-DONE" -Quiet -ErrorAction SilentlyContinue) {
        Write-Host "모든 스펙 완료. 루프를 종료합니다."
        break
    }

    # 검증은 루프의 브레이크. 실패해도 멈추지 않고 다음 반복이 고치게 한다.
    try { ${pack.stack.testCommand} } catch { Write-Host "(테스트 실패 - 다음 반복의 작업으로 넘깁니다)" }
}
`;

  return [
    { path: "scripts/loop.sh", content: bash },
    { path: "scripts/loop.ps1", content: powershell },
  ];
}

function renderContextFiles(pack: SpecPack, input: ScaffoldInput): ZipEntry[] {
  const { analysis, sources, teardown } = input;

  const files: ZipEntry[] = [
    {
      path: "context/architecture.md",
      content: `# 아키텍처

## 개요

${analysis.summary}

## 제안 디렉터리 구조

\`\`\`
${pack.directories.map((d) => `${d.path.padEnd(24)} # ${d.purpose}`).join("\n")}
\`\`\`

## 개발 단계

${analysis.developmentPhases
  .map((p) => `### ${p.phase} (${p.duration})\n\n${p.tasks.map((t) => `- [ ] ${t}`).join("\n")}`)
  .join("\n\n")}

## 핵심 기술

${bullets(analysis.coreTechnologies)}
`,
    },
    {
      path: "context/tech-stack.md",
      content: `# 기술 스택

| 영역 | 선택 |
|------|------|
| Frontend | ${analysis.techStack.frontend.join(", ") || "-"} |
| Backend | ${analysis.techStack.backend.join(", ") || "-"} |
| AI/ML | ${analysis.techStack.ai.join(", ") || "-"} |
| Database | ${analysis.techStack.database.join(", ") || "-"} |
| Deployment | ${analysis.techStack.deployment.join(", ") || "-"} |

## 명령어

| 목적 | 명령 |
|------|------|
| 개발 | \`${pack.stack.devCommand}\` |
| 테스트 | \`${pack.stack.testCommand}\` |
| 린트 | \`${pack.stack.lintCommand}\` |
| 빌드 | \`${pack.stack.buildCommand}\` |

패키지 매니저: \`${pack.stack.packageManager}\` · 런타임: ${pack.stack.runtime}
`,
    },
    {
      path: "context/risks-and-licenses.md",
      content: `# 리스크와 라이선스

## 리스크

${
  analysis.risks.length > 0
    ? analysis.risks.map((r) => `### ⚠️ ${r.risk}\n\n- 대응: ${r.mitigation}`).join("\n\n")
    : "_식별된 리스크 없음_"
}

## 라이선스 주의사항

${
  analysis.licenseNotes.length > 0
    ? bullets(analysis.licenseNotes)
    : "- 참고 오픈소스의 라이선스를 개별 확인할 것 (MIT/Apache 2.0은 상업적 사용 가능, GPL은 소스 공개 의무)"
}
`,
    },
    {
      path: "context/references.md",
      content: `# 참고 자료

> 계획서 작성 시 수집된 소스입니다. 구현 중 막히면 여기부터 확인하세요.

${
  analysis.openSourceReferences.length > 0
    ? `## 참고 오픈소스\n\n${analysis.openSourceReferences
        .map((r) => `- [${r.name}](${r.url}) — ${r.description}`)
        .join("\n")}\n`
    : ""
}
## 수집 소스 (상위 ${Math.min(sources.length, 30)}건)

${
  sources.length > 0
    ? sources
        .slice(0, 30)
        .map((s) => `- \`${s.sourceType}\` [${s.title}](${s.url})`)
        .join("\n")
    : "_수집된 소스 없음_"
}

${
  analysis.similarServices.length > 0
    ? `## 유사 서비스\n\n${analysis.similarServices.map((s) => `- **${s.name}**: ${s.description}`).join("\n")}`
    : ""
}
`,
    },
  ];

  if (analysis.designGuidelines?.length) {
    files.push({
      path: "context/design-guidelines.md",
      content: `# 디자인 지침

> 사용자가 첨부한 참고 이미지에서 도출된 지침입니다. UI 작업은 이 기준을 따릅니다.
> 원본 이미지는 \`assets/references/\` 에 있습니다.

${bullets(analysis.designGuidelines)}
`,
    });
  }

  if (input.attachments?.projects?.length) {
    files.push({
      path: "context/local-projects.md",
      content: `# 참고 로컬 프로젝트

> 사용자의 로컬 디스크에 **이미 존재하는** 코드베이스입니다.
> 이 계획은 처음부터 만드는 것이 아니라 아래 프로젝트를 이어받아 확장하는 것을 전제로 합니다.
> 작업 전에 실제 경로를 열어 현재 상태를 먼저 확인하세요.

${input.attachments.projects
  .map(
    (p) => `## ${p.name}

- 경로: \`${p.path}\`
- 파일 ${p.fileCount.toLocaleString("ko-KR")}개${p.languages.length > 0 ? ` · ${p.languages.join(", ")}` : ""}${
      p.truncated ? " · 일부만 스캔됨" : ""
    }

${p.tree ? `### 디렉터리 구조\n\n\`\`\`\n${p.tree}\n\`\`\`` : ""}

${p.manifests.map((m) => `### \`${m.file}\`\n\n\`\`\`\n${m.excerpt}\n\`\`\``).join("\n\n")}

${p.readme ? `### README 발췌\n\n\`\`\`markdown\n${p.readme}\n\`\`\`` : ""}`
  )
  .join("\n\n---\n\n")}
`,
    });
  }

  if (teardown) {
    files.push({
      path: "context/teardown.md",
      content: `# 역설계 배경

## 분석 대상

**${teardown.target.product}** — ${teardown.target.oneLine}

## 새 개념: ${teardown.leapfrog.conceptName}

${teardown.leapfrog.thesis}

포지셔닝: ${teardown.leapfrog.positioning}

## 원본의 균열

${teardown.faultLines.map((f) => `### ${f.title} (${f.severity})\n\n- 근거: ${f.evidence}\n- 기회: ${f.opportunity}`).join("\n\n")}

## 차별화 기능

${teardown.leapfrog.features
  .map((f) => `### ${f.name}\n\n${f.description}\n\n- 기존 방식: ${f.originalApproach}\n- 새 방식: ${f.newApproach}`)
  .join("\n\n")}

## 차별화 점수

${teardown.divergence.score}점 — ${teardown.divergence.verdict}

${teardown.divergence.legalNotes.length > 0 ? `### 법적 주의\n\n${bullets(teardown.divergence.legalNotes)}` : ""}
`,
    });
  }

  return files;
}

/** Decodes a `data:` URL body into bytes; returns null when the payload is malformed. */
function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;
  const meta = dataUrl.slice(0, commaIndex);
  const body = dataUrl.slice(commaIndex + 1);
  try {
    return meta.includes(";base64")
      ? Buffer.from(body, "base64")
      : Buffer.from(decodeURIComponent(body), "utf8");
  } catch {
    return null;
  }
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function buildScaffoldFiles(pack: SpecPack, input: ScaffoldInput): ZipEntry[] {
  const profile = AGENT_PROFILES[input.agent];
  const files: ZipEntry[] = [
    { path: "README.md", content: renderReadme(pack, input, profile) },
    { path: profile.memoryFile, content: renderMemoryFile(pack, input, profile) },
    { path: "loop/GOAL.md", content: renderGoal(pack, input) },
    { path: "loop/PROGRESS.md", content: renderProgress(pack) },
    { path: "loop/RALPH.md", content: renderRalph(pack, profile) },
    { path: "loop/EVALUATOR.md", content: renderEvaluator(pack) },
    { path: "specs/INDEX.md", content: renderSpecIndex(pack) },
    ...pack.specs.map((spec) => ({ path: specFileName(spec), content: renderSpec(spec) })),
    ...renderContextFiles(pack, input),
    ...renderLoopScripts(pack, profile),
    ...profile.extras(pack),
    {
      path: ".gitignore",
      content: `node_modules/\ndist/\nbuild/\n.env\n.env.local\n*.log\n.DS_Store\n.venv/\n__pycache__/\n`,
    },
  ];

  if (input.planMarkdown) {
    files.push({ path: "docs/BUILD-PLAN.md", content: input.planMarkdown });
  }

  if (!isEmptyAttachments(input.attachments)) {
    const stored = input.attachments as IdeaAttachments;
    // Older rows predate some fields; fill the gaps rather than trusting the shape.
    const attachments: IdeaAttachments = {
      docs: stored.docs ?? [],
      images: stored.images ?? [],
      projects: stored.projects ?? [],
    };

    for (const doc of attachments.docs) {
      const name = doc.name.replace(/[/\\]/g, "_");
      files.push({ path: `docs/attachments/${name}`, content: doc.content });
    }

    attachments.images.forEach((img, i) => {
      const buffer = dataUrlToBuffer(img.dataUrl);
      if (!buffer) return;
      const ext = IMAGE_EXTENSIONS[img.mimeType] ?? "png";
      const base = toSlug(img.name.replace(/\.[^.]+$/, ""), `reference-${i + 1}`);
      files.push({ path: `assets/references/${base}.${ext}`, content: buffer });
    });

    if (attachments.images.length > 0) {
      files.push({
        path: "assets/references/README.md",
        content: `# 참고 이미지\n\n사용자가 첨부한 인터페이스/디자인 참고 이미지입니다.\nUI를 만들 때 이 이미지의 레이아웃·구성·톤앤매너를 기준으로 삼으세요.\n\n${attachments.images
          .map((img) => `- ${img.name}`)
          .join("\n")}\n`,
      });
    }
  }

  return files;
}

export interface ScaffoldResult {
  fileName: string;
  base64: string;
  agent: TargetAgent;
  agentLabel: string;
  memoryFile: string;
  rootDir: string;
  fileCount: number;
  specCount: number;
  byteSize: number;
}

export async function buildScaffoldZip(
  input: ScaffoldInput,
  apiKeys?: ApiKeys
): Promise<ScaffoldResult> {
  const pack = await generateSpecPack(input, apiKeys);
  const files = buildScaffoldFiles(pack, input);
  const profile = AGENT_PROFILES[input.agent];

  // Everything lives under one folder so extracting never litters the download directory.
  const rootDir = pack.projectSlug;
  const zip = createZip(files.map((f) => ({ ...f, path: `${rootDir}/${f.path}` })));

  return {
    fileName: `${rootDir}-devkit.zip`,
    base64: zip.toString("base64"),
    agent: input.agent,
    agentLabel: profile.label,
    memoryFile: profile.memoryFile,
    rootDir,
    fileCount: files.length,
    specCount: pack.specs.length,
    byteSize: zip.length,
  };
}
