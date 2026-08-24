/**
 * LLM-powered analysis and Markdown plan generation
 */
import { invokeLLM, type MessageContent, type ResponseFormat } from "./_core/llm";
import { collectAllSources, type SourceItem } from "./collector";
import { isEmptyAttachments, type IdeaAttachments } from "@shared/attachments";
import {
  insertResearchSources,
  getResearchSources,
  upsertResearchPlan,
  createResearch,
  getUserResearches,
} from "./db";
import { type DesktopActivity } from "../drizzle/schema";

export interface AnalysisResult {
  coreTechnologies: string[];
  openSourceReferences: Array<{ name: string; url: string; description: string }>;
  similarServices: Array<{ name: string; description: string }>;
  implementationDifficulty: "초급" | "중급" | "고급" | "전문가";
  difficultyReason: string;
  licenseNotes: string[];
  techStack: {
    frontend: string[];
    backend: string[];
    ai: string[];
    database: string[];
    deployment: string[];
  };
  coreFeatures: string[];
  developmentPhases: Array<{ phase: string; duration: string; tasks: string[] }>;
  risks: Array<{ risk: string; mitigation: string }>;
  summary: string;
  /** Present only when the user attached UI reference images. */
  designGuidelines?: string[];
}

/** Per-document prompt budget — a 200k-char spec would blow the context window. */
const DOC_PROMPT_CHAR_LIMIT = 24_000;
const DOCS_PROMPT_CHAR_BUDGET = 60_000;

/**
 * Renders attached `.md` documents into a prompt block, truncating so a large
 * attachment can never crowd out the collected sources.
 */
export function buildDocsPromptBlock(attachments?: IdeaAttachments | null): string {
  if (!attachments?.docs?.length) return "";

  let remaining = DOCS_PROMPT_CHAR_BUDGET;
  const blocks: string[] = [];

  for (const doc of attachments.docs) {
    if (remaining <= 0) break;
    const limit = Math.min(DOC_PROMPT_CHAR_LIMIT, remaining);
    const body = doc.content.length > limit ? `${doc.content.slice(0, limit)}\n\n…(이하 생략)` : doc.content;
    remaining -= body.length;
    blocks.push(`### 첨부 문서: ${doc.name}\n\`\`\`markdown\n${body}\n\`\`\``);
  }

  return [
    "",
    "## 사용자가 첨부한 기획/요구사항 문서",
    "아래 문서는 사용자가 직접 제공한 것으로, 수집된 외부 소스보다 **우선순위가 높습니다.**",
    "여기 명시된 요구사항, 범위, 제약, 용어는 반드시 계획에 반영하세요.",
    ...blocks,
  ].join("\n");
}

/** Per-project prompt budget — a monorepo summary must not crowd out everything else. */
const PROJECT_PROMPT_CHAR_LIMIT = 12_000;

/**
 * Renders the local project folders the user pointed at. These describe code that already
 * exists on their machine, so the plan must extend it rather than propose a green field.
 */
export function buildProjectsPromptBlock(attachments?: IdeaAttachments | null): string {
  if (!attachments?.projects?.length) return "";

  const blocks = attachments.projects.map((project) => {
    const parts = [
      `### 참고 프로젝트: ${project.name}`,
      `- 경로: \`${project.path}\``,
      `- 파일 수: ${project.fileCount}${project.truncated ? " (일부만 스캔)" : ""}`,
      project.languages.length > 0 ? `- 주요 언어: ${project.languages.join(", ")}` : "",
      project.tree ? `\n디렉터리 구조:\n\`\`\`\n${project.tree}\n\`\`\`` : "",
      ...project.manifests.map((m) => `\n\`${m.file}\`:\n\`\`\`\n${m.excerpt}\n\`\`\``),
      project.readme ? `\nREADME 발췌:\n\`\`\`markdown\n${project.readme}\n\`\`\`` : "",
    ].filter(Boolean);

    const text = parts.join("\n");
    return text.length > PROJECT_PROMPT_CHAR_LIMIT
      ? `${text.slice(0, PROJECT_PROMPT_CHAR_LIMIT)}\n…(생략)`
      : text;
  });

  return [
    "",
    "## 사용자가 지정한 기존 로컬 프로젝트",
    "아래는 사용자의 로컬 디스크에 **이미 존재하는 프로젝트**입니다. 새로 처음부터 만드는 계획이 아니라,",
    "이 코드베이스의 기술 스택·디렉터리 구조·명명 규칙·기존 의존성을 **그대로 이어받아 확장하는 계획**을 세우세요.",
    "이미 구현된 것을 다시 만들라고 제안하지 말고, 기존 자산을 어떻게 재사용할지 명시하세요.",
    ...blocks,
  ].join("\n");
}

/**
 * Attached screenshots/mockups are sent as image parts so the model can describe the
 * intended interface concretely instead of guessing a generic layout.
 */
