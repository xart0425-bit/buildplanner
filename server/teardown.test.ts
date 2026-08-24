import { describe, expect, it, vi, afterEach } from "vitest";
import {
  parseLlmJson,
  generateTeardownMarkdown,
  countConfirmedReviews,
  type TeardownResult,
} from "./teardown";
import type { SourceItem } from "./collector";
import { parseRobots, isPathAllowed, htmlToText, normalizeTargetUrl, collectWebIntel } from "./webIntel";
import { fetchProductComments, extractDomain } from "./collector";
import type { AnalysisResult } from "./analyzer";

// ─── LLM JSON recovery ────────────────────────────────────────────────────────

describe("parseLlmJson", () => {
  it("parses plain JSON", () => {
    expect(parseLlmJson('{"a":1}', { a: 0 })).toEqual({ a: 1 });
  });

  it("recovers JSON wrapped in a markdown code fence", () => {
    expect(parseLlmJson('```json\n{"a":1}\n```', { a: 0 })).toEqual({ a: 1 });
    expect(parseLlmJson('```\n{"a":2}\n```', { a: 0 })).toEqual({ a: 2 });
  });

  it("recovers JSON surrounded by prose", () => {
    const content = '분석 결과입니다:\n{"principles": [{"name": "x"}]}\n이상입니다.';
    expect(parseLlmJson<{ principles: Array<{ name: string }> }>(content, { principles: [] })).toEqual({
      principles: [{ name: "x" }],
    });
  });

  it("returns the fallback for unparseable content", () => {
    expect(parseLlmJson("완전히 깨진 응답", { ok: false })).toEqual({ ok: false });
    expect(parseLlmJson(undefined, { ok: false })).toEqual({ ok: false });
  });
});

// ─── robots.txt ───────────────────────────────────────────────────────────────

describe("parseRobots / isPathAllowed", () => {
  it("collects rules from the wildcard group only", () => {
    const rules = parseRobots(`
User-agent: Googlebot
Disallow: /secret

User-agent: *
Disallow: /admin
Allow: /admin/public
`);
    expect(rules.disallow).toEqual(["/admin"]);
    expect(rules.allow).toEqual(["/admin/public"]);
    expect(isPathAllowed("/secret", rules)).toBe(true); // not our group
    expect(isPathAllowed("/admin", rules)).toBe(false);
    expect(isPathAllowed("/pricing", rules)).toBe(true);
  });

  it("lets a longer Allow override a shorter Disallow", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /docs\nAllow: /docs/public");
    expect(isPathAllowed("/docs/private", rules)).toBe(false);
    expect(isPathAllowed("/docs/public/intro", rules)).toBe(true);
  });

  it("ignores comments and blank lines", () => {
    const rules = parseRobots("# comment\n\nUser-agent: *\nDisallow: /x # trailing\n");
    expect(rules.disallow).toEqual(["/x"]);
  });

  it("treats an empty robots.txt as fully permissive", () => {
    const rules = parseRobots("");
    expect(isPathAllowed("/anything", rules)).toBe(true);
  });
});

// ─── HTML extraction ──────────────────────────────────────────────────────────

describe("htmlToText", () => {
  it("drops script and style content", () => {
    const html = "<html><head><style>.a{color:red}</style></head><body><script>alert('x')</script><p>본문</p></body></html>";
    const text = htmlToText(html);
    expect(text).toContain("본문");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  it("decodes entities and collapses whitespace", () => {
    expect(htmlToText("<p>a&nbsp;&amp;&nbsp;b</p>")).toBe("a & b");
  });

  it("caps output length", () => {
    expect(htmlToText(`<p>${"가".repeat(20000)}</p>`).length).toBeLessThanOrEqual(6000);
  });
});

describe("normalizeTargetUrl", () => {
  it("adds a scheme when missing", () => {
    expect(normalizeTargetUrl("example.com")).toBe("https://example.com/");
  });

  it("preserves an explicit scheme and path", () => {
    expect(normalizeTargetUrl("http://example.com/product")).toBe("http://example.com/product");
  });

  it("rejects junk and non-http schemes", () => {
    expect(normalizeTargetUrl("")).toBeNull();
    expect(normalizeTargetUrl("   ")).toBeNull();
    expect(normalizeTargetUrl("javascript:alert(1)")).toBeNull();
  });
});

// ─── Network-facing collectors ────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collectWebIntel", () => {
  it("returns an empty array for an unusable URL without fetching", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    expect(await collectWebIntel("not a url at all ///")).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips paths that robots.txt disallows", async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.endsWith("/robots.txt")) {
        return { ok: true, text: async () => "User-agent: *\nDisallow: /pricing" };
      }
      return {
        ok: true,
        headers: { get: () => "text/html" },
        text: async () => `<html><title>T</title><body><p>${"내용 ".repeat(80)}</p></body></html>`,
      };
    });
    vi.stubGlobal("fetch", mockFetch as unknown as typeof fetch);

    const results = await collectWebIntel("https://example.com");
    expect(results.every((r) => !r.url.includes("/pricing"))).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.sourceType === "web")).toBe(true);
  });

  it("discards non-HTML responses and JS-only shells", async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.endsWith("/robots.txt")) return { ok: true, text: async () => "" };
      return {
        ok: true,
        headers: { get: () => "application/json" },
        text: async () => "{}",
      };
    });
    vi.stubGlobal("fetch", mockFetch as unknown as typeof fetch);

    expect(await collectWebIntel("https://example.com")).toEqual([]);
  });

  it("survives a total network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await collectWebIntel("https://example.com")).toEqual([]);
  });
});

