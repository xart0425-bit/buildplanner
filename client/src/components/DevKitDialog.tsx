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
import { useT } from "@/lib/i18n";

/** Mirrors TARGET_AGENTS in server/scaffold.ts. */
type TargetAgent = "auto" | "claude" | "codex" | "gemini" | "cursor" | "generic";

type AgentOption = { id: TargetAgent; label: string; memoryFile: string; hint: string };

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
  const t = useT();
  const agentOptions: AgentOption[] = [
    { id: "auto", label: t.devKit.agentAuto, memoryFile: t.devKit.agentAutoFile, hint: t.devKit.agentAutoHint },
    { id: "claude", label: "Claude Code", memoryFile: "CLAUDE.md", hint: t.devKit.agentClaudeHint },
    { id: "codex", label: "OpenAI Codex", memoryFile: "AGENTS.md", hint: t.devKit.agentCodexHint },
    { id: "gemini", label: "Gemini CLI", memoryFile: "GEMINI.md", hint: t.devKit.agentGeminiHint },
    { id: "cursor", label: "Cursor", memoryFile: "AGENTS.md", hint: t.devKit.agentCursorHint },
    { id: "generic", label: t.devKit.agentGenericLabel, memoryFile: "AGENTS.md", hint: t.devKit.agentGenericHint },
  ];
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
      toast.success(t.devKit.downloaded(data.fileName));
    },
    onError: (err) => {
      toast.error(t.devKit.failed(err.message));
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
              {t.devKit.title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            {t.devKit.description1}{" "}
            <strong className="text-foreground">{t.devKit.descriptionStrong}</strong>{" "}
            {t.devKit.description2}
          </DialogDescription>
        </DialogHeader>

        {/* What goes in the box */}
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          {[
            { icon: <FolderTree className="w-3.5 h-3.5" />, title: "specs/", desc: t.devKit.specsLabel },
            { icon: <Repeat className="w-3.5 h-3.5" />, title: "loop/", desc: t.devKit.loopLabel },
            { icon: <Terminal className="w-3.5 h-3.5" />, title: "scripts/", desc: t.devKit.scriptsLabel },
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
            {t.devKit.agentLabel}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {agentOptions.map((opt) => (
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
            {t.devKit.agentNote}
          </p>
        </div>

        {lastResult && (
          <div className="rounded-xl border border-[oklch(0.74_0.16_155/0.3)] bg-[oklch(0.74_0.16_155/0.08)] px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p className="text-[oklch(0.80_0.14_155)] font-medium">{lastResult.fileName}</p>
            <p>
              {lastResult.agentLabel} · {t.devKit.resultSpecs} {lastResult.specCount} · {t.devKit.resultFiles}{" "}
              {lastResult.fileCount} · {formatBytes(lastResult.byteSize)}
            </p>
            <p className="font-mono text-[11px] text-foreground/80">
              {t.devKit.unzipHint(lastResult.rootDir, lastResult.memoryFile)}
            </p>
          </div>
        )}

        <DialogFooter className="flex flex-row gap-2 sm:justify-end border-t border-border/20 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {t.devKit.close}
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
                {t.devKit.generating}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {lastResult ? t.devKit.regenerate : t.devKit.generate}
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DevKitDialog;