function buildImageContentParts(attachments?: IdeaAttachments | null): MessageContent[] {
  if (!attachments?.images?.length) return [];

  return [
    {
      type: "text",
      text:
        "다음은 사용자가 첨부한 UI/디자인 참고 이미지입니다. 화면 구성, 레이아웃, 컴포넌트 구조, 색감/톤앤매너를 " +
        "이 이미지에 맞춰 설계하고, 그 지침을 designGuidelines 배열에 구체적으로 작성하세요.",
    } satisfies MessageContent,
    ...attachments.images.map(
      (img): MessageContent => ({
        type: "image_url",
        image_url: { url: img.dataUrl, detail: "high" },
      })
    ),
  ];
}

export async function analyzeWithLLM(
  keyword: string,
  sources: SourceItem[],
  apiKeys?: { geminiKey?: string; openaiKey?: string; customModel?: string },
  attachments?: IdeaAttachments | null
): Promise<AnalysisResult> {
  const githubSources = sources.filter((s) => s.sourceType === "github").slice(0, 5);
  const hfSources = sources.filter((s) => s.sourceType === "huggingface").slice(0, 5);
  const paperSources = sources.filter((s) => s.sourceType === "papers").slice(0, 4);
  const hnSources = sources.filter((s) => s.sourceType === "hackernews").slice(0, 4);

  const sourcesSummary = [
    "## GitHub 저장소",
    ...githubSources.map(
      (s) =>
        `- [${s.title}](${s.url}): ${s.description} (⭐ ${(s.metadata as Record<string, unknown>).stars ?? 0}, 언어: ${(s.metadata as Record<string, unknown>).language ?? "N/A"}, 라이선스: ${(s.metadata as Record<string, unknown>).license ?? "N/A"})`
    ),
    "\n## Hugging Face 모델/Space",
    ...hfSources.map(
      (s) =>
        `- [${s.title}](${s.url}): ${s.description} (다운로드: ${(s.metadata as Record<string, unknown>).downloads ?? 0}, 좋아요: ${(s.metadata as Record<string, unknown>).likes ?? 0})`
    ),
    "\n## 관련 논문 (Papers with Code)",
    ...paperSources.map(
      (s) =>
        `- [${s.title}](${s.url}): ${s.description.slice(0, 150)} (코드 유무: ${(s.metadata as Record<string, unknown>).hasCode ? "있음" : "없음"})`
    ),
    "\n## Hacker News 토론",
    ...hnSources.map(
      (s) =>
        `- [${s.title}](${s.url}) (포인트: ${(s.metadata as Record<string, unknown>).points ?? 0}, 댓글: ${(s.metadata as Record<string, unknown>).comments ?? 0})`
    ),
  ].join("\n");

  const docsBlock = buildDocsPromptBlock(attachments);
  const projectsBlock = buildProjectsPromptBlock(attachments);
  const imageParts = buildImageContentParts(attachments);
  const hasImages = imageParts.length > 0;

  const prompt = `당신은 시니어 풀스택 개발자이자 AI/ML 전문가입니다. 다음 리서치 결과를 바탕으로 "${keyword}" 앱 개발 계획을 분석해주세요.

수집된 소스:
${sourcesSummary}
${docsBlock}${projectsBlock}

다음 JSON 스키마에 맞게 분석 결과를 반환해주세요. 모든 내용은 한국어로 작성하세요:

{
  "coreTechnologies": ["핵심 기술 목록 (최대 8개)"],
  "openSourceReferences": [
    {"name": "프로젝트명", "url": "URL", "description": "간단 설명"}
  ],
  "similarServices": [
    {"name": "서비스명", "description": "간단 설명"}
  ],
  "implementationDifficulty": "초급|중급|고급|전문가",
  "difficultyReason": "난이도 판단 이유",
  "licenseNotes": ["라이선스 주의사항 목록"],
  "techStack": {
    "frontend": ["추천 프론트엔드 기술"],
    "backend": ["추천 백엔드 기술"],
    "ai": ["추천 AI/ML 기술"],
    "database": ["추천 데이터베이스"],
    "deployment": ["추천 배포 플랫폼"]
  },
  "coreFeatures": ["핵심 기능 목록 (최대 8개)"],
  "developmentPhases": [
    {"phase": "1단계: 기획 및 환경 설정", "duration": "1-2주", "tasks": ["세부 작업 목록"]}
  ],
  "risks": [
    {"risk": "리스크 내용", "mitigation": "대응 방안"}
  ],
  "summary": "전체 프로젝트 요약 (3-4문장)"${
    hasImages
      ? `,
  "designGuidelines": ["첨부된 참고 이미지에서 도출한 구체적인 UI/디자인 지침 (화면 구조, 주요 컴포넌트, 색상/타이포/톤앤매너, 인터랙션 등 최대 8개)"]`
      : ""
  }
}`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "당신은 시니어 풀스택 개발자이자 AI/ML 전문가입니다. 항상 유효한 JSON만 반환하세요.",
      },
      { role: "user", content: hasImages ? [prompt, ...imageParts] : prompt },
    ],
    response_format: { type: "json_object" } as ResponseFormat,
    ...apiKeys,
  });

  const rawContent = response.choices?.[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : "{}";
  try {
    return JSON.parse(content) as AnalysisResult;
  } catch {
    return getDefaultAnalysis(keyword);
  }
}

