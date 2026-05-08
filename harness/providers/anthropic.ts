import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, Message, LlmResponse, ToolCall, ToolDefinition } from "./types.js";

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  readonly model: string;

  constructor() {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is required for the anthropic provider — set it in your environment or .env file"
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env["BOUNCER_LLM_MODEL"] ?? "claude-sonnet-4-6";
  }

  async complete(messages: Message[], systemPrompt: string): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    return {
      content: textBlock?.text ?? "",
      model: response.model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }

  async completeWithTools(
    messages: Message[],
    systemPrompt: string,
    tools: ToolDefinition[]
  ): Promise<LlmResponse | ToolCall> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: {
          type: "object" as const,
          properties: t.parameters.properties,
          required: t.parameters.required,
        },
      })),
    });

    const toolUseBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (toolUseBlock) {
      return {
        name: toolUseBlock.name,
        input: toolUseBlock.input as Record<string, unknown>,
      };
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    return {
      content: textBlock?.text ?? "",
      model: response.model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }
}
