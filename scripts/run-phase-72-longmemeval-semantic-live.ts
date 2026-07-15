import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  LONGMEMEVAL_DEFAULT_SUPPLEMENTAL_EVIDENCE_LIMIT,
  LONGMEMEVAL_DEFAULT_SUPPLEMENTAL_EVIDENCE_PER_SESSION_LIMIT,
} from "../src/eval/longmemeval";
import type {
  LongMemEvalRecallRunConfiguration,
  LongMemEvalReport,
} from "../src/eval/longmemeval";
import {
  assertCliPathSegmentValue,
  hasCliFlagStrict,
  resolveCliFlagValueStrict,
} from "./cli-options";
import {
  PHASE72_ANSWER_GATEWAY,
  PHASE72_ANSWER_MODEL,
  PHASE72_INDEPENDENT_JUDGE_MODEL,
} from "./phase-72-external-contracts";
import {
  resolvePhase62LiveRequestTimeoutMs,
  runPhase62LongMemEval,
} from "./run-phase-62-eval";
import {
  assertPhase72LongMemEvalFrozenDataset,
  createPhase72LongMemEvalDenseEvidenceAugmenter,
  createPhase72LongMemEvalSemanticMemoryRuntime,
  loadPhase72LongMemEvalSemanticSelection,
  resolvePhase72LongMemEvalSemanticEmbedding,
} from "./run-phase-72-longmemeval-semantic-recall";

export interface Phase72LongMemEvalSemanticLiveOptions {
  allCases: boolean;
  assistedExtraction: boolean;
  benchmarkRoot: string;
  denseSessionAugmentation: boolean;
  denseSessionAugmentationLimit: number;
  maxConcurrency: number;
  outputDir: string;
  rerank: boolean;
  retryReportPath?: string;
  runId: string;
  selectionFile: string;
  supplementalEvidenceLimit: number;
  supplementalEvidencePerSessionLimit: number;
}

export interface Phase72LongMemEvalSemanticLiveModels {
  answer: {
    gateway: string;
    model: string;
    provider: string;
  };
  judge: {
    gateway: string;
    model: string;
    provider: string;
  };
}

export function resolvePhase72LongMemEvalSemanticCaseScope(
  options: Pick<
    Phase72LongMemEvalSemanticLiveOptions,
    "allCases" | "retryReportPath"
  >,
): "execution-failure-retry" | "frozen-selection" | "full-500" {
  if (options.retryReportPath) {
    return "execution-failure-retry";
  }
  return options.allCases ? "full-500" : "frozen-selection";
}

