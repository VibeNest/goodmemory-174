import { existsSync } from "node:fs";
import type {
  LongMemEvalRecallDiagnosticProfile,
  LongMemEvalRecallDiagnosticReport,
  RunLongMemEvalRecallDiagnosticOptions,
} from "../src/eval/longmemeval";
import {
  createLongMemEvalGoodMemoryContextBuilder,
  runLongMemEvalRecallDiagnostic,
} from "../src/eval/longmemeval";
import { createGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemory } from "../src/api/contracts";
import { assertCliPathSegmentValue } from "./cli-options";
import {
  createHermeticLongMemEvalMemory,
  createLongMemEvalMemoryFactory,
} from "./run-phase-62-eval";
import type { Phase62CliOptions } from "./run-phase-62-shared";
import {
  parsePhase62CliOptions,
  resolvePhase62BenchmarkRoot,
  resolvePhase62DataFileCandidates,
  resolvePhase62OutputDir,
  resolvePhase62RepoRoot,
} from "./run-phase-62-shared";

export const PHASE62_RECALL_DIAGNOSTIC_RUN_ID =
  "run-phase62-longmemeval-recall-diagnostic-current";
export const PHASE62_TYPE_BALANCED_CASE_IDS = [
  "e47becba",
  "118b2229",
  "51a45a95",
  "0a995998",
  "6d550036",
  "gpt4_59c863d7",
  "8a2466db",
  "06878be2",
  "75832dbd",
  "gpt4_59149c77",
  "gpt4_f49edff3",
  "71017276",
  "6a1eabeb",
  "6aeb4375",
  "830ce83f",
  "7161e7e2",
  "c4f10528",
  "89527b6b",
] as const;

const GENERATED_BY = "scripts/run-phase-62-recall-diagnostic.ts";

export interface Phase62RecallDiagnosticDependencies {
  createMemory?: typeof createGoodMemory;
  fileExists?: (path: string) => boolean;
  runDiagnostic?: typeof runLongMemEvalRecallDiagnostic;
}

function listMissingEnv(required: readonly string[]): string[] {
  return required.filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

function resolveRecallDiagnosticProfile(
  profiles?: readonly string[],
): LongMemEvalRecallDiagnosticProfile {
  if (!profiles || profiles.length === 0) {
    return "goodmemory-rules-only";
  }
  if (profiles.length !== 1) {
    throw new Error(
      "Phase 62 recall-only diagnostic accepts exactly one GoodMemory profile.",
    );
  }

  const profile = profiles[0];
  if (
    profile === "goodmemory-rules-only" ||
    profile === "goodmemory-hybrid" ||
    profile === "goodmemory-recommended"
  ) {
    return profile;
  }

  throw new Error(
    "Phase 62 recall-only diagnostic profile must be goodmemory-rules-only, goodmemory-recommended, or goodmemory-hybrid.",
  );
}

function assertRecallDiagnosticReadiness(input: {
  benchmarkRoot: string;
  fileExists: (path: string) => boolean;
  mode: "smoke" | "full";
  profile: LongMemEvalRecallDiagnosticProfile;
}): void {
  const candidateDataFiles = resolvePhase62DataFileCandidates({
    benchmarkRoot: input.benchmarkRoot,
    mode: input.mode,
  });
  if (!candidateDataFiles.some(input.fileExists)) {
    throw new Error(
      `Phase 62 recall-only diagnostic could not find LongMemEval data. Checked: ${candidateDataFiles.join(", ")}`,
    );
  }

  if (input.profile !== "goodmemory-hybrid") {
    return;
  }

  const missing = listMissingEnv([
    "GOODMEMORY_TEST_POSTGRES_URL",
    "GOODMEMORY_EMBEDDING_PROVIDER",
    "GOODMEMORY_EMBEDDING_MODEL",
    "GOODMEMORY_EMBEDDING_API_KEY",
    "GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER",
    "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL",
    "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY",
  ]);
  if (missing.length > 0) {
    throw new Error(
      `Phase 62 goodmemory-hybrid recall-only diagnostic is missing provider env: ${missing.join(", ")}`,
    );
  }
}

export function buildPhase62RecallDiagnosticOptions(
  root: string,
  options: Phase62CliOptions,
): RunLongMemEvalRecallDiagnosticOptions {
  const profile = resolveRecallDiagnosticProfile(options.profiles);
  const runId = options.runId ?? PHASE62_RECALL_DIAGNOSTIC_RUN_ID;
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });
  if (options.allCases && options.caseIds && options.caseIds.length > 0) {
    throw new Error("--all-cases cannot be combined with --case-id");
  }

  return {
    benchmarkRoot:
      options.benchmarkRoot ?? resolvePhase62BenchmarkRoot(root, false),
    caseIds: options.allCases
      ? undefined
      : (options.caseIds ?? PHASE62_TYPE_BALANCED_CASE_IDS),
    generatedBy: GENERATED_BY,
    ingestMode: options.labelFreeIngest
      ? "label-free-raw"
      : "historical-annotated",
    limit: options.limit,
    maxConcurrency: options.maxConcurrency ?? 1,
    mode: "full",
    offset: options.offset,
    outputDir: options.outputDir ?? resolvePhase62OutputDir(root),
    profile,
    questionTypes: options.questionTypes,
    resume: options.resume,
    runId,
  };
}

export async function runPhase62LongMemEvalRecallDiagnostic(
  options: Partial<Phase62CliOptions> = {},
  dependencies: Phase62RecallDiagnosticDependencies = {},
): Promise<LongMemEvalRecallDiagnosticReport> {
  const root = resolvePhase62RepoRoot();
  const runDiagnostic =
    dependencies.runDiagnostic ?? runLongMemEvalRecallDiagnostic;
  const runOptions = buildPhase62RecallDiagnosticOptions(root, {
    mode: "smoke",
    ...options,
  });

  if (!dependencies.runDiagnostic) {
    assertRecallDiagnosticReadiness({
      benchmarkRoot: runOptions.benchmarkRoot,
      fileExists: dependencies.fileExists ?? existsSync,
      mode: runOptions.mode,
      profile: runOptions.profile,
    });

    const createMemory =
      dependencies.createMemory ?? createHermeticLongMemEvalMemory;
    const createProfileMemory = createLongMemEvalMemoryFactory(
      createMemory,
      { runNamespace: runOptions.runId },
    ) as (profile: LongMemEvalRecallDiagnosticProfile) => GoodMemory;
    return runDiagnostic(runOptions, {
      memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
        createMemory: createProfileMemory,
        ingestMode: runOptions.ingestMode,
        runId: runOptions.runId,
      }),
    });
  }

  return runDiagnostic(runOptions);
}

if (import.meta.main) {
  const report = await runPhase62LongMemEvalRecallDiagnostic(
    parsePhase62CliOptions(Bun.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}
