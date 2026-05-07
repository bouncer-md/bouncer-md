import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import * as fs from "node:fs";
import * as os from "node:os";
import { parseBouncerFile, parseListItems } from "../../src/parser.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../fixtures");

// Helper: write a temp file, run the parser, clean up
function withTempFile(content: string, fn: (filePath: string) => void): void {
  const tmp = path.join(os.tmpdir(), `bouncer-test-${String(Date.now())}.md`);
  fs.writeFileSync(tmp, content, "utf-8");
  try {
    fn(tmp);
  } finally {
    fs.unlinkSync(tmp);
  }
}

// ── parseBouncerFile ──────────────────────────────────────────────────────────

describe("parseBouncerFile", () => {
  describe("well-formed input", () => {
    it("parses frontmatter fields: name, description, applies_to", () => {
      const result = parseBouncerFile(
        path.join(fixtures, "applies-to-match/policy.bouncer.md")
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.file.frontmatter.name).toBe("Agent A Policy");
      expect(result.file.frontmatter.description).toBe("Policy scoped to agent-a only");
      expect(result.file.frontmatter.applies_to).toEqual(["agent-a"]);
    });

    it("omits applies_to when not present in frontmatter", () => {
      const result = parseBouncerFile(
        path.join(fixtures, "applies-to-absent/policy.bouncer.md")
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.file.frontmatter.applies_to).toBeUndefined();
    });

    it("extracts all required sections from a control block", () => {
      const result = parseBouncerFile(
        path.join(fixtures, "applies-to-match/policy.bouncer.md")
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const control = result.file.controls[0];
      expect(control).toBeDefined();
      expect(control?.name).toBe("Access Control");
      expect(control?.sections.has("Applies To")).toBe(true);
      expect(control?.sections.has("Detect")).toBe(true);
      expect(control?.sections.has("Enforce")).toBe(true);
      expect(control?.sections.has("Outcome")).toBe(true);
    });

    it("extracts multiple controls from a single file", () => {
      withTempFile(
        `---
name: Multi Control Policy
description: Two controls in one file
---

## Control: First Control

### Applies To
- agent

### Detect
- detect one

### Enforce
- enforce one

### Outcome
- block

## Control: Second Control

### Applies To
- agent

### Detect
- detect two

### Enforce
- enforce two

### Outcome
- allow
`,
        (filePath) => {
          const result = parseBouncerFile(filePath);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.file.controls.length).toBe(2);
          expect(result.file.controls[0]?.name).toBe("First Control");
          expect(result.file.controls[1]?.name).toBe("Second Control");
        }
      );
    });

    it("strips ### Note: sections (Rule 7)", () => {
      withTempFile(
        `---
name: Test
description: Testing note stripping
---

## Control: Test Control

### Applies To
- agent

### Note: Implementation Detail
This should be stripped and not appear in sections.

### Detect
- something

### Enforce
- block it

### Outcome
- block
`,
        (filePath) => {
          const result = parseBouncerFile(filePath);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const control = result.file.controls[0];
          expect(control?.sections.has("Note: Implementation Detail")).toBe(false);
          expect(control?.sections.has("Detect")).toBe(true);
        }
      );
    });

    it("strips HTML comments (Rule 7)", () => {
      withTempFile(
        `---
name: Test
description: Testing HTML comment stripping
---

## Control: Test Control

<!-- This is a comment that should be ignored -->

### Applies To
- agent

### Detect
- something

### Enforce
- block it

### Outcome
- block
`,
        (filePath) => {
          const result = parseBouncerFile(filePath);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const control = result.file.controls[0];
          expect(control?.sections.get("Applies To")).not.toContain("<!--");
        }
      );
    });

    it("strips multi-line HTML comments (Rule 7)", () => {
      withTempFile(
        `---
name: Test
description: Multi-line comment test
---

## Control: Test Control

<!--
This spans
multiple lines
-->

### Applies To
- agent

### Detect
- something

### Enforce
- block it

### Outcome
- block
`,
        (filePath) => {
          const result = parseBouncerFile(filePath);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const control = result.file.controls[0];
          expect(control?.sections.get("Applies To")).not.toContain("This spans");
        }
      );
    });

    it("preserves section content trimmed of leading/trailing whitespace", () => {
      const result = parseBouncerFile(
        path.join(fixtures, "applies-to-match/policy.bouncer.md")
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const detectContent = result.file.controls[0]?.sections.get("Detect") ?? "";
      expect(detectContent).not.toMatch(/^\s+/);
      expect(detectContent).not.toMatch(/\s+$/);
    });
  });

  describe("malformed input", () => {
    it("returns ok:false for missing frontmatter", () => {
      withTempFile("# No frontmatter here\n\nJust markdown.", (filePath) => {
        const result = parseBouncerFile(filePath);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/frontmatter/i);
      });
    });

    it("returns ok:false for unclosed frontmatter", () => {
      withTempFile("---\nname: Test\ndescription: No closing\n\n## Body", (filePath) => {
        const result = parseBouncerFile(filePath);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/unclosed/i);
      });
    });

    it("returns ok:false for invalid YAML frontmatter", () => {
      const result = parseBouncerFile(
        path.join(fixtures, "malformed-invalid-yaml/policy.bouncer.md")
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(/yaml/i);
    });

    it("returns ok:false when name field is missing", () => {
      withTempFile(
        `---
description: No name here
---

## Control: Test
`,
        (filePath) => {
          const result = parseBouncerFile(filePath);
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.reason).toMatch(/name/i);
        }
      );
    });

    it("returns ok:false when description field is missing", () => {
      withTempFile(
        `---
name: Test Policy
---

## Control: Test
`,
        (filePath) => {
          const result = parseBouncerFile(filePath);
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.reason).toMatch(/description/i);
        }
      );
    });

    it("returns ok:false for non-existent file", () => {
      const result = parseBouncerFile("/nonexistent/path/file.bouncer.md");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(/cannot read/i);
    });

    it("parses zero controls successfully (validation catches this later)", () => {
      // Parser does not validate; zero controls is not a parse error
      const result = parseBouncerFile(
        path.join(fixtures, "malformed-zero-controls/policy.bouncer.md")
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.file.controls.length).toBe(0);
    });
  });
});

// ── parseListItems ────────────────────────────────────────────────────────────

describe("parseListItems", () => {
  it("extracts - prefixed items", () => {
    expect(parseListItems("- alpha\n- beta\n- gamma")).toEqual(["alpha", "beta", "gamma"]);
  });

  it("extracts * prefixed items", () => {
    expect(parseListItems("* one\n* two")).toEqual(["one", "two"]);
  });

  it("extracts + prefixed items", () => {
    expect(parseListItems("+ first\n+ second")).toEqual(["first", "second"]);
  });

  it("handles mixed bullet styles", () => {
    expect(parseListItems("- alpha\n* beta\n+ gamma")).toEqual(["alpha", "beta", "gamma"]);
  });

  it("trims leading/trailing whitespace from items", () => {
    expect(parseListItems("-   padded item   ")).toEqual(["padded item"]);
  });

  it("ignores non-list lines", () => {
    expect(parseListItems("Some prose\n- list item\nMore prose")).toEqual(["list item"]);
  });

  it("returns empty array for empty string", () => {
    expect(parseListItems("")).toEqual([]);
  });

  it("returns empty array when no bullets present", () => {
    expect(parseListItems("Just plain text\nNo bullets here")).toEqual([]);
  });

  it("filters out empty items after trimming", () => {
    expect(parseListItems("- \n- valid")).toEqual(["valid"]);
  });
});
