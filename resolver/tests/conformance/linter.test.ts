import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import { lint } from "../../src/index.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../fixtures");

// ── Clean file ────────────────────────────────────────────────────────────────

describe("linter: clean file", () => {
  it("returns valid=true with zero errors and warnings for a well-formed file", () => {
    const result = lint(path.join(fixtures, "linter-clean/policy.bouncer.md"));
    expect(result.valid).toBe(true);
    expect(result.error_count).toBe(0);
    expect(result.warning_count).toBe(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("result.file is the resolved file path", () => {
    const filePath = path.join(fixtures, "linter-clean/policy.bouncer.md");
    const result = lint(filePath);
    expect(result.file).toBe(filePath);
  });
});

// ── Parse errors ──────────────────────────────────────────────────────────────

describe("linter: parse errors", () => {
  it("emits error with rule=parse-error for invalid YAML", () => {
    const result = lint(path.join(fixtures, "malformed-invalid-yaml/policy.bouncer.md"));
    expect(result.valid).toBe(false);
    expect(result.error_count).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.rule === "parse-error")).toBe(true);
  });

  it("emits error for non-existent file", () => {
    const result = lint(path.join(fixtures, "does-not-exist/policy.bouncer.md"));
    expect(result.valid).toBe(false);
    expect(result.error_count).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.rule === "file-not-readable")).toBe(true);
  });
});

// ── Zero controls ─────────────────────────────────────────────────────────────

describe("linter: zero controls", () => {
  it("emits error with rule=zero-controls when file has no control blocks", () => {
    const result = lint(path.join(fixtures, "malformed-zero-controls/policy.bouncer.md"));
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.rule === "zero-controls")).toBe(true);
  });
});

// ── Required sections ─────────────────────────────────────────────────────────

describe("linter: empty required section", () => {
  it("emits error with rule=empty-required-section for empty ### Outcome", () => {
    const result = lint(path.join(fixtures, "malformed-empty-outcome/policy.bouncer.md"));
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.rule === "empty-required-section")).toBe(true);
  });

  it("error identifies the specific empty section", () => {
    const result = lint(path.join(fixtures, "malformed-empty-outcome/policy.bouncer.md"));
    const d = result.diagnostics.find((x) => x.rule === "empty-required-section");
    expect(d?.message.toLowerCase()).toContain("outcome");
  });
});

describe("linter: partial validity (one malformed control)", () => {
  it("emits errors for both the malformed control AND flags the entire file", () => {
    const result = lint(path.join(fixtures, "malformed-partial-validity/policy.bouncer.md"));
    expect(result.valid).toBe(false);
    // The malformed control's empty Outcome triggers an error
    expect(result.diagnostics.some((d) => d.rule === "empty-required-section")).toBe(true);
    // The valid control is still present — no errors for it
    const validControlErrors = result.diagnostics.filter(
      (d) => d.control === "Valid Control" && d.severity === "error"
    );
    expect(validControlErrors).toHaveLength(0);
  });
});

// ── Duplicate control names ───────────────────────────────────────────────────

describe("linter: duplicate control names", () => {
  it("emits error with rule=duplicate-control-name", () => {
    const result = lint(path.join(fixtures, "linter-duplicate-control/policy.bouncer.md"));
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.rule === "duplicate-control-name")).toBe(true);
  });

  it("error message identifies the duplicated name", () => {
    const result = lint(path.join(fixtures, "linter-duplicate-control/policy.bouncer.md"));
    const d = result.diagnostics.find((x) => x.rule === "duplicate-control-name");
    expect(d?.message).toContain("Access Control");
  });

  it("error control field is set to the duplicate name", () => {
    const result = lint(path.join(fixtures, "linter-duplicate-control/policy.bouncer.md"));
    const d = result.diagnostics.find((x) => x.rule === "duplicate-control-name");
    expect(d?.control).toBe("Access Control");
  });
});

// ── Unknown outcomes ──────────────────────────────────────────────────────────

describe("linter: unknown outcomes", () => {
  it("emits error with rule=unknown-outcome for unrecognized outcome", () => {
    const result = lint(path.join(fixtures, "unknown-outcome/policy.bouncer.md"));
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.rule === "unknown-outcome")).toBe(true);
  });

  it("error message identifies the unknown outcome value", () => {
    const result = lint(path.join(fixtures, "unknown-outcome/policy.bouncer.md"));
    const d = result.diagnostics.find((x) => x.rule === "unknown-outcome");
    expect(d?.message).toContain("quantum_block");
  });
});

// ── Spoofed section headings ──────────────────────────────────────────────────

