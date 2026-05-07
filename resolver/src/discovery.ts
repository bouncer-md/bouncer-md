import * as fs from "node:fs";
import * as path from "node:path";

export interface DiscoveryResult {
  global: string | null;
  scoped: string[];
}

export function discoverPolicyFiles(agentInstructionPath: string): DiscoveryResult {
  const scopeRoot = path.dirname(path.resolve(agentInstructionPath));

  // Collect *.bouncer.md from scope root only — no ancestor walking for scoped files
  let scoped: string[] = [];
  try {
    const entries = fs.readdirSync(scopeRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".bouncer.md")) {
        scoped.push(path.join(scopeRoot, entry.name));
      }
    }
  } catch {
    // unreadable directory — treat as empty
  }

  // Deterministic ordering: case-insensitive alphabetical by filename (never OS-dependent)
  scoped = scoped.sort((a, b) =>
    path.basename(a).toLowerCase().localeCompare(path.basename(b).toLowerCase())
  );

  // Find global bouncer.md by walking up from scope root — first match wins, stop on match
  let global: string | null = null;
  let current = scopeRoot;
  for (;;) {
    const candidate = path.join(current, "bouncer.md");
    if (fs.existsSync(candidate)) {
      global = candidate;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root reached
    current = parent;
  }

  return { global, scoped };
}
