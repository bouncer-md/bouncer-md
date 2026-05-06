# Security Policy

## Overview

bouncer-md is a specification and policy format. This document describes known threat vectors introduced or influenced by the spec, recommended mitigations, and how to report security issues.

Understanding the security properties of bouncer-md requires understanding what it is and what it is not. bouncer-md defines a policy format. It does not execute code. Security guarantees depend entirely on how and where the policy is enforced.

---

## Threat Vectors

### 1. Spec Vocabulary Exposure

**Risk:** Because bouncer-md is an open specification, an attacker who knows you are using it knows the control vocabulary — subjects, conditions, and outcomes. They can craft inputs designed to appear compliant while bypassing controls.

**Affected path:** Path A and Path B.

**Mitigation:**
- Security through obscurity is not a viable alternative. The resolver is the correct mitigation.
- Path B deterministic enforcement removes LLM interpretation from the enforcement loop. An attacker knowing the vocabulary does not help them bypass a programmatic resolver.
- Add domain-specific adversarial test cases beyond the public test suite. The public suite in `tests/adversarial/` establishes a baseline — it should not be your entire coverage.

---

### 2. Preamble Override via Prompt Injection

**Risk:** In Path A, the semantic preamble instructs the LLM how to interpret and act on controls. A prompt injection attack that fires before the LLM processes the bouncer file can redefine what `block` or `redact` means, or instruct the LLM to ignore the preamble entirely.

**Affected path:** Path A only.

**Mitigation:**
- This is a documented and accepted limitation of Path A. Controls are instructions, not guarantees.
- Include the preamble in both the bouncer file and the agent instruction file (Option 3 in Section 5.2.1 of the spec) for defense in depth.
- For compliance-sensitive or production deployments, use Path B.
- The `prompt_injection` and `instruction_override` detect conditions in your bouncer file are themselves subject to this risk in Path A. Path B resolves this by moving enforcement outside the LLM.

---

### 3. Weak Baseline Policy at Authoring Time

**Risk:** The additive restriction model prevents runtime weakening of controls but does not prevent a malicious or negligent author from writing a weak `bouncer.md` at the repo root. Scoped `*.bouncer.md` files can only add controls — they cannot fix a bad baseline.

**Affected path:** Path A and Path B.

**Mitigation:**
- Treat `bouncer.md` as a security artifact. It belongs in version control and should be subject to code review the same way security configurations are reviewed.
- Use the test suite to validate baseline controls before merging changes to `bouncer.md`.
- For regulated environments, require sign-off on baseline policy changes from a security or compliance owner.

---

### 4. Resolver as a High-Value Target

**Risk:** In Path B, the resolver sits between inputs and the LLM. A compromised, malicious, or incorrectly implemented resolver can silently pass everything, suppress logging, or selectively enforce controls. The spec provides no resolver integrity verification mechanism.

**Affected path:** Path B only.

**Mitigation:**
- Treat the resolver as security-critical middleware. Apply the same review and testing standards you would to an authentication library.
- Emit resolver decisions to your observability pipeline. Every control evaluation — pass or block — should produce a telemetry event. Absence of events is itself a signal.
- Periodically validate resolver behavior against the test suite in production, not just at build time.
- The reference resolver, when available, should be considered the conformance baseline. Custom resolvers should be validated against it.

---

### 5. Untrusted Bouncer File Discovery

**Risk:** If a resolver discovers and applies bouncer files from untrusted or user-controlled directories — for example, a RAG pipeline that retrieves content from user-uploaded storage — an attacker could plant a `*.bouncer.md` file that introduces permissive controls or redefines subjects.

**Affected path:** Path B only.

**Mitigation:**
- Resolver file discovery scope **MUST** be explicitly configured to trusted, version-controlled paths only.
- Never load bouncer files from locations that can be written to by untrusted parties.
- Validate the integrity of bouncer files at load time — hash verification against a known-good manifest is recommended for production deployments.

---

### 6. Public Test Suite as an Attack Roadmap

**Risk:** The adversarial inputs in `tests/adversarial/` are public. An attacker can read them and craft inputs specifically designed to fall between the published test cases — similar enough in structure to appear safe but different enough to bypass controls.

**Affected path:** Path A and Path B.

