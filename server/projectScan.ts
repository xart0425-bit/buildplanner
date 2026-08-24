/**
 * Local project folder browsing and scanning.
 *
 * BuildPlanner runs on the user's own machine (it already spawns the local tracker and
 * reads local processes), so "참고할 프로젝트 폴더" means a real absolute path on that
 * machine rather than an upload. This module lets the UI walk the filesystem and then
 * distils a chosen folder into the summary an LLM actually needs: the shape of the tree,
 * the manifests, the agent memory files and the README — never the whole source.
 *
 * NOTE: if this server is ever deployed to a shared host, these procedures browse *that*
 * host's disk. They are login-gated for that reason and must stay that way.
 */
import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import type { ProjectRef } from "@shared/attachments";

/** Directories that carry no design signal but would blow up the walk. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".parcel-cache",
  ".cache",
  "coverage",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".idea",
  ".gradle",
  "obj",
  "bin",
  "Pods",
  ".terraform",
  ".pytest_cache",
  ".mypy_cache",
]);

/** Root-level files worth quoting to the model, in priority order. */
const MANIFEST_FILES = [
  "package.json",
  "pnpm-workspace.yaml",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "composer.json",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "tsconfig.json",
  "docker-compose.yml",
  "Dockerfile",
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
];

const README_FILES = ["README.md", "readme.md", "README.MD", "README.txt", "README"];

const EXTENSION_LANGUAGES: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript(React)",
  ".js": "JavaScript",
  ".jsx": "JavaScript(React)",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".css": "CSS",
  ".scss": "SCSS",
  ".html": "HTML",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".sql": "SQL",
  ".sh": "Shell",
  ".ps1": "PowerShell",
  ".md": "Markdown",
};

const MAX_DEPTH = 4;
const MAX_ENTRIES = 6000;
const MAX_TREE_LINES = 160;
const MAX_MANIFEST_CHARS = 6000;
const MAX_README_CHARS = 8000;

/**
 * These procedures read the disk of whatever machine runs the server and can spawn a
 * desktop dialog on it. That is the point when BuildPlanner runs as a local tool, and a
 * hole when it is hosted — especially while `authenticateRequest` hands every caller a
 * guest admin session. So the capability is opt-in in production.
 *
 * Local dev (NODE_ENV !== "production") keeps it on; a deployment must set
 * ALLOW_LOCAL_FS=true deliberately, and should only do so for a single-user instance.
 */
