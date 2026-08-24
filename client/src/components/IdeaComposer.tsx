import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import {
  FileText,
  FolderOpen,
  ImageIcon,
  Loader2,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import {
  ACCEPTED_DOC_EXTENSIONS,
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_DOCS,
  MAX_DOC_CHARS,
  MAX_IMAGES,
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_PROJECT_REFS,
  type AttachedDoc,
  type AttachedImage,
  type IdeaAttachments,
  type ProjectRef,
} from "@shared/attachments";
import { ProjectPickerDialog } from "@/components/ProjectPickerDialog";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

/** Base64 inflates by ~4/3, so cap the raw file well under the transport limit. */
const MAX_IMAGE_BYTES = Math.floor(MAX_IMAGE_DATA_URL_CHARS * 0.7);

/** The box grows with the text to here; past that the user drags the resize handle. */
const AUTO_GROW_MAX_HEIGHT = 320;

export const EMPTY_ATTACHMENTS: IdeaAttachments = { docs: [], images: [], projects: [] };

function isDocFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    ACCEPTED_DOC_EXTENSIONS.some((ext) => name.endsWith(ext)) ||
    file.type === "text/markdown" ||
    file.type === "text/plain"
  );
}

function isImageFile(file: File): boolean {
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
}

const readAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("unreadable"));
    reader.readAsText(file);
  });

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("unreadable"));
    reader.readAsDataURL(file);
  });

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;

interface IdeaComposerProps {
  value: string;
  onChange: (value: string) => void;
  attachments: IdeaAttachments;
  onAttachmentsChange: (attachments: IdeaAttachments) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  placeholder?: string;
  maxLength: number;
}

/**
 * The idea input: a resizable multi-line box that also carries `.md` specs (which steer
 * the plan) and reference images (which steer the interface design).
 */
