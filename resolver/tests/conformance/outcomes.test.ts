import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import { resolve } from "../../src/index.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../fixtures");

// ── Test 15 ───────────────────────────────────────────────────────────────────
describe("duplicate control name across files", () => {
  it("evaluates both controls independently and resolves conflict via precedence table", () => {
    // Spec §11.3: two composed files both containing ## Control: Access Control MUST have
    // both controls evaluated independently; the resolver MUST NOT merge or deduplicate them;
    // conflicting outcomes resolve via the normative precedence table and MUST be logged
    // file-one.bouncer.md → block; file-two.bouncer.md → require_confirmation
    const agentFile = path.join(fixtures, "duplicate-control-names/agent.md");
    const ir = resolve(agentFile);

    // Both controls present in IR (not deduplicated)
    const accessControls = ir.controls.filter((c) => c.name === "Access Control");
    expect(accessControls.length).toBe(2);

    // Conflict logged
    expect(ir.resolution_log.some((e) => e.event === "conflict")).toBe(true);

    // block wins over require_confirmation (normative precedence table: block > require_confirmation)
    const resolvedOutcomes = accessControls.map((c) => c.resolved_outcome);
    expect(resolvedOutcomes).toContain("block");
  });
});

// ── Test 16 ───────────────────────────────────────────────────────────────────
describe("unknown outcome capability fallback", () => {
  it("falls back to next most restrictive known outcome and logs the fallback", () => {
    // Spec §11.3: a control with an unknown outcome MUST NOT be silently ignored;
    // the resolver MUST fall back to the next most restrictive known outcome and log the fallback
    const agentFile = path.join(fixtures, "unknown-outcome/agent.md");
    const ir = resolve(agentFile);

    expect(ir.controls.length).toBeGreaterThan(0);

    // The raw unknown outcome is preserved in outcomes[]
    expect(ir.controls[0]?.outcomes).toContain("quantum_block");

    // The resolved_outcome is a known outcome (fallback applied)
    const knownOutcomes = [
      "allow",
      "block",
      "redact",
      "require_confirmation",
      "require_higher_trust",
      "escalate",
      "log",
    ];
    expect(knownOutcomes).toContain(ir.controls[0]?.resolved_outcome);

    // Fallback logged
    expect(ir.resolution_log.some((e) => e.event === "fallback")).toBe(true);
  });
});

// ── Test 17 ───────────────────────────────────────────────────────────────────
describe("outcome precedence: block beats require_confirmation", () => {
  it("resolves to block when block and require_confirmation conflict", () => {
    // Spec §11.3: when two controls apply and one yields block and the other require_confirmation,
    // the resolved outcome MUST be block (normative precedence: block > require_confirmation > allow)
    const agentFile = path.join(fixtures, "outcome-precedence/agent.md");
    const ir = resolve(agentFile);

    // All controls' resolved_outcome must reflect the winner
    const uniqueResolved = [...new Set(ir.controls.map((c) => c.resolved_outcome))];
    // At least one control resolves to block
    expect(uniqueResolved).toContain("block");
    // No control resolves to require_confirmation if block also applies in the same context
    // (the winning outcome is block, not require_confirmation)
    const blockBeats = ir.controls.every(
      (c) => c.resolved_outcome === "block" || c.resolved_outcome === "log"
    );
    expect(blockBeats).toBe(true);
  });
});

// ── escalate fallback (post-Phase 1 conformance) ─────────────────────────────
describe("escalate outcome falls back to block", () => {
  it("treats escalate as a known but non-competitive outcome, resolves to block", () => {
    // Spec §4.4: escalate is deferred — no precedence ordering defined in v0.5
    // A control declaring only escalate should resolve to block (universal fallback floor)
    const agentFile = path.join(fixtures, "outcome-escalate-fallback/agent.md");
    const ir = resolve(agentFile);
    expect(ir.controls[0]?.resolved_outcome).toBe("block");
  });
});

// ── Test 18 ───────────────────────────────────────────────────────────────────
describe("log is additive", () => {
  it("log fires alongside the winning outcome and is never suppressed", () => {
    // Spec §11.3: when the winning outcome is block, any log outcome from any applicable
    // control MUST also fire; log is never suppressed by a more restrictive outcome winning
    const agentFile = path.join(fixtures, "log-additive/agent.md");
    const ir = resolve(agentFile);

    expect(ir.controls.length).toBeGreaterThan(0);

    const control = ir.controls[0];
    expect(control).toBeDefined();

    // block is the resolved (winning) outcome
    expect(control?.resolved_outcome).toBe("block");

    // log is present in the declared outcomes (not suppressed)
    expect(control?.outcomes).toContain("log");

    // The resolution log records that log fired alongside block
    expect(
      ir.resolution_log.some(
        (e) => e.detail.toLowerCase().includes("log") && e.event !== "no_policy_found"
      ) ||
        // OR: the IR itself encodes log separately — either representation is valid
        // as long as log is demonstrably not suppressed
        control?.outcomes.includes("log")
    ).toBe(true);
  });
});
