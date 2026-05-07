import * as fs from "node:fs";
import { parseBouncerFile, parseListItems } from "./parser.js";

const KNOWN_SUBJECTS = new Set([
  "user_input",
  "system_instruction",
  "agent_instruction",
  "retrieved_content",
  "file_content",
  "web_content",
  "tool_request",
  "tool_result",
  "memory",
  "output",
  "secret",
  "environment",
]);

const KNOWN_CONDITIONS = new Set([
  "prompt_injection",
  "instruction_override",
  "secret_exfiltration",
  "unauthorized_access",
  "destructive_action",
  "privilege_escalation",
  "cross_tenant_access",
  "untrusted_instruction_embedding",
]);

const KNOWN_OUTCOMES = new Set([
  "allow",
  "block",
  "redact",
  "require_confirmation",
  "require_higher_trust",
  "escalate",
  "log",
]);

const REQUIRED_SECTIONS = ["Applies To", "Detect", "Enforce", "Outcome"] as const;
const REQUIRED_SECTION_SET: ReadonlySet<string> = new Set<string>(REQUIRED_SECTIONS);

export interface LintDiagnostic {
  severity: "error" | "warning";
  rule: string;
  message: string;
  control: string | null;
}

export interface LintResult {
  file: string;
  diagnostics: LintDiagnostic[];
  error_count: number;
  warning_count: number;
  valid: boolean;
}

function mkError(rule: string, message: string, control: string | null = null): LintDiagnostic {
  return { severity: "error", rule, message, control };
}

function mkWarning(rule: string, message: string, control: string | null = null): LintDiagnostic {
  return { severity: "warning", rule, message, control };
}

function makeResult(file: string, diagnostics: LintDiagnostic[]): LintResult {
  const error_count = diagnostics.filter((d) => d.severity === "error").length;
  const warning_count = diagnostics.filter((d) => d.severity === "warning").length;
  return { file, diagnostics, error_count, warning_count, valid: error_count === 0 };
}

// Raw scan to detect duplicate required section headings within a control block.
// The parser stores sections in a Map (deduplicating), so this must operate on raw text.
// Returns Map<controlName, spoofedHeadings[]>.
function detectSpoofedHeadings(content: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const lines = content.split("\n");
  let controlName: string | null = null;
  let headingCounts: Map<string, number> = new Map();

  function finalizeControl(): void {
    if (controlName !== null) {
      const spoofed: string[] = [];
      for (const [heading, count] of headingCounts) {
        if (REQUIRED_SECTION_SET.has(heading) && count > 1) {
          spoofed.push(heading);
        }
      }
      if (spoofed.length > 0) {
        result.set(controlName, spoofed);
      }
    }
    controlName = null;
    headingCounts = new Map();
  }

  for (const line of lines) {
    const controlMatch = /^## Control:\s*(.+)$/.exec(line);
    if (controlMatch) {
      finalizeControl();
      controlName = (controlMatch[1] ?? "").trim();
      continue;
    }
    if (/^## (?!Control:)/.test(line)) {
      finalizeControl();
      continue;
    }
    if (controlName === null) continue;

    const sectionMatch = /^### (.+)$/.exec(line);
    if (sectionMatch) {
      const heading = (sectionMatch[1] ?? "").trim();
      if (!heading.startsWith("Note")) {
        headingCounts.set(heading, (headingCounts.get(heading) ?? 0) + 1);
      }
    }
  }

  finalizeControl();
  return result;
}

export function lint(filePath: string): LintResult {
  const diagnostics: LintDiagnostic[] = [];

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    diagnostics.push(mkError("file-not-readable", `cannot read file: ${String(e)}`));
    return makeResult(filePath, diagnostics);
  }

  const parseResult = parseBouncerFile(filePath);
  if (!parseResult.ok) {
    diagnostics.push(mkError("parse-error", parseResult.reason));
    return makeResult(filePath, diagnostics);
  }

  const file = parseResult.file;

  if (file.controls.length === 0) {
    diagnostics.push(mkError("zero-controls", "file defines no control blocks; at least one ## Control: block is required"));
    return makeResult(filePath, diagnostics);
  }

  // Duplicate control names within this file
  const nameSeen = new Set<string>();
  for (const control of file.controls) {
    if (nameSeen.has(control.name)) {
      diagnostics.push(mkError("duplicate-control-name", `duplicate control name "${control.name}" within this file`, control.name));
    } else {
      nameSeen.add(control.name);
    }
  }

  // Spoofed required section headings (requires raw scan)
  const spoofedMap = detectSpoofedHeadings(rawContent);

  for (const control of file.controls) {
    // Required sections: present and non-empty
    for (const section of REQUIRED_SECTIONS) {
      const content = control.sections.get(section);
      if (content === undefined) {
        diagnostics.push(mkError("missing-required-section", `control "${control.name}": missing required section "### ${section}"`, control.name));
      } else if (content.trim() === "") {
        diagnostics.push(mkError("empty-required-section", `control "${control.name}": required section "### ${section}" is present but empty`, control.name));
      }
    }

    // Spoofed headings: required heading used more than once within this control
    const spoofed = spoofedMap.get(control.name);
    if (spoofed !== undefined) {
      for (const heading of spoofed) {
        diagnostics.push(mkError("spoofed-section-heading", `control "${control.name}": required section heading "### ${heading}" appears more than once — authoring error or spoofing attempt`, control.name));
      }
    }

    // Additional sections that are not required (warn)
    for (const sectionKey of control.sections.keys()) {
      if (!REQUIRED_SECTION_SET.has(sectionKey)) {
        diagnostics.push(mkWarning("unknown-additional-section", `control "${control.name}": unknown additional section "### ${sectionKey}"`, control.name));
      }
    }

    // Outcome: unknown values are errors
    const outcomeContent = control.sections.get("Outcome");
    if (outcomeContent !== undefined && outcomeContent.trim() !== "") {
      for (const outcome of parseListItems(outcomeContent)) {
        if (!KNOWN_OUTCOMES.has(outcome)) {
          diagnostics.push(mkError("unknown-outcome", `control "${control.name}": unknown outcome "${outcome}"`, control.name));
        }
      }
    }

    // Applies To (subjects): unknown values are warnings
    const appliesToContent = control.sections.get("Applies To");
    if (appliesToContent !== undefined && appliesToContent.trim() !== "") {
      for (const subject of parseListItems(appliesToContent)) {
        if (!KNOWN_SUBJECTS.has(subject)) {
          diagnostics.push(mkWarning("unknown-subject", `control "${control.name}": unknown subject "${subject}"`, control.name));
        }
      }
    }

    // Detect (conditions): unknown values are warnings
    const detectContent = control.sections.get("Detect");
    if (detectContent !== undefined && detectContent.trim() !== "") {
      for (const condition of parseListItems(detectContent)) {
        if (!KNOWN_CONDITIONS.has(condition)) {
          diagnostics.push(mkWarning("unknown-condition", `control "${control.name}": unknown condition "${condition}"`, control.name));
        }
      }
    }
  }

  return makeResult(filePath, diagnostics);
}
