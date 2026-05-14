import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import * as fs from "node:fs";
import * as os from "node:os";
import { resolve, BouncerMalformedFileError } from "../../src/index.js";
import { MAX_INPUT_BYTES } from "../../src/parser.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../fixtures");

// ── Test 8 ────────────────────────────────────────────────────────────────────
describe("empty required section rejection", () => {
  it("rejects entire file and throws when a required section is present but empty", () => {
    // Spec §11.3: a control block with any structurally present but empty required section
    // (e.g. ### Outcome with no entries) MUST cause the resolver to reject the entire file,
    // halt the session, and log the rejection
    const agentFile = path.join(fixtures, "malformed-empty-outcome/agent.md");

    let caughtError: unknown = null;
    let returnedIR: unknown = null;

    try {
      returnedIR = resolve(agentFile, { logLevel: "silent" });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(BouncerMalformedFileError);
    expect(returnedIR).toBeNull();

    const err = caughtError as BouncerMalformedFileError;
    expect(err.policyFile).toMatch(/policy\.bouncer\.md$/);
    expect(err.reason.length).toBeGreaterThan(0);
  });
});

// ── Test 9 ────────────────────────────────────────────────────────────────────
describe("partial validity rejection", () => {
  it("rejects entire file even when only one of multiple controls is malformed", () => {
    // Spec §11.3: a file containing one valid control and one malformed control MUST be
    // rejected entirely; the resolver MUST NOT apply the valid control from a partially malformed file
    const agentFile = path.join(fixtures, "malformed-partial-validity/agent.md");

    let caughtError: unknown = null;
    let returnedIR: unknown = null;

    try {
      returnedIR = resolve(agentFile, { logLevel: "silent" });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(BouncerMalformedFileError);
    // Critically: no IR returned — zero controls applied, not just the malformed one suppressed
    expect(returnedIR).toBeNull();
  });
});

// ── Test 10 ───────────────────────────────────────────────────────────────────
describe("invalid YAML rejection", () => {
  it("rejects file with unparseable YAML and does not proceed with default-allow state", () => {
    // Spec §11.3: an unparseable bouncer file MUST cause the resolver to reject the file,
    // halt the session, and log the rejection; it MUST NOT proceed with a default-allow state
    const agentFile = path.join(fixtures, "malformed-invalid-yaml/agent.md");

    let caughtError: unknown = null;
    let returnedIR: unknown = null;

    try {
      returnedIR = resolve(agentFile, { logLevel: "silent" });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(BouncerMalformedFileError);
    expect(returnedIR).toBeNull();
  });
});

// ── Test 11 ───────────────────────────────────────────────────────────────────
describe("zero valid controls rejection", () => {
  it("rejects file with valid frontmatter but zero control blocks", () => {
    // Spec §11.3: a file with valid frontmatter but zero valid controls MUST be rejected;
    // it MUST NOT be treated as equivalent to "no policy found"
    const agentFile = path.join(fixtures, "malformed-zero-controls/agent.md");

    let caughtError: unknown = null;

    try {
      resolve(agentFile, { logLevel: "silent" });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(BouncerMalformedFileError);
    const err = caughtError as BouncerMalformedFileError;
    // reason must clearly identify the zero-controls problem, not a parse error
    expect(err.reason.toLowerCase()).toMatch(/zero|no valid control|no control/);
  });
});

// ── Test 12 (SEV-1 fix, issue #62) ───────────────────────────────────────────
describe("input_too_large rejection", () => {
  // Generate the oversized fixture at runtime to avoid committing a 512 KB blob to the repo.
  // The file contains valid frontmatter and a valid control block followed by padding that
  // pushes it past MAX_INPUT_BYTES. The resolver MUST throw before any parsing begins.
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bouncer-input-too-large-"));
    fs.writeFileSync(
      path.join(tmpDir, "agent.md"),
      "# Agent Instructions\n\nYou are the agent under test."
    );

    const header = [
      "---",
      "name: Oversized Policy",
      "description: Policy padded to exceed MAX_INPUT_BYTES",
      "---",
      "",
      "## Control: Padding Control",
      "",
      "### Applies To",
      "",
      "- agent",
      "",
      "### Detect",
      "",
      "- test",
      "",
      "### Enforce",
      "",
      "- block",
      "",
      "### Outcome",
      "",
      "- block",
      "",
      "### Note:",
      "",
    ].join("\n");

    // Pad to one byte past the limit so the guard fires on exactly this file size
    const padding = "x".repeat(MAX_INPUT_BYTES + 1 - Buffer.byteLength(header, "utf-8"));
    fs.writeFileSync(path.join(tmpDir, "policy.bouncer.md"), header + padding);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws BouncerMalformedFileError before parsing when file exceeds MAX_INPUT_BYTES", () => {
    const agentFile = path.join(tmpDir, "agent.md");

    let caughtError: unknown = null;
    let returnedIR: unknown = null;

    try {
      returnedIR = resolve(agentFile, { logLevel: "silent" });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(BouncerMalformedFileError);
    expect(returnedIR).toBeNull();

    const err = caughtError as BouncerMalformedFileError;
    expect(err.reason).toBe("input_too_large");
  });
});
