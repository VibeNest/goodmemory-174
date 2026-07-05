import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
} from "./cli-options";
import {
  flattenPhase63BeamCases,
  readPhase63BeamRows,
} from "./run-phase-63-beam-recall-diagnostic";
import type { BeamChatTurn } from "../src/eval/beam";
import {
  resolvePhase63OutputDir,
  resolvePhase63RepoRoot,
} from "./run-phase-63-shared";

const GENERATED_BY = "scripts/analyze-phase-63-live-answer-gap.ts";

// Why this exists: Phase 63 BEAM evidence recall is ~0.96 while answer accuracy
// is ~0.56, so the live gap is an answer/organization problem, not a retrieval
// one. This analyzer attributes every wrong answer along two independent axes —
// a recall status (was the evidence even there?) and a reasoning bucket (what
// kind of answer-time work would fix it?) — so repairs target the actual
// failure family instead of more case-specific recall gates.

export type Phase63AnswerGapRecallStatus =
  | "missing-evidence"
  | "full-recall-noisy"
  | "full-recall-clean"
  | "abstention"
  | "unknown";

export type Phase63AnswerGapBucket =
  | "aggregate_count"
  | "temporal_order"
  | "conflict_update"
  | "instruction_following"
  | "preference_following"
  | "multi_session_reasoning"
  | "summarization"
  | "abstention"
  | "judge_or_expected_answer"
  | "other";

export type Phase63AnswerGapSourceCoverageStatus =
  | "not-audited"
  | "covered-or-no-warning"
  | "expected-cues-outside-source"
  | "no-declared-source-ids";

export interface Phase63LiveSliceCaseInput {
  answerable: boolean;
  conversationId?: string;
  correct: boolean;
  evidenceChatIds?: number[];
  evidenceChatRecall: number | null;
  expectedAnswer?: string;
  hypothesis?: string;
  questionId: string;
  questionType: string;
  retrievedChatIds?: number[];
}

interface Phase63LiveSliceReportInput {
  cases: Phase63LiveSliceCaseInput[];
  profile?: string;
  runId?: string;
  summary?: {
    correctCases?: number;
    totalCases?: number;
    wrongAnswerCases?: number;
  };
}

export interface Phase63AnswerGapCase {
  bucket: Phase63AnswerGapBucket;
  conversationId: string;
  evidenceChatRecall: number | null;
  expectedAnswer: string;
  expectedHypothesisOverlap: number;
  hypothesis: string;
  noiseChatCount: number;
  questionId: string;
  questionType: string;
  recallStatus: Phase63AnswerGapRecallStatus;
  sourceCoverageStatus: Phase63AnswerGapSourceCoverageStatus;
  sourceCoverageWarnings: Phase63AnswerGapSourceCoverageWarning[];
}

export interface Phase63AnswerGapSourceCase {
  chat: BeamChatTurn[][];
  evidenceChatIds: number[];
}

export interface Phase63AnswerGapSourceCoverageWarning {
  cue: string;
  matchingChatIdsOutsideEvidence: number[];
}

export interface Phase63AnswerGapRepairFamily {
  bucket: Phase63AnswerGapBucket;
  count: number;
  dominantRecallStatus: Phase63AnswerGapRecallStatus;
  sampleQuestionIds: string[];
  suggestedLane: string;
}

export interface Phase63AnswerGapSourceCoverageBucket {
  bucket: Phase63AnswerGapBucket;
  caseCount: number;
  sampleQuestionIds: string[];
  warningCount: number;
}

export interface Phase63AnswerGapReport {
  buckets: Record<Phase63AnswerGapBucket, string[]>;
  bucketCounts: Record<Phase63AnswerGapBucket, number>;
  cases: Phase63AnswerGapCase[];
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  liveReportPath: string;
  outputPath: string;
  phase: "phase-63";
  profile: string;
  recallStatusCounts: Record<Phase63AnswerGapRecallStatus, number>;
  runId: string;
  sourceCoverageStatusCounts: Record<
    Phase63AnswerGapSourceCoverageStatus,
    number
  >;
  sourceCoverageWarningBuckets: Phase63AnswerGapSourceCoverageBucket[];
  sourceRunId: string;
  summary: {
    attributedShare: number;
    correctCases: number;
    totalCases: number;
    wrongAbstention: number;
    wrongAnswerCases: number;
    wrongFullRecallClean: number;
    wrongFullRecallNoisy: number;
    wrongMissingEvidence: number;
    wrongSourceCoverageWarningCases: number;
    wrongSourceCoverageWarnings: number;
    wrongUnknownRecall: number;
  };
  topRepairFamilies: Phase63AnswerGapRepairFamily[];
}

