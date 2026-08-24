/**
 * Multi-source research collector
 * Fetches from GitHub, Hugging Face, Papers with Code, and Hacker News in parallel.
 */

export interface SourceItem {
  sourceType: "github" | "huggingface" | "papers" | "hackernews" | "web" | "review";
  title: string;
  url: string;
  description: string;
  score: number;
  metadata: Record<string, unknown>;
}

// ─── Score helpers ────────────────────────────────────────────────────────────

function recencyScore(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const days = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 7) return 1.0;
  if (days < 30) return 0.8;
  if (days < 90) return 0.6;
  if (days < 365) return 0.4;
  return 0.2;
}

function logScale(n: number, base = 1000): number {
  if (n <= 0) return 0;
  return Math.min(1, Math.log10(n + 1) / Math.log10(base + 1));
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

function getTopicQuery(keyword: string): string {
  return keyword
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // keep alphanumeric, spaces, and hyphens
    .replace(/\s+/g, "-");        // replace spaces with hyphens
}

export async function fetchGitHub(keyword: string): Promise<SourceItem[]> {
  try {
    const q = encodeURIComponent(keyword);
    const topic = getTopicQuery(keyword);
    
    const urls = [
      `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`
    ];
    if (topic && topic.length > 0) {
      urls.push(`https://api.github.com/search/repositories?q=topic:${encodeURIComponent(topic)}&sort=stars&order=desc&per_page=10`);
    }

    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "BuildPlanner/1.0",
    };

    const responses = await Promise.all(
      urls.map((url) => fetch(url, { headers }).catch(() => null))
    );

    const reposMap = new Map<string, GHRepo>();

    for (const res of responses) {
      if (res && res.ok) {
        try {
          const data = (await res.json()) as { items?: GHRepo[] };
          for (const repo of data.items ?? []) {
            reposMap.set(repo.full_name, repo);
          }
        } catch {
          // ignore parsing errors
        }
      }
    }

    const mergedRepos = Array.from(reposMap.values());

    return mergedRepos.map((repo) => {
      const stars = repo.stargazers_count ?? 0;
      const score =
        logScale(stars, 50000) * 0.5 +
        recencyScore(repo.pushed_at) * 0.3 +
        (repo.description ? 0.2 : 0);
      return {
        sourceType: "github" as const,
        title: repo.full_name,
        url: repo.html_url,
        description: repo.description ?? "",
        score: Math.round(score * 100) / 100,
        metadata: {
          stars,
          forks: repo.forks_count,
          language: repo.language,
          updatedAt: repo.pushed_at,
          license: repo.license?.spdx_id ?? null,
          topics: repo.topics ?? [],
        },
      };
    });
  } catch {
    return [];
  }
}

interface GHRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
  license: { spdx_id: string } | null;
  topics: string[];
}

// ─── Hugging Face ─────────────────────────────────────────────────────────────

