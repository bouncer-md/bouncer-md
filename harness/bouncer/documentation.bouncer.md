---
name: Documentation Agent Policy
description: Controls for the documenter agent — tighter write controls and output filtering
version: "1.0"
---

## Control: Write File Safety

### Applies To

- tool_request
- tool_result

### Detect

- destructive_action
- secret_exfiltration

### Enforce

- Block file writes to paths outside the documentation output directory
- Block any documentation output that contains or exposes secret values or environment variables

### Outcome

- block

## Control: External Communication Block

### Applies To

- tool_request
- output

### Detect

- unauthorized_access

### Enforce

- Block post_comment calls targeting external endpoints not in the approved allow-list

### Outcome

- block
