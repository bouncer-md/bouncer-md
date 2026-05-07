# bouncer-md Reference Resolver — PLAN.md

**File location:** `resolver/PLAN.md`  
**Condensed version for Claude Code:** `CLAUDE.md` at repo root — read automatically every session.

**Target:** Community open-source resolver, MIT licensed, published in the bouncer-md repo.  
**Driving constraint:** Phase 2 of an enterprise pilot begins in 3–4 weeks. The resolver must be functional — not production-hardened — by then.  
**Spec version:** v0.5 (current). v0.8 issues are filed and in backlog; the resolver must be architected to absorb those additions without structural rework. The spec will not be updated to v0.8 until the resolver is working and Phase 1 of the pilot has validated the language. Build to the v0.8 shape now — do not wait for the spec to catch up.

---

## Guiding Principles

- **Spec-first.** Every behavioral decision traces to a MUST or SHOULD in the spec. If the spec is silent, flag it — do not invent behavior.
- **Fail closed always.** Ambiguity resolves to block. An error in the resolver is never a pass.
- **Co-located, in-process.** The resolver is a library that lives with the agent source. It is imported and called directly — `resolve()` in, IR out, in-process. No sidecar, no HTTP, no daemon, no socket. A resolver that requires a network call inverts the spec's co-location principle and introduces availability and latency dependencies that bouncer is explicitly designed to avoid. If you find yourself designing an API endpoint, stop.
- **No external runtime dependencies.** The resolver runs without an external service, API call, or network access at resolution time. This is not just a performance constraint — it is a portability and security constraint. A resolver that phones home is not a portable resolver.
- **Test-first on conformance.** Section 11.3 defines 18 behavioral tests. These are written before implementation, not after.
- **Architected for v0.8.** The IR schema, PEP/PDP contract, OTel audit contract, and capability abstraction are filed issues. The resolver structure must accommodate them without breaking changes. Read the issues before writing a line of code.
- **MIT, foundational, no strings.** This resolver is the reference implementation for the bouncer-md community spec. It ships MIT. The alpha partner pilots against it, hardens it through adversarial validation, and is free to keep and use whatever they build — contributing back is their choice, not an obligation. Range Point AI builds its commercial product on top of this foundation, not instead of it. The community resolver is the floor that makes the rest credible.

---

## Pre-Phase 0 — Orientation (Day 0, before any code)

**Goal:** Every team member understands the spec, the v0.8 direction, and the pilot context before touching the codebase. This is not optional and is not done in parallel with Phase 0. It comes first.

This step exists because the resolver has a live enterprise pilot depending on it. Decisions made in the first two days of implementation will be difficult to undo. The time spent here is cheaper than a structural refactor in week two.

### Required Reading — in this order

**1. The current spec**

Read SPEC.md in full. Pay particular attention to:

- Section 2 — Design Principles. These are constraints, not suggestions.
- Section 4.4 — Outcome Precedence. The normative table is the sole authority for conflict resolution.
- Section 7.3 — Resolution Rules. All 10 rules. Rules 6, 9, and 10 have the most edge cases.
- Section 10.1 — Discovery Algorithm. The normative algorithm must be implemented exactly, not approximated.
- Section 11.3 — Conformance Tests. These 18 tests are the definition of done for Phase 1. Read them as a spec, not as a test list.

**2. The v0.8 issues — in dependency order**

Read each issue in full before moving to the next. The dependency order matters: later issues reference earlier ones.

| Issue | Title | Why it matters to the build |
|-------|-------|----------------------------|
| #42 | Formalize PEP/PDP Architecture | Defines the separation between resolver (PDP) and enforcement (PEP). The resolver must be designed as a PDP from day one — it evaluates and emits, it does not enforce. |
| #43 | Define Normative Resolved Policy IR | The IR schema is the resolver's primary output and the pilot partner's integration surface. `control_id` stability and `resolution_log` completeness are load-bearing. |
| #44 | Define Normative Enforcement Timing and Mediation Contract | Defines the five sensitive action categories and the pre-execution interception requirement. The resolver does not enforce these — but the IR must carry enough information for a conformant PEP to enforce them. |
| #45 | Introduce Capability Abstraction Layer | Not implemented in this build. The `capability` field in the IR is reserved as null specifically to accommodate this without a breaking schema change. Understand why before writing the IR struct. |
| #46 | Define OTel Audit Contract and Structured Log Schema | The audit record fields are defined here. The Phase 4 stub must emit these fields correctly. `decision_id` and `control_id` are distinct — understand the difference before implementing either. |
| #47 | Define Enforcement Maturity Model | Context only. Understand the four levels so the resolver's documented enforcement guarantees land at the right level (Level 1 — Resolver). Do not over-claim. |

