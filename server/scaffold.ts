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
import { invokeLLM, resolveProvider, type ResponseFormat } from "./_core/llm";
import { parseLlmJson } from "./teardown";
import type { AnalysisResult } from "./analyzer";
import type { SourceItem } from "./collector";
import type { TeardownResult } from "./teardown";
import { createZip, type ZipEntry } from "./zip";
import { isEmptyAttachments, type IdeaAttachments } from "@shared/attachments";
import {
  DEFAULT_ANALYSIS_LANGUAGE,
  languageInstruction,
  type AnalysisLanguage,
} from "@shared/languages";
import { agentExtraStrings, fallbackStrings, kitStrings, type KitStrings } from "./kitStrings";
import { planStrings } from "./planStrings";

export const TARGET_AGENTS = ["auto", "claude", "codex", "gemini", "cursor", "generic"] as const;
export type TargetAgentInput = (typeof TARGET_AGENTS)[number];
export type TargetAgent = Exclude<TargetAgentInput, "auto">;

type ApiKeys = { geminiKey?: string; openaiKey?: string; anthropicKey?: string; customModel?: string; language?: AnalysisLanguage };

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
  /** The kit's scaffolding follows the same language as the plan and the specs. */
  language: AnalysisLanguage;
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
  extras: (pack: SpecPack, k: KitStrings) => ZipEntry[];
}

const RALPH_COMMAND_BODY = (pack: SpecPack, k: KitStrings) =>
  [
    k.ralphIntro,
    "",
    ...k
      .ralphSteps(pack.stack.testCommand, pack.stack.lintCommand)
      .map((step, i) => `${i + 1}. ${step}`),
    "",
    k.ralphRules,
    ...pack.loopRules.map((r) => `- ${r}`),
  ].join("\n");

/** The verdict block shared by the Claude sub-agent, the Codex prompt and loop/EVALUATOR.md. */
const VERDICT_TEMPLATE = `\`\`\`
VERDICT: PASS | FAIL
- [x] criterion 1 — evidence (file:line or test name)
- [ ] criterion 2 — why it failed and how to reproduce
NEXT: on FAIL, the one thing the Generator must fix
\`\`\``;

