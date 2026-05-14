import type { ScenarioResult, AdversarialResult } from "../scenario/types.js";

export interface RunReport {
  timestamp: string;
  providerName: string;
  model: string;
  resolverVersion: string;
  cleanScenario: ScenarioResult | null;
  adversarialResults: AdversarialResult[];
}

export function generateReport(report: RunReport): string {
  const lines: string[] = [];

  lines.push("bouncer-md Agent Test Harness");
  lines.push(`Run: ${report.timestamp}`);
  lines.push(`Provider: ${report.providerName} (${report.model})`);
  lines.push(`Resolver: ${report.resolverVersion}`);
  lines.push("");

  lines.push("── Clean Scenario ─────────────────────────────────────────");
  if (report.cleanScenario === null) {
    lines.push("  Not run");
  } else {
    const s = report.cleanScenario;
    const status = s.passed ? "PASS" : "FAIL";
    lines.push(`  Clean scenario: ${status}`);
    if (!s.passed) {
      lines.push(`  Failure: ${s.failureReason ?? "(no reason provided)"}`);
      lines.push(`  IR: ${JSON.stringify(s.ir, null, 2)}`);
      lines.push(`  Audit records: ${JSON.stringify(s.auditRecords, null, 2)}`);
      lines.push(`  Tool invocations: ${JSON.stringify(s.toolInvocations, null, 2)}`);
    }
  }
  lines.push("");

  const categories = new Map<string, AdversarialResult[]>();
  for (const r of report.adversarialResults) {
    const cat = r.scenario.split("/")[0] ?? r.scenario;
    const existing = categories.get(cat);
    if (existing) {
      existing.push(r);
    } else {
      categories.set(cat, [r]);
    }
  }

  for (const [cat, results] of categories) {
    lines.push(`── Adversarial: ${cat} ──────────────────────────────────────`);
    for (const r of results) {
      const scenarioName = r.scenario.split("/")[1] ?? r.scenario;
      const outcome = r.ir?.controls[0]?.resolved_outcome ?? "unknown";
      const toolInvoked = r.toolInvocations.filter((i) => i.tool === r.targetedTool).length > 0;
      const note = toolInvoked
        ? `${r.targetedTool} WAS invoked`
        : `${r.targetedTool} not invoked`;
      lines.push(`  ${scenarioName}: ${r.passed ? "PASS" : "FAIL"}  (${outcome}, ${note})`);
      if (!r.passed) {
        lines.push(`    Failure: ${r.failureReason ?? "(no reason provided)"}`);
        lines.push(`    IR: ${JSON.stringify(r.ir, null, 2)}`);
        lines.push(`    Audit records: ${JSON.stringify(r.auditRecords, null, 2)}`);
        lines.push(`    Tool invocations: ${JSON.stringify(r.toolInvocations, null, 2)}`);
      }
    }
    lines.push("");
  }

  const totalAdversarial = report.adversarialResults.length;
  const passedAdversarial = report.adversarialResults.filter((r) => r.passed).length;
  const cleanCount = report.cleanScenario !== null ? 1 : 0;
  const cleanPassed = report.cleanScenario?.passed === true ? 1 : 0;
  const total = totalAdversarial + cleanCount;
  const passed = passedAdversarial + cleanPassed;
  const failed = total - passed;

  lines.push("── Summary ────────────────────────────────────────────────");
  lines.push(`  Total:    ${String(total)} scenarios`);
  lines.push(`  Passed:   ${String(passed)}`);
  lines.push(`  Failed:   ${String(failed)}`);
  lines.push(`  Warnings: 0`);
  lines.push("");
  lines.push("  Known stubs:");
  lines.push("    bouncer.detected_conditions: always [] (deferred, issue #46)");
  lines.push("    OTel span emission: stubbed (pending SIG validation, issue #46)");

  return lines.join("\n");
}
