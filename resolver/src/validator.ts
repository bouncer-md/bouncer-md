import type { ParsedFile } from "./parser.js";

export interface ValidationError {
  reason: string;
}

const REQUIRED_SECTIONS = ["Applies To", "Detect", "Enforce", "Outcome"] as const;

// Validates a parsed bouncer file against structural requirements.
// Returns an array of errors; non-empty means the file is malformed and must be rejected.
// Partial validity rule (§7.3 Rule 10): any error causes rejection of the ENTIRE file —
// valid controls from a partially malformed file are never applied.
export function validateParsedFile(file: ParsedFile): ValidationError[] {
  const errors: ValidationError[] = [];

  if (file.controls.length === 0) {
    errors.push({
      reason: "zero valid controls: file must define at least one ## Control: block",
    });
    return errors; // no point checking further
  }

  for (const control of file.controls) {
    for (const section of REQUIRED_SECTIONS) {
      const content = control.sections.get(section);
      if (content === undefined) {
        errors.push({
          reason: `control "${control.name}": missing required section "### ${section}"`,
        });
      } else if (content.trim() === "") {
        errors.push({
          reason: `control "${control.name}": required section "### ${section}" is empty`,
        });
      }
    }
  }

  return errors;
}
