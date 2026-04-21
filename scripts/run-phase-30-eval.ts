import { join } from "node:path";
import type {
  BehavioralAdaptationReport,
  RunBehavioralAdaptationEvaluationOptions,
} from "../src/eval/behavioral-adaptation";
import { runBehavioralAdaptationEvaluation } from "../src/eval/behavioral-adaptation";
import { resolveFlagValue } from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase30EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase30EvalDependencies {
  runEvaluation?: (
    input: RunBehavioralAdaptationEvaluationOptions,
  ) => Promise<BehavioralAdaptationReport>;
}

const GENERATED_BY = "scripts/run-phase-30-eval.ts";

export function resolvePhase30FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-30");
}

export function resolvePhase30FixtureDir(root: string): string {
  return join(root, "fixtures/behavioral-enactment");
}

export async function runPhase30FallbackEval(
  input?: Phase30EvalOptions,
  dependencies?: Phase30EvalDependencies,
): Promise<BehavioralAdaptationReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const runEvaluation = dependencies?.runEvaluation ?? runBehavioralAdaptationEvaluation;

  return runEvaluation({
    fixtureDir: resolvePhase30FixtureDir(root),
    generatedBy: GENERATED_BY,
    mode: "fallback",
    outputDir: input?.outputDir ?? resolvePhase30FallbackOutputDir(root),
    requireTraceForStructuredCases: true,
    runId: input?.runId,
    scopePrefix: "phase30",
  });
}

export function parsePhase30EvalCliOptions(
  argv: readonly string[],
): Phase30EvalOptions {
  return {
    outputDir: resolveFlagValue([...argv], "--output-dir"),
    runId: resolveFlagValue([...argv], "--run-id"),
  };
}

async function main(): Promise<void> {
  const report = await runPhase30FallbackEval(
    parsePhase30EvalCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
