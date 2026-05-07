export type {
  ResolvedPolicyIR,
  ResolveOptions,
  ResolvedControl,
  ResolutionLogEntry,
  PolicyFileRecord,
  Outcome,
  Priority,
} from "./types.js";
export type { AuditRecord } from "./audit.js";
export { BouncerPolicyMismatchError, BouncerMalformedFileError } from "./errors.js";
export { lint } from "./linter.js";
export type { LintResult, LintDiagnostic } from "./linter.js";

import type { ResolvedPolicyIR, ResolveOptions } from "./types.js";
import { resolveFiles } from "./resolver.js";
import { emitAuditRecord, newDecisionId } from "./audit.js";

export function resolve(
  agentInstructionPath: string,
  options?: ResolveOptions
): ResolvedPolicyIR {
  const opts = options ?? {};
  const ir = resolveFiles(agentInstructionPath, opts);

  if (opts.logLevel !== "silent") {
    const decisionId = newDecisionId();
    const timestamp = ir.resolved_at;

    if (ir.controls.length > 0) {
      for (const control of ir.controls) {
        const policyFile = ir.policy_files.find((f) => f.path === control.source_file);
        emitAuditRecord({
          "bouncer.schema_version": ir.schema_version,
          "bouncer.decision_id": decisionId,
          "bouncer.control_id": control.control_id,
          "bouncer.policy_file": control.source_file,
          "bouncer.policy_name": policyFile?.policy_name ?? null,
          "bouncer.policy_version": policyFile?.policy_version ?? null,
          "bouncer.resolved_outcome": control.resolved_outcome,
          "bouncer.subject": opts.agentName ?? null,
          // TODO: detected_conditions requires runtime context evaluation — deferred (#46)
          "bouncer.detected_conditions": [],
          "bouncer.enforcement_path": control.priority === "immutable" ? "path_b" : "path_a",
          "bouncer.decision_timestamp": timestamp,
          "bouncer.session_id": opts.sessionId ?? null,
        });
      }
    } else {
      // No accepted controls — emit one record representing the fail-closed decision
      emitAuditRecord({
        "bouncer.schema_version": ir.schema_version,
        "bouncer.decision_id": decisionId,
        "bouncer.control_id": null,
        "bouncer.policy_file": null,
        "bouncer.policy_name": null,
        "bouncer.policy_version": null,
        "bouncer.resolved_outcome": "block",
        "bouncer.subject": opts.agentName ?? null,
        "bouncer.detected_conditions": [],
        "bouncer.enforcement_path": "path_a",
        "bouncer.decision_timestamp": timestamp,
        "bouncer.session_id": opts.sessionId ?? null,
      });
    }
  }

  return ir;
}
