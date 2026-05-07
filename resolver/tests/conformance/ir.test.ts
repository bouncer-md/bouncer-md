import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import * as fs from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { resolve } from "../../src/index.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../fixtures");
const schemaPath = path.resolve(__dirname, "../../bouncer-resolved-policy.schema.json");

// strict: false — allows format annotations (date-time, etc.) as documentation-only
// logger: false — suppresses "unknown format ignored" noise; format is tested explicitly below
const ajv = new Ajv2020({ strict: false, logger: false });
const irSchema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as object;
const validate = ajv.compile(irSchema);

function assertValidIR(ir: unknown): void {
  const valid = validate(ir);
  if (!valid) {
    throw new Error(
      `IR failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}`
    );
  }
}

// ── IR schema: well-formed input ──────────────────────────────────────────────

describe("IR schema: valid IR emitted on well-formed input", () => {
  it("output validates against bouncer-resolved-policy.schema.json", () => {
    const agentFile = path.join(fixtures, "applies-to-match/agent.md");
    const ir = resolve(agentFile, { agentName: "agent-a" });
    assertValidIR(ir);
  });

  it("schema_version is '0.8'", () => {
    const agentFile = path.join(fixtures, "applies-to-match/agent.md");
    const ir = resolve(agentFile, { agentName: "agent-a" });
    expect(ir.schema_version).toBe("0.8");
  });

  it("resolved_at is an ISO 8601 date-time string", () => {
    const agentFile = path.join(fixtures, "applies-to-match/agent.md");
    const ir = resolve(agentFile, { agentName: "agent-a" });
    expect(() => new Date(ir.resolved_at)).not.toThrow();
    expect(new Date(ir.resolved_at).toISOString()).toBe(ir.resolved_at);
  });

  it("capability is null on every control", () => {
    const agentFile = path.join(fixtures, "applies-to-match/agent.md");
    const ir = resolve(agentFile, { agentName: "agent-a" });
    for (const c of ir.controls) {
      expect(c.capability).toBeNull();
    }
  });

  it("policy_files contains one accepted record", () => {
    const agentFile = path.join(fixtures, "applies-to-match/agent.md");
    const ir = resolve(agentFile, { agentName: "agent-a" });
    expect(ir.policy_files.length).toBe(1);
    expect(ir.policy_files[0]?.accepted).toBe(true);
    expect(ir.policy_files[0]?.rejection_reason).toBeNull();
  });
});

// ── IR schema: file_rejected on malformed input ───────────────────────────────

describe("IR schema: file_rejected log entry on malformed input", () => {
  it("rejected file appears in resolution_log — not empty IR", () => {
    // good.bouncer.md is valid; bad.bouncer.md has empty Outcome — resolver must
    // accept the good file, reject the bad one, log the rejection, and return valid IR
    const agentFile = path.join(fixtures, "ir-partial-rejection/agent.md");
    const ir = resolve(agentFile);

    // IR is still populated (not empty) — good file accepted
    expect(ir.controls.length).toBeGreaterThan(0);

    // Rejection logged
    expect(ir.resolution_log.some((e) => e.event === "file_rejected")).toBe(true);

    // policy_files reflects accept/reject split
    const accepted = ir.policy_files.filter((f) => f.accepted);
    const rejected = ir.policy_files.filter((f) => !f.accepted);
    expect(accepted.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0]?.rejection_reason).toBeTruthy();
  });

  it("IR from partial rejection validates against the schema", () => {
    const agentFile = path.join(fixtures, "ir-partial-rejection/agent.md");
    const ir = resolve(agentFile);
    assertValidIR(ir);
  });
});

// ── IR schema: resolved_outcome reflects precedence table ─────────────────────

describe("IR schema: resolved_outcome reflects precedence table", () => {
  it("resolves to block when conflict exists — and IR validates against schema", () => {
    // outcome-precedence fixture: block.bouncer.md + confirm.bouncer.md → block wins
    const agentFile = path.join(fixtures, "outcome-precedence/agent.md");
    const ir = resolve(agentFile);

    assertValidIR(ir);
    expect(ir.controls.length).toBeGreaterThan(0);
    expect(ir.controls.every((c) => c.resolved_outcome === "block")).toBe(true);
  });

  it("resolution_log is non-empty when duplicate control name conflict exists", () => {
    // duplicate-control-names fixture: same name, different outcomes
    const agentFile = path.join(fixtures, "duplicate-control-names/agent.md");
    const ir = resolve(agentFile);

    assertValidIR(ir);
    expect(ir.resolution_log.length).toBeGreaterThan(0);
    expect(ir.resolution_log.some((e) => e.event === "conflict")).toBe(true);
  });
});

// ── IR schema: control_id stability ──────────────────────────────────────────

describe("IR schema: control_id stable across repeated resolution", () => {
  it("resolving the same file twice produces identical control_ids", () => {
    const agentFile = path.join(fixtures, "applies-to-match/agent.md");

    const ir1 = resolve(agentFile, { agentName: "agent-a" });
    const ir2 = resolve(agentFile, { agentName: "agent-a" });

    expect(ir1.controls.length).toBeGreaterThan(0);
    expect(ir1.controls.length).toBe(ir2.controls.length);

    for (let i = 0; i < ir1.controls.length; i++) {
      expect(ir1.controls[i]?.control_id).toBe(ir2.controls[i]?.control_id);
    }
  });

  it("control_id matches the UUIDv5 pattern", () => {
    const agentFile = path.join(fixtures, "applies-to-match/agent.md");
    const ir = resolve(agentFile, { agentName: "agent-a" });
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    for (const c of ir.controls) {
      expect(c.control_id).toMatch(uuidPattern);
    }
  });
});

// ── IR schema: full composition validates ─────────────────────────────────────

describe("IR schema: all conformance scenarios produce schema-valid IR", () => {
  const scenarios: Array<{ fixture: string; options?: Parameters<typeof resolve>[1] }> = [
    { fixture: "applies-to-absent" },
    { fixture: "applies-to-match", options: { agentName: "agent-a" } },
    { fixture: "applies-to-case-insensitive", options: { agentName: "AGENT-A" } },
    { fixture: "discovery-ancestor/child" },
    { fixture: "discovery-scoped-ordering" },
    { fixture: "duplicate-control-names" },
    { fixture: "missing-global-baseline" },
    { fixture: "outcome-precedence" },
    { fixture: "outcome-escalate-fallback", options: { agentName: "agent" } },
    { fixture: "unknown-outcome" },
    { fixture: "log-additive" },
  ];

  for (const { fixture, options } of scenarios) {
    it(`validates for fixture: ${fixture}`, () => {
      const agentFile = path.join(fixtures, `${fixture}/agent.md`);
      const ir = resolve(agentFile, options);
      assertValidIR(ir);
    });
  }
});