export async function fetchHuggingFace(keyword: string): Promise<SourceItem[]> {
  try {
    const q = encodeURIComponent(keyword);
    const [modelsRes, spacesRes] = await Promise.all([
      fetch(
        `https://huggingface.co/api/models?search=${q}&sort=downloads&direction=-1&limit=6`,
        { headers: { "User-Agent": "BuildPlanner/1.0" } }
      ),
      fetch(
        `https://huggingface.co/api/spaces?search=${q}&sort=likes&direction=-1&limit=4`,
        { headers: { "User-Agent": "BuildPlanner/1.0" } }
      ),
    ]);

    const models: HFModel[] = modelsRes.ok ? await modelsRes.json() : [];
    const spaces: HFSpace[] = spacesRes.ok ? await spacesRes.json() : [];

    const modelItems: SourceItem[] = models.map((m) => {
      const downloads = m.downloads ?? 0;
      const likes = m.likes ?? 0;
      const score = logScale(downloads, 1000000) * 0.5 + logScale(likes, 10000) * 0.3 + recencyScore(m.lastModified) * 0.2;
      return {
        sourceType: "huggingface" as const,
        title: m.modelId ?? m.id,
        url: `https://huggingface.co/${m.modelId ?? m.id}`,
        description: (m.cardData?.language?.join(", ") ?? "") || "Hugging Face Model",
        score: Math.round(score * 100) / 100,
        metadata: {
          type: "model",
          downloads,
          likes,
          pipeline_tag: m.pipeline_tag ?? null,
          lastModified: m.lastModified,
          license: m.cardData?.license ?? null,
        },
      };
    });

    const spaceItems: SourceItem[] = spaces.map((s) => {
      const likes = s.likes ?? 0;
      const score = logScale(likes, 10000) * 0.6 + recencyScore(s.lastModified) * 0.4;
      return {
        sourceType: "huggingface" as const,
        title: s.id,
        url: `https://huggingface.co/spaces/${s.id}`,
        description: s.cardData?.title ?? "Hugging Face Space",
        score: Math.round(score * 100) / 100,
        metadata: {
          type: "space",
          likes,
          sdk: s.sdk ?? null,
          lastModified: s.lastModified,
        },
      };
    });

    return [...modelItems, ...spaceItems];
  } catch {
    return [];
  }
}

interface HFModel {
  id: string;
  modelId?: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  lastModified?: string;
  cardData?: { language?: string[]; license?: string };
}

interface HFSpace {
  id: string;
  likes?: number;
  sdk?: string;
  lastModified?: string;
  cardData?: { title?: string };
}

// ─── Papers with Code ─────────────────────────────────────────────────────────

