#!/usr/bin/env node
import * as path from "node:path";
import * as process from "node:process";
import { lint } from "./linter.js";
import type { LintResult } from "./linter.js";

function printHuman(result: LintResult): void {
  const status = result.valid ? "PASS" : "FAIL";
  console.log(`${status}  ${result.file}`);
  for (const d of result.diagnostics) {
    const tag = d.severity === "error" ? "error" : "warn ";
    const loc = d.control !== null ? ` [${d.control}]` : "";
    console.log(`  ${tag}${loc}  ${d.message}  (${d.rule})`);
  }
  console.log(`\n${String(result.error_count)} error(s), ${String(result.warning_count)} warning(s)`);
}

function printJson(result: LintResult): void {
  process.stdout.write(JSON.stringify(result) + "\n");
}

function usage(): void {
  process.stderr.write("Usage: bouncer lint [--json] <file>\n");
  process.stderr.write("  --json    Machine-readable JSON output\n");
}

function run(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] !== "lint") {
    usage();
    process.exit(2);
  }

  const lintArgs = args.slice(1);
  const jsonFlag = lintArgs.includes("--json");
  const fileArgs = lintArgs.filter((a) => !a.startsWith("--"));

  if (fileArgs.length === 0) {
    usage();
    process.exit(2);
  }

  const filePath = path.resolve(fileArgs[0] ?? "");
  const result = lint(filePath);

  if (jsonFlag) {
    printJson(result);
  } else {
    printHuman(result);
  }

  process.exit(result.valid ? 0 : 1);
}

run();
