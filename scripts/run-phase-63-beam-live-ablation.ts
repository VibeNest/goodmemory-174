import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BeamCase, BeamChatTurn, BeamProfile } from "../src/eval/beam";
import { resolveCliFlagValue } from "./cli-options";
import {
  flattenPhase63BeamCases,
  readPhase63BeamRows,
} from "./run-phase-63-beam-recall-diagnostic";
import {
  resolvePhase63OutputDir,
  resolvePhase63RepoRoot,
} from "./run-phase-63-shared";
import {
  createBeamAnswerGenerator,
  createBeamAnswerJudge,
} from "./run-phase-63-beam-live-slice";
import type {
  Phase63BeamLiveAnswerGenerator,
  Phase63BeamLiveAnswerJudge,
} from "./run-phase-63-beam-live-slice";
import { buildPhase63AnswerEvidencePack } from "./phase63-answer-evidence-pack";
import type { Phase63EvidenceTurn } from "./phase63-answer-evidence-pack";

// Why this exists: the live closure measures one point (goodmemory-normal = the
// recall->compress->answer pipeline, ~0.56). To know whether 0.56 is bounded by
// retrieval, by noise, by compression, or by the prompt/judge itself, this runner
// re-answers the same 400 cases with the SAME answer model and judge but varied
// context. The oracle/retrieved contexts are rebuilt from the recorded retrieval
// (the live-slice report) plus the dataset turns, so no recall pipeline re-run is
// needed. "goodmemory-normal" / "retrieved-compressed-current" are the existing
// live closure baseline, not re-run here.

const GENERATED_BY = "scripts/run-phase-63-beam-live-ablation.ts";

export const PHASE63_ABLATION_MODES = [
  "gold-evidence-only",
  "retrieved-hit-only",
  "retrieved-raw-uncompressed",
  "full-context",
  "gold-evidence-pack",
  "retrieved-evidence-pack",
] as const;

export type Phase63AblationMode = (typeof PHASE63_ABLATION_MODES)[number];

const RETRIEVAL_DEPENDENT_MODES: ReadonlySet<Phase63AblationMode> = new Set([
  "retrieved-hit-only",
  "retrieved-raw-uncompressed",
  "retrieved-evidence-pack",
]);

const EVIDENCE_PACK_MODES: ReadonlySet<Phase63AblationMode> = new Set([
  "gold-evidence-pack",
  "retrieved-evidence-pack",
]);

export interface Phase63AblationCliOptions {
  benchmarkRoot?: string;
  limit?: number;
  liveReportPath?: string;
  mode?: Phase63AblationMode;
  outputDir?: string;
  profile?: BeamProfile;
  runId?: string;
  scale?: BeamCase["scale"];
}

export interface Phase63AblationCaseResult {
  answerable: boolean;
  contextChatCount: number;
  contextChars: number;
  conversationId: string;
  correct: boolean;
  evidenceChatIds: number[];
  executionError?: string;
  hypothesis: string;
  questionId: string;
  questionType: string;
}

export interface Phase63AblationReport {
  benchmarkRoot: string;
  cases: Phase63AblationCaseResult[];
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  liveReportPath?: string;
  mode: Phase63AblationMode;
  outputDir: string;
  phase: "phase-63";
  profile: BeamProfile;
  runDirectory: string;
  runId: string;
  scale: BeamCase["scale"];
  summary: {
    accuracyByQuestionType: Record<string, { correct: number; total: number }>;
    answerAccuracy: number;
    answerableAccuracy: number;
    correctCases: number;
    executionFailures: number;
    meanContextChatCount: number;
    totalCases: number;
  };
}

export interface Phase63AblationDependencies {
  answerGenerator?: Phase63BeamLiveAnswerGenerator;
  answerJudge?: Phase63BeamLiveAnswerJudge;
  concurrency?: number;
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

function parseMode(value: string | undefined): Phase63AblationMode | undefined {
  if (!value) {
    return undefined;
  }
  if ((PHASE63_ABLATION_MODES as readonly string[]).includes(value)) {
    return value as Phase63AblationMode;
  }
  throw new Error(
    `--mode must be one of: ${PHASE63_ABLATION_MODES.join(", ")}`,
  );
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("--limit must be a positive integer");
  }
  return parsed;
}

