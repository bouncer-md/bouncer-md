export class BouncerPolicyMismatchError extends Error {
  readonly policyFile: string;
  readonly agentName: string;

  constructor(policyFile: string, agentName: string) {
    super(
      `applies_to mismatch: agent "${agentName}" does not match policy file "${policyFile}"`
    );
    this.name = "BouncerPolicyMismatchError";
    this.policyFile = policyFile;
    this.agentName = agentName;
  }
}

export class BouncerMalformedFileError extends Error {
  readonly policyFile: string;
  readonly reason: string;

  constructor(policyFile: string, reason: string) {
    super(`Malformed bouncer file "${policyFile}": ${reason}`);
    this.name = "BouncerMalformedFileError";
    this.policyFile = policyFile;
    this.reason = reason;
  }
}
