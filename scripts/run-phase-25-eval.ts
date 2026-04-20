import { join } from "node:path";
import type {
  BehavioralAdaptationReport,
  RunBehavioralAdaptationEvaluationOptions,
} from "../src/eval/behavioral-adaptation";
import { runBehavioralAdaptationEvaluation } from "../src/eval/behavioral-adaptation";
import { resolveFlagValue } from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase25EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase25EvalDependencies {
  runEvaluation?: (
    input: RunBehavioralAdaptationEvaluationOptions,
  ) => Promise<BehavioralAdaptationReport>;
}

const GENERATED_BY = "scripts/run-phase-25-eval.ts";

export function resolvePhase25FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-25");
}

export function resolvePhase25FixtureDir(root: string): string {
  return join(root, "fixtures/behavioral-adaptation");
}

export async function runPhase25FallbackEval(
  input?: Phase25EvalOptions,
  dependencies?: Phase25EvalDependencies,
): Promise<BehavioralAdaptationReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const runEvaluation = dependencies?.runEvaluation ?? runBehavioralAdaptationEvaluation;

  return runEvaluation({
    fixtureDir: resolvePhase25FixtureDir(root),
    generatedBy: GENERATED_BY,
    mode: "fallback",
    outputDir: input?.outputDir ?? resolvePhase25FallbackOutputDir(root),
    runId: input?.runId,
  });
}

export function parsePhase25EvalCliOptions(
  argv: readonly string[],
): Phase25EvalOptions {
  return {
    outputDir: resolveFlagValue([...argv], "--output-dir"),
    runId: resolveFlagValue([...argv], "--run-id"),
  };
}

async function main(): Promise<void> {
  const report = await runPhase25FallbackEval(
    parsePhase25EvalCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