export function parsePhase63AblationCliOptions(
  argv: readonly string[],
): Phase63AblationCliOptions {
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ??
      process.env.GOODMEMORY_BEAM_ROOT,
    limit: parseLimit(resolveCliFlagValue(argv, "--limit")),
    liveReportPath: resolveCliFlagValue(argv, "--live-report"),
    mode: parseMode(resolveCliFlagValue(argv, "--mode")),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

// Source-ordered (ascending chat_id), deduplicated, formatted like the seeded
// memory turns so the answer model sees the same surface it normally would.
export function buildAblationMemoryContext(input: {
  chatIds: readonly number[];
  turnsById: Map<number, BeamChatTurn>;
}): string {
  const seen = new Set<number>();
  const lines: string[] = [];
  for (const chatId of [...input.chatIds].sort((left, right) => left - right)) {
    if (seen.has(chatId)) {
      continue;
    }
    seen.add(chatId);
    const turn = input.turnsById.get(chatId);
    if (!turn) {
      continue;
    }
    lines.push(
      `[BEAM chat_id=${turn.id} role=${turn.role} time=${turn.timeAnchor}] ${turn.content}`,
    );
  }
  return lines.join("\n");
}

export function selectAblationChatIds(input: {
  allChatIds: readonly number[];
  evidenceChatIds: readonly number[];
  mode: Phase63AblationMode;
  retrievedChatIds: readonly number[];
}): number[] {
  switch (input.mode) {
    case "gold-evidence-only":
      return [...input.evidenceChatIds];
    case "retrieved-hit-only": {
      const evidence = new Set(input.evidenceChatIds);
      return input.retrievedChatIds.filter((chatId) => evidence.has(chatId));
    }
    case "retrieved-raw-uncompressed":
      return [...input.retrievedChatIds];
    case "full-context":
      return [...input.allChatIds];
    case "gold-evidence-pack":
      return [...input.evidenceChatIds];
    case "retrieved-evidence-pack":
      return [...input.retrievedChatIds];
  }
}

// Pack modes reshape the selected turns into the source-ordered, operation-aware
// evidence pack; the other modes use the raw seeded surface.
function buildModeMemoryContext(input: {
  chatIds: readonly number[];
  mode: Phase63AblationMode;
  question: string;
  turnsById: Map<number, BeamChatTurn>;
}): string {
  if (!EVIDENCE_PACK_MODES.has(input.mode)) {
    return buildAblationMemoryContext({
      chatIds: input.chatIds,
      turnsById: input.turnsById,
    });
  }
  const seen = new Set<number>();
  const turns: Phase63EvidenceTurn[] = [];
  for (const chatId of [...input.chatIds].sort((left, right) => left - right)) {
    if (seen.has(chatId)) {
      continue;
    }
    seen.add(chatId);
    const turn = input.turnsById.get(chatId);
    if (!turn) {
      continue;
    }
    turns.push({
      chatId: turn.id,
      content: turn.content,
      role: turn.role,
      timeAnchor: turn.timeAnchor,
    });
  }
  return buildPhase63AnswerEvidencePack({ question: input.question, turns });
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runner = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  };
  const poolSize = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: poolSize }, () => runner()));
  return results;
}

interface LiveReportForRetrieval {
  cases?: { questionId: string; retrievedChatIds?: number[] }[];
}

