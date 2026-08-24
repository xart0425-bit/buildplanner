import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { invokeLLM, resolveProvider } from "./_core/llm";
import { languageInstruction, normalizeLanguage } from "@shared/languages";

describe("resolveProvider", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("prefers a key entered in settings over the server environment", () => {
    process.env.GEMINI_API_KEY = "env-gemini";
    expect(resolveProvider({ anthropicKey: "sk-ant-user" })).toBe("anthropic");
    expect(resolveProvider({ openaiKey: "sk-user" })).toBe("openai");
  });

  it("ranks Claude first among settings keys", () => {
    expect(resolveProvider({ anthropicKey: "a", geminiKey: "g", openaiKey: "o" })).toBe("anthropic");
    expect(resolveProvider({ geminiKey: "g", openaiKey: "o" })).toBe("gemini");
  });

  it("falls back to the environment, then to the built-in endpoint", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(resolveProvider({})).toBe("forge");

    process.env.ANTHROPIC_API_KEY = "env-anthropic";
    expect(resolveProvider({})).toBe("anthropic");
  });
});

describe("invokeLLM — Anthropic path", () => {
  const original = { ...process.env };
  let captured: { url: string; init: any } | null = null;

  beforeEach(() => {
    captured = null;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        captured = { url, init };
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            id: "msg_1",
            model: "claude-opus-5",
            stop_reason: "end_turn",
            content: [
              { type: "thinking", thinking: "internal" },
              { type: "text", text: '{"ok":true}' },
            ],
            usage: { input_tokens: 11, output_tokens: 7 },
          }),
        };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...original };
  });

  const call = () =>
    invokeLLM({
      anthropicKey: "sk-ant-test",
      messages: [
        { role: "system", content: "You are helpful." },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this" },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

  it("posts to the Messages API with Anthropic's auth headers", async () => {
    await call();

    expect(captured!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(captured!.init.headers["x-api-key"]).toBe("sk-ant-test");
    expect(captured!.init.headers["anthropic-version"]).toBe("2023-06-01");
    // Anthropic uses x-api-key, never a Bearer token.
    expect(captured!.init.headers.authorization).toBeUndefined();
  });

  it("hoists the system prompt and requires max_tokens", async () => {
    await call();
    const body = JSON.parse(captured!.init.body);

    expect(body.system).toContain("You are helpful.");
    expect(body.messages.every((m: any) => m.role !== "system")).toBe(true);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.model).toBe("claude-opus-5");
  });

  it("converts a data URL into an Anthropic image block", async () => {
    await call();
    const body = JSON.parse(captured!.init.body);
    const image = body.messages[0].content.find((b: any) => b.type === "image");

    expect(image.source).toEqual({ type: "base64", media_type: "image/png", data: "AAAA" });
  });

  it("asks for bare JSON instead of using an unsupported response_format", async () => {
    await call();
    const body = JSON.parse(captured!.init.body);

    expect(body.response_format).toBeUndefined();
    expect(body.system).toContain("single valid JSON object");
  });

  it("returns the OpenAI-shaped result callers expect, dropping thinking blocks", async () => {
    const result = await call();

    expect(result.choices[0].message.content).toBe('{"ok":true}');
    expect(result.choices[0].finish_reason).toBe("end_turn");
    expect(result.usage?.total_tokens).toBe(18);
  });

  it("leaves the OpenAI path alone when no Claude key is present", async () => {
    await invokeLLM({
      openaiKey: "sk-openai",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(captured!.url).toContain("api.openai.com");
    expect(captured!.init.headers.authorization).toBe("Bearer sk-openai");
  });
});

describe("analysis language", () => {
  it("falls back to English for anything unsupported", () => {
    expect(normalizeLanguage(undefined)).toBe("en");
    expect(normalizeLanguage("de")).toBe("en");
    expect(normalizeLanguage("ko")).toBe("ko");
  });

  it("names the target language in the prompt instruction", () => {
    expect(languageInstruction("ja")).toContain("Japanese");
    expect(languageInstruction("ru")).toContain("Russian");
    // Code and identifiers must survive translation.
    expect(languageInstruction("fr")).toContain("Keep code");
  });
});