export interface Phase63AnswerGapOptions {
  benchmarkRoot?: string;
  liveReportPath?: string;
  outputDir?: string;
  outputPath?: string;
  runId?: string;
  scale?: "100K" | "500K" | "1M" | "10M" | "unknown";
}

export interface Phase63AnswerGapDependencies {
  mkdir?: typeof mkdir;
  now?: () => Date;
  sourceCaseByQuestionId?: Map<string, Phase63AnswerGapSourceCase>;
  questionByQuestionId?: Map<string, string>;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

const COUNT_QUESTION_PATTERN =
  /\b(how many|how much|how often|number of|total|in total|combined|altogether|count|sum|times)\b/iu;
const ORDER_QUESTION_PATTERN =
  /\b(order|sequence|sequential|chronolog|timeline|before|after|first|then|next|earlier|later|prior to|followed by|preced)\b/iu;
const RUBRIC_EXPECTED_PATTERN =
  /^(the )?(response|answer)\s+should\b|^should (include|explain|mention|describe)\b/iu;
const SOURCE_COVERAGE_MAX_WARNINGS_PER_CASE = 5;

const SOURCE_COVERAGE_SIGNAL_TOKENS = new Set([
  "accuracy",
  "application",
  "approved",
  "budget",
  "complete",
  "conflict",
  "contract",
  "cost",
  "deadline",
  "decision",
  "dietary",
  "discount",
  "code",
  "duty",
  "expense",
  "family",
  "fee",
  "filing",
  "financial",
  "freelance",
  "fund",
  "grant",
  "income",
  "legal",
  "library",
  "meeting",
  "metric",
  "money",
  "preference",
  "prepared",
  "prototype",
  "registered",
  "rental",
  "resource",
  "responsibility",
  "saving",
  "scheduled",
  "strategy",
  "subscription",
  "tool",
  "verified",
  "webinar",
]);

const SOURCE_COVERAGE_STOP_TOKENS = new Set([
  "a",
  "about",
  "after",
  "against",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "later",
  "of",
  "on",
  "or",
  "over",
  "should",
  "that",
  "the",
  "their",
  "these",
  "this",
  "through",
  "to",
  "versus",
  "with",
  "you",
  "your",
]);

const SOURCE_COVERAGE_TOKEN_ALIASES = new Map<string, string>([
  ["applications", "application"],
  ["approved", "approved"],
  ["approving", "approved"],
  ["codes", "code"],
  ["completed", "complete"],
  ["completing", "complete"],
  ["conflicts", "conflict"],
  ["contracts", "contract"],
  ["costs", "cost"],
  ["decisions", "decision"],
  ["duties", "duty"],
  ["expenses", "expense"],
  ["fees", "fee"],
  ["meetings", "meeting"],
  ["metrics", "metric"],
  ["preferences", "preference"],
  ["prototypes", "prototype"],
  ["registered", "registered"],
  ["registering", "registered"],
  ["rent", "rental"],
  ["rentals", "rental"],
  ["rented", "rental"],
  ["renting", "rental"],
  ["resources", "resource"],
  ["responsibilities", "responsibility"],
  ["savings", "saving"],
  ["scheduled", "scheduled"],
  ["scheduling", "scheduled"],
  ["subscriptions", "subscription"],
  ["tools", "tool"],
  ["verified", "verified"],
  ["verifying", "verified"],
]);

const PHASE63_ANSWER_GAP_RUN_ID = "run-phase63-beam-live-answer-gap-current";

const RECALL_STATUSES: Phase63AnswerGapRecallStatus[] = [
  "missing-evidence",
  "full-recall-noisy",
  "full-recall-clean",
  "abstention",
  "unknown",
];

const SOURCE_COVERAGE_STATUSES: Phase63AnswerGapSourceCoverageStatus[] = [
  "not-audited",
  "covered-or-no-warning",
  "expected-cues-outside-source",
  "no-declared-source-ids",
];

const BUCKETS: Phase63AnswerGapBucket[] = [
  "aggregate_count",
  "temporal_order",
  "conflict_update",
  "instruction_following",
  "preference_following",
  "multi_session_reasoning",
  "summarization",
  "abstention",
  "judge_or_expected_answer",
  "other",
];

const BUCKET_LANES: Record<Phase63AnswerGapBucket, string> = {
  aggregate_count:
    "answer-time structured count/total over value-bearing source turns",
  temporal_order: "answer-time source-ordered timeline evidence pack",
  conflict_update:
    "answer-time current-value resolver (latest update wins; surface only true conflicts)",
  instruction_following:
    "instructionRules companionPattern recipe (standing instruction + companion turn)",
  preference_following:
    "answer-time preference constraint pack (user preference is a response requirement, not optional background)",
  multi_session_reasoning:
    "answer-time facet table (facet -> supporting chat -> value)",
  summarization:
    "answer-time structured multi-turn summary pack (cover expected themes, dates, and tools)",
  abstention:
    "answer-time abstention calibration (answer when the context supports it; abstain only when genuinely absent)",
  judge_or_expected_answer:
    "separate judge model and review expected-answer compatibility (possible false negative)",
  other: "manual review",
};

export function uniqueNoiseChatCount(input: {
  evidenceChatIds?: number[];
  retrievedChatIds?: number[];
}): number {
  const evidence = new Set(input.evidenceChatIds ?? []);
  const noise = new Set(
    (input.retrievedChatIds ?? []).filter((id) => !evidence.has(id)),
  );
  return noise.size;
}

export function resolvePhase63AnswerGapRecallStatus(
  testCase: Phase63LiveSliceCaseInput,
): Phase63AnswerGapRecallStatus {
  if (!testCase.answerable) {
    return "abstention";
  }
  if (testCase.evidenceChatRecall === null) {
    return "unknown";
  }
  if (testCase.evidenceChatRecall < 0.999) {
    return "missing-evidence";
  }
  return uniqueNoiseChatCount(testCase) > 0
    ? "full-recall-noisy"
    : "full-recall-clean";
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/giu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 0);
}

