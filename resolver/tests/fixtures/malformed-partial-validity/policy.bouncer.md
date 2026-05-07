---
name: Partial Validity Policy
description: One valid control and one malformed control — entire file must be rejected
version: "1.0"
---

## Control: Valid Control

### Applies To

- agent

### Detect

- Any attempt to exfiltrate data

### Enforce

- Block data exfiltration

### Outcome

- block

## Control: Malformed Control

### Applies To

- agent

### Detect

- Suspicious tool use

### Enforce

- Restrict tool execution

### Outcome

