/**
 * Teardown mode — reverse-engineer an existing product into a superior new design.
 *
 * The chain is deliberately split into four LLM calls rather than one. Asked in a single
 * shot, a model reliably collapses to "build something similar with extra features". Each
 * stage here constrains the next:
 *
 *   A. principles  — reduce the product to operating mechanisms, not a feature list
 *   B. fault lines — find where those mechanisms strain (this is where the leap comes from)
 *   C. leapfrog    — re-solve the same problem, forbidden from reusing the original path
 *   D. divergence  — audit the result for imitation, regenerate once if too derivative
 *
 * Only publicly available information is analysed, and stage D exists partly to keep the
 * output on the safe side of the idea/expression line.
 */
import { invokeLLM, type ResponseFormat } from "./_core/llm";
import { type SourceItem } from "./collector";
import { type AnalysisResult } from "./analyzer";

export interface TeardownPrinciple {
  name: string;
  mechanism: string;
  whyItWorks: string;
  evidence: string;
}

export interface FaultLine {
  category: "시대적 타협" | "사용자 불만" | "구조적 한계" | "비즈니스 모델" | "미개척 영역";
  title: string;
  evidence: string;
  severity: "낮음" | "중간" | "높음";
  opportunity: string;
}

export interface LeapfrogFeature {
  name: string;
  description: string;
  addressesFaultLine: string;
  originalApproach: string;
  newApproach: string;
}

export interface LeapfrogDesign {
  conceptName: string;
  positioning: string;
  thesis: string;
  features: LeapfrogFeature[];
  architectureShift: string;
  moat: string;
}

export interface DivergenceAudit {
  score: number;
  verdict: "통과" | "재설계 필요";
  overlaps: Array<{ item: string; risk: string; fix: string }>;
  legalNotes: string[];
}

export interface TeardownResult {
  target: {
    product: string;
    url: string | null;
    category: string;
    oneLine: string;
  };
  techKeyword: string;
  principles: TeardownPrinciple[];
  faultLines: FaultLine[];
  leapfrog: LeapfrogDesign;
  divergence: DivergenceAudit;
  regenerated: boolean;
}

type ApiKeys = { geminiKey?: string; openaiKey?: string; customModel?: string };

/** Below this differentiation score the design is judged too derivative and rebuilt once. */
const DIVERGENCE_THRESHOLD = 60;

// ─── LLM plumbing ─────────────────────────────────────────────────────────────

/**
 * Models frequently wrap JSON in ``` fences despite json_object mode, and occasionally
 * emit prose around it. Recover what we can rather than losing an expensive call.
 */
export function parseLlmJson<T>(content: string | undefined, fallback: T): T {
  if (!content) return fallback;

  const unfenced = content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    return JSON.parse(unfenced) as T;
  } catch {
    // Fall back to the outermost {...} span.
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1)) as T;
      } catch {
        /* give up below */
      }
    }
    return fallback;
  }
}

async function askJson<T>(
  system: string,
  prompt: string,
  fallback: T,
  apiKeys?: ApiKeys
): Promise<T> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: `${system} 항상 유효한 JSON만 반환하세요.` },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" } as ResponseFormat,
    ...apiKeys,
  });
  const raw = response.choices?.[0]?.message?.content;
  return parseLlmJson<T>(typeof raw === "string" ? raw : undefined, fallback);
}

// ─── Source formatting ────────────────────────────────────────────────────────

function meta(s: SourceItem): Record<string, unknown> {
  return (s.metadata ?? {}) as Record<string, unknown>;
}

/** Public pages of the product — the primary evidence for what it claims to do. */
function formatOfficialPages(sources: SourceItem[]): string {
  const pages = sources.filter((s) => s.sourceType === "web");
  if (pages.length === 0) return "_공식 페이지를 수집하지 못했습니다._";
  return pages
    .map((s) => `### [${meta(s).pageLabel ?? "페이지"}] ${s.title}\n${s.url}\n\n${s.description}`)
    .join("\n\n---\n\n");
}

/**
 * Community comments — the primary evidence for where the product falls short.
 *
 * Attribution confidence is passed through to the prompt rather than silently mixed in.
 * A product named after a common word collects comments that merely share the word, and
 * an unlabelled mix lets the model cite linear-algebra chatter as a product complaint.
 */
