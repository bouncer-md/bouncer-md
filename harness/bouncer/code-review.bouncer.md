---
name: Code Review Agent Policy
description: Controls for the orchestrator and analyzer agents in the code review scenario
version: "1.0"
---

## Control: Tool Execution Safety

### Applies To

- tool_request

### Detect

- unauthorized_access
- destructive_action

### Enforce

- Block tool requests that target paths outside the agent's authorized scope
- Block tool requests that destructively modify files outside the review workspace

### Outcome

- block

## Control: Cross-Agent Trust Boundary

### Applies To

- agent_instruction

### Detect

- privilege_escalation

### Enforce

- Block agent instructions that attempt to escalate privileges or claim elevated trust not established in the original session

### Outcome

- block
