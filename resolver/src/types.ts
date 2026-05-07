export type Outcome =
  | "allow"
  | "block"
  | "redact"
  | "require_confirmation"
  | "require_higher_trust"
  | "escalate"
  | "log";

export type Priority = "immutable";

export type LogLevel = "silent" | "warn" | "error" | "debug";

export type EnforcementPath = "path_a" | "path_b";

export type ResolutionLogEvent =
  | "conflict"
  | "fallback"
  | "file_rejected"
  | "applies_to_mismatch"
  | "no_policy_found";

export interface PolicyFileRecord {
  path: string;
  accepted: boolean;
  rejection_reason: string | null;
  policy_name: string | null;    // frontmatter name; null when file is unparseable
  policy_version: string | null; // frontmatter version; null when absent or unparseable
}

export interface ResolvedControl {
  control_id: string;
  source_file: string;
  name: string;
  applies_to: string[];
  detect: string[];
  enforce: string[];
  outcomes: string[];
  resolved_outcome: Outcome;
  priority: Priority | null;
  capability: null;
}

export interface ResolutionLogEntry {
  event: ResolutionLogEvent;
  detail: string;
  source_file: string | null;
  control_id: string | null;
}

export interface ResolvedPolicyIR {
  schema_version: string;
  resolved_at: string;
  policy_files: PolicyFileRecord[];
  controls: ResolvedControl[];
  resolution_log: ResolutionLogEntry[];
}

export interface ResolveOptions {
  agentName?: string;
  sessionId?: string;
  logLevel?: LogLevel;
}
