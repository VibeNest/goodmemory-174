// Phase 65 LoCoMo smoke adapter + retrieval-focused smoke report.
//
// This runner ingests normalized LoCoMo cases into a fresh GoodMemory instance
// (the multi-session conversation), recalls per question, and reports
// retrieval-quality metrics per QA category: evidence-turn recall, noise, and
// (for multi-hop) cross-session chain completeness. It mirrors the Phase 63 BEAM
// and Phase 64 MemoryAgentBench recall-diagnostic seams: deterministic in-memory
// storage, every dialog turn preserved as a retrievable fact, and rules-only
// recall.
//
// By default it runs the synthetic smoke fixtures from src/eval/locomo (no
// upstream data is vendored — LoCoMo is CC BY-NC 4.0, non-commercial). When
// --benchmark-root / GOODMEMORY_LOCOMO_ROOT is provided it reads prepared,
// already-normalized cases from <root>/cases.json, establishing the external-root
// convention without copying upstream files into the repo.
//
// Answer / task accuracy is intentionally NOT scored by default: the
// deterministic smoke slice is retrieval-only, and true answer accuracy needs a
// live LLM generator (a later live mode). The report still carries an
// `answerAccuracy` field per category, set to null, so the contract is complete
// and the deferral is explicit rather than silent.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemory, RecallResult } from "../src/api/contracts";
import type { EmbeddingAdapter } from "../src/embedding/contracts";
import {
  buildLocomoSmokeCases,
  LOCOMO_QA_CATEGORIES,
  parseLocomoSession,
  scoreLocomoAnswer,
  type LocomoCase,
  type LocomoQaCategory,
  type LocomoQuestion,
  type LocomoTurn,
} from "../src/eval/locomo";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";
import {
  requestOpenAICompatibleText,
  withAISDKRetries,
} from "../src/provider/ai-sdk-runtime";
import { resolveLiveModelConfig } from "./run-eval";
import { buildAnswerEvidencePack } from "../src/answer/evidencePack";
import type { EvidenceTurn } from "../src/answer/evidencePack";
import { createProviderConversationalMemoryExtractor } from "../src/provider/layer";
import type { MemoryExtractor } from "../src/remember/candidates";

export const LOCOMO_SMOKE_RUN_ID = "run-phase65-locomo-smoke-current";
export const LOCOMO_SMOKE_REPORT_FILE_NAME = "smoke-report.json";
export const LOCOMO_ROOT_ENV = "GOODMEMORY_LOCOMO_ROOT";
const GENERATED_BY = "scripts/run-phase-65-locomo-smoke.ts";
const EXTERNAL_CASES_FILE_NAME = "cases.json";
const UPSTREAM_SOURCE = "https://github.com/snap-research/locomo";
const UPSTREAM_LICENSE = "CC BY-NC 4.0";
// The smoke slice exercises GoodMemory's rules-only retrieval path only; a live
// generator profile is added later.
const PROFILES_COMPARED = ["goodmemory-rules-only"] as const;

export interface LocomoSmokeCliOptions {
  benchmarkRoot?: string;
  // Opt-in: seed memory with LLM conversational atomic-fact extraction instead of
  // raw dialogue turns (improvement-plan #3). Requires GOODMEMORY_EVAL_* model env.
  conversationalExtraction?: boolean;
  evidencePack?: boolean;
  limit?: number;
  live?: boolean;
  outputDir?: string;
  runId?: string;
}

// Live-answer seam (mirrors the BEAM live-slice / Phase 64 generator). Given the
// retrieved context, produce a candidate answer. Correctness is then scored
// DETERMINISTICALLY by the upstream match mode (token-F1 / adversarial
// abstention) via scoreLocomoAnswer, so no LLM judge is needed. Wiring a real
// model is deferred ("later"); supplying a generator flips the run into
// "live-answer" mode, otherwise the run stays retrieval-only.
export interface LocomoAnswerGeneratorInput {
  memoryContext: string;
  question: LocomoQuestion;
  retrievedTurnIds: readonly string[];
  testCase: LocomoCase;
}

export type LocomoAnswerGenerator = (
  input: LocomoAnswerGeneratorInput,
) => Promise<string>;

