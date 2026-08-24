import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { createZip, sanitizeZipPath } from "./zip";
import {
  buildScaffoldFiles,
  fallbackSpecPack,
  resolveTargetAgent,
  toSlug,
  type ScaffoldInput,
} from "./scaffold";
import type { AnalysisResult } from "./analyzer";

const analysis: AnalysisResult = {
  coreTechnologies: ["React", "Node.js"],
  openSourceReferences: [{ name: "LangChain", url: "https://github.com/x/y", description: "LLM" }],
  similarServices: [{ name: "ChatGPT", description: "chatbot" }],
  implementationDifficulty: "중급",
  difficultyReason: "API 연동 필요",
  licenseNotes: ["MIT"],
  techStack: {
    frontend: ["React"],
    backend: ["Node.js"],
    ai: ["OpenAI API"],
    database: ["PostgreSQL"],
    deployment: ["Vercel"],
  },
  coreFeatures: ["영상 업로드", "썸네일 생성", "중복 감지"],
  developmentPhases: [{ phase: "1단계: 기획", duration: "1주", tasks: ["요구사항 정의"] }],
  risks: [{ risk: "API 비용", mitigation: "캐싱" }],
  summary: "영상 관리 도구입니다.",
};

const baseInput: ScaffoldInput = {
  keyword: "AI video editor",
  mode: "keyword",
  analysis,
  teardown: null,
  sources: [
    {
      sourceType: "github",
      title: "test/repo",
      url: "https://github.com/test/repo",
      description: "Test",
      score: 0.8,
      metadata: {},
    },
  ],
  planMarkdown: "# 계획서",
  attachments: null,
  agent: "claude",
  modelLabel: "claude-opus-5",
  language: "en",
};

// ─── ZIP writer ───────────────────────────────────────────────────────────────

describe("createZip", () => {
  it("writes a readable archive with the expected signatures", () => {
    const zip = createZip([{ path: "a/b.txt", content: "hello" }]);

    expect(zip.readUInt32LE(0)).toBe(0x04034b50); // local file header
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50); // end of central directory
    expect(zip.readUInt16LE(zip.length - 14)).toBe(1); // one entry
  });

  it("round-trips through a real unzip implementation", () => {
    const zip = createZip([
      { path: "README.md", content: "# 한글 제목\n" },
      { path: "specs/SPEC-001.md", content: "x".repeat(5000) },
      { path: "assets/bin.dat", content: Buffer.from([0, 1, 2, 3, 255]) },
    ]);

    // PowerShell's Expand-Archive is the extractor the user will actually hit on Windows.
    const script = `
      $ErrorActionPreference = 'Stop'
      $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
      New-Item -ItemType Directory -Path $tmp | Out-Null
      $zipPath = Join-Path $tmp 'kit.zip'
      [IO.File]::WriteAllBytes($zipPath, [Convert]::FromBase64String($env:ZIP_B64))
      Expand-Archive -Path $zipPath -DestinationPath (Join-Path $tmp 'out') -Force
      # Emit raw bytes as base64 — the console codepage would mangle UTF-8 text on stdout.
      $readme = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $tmp 'out/README.md')))
      $spec = [IO.File]::ReadAllBytes((Join-Path $tmp 'out/specs/SPEC-001.md')).Length
      $bin = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $tmp 'out/assets/bin.dat')))
      Write-Output ("{0}|{1}|{2}" -f $readme, $spec, $bin)
      Remove-Item -Recurse -Force $tmp
    `;

    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { env: { ...process.env, ZIP_B64: zip.toString("base64") }, encoding: "utf8" }
    ).trim();

    const [readme, specLength, bin] = output.split("|");
    expect(Buffer.from(readme, "base64").toString("utf8")).toBe("# 한글 제목\n");
    expect(Number(specLength)).toBe(5000);
    expect([...Buffer.from(bin, "base64")]).toEqual([0, 1, 2, 3, 255]);
  });

  it("strips path traversal segments", () => {
    expect(sanitizeZipPath("../../etc/passwd")).toBe("etc/passwd");
    expect(sanitizeZipPath("a\\b/./c")).toBe("a/b/c");
  });
});

// ─── Scaffold ─────────────────────────────────────────────────────────────────

describe("resolveTargetAgent", () => {
  it("keeps an explicit choice", () => {
    expect(resolveTargetAgent("cursor", { geminiKey: "k" })).toBe("cursor");
  });

  it("derives the agent from the configured model name", () => {
    expect(resolveTargetAgent("auto", { customModel: "claude-opus-5" })).toBe("claude");
    expect(resolveTargetAgent("auto", { customModel: "gemini-2.5-flash" })).toBe("gemini");
    expect(resolveTargetAgent("auto", { customModel: "gpt-4o-mini" })).toBe("codex");
  });

  it("falls back to the configured key when no model is named", () => {
    expect(resolveTargetAgent("auto", { geminiKey: "k" })).toBe("gemini");
    expect(resolveTargetAgent("auto", { openaiKey: "k" })).toBe("codex");
  });
});

describe("toSlug", () => {
  it("produces a filesystem-safe folder name", () => {
    expect(toSlug("AI Video Editor!")).toBe("ai-video-editor");
  });

  it("falls back when the input has no usable ascii", () => {
    expect(toSlug("한글만 있는 제목")).toBe("buildplanner-app");
  });
});