function getDefaultAnalysis(keyword: string): AnalysisResult {
  return {
    coreTechnologies: ["React", "Node.js", "REST API"],
    openSourceReferences: [],
    similarServices: [],
    implementationDifficulty: "중급",
    difficultyReason: "분석 중 오류가 발생했습니다.",
    licenseNotes: [],
    techStack: {
      frontend: ["React", "TypeScript"],
      backend: ["Node.js", "Express"],
      ai: ["OpenAI API"],
      database: ["PostgreSQL"],
      deployment: ["Vercel"],
    },
    coreFeatures: [`${keyword} 관련 핵심 기능`],
    developmentPhases: [
      { phase: "1단계: 기획", duration: "1주", tasks: ["요구사항 정의"] },
    ],
    risks: [{ risk: "기술 불확실성", mitigation: "프로토타입 우선 개발" }],
    summary: `${keyword} 앱 개발 계획입니다.`,
  };
}

/**
 * Normalizes a (possibly partial / LLM-malformed) analysis object by filling in
 * any missing fields with safe defaults. LLM JSON output is untrusted and may omit
 * fields even when it parses successfully, so every array/object access in
 * generateMarkdown must be guaranteed to exist.
 */
function normalizeAnalysis(
  keyword: string,
  analysis: Partial<AnalysisResult> | null | undefined
): AnalysisResult {
  const defaults = getDefaultAnalysis(keyword);
  const a = analysis ?? {};
  return {
    coreTechnologies: a.coreTechnologies ?? defaults.coreTechnologies,
    openSourceReferences: a.openSourceReferences ?? defaults.openSourceReferences,
    similarServices: a.similarServices ?? defaults.similarServices,
    implementationDifficulty: a.implementationDifficulty ?? defaults.implementationDifficulty,
    difficultyReason: a.difficultyReason ?? defaults.difficultyReason,
    licenseNotes: a.licenseNotes ?? defaults.licenseNotes,
    techStack: {
      frontend: a.techStack?.frontend ?? defaults.techStack.frontend,
      backend: a.techStack?.backend ?? defaults.techStack.backend,
      ai: a.techStack?.ai ?? defaults.techStack.ai,
      database: a.techStack?.database ?? defaults.techStack.database,
      deployment: a.techStack?.deployment ?? defaults.techStack.deployment,
    },
    coreFeatures: a.coreFeatures ?? defaults.coreFeatures,
    developmentPhases: a.developmentPhases ?? defaults.developmentPhases,
    risks: a.risks ?? defaults.risks,
    summary: a.summary ?? defaults.summary,
    designGuidelines: Array.isArray(a.designGuidelines) ? a.designGuidelines : undefined,
  };
}

export function generateMarkdown(
  keyword: string,
  rawAnalysis: AnalysisResult,
  sources: SourceItem[],
  attachments?: IdeaAttachments | null
): string {
  const analysis = normalizeAnalysis(keyword, rawAnalysis);
  const now = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const githubSources = sources.filter((s) => s.sourceType === "github").slice(0, 8);
  const hfSources = sources.filter((s) => s.sourceType === "huggingface").slice(0, 6);
  const paperSources = sources.filter((s) => s.sourceType === "papers").slice(0, 6);
  const hnSources = sources.filter((s) => s.sourceType === "hackernews").slice(0, 5);

  const difficultyEmoji = {
    초급: "🟢",
    중급: "🟡",
    고급: "🟠",
    전문가: "🔴",
  }[analysis.implementationDifficulty] ?? "🟡";

  return `# 앱 개발 계획서: ${keyword}

> 생성일: ${now}  
> BuildPlanner로 자동 생성된 리서치 기반 개발 계획서입니다.

---

## 1. 아이디어 개요

${analysis.summary}

### 구현 난이도

${difficultyEmoji} **${analysis.implementationDifficulty}** — ${analysis.difficultyReason}

---

## 2. 조사 키워드

- 주요 키워드: \`${keyword}\`
- 수집 소스: GitHub (${githubSources.length}개), Hugging Face (${hfSources.length}개), Papers with Code (${paperSources.length}개), Hacker News (${hnSources.length}개)
- 총 수집 소스: ${sources.length}개

---

## 3. 참고 오픈소스

${
  analysis.openSourceReferences.length > 0
    ? analysis.openSourceReferences
        .map((r) => `### [${r.name}](${r.url})\n${r.description}`)
        .join("\n\n")
    : githubSources
        .map(
          (s) =>
            `### [${s.title}](${s.url})\n${s.description || "설명 없음"}\n- ⭐ Stars: ${(s.metadata as Record<string, unknown>).stars ?? 0} | 언어: ${(s.metadata as Record<string, unknown>).language ?? "N/A"} | 라이선스: ${(s.metadata as Record<string, unknown>).license ?? "N/A"}`
        )
        .join("\n\n")
}

---

## 4. 참고 AI 모델

${
  hfSources.length > 0
    ? hfSources
        .map(
          (s) =>
            `### [${s.title}](${s.url})\n${s.description}\n- 다운로드: ${(s.metadata as Record<string, unknown>).downloads ?? 0} | 좋아요: ${(s.metadata as Record<string, unknown>).likes ?? 0}`
        )
        .join("\n\n")
    : "_관련 AI 모델을 찾지 못했습니다._"
}