export async function fetchPapersWithCode(keyword: string): Promise<SourceItem[]> {
  try {
    const q = encodeURIComponent(keyword);
    const res = await fetch(
      `https://paperswithcode.com/api/v1/papers/?q=${q}&ordering=-github_stars&items_per_page=8`,
      { headers: { "User-Agent": "BuildPlanner/1.0" } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: PWCPaper[] };
    return (data.results ?? []).map((p) => {
      const stars = p.github_stars ?? 0;
      const hasCode = !!p.repository;
      const score =
        logScale(stars, 10000) * 0.4 +
        (hasCode ? 0.3 : 0) +
        recencyScore(p.published) * 0.3;
      return {
        sourceType: "papers" as const,
        title: p.title,
        url: p.url_abs ?? `https://paperswithcode.com/paper/${p.id}`,
        description: p.abstract ? p.abstract.slice(0, 300) + "..." : "",
        score: Math.round(score * 100) / 100,
        metadata: {
          stars,
          hasCode,
          repository: p.repository ?? null,
          published: p.published,
          authors: p.authors ?? [],
        },
      };
    });
  } catch {
    return [];
  }
}

interface PWCPaper {
  id: string;
  title: string;
  abstract?: string;
  url_abs?: string;
  github_stars?: number;
  repository?: string;
  published?: string;
  authors?: string[];
}

// ─── Hugging Face Papers ──────────────────────────────────────────────────────

export async function fetchHFPapers(keyword: string): Promise<SourceItem[]> {
  try {
    const q = encodeURIComponent(keyword);
    const res = await fetch(
      `https://huggingface.co/api/papers/search?q=${q}`,
      { headers: { "User-Agent": "BuildPlanner/1.0" } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as HFPaperItem[];
    return (data ?? []).slice(0, 8).map((item) => {
      const p = item.paper;
      const upvotes = p.upvotes ?? 0;
      const score = logScale(upvotes, 500) * 0.6 + recencyScore(p.publishedAt) * 0.4;
      return {
        sourceType: "papers" as const,
        title: p.title,
        url: `https://huggingface.co/papers/${p.id}`,
        description: p.summary ? p.summary.slice(0, 300) + "..." : "Hugging Face Paper",
        score: Math.round(score * 100) / 100,
        metadata: {
          stars: 0,
          hasCode: true,
          repository: null,
          published: p.publishedAt,
          authors: (p.authors ?? []).map((a) => a.name),
          upvotes,
        },
      };
    });
  } catch {
    return [];
  }
}

interface HFPaperItem {
  paper: {
    id: string;
    title: string;
    summary?: string;
    publishedAt: string;
    upvotes?: number;
    authors?: Array<{ name: string }>;
  };
}

// ─── Hacker News ─────────────────────────────────────────────────────────────

export async function fetchHackerNews(keyword: string): Promise<SourceItem[]> {
  try {
    const q = encodeURIComponent(keyword);
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${q}&tags=(story,show_hn)&hitsPerPage=8`,
      { headers: { "User-Agent": "BuildPlanner/1.0" } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { hits?: HNHit[] };
    return (data.hits ?? [])
      .filter((h) => h.url || h.story_url)
      .map((h) => {
        const points = h.points ?? 0;
        const comments = h.num_comments ?? 0;
        const score =
          logScale(points, 1000) * 0.5 +
          logScale(comments, 500) * 0.2 +
          recencyScore(h.created_at) * 0.3;
        return {
          sourceType: "hackernews" as const,
          title: h.title,
          url: h.url ?? h.story_url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
          description: h.story_text ? h.story_text.replace(/<[^>]*>/g, "").slice(0, 300) : "",
          score: Math.round(score * 100) / 100,
          metadata: {
            points,
            comments,
            author: h.author,
            createdAt: h.created_at,
            hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
          },
        };
      });
  } catch {
    return [];
  }
}

interface HNHit {
  objectID: string;
  title: string;
  url?: string;
  story_url?: string;
  story_text?: string;
  points?: number;
  num_comments?: number;
  author?: string;
  created_at?: string;
}

// ─── Hacker News comments (teardown: unfiltered user complaints) ──────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Bare registrable host of a URL ("https://linear.app/x" → "linear.app"). */
export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * HN's recurring hiring threads are a large, noisy source of true-but-useless matches:
 * a job ad lists the product in its stack, so it passes attribution while saying nothing
 * about how the product behaves.
 */
const HIRING_THREAD = /who (is hiring|wants to be hired)|seeking freelancer|freelancer\?/i;

function decodeHnText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&#62;/g, ">")
    .replace(/&#60;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Searches HN *comments* rather than stories. Story titles announce what a product claims
 * to do; comments are where people say what it fails at — which is the raw material for
 * fault-line analysis.
 *
 * Matching is deliberately strict. Many product names are ordinary words ("Linear",
 * "Notion", "Arc"), and a plain substring match drags in linear-algebra threads that are
 * then handed to the LLM as evidence, manufacturing fault lines the product does not have.
 * Even the thread title is not enough on its own — "Linear Algebra Done Right" matches a
 * word-boundary search for "Linear".
 *
 * So each comment is graded rather than merely filtered:
 *   confirmed   — the comment cites the product's domain, or the thread is a discussion of
 *                 the product's own site (story_url). Unambiguous.
 *   unconfirmed — only the name matches. Kept for reach, but labelled so the analysis
 *                 prompt can discount it.
 */
export async function fetchProductComments(
  productName: string,
  targetUrl?: string | null
): Promise<SourceItem[]> {
  const domain = extractDomain(targetUrl);
  // The domain query is the high-precision one; the name query provides reach.
  const queries = domain ? [productName, domain] : [productName];

  try {
    const responses = await Promise.all(
      queries.map((q) =>
        fetch(
          `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=comment&hitsPerPage=30`,
          { headers: { "User-Agent": "BuildPlanner/1.0" } }
        ).catch(() => null)
      )
    );

    const hitsById = new Map<string, HNComment>();
    for (const res of responses) {
      if (!res || !res.ok) continue;
      try {
        const data = (await res.json()) as { hits?: HNComment[] };
        for (const h of data.hits ?? []) hitsById.set(h.objectID, h);
      } catch {
        // ignore parsing errors
      }
    }

    const namePattern = new RegExp(`\\b${escapeRegex(productName)}\\b`, "i");

    const results: SourceItem[] = [];
    for (const h of Array.from(hitsById.values())) {
      if (!h.comment_text) continue;
      if (HIRING_THREAD.test(h.story_title ?? "")) continue;

      const text = decodeHnText(h.comment_text);
      // One-liners ("we use X too") carry no diagnostic signal.
      if (text.length < 180) continue;

      const citesDomain = !!domain && text.toLowerCase().includes(domain);
      const threadIsProductSite = !!domain && extractDomain(h.story_url) === domain;
      const confirmed = citesDomain || threadIsProductSite;

      if (!confirmed) {
        // Fall back to name matching, which requires agreement between thread and comment.
        if (!namePattern.test(h.story_title ?? "")) continue;
        if (!namePattern.test(text)) continue;
      }

      // Longer and more recent comments tend to be the substantive critiques; a confirmed
      // attribution is worth more than any amount of length.
      const score =
        logScale(text.length, 3000) * 0.3 +
        recencyScore(h.created_at) * 0.3 +
        (confirmed ? 0.4 : 0);

      results.push({
        sourceType: "review" as const,
        title: h.story_title ?? `HN 댓글 by ${h.author ?? "unknown"}`,
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        description: text.slice(0, 1200),
        score: Math.round(score * 100) / 100,
        metadata: {
          author: h.author,
          storyTitle: h.story_title,
          createdAt: h.created_at,
          chars: text.length,
          confidence: confirmed ? "confirmed" : "unconfirmed",
        },
      });
    }

    return results.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

interface HNComment {
  objectID: string;
  comment_text?: string;
  story_title?: string;
  story_url?: string;
  author?: string;
  created_at?: string;
}

// ─── Main collect function ────────────────────────────────────────────────────

export async function collectAllSources(keyword: string): Promise<SourceItem[]> {
  const [github, hf, papersWithCode, hfPapers, hn] = await Promise.all([
    fetchGitHub(keyword),
    fetchHuggingFace(keyword),
    fetchPapersWithCode(keyword),
    fetchHFPapers(keyword),
    fetchHackerNews(keyword),
  ]);
  const papers = [...papersWithCode, ...hfPapers];
  return [...github, ...hf, ...papers, ...hn];
}

/**
 * Teardown-mode collection: everything is anchored on an existing product rather than an
 * idea. `techKeyword` is the product's underlying problem domain (e.g. "collaborative
 * whiteboard"), used to find the open-source building blocks and papers that a
 * re-implementation could stand on — the product name alone rarely surfaces those.
 */
export async function collectTargetIntel(
  productName: string,
  targetUrl: string | null,
  techKeyword: string
): Promise<SourceItem[]> {
  const { collectWebIntel } = await import("./webIntel");

  const [web, comments, productStories, productRepos, techRepos, techModels, techPapers] =
    await Promise.all([
      targetUrl ? collectWebIntel(targetUrl) : Promise.resolve([]),
      fetchProductComments(productName, targetUrl),
      fetchHackerNews(productName),
      fetchGitHub(productName),
      fetchGitHub(techKeyword),
      fetchHuggingFace(techKeyword),
      fetchHFPapers(techKeyword),
    ]);

  // The same repo can surface under both the product name and the tech keyword.
  const seen = new Set<string>();
  const dedupe = (items: SourceItem[]) =>
    items.filter((item) => {
      const key = `${item.sourceType}::${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return [
    ...dedupe(web),
    ...dedupe(comments),
    ...dedupe(productStories),
    ...dedupe(productRepos),
    ...dedupe(techRepos),
    ...dedupe(techModels),
    ...dedupe(techPapers),
  ];
}
