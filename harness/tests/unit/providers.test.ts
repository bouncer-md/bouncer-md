import { describe, it, expect, vi, afterEach } from "vitest";
import type { LlmProvider, Message, LlmResponse, ToolCall, ToolDefinition } from "../../providers/types.js";
import { createProvider } from "../../providers/factory.js";

const mockMessages: Message[] = [{ role: "user", content: "hello" }];
const mockSystemPrompt = "You are a helpful assistant.";
const mockTool: ToolDefinition = {
  name: "read_file",
  description: "Reads a file and returns its content",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "File path to read" } },
    required: ["path"],
  },
};

const MOCK_RESPONSE: LlmResponse = {
  content: "mock response",
  model: "mock-model",
  usage: { input_tokens: 10, output_tokens: 20 },
};

const MOCK_TOOL_CALL: ToolCall = {
  name: "read_file",
  input: { path: "/tmp/file.ts" },
};

// MockProvider: implements LlmProvider with scripted responses — no real API calls
class MockProvider implements LlmProvider {
  readonly name = "mock";
  private readonly returnToolCall: boolean;

  constructor(returnToolCall = false) {
    this.returnToolCall = returnToolCall;
  }

  complete(_messages: Message[], _systemPrompt: string): Promise<LlmResponse> {
    return Promise.resolve(MOCK_RESPONSE);
  }

  completeWithTools(
    _messages: Message[],
    _systemPrompt: string,
    _tools: ToolDefinition[]
  ): Promise<LlmResponse | ToolCall> {
    return Promise.resolve(this.returnToolCall ? MOCK_TOOL_CALL : MOCK_RESPONSE);
  }
}

// ── MockProvider satisfies the LlmProvider interface ──────────────────────────

describe("LlmProvider interface: MockProvider", () => {
  it("MockProvider satisfies the LlmProvider interface", () => {
    const provider: LlmProvider = new MockProvider();
    expect(provider.name).toBe("mock");
  });

  it("provider name is accessible as a string", () => {
    const provider: LlmProvider = new MockProvider();
    expect(typeof provider.name).toBe("string");
    expect(provider.name.length).toBeGreaterThan(0);
  });

  it("complete() returns an LlmResponse with content, model, usage fields", async () => {
    const provider = new MockProvider();
    const response = await provider.complete(mockMessages, mockSystemPrompt);
    expect(response).toHaveProperty("content");
    expect(response).toHaveProperty("model");
    expect(response).toHaveProperty("usage");
    expect(typeof response.content).toBe("string");
    expect(typeof response.model).toBe("string");
  });

  it("completeWithTools() returns LlmResponse when model responds with text", async () => {
    const provider = new MockProvider(false);
    const result = await provider.completeWithTools(mockMessages, mockSystemPrompt, [mockTool]);
    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("model");
  });

  it("completeWithTools() returns ToolCall when model requests a tool", async () => {
    const provider = new MockProvider(true);
    const result = await provider.completeWithTools(mockMessages, mockSystemPrompt, [mockTool]);
    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("input");
  });

  it("ToolCall has name (string) and input (object) fields", async () => {
    const provider = new MockProvider(true);
    const result = await provider.completeWithTools(
      mockMessages,
      mockSystemPrompt,
      [mockTool]
    ) as ToolCall;
    expect(typeof result.name).toBe("string");
    expect(result.name).toBe("read_file");
    expect(typeof result.input).toBe("object");
    expect(result.input).toMatchObject({ path: "/tmp/file.ts" });
  });
});

// ── createProvider: factory ───────────────────────────────────────────────────

describe("createProvider: factory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("selects anthropic when name='anthropic' passed explicitly", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
    const provider = createProvider("anthropic");
    expect(provider.name).toBe("anthropic");
  });

  it("selects openai when name='openai' passed explicitly", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    const provider = createProvider("openai");
    expect(provider.name).toBe("openai");
  });

  it("reads BOUNCER_LLM_PROVIDER env var to select provider", () => {
    vi.stubEnv("BOUNCER_LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-real");
    const provider = createProvider();
    expect(provider.name).toBe("openai");
  });

  it("throws a descriptive error when ANTHROPIC_API_KEY is missing", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => { createProvider("anthropic"); }).toThrow("ANTHROPIC_API_KEY");
  });

  it("throws a descriptive error when OPENAI_API_KEY is missing", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => { createProvider("openai"); }).toThrow("OPENAI_API_KEY");
  });

  it("throws a descriptive error for an unknown provider name", () => {
    expect(() => { createProvider("unknown-provider"); }).toThrow(/unknown.*provider/i);
  });
});
