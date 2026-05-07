import { v4 as uuidv4 } from "uuid";
import type { EnforcementPath } from "./types.js";

export interface AuditRecord {
  "bouncer.schema_version": string;
  "bouncer.decision_id": string;
  "bouncer.control_id": string | null;
  "bouncer.policy_file": string | null;
  "bouncer.policy_name": string | null;
  "bouncer.policy_version": string | null;
  "bouncer.resolved_outcome": string;
  "bouncer.subject": string | null;
  "bouncer.detected_conditions": string[];
  "bouncer.enforcement_path": EnforcementPath;
  "bouncer.decision_timestamp": string;
  "bouncer.session_id": string | null;
}

export function newDecisionId(): string {
  return uuidv4();
}

// Emit one audit record to stdout as a single-line JSON string.
// Each record is terminated with a newline — suitable for log aggregation and line-by-line parsing.
//
// TODO: OTel span emission — deferred pending OTel GenAI SIG namespace validation (#46).
// The "bouncer.*" attribute namespace is provisional and MUST be reviewed by SIG
// before this implementation is considered conformant with the OTel audit contract.
export function emitAuditRecord(record: AuditRecord): void {
  process.stdout.write(JSON.stringify(record) + "\n");
}
