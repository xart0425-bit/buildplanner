/**
 * Attachments a user can hang off an idea before research starts.
 *
 * `.md` documents steer the *plan* (requirements, scope, existing spec) and image
 * references steer the *design* (interface layout, visual direction). The limits
 * live here so the client can reject an oversized file before it is uploaded and
 * the server can reject the same thing without trusting the client.
 */
import { z } from "zod";

export const MAX_DOCS = 5;
export const MAX_IMAGES = 4;
export const MAX_PROJECT_REFS = 5;
/** Roughly 200k characters ≈ a very long spec; anything bigger is not a plan doc. */
export const MAX_DOC_CHARS = 200_000;
/** Base64 data URL length cap ≈ 3MB of binary image data. */
export const MAX_IMAGE_DATA_URL_CHARS = 4_000_000;
export const ACCEPTED_DOC_EXTENSIONS = [".md", ".markdown", ".mdx", ".txt"] as const;
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const attachedDocSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().min(1).max(MAX_DOC_CHARS),
});

export const attachedImageSchema = z.object({
  name: z.string().min(1).max(200),
  mimeType: z.enum(ACCEPTED_IMAGE_MIME_TYPES),
  /** `data:<mime>;base64,...` — kept inline so no object storage is required. */
  dataUrl: z.string().min(1).max(MAX_IMAGE_DATA_URL_CHARS),
});

/**
 * A local project folder the plan should build on. Only a summary travels — the tree
 * outline, manifests and README excerpt the model needs to match an existing codebase —
 * never the whole source tree.
 */
export const projectRefSchema = z.object({
  /** Absolute path on the machine running the server, shown to the user as-is. */
  path: z.string().min(1).max(1000),
  name: z.string().min(1).max(200),
  fileCount: z.number().int().nonnegative().max(10_000_000),
  languages: z.array(z.string().max(40)).max(12).default([]),
  tree: z.string().max(20_000).default(""),
  manifests: z
    .array(z.object({ file: z.string().max(300), excerpt: z.string().max(8_000) }))
    .max(10)
    .default([]),
  readme: z.string().max(12_000).default(""),
  truncated: z.boolean().default(false),
});

export const ideaAttachmentsSchema = z.object({
  docs: z.array(attachedDocSchema).max(MAX_DOCS).default([]),
  images: z.array(attachedImageSchema).max(MAX_IMAGES).default([]),
  projects: z.array(projectRefSchema).max(MAX_PROJECT_REFS).default([]),
});

export type AttachedDoc = z.infer<typeof attachedDocSchema>;
export type AttachedImage = z.infer<typeof attachedImageSchema>;
export type ProjectRef = z.infer<typeof projectRefSchema>;
export type IdeaAttachments = z.infer<typeof ideaAttachmentsSchema>;

export function isEmptyAttachments(a: IdeaAttachments | null | undefined): boolean {
  // Rows written before a field existed come back without it — treat missing as empty.
  return (
    !a ||
    ((a.docs?.length ?? 0) === 0 && (a.images?.length ?? 0) === 0 && (a.projects?.length ?? 0) === 0)
  );
}

/**
 * Narrows an untrusted value (a JSON column read back from the DB) to attachments,
 * dropping anything malformed instead of throwing — a bad row must not break a re-run.
 */
export function parseAttachments(value: unknown): IdeaAttachments | null {
  const result = ideaAttachmentsSchema.safeParse(value);
  if (!result.success) return null;
  return isEmptyAttachments(result.data) ? null : result.data;
}
