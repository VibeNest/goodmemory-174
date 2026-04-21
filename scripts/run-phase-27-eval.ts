import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listScenarioFixtures, type ScenarioFixture } from "../src/eval/dataset";
import type { EvalRuntimeMetadata } from "../src/eval/contracts";
import {
  buildPhase27DeterministicReport,
  createPhase27FallbackCreateMemory,
  resolvePhase27FallbackScenarioIds,
  runPhase27CodexHandoffFamily,
} from "../src/eval/phase27";
import type { EvalAnswerGeneratorInput } from "../src/eval/runners";
import { findAffirmedSignals } from "../src/eval/signalMatching";
import { runEvalSuite } from "../src/eval/suite";
import {
  createFallbackAdapterDescriptor,
  createProviderRuntimeMetadata,
} from "../src/provider/layer";
import {
  buildFallbackGoodMemoryAnswer,
  buildFallbackJudgeContent,
  resolveFlagValue,
  resolveRepeatedFlagValues,
} from "./run-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase27EvalOptions {
  limit?: number;
  outputDir?: string;
  runId?: string;
  scenarioIds?: string[];
}

export interface Phase27EvalDependencies {
  ensureDir?: (path: string) => Promise<void>;
  loadScenarios?: (scenarioDir: string) => Promise<ScenarioFixture[]>;
  now?: () => string;
  runCodexHandoffFamily?: typeof runPhase27CodexHandoffFamily;
  runSuite?: typeof runEvalSuite;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

const GENERATED_BY = "scripts/run-phase-27-eval.ts";

function uniqueSignals(signals: readonly string[]): string[] {
  return [...new Set(signals)];
}

function buildVisibleTranscriptContext(
  input: EvalAnswerGeneratorInput,
): string {
  const candidateSignals = uniqueSignals([
    ...input.scenario.evaluation.expected_identity_signals,
    ...input.scenario.evaluation.expected_history_signals,
    ...input.scenario.evaluation.expected_transfer_signals,
    ...input.scenario.evaluation.expected_update_wins,
  ]);
  const surfacedSignals = findAffirmedSignals(candidateSignals, input.transcript);

  if (surfacedSignals.length === 0) {
    return "";
  }

  return [
    "Visible transcript context:",
    ...surfacedSignals.map((signal) => `- ${signal}`),
  ].join("\n");
}

function buildPhase27BaselineAnswer(
  input: EvalAnswerGeneratorInput,
): string {
  const memoryContext = buildVisibleTranscriptContext(input);
  if (!memoryContext) {
    return "I need more context before I can answer reliably.";
  }

  return buildFallbackGoodMemoryAnswer({
    ...input,
    memoryContext,
  });
}

function buildPhase27FallbackRuntime(): EvalRuntimeMetadata {
  return {
    ...createProviderRuntimeMetadata({
      generation: createFallbackAdapterDescriptor(),
      judge: createFallbackAdapterDescriptor(),
    }),
    memoryBackend: "sqlite",
    embeddingEnabled: false,
    assistedExtractionEnabled: false,
  };
}

function buildPhase27FallbackRunId(timestamp: string): string {
  const digits = timestamp.replace(/\D/g, "");
  return `run-${digits.slice(0, 17)}`;
}

export function resolvePhase27FallbackOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-27");
}

export function parsePhase27EvalCliOptions(
  argv: readonly string[],
): Phase27EvalOptions {
  const args = [...argv];
  const limitValue = resolveFlagValue(args, "--limit");

  return {
    limit: limitValue ? Number(limitValue) : undefined,
    outputDir: resolveFlagValue(args, "--output-dir"),
    runId: resolveFlagValue(args, "--run-id"),
    scenarioIds: resolveRepeatedFlagValues(args, "--scenario-id"),
  };
}

export async function runPhase27FallbackEval(
  input?: Phase27EvalOptions,
  dependencies?: Phase27EvalDependencies,
) {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? (async (path: string) => {
    await mkdir(path, { recursive: true });
  });
  const writeTextFile = dependencies?.writeTextFile ?? (async (
    path: string,
    content: string,
  ) => {
    await writeFile(path, content);
  });
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const loadScenarios = dependencies?.loadScenarios ?? listScenarioFixtures;
  const runSuite = dependencies?.runSuite ?? runEvalSuite;
  const runCodexHandoffFamily =
    dependencies?.runCodexHandoffFamily ?? runPhase27CodexHandoffFamily;

  const outputDir = input?.outputDir ?? resolvePhase27FallbackOutputDir(root);
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase27FallbackRunId(generatedAt);
  const runDirectory = join(outputDir, runId);
  const scenarioIds = resolvePhase27FallbackScenarioIds(input?.scenarioIds);
  const scenarioDir = join(root, "fixtures/scenarios/eval");

  await ensureDir(runDirectory);

  const suiteResult = await runSuite({
    mode: "fallback",
    personaDir: join(root, "fixtures/personas/eval"),
    scenarioDir,
    outputDir: runDirectory,
    runId: "suite",
    limit: input?.limit,
    scenarioIds,
    strategies: ["rules-only"],
    rememberExtractionStrategy: "auto",
    createMemory: createPhase27FallbackCreateMemory(),
    baselineGenerator: async (payload) => ({
      content: buildPhase27BaselineAnswer(payload),
    }),
    goodmemoryGenerator: async (payload) => ({
      content: buildFallbackGoodMemoryAnswer(payload),
    }),
    judge: {
      async complete({ prompt }: { prompt: string }) {
        return {
          content: buildFallbackJudgeContent(prompt),
        };
      },
    },
    runtime: buildPhase27FallbackRuntime(),
  });

  const scenarios = (await loadScenarios(scenarioDir)).filter((scenario) =>
    scenarioIds.includes(scenario.scenario_id),
  );
  const handoffSummary = await runCodexHandoffFamily();
  const report = buildPhase27DeterministicReport({
    generatedAt,
    generatedBy: GENERATED_BY,
    handoffSummary,
    outputDir,
    runDirectory,
    runId,
    scenarios,
    suiteResult,
  });

  await writeTextFile(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

async function main(): Promise<void> {
  const report = await runPhase27FallbackEval(
    parsePhase27EvalCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));

  if (!report.summary.accepted) {
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
