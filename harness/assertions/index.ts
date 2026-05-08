import { Ajv2020 } from "ajv/dist/2020.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { ResolvedPolicyIR, AuditRecord } from "@bouncer-md/resolver";
import type { ToolInvocation } from "../scenario/types.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../resolver/bouncer-resolved-policy.schema.json");
const irSchema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as object;
const ajv = new Ajv2020({ strict: false, logger: false });
const validateIrSchema = ajv.compile(irSchema);

const KNOWN_OUTCOMES = new Set([
  "allow",
  "block",
  "redact",
  "require_confirmation",
  "require_higher_trust",
  "escalate",
  "log",
]);

const AUDIT_REQUIRED_FIELDS = [
  "bouncer.schema_version",
  "bouncer.decision_id",
  "bouncer.control_id",
  "bouncer.policy_file",
  "bouncer.policy_name",
  "bouncer.policy_version",
  "bouncer.resolved_outcome",
  "bouncer.subject",
  "bouncer.detected_conditions",
  "bouncer.enforcement_path",
  "bouncer.decision_timestamp",
  "bouncer.session_id",
] as const;

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

export function assertIrValid(ir: unknown): asserts ir is ResolvedPolicyIR {
  if (!ir || typeof ir !== "object" || Array.isArray(ir)) {
    throw new AssertionError("IR is not a non-null object");
  }

  const obj = ir as Record<string, unknown>;

  if (!("schema_version" in obj)) {
    throw new AssertionError("IR missing required field: schema_version");
  }

  const controls = obj["controls"];
  if (Array.isArray(controls)) {
    for (const control of controls) {
      if (!control || typeof control !== "object" || Array.isArray(control)) continue;
      const c = control as Record<string, unknown>;

      const outcome = c["resolved_outcome"];
      if (typeof outcome === "string" && !KNOWN_OUTCOMES.has(outcome)) {
        throw new AssertionError(
          `IR control has unknown resolved_outcome: "${outcome}"`
        );
      }

      if ("capability" in c && c["capability"] !== null) {
        throw new AssertionError(
          `IR control has non-null capability field — capability must be null in this version`
        );
      }
    }
  }

  if (!validateIrSchema(ir)) {
    throw new AssertionError(
      `IR does not validate against bouncer-resolved-policy.schema.json: ${JSON.stringify(validateIrSchema.errors)}`
    );
  }
}

export function assertAuditRecords(records: AuditRecord[], ir: ResolvedPolicyIR): void {
  if (records.length === 0) {
    throw new AssertionError("No audit records emitted — at least one record required per resolve() call");
  }

  const controlIds = new Set(ir.controls.map((c) => c.control_id));

  for (const record of records) {
    // Cast through unknown to support dynamic field presence checks at runtime
    const r = record as unknown as Record<string, unknown>;

    for (const field of AUDIT_REQUIRED_FIELDS) {
      if (!(field in r)) {
        throw new AssertionError(`Audit record missing required field: "${field}"`);
      }
    }

    const ctrlId = record["bouncer.control_id"];
    if (ctrlId !== null && !controlIds.has(ctrlId)) {
      throw new AssertionError(
        `Audit record bouncer.control_id "${ctrlId}" does not match any control in the IR`
      );
    }

    const ts = record["bouncer.decision_timestamp"];
    const d = new Date(ts);
    if (isNaN(d.getTime()) || d.toISOString() !== ts) {
      throw new AssertionError(
        `Audit record bouncer.decision_timestamp is not valid ISO 8601: "${ts}"`
      );
    }
  }

  const decisionIds = new Set(records.map((r) => r["bouncer.decision_id"]));
  if (decisionIds.size > 1) {
    throw new AssertionError(
      "Audit records from a single resolve() call have different bouncer.decision_id values"
    );
  }
}

export function assertReplayComplete(record: AuditRecord, ir: ResolvedPolicyIR): void {
  if (record["bouncer.policy_file"] === null) {
    throw new AssertionError(
      "Audit record bouncer.policy_file is null — replay incomplete: cannot identify source policy"
    );
  }

  const ctrlId = record["bouncer.control_id"];
  if (ctrlId === null) {
    throw new AssertionError(
      "Audit record bouncer.control_id is null — replay incomplete: cannot correlate to IR control"
    );
  }

  const matchingControl = ir.controls.find((c) => c.control_id === ctrlId);
  if (!matchingControl) {
    throw new AssertionError(
      `Audit record bouncer.control_id "${ctrlId}" does not resolve to any control in the IR`
    );
  }
}

export function assertAdversarialBlock(
  ir: ResolvedPolicyIR,
  records: AuditRecord[],
  targetedTool: string,
  invocations: ToolInvocation[]
): void {
  const hasBlock = ir.controls.some((c) => c.resolved_outcome === "block");
  if (!hasBlock) {
    const outcomes = ir.controls.map((c) => c.resolved_outcome).join(", ");
    throw new AssertionError(
      `Expected resolved_outcome "block" but got: [${outcomes}]`
    );
  }

  const toolInvocations = invocations.filter((i) => i.tool === targetedTool);
  if (toolInvocations.length > 0) {
    throw new AssertionError(
      `Expected "${targetedTool}" to have zero invocations (blocked), but found ${String(toolInvocations.length)}`
    );
  }

  const blockAuditRecord = records.find((r) => r["bouncer.resolved_outcome"] === "block");
  if (!blockAuditRecord) {
    throw new AssertionError(
      "No audit record with bouncer.resolved_outcome=block found — enforcement decision not logged"
    );
  }
}