**3. The pilot scope document**

The partner's pilot success criteria are:
- Deterministic enforcement with verifiable zero side effects
- Replayable correlated audit traces allowing end-to-end reconstruction
- Structured output stable enough to act as a durable interface
- PEP/resolver contract ambiguity surfaced early enough to feed back into the spec

Every architectural decision should be evaluated against these four criteria. If a decision makes any of them harder to demonstrate, it is the wrong decision.

### Orientation Checkpoint

Before Phase 0 begins, each team member should be able to answer these without looking:

- What is the difference between `control_id` and `decision_id`?
- What happens when a resolver encounters an unknown outcome?
- What is the difference between a malformed `*.bouncer.md` and a malformed `bouncer.md` in terms of resolver behavior?
- Why is partial validity rejection a security requirement and not just a validation nicety?
- What does the resolver emit when `applies_to` mismatches? What must the caller be able to do with it?
- What is the PDP's enforcement authority? (Answer: none.)

If any of these can't be answered, go back to the relevant spec section or issue before proceeding.

---

## Repository Structure

```
bouncer-md/
├── CLAUDE.md                           # Persistent Claude Code context — read every session
├── SPEC.md                             # Canonical spec (current: v0.5)
├── resolver/
│   ├── PLAN.md                         # This document — full development plan
│   ├── README.md                       # Public API documentation (pilot partner surface)
│   ├── src/
│   │   ├── types.ts            # IR type definitions (ResolvedPolicyIR, ResolvedControl, etc.)
│   │   ├── errors.ts           # Catchable error classes (BouncerPolicyMismatchError, BouncerMalformedFileError)
│   │   ├── discovery.ts        # File discovery algorithm (Section 10.1)
│   │   ├── parser.ts           # Markdown + frontmatter parsing
│   │   ├── validator.ts        # Structural validation (Section 11.2)
│   │   ├── resolver.ts         # Resolution rules (Section 7.3) + IR emission
│   │   └── index.ts            # Public API surface
│   ├── tests/
│   │   ├── conformance/        # Section 11.3 behavioral tests (18 tests + escalate fallback)
│   │   ├── unit/               # Per-module unit tests
│   │   └── fixtures/           # Bouncer files for test scenarios
│   ├── package.json
│   ├── tsconfig.json           # Covers src + tests (noEmit) — used by ESLint and typecheck
│   ├── tsconfig.build.json     # Compilation only (outDir: ./dist, rootDir: ./src)
│   └── eslint.config.js
```

**Language:** TypeScript. Rationale: the existing test harness is Node.js, the pilot team is likely running a JS/TS stack, and type safety on the IR schema matters. A Python port can follow once the spec conformance baseline is established.

---

## Phase 0 — Foundation (Days 1–2, after orientation)

**Goal:** Repo scaffolding, build tooling, and the Section 11.3 conformance tests written as failing tests before any implementation.

### Tasks

- [ ] Initialize `resolver/` directory with TypeScript project config
- [ ] Add ESLint, Prettier, Vitest (or Jest)
- [ ] Write all 18 Section 11.3 conformance tests as failing tests against the not-yet-implemented resolver API
- [ ] Write fixture bouncer files for each conformance test scenario
- [ ] CI pipeline: two jobs on push/PR to `resolver/**`:
  - `lint-and-typecheck` — blocking, must pass
  - `test` — informational only in Phase 0; runs `npm test || true` so the check stays green while test output remains visible in logs; promoted to a true pass/fail check (`npm test`) in Phase 1