export function isLocalFsAllowed(): boolean {
  if (process.env.ALLOW_LOCAL_FS === "true") return true;
  if (process.env.ALLOW_LOCAL_FS === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function assertLocalFsAllowed(): void {
  if (isLocalFsAllowed()) return;
  throw new Error(
    "이 서버에서는 로컬 폴더 참조 기능이 비활성화되어 있습니다. " +
      "호스팅된 데모에서는 서버 디스크를 노출하지 않도록 기본으로 꺼져 있으며, " +
      "직접 설치해 실행하면 사용할 수 있습니다."
  );
}

/** The native dialog blocks on a human; give up rather than hold the request forever. */
const PICKER_TIMEOUT_MS = 5 * 60_000;

/**
 * Opens the real Windows folder-browse dialog on the machine running the server and
 * returns the chosen path (null when the user cancels).
 *
 * The result travels through a temp file rather than stdout: PowerShell 5.1 writes stdout
 * in the console codepage, which would mangle any non-ASCII path.
 */
export async function pickFolderDialog(initialPath?: string): Promise<string | null> {
  assertLocalFsAllowed();
  if (process.platform !== "win32") {
    throw new Error("폴더 찾기 창은 Windows에서만 지원됩니다. 경로를 직접 입력하거나 목록에서 선택해 주세요.");
  }

  const id = randomUUID();
  const scriptPath = path.join(os.tmpdir(), `buildplanner-pick-${id}.ps1`);
  const resultPath = path.join(os.tmpdir(), `buildplanner-pick-${id}.txt`);

  /*
   * The dialog is launched by a background server process, so Windows refuses to let it
   * take the foreground on its own — it opens *behind* the browser and looks like nothing
   * happened. Three things fix that, in order of importance:
   *   1. AttachThreadInput to the current foreground thread, which lifts the foreground
   *      lock long enough for SetForegroundWindow to succeed.
   *   2. A TopMost owner window, so the dialog is z-ordered above the browser regardless.
   *   3. A taskbar button on that owner as the escape hatch if both of the above fail.
   */
  const script = `﻿Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace BuildPlanner -Name Native -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
"@

# Windows PowerShell runs on .NET Framework, whose FolderBrowserDialog is the cramped
# tree-view dialog from XP. The Explorer-style window users expect is the Common Item
# Dialog (IFileOpenDialog) in folder-pick mode, which has to be driven through COM.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace BuildPlanner
{
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, out IntPtr ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IFileDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, int fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
    }

    [ComImport, ClassInterface(ClassInterfaceType.None), Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
    internal class FileOpenDialogRcw { }

    public static class FolderPicker
    {
        private const uint FOS_NOCHANGEDIR = 0x00000008;
        private const uint FOS_PICKFOLDERS = 0x00000020;
        private const uint FOS_FORCEFILESYSTEM = 0x00000040;
        private const uint SIGDN_FILESYSPATH = 0x80058000;

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        private static extern void SHCreateItemFromParsingName(
            [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
            IntPtr pbc,
            ref Guid riid,
            [MarshalAs(UnmanagedType.Interface)] out object ppv);

        public static string Show(IntPtr owner, string initialPath, string title)
        {
            IFileDialog dialog = (IFileDialog)new FileOpenDialogRcw();
            try
            {
                uint options;
                dialog.GetOptions(out options);
                dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR);
                if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);
                dialog.SetOkButtonLabel("이 폴더 선택");

                if (!string.IsNullOrEmpty(initialPath))
                {
                    try
                    {
                        Guid shellItemGuid = typeof(IShellItem).GUID;
                        object item;
                        SHCreateItemFromParsingName(initialPath, IntPtr.Zero, ref shellItemGuid, out item);
                        dialog.SetFolder((IShellItem)item);
                    }
                    catch { /* a stale starting folder must not block the picker */ }
                }

                // Anything non-zero means the user cancelled or the shell refused.
                if (dialog.Show(owner) != 0) return null;

                IShellItem result;
                dialog.GetResult(out result);
                IntPtr pszPath;
                result.GetDisplayName(SIGDN_FILESYSPATH, out pszPath);
                try { return Marshal.PtrToStringUni(pszPath); }
                finally { Marshal.FreeCoTaskMem(pszPath); }
            }
            finally
            {
                Marshal.ReleaseComObject(dialog);
            }
        }
    }
}
"@

$owner = New-Object System.Windows.Forms.Form
$owner.Text = 'BuildPlanner — 폴더 선택'
$owner.TopMost = $true
$owner.ShowInTaskbar = $true
$owner.FormBorderStyle = 'FixedToolWindow'
$owner.StartPosition = 'CenterScreen'
$owner.Width = 1
$owner.Height = 1
$owner.Opacity = 0
$owner.Show()
[System.Windows.Forms.Application]::DoEvents()

$foreground = [BuildPlanner.Native]::GetForegroundWindow()
$foregroundThread = [BuildPlanner.Native]::GetWindowThreadProcessId($foreground, [IntPtr]::Zero)
$currentThread = [BuildPlanner.Native]::GetCurrentThreadId()
[void][BuildPlanner.Native]::AttachThreadInput($foregroundThread, $currentThread, $true)
[void][BuildPlanner.Native]::BringWindowToTop($owner.Handle)
[void][BuildPlanner.Native]::SetForegroundWindow($owner.Handle)
[void][BuildPlanner.Native]::AttachThreadInput($foregroundThread, $currentThread, $false)
$owner.Activate()
[System.Windows.Forms.Application]::DoEvents()

$initial = ''
if ($env:BP_INITIAL_PATH -and (Test-Path $env:BP_INITIAL_PATH)) { $initial = $env:BP_INITIAL_PATH }

$selected = $null
try {
    $selected = [BuildPlanner.FolderPicker]::Show($owner.Handle, $initial, '참고할 프로젝트 폴더 선택')
} catch {
    # Pre-Vista shells and locked-down COM fall back to the old tree dialog.
    $legacy = New-Object System.Windows.Forms.FolderBrowserDialog
    $legacy.Description = '참고할 프로젝트 폴더를 선택하세요'
    if ($initial) { $legacy.SelectedPath = $initial }
    if ($legacy.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        $selected = $legacy.SelectedPath
    }
}

$owner.Close()

if ($selected) {
    [IO.File]::WriteAllText($env:BP_RESULT_PATH, $selected, [Text.Encoding]::UTF8)
}
`;

  await fs.writeFile(scriptPath, script, "utf8");

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        ["-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        {
          windowsHide: true,
          stdio: "ignore",
          env: {
            ...process.env,
            BP_RESULT_PATH: resultPath,
            BP_INITIAL_PATH: initialPath ?? "",
          },
        }
      );

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("폴더 찾기 창이 응답하지 않아 취소했습니다."));
      }, PICKER_TIMEOUT_MS);

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`폴더 찾기 창을 열지 못했습니다: ${err.message}`));
      });
      child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const selected = await fs.readFile(resultPath, "utf8").catch(() => "");
    return selected.trim() || null;
  } finally {
    await fs.rm(scriptPath, { force: true }).catch(() => {});
    await fs.rm(resultPath, { force: true }).catch(() => {});
  }
}