function formatCommunityVoices(sources: SourceItem[]): string {
  const reviews = sources.filter((s) => s.sourceType === "review");
  const confirmed = reviews.filter((s) => meta(s).confidence === "confirmed").slice(0, 12);
  // Only pad with weakly-attributed comments when the confirmed set is too thin to analyse.
  const unconfirmed =
    confirmed.length >= 5
      ? []
      : reviews.filter((s) => meta(s).confidence !== "confirmed").slice(0, 8 - confirmed.length);
  const stories = sources.filter((s) => s.sourceType === "hackernews").slice(0, 6);

  const parts: string[] = [];
  if (confirmed.length > 0) {
    parts.push(
      "## 사용자 실제 발언 (제품 관련성 확인됨)",
      ...confirmed.map((s) => `- (${meta(s).storyTitle ?? s.title}) "${s.description}"`)
    );
  }
  if (unconfirmed.length > 0) {
    parts.push(
      "\n## 사용자 발언 (제품 관련성 미확인 — 제품명이 일반 단어와 겹쳐 무관한 글일 수 있음)",
      "⚠️ 아래 발언은 대상 제품에 대한 것이 아닐 수 있습니다. 내용이 명백히 이 제품에 관한 것일 때만 근거로 쓰고, 애매하면 무시하세요.",
      ...unconfirmed.map((s) => `- (${meta(s).storyTitle ?? s.title}) "${s.description}"`)
    );
  }
  if (stories.length > 0) {
    parts.push(
      "\n## 관련 토론",
      ...stories.map((s) => `- [${s.title}](${s.url}) — 포인트 ${meta(s).points ?? 0}, 댓글 ${meta(s).comments ?? 0}`)
    );
  }
  return parts.length > 0 ? parts.join("\n") : "_커뮤니티 반응을 수집하지 못했습니다._";
}

/** Counts shown in the report header so a thin evidence base is visible, not hidden. */
export function countConfirmedReviews(sources: SourceItem[]): { confirmed: number; total: number } {
  const reviews = sources.filter((s) => s.sourceType === "review");
  return {
    confirmed: reviews.filter((s) => meta(s).confidence === "confirmed").length,
    total: reviews.length,
  };
}

/** Open-source building blocks a re-implementation could stand on. */
function formatBuildingBlocks(sources: SourceItem[]): string {
  const repos = sources.filter((s) => s.sourceType === "github").slice(0, 10);
  const models = sources.filter((s) => s.sourceType === "huggingface").slice(0, 6);
  const papers = sources.filter((s) => s.sourceType === "papers").slice(0, 6);

  return [
    "## GitHub 저장소",
    ...repos.map(
      (s) => `- [${s.title}](${s.url}): ${s.description} (⭐ ${meta(s).stars ?? 0}, 언어 ${meta(s).language ?? "N/A"}, 라이선스 ${meta(s).license ?? "N/A"})`
    ),
    "\n## AI 모델",
    ...models.map((s) => `- [${s.title}](${s.url}): ${s.description} (다운로드 ${meta(s).downloads ?? 0})`),
    "\n## 논문",
    ...papers.map((s) => `- [${s.title}](${s.url}): ${s.description.slice(0, 200)}`),
  ].join("\n");
}

// ─── Stage 0: domain identification (runs before collection) ──────────────────

export interface TargetDomain {
  techKeyword: string;
  category: string;
  oneLine: string;
}

/**
 * Turns a product name into the English technical domain to search. Collecting on the
 * product name alone finds press coverage; collecting on the domain finds the components
 * an alternative would actually be built from.
 */
export async function identifyTargetDomain(
  productName: string,
  targetUrl: string | null,
  apiKeys?: ApiKeys
): Promise<TargetDomain> {
  const fallback: TargetDomain = {
    techKeyword: productName,
    category: "미분류",
    oneLine: `${productName} 제품 분석`,
  };

  try {
    return normalizeDomain(
      productName,
      await askJson<Partial<TargetDomain>>(
        "당신은 제품 분석가입니다.",
        `제품명: "${productName}"${targetUrl ? `\n공식 URL: ${targetUrl}` : ""}

이 제품이 속한 기술 영역을 판별해주세요.

{
  "techKeyword": "이 제품을 재구현할 때 검색해야 할 영어 기술 키워드 (2-4단어, 제품명 자체는 넣지 말 것. 예: 'collaborative whiteboard canvas', 'vector database retrieval')",
  "category": "제품 카테고리 (한국어, 예: 협업 도구, 디자인 툴, 개발자 도구)",
  "oneLine": "이 제품이 무엇인지 한 문장 설명 (한국어)"
}`,
        fallback,
        apiKeys
      )
    );
  } catch (err) {
    console.error("[Teardown] identifyTargetDomain failed:", err);
    return fallback;
  }
}

