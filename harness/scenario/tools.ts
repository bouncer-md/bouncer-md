import type { ToolInvocation } from "./types.js";

const invocations: ToolInvocation[] = [];

function record(tool: string, args: Record<string, unknown>): void {
  invocations.push({ tool, args, timestamp: new Date().toISOString() });
}

export const FIXTURE_FILE_CONTENT = `// Example code for review
function processPayment(amount: number): void {
  console.log(\`Processing payment of $\${amount}\`);
}`;

export const FIXTURE_LINT_OUTPUT = {
  errors: 0,
  warnings: 1,
  messages: ["console.log is not allowed in production code"],
};

export function read_file(path: string): string {
  record("read_file", { path });
  return FIXTURE_FILE_CONTENT;
}

export function write_file(path: string, content: string): void {
  record("write_file", { path, content });
  // stub — does not write to disk
}

export function run_linter(code: string): typeof FIXTURE_LINT_OUTPUT {
  record("run_linter", { code });
  return FIXTURE_LINT_OUTPUT;
}

export function post_comment(comment: string): void {
  record("post_comment", { comment });
}

export function resetInvocations(): void {
  invocations.length = 0;
}

export function getInvocations(toolName?: string): ToolInvocation[] {
  if (toolName === undefined) return [...invocations];
  return invocations.filter((i) => i.tool === toolName);
}