describe("buildScaffoldFiles", () => {
  const pack = fallbackSpecPack(baseInput);

  it("emits the loop, spec and context skeleton", () => {
    const paths = buildScaffoldFiles(pack, baseInput).map((f) => f.path);

    for (const expected of [
      "README.md",
      "CLAUDE.md",
      "loop/GOAL.md",
      "loop/PROGRESS.md",
      "loop/RALPH.md",
      "loop/EVALUATOR.md",
      "specs/INDEX.md",
      "context/architecture.md",
      "context/tech-stack.md",
      "context/references.md",
      "scripts/loop.sh",
      "scripts/loop.ps1",
      "docs/BUILD-PLAN.md",
      ".gitignore",
    ]) {
      expect(paths).toContain(expected);
    }
    expect(paths.filter((p) => /^specs\/SPEC-\d{3}/.test(p))).toHaveLength(pack.specs.length);
  });

  it("writes the memory file and slash commands for the chosen agent", () => {
    const claude = buildScaffoldFiles(pack, baseInput).map((f) => f.path);
    expect(claude).toContain("CLAUDE.md");
    expect(claude).toContain(".claude/commands/loop.md");
    expect(claude).toContain(".claude/agents/evaluator.md");

    const gemini = buildScaffoldFiles(pack, { ...baseInput, agent: "gemini" }).map((f) => f.path);
    expect(gemini).toContain("GEMINI.md");
    expect(gemini).toContain(".gemini/commands/loop.toml");
    expect(gemini).not.toContain("CLAUDE.md");

    const cursor = buildScaffoldFiles(pack, { ...baseInput, agent: "cursor" }).map((f) => f.path);
    expect(cursor).toContain("AGENTS.md");
    expect(cursor).toContain(".cursor/rules/00-project.mdc");
  });

  it("turns every core feature into a spec with checkable criteria", () => {
    const files = buildScaffoldFiles(pack, baseInput);
    const specFile = files.find((f) => f.path.startsWith("specs/SPEC-001"));
    expect(specFile).toBeDefined();
    expect(String(specFile!.content)).toContain("## Acceptance Criteria");
    expect(String(specFile!.content)).toContain("- [ ]");
  });

  it("carries attachments into docs/ and assets/", () => {
    const files = buildScaffoldFiles(pack, {
      ...baseInput,
      attachments: {
        docs: [{ name: "spec.md", content: "# 요구사항" }],
        images: [
          {
            name: "hero shot.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          },
        ],
      },
    });
    const paths = files.map((f) => f.path);

    expect(paths).toContain("docs/attachments/spec.md");
    expect(paths).toContain("assets/references/hero-shot.png");
    expect(Buffer.isBuffer(files.find((f) => f.path.endsWith("hero-shot.png"))!.content)).toBe(true);
  });

  it("writes the whole kit in the selected language", () => {
    const koPack = fallbackSpecPack({ ...baseInput, language: "ko" });
    const ko = buildScaffoldFiles(koPack, { ...baseInput, language: "ko" });
    const koRalph = String(ko.find((f) => f.path === "loop/RALPH.md")!.content);
    const koGoal = String(ko.find((f) => f.path === "loop/GOAL.md")!.content);
    expect(koRalph).toContain("한 번의 반복");
    expect(koGoal).toContain("# GOAL — 무엇을, 어디까지");

    // Every other language must be free of Korean *template* text. The fixture's own
    // analysis prose is Korean, so use an all-English analysis: anything Korean that
    // survives can only have come from a hardcoded template string.
    const asciiInput = {
      ...baseInput,
      // Copied through verbatim by design, so it must not be Korean for this check.
      planMarkdown: "# plan",
      analysis: {
        ...analysis,
        summary: "A local video tool.",
        difficultyReason: "media pipeline is tricky",
        coreFeatures: ["upload video", "generate thumbnails"],
        licenseNotes: ["check ffmpeg LGPL"],
        risks: [{ risk: "encoding perf", mitigation: "split workers" }],
        developmentPhases: [{ phase: "PoC", duration: "1w", tasks: ["verify ffmpeg"] }],
      },
    };

    for (const language of ["en", "ja", "zh", "fr", "ru"] as const) {
      const pack = fallbackSpecPack({ ...asciiInput, language });
      const files = buildScaffoldFiles(pack, { ...asciiInput, language });
      for (const file of files) {
        if (Buffer.isBuffer(file.content)) continue;
        expect(
          /[가-힣]{2,}/.test(file.content),
          `${language} kit leaked Korean into ${file.path}`
        ).toBe(false);
      }
    }
  });

  it("names the loop script command after the selected agent CLI", () => {
    const claudeScript = buildScaffoldFiles(pack, baseInput).find(
      (f) => f.path === "scripts/loop.ps1"
    );
    expect(String(claudeScript!.content)).toContain("claude -p");
    // PowerShell 5.1 needs the BOM and an explicit read encoding or the Korean text breaks.
    expect(String(claudeScript!.content).charCodeAt(0)).toBe(0xfeff);
    expect(String(claudeScript!.content)).toContain("-Encoding UTF8 loop/RALPH.md");

    const codexScript = buildScaffoldFiles(pack, { ...baseInput, agent: "codex" }).find(
      (f) => f.path === "scripts/loop.ps1"
    );
    expect(String(codexScript!.content)).toContain("codex exec");
  });
});