export async function runPhase63BeamLiveAblation(
  options: Phase63AblationCliOptions = {},
  dependencies: Phase63AblationDependencies = {},
): Promise<Phase63AblationReport> {
  const mode = options.mode;
  if (!mode) {
    throw new Error(
      `Phase 63 BEAM ablation requires --mode (one of: ${PHASE63_ABLATION_MODES.join(", ")}).`,
    );
  }
  const benchmarkRoot =
    options.benchmarkRoot ?? process.env.GOODMEMORY_BEAM_ROOT;
  if (!benchmarkRoot) {
    throw new Error(
      "Phase 63 BEAM ablation requires --benchmark-root or GOODMEMORY_BEAM_ROOT.",
    );
  }
  if (RETRIEVAL_DEPENDENT_MODES.has(mode) && !options.liveReportPath) {
    throw new Error(
      `Phase 63 BEAM ablation mode ${mode} requires --live-report (recorded retrieval).`,
    );
  }

  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const now = dependencies.now ?? (() => new Date());
  const root = resolvePhase63RepoRoot();
  const profile = options.profile ?? "goodmemory-rules-only";
  const scale = options.scale ?? "100K";
  const runId = options.runId ?? `run-phase63-beam-ablation-${mode}-current`;
  const outputDir = options.outputDir ?? resolvePhase63OutputDir(root);
  const runDirectory = join(outputDir, runId);

  const rows = await readPhase63BeamRows({
    benchmarkRoot,
    readFile: readFileImpl,
  });
  const flattened = flattenPhase63BeamCases(rows, scale);
  const limited =
    options.limit === undefined ? flattened : flattened.slice(0, options.limit);

  const turnsByConversation = new Map<string, Map<number, BeamChatTurn>>();
  for (const row of rows) {
    const turnsById = new Map<number, BeamChatTurn>();
    for (const turn of row.chat.flat()) {
      turnsById.set(turn.id, turn);
    }
    turnsByConversation.set(row.conversationId, turnsById);
  }

  const retrievedByQuestionId = new Map<string, number[]>();
  if (options.liveReportPath) {
    const liveReport = JSON.parse(
      await readFileImpl(options.liveReportPath),
    ) as LiveReportForRetrieval;
    for (const liveCase of liveReport.cases ?? []) {
      retrievedByQuestionId.set(
        liveCase.questionId,
        liveCase.retrievedChatIds ?? [],
      );
    }
  }

  const answerGenerator =
    dependencies.answerGenerator ?? createBeamAnswerGenerator();
  const answerJudge = dependencies.answerJudge ?? createBeamAnswerJudge();
  const concurrency =
    dependencies.concurrency ??
    Math.max(1, Number(process.env.GOODMEMORY_EVAL_MAX_CONCURRENCY ?? 2) || 2);

  const cases = await mapWithConcurrency(
    limited,
    concurrency,
    async (diagnosticCase): Promise<Phase63AblationCaseResult> => {
      const testCase: BeamCase = {
        answer: diagnosticCase.answer,
        answerable: diagnosticCase.answerable,
        chat: diagnosticCase.chat,
        conversationId: diagnosticCase.conversationId,
        evidenceChatIds: diagnosticCase.evidenceChatIds,
        question: diagnosticCase.question,
        questionId: diagnosticCase.questionId,
        questionType: diagnosticCase.questionType,
        scale,
      };
      const turnsById =
        turnsByConversation.get(testCase.conversationId) ??
        new Map<number, BeamChatTurn>();
      const chatIds = selectAblationChatIds({
        allChatIds: [...turnsById.keys()],
        evidenceChatIds: testCase.evidenceChatIds,
        mode,
        retrievedChatIds: retrievedByQuestionId.get(testCase.questionId) ?? [],
      });
      const memoryContext = buildModeMemoryContext({
        chatIds,
        mode,
        question: testCase.question,
        turnsById,
      });
      const base: Phase63AblationCaseResult = {
        answerable: testCase.answerable,
        contextChatCount: chatIds.length,
        contextChars: memoryContext.length,
        conversationId: testCase.conversationId,
        correct: false,
        evidenceChatIds: testCase.evidenceChatIds,
        hypothesis: "",
        questionId: testCase.questionId,
        questionType: testCase.questionType,
      };
      try {
        const hypothesis = await answerGenerator({
          memoryContext,
          profile,
          prompt: testCase.question,
          retrievedChatIds: chatIds,
          testCase,
        });
        const answerScore = await answerJudge({
          actualAnswer: hypothesis,
          expectedAnswer: testCase.answer,
          question: testCase.question,
          questionId: testCase.questionId,
          questionType: testCase.questionType,
        });
        return { ...base, correct: answerScore.correct, hypothesis };
      } catch (error) {
        return {
          ...base,
          executionError: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  const correctCases = cases.filter((testCase) => testCase.correct).length;
  const executionFailures = cases.filter(
    (testCase) => testCase.executionError !== undefined,
  ).length;
  const answerableCases = cases.filter((testCase) => testCase.answerable);
  const accuracyByQuestionType: Record<
    string,
    { correct: number; total: number }
  > = {};
  let contextChatTotal = 0;
  for (const testCase of cases) {
    contextChatTotal += testCase.contextChatCount;
    const bucket = accuracyByQuestionType[testCase.questionType] ?? {
      correct: 0,
      total: 0,
    };
    bucket.total += 1;
    if (testCase.correct) {
      bucket.correct += 1;
    }
    accuracyByQuestionType[testCase.questionType] = bucket;
  }

  const report: Phase63AblationReport = {
    benchmarkRoot,
    cases,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    liveReportPath: options.liveReportPath,
    mode,
    outputDir,
    phase: "phase-63",
    profile,
    runDirectory,
    runId,
    scale,
    summary: {
      accuracyByQuestionType,
      answerAccuracy: cases.length === 0 ? 0 : correctCases / cases.length,
      answerableAccuracy:
        answerableCases.length === 0
          ? 0
          : answerableCases.filter((testCase) => testCase.correct).length /
            answerableCases.length,
      correctCases,
      executionFailures,
      meanContextChatCount:
        cases.length === 0 ? 0 : contextChatTotal / cases.length,
      totalCases: cases.length,
    },
  };

  await mkdirImpl(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, "ablation-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

if (import.meta.main) {
  const report = await runPhase63BeamLiveAblation(
    parsePhase63AblationCliOptions(Bun.argv),
  );
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        runId: report.runId,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
}