**Mitigation:**
- The public test suite establishes a baseline floor, not a ceiling.
- Teams **SHOULD** maintain a private adversarial test suite covering the specific threat surface of their deployment.
- Rotate and extend adversarial inputs over time. A static test suite becomes less effective as attackers adapt.

---

### 7. Context Window Dilution

**Risk:** In Path A, if the bouncer file is large or the agent context window is under pressure, the LLM may deprioritize or effectively ignore controls that appear late in context. This is the same failure mode that prompted building bouncer-md — guardrails buried in context get dropped.

**Affected path:** Path A only.

**Mitigation:**
- Keep bouncer files focused and concise. A 500-line bouncer file is a red flag.
- Place the bouncer file reference early in your agent instruction file, not at the end.
- Use `priority: immutable` on critical controls to signal their importance explicitly.
- Path B eliminates this risk entirely by moving enforcement out of the context window.

---

### 8. Hybrid Enforcement Misrepresentation

**Risk:** A hybrid deployment that represents Path A enforcement as deterministic overstates its security posture. In compliance-sensitive contexts, representing alignment-dependent enforcement as guaranteed is a material misrepresentation risk with potential legal and regulatory implications.

**Affected path:** Hybrid (Path A + Path B).

**Mitigation:**
- Hybrid deployments MUST document which controls are Path B enforced (deterministic) vs Path A best-effort (alignment-dependent). See Section 8.3 of the spec.
- Never represent alignment-dependent enforcement as a guarantee.
- When the resolver is unavailable and Path A fallback activates, treat the session as reduced-guarantee and log it.
- Any conformance claim must accurately represent the deployment path and enforcement guarantees. See Section 12.1 of the spec.

---

### 9. Fork and Modified Spec Deployment

**Risk:** An implementation built against a modified fork of the spec may claim canonical bouncer-md conformance while having removed safety-critical requirements (deny-by-default, fail-closed behavior, additive-restriction-only). A bouncer file authored against a stripped fork looks identical to one authored against the canonical spec. Downstream consumers have no way to detect the difference without explicit verification.

**Affected path:** Path A and Path B.

**Mitigation:**
- Pin your resolver implementation to a specific tagged release of the canonical spec (e.g. `v0.7`).
- Verify the pinned version in your CI pipeline against the Section 11.3 conformance tests.
- Treat any resolver not pinned to a canonical tagged release as unverified.
- Use the optional `spec` frontmatter anchor (Section 3.3 of the spec) to declare which spec version a file was authored against. If a resolver detects a mismatch, it SHOULD log it.
- Modified forks are permitted under MIT but MUST NOT claim conformance with the canonical bouncer-md specification. See Section 12.2 of the spec.

---

## What bouncer-md Does Not Protect Against

- **Model capability gaps.** If the underlying LLM cannot reason correctly about a control, no amount of policy authoring will compensate. Test with your target model.
- **Infrastructure-layer attacks.** bouncer-md operates at the instruction and pipeline layer. Network-level attacks, credential theft, and infrastructure compromise are outside its scope.
- **Insider authoring threats.** A trusted author with write access to `bouncer.md` can weaken policy. This is a process and access control problem, not a spec problem.
- **Platform-level guardrail bypass.** bouncer-md does not replace platform content safety mechanisms such as Azure AI Content Safety or Anthropic's built-in guardrails. It complements them.

---

## Reporting a Security Issue

If you discover a vulnerability in the bouncer-md specification, reference implementation, test suite, or related tooling, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Open a [GitHub Security Advisory](https://github.com/bouncer-md/bouncer-md/security/advisories/new) to report privately. Include:

- A clear description of the vulnerability
- The affected component (spec, resolver, test suite, examples)
- Steps to reproduce or a proof of concept
- Your assessment of severity and impact

We will acknowledge receipt within 72 hours and work toward a resolution and coordinated disclosure.

---

## Scope

This security policy covers:

- The bouncer-md specification (`SPEC.md`)
- The JSON Schema for frontmatter validation
- The reference resolver (when available)
- The test suite and adversarial inputs
- The example bouncer files

Community-contributed bouncer files in `examples/` are provided as-is. Authors are responsible for the security properties of their own contributions.