export function IdeaComposer({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  onSubmit,
  isSubmitting,
  placeholder,
  maxLength,
}: IdeaComposerProps) {
  const t = useT();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  /** Height we set ourselves — anything else means the user dragged the resize handle. */
  const autoHeightRef = useRef(0);

  const [isManuallyResized, setIsManuallyResized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);

  // A hosted instance can switch local folder access off; treat "unknown" as available so
  // the button never flickers away on a slow first load of a normal local install.
  const localProjectsStatus = trpc.localProjects.status.useQuery(undefined, { retry: false });
  const localProjectsEnabled = localProjectsStatus.data?.enabled ?? true;

  // Grow with the text until the user takes manual control of the height.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el || isManuallyResized) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, AUTO_GROW_MAX_HEIGHT)}px`;
    autoHeightRef.current = el.offsetHeight;
  }, [value, isManuallyResized]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (Math.abs(el.offsetHeight - autoHeightRef.current) > 6) setIsManuallyResized(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const nextDocs: AttachedDoc[] = [...attachments.docs];
      const nextImages: AttachedImage[] = [...attachments.images];
      const errors: string[] = [];

      setIsReadingFiles(true);
      try {
        for (const file of files) {
          if (isImageFile(file)) {
            if (nextImages.length >= MAX_IMAGES) {
              errors.push(t.composer.imagesLimit(MAX_IMAGES));
              continue;
            }
            if (file.size > MAX_IMAGE_BYTES) {
              errors.push(t.composer.imageTooLarge(file.name, formatBytes(MAX_IMAGE_BYTES)));
              continue;
            }
            try {
              const dataUrl = await readAsDataUrl(file);
              nextImages.push({
                name: file.name || `image-${nextImages.length + 1}.png`,
                mimeType: file.type as AttachedImage["mimeType"],
                dataUrl,
              });
            } catch {
              errors.push(t.composer.imageUnreadable(file.name));
            }
            continue;
          }

          if (isDocFile(file)) {
            if (nextDocs.length >= MAX_DOCS) {
              errors.push(t.composer.docsLimit(MAX_DOCS));
              continue;
            }
            try {
              const content = await readAsText(file);
              if (!content.trim()) {
                errors.push(t.composer.docEmpty(file.name));
                continue;
              }
              if (content.length > MAX_DOC_CHARS) {
                errors.push(t.composer.docTooLong(file.name, MAX_DOC_CHARS.toLocaleString("en-US")));
                continue;
              }
              nextDocs.push({ name: file.name, content });
            } catch {
              errors.push(t.composer.docUnreadable(file.name));
            }
            continue;
          }

          errors.push(t.composer.unsupported(file.name));
        }
      } finally {
        setIsReadingFiles(false);
      }

      onAttachmentsChange({ ...attachments, docs: nextDocs, images: nextImages });
      for (const message of errors.slice(0, 3)) toast.error(message);
    },
    [attachments, onAttachmentsChange]
  );

  const removeDoc = (index: number) =>
    onAttachmentsChange({ ...attachments, docs: attachments.docs.filter((_, i) => i !== index) });

  const removeImage = (index: number) =>
    onAttachmentsChange({ ...attachments, images: attachments.images.filter((_, i) => i !== index) });

  const addProject = (project: ProjectRef) => {
    if (attachments.projects.some((p) => p.path === project.path)) return;
    onAttachmentsChange({ ...attachments, projects: [...attachments.projects, project] });
  };

  const removeProject = (index: number) =>
    onAttachmentsChange({
      ...attachments,
      projects: attachments.projects.filter((_, i) => i !== index),
    });

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits, Shift+Enter (and IME composition) keeps writing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) void addFiles(files);
  };

  const hasAttachments = attachments.docs.length > 0 || attachments.images.length > 0;
  const canSubmit = value.trim().length > 0 && !isSubmitting;

  return (
    <div className="relative group text-left">
      <div className="absolute inset-0 rounded-2xl bg-[oklch(0.72_0.18_264/0.08)] blur-xl group-focus-within:bg-[oklch(0.72_0.18_264/0.15)] transition-all duration-500" />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={`relative glass rounded-2xl p-2 border transition-all duration-300 ${
          isDragging
            ? "border-[oklch(0.72_0.18_264/0.8)] bg-[oklch(0.72_0.18_264/0.06)]"
            : "border-[oklch(0.28_0.01_264)] group-focus-within:border-[oklch(0.72_0.18_264/0.5)]"
        }`}
      >
        {/* Referenced project paths sit above the text — they frame everything typed below */}
        {attachments.projects.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pt-1.5 pb-1">
            {attachments.projects.map((project, i) => (
              <span
                key={project.path}
                title={project.path}
                className="inline-flex items-center gap-1.5 max-w-full pl-2 pr-1 py-1 rounded-lg bg-[oklch(0.80_0.16_75/0.1)] border border-[oklch(0.80_0.16_75/0.35)] text-xs text-[oklch(0.85_0.14_75)]"
              >
                <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-mono truncate max-w-[280px]">{project.path}</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {project.fileCount.toLocaleString("ko-KR")}개
                  {project.languages[0] ? ` · ${project.languages[0]}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => removeProject(i)}
                  aria-label={`${project.name} — ${t.composer.removeAttachment}`}
                  className="p-0.5 rounded hover:bg-[oklch(0.80_0.16_75/0.2)] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={isSubmitting}
          maxLength={maxLength}
          rows={3}
          style={{ maxHeight: isManuallyResized ? undefined : AUTO_GROW_MAX_HEIGHT }}
          className="w-full bg-transparent text-foreground placeholder:text-muted-foreground/50 text-base outline-none px-4 py-3 font-mono leading-relaxed resize-y min-h-[92px] overflow-y-auto disabled:opacity-60"
        />

        {/* Attachment chips */}
        {hasAttachments && (
          <div className="flex flex-wrap gap-2 px-2 pb-2">
            {attachments.docs.map((doc, i) => (
              <span
                key={`doc-${doc.name}-${i}`}
                className="inline-flex items-center gap-1.5 max-w-full pl-2 pr-1 py-1 rounded-lg bg-[oklch(0.74_0.16_155/0.1)] border border-[oklch(0.74_0.16_155/0.3)] text-xs text-[oklch(0.80_0.14_155)]"
              >
                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate max-w-[200px]">{doc.name}</span>
                <button
                  type="button"
                  onClick={() => removeDoc(i)}
                  aria-label={`${doc.name} — ${t.composer.removeAttachment}`}
                  className="p-0.5 rounded hover:bg-[oklch(0.74_0.16_155/0.2)] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {attachments.images.map((img, i) => (
              <span
                key={`img-${img.name}-${i}`}
                className="inline-flex items-center gap-1.5 max-w-full pl-1 pr-1 py-1 rounded-lg bg-[oklch(0.78_0.14_200/0.1)] border border-[oklch(0.78_0.14_200/0.3)] text-xs text-[oklch(0.82_0.12_200)]"
              >
                <img
                  src={img.dataUrl}
                  alt=""
                  className="w-6 h-6 rounded object-cover border border-border/40"
                />
                <span className="truncate max-w-[180px]">{img.name}</span>
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label={`${img.name} — ${t.composer.removeAttachment}`}
                  className="p-0.5 rounded hover:bg-[oklch(0.78_0.14_200/0.2)] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-end justify-between gap-2 px-2 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              disabled={isSubmitting || attachments.docs.length >= MAX_DOCS}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-accent/40 hover:bg-accent border border-border/50 hover:border-border text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Paperclip className="w-3.5 h-3.5" />
              {t.composer.attachDoc}
            </button>
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isSubmitting || attachments.images.length >= MAX_IMAGES}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-accent/40 hover:bg-accent border border-border/50 hover:border-border text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {t.composer.attachImage}
            </button>
            {/* Hidden on deployments that switch local folder access off */}
            {localProjectsEnabled && (
            <button
              type="button"
              onClick={() => setIsProjectPickerOpen(true)}
              disabled={isSubmitting || attachments.projects.length >= MAX_PROJECT_REFS}
              title={t.composer.pickProject}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[oklch(0.80_0.16_75/0.1)] hover:bg-[oklch(0.80_0.16_75/0.18)] border border-[oklch(0.80_0.16_75/0.3)] text-[oklch(0.85_0.14_75)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {t.composer.pickProject}
              {attachments.projects.length > 0 && (
                <span className="tabular-nums">({attachments.projects.length})</span>
              )}
            </button>
            )}
            {isReadingFiles && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t.composer.reading}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-[11px] text-muted-foreground/50 tabular-nums hidden sm:inline">
              {value.length.toLocaleString("ko-KR")}/{maxLength.toLocaleString("ko-KR")}
            </span>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[oklch(0.72_0.18_264)] hover:bg-[oklch(0.78_0.18_264)] disabled:opacity-40 disabled:cursor-not-allowed text-[oklch(0.09_0.005_264)] font-semibold text-sm transition-all duration-200"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>{t.composer.starting}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{t.composer.start}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {isDragging && (
          <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-[oklch(0.09_0.005_264/0.75)] pointer-events-none">
            <span className="text-sm text-[oklch(0.82_0.18_264)]">
              {t.composer.dropHere}
            </span>
          </div>
        )}
      </div>

      <p className="mt-2 px-1 text-[11px] text-muted-foreground/50">
        {t.composer.hint}
        <span className="hidden sm:inline"> {t.composer.hintLong}</span>
      </p>

      <ProjectPickerDialog
        open={isProjectPickerOpen}
        onOpenChange={setIsProjectPickerOpen}
        onPick={addProject}
        attachedPaths={attachments.projects.map((p) => p.path)}
      />

      <input
        ref={docInputRef}
        type="file"
        multiple
        accept={ACCEPTED_DOC_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_MIME_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default IdeaComposer;
