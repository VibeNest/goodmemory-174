import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type {
  GoodMemory,
  GoodMemoryRerankingProviderConfig,
  RecallResult,
} from "../src/api/contracts";
import type { LocomoCase, LocomoQuestion } from "../src/eval/locomo";
import {
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
  resolveEnvValueStrict,
} from "./cli-options";
import {
  PHASE70_LOCOMO_BENCHMARK_FINGERPRINT,
  PHASE70_RERANKER_GATEWAY,
  PHASE70_RERANKER_MODEL,
  PHASE70_RERANKER_REQUEST_TIMEOUT_MS,
  collectPacketTurnIds,
  evaluatePhase70RerankerGate,
  summarizePhase70RerankerRows,
} from "./phase-70-reranker-contracts";
import type {
  Phase70FallbackProof,
  Phase70GateResult,
  Phase70RerankerEvalReport,
  Phase70RerankerRow,
} from "./phase-70-reranker-contracts";
import {
  buildLocomoScope,
  collectLocomoRetrievedTurnIds,
  createLocomoSmokeMemory,
  loadLocomoCases,
  scoreLocomoRetrieval,
  seedLocomoCase,
} from "./run-phase-65-locomo-smoke";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export {
  PHASE70_LOCOMO_BENCHMARK_FINGERPRINT,
  PHASE70_RERANKER_GATEWAY,
  PHASE70_RERANKER_MODEL,
  PHASE70_RERANKER_REQUEST_TIMEOUT_MS,
  collectPacketTurnIds,
  evaluatePhase70RerankerGate,
  summarizePhase70RerankerRows,
};
export type {
  Phase70FallbackProof,
  Phase70GateResult,
  Phase70RerankerEvalReport,
  Phase70RerankerRow,
};

const PHASE70_DEFAULT_RUN_ID = "run-phase70-reranker-focused-current";
const PHASE70_REPORT_FILE_NAME = "reranker-eval.json";
const PHASE70_MAX_FOCUSED_QUESTIONS = 64;

interface Phase70SelectionManifest {
  benchmarkFingerprint: string;
  protectionQuestionIds: string[];
  schemaVersion: 1;
  targetQuestionIds: string[];
}

export interface Phase70RerankerEvalOptions {
  benchmarkRoot: string;
  outputDir?: string;
  runId?: string;
  selectionManifest: string;
}

export interface Phase70RerankerEvalDependencies {
  createMemory?: (input: {
    providerRerankingConfig?: GoodMemoryRerankingProviderConfig;
  }) => GoodMemory;
  env?: NodeJS.ProcessEnv;
  loadCases?: typeof loadLocomoCases;
  log?: (message: string) => void;
  mkdir?: (path: string) => Promise<void>;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, data: string) => Promise<void>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRequiredEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name];
  if (!value || value.trim() !== value || value.length === 0) {
    throw new Error(`${name} must be set to one non-empty, unpadded value.`);
  }
  return value;
}

export function resolvePhase70RerankerModel(
  env: NodeJS.ProcessEnv,
): GoodMemoryRerankingProviderConfig {
  const provider = normalizedRequiredEnv(env, "GOODMEMORY_RERANKING_PROVIDER");
  const model = normalizedRequiredEnv(env, "GOODMEMORY_RERANKING_MODEL");
  const apiKey = normalizedRequiredEnv(env, "GOODMEMORY_RERANKING_API_KEY");
  const baseURL = normalizedRequiredEnv(env, "GOODMEMORY_RERANKING_BASE_URL")
    .replace(/\/+$/u, "");
  if (provider !== "openai") {
    throw new Error("Phase 70 reranking provider must be openai-compatible.");
  }
  if (model !== PHASE70_RERANKER_MODEL) {
    throw new Error(`Phase 70 reranking model must be ${PHASE70_RERANKER_MODEL}.`);
  }
  if (baseURL !== PHASE70_RERANKER_GATEWAY) {
    throw new Error(
      `Phase 70 reranking gateway must be ${PHASE70_RERANKER_GATEWAY}.`,
    );
  }
  return {
    apiKey,
    baseURL,
    model,
    provider,
    requestTimeoutMs: PHASE70_RERANKER_REQUEST_TIMEOUT_MS,
  };
}

function readStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.trim() === entry,
    )
  ) {
    throw new Error(`${label} must be a non-empty array of unpadded strings.`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${label} contains duplicate question ids.`);
  }
  return value;
}

export function parsePhase70SelectionManifest(
  raw: string,
): Phase70SelectionManifest {
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (value.schemaVersion !== 1) {
    throw new Error("Phase 70 selection manifest schemaVersion must be 1.");
  }
  if (value.benchmarkFingerprint !== PHASE70_LOCOMO_BENCHMARK_FINGERPRINT) {
    throw new Error("Phase 70 selection manifest benchmark fingerprint is invalid.");
  }
  const targetQuestionIds = readStringArray(
    value.targetQuestionIds,
    "targetQuestionIds",
  );
  const protectionQuestionIds = readStringArray(
    value.protectionQuestionIds,
    "protectionQuestionIds",
  );
  const targetSet = new Set(targetQuestionIds);
  const overlap = protectionQuestionIds.find((id) => targetSet.has(id));
  if (overlap) {
    throw new Error(`Phase 70 selection cohorts overlap at ${overlap}.`);
  }
  if (
    targetQuestionIds.length + protectionQuestionIds.length >
    PHASE70_MAX_FOCUSED_QUESTIONS
  ) {
    throw new Error(
      `Phase 70 focused selection cannot exceed ${PHASE70_MAX_FOCUSED_QUESTIONS} questions.`,
    );
  }
  return {
    benchmarkFingerprint: PHASE70_LOCOMO_BENCHMARK_FINGERPRINT,
    protectionQuestionIds,
    schemaVersion: 1,
    targetQuestionIds,
  };
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return (
    leftSorted.length === rightSorted.length &&
    leftSorted.every((value, index) => value === rightSorted[index])
  );
}

function contextMetrics(
  recall: RecallResult,
  question: LocomoQuestion,
  testCase: LocomoCase,
) {
  const contextTurnIds = collectPacketTurnIds(recall.packet);
  const scored = scoreLocomoRetrieval({
    question,
    retrievedTurnIds: contextTurnIds,
    testCase,
  });
  return {
    contextTurnIds,
    evidenceRecall: scored.evidenceRecall,
    noiseTurnCount: scored.noiseTurnCount,
  };
}

async function seedPair(input: {
  baseline: GoodMemory;
  candidate: GoodMemory;
  runId: string;
  testCase: LocomoCase;
}): Promise<void> {
  await Promise.all(
    [input.baseline, input.candidate].map((memory) =>
      seedLocomoCase({
        labelFreeIngest: true,
        memory,
        runId: input.runId,
        testCase: input.testCase,
      }),
    ),
  );
}

export async function runPhase70RerankerEval(
  options: Phase70RerankerEvalOptions,
  dependencies: Phase70RerankerEvalDependencies = {},
): Promise<Phase70RerankerEvalReport> {
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const mkdirImpl =
    dependencies.mkdir ??
    (async (path: string) => {
      await mkdir(path, { recursive: true });
    });
  const loadCases = dependencies.loadCases ?? loadLocomoCases;
  const log = dependencies.log ?? ((message: string) => {
    process.stderr.write(`${message}\n`);
  });
  const now = dependencies.now ?? (() => new Date());
  const env = dependencies.env ?? process.env;
  const model = resolvePhase70RerankerModel(env);
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const manifestPath = resolve(options.selectionManifest);
  const manifestRaw = await readFileImpl(manifestPath);
  const manifest = parsePhase70SelectionManifest(manifestRaw);
  const questionIds = [
    ...manifest.targetQuestionIds,
    ...manifest.protectionQuestionIds,
  ];
  const loaded = await loadCases({
    benchmarkRoot: options.benchmarkRoot,
    questionIds,
    readFile: readFileImpl,
  });
  if (loaded.benchmarkFingerprint !== manifest.benchmarkFingerprint) {
    throw new Error("LoCoMo source does not match the Phase 70 selection manifest.");
  }

  const createMemory =
    dependencies.createMemory ??
    ((input: { providerRerankingConfig?: GoodMemoryRerankingProviderConfig }) =>
      createLocomoSmokeMemory({
        generalizedFusion: true,
        providerRerankingConfig: input.providerRerankingConfig,
        providerRerankingStrategy: "pointwise",
      }));
  const targetIds = new Set(manifest.targetQuestionIds);
  const rows: Phase70RerankerRow[] = [];
  const runId = options.runId ?? PHASE70_DEFAULT_RUN_ID;

  for (const testCase of loaded.cases) {
    const baseline = createMemory({});
    const candidate = createMemory({ providerRerankingConfig: model });
    await seedPair({ baseline, candidate, runId, testCase });
    const scope = buildLocomoScope({ caseId: testCase.caseId, runId });
    for (const question of testCase.questions) {
      const [baselineRecall, candidateRecall] = await Promise.all([
        baseline.recall({ query: question.question, scope, strategy: "hybrid" }),
        candidate.recall({ query: question.question, scope, strategy: "hybrid" }),
      ]);
      const trace = candidateRecall.metadata.retrievalTrace?.reranker;
      if (!trace) {
        throw new Error(
          `Missing reranker trace for ${testCase.caseId}:${question.questionId}.`,
        );
      }
      if (trace.status !== "applied") {
        throw new Error(
          `Phase 70 provider reranking ${trace.status} for ${testCase.caseId}:${question.questionId}; stopping the focused run.`,
        );
      }
      rows.push({
        baseline: contextMetrics(baselineRecall, question, testCase),
        candidate: contextMetrics(candidateRecall, question, testCase),
        caseId: testCase.caseId,
        category: question.category,
        cohort: targetIds.has(question.questionId) ? "target" : "protection",
        evidenceTurnIds: [...question.evidenceTurnIds],
        membershipUnchanged: sameMembers(
          collectLocomoRetrievedTurnIds(baselineRecall),
          collectLocomoRetrievedTurnIds(candidateRecall),
        ),
        questionId: question.questionId,
        reranker: {
          candidateCount: trace.candidateCount,
          ...(trace.fallbackReason ? { fallbackReason: trace.fallbackReason } : {}),
          latencyMs: trace.latencyMs,
          scoreCount: trace.scores.length,
          status: trace.status,
        },
      });
      log(
        `[phase70-reranker] ${rows.length}/${questionIds.length} ${testCase.caseId}:${question.questionId} status=${trace.status} candidates=${trace.candidateCount} latencyMs=${trace.latencyMs}`,
      );
    }
  }

  const outputDir =
    options.outputDir ??
    join(repoRoot, "reports", "eval", "research", "phase-70", "locomo");
  const runDirectory = join(outputDir, runId);
  const report: Phase70RerankerEvalReport = {
    benchmark: "locomo",
    benchmarkFingerprint: loaded.benchmarkFingerprint,
    benchmarkSource: relative(
      resolve(options.benchmarkRoot),
      resolve(loaded.benchmarkSource),
    ),
    executionFailures: 0,
    generatedAt: now().toISOString(),
    metric: "memory-packet-top-6",
    model: {
      gateway: model.baseURL!,
      model: model.model,
      provider: "openai",
      requestTimeoutMs: model.requestTimeoutMs!,
      role: "reranker",
    },
    rows,
    runId,
    selection: {
      manifestPath: relative(repoRoot, manifestPath),
      manifestSha256: sha256(manifestRaw),
      protectionCount: manifest.protectionQuestionIds.length,
      targetCount: manifest.targetQuestionIds.length,
    },
    summary: summarizePhase70RerankerRows(rows),
  };
  await mkdirImpl(runDirectory);
  await writeFileImpl(
    join(runDirectory, PHASE70_REPORT_FILE_NAME),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

export function parsePhase70RerankerEvalOptions(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Phase70RerankerEvalOptions {
  const benchmarkRoot =
    resolveCliFlagValueStrict(argv, "--benchmark-root") ??
    resolveEnvValueStrict(env, "GOODMEMORY_LOCOMO_ROOT");
  const selectionManifest = resolveCliFlagValueStrict(
    argv,
    "--selection-manifest",
  );
  if (!benchmarkRoot || !selectionManifest) {
    throw new Error("--benchmark-root and --selection-manifest are required.");
  }
  return {
    benchmarkRoot,
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
    selectionManifest,
  };
}

if (import.meta.main) {
  const report = await runPhase70RerankerEval(
    parsePhase70RerankerEvalOptions(process.argv),
  );
  process.stdout.write(
    `${JSON.stringify({
      executionFailures: report.executionFailures,
      model: report.model,
      runId: report.runId,
      selection: report.selection,
      summary: report.summary,
    }, null, 2)}\n`,
  );
}
