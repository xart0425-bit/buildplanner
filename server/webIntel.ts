/**
 * Public-page intelligence collector for teardown mode.
 *
 * Reads ONLY publicly served marketing/docs pages of a target product so the LLM can
 * infer *operating principles*. It deliberately does not touch anything behind a login,
 * does not attempt to fetch application bundles, and honours robots.txt — the goal is to
 * understand how a product works, never to reproduce its implementation.
 */
import type { SourceItem } from "./collector";

const USER_AGENT = "BuildPlanner/1.0";
const FETCH_TIMEOUT_MS = 8000;
const MAX_TEXT_CHARS = 6000;

/** Paths most products expose publicly and that carry the most signal per byte. */
const CANDIDATE_PATHS = [
  { path: "/", label: "랜딩 페이지", weight: 1.0 },
  { path: "/pricing", label: "가격 정책", weight: 0.95 },
  { path: "/features", label: "기능 소개", weight: 0.9 },
  { path: "/docs", label: "문서", weight: 0.85 },
  { path: "/changelog", label: "변경 이력", weight: 0.8 },
  { path: "/about", label: "소개", weight: 0.6 },
];

// ─── robots.txt ───────────────────────────────────────────────────────────────

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

/**
 * Minimal robots.txt parser. Collects rules from the `*` group (and any group naming
 * BuildPlanner explicitly). On any failure we return an empty ruleset, matching the
 * convention that an unreachable robots.txt does not itself forbid crawling.
 */
export function parseRobots(body: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [] };
  let inScope = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const sepIdx = line.indexOf(":");
    if (sepIdx === -1) continue;

    const field = line.slice(0, sepIdx).trim().toLowerCase();
    const value = line.slice(sepIdx + 1).trim();

    if (field === "user-agent") {
      const ua = value.toLowerCase();
      inScope = ua === "*" || ua === "buildplanner";
      continue;
    }
    if (!inScope) continue;
    if (field === "disallow" && value) rules.disallow.push(value);
    if (field === "allow" && value) rules.allow.push(value);
  }

  return rules;
}

/** Longest-match wins, with Allow beating Disallow at equal length (robots.txt convention). */
export function isPathAllowed(path: string, rules: RobotsRules): boolean {
  const match = (patterns: string[]) =>
    patterns.reduce((longest, p) => (path.startsWith(p) && p.length > longest ? p.length : longest), 0);

  const disallowLen = match(rules.disallow);
  if (disallowLen === 0) return true;
  return match(rules.allow) >= disallowLen;
}

async function fetchRobots(origin: string): Promise<RobotsRules> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { disallow: [], allow: [] };
    return parseRobots(await res.text());
  } catch {
    return { disallow: [], allow: [] };
  }
}

// ─── HTML → text ──────────────────────────────────────────────────────────────

/**
 * Strips markup down to readable prose. Crude on purpose: the LLM only needs the wording
 * of headlines, feature blurbs and pricing tiers, not a faithful DOM.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim() || null;
}

// ─── Collector ────────────────────────────────────────────────────────────────

export function normalizeTargetUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Fetches the target product's public pages. Every page is attempted independently so a
 * single 404 (most products lack /changelog) never sinks the batch.
 */
export async function collectWebIntel(targetUrl: string): Promise<SourceItem[]> {
  const normalized = normalizeTargetUrl(targetUrl);
  if (!normalized) return [];

  let origin: string;
  let basePath: string;
  try {
    const u = new URL(normalized);
    origin = u.origin;
    basePath = u.pathname.replace(/\/$/, "");
  } catch {
    return [];
  }

  const rules = await fetchRobots(origin);

  const targets = CANDIDATE_PATHS.map((c) => ({
    ...c,
    // A URL with its own path ("example.com/product") keeps that path as the root page.
    url: c.path === "/" ? `${origin}${basePath || "/"}` : `${origin}${c.path}`,
  })).filter((c) => {
    const path = new URL(c.url).pathname;
    if (!isPathAllowed(path, rules)) {
      console.log(`[WebIntel] robots.txt disallows ${path} — skipping`);
      return false;
    }
    return true;
  });

  const results = await Promise.all(
    targets.map(async (t): Promise<SourceItem | null> => {
      try {
        const res = await fetch(t.url, {
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: "follow",
        });
        if (!res.ok) return null;

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("html")) return null;

        const html = await res.text();
        const text = htmlToText(html);
        if (text.length < 120) return null; // JS-only shell — nothing worth analysing

        return {
          sourceType: "web" as const,
          title: extractTitle(html) ?? `${t.label} — ${origin}`,
          url: t.url,
          description: text,
          score: Math.round(t.weight * 100) / 100,
          metadata: { pageLabel: t.label, chars: text.length, fetchedFrom: origin },
        };
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is SourceItem => r !== null);
}
