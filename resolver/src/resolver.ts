import { v5 as uuidv5 } from "uuid";
import type { ParsedFile } from "./parser.js";
import { parseListItems } from "./parser.js";
import type {
  ResolvedPolicyIR,
  ResolvedControl,
  ResolutionLogEntry,
  PolicyFileRecord,
  Outcome,
  Priority,
  ResolveOptions,
} from "./types.js";
import { BouncerPolicyMismatchError, BouncerMalformedFileError } from "./errors.js";
import { discoverPolicyFiles } from "./discovery.js";
import { parseBouncerFile } from "./parser.js";
import { validateParsedFile } from "./validator.js";

// Fixed namespace for stable UUIDv5 control_id generation
const BOUNCER_NS = "6d626e63-722d-6d64-8000-000000000001";

// Normative precedence table (§4.4). Higher = more restrictive. log excluded (non-competitive).
// escalate is intentionally absent: §4.4 explicitly defers its precedence ordering to a future
// version and states it MUST NOT be used as a substitute for reject-or-halt in v0.5. A control
// declaring only escalate receives outcomeScore -1 and falls through to the block fallback floor.
const OUTCOME_PRECEDENCE: Partial<Record<string, number>> = {
  block: 100,
  require_higher_trust: 70, // provisional: §4.4 defers normative ordering to a future version
  require_confirmation: 65,
  redact: 50,
  allow: 10,
};

const KNOWN_OUTCOMES = new Set<string>([
  "allow",
  "block",
  "redact",
  "require_confirmation",
  "require_higher_trust",
  "escalate",
  "log",
]);

function outcomeScore(o: string): number {
  return OUTCOME_PRECEDENCE[o] ?? -1;
}

// Most restrictive among two outcomes, excluding log
function moreRestrictive(a: string, b: string): string {
  return outcomeScore(a) >= outcomeScore(b) ? a : b;
}

// Validate applies_to for a given file against the caller-supplied agentName.
// Throws BouncerPolicyMismatchError on mismatch or unverifiable name.
function checkAppliesTo(
  file: ParsedFile,
  agentName: string | undefined,
  options: ResolveOptions
): void {
  const appliesTo = file.frontmatter.applies_to;
  if (!appliesTo || appliesTo.length === 0) return; // absent = applies to all

  // applies_to is present — agentName must be provided and verifiable
  if (agentName === undefined || agentName.trim() === "") {
    throw new BouncerPolicyMismatchError(
      file.path,
      options.agentName ?? "(unverified)"
    );
  }

  const normalizedAgent = agentName.toLowerCase();
  const matched = appliesTo.some((entry) => entry.toLowerCase() === normalizedAgent);
  if (!matched) {
    throw new BouncerPolicyMismatchError(file.path, agentName);
  }
}

// Compute a stable UUIDv5 for a control: same file path + position → same UUID
function controlId(filePath: string, index: number): string {
  return uuidv5(`${filePath}:${String(index)}`, BOUNCER_NS);
}

// Process a single valid parsed file into an array of intermediate controls.
function processFile(
  file: ParsedFile,
  resolutionLog: ResolutionLogEntry[]
): ResolvedControl[] {
  const processed: ResolvedControl[] = [];

  for (let i = 0; i < file.controls.length; i++) {
    const parsed = file.controls[i];
    if (!parsed) continue;

    const id = controlId(file.path, i);

    const appliesToItems = parseListItems(parsed.sections.get("Applies To") ?? "");
    const detectItems = parseListItems(parsed.sections.get("Detect") ?? "");
    const enforceItems = parseListItems(parsed.sections.get("Enforce") ?? "");
    const outcomeItems = parseListItems(parsed.sections.get("Outcome") ?? "");

    // Separate known and unknown outcomes; log fallback for unknowns
    const unknowns = outcomeItems.filter((o) => !KNOWN_OUTCOMES.has(o));
    if (unknowns.length > 0) {
      resolutionLog.push({
        event: "fallback",
        detail: `unknown outcome(s) [${unknowns.join(", ")}] in control "${parsed.name}" — falling back to block (universal fallback floor)`,
        source_file: file.path,
        control_id: id,
      });
    }

    // Individual competitive outcome for this control (ignoring log, after fallback).
    // Outcomes with no score (e.g. escalate — deferred in §4.4) fall through to block.
    const knownCompetitive = outcomeItems.filter(
      (o) => KNOWN_OUTCOMES.has(o) && o !== "log"
    );
    const rawWinner =
      knownCompetitive.length > 0 ? knownCompetitive.reduce(moreRestrictive) : "block";
    const individualWinner = outcomeScore(rawWinner) >= 0 ? rawWinner : "block";

    // placeholder — resolved_outcome set later after global winner computed
    processed.push({
      control_id: id,
      source_file: file.path,
      name: parsed.name,
      applies_to: appliesToItems,
      detect: detectItems,
      enforce: enforceItems,
      outcomes: outcomeItems,
      resolved_outcome: individualWinner as Outcome, // individual winner; overwritten with global winner later
      priority: null as Priority | null,
      capability: null,
    });
  }

  return processed;
}