export interface LocomoSmokeDependencies {
  answerGenerator?: LocomoAnswerGenerator;
  // Injected conversational extractor (tests pass a deterministic mock; the live
  // run builds a gpt-5.5-backed one from GOODMEMORY_EVAL_* when --conversational-
  // extraction is set).
  conversationalExtractor?: MemoryExtractor;
  createMemory?: () => GoodMemory;
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: typeof writeFile;
}

// Per-question result. Retrieval fields are always populated; answer fields are
// null unless a live-answer generator is supplied.
export interface LocomoQuestionRetrieval {
  // null in retrieval-only mode; true/false once an answer is generated and
  // scored by the upstream match mode.
  answerCorrect: boolean | null;
  caseId: string;
  category: LocomoQaCategory;
  evidenceRecall: number;
  evidenceTurnIds: string[];
  generatedAnswer: string | null;
  goldEvidenceFullyRetrieved: boolean;
  missingEvidenceTurnIds: string[];
  noiseTurnCount: number;
  noiseTurnIds: string[];
  questionId: string;
  retrievedTurnIds: string[];
}

export interface LocomoCategoryRetrievalSummary {
  // null in retrieval-only mode; the deterministic answer accuracy (correct /
  // answered) once a live-answer generator is supplied.
  answerAccuracy: number | null;
  answeredCount: number;
  averageEvidenceRecall: number;
  category: LocomoQaCategory;
  // Non-null only for multi_hop: were ALL evidence turns retrieved for every
  // multi-hop question (the necessary condition for cross-session composition).
  // Null for categories where the concept does not apply.
  crossSessionChainReady: boolean | null;
  fullyRetrievedCount: number;
  noiseTurnTotal: number;
  questionCount: number;
}

export interface LocomoSmokeReport {
  answerEvaluation: "deferred-to-live-mode" | "scored";
  benchmark: "locomo";
  // Resolved case source: "synthetic-smoke" or the external cases.json path.
  benchmarkSource: string;
  caseCount: number;
  cases: LocomoQuestionRetrieval[];
  categories: LocomoCategoryRetrievalSummary[];
  executionFailures: number;
  // External root supplied by the caller, or null for the synthetic default.
  externalRoot: string | null;
  generatedAt: string;
  generatedBy: string;
  // How memory was seeded: raw dialogue turns only, or raw turns PLUS additive
  // LLM conversational atomic-fact extraction (improvement-plan #3, opt-in via
  // --conversational-extraction). The conversational mode is never destructive:
  // normalized facts augment the raw turns, they do not replace them.
  ingestMode: "raw-turns" | "conversational-extraction";
  license: string;
  mode: "retrieval-only" | "live-answer";
  phase: "phase-65";
  profilesCompared: string[];
  questionCount: number;
  runDirectory: string;
  runId: string;
  // The answer/task metric upstream scores each category with, surfaced so a
  // later live mode applies the matching deterministic check.
  upstreamAnswerMetricByCategory: Partial<Record<LocomoQaCategory, string>>;
  upstreamSource: string;
}

