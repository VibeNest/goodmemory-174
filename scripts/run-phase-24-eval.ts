import { join } from "node:path";
import type {
  ImplicitBehaviorReport,
  RunImplicitBehaviorEvaluationOptions,
} from "../src/eval/implicit-behavior";
import { runImplicitBehaviorEvaluation } from "../src/eval/implicit-behavior";
import { resolveFlagValue } from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase24EvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase24EvalDependencies {
  runEvaluation?: (
    input: RunImplicitBehaviorEvaluationOptions,
  ) => Promise<ImplicitBehaviorReport>;
}

const GENERATED_BY = "scripts/run-phase-24-eval.ts";

export function resolvePhase24FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-24");
}

export function resolvePhase24FixtureDir(root: string): string {
  return join(root, "fixtures/implicit-behavioral");
}

export async function runPhase24FallbackEval(
  input?: Phase24EvalOptions,
  dependencies?: Phase24EvalDependencies,
): Promise<ImplicitBehaviorReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const runEvaluation = dependencies?.runEvaluation ?? runImplicitBehaviorEvaluation;

  return runEvaluation({
    fixtureDir: resolvePhase24FixtureDir(root),
    generatedBy: GENERATED_BY,
    mode: "fallback",
    outputDir: input?.outputDir ?? resolvePhase24FallbackOutputDir(root),
    runId: input?.runId,
  });
}

export function parsePhase24EvalCliOptions(
  argv: readonly string[],
): Phase24EvalOptions {
  return {
    outputDir: resolveFlagValue([...argv], "--output-dir"),
    runId: resolveFlagValue([...argv], "--run-id"),
  };
}

async function main(): Promise<void> {
  const report = await runPhase24FallbackEval(
    parsePhase24EvalCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
