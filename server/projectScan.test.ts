import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { isLocalFsAllowed, scanProject } from "./projectScan";

let root = "";

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "bp-scan-"));
  await fs.mkdir(path.join(root, "src", "components"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "left-pad"), { recursive: true });
  await fs.mkdir(path.join(root, ".git"), { recursive: true });

  await fs.writeFile(path.join(root, "package.json"), '{"name":"demo","dependencies":{"react":"19"}}');
  await fs.writeFile(path.join(root, "README.md"), "# Demo\n\n로컬 데모 프로젝트");
  await fs.writeFile(path.join(root, "CLAUDE.md"), "# 에이전트 메모리");
  await fs.writeFile(path.join(root, "src", "index.ts"), "export const a = 1;");
  await fs.writeFile(path.join(root, "src", "components", "Button.tsx"), "export const B = () => null;");
  await fs.writeFile(path.join(root, "node_modules", "left-pad", "index.js"), "module.exports = 1;");
});

afterAll(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe("local filesystem gate", () => {
  const original = { nodeEnv: process.env.NODE_ENV, allow: process.env.ALLOW_LOCAL_FS };

  afterAll(() => {
    process.env.NODE_ENV = original.nodeEnv;
    if (original.allow === undefined) delete process.env.ALLOW_LOCAL_FS;
    else process.env.ALLOW_LOCAL_FS = original.allow;
  });

  it("is on for a local install and off for a plain production deploy", () => {
    delete process.env.ALLOW_LOCAL_FS;
    process.env.NODE_ENV = "development";
    expect(isLocalFsAllowed()).toBe(true);

    process.env.NODE_ENV = "production";
    expect(isLocalFsAllowed()).toBe(false);
  });

  it("honours an explicit ALLOW_LOCAL_FS in both directions", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_LOCAL_FS = "true";
    expect(isLocalFsAllowed()).toBe(true);

    process.env.NODE_ENV = "development";
    process.env.ALLOW_LOCAL_FS = "false";
    expect(isLocalFsAllowed()).toBe(false);
  });

  it("refuses to scan while disabled", async () => {
    process.env.ALLOW_LOCAL_FS = "false";
    await expect(scanProject(root)).rejects.toThrow("비활성화");
    process.env.ALLOW_LOCAL_FS = "true";
  });
});

describe("scanProject", () => {
  it("summarises the tree, manifests and README", async () => {
    const project = await scanProject(root);

    expect(project.path).toBe(path.resolve(root));
    expect(project.name).toBe(path.basename(root));
    expect(project.tree).toContain("src/");
    expect(project.tree).toContain("Button.tsx");
    expect(project.readme).toContain("로컬 데모 프로젝트");
    expect(project.manifests.map((m) => m.file)).toEqual(
      expect.arrayContaining(["package.json", "CLAUDE.md"])
    );
    expect(project.languages).toContain("TypeScript");
  });

  it("excludes dependency and VCS folders from the file count", async () => {
    const project = await scanProject(root);

    expect(project.tree).not.toContain("node_modules");
    // package.json, README.md, CLAUDE.md, index.ts, Button.tsx — left-pad is not counted.
    expect(project.fileCount).toBe(5);
  });

  it("rejects a missing folder", async () => {
    await expect(scanProject(path.join(root, "does-not-exist"))).rejects.toThrow(
      "폴더를 찾을 수 없습니다"
    );
  });

  it("rejects a path that is a file, not a folder", async () => {
    await expect(scanProject(path.join(root, "package.json"))).rejects.toThrow(
      "폴더를 찾을 수 없습니다"
    );
  });
});