---

## 5. 관련 논문/기술

${
  paperSources.length > 0
    ? paperSources
        .map(
          (s) =>
            `### [${s.title}](${s.url})\n${s.description}\n- 코드 유무: ${(s.metadata as Record<string, unknown>).hasCode ? "✅ 있음" : "❌ 없음"} | GitHub Stars: ${(s.metadata as Record<string, unknown>).stars ?? 0}`
        )
        .join("\n\n")
    : "_관련 논문을 찾지 못했습니다._"
}

---

## 6. 핵심 기능

${analysis.coreFeatures.map((f, i) => `${i + 1}. ${f}`).join("\n")}

---

## 7. 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | ${analysis.techStack.frontend.join(", ")} |
| Backend | ${analysis.techStack.backend.join(", ")} |
| AI/ML | ${analysis.techStack.ai.join(", ")} |
| Database | ${analysis.techStack.database.join(", ")} |
| Deployment | ${analysis.techStack.deployment.join(", ")} |

### 핵심 기술

${analysis.coreTechnologies.map((t) => `- ${t}`).join("\n")}

---

## 8. 화면 구성

> LLM 분석 기반 추천 화면 구성입니다.

1. **메인 화면** — 키워드 입력 및 리서치 시작
2. **리서치 결과 화면** — 수집된 소스 탭별 표시 (GitHub / HF / Papers / HN)
3. **분석 요약 화면** — LLM 분석 결과 및 핵심 인사이트
4. **계획서 화면** — Markdown 계획서 미리보기 및 다운로드
5. **히스토리 화면** — 과거 리서치 목록 및 계획서 조회
${
  analysis.designGuidelines && analysis.designGuidelines.length > 0
    ? `
### 🎨 디자인 지침 (첨부 이미지 기반)

${analysis.designGuidelines.map((g) => `- ${g}`).join("\n")}
`
    : ""
}
---

## 9. 개발 단계

${analysis.developmentPhases
  .map(
    (p) =>
      `### ${p.phase} (${p.duration})\n\n${p.tasks.map((t) => `- [ ] ${t}`).join("\n")}`
  )
  .join("\n\n")}

---

## 10. 리스크와 라이선스 검토

### 리스크 항목

${analysis.risks.map((r) => `#### ⚠️ ${r.risk}\n- 대응 방안: ${r.mitigation}`).join("\n\n")}

### 라이선스 주의사항

${
  analysis.licenseNotes.length > 0
    ? analysis.licenseNotes.map((n) => `- ${n}`).join("\n")
    : "- 수집된 오픈소스의 라이선스를 개별적으로 확인하세요.\n- MIT, Apache 2.0은 상업적 사용 가능하나, GPL은 소스코드 공개 의무가 있습니다."
}

---

## 11. 커뮤니티 반응 (Hacker News)

${
  hnSources.length > 0
    ? hnSources
        .map(
          (s) =>
            `- [${s.title}](${s.url}) — 포인트: ${(s.metadata as Record<string, unknown>).points ?? 0}, 댓글: ${(s.metadata as Record<string, unknown>).comments ?? 0}`
        )
        .join("\n")
    : "_관련 HN 토론을 찾지 못했습니다._"
}

---

## 12. 유사 서비스

${
  analysis.similarServices.length > 0
    ? analysis.similarServices.map((s) => `- **${s.name}**: ${s.description}`).join("\n")
    : "_유사 서비스 정보를 분석하지 못했습니다._"
}
${renderAttachmentsSection(attachments)}
---

*이 계획서는 BuildPlanner에 의해 자동 생성되었습니다. 실제 개발 시 추가적인 검토와 조정이 필요합니다.*
`;
}

/**
 * Records what the user handed in, so a downloaded plan states which reference
 * material it was written against. Only names are listed: `markdownContent` is a MySQL
 * TEXT column (64KB), so an inlined base64 image would overflow the row.
 */
function renderAttachmentsSection(attachments?: IdeaAttachments | null): string {
  if (isEmptyAttachments(attachments)) return "";
  const source = attachments as IdeaAttachments;
  // A row stored before a field existed omits it entirely; fill the gaps before rendering.
  const a: IdeaAttachments = {
    docs: source.docs ?? [],
    images: source.images ?? [],
    projects: source.projects ?? [],
  };

  const docs =
    a.docs.length > 0
      ? `### 📄 참고 문서 (.md)\n\n${a.docs
          .map((d) => `- \`${d.name}\` (${d.content.length.toLocaleString("ko-KR")}자)`)
          .join("\n")}`
      : "";

  const images =
    a.images.length > 0
      ? `### 🖼️ 참고 이미지 (인터페이스/디자인)\n\n${a.images
          .map((img) => `- \`${img.name}\` (${img.mimeType}) — 디자인 지침에 반영됨`)
          .join("\n")}`
      : "";

  const projects =
    a.projects.length > 0
      ? `### 📁 참고 로컬 프로젝트\n\n> 이 계획은 아래 기존 코드베이스를 이어받는 것을 전제로 작성되었습니다.\n\n${a.projects
          .map(
            (p) =>
              `#### ${p.name}\n\n- 경로: \`${p.path}\`\n- 파일 ${p.fileCount.toLocaleString("ko-KR")}개${
                p.languages.length > 0 ? ` · ${p.languages.join(", ")}` : ""
              }${p.truncated ? " · 일부만 스캔됨" : ""}${
                p.tree ? `\n\n<details><summary>디렉터리 구조</summary>\n\n\`\`\`\n${p.tree}\n\`\`\`\n\n</details>` : ""
              }`
          )
          .join("\n\n")}`
      : "";

  return `
---

## 13. 첨부 참고 자료

> 사용자가 직접 첨부한 자료이며, 위 계획은 이 자료를 우선 반영해 작성되었습니다.

${[projects, docs, images].filter(Boolean).join("\n\n")}
`;
}

