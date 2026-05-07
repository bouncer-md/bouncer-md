import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as url from "node:url";
import { resolve } from "../../src/index.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../fixtures");

// ── Test 12 ───────────────────────────────────────────────────────────────────
describe("missing global baseline", () => {
  it("applies only scoped files when no bouncer.md is found walking to filesystem root", () => {
    // Spec §11.3: if no bouncer.md is found after walking to filesystem root,
    // only scoped *.bouncer.md files apply; this MUST be logged
    const agentFile = path.join(fixtures, "missing-global-baseline/agent.md");
    const ir = resolve(agentFile);

    // Scoped controls are applied
    expect(ir.controls.length).toBeGreaterThan(0);
    // The missing global baseline is logged
    expect(
      ir.resolution_log.some(
        (e) => e.event === "no_policy_found" || e.detail.toLowerCase().includes("global baseline")
      )
    ).toBe(true);
  });
});

// ── Test 13 ───────────────────────────────────────────────────────────────────
describe("discovery ancestor walking", () => {
  it("finds bouncer.md in a parent directory when none exists in the scope root", () => {
    // Spec §11.3: the global bouncer.md is found by walking upward from the scope root;
    // a bouncer.md in a parent directory applies as the global baseline
    // The agent is in: fixtures/discovery-ancestor/child/
    // The bouncer.md is in: fixtures/discovery-ancestor/  (parent)
    const agentFile = path.join(fixtures, "discovery-ancestor/child/agent.md");
    const ir = resolve(agentFile);

    // The global baseline control from the parent bouncer.md must be present
    expect(ir.controls.length).toBeGreaterThan(0);
    expect(
      ir.policy_files.some((f) => f.path.endsWith("bouncer.md") && f.accepted)
    ).toBe(true);
  });
});

// ── Test 14 ───────────────────────────────────────────────────────────────────
describe("scoped file alphabetical ordering", () => {
  it("applies multiple scoped files in case-insensitive alphabetical order by filename", () => {
    // Spec §11.3: when multiple *.bouncer.md files exist in scope root, they MUST be applied
    // in case-insensitive alphabetical order; OS-dependent ordering MUST NOT be used
    // Fixture files: alpha.bouncer.md, Middle.bouncer.md, zebra.bouncer.md
    // Case-insensitive order: alpha < middle < zebra
    const agentFile = path.join(fixtures, "discovery-scoped-ordering/agent.md");
    const ir = resolve(agentFile);

    const accepted = ir.policy_files.filter((f) => f.accepted);
    expect(accepted.length).toBe(3);

    const filenames = accepted.map((f) => path.basename(f.path).toLowerCase());
    const sorted = [...filenames].sort((a, b) => a.localeCompare(b));
    expect(filenames).toEqual(sorted);
  });
});
