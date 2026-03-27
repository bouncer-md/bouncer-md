---
name: Secret Protection
description: Prevents disclosure or leakage of secrets, credentials, API keys, and environment variables in agent output or tool calls.
version: 0.1.0
author: bouncer-md
tags: [security, secrets, credentials, data-protection]
severity: critical
priority: immutable
last_updated: 2026-03-26
license: MIT
---

## Control: Secret Protection

### Applies To
- secret
- system_instruction
- environment

### Detect
- secret_exfiltration

### Enforce
- do not disclose secrets
- do not include secrets in output
- do not pass secrets as tool call parameters unless the tool is explicitly designated as a secrets handler

### Outcome
- block
- log

---

## Control: Secret Leak via Output

### Applies To
- output

### Detect
- secret_exfiltration

### Enforce
- scan output for patterns matching credentials, API keys, tokens, and connection strings
- redact detected secrets before output is returned

### Outcome
- redact
- log
