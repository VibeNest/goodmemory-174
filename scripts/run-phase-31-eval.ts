import { join } from "node:path";
import type {
  BehavioralAdaptationReport,
  RunBehavioralAdaptationEvaluationOptions,
} from "../src/eval/behavioral-adaptation";
import { runBehavioralAdaptationEvaluation } from "../src/eval/behavioral-adaptation";
import { resolveFlagValue } from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase31EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase31EvalDependencies {
  runEvaluation?: (
    input: RunBehavioralAdaptationEvaluationOptions,
  ) => Promise<BehavioralAdaptationReport>;
}

const GENERATED_BY = "scripts/run-phase-31-eval.ts";

export function resolvePhase31FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-31");
}

export function resolvePhase31FixtureDir(root: string): string {
  return join(root, "fixtures/behavioral-enactment");
}

export async function runPhase31FallbackEval(
  input?: Phase31EvalOptions,
  dependencies?: Phase31EvalDependencies,
): Promise<BehavioralAdaptationReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const runEvaluation = dependencies?.runEvaluation ?? runBehavioralAdaptationEvaluation;

  return runEvaluation({
    fixtureDir: resolvePhase31FixtureDir(root),
    generatedBy: GENERATED_BY,
    mode: "fallback",
    outputDir: input?.outputDir ?? resolvePhase31FallbackOutputDir(root),
    requireTraceForStructuredCases: true,
    runId: input?.runId,
    scopePrefix: "phase31",
  });
}

export function parsePhase31EvalCliOptions(
  argv: readonly string[],
): Phase31EvalOptions {
  return {
    outputDir: resolveFlagValue([...argv], "--output-dir"),
    runId: resolveFlagValue([...argv], "--run-id"),
  };
}

async function main(): Promise<void> {
  const report = await runPhase31FallbackEval(
    parsePhase31EvalCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
