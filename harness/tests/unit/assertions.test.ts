import { describe, it, expect } from "vitest";
import type { ResolvedPolicyIR, ResolvedControl, AuditRecord } from "@bouncer-md/resolver";
import type { ToolInvocation } from "../../scenario/types.js";
import {
  assertIrValid,
  assertAuditRecords,
  assertReplayComplete,
  assertAdversarialBlock,
  AssertionError,
} from "../../assertions/index.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const CONTROL_ID = "550e8400-e29b-51d4-a716-446655440001";
const DECISION_ID = "d1e2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const NOW = new Date().toISOString();

const VALID_CONTROL: ResolvedControl = {
  control_id: CONTROL_ID,
  source_file: "/project/policy.bouncer.md",
  name: "Test Control",
  applies_to: ["tool_request"],
  detect: ["prompt_injection"],
  enforce: ["Block all tool requests"],
  outcomes: ["block"],
  resolved_outcome: "block",
  priority: null,
  capability: null,
};

const validIr: ResolvedPolicyIR = {
  schema_version: "0.8",
  resolved_at: NOW,
  policy_files: [
    {
      path: "/project/policy.bouncer.md",
      accepted: true,
      rejection_reason: null,
      policy_name: "Test Policy",
      policy_version: "1.0",
    },
  ],
  controls: [VALID_CONTROL],
  resolution_log: [],
};

const validAuditRecord: AuditRecord = {
  "bouncer.schema_version": "0.8",
  "bouncer.decision_id": DECISION_ID,
  "bouncer.control_id": CONTROL_ID,
  "bouncer.policy_file": "/project/policy.bouncer.md",
  "bouncer.policy_name": "Test Policy",
  "bouncer.policy_version": "1.0",
  "bouncer.resolved_outcome": "block",
  "bouncer.subject": "test-agent",
  "bouncer.detected_conditions": [],
  "bouncer.enforcement_path": "path_a",
  "bouncer.decision_timestamp": NOW,
  "bouncer.session_id": null,
};

// ── assertIrValid ─────────────────────────────────────────────────────────────

describe("assertIrValid()", () => {
  it("passes for a well-formed IR object", () => {
    expect(() => { assertIrValid(validIr); }).not.toThrow();
  });

  it("fails with AssertionError for IR missing schema_version", () => {
    const bad = { ...validIr };
    const { schema_version: _sv, ...withoutVersion } = bad;
    expect(() => { assertIrValid(withoutVersion); }).toThrow(AssertionError);
  });

  it("fails with AssertionError for IR with unknown resolved_outcome", () => {
    const bad: ResolvedPolicyIR = {
      ...validIr,
      controls: [
        {
          ...VALID_CONTROL,
          resolved_outcome: "quantum_block" as never,
        },
      ],
    };
    expect(() => { assertIrValid(bad); }).toThrow(AssertionError);
  });

  it("fails with AssertionError for IR with non-null capability field", () => {
    const bad = {
      ...validIr,
      controls: [
        {
          ...VALID_CONTROL,
          capability: "some-capability",
        },
      ],
    };
    expect(() => { assertIrValid(bad); }).toThrow(AssertionError);
  });

  it("fails with AssertionError for an object that does not validate against the schema", () => {
    const bad = { schema_version: "0.8", resolved_at: "not-a-date", controls: "wrong-type" };
    expect(() => { assertIrValid(bad); }).toThrow(AssertionError);
  });
});

// ── assertAuditRecords ────────────────────────────────────────────────────────

describe("assertAuditRecords()", () => {
  it("passes when all 12 bouncer.* fields are present and valid", () => {
    expect(() => { assertAuditRecords([validAuditRecord], validIr); }).not.toThrow();
  });

  it("fails when the records array is empty", () => {
    expect(() => { assertAuditRecords([], validIr); }).toThrow(AssertionError);
  });

  it("fails when a required field is missing", () => {
    const bad = { ...validAuditRecord };
    // @ts-expect-error — intentionally removing a required field for test
    delete bad["bouncer.policy_name"];
    expect(() => { assertAuditRecords([bad], validIr); }).toThrow(AssertionError);
  });

  it("fails when records from one call have different decision_ids", () => {
    const record2: AuditRecord = {
      ...validAuditRecord,
      "bouncer.decision_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    };
    expect(() => { assertAuditRecords([validAuditRecord, record2], validIr); }).toThrow(AssertionError);
  });

  it("fails when control_id does not match any IR control", () => {
    const bad: AuditRecord = {
      ...validAuditRecord,
      "bouncer.control_id": "00000000-0000-0000-0000-000000000000",
    };
    expect(() => { assertAuditRecords([bad], validIr); }).toThrow(AssertionError);
  });

  it("fails when decision_timestamp is not valid ISO 8601", () => {
    const bad: AuditRecord = {
      ...validAuditRecord,
      "bouncer.decision_timestamp": "not-a-date",
    };
    expect(() => { assertAuditRecords([bad], validIr); }).toThrow(AssertionError);
  });
});

// ── assertReplayComplete ──────────────────────────────────────────────────────

describe("assertReplayComplete()", () => {
  it("passes for a record with all five replay fields populated", () => {
    expect(() => { assertReplayComplete(validAuditRecord, validIr); }).not.toThrow();
  });

  it("fails when bouncer.policy_file is null", () => {
    const bad: AuditRecord = { ...validAuditRecord, "bouncer.policy_file": null };
    expect(() => { assertReplayComplete(bad, validIr); }).toThrow(AssertionError);
  });

  it("fails when bouncer.control_id does not resolve to any IR control", () => {
    const bad: AuditRecord = {
      ...validAuditRecord,
      "bouncer.control_id": "00000000-0000-0000-0000-000000000000",
    };
    expect(() => { assertReplayComplete(bad, validIr); }).toThrow(AssertionError);
  });
});

// ── assertAdversarialBlock ────────────────────────────────────────────────────

describe("assertAdversarialBlock()", () => {
  const noInvocations: ToolInvocation[] = [];
  const writeFileInvocation: ToolInvocation = {
    tool: "write_file",
    args: { path: "/etc/passwd", content: "evil" },
    timestamp: NOW,
  };

  it("passes when resolved_outcome is block and targeted tool has zero invocations", () => {
    expect(() => {
      assertAdversarialBlock(validIr, [validAuditRecord], "write_file", noInvocations);
    }).not.toThrow();
  });

  it("fails when resolved_outcome is allow (not block)", () => {
    const allowIr: ResolvedPolicyIR = {
      ...validIr,
      controls: [{ ...VALID_CONTROL, resolved_outcome: "allow" }],
    };
    const allowRecord: AuditRecord = {
      ...validAuditRecord,
      "bouncer.resolved_outcome": "allow",
    };
    expect(() => {
      assertAdversarialBlock(allowIr, [allowRecord], "write_file", noInvocations);
    }).toThrow(AssertionError);
  });

  it("fails when the targeted tool has one or more invocations", () => {
    expect(() => {
      assertAdversarialBlock(validIr, [validAuditRecord], "write_file", [writeFileInvocation]);
    }).toThrow(AssertionError);
  });

  it("fails when no audit record with block outcome is present", () => {
    const allowRecord: AuditRecord = {
      ...validAuditRecord,
      "bouncer.resolved_outcome": "allow",
    };
    expect(() => {
      assertAdversarialBlock(validIr, [allowRecord], "write_file", noInvocations);
    }).toThrow(AssertionError);
  });
});
