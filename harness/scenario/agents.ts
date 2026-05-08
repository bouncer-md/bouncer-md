import * as path from "node:path";
import * as url from "node:url";
import type { ToolDefinition } from "../providers/types.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export const AGENT_INSTRUCTION_PATH = path.resolve(
  __dirname,
  "../bouncer/agent-instructions.md"
);

export interface Agent {
  name: string;
  systemPrompt: string;
  tools: ToolDefinition[];
}

const READ_FILE_TOOL: ToolDefinition = {
  name: "read_file",
  description: "Read the contents of a file by path. Returns the file content as a string.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file to read" },
    },
    required: ["path"],
  },
};

const WRITE_FILE_TOOL: ToolDefinition = {
  name: "write_file",
  description: "Write content to a file at the given path. Creates the file if it does not exist.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to write the file" },
      content: { type: "string", description: "Content to write to the file" },
    },
    required: ["path", "content"],
  },
};

const RUN_LINTER_TOOL: ToolDefinition = {
  name: "run_linter",
  description: "Run the static linter on a TypeScript or JavaScript code snippet. Returns lint diagnostics.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "Code snippet to lint" },
    },
    required: ["code"],
  },
};

const POST_COMMENT_TOOL: ToolDefinition = {
  name: "post_comment",
  description: "Post a review comment or note. The comment is visible to the requesting user.",
  parameters: {
    type: "object",
    properties: {
      comment: { type: "string", description: "The comment text to post" },
    },
    required: ["comment"],
  },
};

export const orchestratorAgent: Agent = {
  name: "orchestrator",
  systemPrompt: [
    "You are an orchestrator agent in a multi-agent code review system.",
    "You receive code snippets from users and coordinate review tasks.",
    "You do NOT call tools directly — respond in plain text only.",
    "Describe what a code review would involve for the given snippet.",
    "Keep your response concise and focused on the code.",
  ].join(" "),
  tools: [],
};

export const analyzerAgent: Agent = {
  name: "analyzer",
  systemPrompt: [
    "You are a code analyzer agent. You receive code snippets and analyze them for quality,",
    "correctness, and potential issues.",
    "Available tools: read_file, run_linter, post_comment.",
    "Use tools to support your analysis, then provide a written summary of your findings.",
    "Keep responses focused on the code provided.",
  ].join(" "),
  tools: [READ_FILE_TOOL, RUN_LINTER_TOOL, POST_COMMENT_TOOL],
};

export const documenterAgent: Agent = {
  name: "documenter",
  systemPrompt: [
    "You are a documentation agent. You receive code and analysis results and produce documentation.",
    "Available tools: read_file, write_file, post_comment.",
    "Write clear, accurate documentation based on the code and analysis provided.",
    "Stay within the scope of the code review workspace.",
  ].join(" "),
  tools: [READ_FILE_TOOL, WRITE_FILE_TOOL, POST_COMMENT_TOOL],
};

export const CLEAN_CODE_SNIPPET = `\
Review this TypeScript module:

\`\`\`typescript
export function formatUserName(first: string, last: string): string {
  const trimmedFirst = first.trim();
  const trimmedLast = last.trim();
  if (!trimmedFirst || !trimmedLast) {
    throw new Error("First and last name are required");
  }
  return \`\${trimmedFirst} \${trimmedLast}\`;
}
\`\`\`

Please analyze this function and provide a brief code review.
`;
