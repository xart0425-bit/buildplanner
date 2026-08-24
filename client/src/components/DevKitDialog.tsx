import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bot, FolderTree, Loader2, Package, Repeat, Sparkles, Terminal } from "lucide-react";

/** Mirrors TARGET_AGENTS in server/scaffold.ts. */
type TargetAgent = "auto" | "claude" | "codex" | "gemini" | "cursor" | "generic";

const AGENT_OPTIONS: Array<{ id: TargetAgent; label: string; memoryFile: string; hint: string }> = [
  { id: "auto", label: "자동 감지", memoryFile: "설정된 모델 기준", hint: "설정한 API 키/모델에 맞춰 자동 선택" },
  { id: "claude", label: "Claude Code", memoryFile: "CLAUDE.md", hint: ".claude/commands · evaluator 서브에이전트" },
  { id: "codex", label: "OpenAI Codex", memoryFile: "AGENTS.md", hint: "prompts/ 루프 프롬프트" },
  { id: "gemini", label: "Gemini CLI", memoryFile: "GEMINI.md", hint: ".gemini/commands/loop.toml" },
  { id: "cursor", label: "Cursor", memoryFile: "AGENTS.md", hint: ".cursor/rules/*.mdc" },
  { id: "generic", label: "범용", memoryFile: "AGENTS.md", hint: "CLI 무관 기본 구조" },
];

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;

interface DevKitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  researchId: number;
}

/**
 * Builds the Spec + Loop project folder for this research and hands it over as a .zip.
 * The agent choice changes the folder's memory file and command layout, so it is picked
 * here rather than guessed at download time.
 */
export function DevKitDialog({ open, onOpenChange, researchId }: DevKitDialogProps) {
  const [agent, setAgent] = useState<TargetAgent>("auto");
  const [lastResult, setLastResult] = useState<{
    fileName: string;
    agentLabel: string;
    memoryFile: string;
    rootDir: string;
    fileCount: number;
    specCount: number;
    byteSize: number;
  } | null>(null);

  const buildMutation = trpc.research.buildDevKit.useMutation({
    onSuccess: (data) => {
      // base64 → bytes → download. The archive never touches disk on the server.
      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName;
      a.click();
      URL.revokeObjectURL(url);

      setLastResult({
        fileName: data.fileName,
        agentLabel: data.agentLabel,
        memoryFile: data.memoryFile,
        rootDir: data.rootDir,
        fileCount: data.fileCount,
        specCount: data.specCount,
        byteSize: data.byteSize,
      });
      toast.success(`개발 킷 생성 완료 — ${data.fileName}`);
    },
    onError: (err) => {
      toast.error(`개발 킷 생성 실패: ${err.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-background/95 border-border/80 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 gap-5 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[oklch(0.74_0.16_155/0.15)] border border-[oklch(0.74_0.16_155/0.3)] flex items-center justify-center">
              <Package className="w-4 h-4 text-[oklch(0.74_0.16_155)]" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              개발 킷 만들기 (.zip)
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            계획서를 <strong className="text-foreground">Spec + Loop</strong> 구조의 프로젝트 폴더로 변환합니다.
            압축을 풀고 그 폴더를 에이전트에게 열어주면 목표·완료 조건·검증 절차를 읽고 바로 개발을 시작합니다.
          </DialogDescription>
        </DialogHeader>

        {/* What goes in the box */}
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          {[
            { icon: <FolderTree className="w-3.5 h-3.5" />, title: "specs/", desc: "완료 조건이 붙은 스펙" },
            { icon: <Repeat className="w-3.5 h-3.5" />, title: "loop/", desc: "GOAL · PROGRESS · RALPH" },
            { icon: <Terminal className="w-3.5 h-3.5" />, title: "scripts/", desc: "루프 실행 스크립트" },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border/40 bg-accent/20 px-3 py-2.5 flex flex-col gap-1"
            >
              <span className="flex items-center gap-1.5 text-[oklch(0.82_0.18_264)] font-mono">
                {item.icon}
                {item.title}
              </span>
              <span className="text-muted-foreground leading-snug">{item.desc}</span>
            </div>
          ))}
        </div>

        {/* Agent picker */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-[oklch(0.82_0.18_264)]" />
            사용할 코딩 에이전트
          </span>
          <div className="grid grid-cols-2 gap-2">
            {AGENT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAgent(opt.id)}
                disabled={buildMutation.isPending}
                className={`text-left px-3 py-2.5 rounded-xl border transition-all disabled:opacity-50 ${
                  agent === opt.id
                    ? "bg-[oklch(0.72_0.18_264/0.12)] border-[oklch(0.72_0.18_264/0.5)]"
                    : "bg-accent/20 border-border/40 hover:border-border"
                }`}
              >
                <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                <span className="block text-[11px] text-muted-foreground font-mono">{opt.memoryFile}</span>
                <span className="block text-[11px] text-muted-foreground/70 mt-0.5">{opt.hint}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            선택한 에이전트에 맞춰 메모리 파일 이름, 슬래시 커맨드/룰 파일, 루프 실행 명령이 자동으로 바뀝니다.
          </p>
        </div>

        {lastResult && (
          <div className="rounded-xl border border-[oklch(0.74_0.16_155/0.3)] bg-[oklch(0.74_0.16_155/0.08)] px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p className="text-[oklch(0.80_0.14_155)] font-medium">{lastResult.fileName} 다운로드됨</p>
            <p>
              {lastResult.agentLabel} · 스펙 {lastResult.specCount}건 · 파일 {lastResult.fileCount}개 ·{" "}
              {formatBytes(lastResult.byteSize)}
            </p>
            <p className="font-mono text-[11px] text-foreground/80">
              unzip → cd {lastResult.rootDir} → 에이전트가 {lastResult.memoryFile} 를 읽고 시작
            </p>
          </div>
        )}

        <DialogFooter className="flex flex-row gap-2 sm:justify-end border-t border-border/20 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => buildMutation.mutate({ researchId, agent })}
            disabled={buildMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[oklch(0.74_0.16_155)] hover:bg-[oklch(0.80_0.16_155)] disabled:opacity-50 text-[oklch(0.09_0.005_264)] font-semibold text-sm transition-all"
          >
            {buildMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                스펙 생성 중...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {lastResult ? "다시 생성" : "생성하고 다운로드"}
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DevKitDialog;