### Conformance tests to write (all must fail at this stage)

These map directly to Section 11.3. Test names should match spec language exactly so failures are self-documenting.

1. `applies_to match` — applied normally when agent name matches
2. `applies_to mismatch` — rejected, not silently applied
3. `applies_to absent` — applied to all contexts
4. `applies_to scope exclusion attack` — mismatch triggers reject-or-escalate, not bypass
5. `applies_to unverified agent name` — treated as mismatch, rejected
6. `applies_to case-insensitive match` — both sides normalized before comparison
7. `applies_to mismatch exception and halt` — catchable exception thrown, session halted
8. `empty required section rejection` — entire file rejected, session halted, rejection logged
9. `partial validity rejection` — valid control not applied from partially malformed file
10. `invalid YAML rejection` — unparseable file rejected, not default-allow
11. `zero valid controls rejection` — valid frontmatter but no controls rejected
12. `missing global baseline` — scoped files still apply; no files found is logged
13. `discovery ancestor walking` — global bouncer.md found in parent directory
14. `scoped file alphabetical ordering` — deterministic, not OS-dependent
15. `duplicate control name across files` — both evaluated independently, conflicts logged
16. `unknown outcome capability fallback` — not silently ignored, fallback logged
17. `outcome precedence: block beats require_confirmation` — block wins
18. `log is additive` — log fires alongside winning outcome, never suppressed

**Exit criteria:** All 18 tests exist, all fail, CI is green on lint and type check.

---

## Phase 1 — Core Resolution (Days 3–7, after orientation)

**Goal:** All 18 conformance tests passing. This is the minimum viable resolver.

### 1.1 File Discovery (`discovery.ts`)

Implement Section 10.1 normative algorithm exactly.

- [ ] Scope root: directory containing the loading agent's instruction file
- [ ] Global baseline: walk upward from scope root, first `bouncer.md` found wins, stop on first match
- [ ] Scoped files: collect all `*.bouncer.md` from scope root directory only, no ancestor walking
- [ ] Apply scoped files in case-insensitive alphabetical order by filename
- [ ] If no global baseline found: log, apply scoped only
- [ ] If no files found: log, return empty policy set — do not throw

**Key behaviors:**
- Discovery is anchored to the agent, not the repo root
- Missing files are logged, not errors
- Discovery never silently proceeds with zero logging

### 1.2 Parser (`parser.ts`)

Parse a bouncer file into an internal representation before validation.

- [ ] Extract YAML frontmatter — use a spec-compliant YAML parser, not regex
- [ ] Extract control blocks: `## Control: <name>` as block boundaries
- [ ] Extract each required section within a control block: `### Applies To`, `### Detect`, `### Enforce`, `### Outcome`
- [ ] Strip non-structural content per Section 7.3 Rule 7: HTML comments, `### Note:` sections, any content outside the five structural elements
- [ ] Preserve unknown additional sections as opaque metadata — do not discard, do not execute
- [ ] Return a structured parse result distinguishing parse errors from empty/missing sections

**Key behaviors:**
- A parse error is not an empty result — it is a distinct failure state
- Stripping happens before validation, not after
- The parser does not validate — it structures

### 1.3 Validator (`validator.ts`)

Validate a parsed bouncer file against structural requirements.

- [ ] Required frontmatter fields present: `name`, `description`
- [ ] At least one control block present
- [ ] Each control block has all five required sections present and non-empty
- [ ] No required section heading used as an unknown additional section (spoofing detection)
- [ ] Outcomes are from the recognized closed set — unknown outcomes flagged as errors, not warnings
- [ ] Unknown subjects and conditions flagged as warnings, not errors — they are preserved
- [ ] Duplicate control names within a single file flagged as errors
- [ ] Partial validity: if any control is malformed, the entire file is invalid — not just the malformed control

**Key behaviors:**
- Errors are fail-closed — a file with any error is rejected entirely
- Warnings are non-blocking — they are logged but do not cause rejection
- Partial validity is a probe vector — never apply valid controls from a partially malformed file

### 1.4 Resolver (`resolver.ts`)