export async function updatePlanWithLLM(
  keyword: string,
  sources: SourceItem[],
  existingAnalysis: AnalysisResult,
  instruction: string,
  apiKeys?: { geminiKey?: string; openaiKey?: string; customModel?: string }
): Promise<AnalysisResult> {
  const githubSources = sources.filter((s) => s.sourceType === "github").slice(0, 5);
  const hfSources = sources.filter((s) => s.sourceType === "huggingface").slice(0, 5);
  const paperSources = sources.filter((s) => s.sourceType === "papers").slice(0, 4);

  const sourcesSummary = [
    "## GitHub 저장소",
    ...githubSources.map(
      (s) =>
        `- [${s.title}](${s.url}): ${s.description} (⭐ ${(s.metadata as Record<string, unknown>).stars ?? 0}, 언어: ${(s.metadata as Record<string, unknown>).language ?? "N/A"})`
    ),
    "\n## Hugging Face 모델/Space",
    ...hfSources.map(
      (s) =>
        `- [${s.title}](${s.url}): ${s.description} (다운로드: ${(s.metadata as Record<string, unknown>).downloads ?? 0})`
    ),
    "\n## 관련 논문 (Papers with Code)",
    ...paperSources.map(
      (s) =>
        `- [${s.title}](${s.url}): ${s.description.slice(0, 150)}`
    ),
  ].join("\n");

  const prompt = `당신은 시니어 풀스택 개발자이자 AI/ML 전문가입니다. 
다음은 "${keyword}" 앱 개발에 대해 이전에 작성한 분석 결과(JSON)와 수집된 소스들입니다.

이전 분석 결과:
${JSON.stringify(existingAnalysis, null, 2)}

수집된 소스들:
${sourcesSummary}

사용자가 다음 수정/추가 요청 사항을 보냈습니다:
"${instruction}"

이 요청 사항을 반영하여 이전 분석 결과를 업데이트해 주세요. 요청에 맞춰 기술 스택 변경, 기능 추가/수정, 난이도 조절, 리스크 추가 등을 수행해야 합니다.
반드시 아래 스키마에 부합하는 업데이트된 분석 결과 JSON 객체만 반환해 주세요. 모든 내용은 한국어로 작성하세요.

JSON 스키마:
{
  "coreTechnologies": ["핵심 기술 목록 (최대 8개)"],
  "openSourceReferences": [
    {"name": "프로젝트명", "url": "URL", "description": "간단 설명"}
  ],
  "similarServices": [
    {"name": "서비스명", "description": "간단 설명"}
  ],
  "implementationDifficulty": "초급|중급|고급|전문가",
  "difficultyReason": "난이도 판단 이유",
  "licenseNotes": ["라이선스 주의사항 목록"],
  "techStack": {
    "frontend": ["추천 프론트엔드 기술"],
    "backend": ["추천 백엔드 기술"],
    "ai": ["추천 AI/ML 기술"],
    "database": ["추천 데이터베이스"],
    "deployment": ["추천 배포 플랫폼"]
  },
  "coreFeatures": ["핵심 기능 목록 (최대 8개)"],
  "developmentPhases": [
    {"phase": "단계명", "duration": "기간", "tasks": ["세부 작업 목록"]}
  ],
  "risks": [
    {"risk": "리스크 내용", "mitigation": "대응 방안"}
  ],
  "summary": "전체 프로젝트 요약"
}`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "당신은 시니어 풀스택 개발자이자 AI/ML 전문가입니다. 항상 요청된 수정사항을 반영한 유효한 JSON만 반환하세요.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" } as ResponseFormat,
    ...apiKeys,
  });

  const rawContent = response.choices?.[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : "{}";
  try {
    return JSON.parse(content) as AnalysisResult;
  } catch {
    return existingAnalysis;
  }
}

