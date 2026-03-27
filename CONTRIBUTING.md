# Contributing to bouncer-md

Thank you for contributing. Bouncer exists to give the agentic systems community a shared, reusable standard for safety and compliance guardrails. Your contributions make that possible.

---

## Scope Discipline

This is the most important rule in this repository.

**Bouncer files are safety and compliance artifacts only.**

A Bouncer file controls what an agent is prohibited from doing, what content it must treat as untrusted, and what triggers a block, redaction, or escalation. Nothing else.

Contributions that include any of the following will be rejected:

- Agent persona or tone
- Domain expertise or knowledge constraints
- Workflow steps or orchestration logic
- Tool selection logic
- Formatting preferences

If you're unsure whether something belongs in a Bouncer file, ask yourself: *is this a safety or compliance control?* If the answer is anything other than yes, it doesn't belong here.

---

## Ways to Contribute

### Submit a community policy

The most common contribution. Add a new `.bouncer.md` file to the `policies/` directory under the appropriate category.

Good candidates:
- Industry-specific guardrails (`finserv.bouncer.md`, `healthcare.bouncer.md`)
- Task-specific guardrails (`code-execution.bouncer.md`, `web-browsing.bouncer.md`)
- Threat-specific guardrails (`data-exfiltration.bouncer.md`, `privilege-escalation.bouncer.md`)

### Improve the specification

Open an issue or pull request against `SPEC.md`. Breaking changes require a version increment. See the versioning rules in Section 13 of the spec.

### Improve the JSON Schema

The frontmatter schema is in `schemas/bouncer-frontmatter.schema.json`. Changes that affect validation behavior should be discussed in an issue first.

### Improve tooling

The reference resolver and linter live in `resolver/`. Contributions that improve conformance coverage, performance, or framework integration are welcome.

---

## Policy Submission Guidelines

### File placement

All community policy files live in the `examples/` directory:

```
examples/
  default.bouncer.md                # baseline, multi-control starting point
  prompt-injection.bouncer.md       # security
  secret-protection.bouncer.md      # data protection
  tool-execution-safety.bouncer.md  # tool guardrails
  finserv.bouncer.md                # industry example
  ...
```

Use descriptive, kebab-case filenames that make the policy purpose clear at a glance.

### Required frontmatter

Every submitted policy **must** include at minimum:

```yaml
---
name: <string>
description: <string>
version: 0.1.0
author: <your GitHub handle or org>
tags: [<relevant tags>]
severity: <low|medium|high|critical>
priority: <immutable|strict|flexible>
license: MIT
---
```

### Control block requirements

Every control block must include all five sections:

```markdown
## Control: <name>

### Applies To
- <subject>

### Detect
- <condition>

### Enforce
- <behavior>

### Outcome
- <outcome>
```

Submissions with missing sections will not be merged.

### Validation

Before submitting, validate your file against the JSON Schema. You can do this in VS Code with the YAML extension, or via CLI:

```bash
npx ajv validate -s schemas/bouncer-frontmatter.schema.json -d your-file.bouncer.md --allowUnionTypes
```

---

## Pull Request Process

1. Fork the repository
2. Create a branch: `feat/your-policy-name` or `fix/description`
3. Add or modify files
4. Validate frontmatter against the schema
5. Open a pull request with a clear description of what the policy does and why it belongs here
6. A maintainer will review for scope compliance and spec conformance

---

## Issue Guidelines

Use issues to:
- Propose new policy categories
- Discuss specification changes before opening a PR
- Report bugs in the resolver or linter
- Ask questions about scope or intent

Please check existing issues before opening a new one.

---

## Code of Conduct

Be direct, be constructive, and stay on topic. This is a technical specification project. Contributions are evaluated on correctness and scope compliance, not on author identity or affiliation.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
