---
name: Tool Execution Safety
description: Guardrails for agent tool use. Requires authorization validation and explicit confirmation before destructive or sensitive actions.
version: 0.1.0
author: bouncer-md
tags: [tools, authorization, destructive-actions, confirmation]
severity: high
priority: strict
last_updated: 2026-03-26
license: MIT
---

## Control: Destructive Action Confirmation

### Applies To
- tool_request

### Detect
- destructive_action
- unauthorized_access

### Enforce
- validate authorization before executing any tool call
- require explicit confirmation for actions that are irreversible, modify persistent state, or affect resources outside the current session scope

### Outcome
- require_confirmation
- log

---

## Control: Privilege Escalation Prevention

### Applies To
- tool_request
- tool_result

### Detect
- privilege_escalation
- unauthorized_access

### Enforce
- do not execute tool calls that request elevated permissions not granted in the original session context
- do not use tool results to derive or infer credentials or access tokens

### Outcome
- block
- log