// Detect duplicate control names across the composed set and log conflicts.
function logDuplicateConflicts(
  controls: ResolvedControl[],
  resolutionLog: ResolutionLogEntry[]
): void {
  const byName = new Map<string, ResolvedControl[]>();
  for (const c of controls) {
    const group = byName.get(c.name) ?? [];
    group.push(c);
    byName.set(c.name, group);
  }

  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const outcomes = group.map((c) => c.resolved_outcome);
    const allSame = outcomes.every((o) => o === outcomes[0]);
    if (!allSame) {
      const winner = (outcomes as string[]).reduce(moreRestrictive);
      resolutionLog.push({
        event: "conflict",
        detail: `duplicate control name "${name}" across files with conflicting outcomes [${outcomes.join(", ")}] — resolved to ${winner} per normative precedence table`,
        source_file: null,
        control_id: null,
      });
    }
  }
}

export function resolveFiles(
  agentInstructionPath: string,
  options: ResolveOptions
): ResolvedPolicyIR {
  const resolutionLog: ResolutionLogEntry[] = [];
  const policyFiles: PolicyFileRecord[] = [];

  const { global, scoped } = discoverPolicyFiles(agentInstructionPath);

  if (!global) {
    resolutionLog.push({
      event: "no_policy_found",
      detail:
        "no global baseline (bouncer.md) found in ancestor path; only scoped files applied",
      source_file: null,
      control_id: null,
    });
  }

  // Files to process: global first, then scoped in sorted order
  const filePaths = [...(global ? [global] : []), ...scoped];

  if (filePaths.length === 0) {
    resolutionLog.push({
      event: "no_policy_found",
      detail: "no bouncer policy files found (no bouncer.md and no *.bouncer.md)",
      source_file: null,
      control_id: null,
    });
    return {
      schema_version: "0.8",
      resolved_at: new Date().toISOString(),
      policy_files: [],
      controls: [],
      resolution_log: resolutionLog,
    };
  }

  const acceptedControls: ResolvedControl[] = [];
  let firstRejection: { path: string; reason: string } | null = null;

  for (const filePath of filePaths) {
    const parseResult = parseBouncerFile(filePath);

    if (!parseResult.ok) {
      policyFiles.push({
        path: filePath,
        accepted: false,
        rejection_reason: parseResult.reason,
        policy_name: null,
        policy_version: null,
      });
      resolutionLog.push({
        event: "file_rejected",
        detail: `file rejected: ${parseResult.reason}`,
        source_file: filePath,
        control_id: null,
      });
      if (!firstRejection) firstRejection = { path: filePath, reason: parseResult.reason };
      continue;
    }

    const validationErrors = validateParsedFile(parseResult.file);
    if (validationErrors.length > 0) {
      const reason = validationErrors.map((e) => e.reason).join("; ");
      const rawVersion = parseResult.file.frontmatter["version"];
      policyFiles.push({
        path: filePath,
        accepted: false,
        rejection_reason: reason,
        policy_name: parseResult.file.frontmatter.name,
        policy_version: typeof rawVersion === "string" ? rawVersion : null,
      });
      resolutionLog.push({
        event: "file_rejected",
        detail: `file rejected: ${reason}`,
        source_file: filePath,
        control_id: null,
      });
      if (!firstRejection) firstRejection = { path: filePath, reason };
      continue;
    }

    // applies_to check — throws BouncerPolicyMismatchError on mismatch; halts session
    checkAppliesTo(parseResult.file, options.agentName, options);

    const rawVersion = parseResult.file.frontmatter["version"];
    policyFiles.push({
      path: filePath,
      accepted: true,
      rejection_reason: null,
      policy_name: parseResult.file.frontmatter.name,
      policy_version: typeof rawVersion === "string" ? rawVersion : null,
    });
    const controls = processFile(parseResult.file, resolutionLog);
    acceptedControls.push(...controls);
  }

  // Fail closed: if every discovered file was rejected, throw for the first rejection
  if (acceptedControls.length === 0 && firstRejection) {
    throw new BouncerMalformedFileError(firstRejection.path, firstRejection.reason);
  }

  // Detect and log conflicts from duplicate control names BEFORE stamping the global winner,
  // so conflict detection uses each control's individual outcome, not the unified winner.
  logDuplicateConflicts(acceptedControls, resolutionLog);

  // Compute global winning outcome — most restrictive individual outcome across all controls
  // (log is non-competitive and excluded from this computation)
  const individualWinners = acceptedControls.map((c) => c.resolved_outcome as string);
  const globalWinner: Outcome =
    individualWinners.length > 0
      ? (individualWinners.reduce(moreRestrictive) as Outcome)
      : "block";

  // Stamp global winner on every control.
  // NOTE: resolved_outcome is the session-level enforcement decision — the most restrictive
  // outcome across all controls, applied uniformly. When capability abstraction (#45) is
  // implemented this model will be revisited: per-capability outcomes require per-control
  // resolved_outcome values. PEPs building against this IR MUST NOT assume resolved_outcome
  // is per-control.
  for (const c of acceptedControls) {
    c.resolved_outcome = globalWinner;
  }

  return {
    schema_version: "0.8",
    resolved_at: new Date().toISOString(),
    policy_files: policyFiles,
    controls: acceptedControls,
    resolution_log: resolutionLog,
  };
}