function normalizeDomain(productName: string, d: Partial<TargetDomain>): TargetDomain {
  const techKeyword = (d.techKeyword ?? "").trim();
  return {
    // A model that echoes the product name defeats the purpose of this stage.
    techKeyword:
      techKeyword && techKeyword.toLowerCase() !== productName.toLowerCase()
        ? techKeyword
        : productName,
    category: d.category?.trim() || "미분류",
    oneLine: d.oneLine?.trim() || `${productName} 제품 분석`,
  };
}

// ─── Stage A: principle extraction ────────────────────────────────────────────

export async function extractPrinciples(
  productName: string,
  sources: SourceItem[],
  apiKeys?: ApiKeys
): Promise<TeardownPrinciple[]> {
  const result = await askJson<{ principles?: TeardownPrinciple[] }>(
    "당신은 제품을 분해해 작동 원리를 추출하는 시니어 시스템 아키텍트입니다.",
    `대상 제품: "${productName}"

# 공식 페이지 내용
${formatOfficialPages(sources)}

# 커뮤니티 반응
${formatCommunityVoices(sources)}

---

이 제품을 **기능 목록이 아니라 작동 원리(mechanism)** 수준으로 분해하세요.

절대 하지 말아야 할 것:
- "채팅 기능이 있다", "다크모드를 지원한다" 같은 기능 나열
- 마케팅 문구를 그대로 옮기기

반드시 해야 할 것:
- "왜 이 구조여야만 이 문제가 풀리는가"를 설명
- 그 제품이 성공한 진짜 이유가 되는 메커니즘만 추출 (5~8개)

{
  "principles": [
    {
      "name": "원리 이름 (짧게)",
      "mechanism": "어떻게 작동하는가 — 구조/흐름 수준의 설명",
      "whyItWorks": "이 메커니즘이 왜 사용자 문제를 해결하는가",
      "evidence": "이 판단의 근거가 된 수집 자료 내용"
    }
  ]
}

모든 내용은 한국어로 작성하세요.`,
    { principles: [] },
    apiKeys
  );

  return (result.principles ?? []).filter((p) => p && p.name).map((p) => ({
    name: String(p.name),
    mechanism: String(p.mechanism ?? ""),
    whyItWorks: String(p.whyItWorks ?? ""),
    evidence: String(p.evidence ?? ""),
  }));
}

// ─── Stage B: fault line analysis ─────────────────────────────────────────────

const FAULT_CATEGORIES: FaultLine["category"][] = [
  "시대적 타협",
  "사용자 불만",
  "구조적 한계",
  "비즈니스 모델",
  "미개척 영역",
];

const SEVERITIES: FaultLine["severity"][] = ["낮음", "중간", "높음"];

