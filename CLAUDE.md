# bouncer-md Resolver — Claude Code Context

This file is read automatically by Claude Code at the start of every session. It defines the non-negotiable constraints, current build state, and scope boundaries for the bouncer-md reference resolver.

Full development plan is in `resolver/PLAN.md`. This file is the condensed version of what must be remembered on every session.

---

## What This Is

The **reference resolver** for the bouncer-md portable guardrail specification. Community open-source, MIT licensed, published in this repo.

This is not a product. It is the foundational implementation that the community and Range Point AI build on top of. The alpha enterprise partner is piloting against it to harden both the resolver and the spec.

---

## Constraints That Never Change

**Co-located, in-process. No exceptions.**
The resolver is a library. It is imported and called directly — `resolve()` in, IR out, in-process. No sidecar. No HTTP server. No daemon. No socket. No API endpoint. If you find yourself writing a network interface, stop and re-read Section 1 of SPEC.md.

**Fail closed always.**
Ambiguity resolves to block. An error in the resolver is never a pass. A resolver that defaults to allow on error is a security failure, not graceful degradation.

**Spec-first.**
Every behavioral decision traces to a MUST or SHOULD in SPEC.md. If the spec is silent on something, flag it as a gap — do not invent behavior. Invented behavior that contradicts a future spec update causes breaking changes.

**No external runtime dependencies.**
The resolver runs without network access, external services, or API calls at resolution time. This is a portability and security constraint, not a performance preference.

**Test-first on conformance.**
Section 11.3 of the spec defines 18 behavioral tests. These are the definition of done for Phase 1. They are written before implementation, not after.

---

## Current Build State

**Spec version:** v0.5 is current. v0.8 is the target architecture.

**Do not update the spec to v0.8 yet.** The spec update happens after the resolver is working and Phase 1 of the pilot has validated the language. Build to the v0.8 shape now — the spec catches up to the implementation, not the other way around.

**Phase 0 — COMPLETE (merged to `main`)**
- `resolver/` TypeScript project scaffolded: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `eslint.config.js`
- Stack: TypeScript 5.7, Vitest 2, ESLint 9, `js-yaml`, `uuid`
- All 18 Section 11.3 conformance tests written (test-first)
- Fixture files: one isolated directory per scenario

**Phase 1 — COMPLETE (merged to `main`)**
- Implements: `discovery.ts`, `errors.ts`, `parser.ts`, `resolver.ts`, `types.ts`, `validator.ts`, `index.ts`
- All 18 Section 11.3 conformance tests passing
- CI: both `lint-and-typecheck` and `test` jobs fully blocking and green
- Post-merge cleanup tasks completed — see Known Implementation Decisions below

**Phase 2 — IN PROGRESS (branch: `resolver/phase-2`)**
- `bouncer-resolved-policy.schema.json` published to `resolver/` directory
- IR conformance tests: 22 tests in `tests/conformance/ir.test.ts`
- Uses `ajv` v8 with `Ajv2020` (draft 2020-12) for schema validation
- `ajv-formats` installed as devDependency; format annotations documented-only (format checked manually in test)

**Phase 3 — NOT STARTED**

## Branch and PR Convention

Each phase lives on its own branch: `resolver/phase-N`. Do not begin a new phase branch until the previous phase PR is reviewed and approved. Never commit directly to `main`.

---

## Actual Source File Structure

```
resolver/src/
├── discovery.ts   # File discovery algorithm (Section 10.1)
├── errors.ts      # BouncerPolicyMismatchError, BouncerMalformedFileError
├── index.ts       # Public API surface — resolve() and exported types/errors
├── parser.ts      # Markdown + frontmatter parsing, Rule 7 stripping
├── resolver.ts    # Resolution rules (Section 7.3) + IR emission
├── types.ts       # IR schema type definitions (Section 7.5 — v0.8 target)
└── validator.ts   # Structural validation (Section 11.2)
```

There is no `ir.ts`. IR types live in `types.ts`. IR emission is integrated into `resolver.ts`. This was a deliberate Phase 1 structural choice.

---

## Known Implementation Decisions

These are deliberate design choices that deviate from or extend the spec. Do not treat these as bugs or attempt to "fix" them without reading this section first.

