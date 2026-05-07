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

**Build phase:** See `resolver/PLAN.md` for the full phase breakdown. Check the pilot readiness checklist before sharing source with the partner.

**Phase 0 — COMPLETE (branch: `resolver/phase-0`)**
- `resolver/` TypeScript project scaffolded: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `eslint.config.js`
- Stack: TypeScript 5.7, Vitest 2, ESLint 9, `js-yaml`, `uuid`
- All 18 Section 11.3 conformance tests written and failing (as required by test-first rule)
- Fixture files: one isolated directory per scenario, co-located with agent instruction files so discovery behaves correctly
- CI workflow: `.github/workflows/resolver-ci.yml` — lint → typecheck → test on push/PR to `resolver/**`
- PR under review — do not merge until Phase 1 is validated

**Phase 1 — NOT STARTED**
Begins only after Phase 0 PR is reviewed and merged.

## Branch and PR Convention

Each phase lives on its own branch: `resolver/phase-N`. Do not begin a new phase branch until the previous phase PR is reviewed and approved. Never commit directly to `main`.

---

## v0.8 Issues — Architectural Direction

These issues are filed and in backlog. The resolver must be architected to absorb them without structural rework. Read them before making structural decisions.

| Issue | Title | Build impact |
|-------|-------|--------------|
| #42 | PEP/PDP Architecture | Resolver is a PDP — it evaluates and emits only. It does not enforce. Design accordingly from day one. |
| #43 | Resolved Policy IR | IR is the resolver's primary output. `control_id` must be a stable UUID. `resolution_log` must be complete. `capability` field reserved as null. |
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

- [ ] All 18 Section 11.3 conformance tests passing
- [ ] IR emitted correctly for all conformance scenarios
- [ ] `bouncer-resolved-policy.schema.json` published to repo
- [ ] Audit record emitted for every enforcement decision
- [ ] Public API surface documented in `resolver/README.md`
- [ ] What is implemented vs. stubbed explicitly documented — no surprises for the partner

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
