---
name: Agent A Policy
description: Policy scoped to agent-a — caller provides no agentName, cannot verify
applies_to:
  - agent-a
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
