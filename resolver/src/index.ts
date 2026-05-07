export type {
  ResolvedPolicyIR,
  ResolveOptions,
  ResolvedControl,
  ResolutionLogEntry,
} from "./types.js";
export { BouncerPolicyMismatchError, BouncerMalformedFileError } from "./errors.js";

import type { ResolvedPolicyIR, ResolveOptions } from "./types.js";
import { resolveFiles } from "./resolver.js";

export function resolve(
  agentInstructionPath: string,
  options?: ResolveOptions
): ResolvedPolicyIR {
  return resolveFiles(agentInstructionPath, options ?? {});
}
