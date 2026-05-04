#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ImplicitMemBenchResearchReport } from "../src/eval/implicitmembench-research";
import { buildRawInternalizationDiagnosisSummary } from "../src/eval/implicitmembench-diagnostics";
import { resolveCliFlagValue } from "./cli-options";

function parseReportPaths(argv: readonly string[]): string[] {
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--report" && argv[index + 1]) {
      paths.push(argv[index + 1]!);
      index += 1;
      continue;
    }
    if (argv[index] === "--output" || argv[index] === "--run-id") {
      index += 1;
      continue;
    }
    if (argv[index] && !argv[index]!.startsWith("--") && index > 1) {
      paths.push(argv[index]!);
    }
  }

  return [...new Set(paths)];
}

async function readReport(path: string): Promise<ImplicitMemBenchResearchReport> {
  const content = await readFile(resolve(path), "utf8");
  return JSON.parse(content) as ImplicitMemBenchResearchReport;
}

async function main(): Promise<void> {
  const reportPaths = parseReportPaths(process.argv);
  if (reportPaths.length === 0) {
    throw new Error("Provide one or more --report <path> arguments.");
  }

  const reports = await Promise.all(reportPaths.map(readReport));
  const summary = buildRawInternalizationDiagnosisSummary(reports);
  const output = JSON.stringify(summary, null, 2);
  const outputPath = resolveCliFlagValue(process.argv, "--output");

  if (outputPath) {
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(resolve(outputPath), `${output}\n`);
  }

  console.log(output);
}

if (import.meta.main) {
  await main();
}
