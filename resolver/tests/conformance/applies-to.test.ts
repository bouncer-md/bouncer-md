import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import { resolve, BouncerPolicyMismatchError } from "../../src/index.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../fixtures");

// ── Test 1 ────────────────────────────────────────────────────────────────────
describe("applies_to match", () => {
  it("applies policy normally when agent name matches applies_to", () => {
    // Spec §11.3: policy with applies_to: [agent-a] loaded by agent-a is applied normally
    const agentFile = path.join(fixtures, "applies-to-match/agent.md");
    const ir = resolve(agentFile, { agentName: "agent-a" });
    expect(ir.controls.length).toBeGreaterThan(0);
    expect(ir.resolution_log.some((e) => e.event === "applies_to_mismatch")).toBe(false);
  });
});

// ── Test 2 ────────────────────────────────────────────────────────────────────
describe("applies_to mismatch", () => {
  it("rejects policy when agent name does not match applies_to", () => {
    // Spec §11.3: policy with applies_to: [agent-a] loaded by agent-b MUST NOT be silently applied
    const agentFile = path.join(fixtures, "applies-to-mismatch/agent.md");
    expect(() => resolve(agentFile, { agentName: "agent-b" })).toThrow(
      BouncerPolicyMismatchError
    );
  });
});

// ── Test 3 ────────────────────────────────────────────────────────────────────
describe("applies_to absent", () => {
  it("applies policy to all loading contexts when applies_to is not present", () => {
    // Spec §11.3: policy with no applies_to is applied to all loading contexts
    const agentFile = path.join(fixtures, "applies-to-absent/agent.md");
    const ir = resolve(agentFile, { agentName: "any-agent-at-all" });
    expect(ir.controls.length).toBeGreaterThan(0);
    expect(ir.resolution_log.some((e) => e.event === "applies_to_mismatch")).toBe(false);
  });
});

// ── Test 4 ────────────────────────────────────────────────────────────────────
describe("applies_to scope exclusion attack", () => {
  it("scope mismatch triggers reject-or-escalate, never silent bypass", () => {
    // Spec §11.3: applies_to mismatch MUST NOT cause the resolver to skip the policy
    // silently — it must throw, not return an IR that omits the policy controls
    const agentFile = path.join(fixtures, "applies-to-mismatch/agent.md");
    let threw = false;
    let returnedIR: unknown = null;

    try {
      returnedIR = resolve(agentFile, { agentName: "agent-b" });
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(BouncerPolicyMismatchError);
    }

    expect(threw).toBe(true);
    expect(returnedIR).toBeNull();
  });
});

// ── Test 5 ────────────────────────────────────────────────────────────────────
describe("applies_to unverified agent name", () => {
  it("treats missing agentName as unverifiable — rejects policy with applies_to", () => {
    // Spec §11.3: applies_to: [agent-a] where agent-a cannot be verified MUST be treated
    // as a mismatch and rejected; unverified names MUST NOT be silently applied
    const agentFile = path.join(fixtures, "applies-to-unverified/agent.md");
    // No agentName supplied — resolver cannot verify, must reject
    expect(() => resolve(agentFile)).toThrow(BouncerPolicyMismatchError);
  });
});

// ── Test 6 ────────────────────────────────────────────────────────────────────
describe("applies_to case-insensitive match", () => {
  it("matches applies_to: [Agent-A] against agentName: agent-a after normalization", () => {
    // Spec §11.3: both sides MUST be normalized before comparison;
    // applies_to: [Agent-A] loaded by context where agentName is "agent-a" MUST match
    const agentFile = path.join(fixtures, "applies-to-case-insensitive/agent.md");
    const ir = resolve(agentFile, { agentName: "agent-a" });
    expect(ir.controls.length).toBeGreaterThan(0);
    expect(ir.resolution_log.some((e) => e.event === "applies_to_mismatch")).toBe(false);
  });
});

// ── Test 7 ────────────────────────────────────────────────────────────────────
describe("applies_to mismatch exception and halt", () => {
  it("throws BouncerPolicyMismatchError with correct properties, does not return IR", () => {
    // Spec §11.3: resolver MUST throw a catchable exception and halt the session;
    // it MUST NOT proceed with a default-allow state; caller MUST be able to catch it
    const agentFile = path.join(fixtures, "applies-to-mismatch/agent.md");
    let caughtError: unknown = null;
    let returnedIR: unknown = null;

    try {
      returnedIR = resolve(agentFile, { agentName: "agent-b" });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(BouncerPolicyMismatchError);
    expect(returnedIR).toBeNull();

    const err = caughtError as BouncerPolicyMismatchError;
    expect(err.agentName).toBe("agent-b");
    expect(typeof err.policyFile).toBe("string");
    expect(err.policyFile.length).toBeGreaterThan(0);
    expect(err.message).toBeTruthy();
  });
});
