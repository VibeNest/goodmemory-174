// Phase 64 MemoryAgentBench smoke adapter + retrieval-focused smoke report.
//
// This runner ingests normalized MemoryAgentBench cases into a fresh GoodMemory
// instance ("inject once"), recalls per question ("query many"), and reports
// retrieval-quality metrics per competency: evidence recall, noise, and stale /
// superseded selection. It mirrors the Phase 63 BEAM recall diagnostic seam:
// deterministic in-memory storage, every source chunk preserved as a retrievable
// fact, and rules-only recall.
//
// By default it runs the synthetic smoke fixtures from src/eval/memoryAgentBench
// (no upstream data is vendored). When --benchmark-root / GOODMEMORY_MAB_ROOT is
// provided it reads prepared, already-normalized cases from <root>/cases.json,
// establishing the external-root convention without copying upstream files into
// the repo.
//
// Answer / task accuracy is intentionally NOT scored here: the deterministic
// smoke slice is retrieval-only, and true answer accuracy needs a live LLM
// generator (a later live mode). The report still carries an `answerAccuracy`
// field per competency, set to null, so the contract is complete and the
// deferral is explicit rather than silent.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemory, RecallResult } from "../src/api/contracts";
import type { EmbeddingAdapter } from "../src/embedding/contracts";
import {
  buildMemoryAgentBenchSmokeCases,
  MEMORY_AGENT_BENCH_COMPETENCIES,
  scoreMemoryAgentBenchAnswer,
  type MemoryAgentBenchCase,
  type MemoryAgentBenchCompetency,
  type MemoryAgentBenchQuestion,
} from "../src/eval/memoryAgentBench";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import {
  requestOpenAICompatibleText,
  withAISDKRetries,
} from "../src/provider/ai-sdk-runtime";
import { resolveLiveModelConfig } from "./run-eval";
import { buildAnswerEvidencePack } from "../src/answer/evidencePack";
import type { EvidenceTurn } from "../src/answer/evidencePack";

export const MEMORY_AGENT_BENCH_SMOKE_RUN_ID =
  "run-phase64-mab-smoke-current";
export const MEMORY_AGENT_BENCH_SMOKE_REPORT_FILE_NAME = "smoke-report.json";
export const MEMORY_AGENT_BENCH_ROOT_ENV = "GOODMEMORY_MAB_ROOT";
const GENERATED_BY = "scripts/run-phase-64-memory-agent-bench-smoke.ts";
const EXTERNAL_CASES_FILE_NAME = "cases.json";
const UPSTREAM_SOURCE = "https://github.com/HUST-AI-HYZ/MemoryAgentBench";
const UPSTREAM_LICENSE = "MIT";
// The smoke slice exercises GoodMemory's rules-only retrieval path only; a live
// generator profile is added later.
const PROFILES_COMPARED = ["goodmemory-rules-only"] as const;

export interface MemoryAgentBenchSmokeCliOptions {
  benchmarkRoot?: string;
  // When true, shape the answer context as the source-ordered evidence pack
  // (current-value resolver) instead of the plain retrieved-chunk list.
  evidencePack?: boolean;
  limit?: number;
  // When true (and no answerGenerator is injected), construct the real LLM
  // generator and run in live-answer mode.
  live?: boolean;
  outputDir?: string;
  runId?: string;
}

// Live-answer seam (mirrors the BEAM live-slice generator). Given the retrieved
// context, produce a candidate answer. Correctness is then scored DETERMINISTI-
// CALLY by the upstream match mode (substring_exact_match / exact_match) via
// scoreMemoryAgentBenchAnswer, so no LLM judge is needed. Wiring a real model is
// deferred ("later"); supplying a generator flips the run into "live-answer"
// mode, otherwise the run stays retrieval-only.
export interface MemoryAgentBenchAnswerGeneratorInput {
  memoryContext: string;
  question: MemoryAgentBenchQuestion;
  retrievedChunkIds: readonly number[];
  testCase: MemoryAgentBenchCase;
}

export type MemoryAgentBenchAnswerGenerator = (
  input: MemoryAgentBenchAnswerGeneratorInput,
) => Promise<string>;

