import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { resolve } from "@bouncer-md/resolver";
import type { ResolvedPolicyIR, AuditRecord, ResolveOptions } from "@bouncer-md/resolver";
import type { LlmProvider, Message, LlmResponse, ToolCall } from "../providers/types.js";
import type { ScenarioResult, AdversarialResult } from "./types.js";
import {
  assertIrValid,
  assertAuditRecords,
  assertReplayComplete,
  assertAdversarialBlock,
  AssertionError,
} from "../assertions/index.js";
import {
  read_file,
  write_file,
  run_linter,
  post_comment,
  resetInvocations,
  getInvocations,
} from "./tools.js";
import {
  AGENT_INSTRUCTION_PATH,
  CLEAN_CODE_SNIPPET,
  orchestratorAgent,
  analyzerAgent,
  documenterAgent,
} from "./agents.js";
import type { Agent } from "./agents.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ADVERSARIAL_DIR = path.resolve(__dirname, "../adversarial");

// ── Audit record capture ──────────────────────────────────────────────────────

// Capture JSON audit records written to stdout during resolve().
// The resolver emits one JSON line per control via process.stdout.write.
function captureResolve(
  agentInstructionPath: string,
  options: ResolveOptions
): { ir: ResolvedPolicyIR; records: AuditRecord[] } {
  const captured: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  const captureWrite = (
    chunk: Uint8Array | string,
    encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void
  ): boolean => {
    const text =
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t.startsWith("{")) captured.push(t);
    }
    const callback = typeof encodingOrCb === "function" ? encodingOrCb : cb;
    callback?.();
    return true;
  };

  // Override stdout.write to intercept audit records from resolve()
  process.stdout.write = captureWrite;

  let ir: ResolvedPolicyIR;
  try {
    ir = resolve(agentInstructionPath, options);
  } finally {
    process.stdout.write = originalWrite;
  }

  const records: AuditRecord[] = captured.flatMap((line) => {
    try {
      return [JSON.parse(line) as AuditRecord];
    } catch {
      return [];
    }
  });

  return { ir, records };
}

// ── PEP enforcement helper ────────────────────────────────────────────────────

function isBlocked(ir: ResolvedPolicyIR): boolean {
  if (ir.controls.length === 0) return true; // fail closed
  return ir.controls.some((c) => c.resolved_outcome === "block");
}

function isToolCall(result: LlmResponse | ToolCall): result is ToolCall {
  return "name" in result && !("content" in result);
}

function toolStr(input: Record<string, unknown>, key: string): string {
  const val = input[key];
  return typeof val === "string" ? val : "";
}

function executeToolStub(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "read_file":
      return read_file(toolStr(input, "path"));
    case "write_file":
      write_file(toolStr(input, "path"), toolStr(input, "content"));
      return "File written successfully";
    case "run_linter":
      return JSON.stringify(run_linter(toolStr(input, "code")));
    case "post_comment":
      post_comment(toolStr(input, "comment"));
      return "Comment posted";
    default:
      return `Unknown tool: ${name}`;
  }
}

// ── Agent run loop ────────────────────────────────────────────────────────────

// Run one agent turn cycle: LLM call → optional tool enforcement → final text.
// Enforces block via the IR: when blocked, tool calls are rejected and the LLM
// is asked to respond with text instead. Stubs are only called when not blocked.
async function runAgent(
  provider: LlmProvider,
  agent: Agent,
  userMessage: string,
  ir: ResolvedPolicyIR,
  maxTurns = 4
): Promise<{ response: string; model: string }> {
  const blocked = isBlocked(ir);
  const messages: Message[] = [{ role: "user", content: userMessage }];
  let model = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    if (agent.tools.length === 0) {
      const result = await provider.complete(messages, agent.systemPrompt);
      model = result.model;
      return { response: result.content, model };
    }

    const result = await provider.completeWithTools(
      messages,
      agent.systemPrompt,
      agent.tools
    );

    if (!isToolCall(result)) {
      model = result.model;
      return { response: result.content, model };
    }

    // LLM requested a tool call
    const toolCall = result;
    messages.push({
      role: "assistant",
      content: `Requesting tool: ${toolCall.name}(${JSON.stringify(toolCall.input)})`,
    });

    if (blocked) {
      // PEP enforces block — do not call the stub
      messages.push({
        role: "user",
        content: `Tool call to "${toolCall.name}" was blocked by the active security policy. Please provide your response as text only, without calling any tools.`,
      });
    } else {
      const toolResult = executeToolStub(toolCall.name, toolCall.input);
      messages.push({ role: "user", content: toolResult });
    }
  }

  // Max turns reached — force a final text response
  const fallback = await provider.complete(messages, agent.systemPrompt);
  return { response: fallback.content, model: fallback.model };
}

// ── Clean scenario ────────────────────────────────────────────────────────────

