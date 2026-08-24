/**
 * The language the AI writes its analysis in.
 *
 * This is separate from the UI language — the interface stays Korean while the generated
 * plan, specs and teardown report follow this setting. English is the default because the
 * collected sources (GitHub, Hugging Face, papers, HN) are overwhelmingly English, and a
 * plan handed to a coding agent usually travels further in English.
 */

export const ANALYSIS_LANGUAGES = [
  { code: "en", native: "English", label: "영어", promptName: "English" },
  { code: "ko", native: "한국어", label: "한국어", promptName: "Korean (한국어)" },
  { code: "ja", native: "日本語", label: "일본어", promptName: "Japanese (日本語)" },
  { code: "zh", native: "中文", label: "중국어", promptName: "Simplified Chinese (简体中文)" },
  { code: "fr", native: "Français", label: "프랑스어", promptName: "French (Français)" },
  { code: "ru", native: "Русский", label: "러시아어", promptName: "Russian (Русский)" },
] as const;

export type AnalysisLanguage = (typeof ANALYSIS_LANGUAGES)[number]["code"];

export const DEFAULT_ANALYSIS_LANGUAGE: AnalysisLanguage = "en";

const CODES = new Set(ANALYSIS_LANGUAGES.map((l) => l.code));

/** Accepts anything (a header, a stored preference) and returns a supported code. */
export function normalizeLanguage(value: unknown): AnalysisLanguage {
  return typeof value === "string" && CODES.has(value as AnalysisLanguage)
    ? (value as AnalysisLanguage)
    : DEFAULT_ANALYSIS_LANGUAGE;
}

export function languageName(code: AnalysisLanguage): string {
  return ANALYSIS_LANGUAGES.find((l) => l.code === code)?.promptName ?? "English";
}

/**
 * The line appended to every prompt. Stated twice on purpose — models drift back to the
 * language of the surrounding prompt when told only once.
 */
export function languageInstruction(code: AnalysisLanguage): string {
  const name = languageName(code);
  return `Write every human-readable value in ${name}. This applies to every string in the response, including summaries, titles, reasons and list items. Do not use any other language for prose, regardless of the language of this prompt or of the collected sources. Keep code, identifiers, file paths, commands, URLs and product names as they are.`;
}
