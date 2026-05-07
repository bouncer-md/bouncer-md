export type { ResolvedPolicyIR, ResolveOptions, ResolvedControl, ResolutionLogEntry } from "./types.js";
export { BouncerPolicyMismatchError, BouncerMalformedFileError } from "./errors.js";

import type { ResolvedPolicyIR, ResolveOptions } from "./types.js";

export function resolve(
  _agentInstructionPath: string,
  _options?: ResolveOptions
): ResolvedPolicyIR {
  throw new Error("Not implemented");
}