export async function extractSearchKeyword(
  rawInput: string,
  apiKeys?: { geminiKey?: string; openaiKey?: string; customModel?: string }
): Promise<string> {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) return "";
  // If input is short (<= 2 words) and contains no Korean characters, search directly
  if (trimmed.split(/\s+/).length <= 2 && !/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(trimmed)) {
    return trimmed;
  }

  const prompt = `당신은 시니어 개발자이자 기술 연구원입니다. 
다음은 사용자가 개발하고자 하는 앱 아이디어에 대한 자연어 설명입니다:
"${trimmed}"

이 설명을 바탕으로, GitHub, Hugging Face, Papers with Code와 같은 글로벌 기술 및 오픈소스 플랫폼에서 가장 관련성이 높고 검색 결과가 풍부하게 잘 나올 수 있는 대표적인 "단일 영문 검색 키워드(또는 최대 3단어 이하의 영문 명사구)" 딱 하나만 추출하거나 생성해서 반환해 주세요.

주의사항:
1. 부연 설명, 마크다운(예: 따옴표나 백틱), 서론/결론 없이 오직 추출된 영문 키워드 문자열만 반환해 주세요.
2. 예시: 
   - 입력: "Vercel에 배포하는 AI 이미지 업스케일러 웹앱" -> 출력: "AI image upscaler"
   - 입력: "나는 실시간 음성 번역 및 음성 합성 앱을 만들고 싶어" -> 출력: "voice translation"
   - 입력: "로컬에서 완벽하게 돌아가는 LLM 채팅 클라이언트" -> 출력: "local llm chat"
3. 만약 도저히 키워드를 찾지 못하겠거나 오류가 발생하면 원본 입력 내용을 핵심만 영문화하여 최대한 간결하게 반환해 주세요.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "당신은 기술 키워드 추출 전문가입니다. 항상 추가 텍스트 없이 정제된 영어 검색 키워드 하나만 반환하세요.",
        },
        { role: "user", content: prompt },
      ],
      ...apiKeys,
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : "";
    if (content) {
      // Clean quotes
      return content.replace(/['"`]/g, "");
    }
  } catch (err) {
    console.error("[Analyzer] Failed to extract search keyword:", err);
  }

  return trimmed;
}

export async function runIncrementalAnalysisPipeline(
  researchId: number,
  keyword: string,
  oldPlan: { analysisJson: any; markdownContent: string | null } | null,
  apiKeys?: { geminiKey?: string; openaiKey?: string; customModel?: string },
  /**
   * Overrides report rendering. Teardown projects pass their own renderer so a scheduled
   * refresh does not replace the teardown report with the keyword-mode template.
   */
  renderMarkdown?: (analysis: AnalysisResult, sources: SourceItem[]) => string,
  /** The user's original `.md` / image references, so a refresh keeps honouring them. */
  attachments?: IdeaAttachments | null
): Promise<void> {
  console.log(`[Research] Starting incremental analysis pipeline for research ID ${researchId}...`);

  // 1. Extract refined keyword
  const searchKeyword = await extractSearchKeyword(keyword, apiKeys);
  console.log(`[Research] Extracted search keyword for "${keyword}": "${searchKeyword}"`);

  // 2. Collect current sources from APIs
  const freshSources = await collectAllSources(searchKeyword);

  // 3. Fetch existing sources from DB
  const existingSources = await getResearchSources(researchId);
  const existingUrls = new Set(existingSources.map((s) => s.url));

  // 4. Filter new sources (delta)
  const newSources = freshSources.filter((s) => !existingUrls.has(s.url));

  if (newSources.length === 0) {
    console.log("[Research] No new R&D sources found. Skipping AI plan update to save costs.");
    return;
  }

  console.log(`[Research] Found ${newSources.length} new sources. Merging and updating build plan...`);

  // 5. Insert new sources to DB
  await insertResearchSources(
    newSources.map((s) => ({
      researchId,
      sourceType: s.sourceType,
      title: s.title,
      url: s.url,
      description: s.description,
      score: s.score,
      metadata: s.metadata,
    }))
  );

  // 6. Fetch fully merged sources
  const mergedSources = await getResearchSources(researchId);
  const mappedSources: SourceItem[] = mergedSources.map((s) => ({
    sourceType: s.sourceType,
    title: s.title,
    url: s.url,
    description: s.description ?? "",
    score: s.score ?? 0,
    metadata: (s.metadata as Record<string, unknown>) ?? {},
  }));

  // 7. Perform incremental analysis using LLM
  let updatedAnalysis: AnalysisResult;
  if (oldPlan && oldPlan.analysisJson) {
    const instruction = "이전 분석 결과 작성 이후 새롭게 업데이트되거나 추가로 발견된 R&D 정보가 수집되었습니다. 기존 빌드 계획서에 신규 소스의 아키텍처적 가치, 기술 변경 사항, 그리고 기능적 델타를 통합하여 업데이트해 주세요.";
    updatedAnalysis = await updatePlanWithLLM(
      keyword,
      mappedSources,
      oldPlan.analysisJson as AnalysisResult,
      instruction,
      apiKeys
    );
  } else {
    // Fallback to full analysis if old plan doesn't exist
    updatedAnalysis = await analyzeWithLLM(keyword, mappedSources, apiKeys, attachments);
  }

  // The incremental prompt does not ask for designGuidelines, so carry the ones derived
  // from the attached reference images forward instead of losing them on every refresh.
  if (!updatedAnalysis.designGuidelines?.length) {
    const previous = (oldPlan?.analysisJson as AnalysisResult | null)?.designGuidelines;
    if (previous?.length) updatedAnalysis.designGuidelines = previous;
  }

  // 8. Generate Markdown
  const markdown = renderMarkdown
    ? renderMarkdown(updatedAnalysis, mappedSources)
    : generateMarkdown(keyword, updatedAnalysis, mappedSources, attachments);

  // 9. Save updated plan
  await upsertResearchPlan({
    researchId,
    analysisJson: updatedAnalysis,
    markdownContent: markdown,
  });

  console.log(`[Research] Successfully updated build plan for research ID ${researchId}.`);
}