describe("extractDomain", () => {
  it("strips scheme, www and path", () => {
    expect(extractDomain("https://www.linear.app/pricing")).toBe("linear.app");
    expect(extractDomain("linear.app")).toBe("linear.app");
  });

  it("returns null for missing or unparseable input", () => {
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain("")).toBeNull();
    expect(extractDomain("not a url ///")).toBeNull();
  });
});

describe("fetchProductComments", () => {
  const long = (s: string) => s + "x".repeat(200);

  const hit = (
    text: string,
    id: string,
    storyTitle = "Show HN: Something unrelated",
    storyUrl?: string
  ) => ({
    objectID: id,
    comment_text: text,
    story_title: storyTitle,
    story_url: storyUrl,
    author: "someone",
    created_at: new Date().toISOString(),
  });

  const confidenceOf = (s: { metadata: unknown }) =>
    (s.metadata as { confidence: string }).confidence;

  const stubHits = (hits: unknown[]) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits }) }));

  it("keeps comments whose thread is about the product, marked unconfirmed", async () => {
    stubHits([
      hit(long("Notion is slow once the page gets big "), "a", "Ask HN: alternatives to Notion?"),
      hit("Notion rocks", "b", "Ask HN: alternatives to Notion?"), // too short
    ]);

    const results = await fetchProductComments("Notion");
    expect(results).toHaveLength(1);
    expect(results[0].sourceType).toBe("review");
    expect(results[0].url).toBe("https://news.ycombinator.com/item?id=a");
    expect(confidenceOf(results[0])).toBe("unconfirmed");
  });

  it("rejects common-word false positives from unrelated threads", async () => {
    // The real failure this guards: searching "Linear" returns linear-algebra threads.
    stubHits([
      hit(long("That's linear extrapolation over 6 years, but the progression isn't "), "a", "Moore's law is ending"),
      hit(long("Strang's linear algebra lectures are the best resource "), "b", "Best math courses"),
    ]);

    expect(await fetchProductComments("Linear")).toEqual([]);
  });

  it("confirms a comment that cites the product domain, whatever the thread is", async () => {
    stubHits([
      hit(long("we moved to linear.app last quarter and the triage flow is "), "a", "Moore's law is ending"),
    ]);

    const results = await fetchProductComments("Linear", "https://linear.app");
    expect(results).toHaveLength(1);
    expect(confidenceOf(results[0])).toBe("confirmed");
  });

  it("confirms every substantive comment on a thread about the product's own site", async () => {
    stubHits([
      // No mention of the name at all — but the thread is a discussion of linear.app itself.
      hit(long("the keyboard shortcuts are great but offline mode is "), "a", "Show HN: our new issue tracker", "https://linear.app/blog/x"),
    ]);

    const results = await fetchProductComments("Linear", "https://linear.app");
    expect(results).toHaveLength(1);
    expect(confidenceOf(results[0])).toBe("confirmed");
  });

  it("drops hiring threads even though they cite the product", async () => {
    // Job ads list the product in a stack, passing attribution while saying nothing about it.
    stubHits([
      hit(long("Post Up | Backend Engineer | NYC | we use linear.app and "), "a", "Ask HN: Who is hiring? (August 2026)"),
      hit(long("Acme | Remote | our stack includes linear.app plus "), "b", "Ask HN: Who wants to be hired? (August 2026)"),
      hit(long("linear.app cycles are great but the roadmap view is "), "c", "Ask HN: thoughts on Linear?"),
    ]);

    const results = await fetchProductComments("Linear", "https://linear.app");
    expect(results).toHaveLength(1);
    expect(results[0].url).toContain("id=c");
  });

  it("requires the comment itself to name the product, not just the thread", async () => {
    stubHits([
      hit(long("I just use plain text files for everything and it works fine "), "a", "Ask HN: alternatives to Notion?"),
    ]);

    expect(await fetchProductComments("Notion")).toEqual([]);
  });

  it("ranks confirmed comments above name-only matches", async () => {
    stubHits([
      hit(long("Linear feels fast but the search is "), "a", "Ask HN: thoughts on Linear?"),
      hit(long("linear.app search never finds old issues, which is "), "b", "Ask HN: thoughts on Linear?"),
    ]);

    const results = await fetchProductComments("Linear", "https://linear.app");
    expect(results).toHaveLength(2);
    expect(results[0].url).toContain("id=b");
    expect(confidenceOf(results[0])).toBe("confirmed");
    expect(confidenceOf(results[1])).toBe("unconfirmed");
  });

  it("returns an empty array when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchProductComments("Notion")).toEqual([]);
  });
});

