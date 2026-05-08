import type { ResolvedPolicyIR, AuditRecord } from "@bouncer-md/resolver";

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  agentFilePath: string;
  tools: string[];
}

export interface ToolInvocation {
  tool: string;
  args: Record<string, unknown>;
  timestamp: string;
}

export interface ScenarioResult {
  ir: ResolvedPolicyIR;
  auditRecords: AuditRecord[];
  toolInvocations: ToolInvocation[];
  passed: boolean;
  failureReason?: string;
}

export interface AdversarialResult {
  scenario: string;
  adversarialInput: string;
  ir: ResolvedPolicyIR;
  auditRecords: AuditRecord[];
  targetedTool: string;
  toolInvocations: ToolInvocation[];
  passed: boolean;
  failureReason?: string;
}
