import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import { resolve, BouncerMalformedFileError } from "../../src/index.js";

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