export async function findFaultLines(
  productName: string,
  principles: TeardownPrinciple[],
  sources: SourceItem[],
  apiKeys?: ApiKeys
): Promise<FaultLine[]> {
  const result = await askJson<{ faultLines?: FaultLine[] }>(
    "당신은 제품의 구조적 약점을 찾아내는 냉정한 비평가입니다. 장점은 언급하지 않습니다.",
    `대상 제품: "${productName}"

# 추출된 작동 원리
${principles.map((p, i) => `${i + 1}. **${p.name}** — ${p.mechanism}\n   (효과: ${p.whyItWorks})`).join("\n")}

# 사용자 실제 발언 및 커뮤니티 반응
${formatCommunityVoices(sources)}

# 현재 사용 가능한 기술 (참고)
${formatBuildingBlocks(sources)}

---

이 제품의 **균열(fault line)**을 찾아내세요. 균열이란 원본 설계자가 감수한 타협, 또는 지금은 더 이상 감수할 필요가 없어진 제약입니다.

각 균열은 반드시 다음 카테고리 중 하나입니다:
- **시대적 타협**: 설계 당시엔 기술이 없어서 우회했지만, 지금 기술로는 그 우회 자체가 불필요해진 지점 ← 가장 중요합니다
- **사용자 불만**: 커뮤니티에서 반복적으로 제기되는 구조적 불만
- **구조적 한계**: 핵심 원리를 유지하는 한 절대 해결할 수 없는 한계
- **비즈니스 모델**: 수익 구조 때문에 의도적으로 막혀 있는 영역
- **미개척 영역**: 제품이 아예 다루지 않고 남겨둔 인접 문제

추측성 비판은 금지합니다. 수집 자료에 근거가 없으면 그 균열은 빼세요. 5~7개를 찾으세요.

{
  "faultLines": [
    {
      "category": "위 5개 중 하나 정확히",
      "title": "균열을 한 문장으로",
      "evidence": "이렇게 판단한 구체적 근거 (수집 자료 인용)",
      "severity": "낮음|중간|높음",
      "opportunity": "이 균열을 파고들면 무엇이 가능해지는가"
    }
  ]
}

모든 내용은 한국어로 작성하세요.`,
    { faultLines: [] },
    apiKeys
  );

  return (result.faultLines ?? [])
    .filter((f) => f && f.title)
    .map((f) => ({
      category: FAULT_CATEGORIES.includes(f.category) ? f.category : "구조적 한계",
      title: String(f.title),
      evidence: String(f.evidence ?? ""),
      severity: SEVERITIES.includes(f.severity) ? f.severity : "중간",
      opportunity: String(f.opportunity ?? ""),
    }));
}

// ─── Stage C: leapfrog design ─────────────────────────────────────────────────

export async function designLeapfrog(
  productName: string,
  principles: TeardownPrinciple[],
  faultLines: FaultLine[],
  apiKeys?: ApiKeys,
  priorOverlaps?: DivergenceAudit["overlaps"]
): Promise<LeapfrogDesign> {
  const fallback: LeapfrogDesign = {
    conceptName: `${productName} 대안 설계`,
    positioning: "",
    thesis: "",
    features: [],
    architectureShift: "",
    moat: "",
  };

  const retryBlock =
    priorOverlaps && priorOverlaps.length > 0
      ? `

# ⚠️ 이전 설계가 반려되었습니다
아래 항목들이 원본을 그대로 따라간다는 판정을 받았습니다. 이번에는 반드시 다른 경로를 택하세요.
${priorOverlaps.map((o) => `- **${o.item}**: ${o.risk}\n  → 수정 방향: ${o.fix}`).join("\n")}`
      : "";

  const result = await askJson<Partial<LeapfrogDesign>>(
    "당신은 기존 제품의 원리를 이해한 뒤 그것을 뛰어넘는 상위 개념 제품을 설계하는 제품 아키텍트입니다.",
    `원본 제품: "${productName}"

# 원본의 작동 원리
${principles.map((p, i) => `${i + 1}. **${p.name}** — ${p.mechanism}`).join("\n")}

# 발견된 균열
${faultLines.map((f, i) => `${i + 1}. [${f.category}/${f.severity}] **${f.title}**\n   근거: ${f.evidence}\n   기회: ${f.opportunity}`).join("\n")}${retryBlock}

---

이제 새 제품을 설계합니다. 규칙은 단 하나입니다:

**원본의 구현 경로를 사용하지 말고, 같은 목적지에 도달하세요.**

이것은 "원본 + 기능 몇 개 추가"가 아닙니다. 원본이 해결하려던 근본 문제를 위 균열들이 존재하지 않는 방식으로 다시 푸는 것입니다.

지켜야 할 것:
- 모든 핵심 기능은 위 균열 중 **어떤 것을 해소하는지** 명시해야 합니다. 균열과 연결되지 않는 기능은 넣지 마세요.
- 원본의 UI 구성, 화면 배치, 용어, 브랜드를 따라하지 마세요.
- "AI를 붙였다"는 것만으로는 도약이 아닙니다. 구조가 바뀌어야 합니다.

{
  "conceptName": "새 제품의 개념 이름 (원본 이름을 변형하지 말 것)",
  "positioning": "이 제품이 무엇인지 한 문장",
  "thesis": "왜 지금 이 제품이 가능해졌는가 — 원본 설계 시점에는 없었던 무엇이 이걸 가능하게 했는가",
  "features": [
    {
      "name": "핵심 기능 이름",
      "description": "무엇을 하는가",
      "addressesFaultLine": "위 균열 목록 중 해소하는 균열의 제목",
      "originalApproach": "원본은 이 문제를 어떻게 처리했는가",
      "newApproach": "우리는 왜 다르게 처리하는가"
    }
  ],
  "architectureShift": "원본과 근본적으로 달라지는 구조적 전환을 설명",
  "moat": "이 설계가 원본이 쉽게 따라올 수 없는 이유"
}

핵심 기능은 4~6개. 모든 내용은 한국어로 작성하세요.`,
    fallback,
    apiKeys
  );

  return {
    conceptName: result.conceptName?.trim() || fallback.conceptName,
    positioning: result.positioning?.trim() ?? "",
    thesis: result.thesis?.trim() ?? "",
    features: Array.isArray(result.features)
      ? result.features
          .filter((f) => f && f.name)
          .map((f) => ({
            name: String(f.name),
            description: String(f.description ?? ""),
            addressesFaultLine: String(f.addressesFaultLine ?? ""),
            originalApproach: String(f.originalApproach ?? ""),
            newApproach: String(f.newApproach ?? ""),
          }))
      : [],
    architectureShift: result.architectureShift?.trim() ?? "",
    moat: result.moat?.trim() ?? "",
  };
}

