# bouncer-md Resolver

Reference resolver for the [bouncer-md](https://github.com/rangepoint-ai/bouncer-md) portable guardrail specification.

The resolver is a **Policy Decision Point (PDP)**. It reads `.bouncer.md` policy files, composes them, and emits a `ResolvedPolicyIR`. Your agent runtime or enforcement layer (the PEP) builds against the IR — not against the raw policy files.

---

## Install

```bash
npm install @bouncer-md/resolver
```

---

## Usage

```typescript
import { resolve } from "@bouncer-md/resolver";

const ir = resolve("/path/to/agent-instructions.md", {
  agentName: "my-agent",
  sessionId: "session-abc123",
});

// ir.controls[0].resolved_outcome → "block" | "allow" | "redact" | ...
// ir.resolution_log → audit trail of all resolution decisions
```

---

## Public API

### `resolve(agentInstructionPath, options?)`

The only public export.

```typescript
function resolve(agentInstructionPath: string, options?: ResolveOptions): ResolvedPolicyIR
```

**`agentInstructionPath`** — absolute path to the agent's instruction file. The resolver anchors file discovery from `dirname(agentInstructionPath)` and walks up the directory tree per §10.1 of SPEC.md.

**`options`**

| Field | Type | Description |
|-------|------|-------------|
| `agentName` | `string` | The agent's declared name, used to evaluate `applies_to` fields. Required when any discovered policy file has a non-empty `applies_to` list. |
| `sessionId` | `string` | Passed through to audit records. Optional. |
| `logLevel` | `'silent' \| 'warn' \| 'error' \| 'debug'` | Controls resolver diagnostic output. Optional. |

---

## Errors

Both errors are catchable. Catch them and handle fail-closed.

### `BouncerPolicyMismatchError`

Thrown when a policy file's `applies_to` list does not include the supplied `agentName`, or when `agentName` is absent but required.

```typescript
import { BouncerPolicyMismatchError } from "@bouncer-md/resolver";

try {
  const ir = resolve(agentFile, { agentName: "my-agent" });
} catch (e) {
  if (e instanceof BouncerPolicyMismatchError) {
    // e.policyFile — path to the file that rejected this agent
    // e.agentName  — the agent name that didn't match
    // Fail closed: do not allow the session to proceed
  }
}
```

### `BouncerMalformedFileError`

Thrown when every discovered policy file is malformed or structurally invalid (fail-closed: zero accepted files is treated as a hard error, not silent fallback).

```typescript
import { BouncerMalformedFileError } from "@bouncer-md/resolver";

try {
  const ir = resolve(agentFile);
} catch (e) {
  if (e instanceof BouncerMalformedFileError) {
    // e.policyFile — path to the first rejected file
    // e.reason     — human-readable rejection reason
  }
}
```

---

## Resolved Policy IR

The IR is the resolver's contract with the PEP. All fields are stable within a major version.

```typescript
interface ResolvedPolicyIR {
  schema_version: string;           // "0.8"
  resolved_at: string;              // ISO 8601 timestamp
  policy_files: PolicyFileRecord[]; // one record per discovered file
  controls: ResolvedControl[];      // all accepted controls, composed
  resolution_log: ResolutionLogEntry[];
}
```

### `ResolvedControl`

```typescript
interface ResolvedControl {
  control_id: string;        // stable UUIDv5 — same file path + position → same UUID
  source_file: string;       // absolute path to the originating policy file
  name: string;              // control name (from ## Control: heading)
  applies_to: string[];      // declared Applies To bullet items
  detect: string[];          // declared Detect bullet items
  enforce: string[];         // declared Enforce bullet items
  outcomes: string[];        // all declared Outcome bullet items (raw, including log)
  resolved_outcome: Outcome; // session-level enforcement decision (see note below)
  priority: "immutable" | null;
  capability: null;          // reserved — capability abstraction not yet implemented
}
```

> **`resolved_outcome` is the session-level enforcement decision**, not a per-control value. It is the most restrictive outcome across all controls in the composition, applied uniformly. Every control in `ir.controls` will carry the same `resolved_outcome`. PEPs MUST NOT assume `resolved_outcome` reflects only the control it's attached to — use `outcomes[]` for the control's declared intents. This model will be revisited when capability abstraction (issue #45) is implemented.

**Outcome precedence** (most → least restrictive, per §4.4):

| Outcome | Notes |
|---------|-------|
| `block` | Highest precedence |
| `require_higher_trust` | Provisional — §4.4 defers normative ordering to a future version |
| `require_confirmation` | |
| `redact` | |
| `allow` | Lowest competitive precedence |
| `log` | Additive — fires alongside the winning outcome, never suppresses |
| `escalate` | Deferred — §4.4 provides no normative ordering in v0.5; a control declaring only `escalate` falls back to `block` |

### `ResolutionLogEntry`

```typescript
interface ResolutionLogEntry {
  event: "conflict" | "fallback" | "file_rejected" | "applies_to_mismatch" | "no_policy_found";
  detail: string;
  source_file: string | null;
  control_id: string | null;
}
```

---

## File Discovery

Per §10.1 of SPEC.md:

1. **Scoped files** — `*.bouncer.md` files in `dirname(agentInstructionPath)`, sorted case-insensitively.
2. **Global baseline** — `bouncer.md` found by walking up the directory tree from the scope root to the filesystem root. The first match wins.
3. Composition order: global baseline first, then scoped files in sorted order.

If no policy files are found, the IR is returned with an empty `controls[]` and a `no_policy_found` log entry. The resolver does **not** default to allow — the PEP is responsible for fail-closed behavior when `controls` is empty.

---

## What is implemented vs. stubbed

| Feature | Status |
|---------|--------|
| File discovery (§10.1) | Implemented |
| YAML frontmatter parsing | Implemented |
| Control block parsing | Implemented |
| Structural validation | Implemented |
| `applies_to` matching | Implemented |
| Outcome precedence resolution | Implemented |
| Duplicate control conflict detection | Implemented |
| Stable `control_id` (UUIDv5) | Implemented |
| `resolution_log` | Implemented |
| `log` additive outcome | Implemented (preserved in `outcomes[]`) |
| Capability abstraction (#45) | Not implemented — `capability: null` |
| OTel audit record emission (#46) | Not implemented — deferred pending SIG validation |
| Actor/environment context | Not implemented — deferred |

---

## Spec reference

Full specification: [SPEC.md](../SPEC.md)

Key sections for PEP authors:

| Topic | Section |
|-------|---------|
| Outcome precedence table | §4.4 |
| Control block structure | §5 |
| Resolution rules | §7.3 |
| File discovery algorithm | §10.1 |
| Conformance tests | §11.3 |