export function expectedHypothesisOverlap(
  hypothesis: string,
  expected: string,
): number {
  const a = tokenize(hypothesis);
  const b = tokenize(expected);
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const token of b) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  let overlap = 0;
  for (const token of a) {
    const remaining = counts.get(token) ?? 0;
    if (remaining > 0) {
      overlap += 1;
      counts.set(token, remaining - 1);
    }
  }
  const precision = overlap / a.length;
  const recall = overlap / b.length;
  if (precision + recall === 0) {
    return 0;
  }
  return (2 * precision * recall) / (precision + recall);
}

function normalizeCoverageToken(raw: string): string {
  const lower = raw.toLowerCase().replace(/^['"]|['"]$/gu, "");
  return SOURCE_COVERAGE_TOKEN_ALIASES.get(lower) ?? lower;
}

function tokenizeCoverageText(value: string): string[] {
  return (value.match(/[a-z0-9][a-z0-9'/-]*/giu) ?? [])
    .map(normalizeCoverageToken)
    .filter((token) => token.length > 0);
}

function coverageTokensContain(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  const haystackSet = new Set(haystack);
  return needle.every((token) => haystackSet.has(token));
}

function isInformativeCoverageCue(tokens: readonly string[]): boolean {
  const signalCount = tokens.filter((token) =>
    SOURCE_COVERAGE_SIGNAL_TOKENS.has(token),
  ).length;
  const hasNumericToken = tokens.some((token) => /^\d+(?:\.\d+)?$/u.test(token));
  return signalCount >= 2 || (signalCount >= 1 && hasNumericToken);
}

function extractExpectedCoverageCues(expectedAnswer: string): {
  cue: string;
  tokens: string[];
}[] {
  const rawTokens = tokenizeCoverageText(expectedAnswer).filter(
    (token) => !SOURCE_COVERAGE_STOP_TOKENS.has(token),
  );
  const seen = new Set<string>();
  const cues: { cue: string; tokens: string[] }[] = [];
  for (const width of [3, 2]) {
    for (let index = 0; index <= rawTokens.length - width; index += 1) {
      const tokens = rawTokens.slice(index, index + width);
      if (!isInformativeCoverageCue(tokens)) {
        continue;
      }
      const key = tokens.join(" ");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      cues.push({ cue: key, tokens });
    }
  }
  return cues;
}

function collectCoverageTokensByChatId(
  chat: readonly BeamChatTurn[][],
): Map<number, string[]> {
  const byId = new Map<number, string[]>();
  for (const turn of chat.flat()) {
    byId.set(turn.id, tokenizeCoverageText(turn.content));
  }
  return byId;
}

export function findPhase63SourceCoverageWarnings(input: {
  expectedAnswer: string;
  sourceCase?: Phase63AnswerGapSourceCase;
}): Phase63AnswerGapSourceCoverageWarning[] {
  if (!input.sourceCase) {
    return [];
  }
  const evidenceChatIds = new Set(input.sourceCase.evidenceChatIds);
  const tokensById = collectCoverageTokensByChatId(input.sourceCase.chat);
  const evidenceTokens = input.sourceCase.evidenceChatIds.flatMap(
    (id) => tokensById.get(id) ?? [],
  );
  const warnings: Phase63AnswerGapSourceCoverageWarning[] = [];
  for (const cue of extractExpectedCoverageCues(input.expectedAnswer)) {
    if (coverageTokensContain(evidenceTokens, cue.tokens)) {
      continue;
    }
    const matchingChatIdsOutsideEvidence = [...tokensById.entries()]
      .filter(
        ([id, tokens]) =>
          !evidenceChatIds.has(id) && coverageTokensContain(tokens, cue.tokens),
      )
      .map(([id]) => id)
      .slice(0, 8);
    if (matchingChatIdsOutsideEvidence.length === 0) {
      continue;
    }
    warnings.push({
      cue: cue.cue,
      matchingChatIdsOutsideEvidence,
    });
    if (warnings.length >= SOURCE_COVERAGE_MAX_WARNINGS_PER_CASE) {
      break;
    }
  }
  return warnings;
}

export function resolvePhase63SourceCoverageStatus(input: {
  sourceCase?: Phase63AnswerGapSourceCase;
  sourceCoverageWarnings: readonly Phase63AnswerGapSourceCoverageWarning[];
}): Phase63AnswerGapSourceCoverageStatus {
  if (!input.sourceCase) {
    return "not-audited";
  }
  if (input.sourceCase.evidenceChatIds.length === 0) {
    return "no-declared-source-ids";
  }
  if (input.sourceCoverageWarnings.length === 0) {
    return "covered-or-no-warning";
  }
  return "expected-cues-outside-source";
}

// Priority order is deliberate: type-anchored families (abstention,
// instruction_following, preference_following, conflict_update, summarization)
// win first because the answer-time work they need is fixed by type; count/order
// question phrasing then captures the cross-type aggregate and timeline cases;
// multi_session_reasoning catches the remaining facet-join work; the
// judge/expected fallback flags likely false negatives (rubric-style expected
// answers or near-identical hypotheses) before giving up to "other".
export function resolvePhase63AnswerGapBucket(input: {
  expectedAnswer: string;
  hypothesis: string;
  question: string;
  questionType: string;
}): Phase63AnswerGapBucket {
  const { question, questionType } = input;
  if (questionType === "abstention") {
    return "abstention";
  }
  if (questionType === "instruction_following") {
    return "instruction_following";
  }
  if (questionType === "preference_following") {
    return "preference_following";
  }
  if (
    questionType === "contradiction_resolution" ||
    questionType === "knowledge_update"
  ) {
    return "conflict_update";
  }
  if (questionType === "summarization") {
    return "summarization";
  }
  if (COUNT_QUESTION_PATTERN.test(question)) {
    return "aggregate_count";
  }
  if (
    questionType === "event_ordering" ||
    questionType === "temporal_reasoning" ||
    ORDER_QUESTION_PATTERN.test(question)
  ) {
    return "temporal_order";
  }
  if (questionType === "multi_session_reasoning") {
    return "multi_session_reasoning";
  }
  const expected = input.expectedAnswer.trim();
  if (
    RUBRIC_EXPECTED_PATTERN.test(expected) ||
    expectedHypothesisOverlap(input.hypothesis, expected) >= 0.6
  ) {
    return "judge_or_expected_answer";
  }
  return "other";
}

function emptyCountRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function parseScale(value: string | undefined): Phase63AnswerGapOptions["scale"] {
  if (!value) {
    return undefined;
  }
  if (
    value === "100K" ||
    value === "500K" ||
    value === "1M" ||
    value === "10M" ||
    value === "unknown"
  ) {
    return value;
  }
  throw new Error("--scale must be 100K, 500K, 1M, 10M, or unknown");
}

export async function analyzePhase63LiveAnswerGap(
  options: Phase63AnswerGapOptions = {},
  dependencies: Phase63AnswerGapDependencies = {},
): Promise<Phase63AnswerGapReport> {
  if (!options.liveReportPath) {
    throw new Error(
      "Phase 63 live answer-gap analysis requires --live-report.",
    );
  }
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const now = dependencies.now ?? (() => new Date());
  const root = resolvePhase63RepoRoot();
  const runId = options.runId ?? PHASE63_ANSWER_GAP_RUN_ID;
  const outputDir = options.outputDir ?? resolvePhase63OutputDir(root);
  const outputPath =
    options.outputPath ?? join(outputDir, runId, "live-answer-gap-analysis.json");
  assertDistinctCliPathValues({
    firstFlag: "--output-path",
    firstValue: outputPath,
    secondFlag: "--live-report",
    secondValue: options.liveReportPath,
  });

  const liveReport = JSON.parse(
    await readFileImpl(options.liveReportPath),
  ) as Phase63LiveSliceReportInput;
  if (!Array.isArray(liveReport.cases)) {
    throw new Error(
      "Phase 63 live answer-gap analysis requires a live-slice report with a cases array.",
    );
  }

  // Question text is needed to separate cross-type aggregate/order questions;
  // tests inject the map directly, the CLI loads it from the BEAM dataset.
  let questionById = dependencies.questionByQuestionId;
  let sourceCaseByQuestionId = dependencies.sourceCaseByQuestionId;
  if (!questionById) {
    questionById = new Map<string, string>();
    sourceCaseByQuestionId = new Map<string, Phase63AnswerGapSourceCase>();
    if (options.benchmarkRoot) {
      const rows = await readPhase63BeamRows({
        benchmarkRoot: options.benchmarkRoot,
        readFile: readFileImpl,
      });
      for (const beamCase of flattenPhase63BeamCases(
        rows,
        options.scale ?? "100K",
      )) {
        questionById.set(beamCase.questionId, beamCase.question);
        sourceCaseByQuestionId.set(beamCase.questionId, {
          chat: beamCase.chat,
          evidenceChatIds: beamCase.evidenceChatIds,
        });
      }
    }
  }

  const wrong = liveReport.cases.filter((testCase) => !testCase.correct);
  const recallStatusCounts = emptyCountRecord(RECALL_STATUSES);
  const sourceCoverageStatusCounts = emptyCountRecord(SOURCE_COVERAGE_STATUSES);
  const buckets = Object.fromEntries(
    BUCKETS.map((bucket) => [bucket, [] as string[]]),
  ) as Record<Phase63AnswerGapBucket, string[]>;
  const bucketRecallStatus = Object.fromEntries(
    BUCKETS.map((bucket) => [bucket, emptyCountRecord(RECALL_STATUSES)]),
  ) as Record<
    Phase63AnswerGapBucket,
    Record<Phase63AnswerGapRecallStatus, number>
  >;
  const cases: Phase63AnswerGapCase[] = [];

  for (const testCase of wrong) {
    const recallStatus = resolvePhase63AnswerGapRecallStatus(testCase);
    const question = questionById.get(testCase.questionId) ?? "";
    const expectedAnswer = testCase.expectedAnswer ?? "";
    const hypothesis = testCase.hypothesis ?? "";
    const bucket = resolvePhase63AnswerGapBucket({
      expectedAnswer,
      hypothesis,
      question,
      questionType: testCase.questionType,
    });
    const sourceCase = sourceCaseByQuestionId?.get(testCase.questionId);
    const sourceCoverageWarnings = findPhase63SourceCoverageWarnings({
      expectedAnswer,
      sourceCase,
    });
    const sourceCoverageStatus = resolvePhase63SourceCoverageStatus({
      sourceCase,
      sourceCoverageWarnings,
    });
    recallStatusCounts[recallStatus] += 1;
    sourceCoverageStatusCounts[sourceCoverageStatus] += 1;
    buckets[bucket].push(testCase.questionId);
    bucketRecallStatus[bucket][recallStatus] += 1;
    cases.push({
      bucket,
      conversationId: testCase.conversationId ?? "",
      evidenceChatRecall: testCase.evidenceChatRecall,
      expectedAnswer,
      expectedHypothesisOverlap: expectedHypothesisOverlap(
        hypothesis,
        expectedAnswer,
      ),
      hypothesis,
      noiseChatCount: uniqueNoiseChatCount(testCase),
      questionId: testCase.questionId,
      questionType: testCase.questionType,
      recallStatus,
      sourceCoverageStatus,
      sourceCoverageWarnings,
    });
  }

  const bucketCounts = Object.fromEntries(
    BUCKETS.map((bucket) => [bucket, buckets[bucket].length]),
  ) as Record<Phase63AnswerGapBucket, number>;
  const attributed = wrong.length - bucketCounts.other;
  const totalCases = liveReport.summary?.totalCases ?? liveReport.cases.length;
  const correctCases =
    liveReport.summary?.correctCases ??
    liveReport.cases.filter((testCase) => testCase.correct).length;
  const wrongSourceCoverageWarnings = cases.reduce(
    (count, testCase) => count + testCase.sourceCoverageWarnings.length,
    0,
  );
  const wrongSourceCoverageWarningCases = cases.filter(
    (testCase) => testCase.sourceCoverageWarnings.length > 0,
  ).length;
  const sourceCoverageWarningBuckets = BUCKETS.map((bucket) => {
    const bucketCases = cases.filter(
      (testCase) =>
        testCase.bucket === bucket && testCase.sourceCoverageWarnings.length > 0,
    );
    return {
      bucket,
      caseCount: bucketCases.length,
      sampleQuestionIds: bucketCases
        .map((testCase) => testCase.questionId)
        .slice(0, 8),
      warningCount: bucketCases.reduce(
        (count, testCase) => count + testCase.sourceCoverageWarnings.length,
        0,
      ),
    };
  }).filter((bucket) => bucket.caseCount > 0);

  const topRepairFamilies: Phase63AnswerGapRepairFamily[] = BUCKETS.filter(
    (bucket) => bucket !== "other" && bucketCounts[bucket] > 0,
  )
    .map((bucket) => {
      const statusCounts = bucketRecallStatus[bucket];
      const dominantRecallStatus = RECALL_STATUSES.reduce((best, status) =>
        statusCounts[status] > statusCounts[best] ? status : best,
      );
      return {
        bucket,
        count: bucketCounts[bucket],
        dominantRecallStatus,
        sampleQuestionIds: buckets[bucket].slice(0, 5),
        suggestedLane: BUCKET_LANES[bucket],
      };
    })
    .sort((left, right) => right.count - left.count);

  const report: Phase63AnswerGapReport = {
    buckets,
    bucketCounts,
    cases,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    liveReportPath: options.liveReportPath,
    outputPath,
    phase: "phase-63",
    profile: liveReport.profile ?? "unknown",
    recallStatusCounts,
    runId,
    sourceCoverageStatusCounts,
    sourceCoverageWarningBuckets,
    sourceRunId: liveReport.runId ?? "unknown",
    summary: {
      attributedShare: wrong.length === 0 ? 1 : attributed / wrong.length,
      correctCases,
      totalCases,
      wrongAbstention: recallStatusCounts.abstention,
      wrongAnswerCases: wrong.length,
      wrongFullRecallClean: recallStatusCounts["full-recall-clean"],
      wrongFullRecallNoisy: recallStatusCounts["full-recall-noisy"],
      wrongMissingEvidence: recallStatusCounts["missing-evidence"],
      wrongSourceCoverageWarningCases,
      wrongSourceCoverageWarnings,
      wrongUnknownRecall: recallStatusCounts.unknown,
    },
    topRepairFamilies,
  };

  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function parsePhase63AnswerGapCliOptions(
  argv: readonly string[],
): Phase63AnswerGapOptions {
  return {
    benchmarkRoot:
      resolveCliFlagValueStrict(argv, "--benchmark-root") ??
      process.env.GOODMEMORY_BEAM_ROOT,
    liveReportPath: resolveCliFlagValueStrict(argv, "--live-report"),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    runId: resolveCliFlagValueStrict(argv, "--run-id"),
    scale: parseScale(resolveCliFlagValueStrict(argv, "--scale")),
  };
}

if (import.meta.main) {
  const report = await analyzePhase63LiveAnswerGap(
    parsePhase63AnswerGapCliOptions(Bun.argv),
  );
  console.log(
    JSON.stringify(
      {
        outputPath: report.outputPath,
        summary: report.summary,
        recallStatusCounts: report.recallStatusCounts,
        sourceCoverageStatusCounts: report.sourceCoverageStatusCounts,
        bucketCounts: report.bucketCounts,
        topRepairFamilies: report.topRepairFamilies,
        sourceCoverageWarningBuckets: report.sourceCoverageWarningBuckets,
      },
      null,
      2,
    ),
  );
}
