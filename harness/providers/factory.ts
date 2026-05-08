import type { LlmProvider } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";

export function createProvider(name?: string): LlmProvider {
  const providerName = name ?? process.env["BOUNCER_LLM_PROVIDER"] ?? "anthropic";
  switch (providerName) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
    default:
      throw new Error(
        `Unknown LLM provider: "${providerName}". Supported providers: anthropic, openai`
      );
  }
}