export interface WeeklyProposalResult {
  diagnosis: string;
  proposals: Array<{
    title: string;
    keyword: string;
    reason: string;
    difficulty: "초급" | "중급" | "고급" | "전문가";
    features: string[];
  }>;
}

export async function generateProposalDetailWithLLM(
  prop: { title: string; keyword: string; reason: string; difficulty: string; features: string[] },
  apiKeys?: { geminiKey?: string; openaiKey?: string; customModel?: string }
): Promise<AnalysisResult> {
  const prompt = `당신은 시니어 소프트웨어 아키텍트이자 기술 연구원입니다. 다음 생산성 도구 제안을 바탕으로 실제 구체적인 구현을 위한 상세 기술 스택 분석 및 개발 계획(JSON)을 설계해 주세요.

제안 앱 정보:
- 제목: ${prop.title}
- 키워드: ${prop.keyword}
- 제안 이유: ${prop.reason}
- 난이도: ${prop.difficulty}
- 핵심 기능: ${prop.features.join(", ")}

다음 JSON 스키마에 맞게 정교하고 실제적인 아키텍처 분석 결과를 반환해주세요. 모든 기술 스택 및 개발 단계는 임의의 샘플이 아니라, 이 도구의 고유 성격과 기능 요구사항에 적합하게 구체적으로 설계해 작성해야 합니다. 모든 텍스트는 한국어로 작성하세요:

{
  "coreTechnologies": ["핵심 기술/라이브러리/프레임워크 목록 (예: PyAutoGUI, Electron, sqlite3 등, 최대 8개)"],
  "openSourceReferences": [
    {"name": "참고할 만한 유사/대표 깃허브 오픈소스 프로젝트명", "url": "깃허브 주소", "description": "해당 오픈소스에서 아키텍처적으로 어떤 부분을 참고해야 하는지 기술적인 설명"}
  ],
  "similarServices": [
    {"name": "유사 제품/기존 서비스명", "description": "해당 서비스와의 기술적인 차별점 및 기획적 가치"}
  ],
  "implementationDifficulty": "${prop.difficulty}",
  "difficultyReason": "해당 난이도를 판단한 구체적인 기술적 한계 및 개발 난점",
  "licenseNotes": ["라이선스 검토 및 주의할 주의사항 목록 (예: MIT 라이선스 준수 등)"],
  "techStack": {
    "frontend": ["추천 프론트엔드/UI 프레임워크"],
    "backend": ["추천 백엔드/런타임 기술"],
    "ai": ["추천 AI 모델/API (필요할 경우 기술, 없을 시 빈 배열)"],
    "database": ["추천 데이터베이스/로컬 스토리지"],
    "deployment": ["추천 배포/패키징 방식 (예: Executable 빌드, 서비스 백그라운드 등록 등)"]
  },
  "coreFeatures": ["구현해야 할 구체적인 핵심 기능 상세 설명 목록 (최대 8개)"],
  "developmentPhases": [
    {"phase": "1단계: 기획 및 기술 검증 (PoC)", "duration": "3-5일", "tasks": ["PoC 범위 설정 및 기본 구조 설계"]},
    {"phase": "2단계: 핵심 기능 엔진 개발", "duration": "1주", "tasks": ["핵심 로깅/수집 및 자동화 모듈 구현"]},
    {"phase": "3단계: 사용자 인터페이스(UI) 연동", "duration": "1주", "tasks": ["UI 구성 및 API 통신 연동"]},
    {"phase": "4단계: 안정성 테스트 및 패키징", "duration": "3-5일", "tasks": ["패키지 빌드 및 예외 처리 고도화"]}
  ],
  "risks": [
    {"risk": "발생할 수 있는 아키텍처적 리스크", "mitigation": "구체적인 기술적 우회 방안 및 완화 조치"}
  ],
  "summary": "이 도구를 실제 개발하여 워크플로우에 적용할 때의 기대 효율 향상 및 개발 생산성 개선 요약 (3-4문장)"
}
`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "당신은 실력 있는 소프트웨어 아키텍트입니다. 항상 스키마에 맞는 완벽하고 실질적인 JSON만 반환하세요." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" } as ResponseFormat,
      ...apiKeys,
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : "{}";
    return JSON.parse(content) as AnalysisResult;
  } catch (err) {
    console.error("[Analyzer] Failed to generate proposal detail via LLM, falling back to mock:", err);
    return {
      coreTechnologies: [prop.keyword],
      openSourceReferences: [],
      similarServices: [],
      implementationDifficulty: prop.difficulty as any,
      difficultyReason: prop.reason,
      licenseNotes: ["개인 개발 유틸리티이므로 라이선스로부터 자유로움"],
      techStack: {
        frontend: ["React", "Electron"],
        backend: ["Node.js"],
        ai: [],
        database: [],
        deployment: [],
      },
      coreFeatures: prop.features,
      developmentPhases: [
        { phase: "1단계: MVP 개발", duration: "1주", tasks: prop.features },
      ],
      risks: [],
      summary: prop.reason,
    };
  }
}