export interface MemoryAgentBenchSmokeDependencies {
  answerGenerator?: MemoryAgentBenchAnswerGenerator;
  createMemory?: () => GoodMemory;
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: typeof writeFile;
}

// Per-question result. Retrieval fields are always populated; answer fields are
// null unless a live-answer generator is supplied.
export interface MemoryAgentBenchQuestionRetrieval {
  // null in retrieval-only mode; true/false once an answer is generated and
  // scored by the upstream match mode.
  answerCorrect: boolean | null;
  caseId: string;
  competency: MemoryAgentBenchCompetency;
  evidenceChunkIds: number[];
  evidenceRecall: number;
  generatedAnswer: string | null;
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceChunkIds: number[];
  noiseChunkCount: number;
  noiseChunkIds: number[];
  questionId: string;
  retrievedChunkIds: number[];
  staleChunkIds: number[];
  staleChunkSelected: boolean;
}

export interface MemoryAgentBenchCompetencyRetrievalSummary {
  // Non-null only for TTL: were the behaviour-policy rules surfaced for every
  // test-time-learning question (the necessary condition for action-policy
  // transfer). Null for competencies where the concept does not apply.
  actionPolicyTransferReady: boolean | null;
  // null in retrieval-only mode; the deterministic answer accuracy (correct /
  // answered) once a live-answer generator is supplied. This is the real
  // conflict-resolution / behaviour-transfer signal — e.g. CR passes when the
  // answer uses the current value, regardless of stale history co-retrieval.
  answerAccuracy: number | null;
  answeredCount: number;
  averageEvidenceRecall: number;
  competency: MemoryAgentBenchCompetency;
  fullyRetrievedCount: number;
  noiseChunkTotal: number;
  questionCount: number;
  staleSelectedCount: number;
}

export interface MemoryAgentBenchSmokeReport {
  answerEvaluation: "deferred-to-live-mode" | "scored";
  benchmark: "memoryagentbench";
  // Resolved case source: "synthetic-smoke" or the external cases.json path.
  benchmarkSource: string;
  caseCount: number;
  cases: MemoryAgentBenchQuestionRetrieval[];
  competencies: MemoryAgentBenchCompetencyRetrievalSummary[];
  executionFailures: number;
  // External root supplied by the caller, or null for the synthetic default.
  externalRoot: string | null;
  generatedAt: string;
  generatedBy: string;
  license: string;
  phase: "phase-64";
  mode: "retrieval-only" | "live-answer";
  profilesCompared: string[];
  questionCount: number;
  runDirectory: string;
  runId: string;
  // The answer/task metric upstream scores each competency with, surfaced so a
  // later live mode applies the matching deterministic check.
  upstreamAnswerMetricByCompetency: Partial<
    Record<MemoryAgentBenchCompetency, string>
  >;
  upstreamSource: string;
}