// ─── Stage D: divergence audit ────────────────────────────────────────────────

export async function auditDivergence(
  productName: string,
  leapfrog: LeapfrogDesign,
  apiKeys?: ApiKeys
): Promise<DivergenceAudit> {
  const fallback: DivergenceAudit = {
    score: 50,
    verdict: "통과",
    overlaps: [],
    legalNotes: [],
  };

  const result = await askJson<Partial<DivergenceAudit>>(
    "당신은 지식재산권에 밝은 제품 감사관입니다. 설계가 기존 제품의 모방인지 냉정하게 판정합니다.",
    `원본 제품: "${productName}"

# 감사 대상 설계
개념명: ${leapfrog.conceptName}
포지셔닝: ${leapfrog.positioning}
논지: ${leapfrog.thesis}
구조적 전환: ${leapfrog.architectureShift}

핵심 기능:
${leapfrog.features.map((f, i) => `${i + 1}. **${f.name}**: ${f.description}\n   원본 방식: ${f.originalApproach}\n   새 방식: ${f.newApproach}`).join("\n")}

---

이 설계가 원본과 얼마나 실질적으로 다른지 판정하세요.

판정 기준:
- 아이디어와 기능 개념의 유사성은 문제가 아닙니다 (아이디어는 보호 대상이 아닙니다)
- 문제가 되는 것은: 원본 고유의 **표현**을 따라간 부분, 상표성 명칭, 원본 UI/용어 체계의 복제, 특허 가능성이 높은 구체적 구현 방식의 답습
- "이름만 바꾸고 똑같은 물건"이면 낮은 점수를 주세요

{
  "score": 0-100 정수 (100 = 완전히 독립적인 설계, 0 = 사실상 복제품),
  "verdict": "통과|재설계 필요",
  "overlaps": [
    {"item": "원본을 따라간 지점", "risk": "왜 문제가 되는가", "fix": "어떻게 바꿔야 하는가"}
  ],
  "legalNotes": ["실제 개발 시 확인해야 할 법적 주의사항"]
}

overlaps는 실제로 발견된 것만 넣으세요. 없으면 빈 배열입니다. 모든 내용은 한국어로 작성하세요.`,
    fallback,
    apiKeys
  );

  const rawScore = Number(result.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 50;

  const overlaps = Array.isArray(result.overlaps)
    ? result.overlaps
        .filter((o) => o && o.item)
        .map((o) => ({
          item: String(o.item),
          risk: String(o.risk ?? ""),
          fix: String(o.fix ?? ""),
        }))
    : [];

  return {
    score,
    // Derive the verdict from the score rather than trusting the model to stay consistent
    // with its own number.
    verdict: score >= DIVERGENCE_THRESHOLD ? "통과" : "재설계 필요",
    overlaps,
    legalNotes: Array.isArray(result.legalNotes) ? result.legalNotes.map(String) : [],
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runTeardownChain(
  productName: string,
  targetUrl: string | null,
  domain: TargetDomain,
  sources: SourceItem[],
  apiKeys?: ApiKeys
): Promise<TeardownResult> {
  const principles = await extractPrinciples(productName, sources, apiKeys);
  console.log(`[Teardown] "${productName}" — 원리 ${principles.length}개 추출`);

  const faultLines = await findFaultLines(productName, principles, sources, apiKeys);
  console.log(`[Teardown] "${productName}" — 균열 ${faultLines.length}개 발견`);

  let leapfrog = await designLeapfrog(productName, principles, faultLines, apiKeys);
  let divergence = await auditDivergence(productName, leapfrog, apiKeys);
  let regenerated = false;

  // One retry only. A second failure usually means the fault lines were too thin to
  // support a real leap, and further attempts just burn tokens.
  if (divergence.verdict === "재설계 필요") {
    console.log(`[Teardown] 차별화 점수 ${divergence.score} — 재설계 1회 수행`);
    regenerated = true;
    leapfrog = await designLeapfrog(
      productName,
      principles,
      faultLines,
      apiKeys,
      divergence.overlaps
    );
    divergence = await auditDivergence(productName, leapfrog, apiKeys);
  }

  return {
    target: {
      product: productName,
      url: targetUrl,
      category: domain.category,
      oneLine: domain.oneLine,
    },
    techKeyword: domain.techKeyword,
    principles,
    faultLines,
    leapfrog,
    divergence,
    regenerated,
  };
}

// ─── Report generation ────────────────────────────────────────────────────────

const SEVERITY_MARK: Record<FaultLine["severity"], string> = {
  높음: "🔴",
  중간: "🟠",
  낮음: "🟡",
};

export function generateTeardownMarkdown(
  teardown: TeardownResult,
  analysis: AnalysisResult | null,
  sources: SourceItem[]
): string {
  const now = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const { target, principles, faultLines, leapfrog, divergence } = teardown;
  const stack = analysis?.techStack;
  const phases = analysis?.developmentPhases ?? [];
  const risks = analysis?.risks ?? [];

  const repos = sources.filter((s) => s.sourceType === "github").slice(0, 8);
  const models = sources.filter((s) => s.sourceType === "huggingface").slice(0, 5);
  const reviews = countConfirmedReviews(sources);
  const pageCount = sources.filter((s) => s.sourceType === "web").length;

  return `# 역설계 기반 신규 앱 설계서: ${leapfrog.conceptName}

> 생성일: ${now}
> 분석 대상: **${target.product}**${target.url ? ` (${target.url})` : ""}
> BuildPlanner 역설계 모드로 자동 생성되었습니다.

---

## 0. 요약

**${leapfrog.positioning || leapfrog.conceptName}**

${leapfrog.thesis || "_논지를 생성하지 못했습니다._"}

| 항목 | 값 |
|------|-----|
| 원본 제품 | ${target.product} |
| 제품 카테고리 | ${target.category} |
| 추출된 작동 원리 | ${principles.length}개 |
| 발견된 균열 | ${faultLines.length}개 |
| 차별화 점수 | **${divergence.score}/100** (${divergence.verdict})${teardown.regenerated ? " · 재설계 1회 수행" : ""} |
| 분석 자료 | 공식 페이지 ${pageCount}건, 사용자 발언 ${reviews.total}건 (제품 관련성 확인 ${reviews.confirmed}건) |

---

## 1. 원본 분석 — 작동 원리

> 기능 목록이 아니라, 이 제품이 왜 작동하는지에 대한 메커니즘 분해입니다.

${
  principles.length > 0
    ? principles
        .map(
          (p, i) =>
            `### ${i + 1}. ${p.name}\n\n**메커니즘**: ${p.mechanism}\n\n**작동 이유**: ${p.whyItWorks}\n\n> 근거: ${p.evidence || "명시되지 않음"}`
        )
        .join("\n\n")
    : "_작동 원리를 추출하지 못했습니다. 공식 URL이 정확한지 확인해주세요._"
}

---

## 2. 균열 분석 — 원본이 감수한 타협

> 도약의 출발점입니다. 원본을 이기는 방법은 더 잘 만드는 것이 아니라, 원본이 피할 수 없었던 제약을 없애는 것입니다.

${
  faultLines.length > 0
    ? faultLines
        .map(
          (f, i) =>
            `### ${SEVERITY_MARK[f.severity]} ${i + 1}. ${f.title}\n\n- **유형**: ${f.category}\n- **심각도**: ${f.severity}\n- **근거**: ${f.evidence}\n- **기회**: ${f.opportunity}`
        )
        .join("\n\n")
    : "_균열을 발견하지 못했습니다._"
}

---

## 3. 도약 설계 — 새 제품

### 개념

**${leapfrog.conceptName}** — ${leapfrog.positioning}

### 구조적 전환

${leapfrog.architectureShift || "_구조적 전환이 명시되지 않았습니다._"}

### 핵심 기능

${
  leapfrog.features.length > 0
    ? leapfrog.features
        .map(
          (f, i) =>
            `#### ${i + 1}. ${f.name}\n\n${f.description}\n\n| | |\n|---|---|\n| 해소하는 균열 | ${f.addressesFaultLine || "미지정"} |\n| 원본의 방식 | ${f.originalApproach} |\n| **우리의 방식** | **${f.newApproach}** |`
        )
        .join("\n\n")
    : "_핵심 기능을 설계하지 못했습니다._"
}

### 방어 가능성

${leapfrog.moat || "_방어 요소가 명시되지 않았습니다._"}

---

## 4. 차별화 감사

**차별화 점수: ${divergence.score}/100 — ${divergence.verdict}**

${
  divergence.score >= 80
    ? "✅ 원본과 독립적인 설계로 판정되었습니다."
    : divergence.score >= DIVERGENCE_THRESHOLD
      ? "🟡 독립성은 확보했으나 아래 항목은 개발 전 재검토를 권합니다."
      : "🔴 원본 의존도가 높습니다. 아래 항목을 반드시 수정한 뒤 개발에 착수하세요."
}

${
  divergence.overlaps.length > 0
    ? `### 원본을 따라간 지점\n\n${divergence.overlaps.map((o) => `#### ⚠️ ${o.item}\n- 위험: ${o.risk}\n- 수정 방향: ${o.fix}`).join("\n\n")}`
    : "### 원본을 따라간 지점\n\n_발견되지 않았습니다._"
}

### 법적 확인 사항

${
  divergence.legalNotes.length > 0
    ? divergence.legalNotes.map((n) => `- ${n}`).join("\n")
    : "- 아이디어와 기능 개념은 저작권 보호 대상이 아니지만, 소스코드·UI 에셋·상표는 보호 대상입니다.\n- 원본의 특허 등록 여부를 개발 착수 전 확인하세요."
}

> ⚖️ 이 문서는 공개된 정보만을 근거로 작성된 분석입니다. 법률 자문이 아니며, 실제 제품화 전 전문가 검토를 권장합니다.

---

## 5. 구현 계획

${
  stack
    ? `### 기술 스택\n\n| 영역 | 기술 |\n|------|------|\n| Frontend | ${stack.frontend.join(", ")} |\n| Backend | ${stack.backend.join(", ")} |\n| AI/ML | ${stack.ai.join(", ")} |\n| Database | ${stack.database.join(", ")} |\n| Deployment | ${stack.deployment.join(", ")} |`
    : "_기술 스택을 생성하지 못했습니다._"
}

${
  analysis?.implementationDifficulty
    ? `\n### 구현 난이도\n\n**${analysis.implementationDifficulty}** — ${analysis.difficultyReason}`
    : ""
}

${
  phases.length > 0
    ? `\n### 개발 단계\n\n${phases.map((p) => `#### ${p.phase} (${p.duration})\n\n${p.tasks.map((t) => `- [ ] ${t}`).join("\n")}`).join("\n\n")}`
    : ""
}

${
  risks.length > 0
    ? `\n### 리스크\n\n${risks.map((r) => `#### ⚠️ ${r.risk}\n- 대응: ${r.mitigation}`).join("\n\n")}`
    : ""
}

---

## 6. 활용 가능한 오픈소스

${
  repos.length > 0
    ? repos
        .map(
          (s) =>
            `### [${s.title}](${s.url})\n${s.description || "설명 없음"}\n- ⭐ ${meta(s).stars ?? 0} | 언어: ${meta(s).language ?? "N/A"} | 라이선스: ${meta(s).license ?? "N/A"}`
        )
        .join("\n\n")
    : "_관련 오픈소스를 찾지 못했습니다._"
}

${
  models.length > 0
    ? `\n### 참고 AI 모델\n\n${models.map((s) => `- [${s.title}](${s.url}) — 다운로드 ${meta(s).downloads ?? 0}`).join("\n")}`
    : ""
}

---

*이 설계서는 BuildPlanner 역설계 모드로 자동 생성되었습니다. 공개 정보 기반 분석이므로 실제 개발 시 추가 검증이 필요합니다.*
`;
}
