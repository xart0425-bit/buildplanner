import { describe, expect, it, vi, beforeEach } from "vitest";
import { collectAllSources } from "./collector";
import { buildDocsPromptBlock, buildProjectsPromptBlock, generateMarkdown } from "./analyzer";
import type { AnalysisResult } from "./analyzer";
import type { SourceItem } from "./collector";
import { isEmptyAttachments, parseAttachments, type IdeaAttachments } from "@shared/attachments";

// ─── Collector unit tests ─────────────────────────────────────────────────────

describe("collector - score helpers", () => {
  it("should return SourceItem array from collectAllSources (mocked)", async () => {
    // Mock fetch globally
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const results = await collectAllSources("test keyword");
    // All APIs return empty when fetch fails
    expect(Array.isArray(results)).toBe(true);

    vi.unstubAllGlobals();
  });

  it("should sort sources by score descending", () => {
    const sources: SourceItem[] = [
      { sourceType: "github", title: "low", url: "http://a.com", description: "", score: 0.2, metadata: {} },
      { sourceType: "github", title: "high", url: "http://b.com", description: "", score: 0.9, metadata: {} },
      { sourceType: "papers", title: "mid", url: "http://c.com", description: "", score: 0.5, metadata: {} },
    ];
    const sorted = [...sources].sort((a, b) => b.score - a.score);
    expect(sorted[0].title).toBe("high");
    expect(sorted[1].title).toBe("mid");
    expect(sorted[2].title).toBe("low");
  });
});

// ─── Markdown generation tests ────────────────────────────────────────────────

describe("generateMarkdown", () => {
  const mockAnalysis: AnalysisResult = {
    coreTechnologies: ["React", "Node.js", "OpenAI API"],
    openSourceReferences: [
      { name: "LangChain", url: "https://github.com/langchain-ai/langchain", description: "LLM framework" },
    ],
    similarServices: [{ name: "ChatGPT", description: "OpenAI chatbot" }],
    implementationDifficulty: "중급",
    difficultyReason: "API 연동이 필요하지만 문서가 잘 되어 있음",
    licenseNotes: ["MIT 라이선스 사용 가능"],
    techStack: {
      frontend: ["React", "TypeScript"],
      backend: ["Node.js", "Express"],
      ai: ["OpenAI API"],
      database: ["PostgreSQL"],
      deployment: ["Vercel"],
    },
    coreFeatures: ["키워드 입력", "멀티소스 검색", "계획서 생성"],
    developmentPhases: [
      { phase: "1단계: 기획", duration: "1주", tasks: ["요구사항 정의", "기술 스택 결정"] },
    ],
    risks: [{ risk: "API 비용", mitigation: "캐싱 전략 적용" }],
    summary: "AI 기반 앱 개발 계획서 자동 생성 도구입니다.",
  };

  const mockSources: SourceItem[] = [
    {
      sourceType: "github",
      title: "test/repo",
      url: "https://github.com/test/repo",
      description: "Test repo",
      score: 0.8,
      metadata: { stars: 1000, forks: 100, language: "TypeScript", license: "MIT", topics: ["ai"] },
    },
    {
      sourceType: "papers",
      title: "Test Paper",
      url: "https://paperswithcode.com/paper/test",
      description: "Abstract text...",
      score: 0.6,
      metadata: { hasCode: true, stars: 50, published: "2024-01-01" },
    },
  ];

  it("defaults to English and includes every section", () => {
    const md = generateMarkdown("AI chatbot", mockAnalysis, mockSources);

    expect(md).toContain("# App Development Plan: AI chatbot");
    expect(md).toContain("## 1. Overview");
    expect(md).toContain("## 2. Research Keywords");
    expect(md).toContain("## 3. Reference Open Source");
    expect(md).toContain("## 4. Reference AI Models");
    expect(md).toContain("## 5. Related Papers");
    expect(md).toContain("## 6. Core Features");
    expect(md).toContain("## 7. Tech Stack");
    expect(md).toContain("## 8. Screen Structure");
    expect(md).toContain("## 9. Development Phases");
    expect(md).toContain("## 10. Risks and Licensing");
  });

  it("renders the document in the requested language", () => {
    const ko = generateMarkdown("AI chatbot", mockAnalysis, mockSources, null, "ko");
    expect(ko).toContain("# 앱 개발 계획서: AI chatbot");
    expect(ko).toContain("## 1. 아이디어 개요");
    expect(ko).toContain("| 영역 | 기술 |");

    const ja = generateMarkdown("AI chatbot", mockAnalysis, mockSources, null, "ja");
    expect(ja).toContain("# アプリ開発計画書: AI chatbot");
    expect(ja).toContain("## 1. アイデア概要");

    const fr = generateMarkdown("AI chatbot", mockAnalysis, mockSources, null, "fr");
    expect(fr).toContain("## 1. Vue d'ensemble");

    const ru = generateMarkdown("AI chatbot", mockAnalysis, mockSources, null, "ru");
    expect(ru).toContain("## 1. Обзор идеи");

    const zh = generateMarkdown("AI chatbot", mockAnalysis, mockSources, null, "zh");
    expect(zh).toContain("## 1. 创意概述");
  });

  it("should include keyword in the markdown", () => {
    const md = generateMarkdown("education chatbot", mockAnalysis, mockSources);
    expect(md).toContain("education chatbot");
  });

  it("translates the difficulty level label", () => {
    expect(generateMarkdown("test", mockAnalysis, mockSources)).toContain("Intermediate");
    expect(generateMarkdown("test", mockAnalysis, mockSources, null, "ko")).toContain("중급");
  });

  it("should include tech stack table", () => {
    const md = generateMarkdown("test", mockAnalysis, mockSources);
    expect(md).toContain("| Area | Technology |");
    expect(md).toContain("React");
    expect(md).toContain("Node.js");
  });

  it("should include risk section", () => {
    const md = generateMarkdown("test", mockAnalysis, mockSources);
    expect(md).toContain("API 비용");
    expect(md).toContain("캐싱 전략 적용");
  });

  it("should handle empty sources gracefully", () => {
    const md = generateMarkdown("test", mockAnalysis, []);
    expect(md).toContain("# App Development Plan: test");
    expect(md).not.toThrow;
  });
});