export function parseLocomoSmokeCliOptions(
  argv: readonly string[],
): LocomoSmokeCliOptions {
  const limitRaw = resolveCliFlagValue(argv, "--limit");
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer.");
  }
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ??
      process.env[LOCOMO_ROOT_ENV],
    conversationalExtraction: argv.includes("--conversational-extraction"),
    evidencePack: argv.includes("--evidence-pack"),
    limit,
    live: argv.includes("--live"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export function buildLocomoScope(input: {
  caseId: string;
  runId: string;
}): { agentId: string; sessionId: string; userId: string; workspaceId: string } {
  return {
    agentId: "phase-65-locomo-smoke",
    sessionId: `case-${input.caseId}`,
    userId: `locomo:${input.caseId}`,
    workspaceId: `phase-65-locomo:${input.runId}`,
  };
}

export async function seedLocomoCase(input: {
  memory: GoodMemory;
  runId: string;
  testCase: LocomoCase;
}): Promise<void> {
  const { turns } = input.testCase;
  await input.memory.remember({
    annotations: turns.map((turn, messageIndex) => ({
      confirmed: true,
      kindHint: "fact" as const,
      messageIndex,
      metadataPatch: {
        attributes: {
          diaId: turn.diaId,
          speaker: turn.speaker,
        },
        category: "external_benchmark",
        tags: ["locomo", `dia_id:${turn.diaId}`],
      },
      reason:
        "LoCoMo smoke preserves every dialog turn as retrievable evidence.",
      remember: "always" as const,
      verified: true,
    })),
    extractionStrategy: "rules-only",
    // Force user role so rules-only extraction keeps every turn; the true
    // speaker is preserved in attributes and the content prefix.
    messages: turns.map((turn) => ({
      content: `[LOCOMO dia_id=${turn.diaId} speaker=${turn.speaker}] ${turn.content}`,
      role: "user",
    })),
    scope: buildLocomoScope({
      caseId: input.testCase.caseId,
      runId: input.runId,
    }),
  });
}

// Conversational atomic-fact ingest (improvement-plan #3). Instead of storing raw
// dialogue turns, decompose each session into self-contained, coreference-resolved,
// entity/date-normalized atomic claims via the injected LLM extractor and store
// those as the retrievable unit, preserving each fact's source dia_id so the SAME
// evidence-turn recall metric (scoreLocomoRetrieval) applies unchanged. Sessions
// are extracted independently to preserve within-session coreference context.
// Opt-in; only used when --conversational-extraction is set.
export async function seedLocomoCaseConversational(input: {
  extractor: MemoryExtractor;
  memory: GoodMemory;
  runId: string;
  testCase: LocomoCase;
}): Promise<void> {
  const scope = buildLocomoScope({
    caseId: input.testCase.caseId,
    runId: input.runId,
  });
  const sessions = new Map<string, LocomoTurn[]>();
  for (const turn of input.testCase.turns) {
    const sessionKey = turn.diaId.split(":")[0] ?? turn.diaId;
    const list = sessions.get(sessionKey) ?? [];
    list.push(turn);
    sessions.set(sessionKey, list);
  }
  for (const sessionTurns of sessions.values()) {
    const extraction = await input.extractor.extract({
      scope,
      messages: sessionTurns.map((turn) => ({
        content: `${turn.speaker}: ${turn.content}`,
        role: "user",
      })),
    });
    const facts = extraction.candidates.filter(
      (candidate) => candidate.kindHint !== "noise",
    );
    if (facts.length === 0) {
      continue;
    }
    const resolveTurn = (index: number): LocomoTurn =>
      sessionTurns[Math.max(0, Math.min(index, sessionTurns.length - 1))]!;
    await input.memory.remember({
      annotations: facts.map((fact, messageIndex) => {
        const turn = resolveTurn(fact.sourceMessageIndex);
        return {
          confirmed: true,
          kindHint: "fact" as const,
          messageIndex,
          metadataPatch: {
            attributes: { diaId: turn.diaId, speaker: turn.speaker },
            category: "external_benchmark",
            tags: ["locomo", `dia_id:${turn.diaId}`],
          },
          reason:
            "LoCoMo conversational atomic-fact extraction preserves source dia_id provenance.",
          remember: "always" as const,
          verified: true,
        };
      }),
      extractionStrategy: "rules-only",
      messages: facts.map((fact) => {
        const turn = resolveTurn(fact.sourceMessageIndex);
        return {
          content: `[LOCOMO dia_id=${turn.diaId} speaker=${turn.speaker}] ${fact.content}`,
          role: "user",
        };
      }),
      scope,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function collectLocomoTurnIdsFromRecord(record: unknown): string[] {
  if (!isRecord(record)) {
    return [];
  }
  const ids: string[] = [];
  const collectFromText = (value: unknown): void => {
    if (typeof value !== "string") {
      return;
    }
    for (const match of value.matchAll(/\bdia_id[:=](D\d+:\d+)/gu)) {
      const id = match[1];
      if (id !== undefined) {
        ids.push(id);
      }
    }
  };

  collectFromText(record.content);
  if (Array.isArray(record.tags)) {
    for (const tag of record.tags) {
      collectFromText(tag);
    }
  }
  if (isRecord(record.attributes)) {
    const { diaId, dia_id: snakeDiaId } = record.attributes;
    if (typeof diaId === "string") {
      ids.push(diaId);
    }
    if (typeof snakeDiaId === "string") {
      ids.push(snakeDiaId);
    }
  }
  return ids;
}

export function collectLocomoRetrievedTurnIds(recall: RecallResult): string[] {
  const recallRecord = recall as unknown as Record<string, unknown>;
  const ids = new Set<string>();
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
      for (const id of collectLocomoTurnIdsFromRecord(record)) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

export function scoreLocomoRetrieval(input: {
  question: LocomoQuestion;
  retrievedTurnIds: string[];
  testCase: LocomoCase;
}): LocomoQuestionRetrieval {
  const { question } = input;
  const retrieved = new Set(input.retrievedTurnIds);
  const evidenceHit = question.evidenceTurnIds.filter((id) =>
    retrieved.has(id),
  ).length;
  const evidenceRecall =
    question.evidenceTurnIds.length === 0
      ? 1
      : evidenceHit / question.evidenceTurnIds.length;
  const evidenceSet = new Set(question.evidenceTurnIds);
  const missingEvidenceTurnIds = question.evidenceTurnIds.filter(
    (id) => !retrieved.has(id),
  );
  // Noise is a retrieved turn that is not gold evidence for this question.
  const noiseTurnIds = input.retrievedTurnIds.filter(
    (id, index, all) => !evidenceSet.has(id) && all.indexOf(id) === index,
  );

  return {
    answerCorrect: null,
    caseId: input.testCase.caseId,
    category: question.category,
    evidenceRecall,
    evidenceTurnIds: question.evidenceTurnIds,
    generatedAnswer: null,
    goldEvidenceFullyRetrieved: evidenceRecall === 1,
    missingEvidenceTurnIds,
    noiseTurnCount: noiseTurnIds.length,
    noiseTurnIds,
    questionId: question.questionId,
    retrievedTurnIds: input.retrievedTurnIds,
  };
}

// Build the answer-generation context from the turns recall actually surfaced,
// in source order. This is what a live generator (or judge) sees.
export function buildLocomoAnswerContext(input: {
  retrievedTurnIds: readonly string[];
  testCase: LocomoCase;
}): string {
  const retrieved = new Set(input.retrievedTurnIds);
  return input.testCase.turns
    .filter((turn) => retrieved.has(turn.diaId))
    .map((turn) => `- dia_id=${turn.diaId} (${turn.speaker}): ${turn.content}`)
    .join("\n");
}

// Evidence-pack variant of the answer context. LoCoMo turns carry no wall-clock
// timestamp, so the answer-time order key is the turn's position in the
// conversation and the time anchor is its 1-based session index (sessions run in
// chronological order upstream). The shared pack then applies the same
// operation-framing + current-value resolution validated on BEAM and MAB, with
// no LoCoMo-specific tuning.
export function buildLocomoEvidencePackContext(input: {
  question: LocomoQuestion;
  retrievedTurnIds: readonly string[];
  testCase: LocomoCase;
}): string {
  const retrieved = new Set(input.retrievedTurnIds);
  const turns: EvidenceTurn[] = input.testCase.turns
    .map((turn, index) => ({ index, turn }))
    .filter(({ turn }) => retrieved.has(turn.diaId))
    .map(({ index, turn }) => ({
      content: turn.content,
      orderKey: index,
      role: turn.speaker,
      sourceId: turn.diaId,
      timeAnchor: `session ${parseLocomoSession(turn.diaId)}`,
    }));
  return buildAnswerEvidencePack({
    question: input.question.question,
    turns,
  });
}

const LOCOMO_ANSWER_SYSTEM =
  "You answer questions about a long multi-session conversation using only the supplied dialog context. Combining facts across sessions is expected. Answer with the shortest phrase that is correct; if the answer is not present in the context, say you do not know rather than guessing.";

export function buildLocomoPrompt(input: {
  memoryContext: string;
  question: string;
}): string {
  return [
    "Dialog context:",
    input.memoryContext.trim().length > 0 ? input.memoryContext : "(none)",
    `Question:\n${input.question}`,
    "Answer concisely using only the dialog context above. Return only the answer.",
  ].join("\n\n");
}

const LOCOMO_LIVE_REQUEST_TIMEOUT_MS = 120000;

// Real LLM generator (deterministic token-F1 / exact / adversarial scoring
// downstream, so no judge).
export function createLocomoLiveAnswerGenerator(): LocomoAnswerGenerator {
  const model = resolveLiveModelConfig("GOODMEMORY_EVAL");
  return async (input) =>
    withAISDKRetries(() =>
      requestOpenAICompatibleText({
        model,
        prompt: buildLocomoPrompt({
          memoryContext: input.memoryContext,
          question: input.question.question,
        }),
        system: LOCOMO_ANSWER_SYSTEM,
        timeoutMs: LOCOMO_LIVE_REQUEST_TIMEOUT_MS,
      }),
    );
}

export function summarizeLocomoRetrieval(
  results: readonly LocomoQuestionRetrieval[],
): LocomoCategoryRetrievalSummary[] {
  return LOCOMO_QA_CATEGORIES.map((category) => {
    const bucket = results.filter((result) => result.category === category);
    const questionCount = bucket.length;
    const fullyRetrievedCount = bucket.filter(
      (result) => result.goldEvidenceFullyRetrieved,
    ).length;
    const answered = bucket.filter((result) => result.answerCorrect !== null);
    const answeredCount = answered.length;
    return {
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
      category,
      // Multi-hop composition needs every evidence turn retrievable; the
      // retrieval-only smoke reports readiness, not the composed answer.
      crossSessionChainReady:
        category === "multi_hop"
          ? questionCount > 0 && fullyRetrievedCount === questionCount
          : null,
      fullyRetrievedCount,
      noiseTurnTotal: bucket.reduce(
        (sum, result) => sum + result.noiseTurnCount,
        0,
      ),
      questionCount,
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

export function createLocomoSmokeMemory(): GoodMemory {
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
        return `locomo-smoke-${String(idCounter).padStart(6, "0")}`;
      },
      now: () => {
        clockTick += 1;
        return new Date(Date.UTC(2026, 0, 1, 0, 0, 0, clockTick));
      },
    },
  });
}

function assertNormalizedCase(value: unknown, index: number): LocomoCase {
  if (
    !isRecord(value) ||
    typeof value.caseId !== "string" ||
    !Array.isArray(value.turns) ||
    !Array.isArray(value.questions)
  ) {
    throw new Error(
      `LoCoMo external case at index ${index} is not a normalized case (need caseId, turns[], questions[]).`,
    );
  }
  return value as unknown as LocomoCase;
}

export function deriveLocomoUpstreamMetricByCategory(
  cases: readonly LocomoCase[],
): Partial<Record<LocomoQaCategory, string>> {
  const metrics: Partial<Record<LocomoQaCategory, string>> = {};
  for (const testCase of cases) {
    for (const question of testCase.questions) {
      metrics[question.category] = question.matchMode;
    }
  }
  return metrics;
}

export async function loadLocomoCases(input: {
  benchmarkRoot?: string;
  limit?: number;
  readFile: (path: string) => Promise<string>;
}): Promise<{ benchmarkSource: string; cases: LocomoCase[] }> {
  let cases: LocomoCase[];
  let benchmarkSource: string;
  if (input.benchmarkRoot) {
    const path = join(input.benchmarkRoot, EXTERNAL_CASES_FILE_NAME);
    const parsed = JSON.parse(await input.readFile(path)) as unknown;
    const rawCases = isRecord(parsed) ? parsed.cases : parsed;
    if (!Array.isArray(rawCases)) {
      throw new Error(
        `LoCoMo external root ${path} must contain a cases array (or {cases: [...]}).`,
      );
    }
    cases = rawCases.map((value, index) => assertNormalizedCase(value, index));
    benchmarkSource = path;
  } else {
    cases = buildLocomoSmokeCases();
    benchmarkSource = "synthetic-smoke";
  }
  if (input.limit !== undefined) {
    cases = cases.slice(0, input.limit);
  }
  return { benchmarkSource, cases };
}

export async function runLocomoSmoke(
  options: LocomoSmokeCliOptions = {},
  dependencies: LocomoSmokeDependencies = {},
): Promise<LocomoSmokeReport> {
  const repoRoot = resolveRepoRootFromScriptUrl(import.meta.url);
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const now = dependencies.now ?? (() => new Date());
  const createMemory = dependencies.createMemory ?? createLocomoSmokeMemory;
  const runId = options.runId ?? LOCOMO_SMOKE_RUN_ID;
  const outputDir =
    options.outputDir ??
    join(repoRoot, "reports", "eval", "research", "phase-65", "locomo");
  const runDirectory = join(outputDir, runId);

  const { benchmarkSource, cases } = await loadLocomoCases({
    benchmarkRoot: options.benchmarkRoot,
    limit: options.limit,
    readFile: readFileImpl,
  });

  const answerGenerator =
    dependencies.answerGenerator ??
    (options.live ? createLocomoLiveAnswerGenerator() : undefined);

  const conversationalExtractor = options.conversationalExtraction
    ? dependencies.conversationalExtractor ??
      createProviderConversationalMemoryExtractor({
        model: resolveLiveModelConfig("GOODMEMORY_EVAL"),
        requestTimeoutMs: LOCOMO_LIVE_REQUEST_TIMEOUT_MS,
      })
    : undefined;

  const results: LocomoQuestionRetrieval[] = [];
  let executionFailures = 0;
  for (const testCase of cases) {
    const memory = createMemory();
    const scope = buildLocomoScope({ caseId: testCase.caseId, runId });
    try {
      // Always seed the raw dialogue turns. Conversational extraction is
      // ADDITIVE, never destructive: per arXiv 2605.12978 (lossy LLM rewriting
      // degrades utility), normalized atomic facts are stored ALONGSIDE the raw
      // turns as extra retrievable units, so a turn the extractor drops or
      // misphrases is still recoverable from its raw form. This mirrors the
      // product path, where assisted extraction merges with deterministic
      // extraction rather than replacing it.
      await seedLocomoCase({ memory, runId, testCase });
      if (conversationalExtractor) {
        await seedLocomoCaseConversational({
          extractor: conversationalExtractor,
          memory,
          runId,
          testCase,
        });
      }
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
        const retrievedTurnIds = collectLocomoRetrievedTurnIds(recall);
        const retrieval = scoreLocomoRetrieval({
          question,
          retrievedTurnIds,
          testCase,
        });
        if (answerGenerator) {
          const generatedAnswer = await answerGenerator({
            memoryContext: options.evidencePack
              ? buildLocomoEvidencePackContext({
                  question,
                  retrievedTurnIds,
                  testCase,
                })
              : buildLocomoAnswerContext({
                  retrievedTurnIds,
                  testCase,
                }),
            question,
            retrievedTurnIds,
            testCase,
          });
          results.push({
            ...retrieval,
            answerCorrect: scoreLocomoAnswer({
              adversarialAnswer: question.adversarialAnswer,
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

  const report: LocomoSmokeReport = {
    answerEvaluation: liveAnswer ? "scored" : "deferred-to-live-mode",
    benchmark: "locomo",
    benchmarkSource,
    caseCount: cases.length,
    cases: results,
    categories: summarizeLocomoRetrieval(results),
    executionFailures,
    externalRoot: options.benchmarkRoot ?? null,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    ingestMode: conversationalExtractor
      ? "conversational-extraction"
      : "raw-turns",
    license: UPSTREAM_LICENSE,
    mode: liveAnswer ? "live-answer" : "retrieval-only",
    phase: "phase-65",
    profilesCompared: [...PROFILES_COMPARED],
    questionCount: results.length,
    runDirectory,
    runId,
    upstreamAnswerMetricByCategory: deriveLocomoUpstreamMetricByCategory(cases),
    upstreamSource: UPSTREAM_SOURCE,
  };

  await mkdirImpl(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, LOCOMO_SMOKE_REPORT_FILE_NAME),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function buildCliSummary(report: LocomoSmokeReport): {
  benchmarkSource: string;
  categories: LocomoCategoryRetrievalSummary[];
  executionFailures: number;
  questionCount: number;
  reportPath: string;
  runId: string;
} {
  return {
    benchmarkSource: report.benchmarkSource,
    categories: report.categories,
    executionFailures: report.executionFailures,
    questionCount: report.questionCount,
    reportPath: join(report.runDirectory, LOCOMO_SMOKE_REPORT_FILE_NAME),
    runId: report.runId,
  };
}

if (import.meta.main) {
  const options = parseLocomoSmokeCliOptions(process.argv);
  runLocomoSmoke(options)
    .then((report) => {
      process.stdout.write(
        `${JSON.stringify(buildCliSummary(report), null, 2)}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(`LoCoMo smoke run failed: ${String(error)}\n`);
      process.exitCode = 1;
    });
}