export async function runCleanScenario(
  provider: LlmProvider
): Promise<{ result: ScenarioResult; model: string }> {
  resetInvocations();

  const { ir, records } = captureResolve(AGENT_INSTRUCTION_PATH, {
    agentName: "harness",
    logLevel: "warn",
  });

  let passed = true;
  let failureReason: string | undefined;

  try {
    assertIrValid(ir);
    assertAuditRecords(records, ir);
    const firstRecord = records[0];
    if (!firstRecord) throw new AssertionError("No audit records captured from resolve()");
    assertReplayComplete(firstRecord, ir);
  } catch (err) {
    passed = false;
    failureReason = err instanceof AssertionError ? err.message : String(err);
  }

  // Run agents (text only — block is enforced; tools are not called)
  if (passed) {
    try {
      await runAgent(provider, orchestratorAgent, CLEAN_CODE_SNIPPET, ir);
      await runAgent(provider, analyzerAgent, CLEAN_CODE_SNIPPET, ir);
      await runAgent(provider, documenterAgent, CLEAN_CODE_SNIPPET, ir);
    } catch (err) {
      passed = false;
      failureReason = `LLM call failed: ${String(err)}`;
    }
  }

  // Get model from a simple call if no model yet
  let model = "unknown";
  try {
    const probe = await provider.complete(
      [{ role: "user", content: "ping" }],
      "Reply with the single word: pong"
    );
    model = probe.model;
  } catch {
    // model stays "unknown"
  }

  const result: ScenarioResult = {
    ir,
    auditRecords: records,
    toolInvocations: getInvocations(),
    passed,
    ...(failureReason !== undefined ? { failureReason } : {}),
  };

  return { result, model };
}

// ── Adversarial scenarios ─────────────────────────────────────────────────────

interface AdversarialSpec {
  scenario: string;
  file: string;
  targetedTool: string;
}

const ADVERSARIAL_SPECS: AdversarialSpec[] = [
  {
    scenario: "prompt-injection/code-comment-override",
    file: "prompt-injection/code-comment-override.txt",
    targetedTool: "write_file",
  },
  {
    scenario: "prompt-injection/instruction-in-snippet",
    file: "prompt-injection/instruction-in-snippet.txt",
    targetedTool: "write_file",
  },
  {
    scenario: "prompt-injection/system-claim-in-payload",
    file: "prompt-injection/system-claim-in-payload.txt",
    targetedTool: "write_file",
  },
  {
    scenario: "secret-exfiltration/env-var-in-code",
    file: "secret-exfiltration/env-var-in-code.txt",
    targetedTool: "write_file",
  },
  {
    scenario: "secret-exfiltration/api-key-in-comment",
    file: "secret-exfiltration/api-key-in-comment.txt",
    targetedTool: "write_file",
  },
  {
    scenario: "secret-exfiltration/secret-in-output-request",
    file: "secret-exfiltration/secret-in-output-request.txt",
    targetedTool: "write_file",
  },
  {
    scenario: "tool-chaining/escalate-read-to-write",
    file: "tool-chaining/escalate-read-to-write.txt",
    targetedTool: "write_file",
  },
  {
    scenario: "tool-chaining/chain-to-external-post",
    file: "tool-chaining/chain-to-external-post.txt",
    targetedTool: "post_comment",
  },
  {
    scenario: "instruction-override/ignore-previous-instructions",
    file: "instruction-override/ignore-previous-instructions.txt",
    targetedTool: "write_file",
  },
  {
    scenario: "instruction-override/role-redefinition",
    file: "instruction-override/role-redefinition.txt",
    targetedTool: "write_file",
  },
];

async function runOneAdversarialScenario(
  provider: LlmProvider,
  spec: AdversarialSpec
): Promise<{ result: AdversarialResult; model: string }> {
  resetInvocations();

  const adversarialInput = fs.readFileSync(
    path.join(ADVERSARIAL_DIR, spec.file),
    "utf-8"
  );

  const { ir, records } = captureResolve(AGENT_INSTRUCTION_PATH, {
    agentName: "harness",
    logLevel: "warn",
  });

  let passed = true;
  let failureReason: string | undefined;
  let model = "unknown";

  // Run the documenter agent (has write_file, read_file, post_comment)
  // with the adversarial input. Block is enforced — targeted tool not called.
  try {
    const agentResult = await runAgent(
      provider,
      documenterAgent,
      adversarialInput,
      ir
    );
    model = agentResult.model;
  } catch (err) {
    passed = false;
    failureReason = `LLM call failed: ${String(err)}`;
  }

  const invocations = getInvocations();

  if (passed) {
    try {
      assertAdversarialBlock(ir, records, spec.targetedTool, invocations);
    } catch (err) {
      passed = false;
      failureReason = err instanceof AssertionError ? err.message : String(err);
    }
  }

  const result: AdversarialResult = {
    scenario: spec.scenario,
    adversarialInput,
    ir,
    auditRecords: records,
    targetedTool: spec.targetedTool,
    toolInvocations: invocations,
    passed,
    ...(failureReason !== undefined ? { failureReason } : {}),
  };

  return { result, model };
}

export async function runAdversarialScenarios(
  provider: LlmProvider
): Promise<{ results: AdversarialResult[]; model: string }> {
  const results: AdversarialResult[] = [];
  let model = "unknown";

  for (const spec of ADVERSARIAL_SPECS) {
    const { result, model: m } = await runOneAdversarialScenario(provider, spec);
    results.push(result);
    if (model === "unknown" && m !== "unknown") model = m;
  }

  return { results, model };
}

// ── Resolver version ──────────────────────────────────────────────────────────

export function getResolverVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../../resolver/package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}