function requiredEnv(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required ${name}.`);
  }
  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

export function parsePhase72LongMemEvalSemanticLiveOptions(
  argv: readonly string[],
  root = process.cwd(),
  cacheRoot = join(homedir(), ".cache", "goodmemory-benchmarks"),
): Phase72LongMemEvalSemanticLiveOptions {
  const allCases = hasCliFlagStrict(argv, "--all-cases");
  const retryReportPath = resolveCliFlagValueStrict(argv, "--retry-report");
  if (allCases && retryReportPath) {
    throw new Error("--all-cases cannot be combined with --retry-report.");
  }
  const runId = resolveCliFlagValueStrict(argv, "--run-id") ??
    (allCases
      ? "run-phase72-longmemeval-semantic-live-full500-v1"
      : "run-phase72-longmemeval-semantic-live-slice-v1");
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });
  return {
    allCases,
    assistedExtraction: hasCliFlagStrict(argv, "--assisted-extraction"),
    benchmarkRoot: resolveCliFlagValueStrict(argv, "--benchmark-root") ??
      join(cacheRoot, "LongMemEval"),
    denseSessionAugmentation: hasCliFlagStrict(
      argv,
      "--dense-session-augmentation",
    ),
    denseSessionAugmentationLimit: parsePositiveInteger(
      resolveCliFlagValueStrict(
        argv,
        "--dense-session-augmentation-limit",
      ) ?? "2",
      "--dense-session-augmentation-limit",
    ),
    maxConcurrency: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--max-concurrency") ?? "40",
      "--max-concurrency",
    ),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir") ??
      join(root, "reports", "eval", "research", "phase-72", "longmemeval"),
    rerank: hasCliFlagStrict(argv, "--rerank"),
    ...(retryReportPath === undefined ? {} : { retryReportPath }),
    runId,
    selectionFile: resolveCliFlagValueStrict(argv, "--selection-file") ??
      join(
        root,
        "scripts",
        "eval-profiles",
        "phase-72",
        "longmemeval-semantic-recall-selection.json",
      ),
    supplementalEvidenceLimit: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--supplemental-evidence-limit") ??
        String(LONGMEMEVAL_DEFAULT_SUPPLEMENTAL_EVIDENCE_LIMIT),
      "--supplemental-evidence-limit",
    ),
    supplementalEvidencePerSessionLimit: parsePositiveInteger(
      resolveCliFlagValueStrict(
        argv,
        "--supplemental-evidence-per-session-limit",
      ) ?? String(LONGMEMEVAL_DEFAULT_SUPPLEMENTAL_EVIDENCE_PER_SESSION_LIMIT),
      "--supplemental-evidence-per-session-limit",
    ),
  };
}

export function collectPhase72LongMemEvalExecutionFailureIds(
  report: LongMemEvalReport,
  expectedBenchmarkFingerprint?: string,
  expectedRunConfiguration?: LongMemEvalRecallRunConfiguration,
): string[] {
  if (
    report.phase !== "phase-62" ||
    report.source?.benchmark !== "LongMemEval"
  ) {
    throw new Error("Phase 72 retry source must be a LongMemEval phase-62 report.");
  }
  if (
    expectedBenchmarkFingerprint !== undefined &&
    report.benchmarkFingerprint !== expectedBenchmarkFingerprint
  ) {
    throw new Error(
      "Phase 72 retry source does not match the frozen LongMemEval dataset.",
    );
  }
  if (
    expectedRunConfiguration !== undefined &&
    !isDeepStrictEqual(report.runConfiguration, expectedRunConfiguration)
  ) {
    throw new Error(
      "Phase 72 retry source run configuration does not match this run.",
    );
  }
  const profile = report.profiles["goodmemory-recommended"];
  if (!profile) {
    throw new Error(
      "Phase 72 retry source is missing goodmemory-recommended.",
    );
  }
  return profile.cases
    .filter((testCase) => testCase.executionError)
    .map((testCase) => testCase.questionId);
}

export function resolvePhase72LongMemEvalSemanticLiveModels(
  env: Record<string, string | undefined>,
): Phase72LongMemEvalSemanticLiveModels {
  const answer = {
    gateway: requiredEnv(env, "GOODMEMORY_EVAL_BASE_URL"),
    model: requiredEnv(env, "GOODMEMORY_EVAL_MODEL"),
    provider: requiredEnv(env, "GOODMEMORY_EVAL_PROVIDER"),
  };
  requiredEnv(env, "GOODMEMORY_EVAL_API_KEY");
  const judge = {
    gateway: requiredEnv(env, "GOODMEMORY_JUDGE_BASE_URL"),
    model: requiredEnv(env, "GOODMEMORY_JUDGE_MODEL"),
    provider: requiredEnv(env, "GOODMEMORY_JUDGE_PROVIDER"),
  };
  requiredEnv(env, "GOODMEMORY_JUDGE_API_KEY");
  if (
    answer.provider !== "openai" ||
    answer.model !== PHASE72_ANSWER_MODEL ||
    answer.gateway !== PHASE72_ANSWER_GATEWAY
  ) {
    throw new Error(
      `Phase 72 LongMemEval answers require ${PHASE72_ANSWER_MODEL} through ${PHASE72_ANSWER_GATEWAY}.`,
    );
  }
  if (
    judge.provider !== "openai" ||
    judge.model !== PHASE72_INDEPENDENT_JUDGE_MODEL ||
    judge.gateway !== PHASE72_ANSWER_GATEWAY
  ) {
    throw new Error(
      `Phase 72 LongMemEval judging requires independent ${PHASE72_INDEPENDENT_JUDGE_MODEL} through ${PHASE72_ANSWER_GATEWAY}.`,
    );
  }
  return { answer, judge };
}

export async function runPhase72LongMemEvalSemanticLive(
  options: Phase72LongMemEvalSemanticLiveOptions,
  env: Record<string, string | undefined> = process.env,
): Promise<LongMemEvalReport> {
  const models = resolvePhase72LongMemEvalSemanticLiveModels(env);
  const selection = await loadPhase72LongMemEvalSemanticSelection(
    options.selectionFile,
  );
  await assertPhase72LongMemEvalFrozenDataset({
    benchmarkRoot: options.benchmarkRoot,
    selection,
  });
  const embedding = resolvePhase72LongMemEvalSemanticEmbedding(env, "provider");
  const extraction = options.assistedExtraction
    ? {
        apiKey: requiredEnv(env, "GOODMEMORY_EVAL_API_KEY"),
        baseURL: models.answer.gateway,
        contextualDescriptors: false,
        mode: "conversational" as const,
        model: models.answer.model,
        provider: "openai" as const,
      }
    : undefined;
  const reranking = options.rerank
    ? {
        apiKey: requiredEnv(env, "GOODMEMORY_EVAL_API_KEY"),
        baseURL: models.answer.gateway,
        model: models.answer.model,
        provider: "openai" as const,
        requestTimeoutMs: resolvePhase62LiveRequestTimeoutMs(env),
      }
    : undefined;
  const runtime = await createPhase72LongMemEvalSemanticMemoryRuntime({
    embedding,
    env,
    ...(extraction === undefined ? {} : { extraction }),
    outputDir: options.outputDir,
    ...(reranking === undefined ? {} : { reranking }),
    runId: options.runId,
  });
  const runConfiguration = {
    ...runtime.runConfiguration,
    ...(options.denseSessionAugmentation
      ? {
          evidenceAugmentation: {
            maxAdditions: options.denseSessionAugmentationLimit,
            strategy: "retrieved-session-dense" as const,
          },
        }
      : {}),
    evidencePack: {
      supplementalEvidenceLimit: options.supplementalEvidenceLimit,
      supplementalEvidencePerSessionLimit:
        options.supplementalEvidencePerSessionLimit,
    },
  } satisfies LongMemEvalRecallRunConfiguration;
  const selectedCaseIds = [
    ...selection.target.questionIds,
    ...selection.protection.questionIds,
  ];
  let retrySource:
    | {
        reportPath: string;
        reportSha256: string;
        runId: string;
      }
    | undefined;
  let caseIds = options.allCases ? undefined : selectedCaseIds;
  if (options.retryReportPath) {
    const raw = await readFile(options.retryReportPath, "utf8");
    const report = JSON.parse(raw) as LongMemEvalReport;
    caseIds = collectPhase72LongMemEvalExecutionFailureIds(
      report,
      selection.benchmarkFingerprint,
      runConfiguration,
    );
    if (caseIds.length === 0) {
      throw new Error("Phase 72 retry source has no execution failures.");
    }
    retrySource = {
      reportPath: options.retryReportPath,
      reportSha256: createHash("sha256").update(raw).digest("hex"),
      runId: report.runId,
    };
  }
  const identityPath = join(
    options.outputDir,
    options.runId,
    "phase72-semantic-live-identity.json",
  );
  await writeFile(identityPath, `${JSON.stringify({
    answer: models.answer,
    benchmarkFingerprint: selection.benchmarkFingerprint,
    caseConcurrency: options.maxConcurrency,
    caseCount: caseIds?.length ?? 500,
    caseIdsSha256: caseIds
      ? createHash("sha256")
          .update(JSON.stringify(caseIds))
          .digest("hex")
      : null,
    caseScope: resolvePhase72LongMemEvalSemanticCaseScope(options),
    embedding: runConfiguration.embedding,
    evidenceAugmentation: runConfiguration.evidenceAugmentation ?? null,
    evidencePack: runConfiguration.evidencePack,
    extraction: runConfiguration.extraction ?? null,
    judge: models.judge,
    reranking: runConfiguration.reranking ?? null,
    runId: options.runId,
    selectionCohorts: {
      protection: selection.protection.questionIds.length,
      target: selection.target.questionIds.length,
    },
    selectionFile: options.selectionFile,
    selectionPurpose: selection.selectionPurpose ?? "semantic-recall",
    selectionSourceReport: selection.sourceReport ?? null,
    ...(retrySource === undefined ? {} : { retrySource }),
  }, null, 2)}\n`);

  return runPhase62LongMemEval({
    benchmarkRoot: options.benchmarkRoot,
    caseIds,
    maxConcurrency: options.maxConcurrency,
    mode: "full",
    outputDir: options.outputDir,
    profiles: ["goodmemory-recommended"],
    runId: options.runId,
  }, {
    createMemory: runtime.createMemory,
    runConfiguration,
    ...(options.denseSessionAugmentation
      ? {
          supplementalEvidenceAugmenter:
            createPhase72LongMemEvalDenseEvidenceAugmenter({
              embeddingAdapter: runtime.embeddingAdapter!,
              maxAdditions: options.denseSessionAugmentationLimit,
            }),
        }
      : {}),
  });
}

if (import.meta.main) {
  const options = parsePhase72LongMemEvalSemanticLiveOptions(Bun.argv);
  console.error(
    `[phase72-longmemeval-live] run=${options.runId} scope=${resolvePhase72LongMemEvalSemanticCaseScope(options)} concurrency=${options.maxConcurrency} extraction=${options.assistedExtraction ? "conversational" : "rules-only"} evidence=${options.supplementalEvidenceLimit}/${options.supplementalEvidencePerSessionLimit} denseAdditions=${options.denseSessionAugmentation ? options.denseSessionAugmentationLimit : 0}`,
  );
  const report = await runPhase72LongMemEvalSemanticLive(options);
  console.log(JSON.stringify({
    runDirectory: report.runDirectory,
    summary: report.profiles["goodmemory-recommended"]?.summary,
  }, null, 2));
}
