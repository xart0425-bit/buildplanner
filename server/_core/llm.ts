import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  geminiKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
  customModel?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

/**
 * Anthropic is not OpenAI-compatible — different endpoint, different auth header, system
 * prompt hoisted out of `messages`, required `max_tokens`, and content blocks instead of
 * a plain string. It gets its own request path below rather than being bent into the
 * shared OpenAI shape; the Gemini and OpenAI paths are untouched.
 */
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";
/** Anthropic requires max_tokens; this keeps responses under the SDK/HTTP timeout. */
const ANTHROPIC_DEFAULT_MAX_TOKENS = 16_000;

export type LlmProvider = "anthropic" | "gemini" | "openai" | "forge";

/**
 * Which provider answers a request. A key entered in the app's settings wins over the
 * environment, so a server-wide env key never hijacks a user's own choice.
 */
export function resolveProvider(keys: {
  geminiKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
}): LlmProvider {
  if (keys.anthropicKey) return "anthropic";
  if (keys.geminiKey) return "gemini";
  if (keys.openaiKey) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "forge";
}

const resolveApiUrl = (geminiKey?: string, openaiKey?: string) => {
  if (geminiKey || (!openaiKey && process.env.GEMINI_API_KEY)) {
    return "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions";
  }
  if (openaiKey || process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_BASE || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions";
  }
  return ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";
};

const assertApiKey = (geminiKey?: string, openaiKey?: string, anthropicKey?: string) => {
  if (
    !geminiKey &&
    !openaiKey &&
    !anthropicKey &&
    !process.env.GEMINI_API_KEY &&
    !process.env.OPENAI_API_KEY &&
    !process.env.ANTHROPIC_API_KEY &&
    !ENV.forgeApiKey
  ) {
    throw new Error(
      "API key is not configured. Please set GEMINI_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment or settings."
    );
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const RETRY_MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 30_000;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

// Equal-jitter exponential backoff. The cap/2 floor guarantees a minimum
// delay so a misbehaving caller loop slows down instead of hammering the
// upstream while it keeps returning errors.
const computeBackoffDelay = (
  attempt: number,
  retryAfterMs?: number
): number => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};

// Retries non-2xx responses and network errors with exponential backoff, then
// returns the final Response so callers keep their existing error handling.
const fetchWithBackoff = async (
  url: string,
  init: FetchInit
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }

      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
        // Body already settled; nothing to clean up.
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("LLM request failed after exhausting retries");
};

// ─── Anthropic (Claude) ───────────────────────────────────────────────────────

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "image"; source: { type: "url"; url: string } };

/** Splits a `data:` URL into the media type and payload Anthropic expects separately. */
function dataUrlToImageBlock(url: string): AnthropicBlock | null {
  // `[\s\S]` instead of the `s` flag: this project compiles without an es2018 target.
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(url);
  if (!match) return url.startsWith("http") ? { type: "image", source: { type: "url", url } } : null;
  return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
}

function toAnthropicBlocks(content: MessageContent | MessageContent[]): AnthropicBlock[] {
  return ensureArray(content)
    .map((part): AnthropicBlock | null => {
      if (typeof part === "string") return { type: "text", text: part };
      if (part.type === "text") return { type: "text", text: part.text };
      if (part.type === "image_url") return dataUrlToImageBlock(part.image_url.url);
      // Anthropic takes documents through the Files API, which this app does not use.
      return null;
    })
    .filter((block): block is AnthropicBlock => block !== null);
}

/**
 * Calls Anthropic's Messages API and returns the result in the same shape the rest of the
 * app already consumes, so callers do not need to know which provider answered.
 */
async function invokeAnthropic(params: InvokeParams): Promise<InvokeResult> {
  const apiKey = params.anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const model = params.customModel || params.model || process.env.LLM_MODEL || ANTHROPIC_DEFAULT_MODEL;

  // System prompts are a top-level field here, not a message role.
  const systemParts: string[] = [];
  const messages: Array<{ role: "user" | "assistant"; content: AnthropicBlock[] }> = [];

  for (const message of params.messages) {
    if (message.role === "system") {
      systemParts.push(
        toAnthropicBlocks(message.content)
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("\n")
      );
      continue;
    }
    if (message.role !== "user" && message.role !== "assistant") continue;
    const blocks = toAnthropicBlocks(message.content);
    if (blocks.length > 0) messages.push({ role: message.role, content: blocks });
  }

  const wantsJson =
    (params.response_format ?? params.responseFormat)?.type === "json_object" ||
    (params.response_format ?? params.responseFormat)?.type === "json_schema";
  if (wantsJson) {
    // No prefill on current Claude models, so steer the format from the system prompt and
    // let the callers' tolerant JSON parser handle any stray prose.
    systemParts.push(
      "Respond with a single valid JSON object and nothing else — no prose, no markdown code fences."
    );
  }

  const payload: Record<string, unknown> = {
    model,
    max_tokens: params.max_tokens ?? params.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    messages,
  };
  if (systemParts.length > 0) payload.system = systemParts.join("\n\n");

  const response = await fetchWithBackoff(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const data = (await response.json()) as {
    id?: string;
    model?: string;
    stop_reason?: string | null;
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  // Thinking blocks (adaptive thinking is on by default) carry no answer text — keep the
  // text blocks only.
  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");

  return {
    id: data.id ?? "",
    created: Math.floor(Date.now() / 1000),
    model: data.model ?? model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: data.stop_reason ?? null,
      },
    ],
    usage: {
      prompt_tokens: data.usage?.input_tokens ?? 0,
      completion_tokens: data.usage?.output_tokens ?? 0,
      total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
  };
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens,
    geminiKey,
    openaiKey,
    anthropicKey,
    customModel,
  } = params;

  assertApiKey(geminiKey, openaiKey, anthropicKey);

  // Claude speaks its own protocol; branch before building the OpenAI-shaped payload.
  if (resolveProvider({ geminiKey, openaiKey, anthropicKey }) === "anthropic") {
    return invokeAnthropic(params);
  }

  const payload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
  };

  const resolvedApiKey = geminiKey || openaiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || ENV.forgeApiKey;

  let resolvedModel = customModel || model;
  if (!resolvedModel) {
    if (process.env.LLM_MODEL) {
      resolvedModel = process.env.LLM_MODEL;
    } else if (geminiKey || (!openaiKey && process.env.GEMINI_API_KEY)) {
      resolvedModel = "gemini-2.5-flash";
    } else if (openaiKey || process.env.OPENAI_API_KEY) {
      resolvedModel = "gpt-4o-mini";
    } else {
      resolvedModel = "gpt-4o-mini";
    }
  }
  payload.model = resolvedModel;

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }

  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const response = await fetchWithBackoff(resolveApiUrl(geminiKey, openaiKey), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resolvedApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  assertApiKey();

  const url = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models`
    : "https://forge.manus.im/v1/models";

  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${ENV.forgeApiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as ModelsResponse;
}