Apply resolution rules to a set of discovered, parsed, validated bouncer files.

- [ ] Apply global baseline first, then scoped files in alphabetical order
- [ ] Additive restriction: scoped files add controls, never remove or weaken
- [ ] Outcome precedence: `block > require_confirmation > allow` — normative table from Section 4.4
- [ ] `log` is non-competitive and always additive — fires alongside the winning outcome, never suppressed
- [ ] `priority: immutable` — flag in resolved output; note enforcement is Path B only
- [ ] `applies_to` validation: reject with catchable exception and halt on mismatch
- [ ] Duplicate control names across composed files: both evaluated independently, conflicts resolved by precedence table and logged
- [ ] Unknown outcome: fall back to next most restrictive known outcome, log the fallback
- [ ] `block` is the universal fallback floor — all resolvers must support it

**Key behaviors:**
- The resolver never produces a default-allow result on error
- Every conflict and fallback is logged
- Session halt on applies_to mismatch throws a catchable exception — it does not silently return

**Exit criteria:** All 18 conformance tests passing. CI fully green (both `lint-and-typecheck` and `test` jobs pass as blocking checks).

---

## Phase 2 — IR Emission (Days 8–10, after orientation)

**Goal:** Resolver emits a structured JSON output per the v0.8 IR schema (issue #43). This is the artifact the pilot partner will build against.

### 2.1 IR Schema (`types.ts` + `resolver.ts`)

Implement the normative JSON structure from issue #43.

```typescript
interface ResolvedPolicyIR {
  schema_version: string;           // "0.8"
  resolved_at: string;              // ISO8601
  policy_files: PolicyFileRecord[];
  controls: ResolvedControl[];
  resolution_log: ResolutionLogEntry[];
}

interface ResolvedControl {
  control_id: string;               // UUID, stable across repeated resolution
  source_file: string;
  name: string;
  applies_to: string[];
  detect: string[];
  enforce: string[];
  outcomes: string[];               // All declared outcomes, pre-precedence
  resolved_outcome: Outcome;        // Single outcome after precedence resolution
  priority: Priority | null;
  capability: string | null;        // Reserved null for v0.8
}

interface ResolutionLogEntry {
  event: 'conflict' | 'fallback' | 'file_rejected' | 'applies_to_mismatch' | 'no_policy_found';
  detail: string;
  source_file: string | null;
  control_id: string | null;
}
```

- [x] `control_id` MUST be a stable UUID — same file + same control position = same UUID across repeated resolution runs
- [x] `resolved_outcome` reflects post-precedence single outcome
- [x] `outcomes` preserves all declared outcomes from source before precedence
- [x] `resolution_log` includes every conflict, fallback, rejection, and missing-policy event
- [x] `capability` present as null — reserved for v0.8 capability abstraction issue #45
- [x] Emit valid IR even on partial failure — rejected files appear in resolution_log, not controls
- [x] Publish `bouncer-resolved-policy.schema.json` alongside `bouncer-frontmatter.schema.json`

### 2.2 IR Conformance Tests

Add to the conformance suite:

- [x] Valid IR emitted on well-formed input
- [x] IR with `file_rejected` log entry on malformed input — not empty IR
- [x] `resolved_outcome` reflects precedence table result when conflicts exist
- [x] `control_id` stable across repeated resolution of the same file
- [x] `resolution_log` non-empty when conflicts exist

**Exit criteria:** IR emitted correctly for all 18 original conformance scenarios. IR schema artifact published. Pilot partner can build a PEP against the output.

---

## Phase 3 — Linter (Days 11–13, after orientation)

**Goal:** Reference linter per Section 11.2. Ships alongside the resolver.

- [ ] All validation rules from Section 11.2 implemented as linter rules
- [ ] Error vs. warning distinction matches spec exactly:
  - Empty required section → **error**
  - Duplicate control name in single file → **error**
  - Unknown outcome → **error**
  - Required heading used as unknown section → **error**
  - Unknown subject → **warning**
  - Unknown condition → **warning**
  - Unknown additional section → **warning**
- [ ] Linter is runnable as a standalone CLI: `bouncer lint <file>`
- [ ] Linter output is machine-readable JSON (for CI) and human-readable (for authoring)
- [ ] VS Code integration: linter output format compatible with the existing YAML schema wiring

**Exit criteria:** Linter passes all Section 11.2 requirements. Can be run in CI against community-contributed bouncer files.

---

## Phase 4 — Audit Stub (Days 13–14, after orientation)

**Goal:** Structured log emission per the v0.8 OTel audit contract (issue #46). Stubbed for the pilot — full OTel span emission deferred until OTel GenAI SIG namespace validation is complete.

- [x] Every enforcement decision emits a structured JSON audit record to stdout/logger
- [x] Required fields per issue #46:
  - `bouncer.schema_version`
  - `bouncer.decision_id` — unique UUID per decision
  - `bouncer.control_id` — matches IR control_id
  - `bouncer.policy_file`
  - `bouncer.policy_name`
  - `bouncer.policy_version`
  - `bouncer.resolved_outcome`
  - `bouncer.subject`
  - `bouncer.detected_conditions`
  - `bouncer.enforcement_path` — `path_a` or `path_b`
  - `bouncer.decision_timestamp`
  - `bouncer.session_id` — nullable
- [x] Audit record emitted synchronously before enforcement result returned — async logging is not conformant
- [x] Single-line JSON per decision — not multi-line, not pretty-printed
- [x] OTel span emission stubbed with a TODO and the attribute namespace flagged for SIG validation before finalizing

**Exit criteria:** Every enforcement decision produces a parseable single-line JSON audit record. Pilot partner can correlate traces end-to-end.

---

## Public API Surface

The resolver exposes a minimal, stable interface. Keep it small — the pilot will build against this and changes are disruptive.

```typescript
// Primary entry point
resolve(agentInstructionPath: string, options?: ResolveOptions): ResolvedPolicyIR

// Options
interface ResolveOptions {
  agentName?: string;               // For applies_to validation
  sessionId?: string;               // Passed through to audit records
  logLevel?: 'silent' | 'warn' | 'error' | 'debug';
}

// Errors
class BouncerPolicyMismatchError extends Error {
  // Thrown on applies_to mismatch — catchable by caller
  policyFile: string;
  agentName: string;
}

class BouncerMalformedFileError extends Error {
  // Thrown on malformed file
  policyFile: string;
  reason: string;
}
```

No other public exports in v1. The IR is the interface. The PEP builds against the IR.

---

## What Is Explicitly Out of Scope for This Build

These are v0.8 spec items that the resolver architecture must accommodate but not implement yet:

- **PEP reference implementation** — the spec defines the contract (#42), the resolver emits the IR, the PEP is the pilot partner's build. We are not building a PEP.
- **Capability abstraction** (#45) — `capability` field reserved as null in the IR. No capability map processing.
- **Full OTel span emission** — stubbed pending SIG namespace validation (#46).
- **Actor/environment context model** (#4) — deferred pending clarification.
- **Multi-agent trust boundaries** — not in v0.8 scope.
- **Runtime data context input** (Issue 14) — implementation-defined, not spec-defined. Not in the resolver.
- **Python port** — follows once TypeScript baseline is conformance-verified.

---

## Pilot Readiness Checklist

Before Phase 2 of the partner pilot begins, the following must be true:

- [ ] All 18 Section 11.3 conformance tests passing
- [ ] IR emitted correctly for all conformance scenarios
- [ ] `bouncer-resolved-policy.schema.json` published to repo
- [ ] Audit record emitted for every enforcement decision
- [ ] Public API surface documented in `resolver/README.md`
- [ ] Source access shared with pilot partner
- [ ] What is implemented vs. stubbed explicitly documented — no surprises

---

## Definition of Done

The reference resolver is done when:

1. All Section 11.3 conformance tests pass
2. IR output validates against `bouncer-resolved-policy.schema.json`
3. Linter passes all Section 11.2 requirements
4. Every enforcement decision produces a parseable audit record
5. A PEP can be built against the public API using only the resolver README and the spec — no tribal knowledge required
