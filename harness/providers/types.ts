export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LlmProvider {
  name: string;
  complete(messages: Message[], systemPrompt: string): Promise<LlmResponse>;
  completeWithTools(
    messages: Message[],
    systemPrompt: string,
    tools: ToolDefinition[]
  ): Promise<LlmResponse | ToolCall>;
}
