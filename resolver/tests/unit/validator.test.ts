import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import { parseBouncerFile } from "../../src/parser.js";
import { validateParsedFile } from "../../src/validator.js";
import type { ParsedFile } from "../../src/parser.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../fixtures");

function parsedFileFromFixture(fixturePath: string): ParsedFile {
  const result = parseBouncerFile(fixturePath);
  if (!result.ok) throw new Error(`fixture parse failed: ${result.reason}`);
  return result.file;
}

// Helper: build a minimal valid ParsedFile in memory
function minimalParsedFile(overrides?: Partial<ParsedFile["controls"][number]>): ParsedFile {
  const defaultControl = {
    name: "Test Control",
    sections: new Map([
      ["Applies To", "- agent"],
      ["Detect", "- something"],
      ["Enforce", "- block it"],
      ["Outcome", "- block"],
    ]),
  };
  return {
    path: "/virtual/test.bouncer.md",
    frontmatter: { name: "Test Policy", description: "Test description" },
    controls: [overrides ? { ...defaultControl, ...overrides } : defaultControl],
  };
}

// ── validateParsedFile ────────────────────────────────────────────────────────

describe("validateParsedFile", () => {
  describe("valid files", () => {
    it("returns no errors for a well-formed file", () => {
      const file = parsedFileFromFixture(
        path.join(fixtures, "applies-to-match/policy.bouncer.md")
      );
      expect(validateParsedFile(file)).toEqual([]);
    });

    it("returns no errors for minimal in-memory valid file", () => {
      expect(validateParsedFile(minimalParsedFile())).toEqual([]);
    });
  });

  describe("zero controls", () => {
    it("returns an error when no controls are present", () => {
      const file = parsedFileFromFixture(
        path.join(fixtures, "malformed-zero-controls/policy.bouncer.md")
      );
      const errors = validateParsedFile(file);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.reason).toMatch(/zero/i);
    });

    it("returns immediately after zero controls error (no further checks)", () => {
      const file: ParsedFile = {
        path: "/virtual/empty.bouncer.md",
        frontmatter: { name: "Empty", description: "No controls" },
        controls: [],
      };
      const errors = validateParsedFile(file);
      expect(errors.length).toBe(1);
    });
  });

  describe("missing required sections", () => {
    it("returns an error for a control missing Applies To", () => {
      const file = minimalParsedFile({
        sections: new Map([
          ["Detect", "- something"],
          ["Enforce", "- block it"],
          ["Outcome", "- block"],
        ]),
      });
      const errors = validateParsedFile(file);
      expect(errors.some((e) => e.reason.includes("Applies To"))).toBe(true);
    });

    it("returns an error for a control missing Detect", () => {
      const file = minimalParsedFile({
        sections: new Map([
          ["Applies To", "- agent"],
          ["Enforce", "- block it"],
          ["Outcome", "- block"],
        ]),
      });
      const errors = validateParsedFile(file);
      expect(errors.some((e) => e.reason.includes("Detect"))).toBe(true);
    });

    it("returns an error for a control missing Enforce", () => {
      const file = minimalParsedFile({
        sections: new Map([
          ["Applies To", "- agent"],
          ["Detect", "- something"],
          ["Outcome", "- block"],
        ]),
      });
      const errors = validateParsedFile(file);
      expect(errors.some((e) => e.reason.includes("Enforce"))).toBe(true);
    });

    it("returns an error for a control missing Outcome", () => {
      const file = minimalParsedFile({
        sections: new Map([
          ["Applies To", "- agent"],
          ["Detect", "- something"],
          ["Enforce", "- block it"],
        ]),
      });
      const errors = validateParsedFile(file);
      expect(errors.some((e) => e.reason.includes("Outcome"))).toBe(true);
    });
  });

  describe("empty required sections", () => {
    it("returns an error for a control with an empty Outcome section", () => {
      const file = parsedFileFromFixture(
        path.join(fixtures, "malformed-empty-outcome/policy.bouncer.md")
      );
      const errors = validateParsedFile(file);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.reason.includes("Outcome"))).toBe(true);
    });

    it("returns an error when a required section is present but whitespace-only", () => {
      const file = minimalParsedFile({
        sections: new Map([
          ["Applies To", "- agent"],
          ["Detect", "- something"],
          ["Enforce", "- block it"],
          ["Outcome", "   "],
        ]),
      });
      const errors = validateParsedFile(file);
      expect(errors.some((e) => e.reason.includes("Outcome"))).toBe(true);
    });
  });

  describe("partial validity (Rule 10)", () => {
    it("returns errors covering all malformed controls in a partially malformed file", () => {
      // malformed-partial-validity has one valid and one malformed control
      const file = parsedFileFromFixture(
        path.join(fixtures, "malformed-partial-validity/policy.bouncer.md")
      );
      const errors = validateParsedFile(file);
      // The malformed control produces errors; the entire file is invalid
      expect(errors.length).toBeGreaterThan(0);
    });

    it("reports control name in error message for identification", () => {
      const file = minimalParsedFile({
        name: "My Named Control",
        sections: new Map([
          ["Applies To", "- agent"],
          ["Detect", "- something"],
          ["Enforce", "- block it"],
          // Outcome missing
        ]),
      });
      const errors = validateParsedFile(file);
      expect(errors.some((e) => e.reason.includes("My Named Control"))).toBe(true);
    });
  });

  describe("multiple controls", () => {
    it("validates every control independently and accumulates all errors", () => {
      const file: ParsedFile = {
        path: "/virtual/multi.bouncer.md",
        frontmatter: { name: "Multi", description: "Two bad controls" },
        controls: [
          {
            name: "Control One",
            sections: new Map([
              ["Applies To", "- agent"],
              ["Detect", "- something"],
              // missing Enforce and Outcome
            ]),
          },
          {
            name: "Control Two",
            sections: new Map([
              ["Applies To", "- agent"],
              // missing Detect, Enforce, Outcome
            ]),
          },
        ],
      };
      const errors = validateParsedFile(file);
      expect(errors.some((e) => e.reason.includes("Control One"))).toBe(true);
      expect(errors.some((e) => e.reason.includes("Control Two"))).toBe(true);
    });
  });
});
