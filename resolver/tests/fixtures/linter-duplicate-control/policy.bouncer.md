---
name: Duplicate Control Policy
description: Policy with duplicate control names within a single file — must error
version: "1.0"
---

## Control: Access Control

### Applies To

- tool_request

### Detect

- prompt_injection

### Enforce

- Deny the tool request

### Outcome

- block

## Control: Access Control

### Applies To

- user_input

### Detect

- instruction_override

### Enforce

- Block the input

### Outcome

- block