**`resolved_outcome` is a global winner stamped on all controls.**
The most restrictive outcome across all controls is computed and stamped uniformly on every `ResolvedControl` in the IR. Per-control declared outcomes are preserved in the `outcomes` array. This will be revisited when capability abstraction (#45) is implemented and per-capability outcomes become meaningful. PEPs building against this IR must not assume `resolved_outcome` is per-control — see comment in `resolver.ts`.

**`require_higher_trust` precedence score is provisional.**
Assigned score 70, placing it between `block` (100) and `require_confirmation` (65). Section 4.4 defers the normative ordering to a future version. This score is a design decision, not a spec-derived value. It will be revisited when v0.8 spec language is finalized. See comment in `resolver.ts`.

**`escalate` is in `KNOWN_OUTCOMES` but not in `OUTCOME_PRECEDENCE`.**
`escalate` is a recognized outcome term per Section 4.4 but its competitive precedence is explicitly deferred to a future version. It is not treated as an unknown outcome — a bouncer file declaring `escalate` will not trigger the unknown outcome fallback. A control declaring only `escalate` resolves to `block` (universal fallback floor). This is correct v0.5 behavior. See comment in `resolver.ts`.

---

## v0.8 Issues — Architectural Direction

These issues are filed and in backlog. The resolver must be architected to absorb them without structural rework. Read them before making structural decisions.

| Issue | Title | Build impact |
|-------|-------|--------------|
| #42 | PEP/PDP Architecture | Resolver is a PDP — it evaluates and emits only. It does not enforce. Design accordingly from day one. |
| #43 | Resolved Policy IR | IR types live in `types.ts`. IR emission in `resolver.ts`. `control_id` must be a stable UUID. `resolution_log` must be complete. `capability` field reserved as null. `bouncer-resolved-policy.schema.json` artifact not yet published — Phase 2 work. |
| #44 | Enforcement Timing and Mediation Contract | Resolver does not enforce timing — the PEP does. But the IR must carry enough for a conformant PEP to enforce it. |
| #45 | Capability Abstraction | Not implemented in this build. `capability: null` is the correct IR field value. Do not implement capability map processing. |
| #46 | OTel Audit Contract | Audit record fields are defined here. `decision_id` and `control_id` are distinct. Phase 4 stub must emit all required fields. OTel span emission deferred pending SIG validation. |
| #47 | Enforcement Maturity Model | Context only. This resolver lands at Level 1 (Resolver). Do not over-claim enforcement guarantees. |

---

## Public API Surface

Keep it small. The pilot partner builds against this and interface changes are disruptive.

```typescript
// Only public export
resolve(agentInstructionPath: string, options?: ResolveOptions): ResolvedPolicyIR

interface ResolveOptions {
  agentName?: string;        // For applies_to validation
  sessionId?: string;        // Passed through to audit records
  logLevel?: 'silent' | 'warn' | 'error' | 'debug';
}

// Errors — both must be catchable by the caller
class BouncerPolicyMismatchError extends Error {}  // applies_to mismatch
class BouncerMalformedFileError extends Error {}    // malformed file
```

No other public exports. The IR is the interface. The PEP builds against the IR.

---

## What Is Explicitly Out of Scope

Do not build these. Do not stub them unless noted. Do not design around them.

- **PEP reference implementation** — the partner builds the PEP against the resolver IR. We are not building a PEP.
- **Sidecar / HTTP server / API endpoint** — see co-location constraint above.
- **Capability abstraction** (#45) — `capability: null` in IR only. No map processing.
- **Full OTel span emission** — stub with TODO, flag for SIG validation (#46).
- **Actor/environment context model** — deferred, pending spec clarification.
- **Multi-agent trust boundaries** — not in scope for this build.
- **Runtime data context input** — implementation-defined by the partner, not spec-defined. Not in the resolver.
- **Python port** — follows after TypeScript conformance baseline is verified.
- **Docker image / container packaging** — follows after Phase 1 pilot alignment confirms the interface is stable.

---

## Pilot Readiness Checklist

The partner's Phase 2 starts when all of these are true. Do not share source until the checklist is complete.

- [x] All 18 Section 11.3 conformance tests passing
- [x] IR emitted correctly for all conformance scenarios
- [x] `bouncer-resolved-policy.schema.json` published to `resolver/` directory
- [x] Public API surface documented in `resolver/README.md`
- [x] What is implemented vs. stubbed explicitly documented — no surprises for the partner
- [ ] Audit record emitted for every enforcement decision — **Phase 4**

---

## Definition of Done

1. All 18 Section 11.3 conformance tests pass
2. IR output validates against `bouncer-resolved-policy.schema.json`
3. Linter passes all Section 11.2 requirements
4. Every enforcement decision produces a parseable single-line JSON audit record
5. A PEP can be built against the public API using only `resolver/README.md` and SPEC.md — no tribal knowledge required

---

## Key Spec Sections by Topic

Quick reference — use these before inventing behavior.

| Topic | Spec section |
|-------|-------------|
| Design principles and co-location | Section 2 |
| Subjects, trust levels, conditions, outcomes | Sections 4.1–4.4 |
| Outcome precedence table | Section 4.4 |
| Control block structure | Section 5 |
| Resolution rules (all 10) | Section 7.3 |
| Enforcement layers | Section 8 |
| File discovery algorithm | Section 10.1 |
| Linter requirements | Section 11.2 |
| Conformance tests (18) | Section 11.3 |
