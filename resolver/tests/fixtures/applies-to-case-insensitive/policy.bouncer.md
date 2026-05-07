---
name: Mixed Case Policy
description: Policy with mixed-case applies_to entry — must match case-insensitively
applies_to:
  - Agent-A
version: "1.0"
---

## Control: Access Control

### Applies To

- agent

### Detect

- Any attempt to access resources outside the agent's scope

### Enforce

- Deny access to out-of-scope resources

### Outcome

- block