describe("linter: spoofed required section headings", () => {
  it("emits error with rule=spoofed-section-heading when required heading appears twice", () => {
    const result = lint(path.join(fixtures, "linter-spoofed-heading/policy.bouncer.md"));
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.rule === "spoofed-section-heading")).toBe(true);
  });

  it("error message identifies the duplicated heading name", () => {
    const result = lint(path.join(fixtures, "linter-spoofed-heading/policy.bouncer.md"));
    const d = result.diagnostics.find((x) => x.rule === "spoofed-section-heading");
    expect(d?.message).toContain("Applies To");
  });
});

// ── Unknown subjects (warnings) ───────────────────────────────────────────────

describe("linter: unknown subjects", () => {
  it("emits warning (not error) with rule=unknown-subject for unrecognized subject", () => {
    const result = lint(path.join(fixtures, "linter-unknown-subject/policy.bouncer.md"));
    // Warnings only — file is still valid
    expect(result.valid).toBe(true);
    expect(result.warning_count).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.rule === "unknown-subject" && d.severity === "warning")).toBe(true);
  });

  it("warning message identifies the unknown subject", () => {
    const result = lint(path.join(fixtures, "linter-unknown-subject/policy.bouncer.md"));
    const d = result.diagnostics.find((x) => x.rule === "unknown-subject");
    expect(d?.message).toContain("robot_controller");
  });
});

// ── Unknown conditions (warnings) ─────────────────────────────────────────────

describe("linter: unknown conditions", () => {
  it("emits warning (not error) with rule=unknown-condition for unrecognized condition", () => {
    const result = lint(path.join(fixtures, "linter-unknown-condition/policy.bouncer.md"));
    expect(result.valid).toBe(true);
    expect(result.warning_count).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.rule === "unknown-condition" && d.severity === "warning")).toBe(true);
  });

  it("warning message identifies the unknown condition", () => {
    const result = lint(path.join(fixtures, "linter-unknown-condition/policy.bouncer.md"));
    const d = result.diagnostics.find((x) => x.rule === "unknown-condition");
    expect(d?.message).toContain("quantum_attack");
  });
});

// ── Unknown additional sections (warnings) ────────────────────────────────────

describe("linter: unknown additional sections", () => {
  it("emits warning (not error) with rule=unknown-additional-section for unrecognized heading", () => {
    const result = lint(path.join(fixtures, "linter-unknown-section/policy.bouncer.md"));
    expect(result.valid).toBe(true);
    expect(result.warning_count).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.rule === "unknown-additional-section" && d.severity === "warning")).toBe(true);
  });

  it("warning message identifies the additional section name", () => {
    const result = lint(path.join(fixtures, "linter-unknown-section/policy.bouncer.md"));
    const d = result.diagnostics.find((x) => x.rule === "unknown-additional-section");
    expect(d?.message).toContain("Rationale");
  });
});

// ── LintResult shape ──────────────────────────────────────────────────────────

describe("linter: LintResult shape", () => {
  it("error_count matches number of error-severity diagnostics", () => {
    const result = lint(path.join(fixtures, "malformed-empty-outcome/policy.bouncer.md"));
    const actualErrors = result.diagnostics.filter((d) => d.severity === "error").length;
    expect(result.error_count).toBe(actualErrors);
  });

  it("warning_count matches number of warning-severity diagnostics", () => {
    const result = lint(path.join(fixtures, "linter-unknown-subject/policy.bouncer.md"));
    const actualWarnings = result.diagnostics.filter((d) => d.severity === "warning").length;
    expect(result.warning_count).toBe(actualWarnings);
  });

  it("valid is false when error_count > 0", () => {
    const result = lint(path.join(fixtures, "unknown-outcome/policy.bouncer.md"));
    expect(result.error_count).toBeGreaterThan(0);
    expect(result.valid).toBe(false);
  });

  it("valid is true when only warnings are present", () => {
    const result = lint(path.join(fixtures, "linter-unknown-condition/policy.bouncer.md"));
    expect(result.error_count).toBe(0);
    expect(result.warning_count).toBeGreaterThan(0);
    expect(result.valid).toBe(true);
  });

  it("LintResult serializes to valid JSON", () => {
    const result = lint(path.join(fixtures, "linter-clean/policy.bouncer.md"));
    expect(() => { JSON.parse(JSON.stringify(result)); }).not.toThrow();
    const parsed: unknown = JSON.parse(JSON.stringify(result));
    expect(parsed).toMatchObject({
      file: expect.any(String) as unknown,
      diagnostics: expect.any(Array) as unknown,
      error_count: 0,
      warning_count: 0,
      valid: true,
    });
  });
});
