import OpenAI from "openai";
import type { LlmProvider, Message, LlmResponse, ToolCall, ToolDefinition } from "./types.js";

export class OpenAIProvider implements LlmProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  readonly model: string;

  constructor() {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for the openai provider — set it in your environment or .env file"
      );
    }
    const baseURL = process.env["OPENAI_BASE_URL"];
    if (baseURL) {
      this.client = new OpenAI({ apiKey, baseURL });
    } else {
      this.client = new OpenAI({ apiKey });
    }
    this.model = process.env["BOUNCER_LLM_MODEL"] ?? "gpt-4o";
  }

  async complete(messages: Message[], systemPrompt: string): Promise<LlmResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    const choice = response.choices[0];
    const result: LlmResponse = {
      content: choice?.message.content ?? "",
      model: response.model,
    };
    const usageData = response.usage;
    if (usageData) {
      result.usage = {
        input_tokens: usageData.prompt_tokens,
        output_tokens: usageData.completion_tokens,
      };
    }
    return result;
  }

  async completeWithTools(
    messages: Message[],
    systemPrompt: string,
    tools: ToolDefinition[]
  ): Promise<LlmResponse | ToolCall> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      tools: tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: "object",
            properties: t.parameters.properties,
            required: t.parameters.required,
          },
        },
      })),
    });

    const choice = response.choices[0];
    const toolCall = choice?.message.tool_calls?.[0];
    if (toolCall) {
      const rawInput: unknown = JSON.parse(toolCall.function.arguments);
      const input =
        typeof rawInput === "object" && rawInput !== null
          ? (rawInput as Record<string, unknown>)
          : {};
      return { name: toolCall.function.name, input };
    }

    const result: LlmResponse = {
      content: choice?.message.content ?? "",
      model: response.model,
    };
    const usageData = response.usage;
    if (usageData) {
      result.usage = {
        input_tokens: usageData.prompt_tokens,
        output_tokens: usageData.completion_tokens,
      };
    }
    return result;
  }
}
