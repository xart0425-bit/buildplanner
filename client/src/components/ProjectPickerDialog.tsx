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
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const [pathInput, setPathInput] = useState("");

  useEffect(() => {
    if (open) setPathInput("");
  }, [open]);

  const scanMutation = trpc.localProjects.scan.useMutation({
    onSuccess: (project) => {
      onPick(project);
      toast.success(t.projectPicker.attached(project.name, project.fileCount.toLocaleString("en-US")));
      onOpenChange(false);
    },
    onError: (err) => toast.error(t.projectPicker.scanFailed(err.message)),
  });

  const attach = (folderPath: string) => {
    if (attachedPaths.includes(folderPath)) {
      toast.info(t.projectPicker.alreadyAttached);
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
              {t.projectPicker.title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            {t.projectPicker.description1}{" "}
            <strong className="text-foreground">{t.projectPicker.description2}</strong>
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
              {t.projectPicker.browsing}
            </>
          ) : scanMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.projectPicker.scanning}
            </>
          ) : (
            <>
              <FolderSearch className="w-4 h-4" />
              {t.projectPicker.browse}
            </>
          )}
        </button>

        )}

        {pickFolderMutation.isPending && (
          <p className="-mt-3 text-[11px] text-muted-foreground/70 text-center leading-relaxed">
            {t.projectPicker.taskbarHint1}
            <span className="text-foreground"> BuildPlanner </span>
            {t.projectPicker.taskbarHint2}
          </p>
        )}

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border/40" />
          <span className="text-[11px] text-muted-foreground/60">
            {canBrowse ? t.projectPicker.orTypePath : t.projectPicker.typePathOnly}
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
            {t.projectPicker.add}
          </button>
        </form>

        <DialogFooter className="border-t border-border/20 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {t.projectPicker.close}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProjectPickerDialog;