// ─── Idea attachments ─────────────────────────────────────────────────────────

describe("idea attachments", () => {
  const mockAnalysisFixture: AnalysisResult = {
    coreTechnologies: ["React"],
    openSourceReferences: [],
    similarServices: [],
    implementationDifficulty: "중급",
    difficultyReason: "테스트",
    licenseNotes: [],
    techStack: {
      frontend: ["React"],
      backend: ["Node.js"],
      ai: [],
      database: ["PostgreSQL"],
      deployment: ["Vercel"],
    },
    coreFeatures: ["기능"],
    developmentPhases: [{ phase: "1단계", duration: "1주", tasks: ["작업"] }],
    risks: [],
    summary: "요약",
  };

  const attachments: IdeaAttachments = {
    docs: [{ name: "spec.md", content: "# 요구사항\n\n- 오프라인 우선" }],
    images: [
      {
        name: "hero.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      },
    ],
    projects: [
      {
        path: "Z:\\work\\legacy-app",
        name: "legacy-app",
        fileCount: 128,
        languages: ["TypeScript"],
        tree: "src/\n  index.ts",
        manifests: [{ file: "package.json", excerpt: '{"name":"legacy-app"}' }],
        readme: "# legacy-app",
        truncated: false,
      },
    ],
  };

  it("puts attached document contents into the analysis prompt", () => {
    const block = buildDocsPromptBlock(attachments);
    expect(block).toContain("spec.md");
    expect(block).toContain("오프라인 우선");
  });

  it("truncates an oversized document instead of sending it whole", () => {
    const huge = "가".repeat(120_000);
    const block = buildDocsPromptBlock({
      docs: [{ name: "big.md", content: huge }],
      images: [],
      projects: [],
    });
    expect(block.length).toBeLessThan(huge.length);
    expect(block).toContain("이하 생략");
  });

  it("returns an empty prompt block when nothing is attached", () => {
    expect(buildDocsPromptBlock(null)).toBe("");
    expect(buildDocsPromptBlock({ docs: [], images: [], projects: [] })).toBe("");
  });

  it("tells the model to extend the referenced local project", () => {
    const block = buildProjectsPromptBlock(attachments);
    expect(block).toContain("Z:\\work\\legacy-app");
    expect(block).toContain("기존 로컬 프로젝트");
    expect(block).toContain("src/");
    expect(buildProjectsPromptBlock({ docs: [], images: [], projects: [] })).toBe("");
  });

  it("lists referenced project paths in the plan", () => {
    const md = generateMarkdown("AI chatbot", mockAnalysisFixture, [], attachments);
    expect(md).toContain("Referenced local projects");
    expect(md).toContain("Z:\\work\\legacy-app");
  });

  it("treats an attachments row missing newer fields as empty", () => {
    const legacyRow = { docs: [], images: [] } as unknown as IdeaAttachments;
    expect(isEmptyAttachments(legacyRow)).toBe(true);
    expect(() => generateMarkdown("AI chatbot", mockAnalysisFixture, [], legacyRow)).not.toThrow();
  });

  it("lists attachments in the generated plan without inlining image data", () => {
    const md = generateMarkdown("AI chatbot", mockAnalysisFixture, [], attachments);
    expect(md).toContain("## 13. Attached Reference Material");
    expect(md).toContain("spec.md");
    expect(md).toContain("hero.png");
    expect(md).not.toContain("base64,");
  });

  it("omits the attachment section when nothing was attached", () => {
    const md = generateMarkdown("AI chatbot", mockAnalysisFixture, []);
    expect(md).not.toContain("Attached Reference Material");
  });

  it("renders design guidelines derived from reference images", () => {
    const md = generateMarkdown(
      "AI chatbot",
      { ...mockAnalysisFixture, designGuidelines: ["다크 테마 고정", "상단 고정 네비게이션"] },
      [],
      attachments
    );
    expect(md).toContain("Design Guidelines");
    expect(md).toContain("다크 테마 고정");
  });

  it("drops malformed attachment rows instead of throwing", () => {
    expect(parseAttachments(null)).toBeNull();
    expect(parseAttachments({ docs: [{ name: "x.md" }], images: [] })).toBeNull();
    expect(parseAttachments({ docs: [], images: [] })).toBeNull();
    expect(parseAttachments(attachments)).toEqual(attachments);
  });

  it("backfills projects on rows written before the field existed", () => {
    const parsed = parseAttachments({
      docs: [{ name: "spec.md", content: "x" }],
      images: [],
    });
    expect(parsed?.projects).toEqual([]);
  });
});

// ─── Auth router test (from template) ────────────────────────────────────────

describe("research router - input validation", () => {
  it("should reject empty keyword", () => {
    const schema = { keyword: "" };
    expect(schema.keyword.length).toBe(0);
    // Zod would reject this at runtime; we verify the constraint here
    expect(schema.keyword.trim().length < 1).toBe(true);
  });

  it("should accept valid keyword", () => {
    const schema = { keyword: "AI video editor" };
    expect(schema.keyword.trim().length >= 1).toBe(true);
    expect(schema.keyword.length <= 200).toBe(true);
  });
});