// ─── Report generation ────────────────────────────────────────────────────────

const teardown: TeardownResult = {
  target: {
    product: "TestProduct",
    url: "https://example.com",
    category: "협업 도구",
    oneLine: "테스트용 협업 도구입니다.",
  },
  techKeyword: "collaborative editing",
  principles: [
    { name: "블록 모델", mechanism: "모든 것을 블록으로", whyItWorks: "유연성", evidence: "공식 문서" },
  ],
  faultLines: [
    {
      category: "시대적 타협",
      title: "대용량 문서에서 느려짐",
      evidence: "HN 댓글 다수",
      severity: "높음",
      opportunity: "증분 렌더링으로 해결 가능",
    },
  ],
  leapfrog: {
    conceptName: "NewConcept",
    positioning: "빠른 협업 편집기",
    thesis: "지금은 CRDT가 성숙했다",
    features: [
      {
        name: "증분 렌더링",
        description: "보이는 부분만 렌더",
        addressesFaultLine: "대용량 문서에서 느려짐",
        originalApproach: "전체 트리 렌더",
        newApproach: "뷰포트 기반 렌더",
      },
    ],
    architectureShift: "문서 트리를 스트림으로 전환",
    moat: "기존 데이터 모델과 호환되지 않음",
  },
  divergence: { score: 78, verdict: "통과", overlaps: [], legalNotes: ["상표 확인 필요"] },
  regenerated: false,
};

const analysis: AnalysisResult = {
  coreTechnologies: ["CRDT"],
  openSourceReferences: [],
  similarServices: [],
  implementationDifficulty: "고급",
  difficultyReason: "동시 편집이 어렵다",
  licenseNotes: [],
  techStack: {
    frontend: ["React"],
    backend: ["Node.js"],
    ai: [],
    database: ["Postgres"],
    deployment: ["Fly.io"],
  },
  coreFeatures: ["편집"],
  developmentPhases: [{ phase: "1단계", duration: "2주", tasks: ["설계"] }],
  risks: [{ risk: "성능", mitigation: "벤치마크" }],
  summary: "요약",
};

describe("countConfirmedReviews", () => {
  it("separates confirmed from weakly-attributed evidence", () => {
    const review = (confidence: string, id: string): SourceItem => ({
      sourceType: "review",
      title: "t",
      url: `https://news.ycombinator.com/item?id=${id}`,
      description: "d",
      score: 0.5,
      metadata: { confidence },
    });
    const counts = countConfirmedReviews([
      review("confirmed", "a"),
      review("unconfirmed", "b"),
      review("confirmed", "c"),
    ]);
    expect(counts).toEqual({ confirmed: 2, total: 3 });
  });
});

describe("generateTeardownMarkdown", () => {
  it("renders every stage of the chain", () => {
    const md = generateTeardownMarkdown(teardown, analysis, []);
    expect(md).toContain("# 역설계 기반 신규 앱 설계서: NewConcept");
    expect(md).toContain("TestProduct");
    expect(md).toContain("블록 모델");
    expect(md).toContain("대용량 문서에서 느려짐");
    expect(md).toContain("증분 렌더링");
    expect(md).toContain("78/100");
    expect(md).toContain("상표 확인 필요");
  });

  it("traces each feature back to the fault line it removes", () => {
    const md = generateTeardownMarkdown(teardown, analysis, []);
    expect(md).toContain("| 해소하는 균열 | 대용량 문서에서 느려짐 |");
    expect(md).toContain("| 원본의 방식 | 전체 트리 렌더 |");
  });

  it("renders without an implementation plan", () => {
    const md = generateTeardownMarkdown(teardown, null, []);
    expect(md).toContain("NewConcept");
    expect(md).toContain("_기술 스택을 생성하지 못했습니다._");
  });

  it("degrades gracefully when a stage produced nothing", () => {
    const empty: TeardownResult = {
      ...teardown,
      principles: [],
      faultLines: [],
      leapfrog: { ...teardown.leapfrog, features: [], architectureShift: "", moat: "" },
    };
    const md = generateTeardownMarkdown(empty, analysis, []);
    expect(md).toContain("_작동 원리를 추출하지 못했습니다");
    expect(md).toContain("_균열을 발견하지 못했습니다._");
    expect(md).toContain("_핵심 기능을 설계하지 못했습니다._");
  });

  it("flags a low divergence score as requiring rework", () => {
    const derivative: TeardownResult = {
      ...teardown,
      regenerated: true,
      divergence: {
        score: 35,
        verdict: "재설계 필요",
        overlaps: [{ item: "사이드바 구조", risk: "원본 UI 답습", fix: "정보 구조를 재설계" }],
        legalNotes: [],
      },
    };
    const md = generateTeardownMarkdown(derivative, analysis, []);
    expect(md).toContain("재설계 필요");
    expect(md).toContain("원본 의존도가 높습니다");
    expect(md).toContain("사이드바 구조");
    expect(md).toContain("재설계 1회 수행");
  });
});
