#!/usr/bin/env node
import { createProvider } from "./providers/factory.js";
import { runCleanScenario, runAdversarialScenarios, getResolverVersion } from "./scenario/runner.js";
import { generateReport } from "./report/reporter.js";
import type { ScenarioResult, AdversarialResult } from "./scenario/types.js";

const args = process.argv.slice(2);
const cleanOnly = args.includes("--clean");
const adversarialOnly = args.includes("--adversarial");

const runClean = !adversarialOnly;
const runAdversarial = !cleanOnly;

const provider = createProvider();
const resolverVersion = getResolverVersion();

let cleanResult: ScenarioResult | null = null;
let adversarialResults: AdversarialResult[] = [];
let model = "unknown";

if (runClean) {
  process.stderr.write("Running clean scenario...\n");
  const { result, model: m } = await runCleanScenario(provider);
  cleanResult = result;
  if (m !== "unknown") model = m;
}

if (runAdversarial) {
  process.stderr.write("Running adversarial scenarios...\n");
  const { results, model: m } = await runAdversarialScenarios(provider);
  adversarialResults = results;
  if (model === "unknown" && m !== "unknown") model = m;
}

const report = generateReport({
  timestamp: new Date().toISOString(),
  providerName: provider.name,
  model,
  resolverVersion,
  cleanScenario: cleanResult,
  adversarialResults,
});

process.stdout.write(report + "\n");