export function parseMemoryAgentBenchSmokeCliOptions(
  argv: readonly string[],
): MemoryAgentBenchSmokeCliOptions {
  const limitRaw = resolveCliFlagValue(argv, "--limit");
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer.");
  }
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ??
      process.env[MEMORY_AGENT_BENCH_ROOT_ENV],
    evidencePack: argv.includes("--evidence-pack"),
    limit,
    live: argv.includes("--live"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export function buildMemoryAgentBenchScope(input: {
  caseId: string;
  runId: string;
}): { agentId: string; sessionId: string; userId: string; workspaceId: string } {
  return {
    agentId: "phase-64-memory-agent-bench-smoke",
    sessionId: `case-${input.caseId}`,
    userId: `mab:${input.caseId}`,
    workspaceId: `phase-64-mab:${input.runId}`,
  };
}

export async function seedMemoryAgentBenchCase(input: {
  memory: GoodMemory;
  testCase: MemoryAgentBenchCase;
  runId: string;
}): Promise<void> {
  const { chunks } = input.testCase;
  await input.memory.remember({
    annotations: chunks.map((chunk, messageIndex) => ({
      confirmed: true,
      kindHint: "fact" as const,
      messageIndex,
      metadataPatch: {
        attributes: {
          chunkId: chunk.id,
          originalRole: chunk.role,
        },
        category: "external_benchmark",
        tags: ["mab", `chunk_id:${chunk.id}`],
      },
      reason:
        "MemoryAgentBench smoke preserves every source chunk as retrievable evidence.",
      remember: "always" as const,
      verified: true,
    })),
    extractionStrategy: "rules-only",
    // Force user role so rules-only extraction keeps every chunk; the true
    // source role is preserved in attributes and the content prefix.
    messages: chunks.map((chunk) => ({
      content: `[MAB chunk_id=${chunk.id} role=${chunk.role}] ${chunk.content}`,
      role: "user",
    })),
    scope: buildMemoryAgentBenchScope({
      caseId: input.testCase.caseId,
      runId: input.runId,
    }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function collectMemoryAgentBenchChunkIdsFromRecord(
  record: unknown,
): number[] {
  if (!isRecord(record)) {
    return [];
  }
  const ids: number[] = [];
  const collectNumber = (value: unknown): void => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isInteger(parsed)) {
      ids.push(parsed);
    }
  };
  const collectFromText = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    for (const match of value.matchAll(/\bchunk_id[:=](\d+)/gu)) {
      collectNumber(match[1]);
    }
  };

  collectFromText(record.content);
  if (Array.isArray(record.tags)) {
    for (const tag of record.tags) {
      collectFromText(tag);
    }
  }
  if (isRecord(record.attributes)) {
    collectNumber(record.attributes.chunkId);
    collectNumber(record.attributes.chunk_id);
  }
  return ids;
}

export function collectMemoryAgentBenchRetrievedChunkIds(
  recall: RecallResult,
): number[] {
  const recallRecord = recall as unknown as Record<string, unknown>;
  const ids = new Set<number>();
  for (const key of [
    "preferences",
    "references",
    "facts",
    "feedback",
    "archives",
    "evidence",
    "episodes",
  ]) {
    const records = recallRecord[key];
    if (!Array.isArray(records)) {
      continue;
    }
    for (const record of records) {
      for (const id of collectMemoryAgentBenchChunkIdsFromRecord(record)) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

export function scoreMemoryAgentBenchRetrieval(input: {
  question: MemoryAgentBenchQuestion;
  retrievedChunkIds: number[];
  testCase: MemoryAgentBenchCase;
}): MemoryAgentBenchQuestionRetrieval {
  const { question } = input;
  const retrieved = new Set(input.retrievedChunkIds);
  const evidenceHit = question.evidenceChunkIds.filter((id) =>
    retrieved.has(id),
  ).length;
  const evidenceRecall =
    question.evidenceChunkIds.length === 0
      ? 1
      : evidenceHit / question.evidenceChunkIds.length;
  const staleSet = new Set(question.staleChunkIds);
  const evidenceSet = new Set(question.evidenceChunkIds);
  const missingEvidenceChunkIds = question.evidenceChunkIds.filter(
    (id) => !retrieved.has(id),
  );
  // Noise is a retrieved chunk that is neither gold evidence nor a tracked
  // stale/superseded chunk (those are reported separately).
  const noiseChunkIds = input.retrievedChunkIds.filter(
    (id, index, all) =>
      !evidenceSet.has(id) &&
      !staleSet.has(id) &&
      all.indexOf(id) === index,
  );

  return {
    answerCorrect: null,
    caseId: input.testCase.caseId,
    competency: question.competency,
    evidenceChunkIds: question.evidenceChunkIds,
    evidenceRecall,
    generatedAnswer: null,
    goldEvidenceFullyRetrieved: evidenceRecall === 1,
    missingEvidenceChunkIds,
    noiseChunkCount: noiseChunkIds.length,
    noiseChunkIds,
    questionId: question.questionId,
    retrievedChunkIds: input.retrievedChunkIds,
    staleChunkIds: question.staleChunkIds,
    staleChunkSelected: question.staleChunkIds.some((id) => retrieved.has(id)),
  };
}

// Build the answer-generation context from the chunks recall actually surfaced,
// in source order. This is what a live generator (or judge) sees.
export function buildMemoryAgentBenchAnswerContext(input: {
  retrievedChunkIds: readonly number[];
  testCase: MemoryAgentBenchCase;
}): string {
  const retrieved = new Set(input.retrievedChunkIds);
  return input.testCase.chunks
    .filter((chunk) => retrieved.has(chunk.id))
    .map((chunk) => `- chunk_id=${chunk.id} (${chunk.role}): ${chunk.content}`)
    .join("\n");
}

// General answer-time context shaping: reuse the evidence pack so the
// current-value resolver validated on BEAM applies here too. CR co-retrieves the
// stale ($5k) and current ($8k) facts; the pack's "latest entry is the current
// value" framing is what picks the current one. MAB chunks carry no time anchor,
// so this adapter explicitly uses normalized chunk order as the answer-time
// order key.
export function buildMemoryAgentBenchEvidencePackContext(input: {
  question: MemoryAgentBenchQuestion;
  retrievedChunkIds: readonly number[];
  testCase: MemoryAgentBenchCase;
}): string {
  const retrieved = new Set(input.retrievedChunkIds);
  const turns: EvidenceTurn[] = input.testCase.chunks
    .filter((chunk) => retrieved.has(chunk.id))
    .map((chunk) => ({
      content: chunk.content,
      orderKey: chunk.id,
      role: chunk.role,
      sourceId: chunk.id,
      timeAnchor: "",
    }));
  return buildAnswerEvidencePack({
    question: input.question.question,
    turns,
  });
}

const MEMORY_AGENT_BENCH_ANSWER_SYSTEM =
  "You answer questions using only the supplied memory context. Combining or summarizing information that is present in the context is expected; do not state facts that are absent from it.";

export function buildMemoryAgentBenchPrompt(input: {
  memoryContext: string;
  question: string;
}): string {
  return [
    "Memory context:",
    input.memoryContext.trim().length > 0 ? input.memoryContext : "(none)",
    `Question:\n${input.question}`,
    "Answer concisely using only the memory context above. Return only the answer.",
  ].join("\n\n");
}

const MEMORY_AGENT_BENCH_LIVE_REQUEST_TIMEOUT_MS = 120000;

// Real LLM generator (deterministic match-mode scoring downstream, so no judge).
export function createMemoryAgentBenchLiveAnswerGenerator(): MemoryAgentBenchAnswerGenerator {
  const model = resolveLiveModelConfig("GOODMEMORY_EVAL");
  return async (input) =>
    withAISDKRetries(() =>
      requestOpenAICompatibleText({
        model,
        prompt: buildMemoryAgentBenchPrompt({
          memoryContext: input.memoryContext,
          question: input.question.question,
        }),
        system: MEMORY_AGENT_BENCH_ANSWER_SYSTEM,
        timeoutMs: MEMORY_AGENT_BENCH_LIVE_REQUEST_TIMEOUT_MS,
      }),
    );
}

export function summarizeMemoryAgentBenchRetrieval(
  results: readonly MemoryAgentBenchQuestionRetrieval[],
): MemoryAgentBenchCompetencyRetrievalSummary[] {
  return MEMORY_AGENT_BENCH_COMPETENCIES.map((competency) => {
    const bucket = results.filter(
      (result) => result.competency === competency,
    );
    const questionCount = bucket.length;
    const fullyRetrievedCount = bucket.filter(
      (result) => result.goldEvidenceFullyRetrieved,
    ).length;
    const answered = bucket.filter((result) => result.answerCorrect !== null);
    const answeredCount = answered.length;
    return {
      // TTL action-policy transfer needs the taught rule to be retrievable; the
      // retrieval-only smoke reports readiness, not the applied behaviour.
      actionPolicyTransferReady:
        competency === "TTL"
          ? questionCount > 0 && fullyRetrievedCount === questionCount
          : null,
      answerAccuracy:
        answeredCount === 0
          ? null
          : answered.filter((result) => result.answerCorrect === true).length /
            answeredCount,
      answeredCount,
      averageEvidenceRecall:
        questionCount === 0
          ? 0
          : bucket.reduce((sum, result) => sum + result.evidenceRecall, 0) /
            questionCount,
      competency,
      fullyRetrievedCount,
      noiseChunkTotal: bucket.reduce(
        (sum, result) => sum + result.noiseChunkCount,
        0,
      ),
      questionCount,
      staleSelectedCount: bucket.filter((result) => result.staleChunkSelected)
        .length,
    };
  });
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function createSmokeEmbeddingAdapter(): EmbeddingAdapter {
  return {
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => {
        const hash = hashString(text);
        return [hash % 997, (hash >> 3) % 997, (hash >> 7) % 997];
      });
    },
  };
}

export function createMemoryAgentBenchSmokeMemory(): GoodMemory {
  // Deterministic id and clock seams keep repeated smoke runs reproducible:
  // ranking tie-breaks fall back to fact-id and timestamp comparisons.
  let idCounter = 0;
  let clockTick = 0;
  return createGoodMemory({
    adapters: {
      embeddingAdapter: createSmokeEmbeddingAdapter(),
    },
    storage: {
      provider: "memory",
    },
    testing: {
      createId: () => {
        idCounter += 1;
        return `mab-smoke-${String(idCounter).padStart(6, "0")}`;
      },
      now: () => {
        clockTick += 1;
        return new Date(Date.UTC(2026, 0, 1, 0, 0, 0, clockTick));
      },
    },
  });
}

function assertNormalizedCase(value: unknown, index: number): MemoryAgentBenchCase {
  if (
    !isRecord(value) ||
    typeof value.caseId !== "string" ||
    !Array.isArray(value.chunks) ||
    !Array.isArray(value.questions)
  ) {
    throw new Error(
      `MemoryAgentBench external case at index ${index} is not a normalized case (need caseId, chunks[], questions[]).`,
    );
  }
  return value as unknown as MemoryAgentBenchCase;
}

export function deriveUpstreamMetricByCompetency(
  cases: readonly MemoryAgentBenchCase[],
): Partial<Record<MemoryAgentBenchCompetency, string>> {
  const metrics: Partial<Record<MemoryAgentBenchCompetency, string>> = {};
  for (const testCase of cases) {
    for (const question of testCase.questions) {
      metrics[question.competency] = question.matchMode;
    }
  }
  return metrics;
}

export async function loadMemoryAgentBenchCases(input: {
  benchmarkRoot?: string;
  limit?: number;
  readFile: (path: string) => Promise<string>;
}): Promise<{ benchmarkSource: string; cases: MemoryAgentBenchCase[] }> {
  let cases: MemoryAgentBenchCase[];
  let benchmarkSource: string;
  if (input.benchmarkRoot) {
    const path = join(input.benchmarkRoot, EXTERNAL_CASES_FILE_NAME);
    const parsed = JSON.parse(await input.readFile(path)) as unknown;
    const rawCases = isRecord(parsed) ? parsed.cases : parsed;
    if (!Array.isArray(rawCases)) {
      throw new Error(
        `MemoryAgentBench external root ${path} must contain a cases array (or {cases: [...]}).`,
      );
    }
    cases = rawCases.map((value, index) => assertNormalizedCase(value, index));
    benchmarkSource = path;
  } else {
    cases = buildMemoryAgentBenchSmokeCases();
    benchmarkSource = "synthetic-smoke";
  }
  if (input.limit !== undefined) {
    cases = cases.slice(0, input.limit);
  }
  return { benchmarkSource, cases };
}

export async function runMemoryAgentBenchSmoke(
  options: MemoryAgentBenchSmokeCliOptions = {},
  dependencies: MemoryAgentBenchSmokeDependencies = {},
): Promise<MemoryAgentBenchSmokeReport> {
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const now = dependencies.now ?? (() => new Date());
  const createMemory =
    dependencies.createMemory ?? createMemoryAgentBenchSmokeMemory;
  const runId = options.runId ?? MEMORY_AGENT_BENCH_SMOKE_RUN_ID;
  const outputDir =
    options.outputDir ??
    join(repoRoot, "reports", "eval", "research", "phase-64", "mab");
  const runDirectory = join(outputDir, runId);

  const { benchmarkSource, cases } = await loadMemoryAgentBenchCases({
    benchmarkRoot: options.benchmarkRoot,
    limit: options.limit,
    readFile: readFileImpl,
  });

  const answerGenerator =
    dependencies.answerGenerator ??
    (options.live ? createMemoryAgentBenchLiveAnswerGenerator() : undefined);

  const results: MemoryAgentBenchQuestionRetrieval[] = [];
  let executionFailures = 0;
  for (const testCase of cases) {
    const memory = createMemory();
    const scope = buildMemoryAgentBenchScope({
      caseId: testCase.caseId,
      runId,
    });
    try {
      await seedMemoryAgentBenchCase({ memory, runId, testCase });
    } catch {
      executionFailures += testCase.questions.length;
      continue;
    }
    for (const question of testCase.questions) {
      try {
        const recall = await memory.recall({
          query: question.question,
          scope,
          strategy: "rules-only",
        });
        const retrievedChunkIds =
          collectMemoryAgentBenchRetrievedChunkIds(recall);
        const retrieval = scoreMemoryAgentBenchRetrieval({
          question,
          retrievedChunkIds,
          testCase,
        });
        if (answerGenerator) {
          const memoryContext = options.evidencePack
            ? buildMemoryAgentBenchEvidencePackContext({
                question,
                retrievedChunkIds,
                testCase,
              })
            : buildMemoryAgentBenchAnswerContext({
                retrievedChunkIds,
                testCase,
              });
          const generatedAnswer = await answerGenerator({
            memoryContext,
            question,
            retrievedChunkIds,
            testCase,
          });
          results.push({
            ...retrieval,
            answerCorrect: scoreMemoryAgentBenchAnswer({
              answer: generatedAnswer,
              goldAnswer: question.goldAnswer,
              matchMode: question.matchMode,
            }),
            generatedAnswer,
          });
        } else {
          results.push(retrieval);
        }
      } catch {
        executionFailures += 1;
      }
    }
  }
  const liveAnswer = answerGenerator !== undefined;

  const report: MemoryAgentBenchSmokeReport = {
    answerEvaluation: liveAnswer ? "scored" : "deferred-to-live-mode",
    benchmark: "memoryagentbench",
    benchmarkSource,
    caseCount: cases.length,
    cases: results,
    competencies: summarizeMemoryAgentBenchRetrieval(results),
    executionFailures,
    externalRoot: options.benchmarkRoot ?? null,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    license: UPSTREAM_LICENSE,
    mode: liveAnswer ? "live-answer" : "retrieval-only",
    phase: "phase-64",
    profilesCompared: [...PROFILES_COMPARED],
    questionCount: results.length,
    runDirectory,
    runId,
    upstreamAnswerMetricByCompetency: deriveUpstreamMetricByCompetency(cases),
    upstreamSource: UPSTREAM_SOURCE,
  };

  await mkdirImpl(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, MEMORY_AGENT_BENCH_SMOKE_REPORT_FILE_NAME),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function buildCliSummary(report: MemoryAgentBenchSmokeReport): {
  benchmarkSource: string;
  competencies: MemoryAgentBenchCompetencyRetrievalSummary[];
  executionFailures: number;
  questionCount: number;
  reportPath: string;
  runId: string;
} {
  return {
    benchmarkSource: report.benchmarkSource,
    competencies: report.competencies,
    executionFailures: report.executionFailures,
    questionCount: report.questionCount,
    reportPath: join(
      report.runDirectory,
      MEMORY_AGENT_BENCH_SMOKE_REPORT_FILE_NAME,
    ),
    runId: report.runId,
  };
}

if (import.meta.main) {
  const options = parseMemoryAgentBenchSmokeCliOptions(process.argv);
  runMemoryAgentBenchSmoke(options)
    .then((report) => {
      process.stdout.write(
        `${JSON.stringify(buildCliSummary(report), null, 2)}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `MemoryAgentBench smoke run failed: ${String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