/** Assembled from the localized pieces so each agent's copy says the same thing. */
function evaluatorBody(pack: SpecPack, k: KitStrings): string {
  const x = agentExtraStrings(k.language);
  return [
    x.evaluatorRole,
    "",
    ...k.loop.evaluatorSteps.map((step, i) => `${i + 1}. ${step}`),
    "",
    `\`\`\`bash\n${pack.stack.testCommand}\n\`\`\``,
    "",
    VERDICT_TEMPLATE,
    "",
    k.loop.verdictPrincipleItems.map((p) => `- ${p}`).join("\n"),
  ].join("\n");
}

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
    extras: (pack, k) => {
      const x = agentExtraStrings(k.language);
      return [
        {
          path: ".claude/commands/loop.md",
          content: `---\ndescription: ${x.loopCommandDescription}\n---\n\n${RALPH_COMMAND_BODY(pack, k)}\n`,
        },
        {
          path: ".claude/commands/status.md",
          content: `---\ndescription: ${x.statusCommandDescription}\n---\n\n${x.statusCommandBody}\n`,
        },
        {
          path: ".claude/agents/evaluator.md",
          content: `---\nname: evaluator\ndescription: ${x.evaluatorAgentDescription}\ntools: Read, Grep, Glob, Bash\n---\n\n${evaluatorBody(pack, k)}\n`,
        },
      ];
    },
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
    extras: (pack, k) => [
      { path: "prompts/loop.md", content: `${RALPH_COMMAND_BODY(pack, k)}\n` },
      { path: "prompts/evaluate.md", content: `${evaluatorBody(pack, k)}\n` },
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
    extras: (pack, k) => [
      {
        path: ".gemini/commands/loop.toml",
        content: `description = "${agentExtraStrings(k.language).loopCommandDescription}"\n\nprompt = """\n${RALPH_COMMAND_BODY(pack, k).replace(/"""/g, '\\"\\"\\"')}\n"""\n`,
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
    extras: (pack, k) => {
      const x = agentExtraStrings(k.language);
      return [
        {
          path: ".cursor/rules/00-project.mdc",
          content: `---\ndescription: ${x.cursorRulesDescription}\nalwaysApply: true\n---\n\n${x
            .cursorRules(pack.stack.testCommand)
            .map((rule) => `- ${rule}`)
            .join("\n")}\n`,
        },
        {
          path: ".cursor/rules/10-loop.mdc",
          content: `---\ndescription: ${x.cursorLoopDescription}\n---\n\n${RALPH_COMMAND_BODY(pack, k)}\n`,
        },
      ];
    },
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
    extras: (pack, k) => [{ path: "prompts/loop.md", content: `${RALPH_COMMAND_BODY(pack, k)}\n` }],
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

  switch (resolveProvider(apiKeys)) {
    case "anthropic":
      return "claude";
    case "gemini":
      return "gemini";
    case "openai":
      return "codex";
    default:
      return "claude";
  }
}

export function describeModel(apiKeys: ApiKeys): string {
  if (apiKeys.customModel) return apiKeys.customModel;
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  switch (resolveProvider(apiKeys)) {
    case "anthropic":
      return "claude-opus-5";
    case "gemini":
      return "gemini-2.5-flash";
    case "openai":
      return "gpt-4o-mini";
    default:
      return "기본 모델";
  }
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
  const fb = fallbackStrings(input.language ?? DEFAULT_ANALYSIS_LANGUAGE);
  const features =
    analysis.coreFeatures.length > 0 ? analysis.coreFeatures : [fb.coreFeature(keyword)];

  const specs: SpecItem[] = features.slice(0, 10).map((feature, i) => ({
    id: SPEC_ID(i),
    title: feature.length > 60 ? `${feature.slice(0, 60)}…` : feature,
    priority: i === 0 ? "P0" : i < 3 ? "P1" : "P2",
    goal: feature,
    requirements: [feature, fb.noRegression],
    acceptanceCriteria: [fb.featureWorks(feature), fb.hasPassingTest, fb.fullSuitePasses],
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
      ...features.slice(0, 5).map((f) => fb.featureWorks(f)),
      fb.allTestsPass,
      fb.noRegression,
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
      { path: "src/", purpose: fb.appSource },
      { path: "tests/", purpose: fb.tests },
    ],
    specs,
    loopRules: fb.loopRules,
    firstTask: fb.firstTask(SPEC_ID(0)),
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

export async function generateSpecPack(input: ScaffoldInput, options?: ApiKeys): Promise<SpecPack> {
  const { language = DEFAULT_ANALYSIS_LANGUAGE, ...apiKeys } = options ?? {};
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
6. ${languageInstruction(language)} id/slug/경로/명령은 영문 그대로 둔다.

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
          content: `당신은 Spec-Driven Development 전문가입니다. 항상 스키마에 정확히 맞는 유효한 JSON만 반환하세요. ${languageInstruction(language)}`,
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

/** `implementationDifficulty` is a Korean-valued enum in the analysis schema. */
function translateDifficulty(
  difficulty: AnalysisResult["implementationDifficulty"],
  language: AnalysisLanguage
): string {
  return planStrings(language).difficultyLevels[difficulty] ?? difficulty;
}

function renderSpec(spec: SpecItem, k: KitStrings): string {
  const s = k.specs;
  return `# ${spec.id} — ${spec.title}

| ${s.id} | ${s.state} |
|------|-----|
| ${s.state} | TODO |
| ${s.priority} | ${spec.priority} |
| ${s.dependsOn} | ${spec.dependsOn.length > 0 ? spec.dependsOn.join(", ") : s.none} |

## ${s.goal}

${spec.goal}

## ${s.requirements}

${spec.requirements.length > 0 ? bullets(spec.requirements) : `- ${s.seeSpecBody}`}

## ${s.acceptanceCriteria}

> ${s.acceptanceNote}

${checklist(spec.acceptanceCriteria)}

## ${s.verification}

\`\`\`bash
${spec.verification}
\`\`\`

## ${s.outOfScope}

${spec.outOfScope.length > 0 ? bullets(spec.outOfScope) : `- ${s.outOfScopeDefault}`}

## ${s.workLog}

<!-- ${s.workLogHint} -->
`;
}

function renderSpecIndex(pack: SpecPack, k: KitStrings): string {
  const s = k.specs;
  return `# ${s.indexTitle}

> ${s.indexIntro.split("\n").join("\n> ")}

| ${s.id} | ${s.title} | ${s.priority} | ${s.dependsOn} | ${s.status} | ${s.file} |
|----|------|----------|------|------|------|
${pack.specs
  .map(
    (spec) =>
      `| ${spec.id} | ${spec.title} | ${spec.priority} | ${spec.dependsOn.join(", ") || "-"} | TODO | [${specFileName(spec).replace("specs/", "")}](${specFileName(spec).replace("specs/", "./")}) |`
  )
  .join("\n")}

## ${s.firstTask}

${pack.firstTask}
`;
}

function renderGoal(pack: SpecPack, input: ScaffoldInput, k: KitStrings): string {
  const l = k.loop;
  return `# ${l.goalTitle}

> ${l.goalIntro}

## ${l.what}

${pack.goal}

## ${l.done}

${checklist(pack.doneCriteria)}

## ${l.doNot}

${bullets(l.doNotItems)}

## ${l.verifyCommands}

\`\`\`bash
${pack.stack.testCommand}
${pack.stack.lintCommand}
${pack.stack.buildCommand}
\`\`\`

---

${l.originalIdea}: ${input.keyword}
${l.difficulty}: ${translateDifficulty(input.analysis.implementationDifficulty, input.language)} — ${input.analysis.difficultyReason}
`;
}

function renderProgress(pack: SpecPack, k: KitStrings): string {
  const l = k.loop;
  return `# ${l.progressTitle}

> ${l.progressIntro}

## ${l.currentState}

- ${l.activeSpec}: ${pack.specs[0]?.id ?? "-"}
- ${l.completed}: 0 / ${pack.specs.length}
- ${l.lastVerified}: ${l.notRunYet}

## ${l.log}

### ${l.initialised}

- ${l.specsCreated(pack.specs.length)}
- ${l.nextTask}: ${pack.firstTask}

<!--
${l.progressTemplate}
-->
`;
}

function renderEvaluator(pack: SpecPack, k: KitStrings): string {
  const l = k.loop;
  return `# ${l.evaluatorTitle}

> ${l.evaluatorIntro}

## ${l.procedure}

${l.evaluatorSteps
  .slice(0, 3)
  .map((step, i) => `${i + 1}. ${step}`)
  .join("\n")}

\`\`\`bash
${pack.stack.testCommand}
${pack.stack.lintCommand}
\`\`\`

${l.evaluatorSteps.length}. ${l.evaluatorSteps[l.evaluatorSteps.length - 1]}

${VERDICT_TEMPLATE}

## ${l.verdictPrinciples}

${bullets(l.verdictPrincipleItems)}
`;
}

function renderRalph(pack: SpecPack, profile: AgentProfile, k: KitStrings): string {
  return `${RALPH_COMMAND_BODY(pack, k)}

---

${k.ralphFooter(profile.label)}
`;
}

function renderMemoryFile(
  pack: SpecPack,
  input: ScaffoldInput,
  profile: AgentProfile,
  k: KitStrings
): string {
  const { analysis, attachments } = input;
  const m = k.memory;
  return `# ${pack.projectName}

${pack.oneLiner}

> ${m.intro(profile.label, input.keyword, input.modelLabel).split("\n").join("\n> ")}

## ${m.howItWorks}

| ${m.path} | ${m.role} |
|------|------|
| \`loop/GOAL.md\` | ${m.roles.goal} |
| \`loop/PROGRESS.md\` | ${m.roles.progress} |
| \`loop/RALPH.md\` | ${m.roles.ralph} |
| \`loop/EVALUATOR.md\` | ${m.roles.evaluator} |
| \`specs/INDEX.md\` | ${m.roles.index} |
| \`specs/SPEC-*.md\` | ${m.roles.specFiles} |
| \`context/\` | ${m.roles.context} |
| \`docs/BUILD-PLAN.md\` | ${m.roles.plan} |

## ${m.everySession}

${m
  .sessionSteps(pack.stack.testCommand)
  .map((step, i) => `${i + 1}. ${step}`)
  .join("\n")}

## ${m.commands}

\`\`\`bash
${pack.stack.devCommand}     # ${m.devServer}
${pack.stack.testCommand}    # ${m.tests}
${pack.stack.lintCommand}    # ${m.lint}
${pack.stack.buildCommand}   # ${m.build}
\`\`\`

## ${m.techStack}

| ${m.area} | ${m.technology} |
|------|------|
| Frontend | ${analysis.techStack.frontend.join(", ") || "-"} |
| Backend | ${analysis.techStack.backend.join(", ") || "-"} |
| AI/ML | ${analysis.techStack.ai.join(", ") || "-"} |
| Database | ${analysis.techStack.database.join(", ") || "-"} |
| Deployment | ${analysis.techStack.deployment.join(", ") || "-"} |

## ${m.rules}

${bullets(pack.loopRules)}
${
  analysis.designGuidelines?.length
    ? `\n## ${m.designGuidelines}\n\n${bullets(analysis.designGuidelines)}\n\n${m.referenceImages}: \`assets/references/\`\n`
    : ""
}${
    attachments && attachments.docs.length > 0
      ? `\n## ${m.userRequirements}\n\n${attachments.docs
          .map((d) => `- \`docs/attachments/${d.name}\` — ${m.requirementPriority}`)
          .join("\n")}\n`
      : ""
  }${
    attachments?.projects?.length
      ? `\n## ${m.existingProjects}\n\n${m.existingProjectsNote}\n\n${attachments.projects
          .map((p) => `- \`${p.path}\` (${p.name}${p.languages.length ? ` · ${p.languages.join(", ")}` : ""})`)
          .join("\n")}\n\n${m.seeLocalProjects}\n`
      : ""
  }`;
}

function renderReadme(
  pack: SpecPack,
  input: ScaffoldInput,
  profile: AgentProfile,
  k: KitStrings
): string {
  const r = k.readme;
  return `# ${pack.projectName}

${pack.oneLiner}

${r.intro}

## ${r.quickStart}

\`\`\`bash
cd ${pack.projectSlug}
git init && git add -A && git commit -m "chore: start from the BuildPlanner kit"

# ${r.runOnce}
${profile.runIteration.bash}

# ${r.runLoop}
bash scripts/loop.sh 10          # ${r.macLinux}
powershell -File scripts/loop.ps1 -Iterations 10   # ${r.windows}
\`\`\`

> ${r.cliNote(profile.cli)}

## ${r.folderStructure}

\`\`\`
${pack.projectSlug}/
├─ ${profile.memoryFile}          # ${r.memoryFileComment}
├─ README.md
├─ loop/
│  ├─ GOAL.md            # ${k.memory.roles.goal}
│  ├─ PROGRESS.md        # ${k.memory.roles.progress}
│  ├─ RALPH.md           # ${k.memory.roles.ralph}
│  └─ EVALUATOR.md       # ${k.memory.roles.evaluator}
├─ specs/
│  ├─ INDEX.md           # ${k.memory.roles.index}
${pack.specs.map((s) => `│  ├─ ${specFileName(s).replace("specs/", "")}`).join("\n")}
├─ context/              # ${k.memory.roles.context}
├─ docs/                 # ${k.memory.roles.plan}
├─ assets/references/    # ${k.assets.title}
└─ scripts/
\`\`\`

## ${r.howItWorks}

\`\`\`
GOAL (${k.loop.what} + ${k.loop.done})
      ↓
  specs/INDEX.md
      ↓
    Generator
      ↓
  ${pack.stack.testCommand}
      ↓
    Evaluator  (loop/EVALUATOR.md)
   ↓        ↓
 FAIL      PASS
   ↓        ↓
  ⟲       next spec
\`\`\`

${r.humanRole}

## ${r.buildInfo}

- ${r.originalIdea}: ${input.keyword}
- ${r.targetAgent}: ${profile.label} (${r.memoryFileLabel}: \`${profile.memoryFile}\`)
- ${r.analysisModel}: ${input.modelLabel}
- ${r.specCount}: ${pack.specs.length}
`;
}

function renderLoopScripts(pack: SpecPack, profile: AgentProfile, k: KitStrings): ZipEntry[] {
  const s = k.scripts;
  const bash = `#!/usr/bin/env bash
# ${s.header(profile.label)}
# ${s.headerNote}
set -u
ITERATIONS="\${1:-10}"

for i in $(seq 1 "$ITERATIONS"); do
  echo ""
  echo "=========== LOOP $i / $ITERATIONS ==========="

  ${profile.runIteration.bash} || echo "${s.iterationFailed("$i")}"

  if grep -q "ALL-SPECS-DONE" loop/PROGRESS.md 2>/dev/null; then
    echo "${s.allDone}"
    break
  fi

  # ${s.verifyComment}
  ${pack.stack.testCommand} || echo "${s.testFailed}"
done
`;

  // A UTF-8 BOM is required: Windows PowerShell 5.1 reads BOM-less .ps1 files as ANSI,
  // which would turn every non-ASCII string in this script into mojibake.
  const powershell = `﻿# ${s.header(profile.label)}
# ${s.headerNote}
param([int]$Iterations = 10)

$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8

for ($i = 1; $i -le $Iterations; $i++) {
    Write-Host ""
    Write-Host "=========== LOOP $i / $Iterations ==========="

    try { ${profile.runIteration.powershell} } catch { Write-Host "${s.iterationFailed("$i")}" }

    if (Select-String -Path "loop/PROGRESS.md" -Pattern "ALL-SPECS-DONE" -Quiet -ErrorAction SilentlyContinue) {
        Write-Host "${s.allDone}"
        break
    }

    # ${s.verifyComment}
    try { ${pack.stack.testCommand} } catch { Write-Host "${s.testFailed}" }
}
`;

  return [
    { path: "scripts/loop.sh", content: bash },
    { path: "scripts/loop.ps1", content: powershell },
  ];
}

function renderContextFiles(pack: SpecPack, input: ScaffoldInput, k: KitStrings): ZipEntry[] {
  const { analysis, sources, teardown } = input;
  const x = k.context;

  const files: ZipEntry[] = [
    {
      path: "context/architecture.md",
      content: `# ${x.architecture}

## ${x.overview}

${analysis.summary}

## ${x.proposedTree}

\`\`\`
${pack.directories.map((d) => `${d.path.padEnd(24)} # ${d.purpose}`).join("\n")}
\`\`\`

## ${x.phases}

${analysis.developmentPhases
  .map((p) => `### ${p.phase} (${p.duration})\n\n${p.tasks.map((t) => `- [ ] ${t}`).join("\n")}`)
  .join("\n\n")}

## ${x.coreTech}

${bullets(analysis.coreTechnologies)}
`,
    },
    {
      path: "context/tech-stack.md",
      content: `# ${x.techStackTitle}

| ${k.memory.area} | ${k.memory.technology} |
|------|------|
| Frontend | ${analysis.techStack.frontend.join(", ") || "-"} |
| Backend | ${analysis.techStack.backend.join(", ") || "-"} |
| AI/ML | ${analysis.techStack.ai.join(", ") || "-"} |
| Database | ${analysis.techStack.database.join(", ") || "-"} |
| Deployment | ${analysis.techStack.deployment.join(", ") || "-"} |

## ${x.commandsTitle}

| ${x.purpose} | ${x.command} |
|------|------|
| ${x.dev} | \`${pack.stack.devCommand}\` |
| ${x.test} | \`${pack.stack.testCommand}\` |
| ${x.lint} | \`${pack.stack.lintCommand}\` |
| ${x.build} | \`${pack.stack.buildCommand}\` |

${x.packageManager}: \`${pack.stack.packageManager}\` · ${x.runtime}: ${pack.stack.runtime}
`,
    },
    {
      path: "context/risks-and-licenses.md",
      content: `# ${x.risksTitle}

## ${x.risks}

${
  analysis.risks.length > 0
    ? analysis.risks.map((r) => `### ⚠️ ${r.risk}\n\n- ${x.mitigation}: ${r.mitigation}`).join("\n\n")
    : x.noRisks
}

## ${x.licenseNotes}

${
  analysis.licenseNotes.length > 0
    ? bullets(analysis.licenseNotes)
    : x.defaultLicenseNote
}
`,
    },
    {
      path: "context/references.md",
      content: `# ${x.referencesTitle}

> ${x.referencesIntro}

${
  analysis.openSourceReferences.length > 0
    ? `## ${x.openSourceRefs}\n\n${analysis.openSourceReferences
        .map((r) => `- [${r.name}](${r.url}) — ${r.description}`)
        .join("\n")}\n`
    : ""
}
## ${x.collectedSources(Math.min(sources.length, 30))}

${
  sources.length > 0
    ? sources
        .slice(0, 30)
        .map((s) => `- \`${s.sourceType}\` [${s.title}](${s.url})`)
        .join("\n")
    : x.noSources
}

${
  analysis.similarServices.length > 0
    ? `## ${x.similarServices}\n\n${analysis.similarServices.map((s) => `- **${s.name}**: ${s.description}`).join("\n")}`
    : ""
}
`,
    },
  ];

  if (analysis.designGuidelines?.length) {
    files.push({
      path: "context/design-guidelines.md",
      content: `# ${x.designTitle}

> ${x.designIntro}

${bullets(analysis.designGuidelines)}
`,
    });
  }

  if (input.attachments?.projects?.length) {
    files.push({
      path: "context/local-projects.md",
      content: `# ${x.localProjectsTitle}

> ${x.localProjectsIntro.split("\n").join("\n> ")}

${input.attachments.projects
  .map(
    (p) => `## ${p.name}

- ${k.memory.path}: \`${p.path}\`
- ${x.files}: ${p.fileCount.toLocaleString("en-US")}${p.languages.length > 0 ? ` · ${p.languages.join(", ")}` : ""}${
      p.truncated ? ` · ${x.partiallyScanned}` : ""
    }

${p.tree ? `### ${x.directoryTree}\n\n\`\`\`\n${p.tree}\n\`\`\`` : ""}

${p.manifests.map((m) => `### \`${m.file}\`\n\n\`\`\`\n${m.excerpt}\n\`\`\``).join("\n\n")}

${p.readme ? `### ${x.readmeExcerpt}\n\n\`\`\`markdown\n${p.readme}\n\`\`\`` : ""}`
  )
  .join("\n\n---\n\n")}
`,
    });
  }

  if (teardown) {
    files.push({
      path: "context/teardown.md",
      content: `# ${x.teardownTitle}

## ${x.analysisTarget}

**${teardown.target.product}** — ${teardown.target.oneLine}

## ${x.newConcept}: ${teardown.leapfrog.conceptName}

${teardown.leapfrog.thesis}

${x.positioning}: ${teardown.leapfrog.positioning}

## ${x.originalFaultLines}

${teardown.faultLines.map((f) => `### ${f.title} (${f.severity})\n\n- ${x.evidence}: ${f.evidence}\n- ${x.opportunity}: ${f.opportunity}`).join("\n\n")}

## ${x.differentiators}

${teardown.leapfrog.features
  .map((f) => `### ${f.name}\n\n${f.description}\n\n- ${x.originalWay}: ${f.originalApproach}\n- ${x.ourWay}: ${f.newApproach}`)
  .join("\n\n")}

## ${x.divergenceScore}

${teardown.divergence.score}/100 — ${teardown.divergence.verdict}

${teardown.divergence.legalNotes.length > 0 ? `### ${x.legalNote}\n\n${bullets(teardown.divergence.legalNotes)}` : ""}
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
  const k = kitStrings(input.language ?? DEFAULT_ANALYSIS_LANGUAGE);
  const files: ZipEntry[] = [
    { path: "README.md", content: renderReadme(pack, input, profile, k) },
    { path: profile.memoryFile, content: renderMemoryFile(pack, input, profile, k) },
    { path: "loop/GOAL.md", content: renderGoal(pack, input, k) },
    { path: "loop/PROGRESS.md", content: renderProgress(pack, k) },
    { path: "loop/RALPH.md", content: renderRalph(pack, profile, k) },
    { path: "loop/EVALUATOR.md", content: renderEvaluator(pack, k) },
    { path: "specs/INDEX.md", content: renderSpecIndex(pack, k) },
    ...pack.specs.map((spec) => ({ path: specFileName(spec), content: renderSpec(spec, k) })),
    ...renderContextFiles(pack, input, k),
    ...renderLoopScripts(pack, profile, k),
    ...profile.extras(pack, k),
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
        content: `# ${k.assets.title}\n\n${k.assets.intro}\n\n${attachments.images
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
