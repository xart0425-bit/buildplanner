import { useEffect, useState } from "react";
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
import { FolderOpen, FolderSearch, Loader2 } from "lucide-react";
import type { ProjectRef } from "@shared/attachments";

interface ProjectPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (project: ProjectRef) => void;
  /** Already-attached paths, so the same folder is not added twice. */
  attachedPaths: string[];
}

/**
 * Attaches a local project folder: the OS folder-browse dialog is the main route, with a
 * typed path as the fallback (and the only route on non-Windows hosts). Choosing a folder
 * scans it straight away — the picker itself is the confirmation.
 */
export function ProjectPickerDialog({
  open,
  onOpenChange,
  onPick,
  attachedPaths,
}: ProjectPickerDialogProps) {
  const [pathInput, setPathInput] = useState("");

  useEffect(() => {
    if (open) setPathInput("");
  }, [open]);

  const scanMutation = trpc.localProjects.scan.useMutation({
    onSuccess: (project) => {
      onPick(project);
      toast.success(
        `${project.name} — 파일 ${project.fileCount.toLocaleString("ko-KR")}개를 참고 자료로 첨부했습니다.`
      );
      onOpenChange(false);
    },
    onError: (err) => toast.error(`폴더를 읽지 못했습니다: ${err.message}`),
  });

  const attach = (folderPath: string) => {
    if (attachedPaths.includes(folderPath)) {
      toast.info("이미 첨부된 폴더입니다.");
      return;
    }
    scanMutation.mutate({ path: folderPath });
  };

  const pickFolderMutation = trpc.localProjects.pickFolder.useMutation({
    onSuccess: (result) => {
      if (!result.path) return; // cancelled in the dialog
      attach(result.path);
    },
    onError: (err) => toast.error(err.message),
  });

  const isBusy = pickFolderMutation.isPending || scanMutation.isPending;

  // The OS browse dialog only exists on a Windows host; elsewhere the path field is it.
  const status = trpc.localProjects.status.useQuery(undefined, { retry: false });
  const canBrowse = status.data?.canBrowse ?? true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-background/95 border-border/80 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 gap-5">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[oklch(0.80_0.16_75/0.15)] border border-[oklch(0.80_0.16_75/0.3)] flex items-center justify-center">
              <FolderOpen className="w-4 h-4 text-[oklch(0.80_0.16_75)]" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              참고할 프로젝트 폴더 선택
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            로컬 디스크의 기존 프로젝트를 지정하면 디렉터리 구조·의존성·README를 읽어
            <strong className="text-foreground"> 그 코드베이스를 이어받는 계획</strong>을 세웁니다.
          </DialogDescription>
        </DialogHeader>

        {canBrowse && (
        <button
          type="button"
          onClick={() => pickFolderMutation.mutate({})}
          disabled={isBusy}
          className="flex items-center justify-center gap-2 w-full px-4 py-3.5 rounded-xl bg-[oklch(0.72_0.18_264/0.14)] hover:bg-[oklch(0.72_0.18_264/0.22)] border border-[oklch(0.72_0.18_264/0.4)] text-[oklch(0.82_0.18_264)] font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pickFolderMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              폴더 선택 창에서 고르는 중...
            </>
          ) : scanMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              폴더 읽는 중...
            </>
          ) : (
            <>
              <FolderSearch className="w-4 h-4" />
              폴더 찾기
            </>
          )}
        </button>

        )}

        {pickFolderMutation.isPending && (
          <p className="-mt-3 text-[11px] text-muted-foreground/70 text-center leading-relaxed">
            폴더 선택 창이 열렸습니다. 보이지 않으면 작업 표시줄의
            <span className="text-foreground"> BuildPlanner — 폴더 선택 </span>
            을 클릭하세요.
          </p>
        )}

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border/40" />
          <span className="text-[11px] text-muted-foreground/60">
            {canBrowse ? "또는 경로 직접 입력" : "폴더 경로 입력"}
          </span>
          <div className="h-px flex-1 bg-border/40" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = pathInput.trim();
            if (trimmed) attach(trimmed);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="Z:\projects\my-app"
            disabled={isBusy}
            className="flex-1 px-3 py-2.5 rounded-xl bg-accent/40 border border-border/50 focus:border-[oklch(0.72_0.18_264/0.5)] outline-none text-sm text-foreground placeholder:text-muted-foreground/40 font-mono transition-colors min-w-0"
          />
          <button
            type="submit"
            disabled={isBusy || !pathInput.trim()}
            className="px-4 py-2.5 rounded-xl text-sm bg-accent/50 hover:bg-accent border border-border/50 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            추가
          </button>
        </form>

        <DialogFooter className="border-t border-border/20 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            닫기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProjectPickerDialog;