interface WalkState {
  lines: string[];
  fileCount: number;
  entryCount: number;
  extensions: Map<string, number>;
  truncated: boolean;
}

async function walk(dir: string, prefix: string, depth: number, state: WalkState): Promise<void> {
  if (depth > MAX_DEPTH || state.entryCount >= MAX_ENTRIES) {
    state.truncated = state.truncated || state.entryCount >= MAX_ENTRIES;
    return;
  }

  const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const dirs = dirents
    .filter((d) => d.isDirectory() && !IGNORED_DIRS.has(d.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = dirents.filter((d) => d.isFile()).sort((a, b) => a.name.localeCompare(b.name));

  for (const file of files) {
    state.fileCount++;
    state.entryCount++;
    const ext = path.extname(file.name).toLowerCase();
    if (ext) state.extensions.set(ext, (state.extensions.get(ext) ?? 0) + 1);
  }

  // The tree is for orientation, not an inventory: show a few files per directory.
  const shownFiles = files.slice(0, depth === 0 ? 12 : 6);
  for (const file of shownFiles) {
    if (state.lines.length >= MAX_TREE_LINES) {
      state.truncated = true;
      return;
    }
    state.lines.push(`${prefix}${file.name}`);
  }
  if (files.length > shownFiles.length && state.lines.length < MAX_TREE_LINES) {
    state.lines.push(`${prefix}… (파일 ${files.length - shownFiles.length}개 더)`);
  }

  for (const child of dirs) {
    if (state.lines.length >= MAX_TREE_LINES || state.entryCount >= MAX_ENTRIES) {
      state.truncated = true;
      return;
    }
    state.entryCount++;
    state.lines.push(`${prefix}${child.name}/`);
    await walk(path.join(dir, child.name), `${prefix}  `, depth + 1, state);
  }
}

async function readExcerpt(filePath: string, limit: number): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > 2_000_000) return null;
    const content = await fs.readFile(filePath, "utf8");
    return content.length > limit ? `${content.slice(0, limit)}\n…(생략)` : content;
  } catch {
    return null;
  }
}

/** Reads a folder into the compact summary that gets attached to an idea. */
export async function scanProject(target: string): Promise<ProjectRef> {
  assertLocalFsAllowed();
  const resolved = path.resolve(target.trim());
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`폴더를 찾을 수 없습니다: ${resolved}`);
  }

  const state: WalkState = {
    lines: [],
    fileCount: 0,
    entryCount: 0,
    extensions: new Map(),
    truncated: false,
  };
  await walk(resolved, "", 0, state);

  const manifests: ProjectRef["manifests"] = [];
  for (const file of MANIFEST_FILES) {
    if (manifests.length >= 10) break;
    const excerpt = await readExcerpt(path.join(resolved, file), MAX_MANIFEST_CHARS);
    if (excerpt) manifests.push({ file, excerpt });
  }

  let readme = "";
  for (const file of README_FILES) {
    const excerpt = await readExcerpt(path.join(resolved, file), MAX_README_CHARS);
    if (excerpt) {
      readme = excerpt;
      break;
    }
  }

  const languages = Array.from(state.extensions.entries())
    .filter(([ext]) => EXTENSION_LANGUAGES[ext])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ext]) => EXTENSION_LANGUAGES[ext]);

  return {
    path: resolved,
    name: path.basename(resolved) || resolved,
    fileCount: state.fileCount,
    languages: Array.from(new Set(languages)),
    tree: state.lines.join("\n"),
    manifests,
    readme,
    truncated: state.truncated,
  };
}
