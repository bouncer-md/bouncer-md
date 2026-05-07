---
name: Block With Log Policy
description: Policy with block and log — log must always fire alongside block
version: "1.0"
---

## Control: Block And Log Control

### Applies To

- agent

### Detect

- Any restricted action that must be audited

### Enforce

- Block the action and record the attempt

### Outcome

- block
- log