export async function generateWeeklyAppProposals(
  userId: number,
  activities: DesktopActivity[],
  apiKeys?: { geminiKey?: string; openaiKey?: string; customModel?: string }
): Promise<WeeklyProposalResult> {
  console.log(`[Research] Starting weekly app proposals generation for user ID ${userId} with ${activities.length} logs...`);

  if (activities.length === 0) {
    return {
      diagnosis: "이번 주 수집된 작업 활동 로그가 충분하지 않습니다. 로컬 작업 모니터링 스크립트를 먼저 가동해 주세요.",
      proposals: [],
    };
  }

  // 1. Group and summarize logs to fit in context window
  const processDurations: Record<string, number> = {};
  const sampleTitles: Record<string, Set<string>> = {};

  for (const act of activities) {
    processDurations[act.processName] = (processDurations[act.processName] || 0) + act.duration;
    if (!sampleTitles[act.processName]) sampleTitles[act.processName] = new Set();
    if (sampleTitles[act.processName].size < 5 && act.windowTitle && act.windowTitle !== "Unknown Window") {
      sampleTitles[act.processName].add(act.windowTitle.slice(0, 100));
    }
  }

  const sortedProcesses = Object.entries(processDurations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const summaryText = sortedProcesses
    .map(([process, duration]) => {
      const minutes = Math.round(duration / 60);
      const titles = Array.from(sampleTitles[process] || []).map(t => `- ${t}`).join("\n");
      return `### 프로세스: ${process} (약 ${minutes}분 사용)\n관련 창 제목:\n${titles}`;
    })
    .join("\n\n");

  const prompt = `당신은 생산성 전문가이자 수석 소프트웨어 아키텍트입니다. 다음은 개발자가 지난 일주일 동안 컴퓨터를 사용하며 수행한 작업 활동 로그의 요약본입니다:

${summaryText}

사용자의 작업 형태, 자주 사용하는 프로세스, 코딩/문서작성/브라우징 비중을 파악하여:
1. 사용자가 이번 주에 겪었을 법한 생산성 병목(시간 낭비 요인, 단순 반복 수동 작업)을 한국어로 분석(Diagnosis)해주세요.
2. 이 병목을 자동화하거나 해결하기 위해 **새로 직접 개발해 사용하면 업무 효율을 극대화할 수 있는 맞춤형 유틸리티/소프트웨어 아이디어 3종**을 한국어로 기획해주세요.

다음 JSON 스키마에 부합하게 분석 결과를 반환해주세요. 다른 텍스트는 절대 작성하지 말고 유효한 JSON 객체만 반환하세요:

{
  "diagnosis": "사용자의 작업 병목 및 시간 낭비 요인 진단 (3-4문장)",
  "proposals": [
    {
      "title": "추천 앱/도구 제목 (예: 로컬 마크다운 이미지 자동 업로더)",
      "keyword": "대표적인 영문 검색 키워드 (예: markdown image uploader)",
      "reason": "사용자의 이번 주 활동 로그 중 어떤 병목 때문에 이 도구를 추천하는지 상세한 설명",
      "difficulty": "초급|중급|고급|전문가",
      "features": ["핵심 기능 1", "핵심 기능 2", "핵심 기능 3"]
    }
  ]
}
`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "당신은 생산성 전문가이자 소프트웨어 아키텍트입니다. 항상 정해진 스키마의 JSON만 반환하세요." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" } as ResponseFormat,
      ...apiKeys,
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : "{}";
    const result = JSON.parse(content) as WeeklyProposalResult;

    // 2. Automatically seed the researches & research_plans database with these proposals
    if (result.proposals && result.proposals.length > 0) {
      const userResearches = await getUserResearches(userId);
      for (const prop of result.proposals) {
        const propTitle = `[AI 제안] ${prop.title}`;
        const existing = userResearches.find(r => r.keyword === propTitle);
        if (existing) continue;

        // Create a research project representing this proposal
        const researchId = await createResearch({
          userId,
          keyword: propTitle,
          status: "done",
        });

        // Actually generate dynamic analysis and plans based on the proposal
        const analysisJson = await generateProposalDetailWithLLM(prop, apiKeys);
        const initialPlanText = generateMarkdown(propTitle, analysisJson, []);

        await upsertResearchPlan({
          researchId,
          analysisJson,
          markdownContent: initialPlanText,
        });
      }
    }

    return result;
  } catch (err: any) {
    console.error("[Analyzer] Failed to generate weekly app proposals:", err);
    return {
      diagnosis: `분석 과정에서 오류가 발생했습니다: ${err.message}`,
      proposals: [],
    };
  }
}
