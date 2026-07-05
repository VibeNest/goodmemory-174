import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveCliFlagValueStrict } from "./cli-options";
import { inferPhase63BeamCaseCategory } from "./analyze-phase-63-beam-report";
import {
  flattenPhase63BeamCases,
  PHASE63_RECALL_DIAGNOSTIC_RUN_ID,
  readPhase63BeamRows,
} from "./run-phase-63-beam-recall-diagnostic";
import { resolvePhase63OutputDir, resolvePhase63RepoRoot } from "./run-phase-63-shared";
import type {
  BeamCaseResult,
  BeamProfile,
  BeamProfileSummary,
  BeamReport,
  BeamRow,
} from "../src/eval/beam";

const GENERATED_BY = "scripts/analyze-phase-63-recall-diagnostic.ts";
const DEFAULT_SOURCE_TURN_LIMIT = 3;

export interface Phase63RecallDiagnosticAnalysisOptions {
  baselineReportPath?: string;
  baselineRunId?: string;
  benchmarkRoot?: string;
  outputDir?: string;
  outputPath?: string;
  profile?: BeamProfile;
  reportPath?: string;
  runId?: string;
  sourceTurnLimit?: number;
}

export interface Phase63RecallDiagnosticAnalysisDependencies {
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

export interface Phase63RecallDiagnosticSourceTurn {
  chatId: number;
  contentPreview: string;
  role: string;
  timeAnchor: string;
}

export interface Phase63RecallDiagnosticCaseEvidence {
  answerable: boolean;
  category: string;
  evidenceChatIds: number[];
  evidenceChatRecall: number | null;
  expectedAnswer?: string;
  hitChatIds: number[];
  missingChatIds: number[];
  noiseChatIds: number[];
  question?: string;
  questionId: string;
  questionType: string;
  retrievedChatIds: number[];
  sourceTurns?: {
    missing: Phase63RecallDiagnosticSourceTurn[];
    noise: Phase63RecallDiagnosticSourceTurn[];
  };
}

export interface Phase63RecallDiagnosticBucketSummary {
  averageEvidenceChatRecall: number | null;
  averageNoiseChatIds: number;
  averageRetrievedChatIds: number;
  category: string;
  evidenceCases: number;
  incompleteRecallCases: number;
  totalCases: number;
  totalExpectedEvidenceIds: number;
  totalHitEvidenceIds: number;
  totalMissingEvidenceIds: number;
  totalNoiseChatIds: number;
  totalRetrievedChatIds: number;
  wrongRecallCases: number;
  zeroRecallCases: number;
}

export interface Phase63RecallDiagnosticBucketDelta {
  after: Phase63RecallDiagnosticBucketSummary;
  averageEvidenceChatRecallDelta: number | null;
  baseline?: Phase63RecallDiagnosticBucketSummary;
  category: string;
  incompleteRecallCasesDelta: number;
  totalHitEvidenceIdsDelta: number;
  totalMissingEvidenceIdsDelta: number;
  totalNoiseChatIdsDelta: number;
  totalRetrievedChatIdsDelta: number;
  wrongRecallCasesDelta: number;
  zeroRecallCasesDelta: number;
}

export interface Phase63RecallDiagnosticCaseDelta {
  after: {
    evidenceChatRecall: number | null;
    missingChatIds: number[];
    noiseChatIds: number[];
    retrievedChatIds: number[];
  };
  baseline: {
    evidenceChatRecall: number | null;
    missingChatIds: number[];
    noiseChatIds: number[];
    retrievedChatIds: number[];
  };
  category: string;
  hitChatIdsDelta: number;
  missingChatIdsDelta: number;
  newlyMissingChatIds: number[];
  newNoiseChatIds: number[];
  noiseChatIdsDelta: number;
  questionId: string;
  questionType: string;
  recallDelta: number | null;
  recoveredChatIds: number[];
  removedNoiseChatIds: number[];
}

export interface Phase63RecallDiagnosticGlobalSummary {
  evidenceCases: number;
  missedRecallCases: number;
  totalCases: number;
  totalExpectedEvidenceIds: number;
  totalHitEvidenceIds: number;
  totalMissingEvidenceIds: number;
  totalNoiseChatIds: number;
  totalRetrievedChatIds: number;
  wrongRecallCases: number;
  zeroRecallCases: number;
}

export interface Phase63RecallDiagnosticWorkbenchAnalysis {
  baseline?: {
    profile: BeamProfile;
    reportPath: string;
    runId: string;
  };
  bucketDeltas?: Phase63RecallDiagnosticBucketDelta[];
  bucketSummaries: Phase63RecallDiagnosticBucketSummary[];
  caseDeltas?: Phase63RecallDiagnosticCaseDelta[];
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  globalSummary: Phase63RecallDiagnosticGlobalSummary;
  incompleteRecallCases: Phase63RecallDiagnosticCaseEvidence[];
  phase: "phase-63";
  profile: BeamProfile;
  profileSummary: BeamProfileSummary;
  reportPath: string;
  runId: string;
  sourceContextWarning?: string;
  zeroRecallCases: Phase63RecallDiagnosticCaseEvidence[];
}

export interface Phase63RecallDiagnosticAnalysisRunResult {
  analysis: Phase63RecallDiagnosticWorkbenchAnalysis;
  outputPath: string;
}

export interface Phase63RecallDiagnosticSourceCaseContext {
  answer: string;
  question: string;
  turnsById: Map<number, Phase63RecallDiagnosticSourceTurn>;
}

function parseSourceTurnLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("--source-turn-limit must be a non-negative integer");
  }
  return parsed;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function difference(left: readonly number[], right: readonly number[]): number[] {
  const rightSet = new Set(right);
  return uniqueNumbers(left).filter((value) => !rightSet.has(value));
}

function intersection(left: readonly number[], right: readonly number[]): number[] {
  const rightSet = new Set(right);
  return uniqueNumbers(left).filter((value) => rightSet.has(value));
}

function truncateContent(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function selectProfile(input: {
  profile?: BeamProfile;
  report: BeamReport;
}): BeamProfile {
  if (input.profile && input.report.profiles[input.profile]) {
    return input.profile;
  }
  if (input.report.profiles["goodmemory-rules-only"]) {
    return "goodmemory-rules-only";
  }
  const profile = input.report.summary.profilesCompared.find(
    (candidate) => input.report.profiles[candidate],
  );
  if (!profile) {
    throw new Error("Recall diagnostic report has no profile cases to analyze.");
  }
  return profile;
}

function buildSourceContexts(input: {
  report: BeamReport;
  rows: readonly BeamRow[];
}): Map<string, Phase63RecallDiagnosticSourceCaseContext> {
  const contexts = new Map<string, Phase63RecallDiagnosticSourceCaseContext>();
  for (const testCase of flattenPhase63BeamCases(
    input.rows,
    input.report.summary.scale,
  )) {
    const turnsById = new Map<number, Phase63RecallDiagnosticSourceTurn>();
    for (const turn of testCase.row.chat.flat()) {
      turnsById.set(turn.id, {
        chatId: turn.id,
        contentPreview: truncateContent(turn.content),
        role: turn.role,
        timeAnchor: turn.timeAnchor,
      });
    }
    contexts.set(testCase.questionId, {
      answer: testCase.answer,
      question: testCase.question,
      turnsById,
    });
  }
  return contexts;
}

function resolveSourceTurns(input: {
  context?: Phase63RecallDiagnosticSourceCaseContext;
  ids: readonly number[];
  limit: number;
}): Phase63RecallDiagnosticSourceTurn[] {
  if (!input.context || input.limit === 0) {
    return [];
  }
  return input.ids
    .slice(0, input.limit)
    .flatMap((id) => {
      const turn = input.context?.turnsById.get(id);
      return turn ? [turn] : [];
    });
}

function buildCaseEvidence(input: {
  sourceContexts?: Map<string, Phase63RecallDiagnosticSourceCaseContext>;
  sourceTurnLimit: number;
  testCase: BeamCaseResult;
}): Phase63RecallDiagnosticCaseEvidence {
  const hitChatIds = intersection(
    input.testCase.evidenceChatIds,
    input.testCase.retrievedChatIds,
  );
  const missingChatIds = difference(input.testCase.evidenceChatIds, hitChatIds);
  const noiseChatIds = difference(
    input.testCase.retrievedChatIds,
    input.testCase.evidenceChatIds,
  );
  const category = inferPhase63BeamCaseCategory({
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
  });
  const sourceContext = input.sourceContexts?.get(input.testCase.questionId);
  const sourceTurns = sourceContext
    ? {
      missing: resolveSourceTurns({
        context: sourceContext,
        ids: missingChatIds,
        limit: input.sourceTurnLimit,
      }),
      noise: resolveSourceTurns({
        context: sourceContext,
        ids: noiseChatIds,
        limit: input.sourceTurnLimit,
      }),
    }
    : undefined;

  return {
    answerable: input.testCase.answerable,
    category,
    evidenceChatIds: input.testCase.evidenceChatIds,
    evidenceChatRecall: input.testCase.evidenceChatRecall,
    expectedAnswer: sourceContext?.answer,
    hitChatIds,
    missingChatIds,
    noiseChatIds,
    question: sourceContext?.question,
    questionId: input.testCase.questionId,
    questionType: input.testCase.questionType,
    retrievedChatIds: input.testCase.retrievedChatIds,
    sourceTurns,
  };
}

function buildCaseEvidenceList(input: {
  cases: readonly BeamCaseResult[];
  sourceContexts?: Map<string, Phase63RecallDiagnosticSourceCaseContext>;
  sourceTurnLimit: number;
}): Phase63RecallDiagnosticCaseEvidence[] {
  return input.cases.map((testCase) =>
    buildCaseEvidence({
      sourceContexts: input.sourceContexts,
      sourceTurnLimit: input.sourceTurnLimit,
      testCase,
    })
  );
}

function summarizeGlobal(
  cases: readonly Phase63RecallDiagnosticCaseEvidence[],
): Phase63RecallDiagnosticGlobalSummary {
  return {
    evidenceCases: cases.filter((testCase) => testCase.evidenceChatRecall !== null)
      .length,
    missedRecallCases: cases.filter(
      (testCase) =>
        testCase.evidenceChatRecall !== null && testCase.evidenceChatRecall < 1,
    ).length,
    totalCases: cases.length,
    totalExpectedEvidenceIds: cases.reduce(
      (sum, testCase) => sum + testCase.evidenceChatIds.length,
      0,
    ),
    totalHitEvidenceIds: cases.reduce(
      (sum, testCase) => sum + testCase.hitChatIds.length,
      0,
    ),
    totalMissingEvidenceIds: cases.reduce(
      (sum, testCase) => sum + testCase.missingChatIds.length,
      0,
    ),
    totalNoiseChatIds: cases.reduce(
      (sum, testCase) => sum + testCase.noiseChatIds.length,
      0,
    ),
    totalRetrievedChatIds: cases.reduce(
      (sum, testCase) => sum + testCase.retrievedChatIds.length,
      0,
    ),
    wrongRecallCases: cases.filter((testCase) => testCase.noiseChatIds.length > 0)
      .length,
    zeroRecallCases: cases.filter(
      (testCase) =>
        testCase.evidenceChatRecall !== null && testCase.evidenceChatRecall === 0,
    ).length,
  };
}

function summarizeBucket(input: {
  category: string;
  cases: readonly Phase63RecallDiagnosticCaseEvidence[];
}): Phase63RecallDiagnosticBucketSummary {
  const evidenceCases = input.cases.filter(
    (testCase) => testCase.evidenceChatRecall !== null,
  );
  const totalExpectedEvidenceIds = input.cases.reduce(
    (sum, testCase) => sum + testCase.evidenceChatIds.length,
    0,
  );
  const totalHitEvidenceIds = input.cases.reduce(
    (sum, testCase) => sum + testCase.hitChatIds.length,
    0,
  );
  const totalMissingEvidenceIds = input.cases.reduce(
    (sum, testCase) => sum + testCase.missingChatIds.length,
    0,
  );
  const totalRetrievedChatIds = input.cases.reduce(
    (sum, testCase) => sum + testCase.retrievedChatIds.length,
    0,
  );
  const totalNoiseChatIds = input.cases.reduce(
    (sum, testCase) => sum + testCase.noiseChatIds.length,
    0,
  );

  return {
    averageEvidenceChatRecall:
      evidenceCases.length === 0
        ? null
        : roundMetric(
          evidenceCases.reduce(
            (sum, testCase) => sum + (testCase.evidenceChatRecall ?? 0),
            0,
          ) / evidenceCases.length,
        ),
    averageNoiseChatIds:
      input.cases.length === 0 ? 0 : roundMetric(totalNoiseChatIds / input.cases.length),
    averageRetrievedChatIds:
      input.cases.length === 0
        ? 0
        : roundMetric(totalRetrievedChatIds / input.cases.length),
    category: input.category,
    evidenceCases: evidenceCases.length,
    incompleteRecallCases: evidenceCases.filter(
      (testCase) => (testCase.evidenceChatRecall ?? 0) < 1,
    ).length,
    totalCases: input.cases.length,
    totalExpectedEvidenceIds,
    totalHitEvidenceIds,
    totalMissingEvidenceIds,
    totalNoiseChatIds,
    totalRetrievedChatIds,
    wrongRecallCases: input.cases.filter(
      (testCase) => testCase.noiseChatIds.length > 0,
    ).length,
    zeroRecallCases: evidenceCases.filter(
      (testCase) => testCase.evidenceChatRecall === 0,
    ).length,
  };
}

function buildBucketSummaries(
  cases: readonly Phase63RecallDiagnosticCaseEvidence[],
): Phase63RecallDiagnosticBucketSummary[] {
  const byCategory = new Map<string, Phase63RecallDiagnosticCaseEvidence[]>();
  for (const testCase of cases) {
    const bucket = byCategory.get(testCase.category) ?? [];
    bucket.push(testCase);
    byCategory.set(testCase.category, bucket);
  }

  return [...byCategory.entries()]
    .map(([category, bucketCases]) =>
      summarizeBucket({
        category,
        cases: bucketCases,
      })
    )
    .sort((left, right) => {
      const recallDelta =
        (left.averageEvidenceChatRecall ?? 0) -
        (right.averageEvidenceChatRecall ?? 0);
      if (recallDelta !== 0) {
        return recallDelta;
      }
      return right.incompleteRecallCases - left.incompleteRecallCases;
    });
}

function buildBucketDeltas(input: {
  after: readonly Phase63RecallDiagnosticBucketSummary[];
  baseline: readonly Phase63RecallDiagnosticBucketSummary[];
}): Phase63RecallDiagnosticBucketDelta[] {
  const baselineByCategory = new Map(
    input.baseline.map((bucket) => [bucket.category, bucket]),
  );
  return input.after.map((after) => {
    const baseline = baselineByCategory.get(after.category);
    return {
      after,
      averageEvidenceChatRecallDelta:
        after.averageEvidenceChatRecall === null ||
          baseline?.averageEvidenceChatRecall === null ||
          baseline?.averageEvidenceChatRecall === undefined
          ? null
          : roundMetric(after.averageEvidenceChatRecall - baseline.averageEvidenceChatRecall),
      baseline,
      category: after.category,
      incompleteRecallCasesDelta:
        after.incompleteRecallCases - (baseline?.incompleteRecallCases ?? 0),
      totalHitEvidenceIdsDelta:
        after.totalHitEvidenceIds - (baseline?.totalHitEvidenceIds ?? 0),
      totalMissingEvidenceIdsDelta:
        after.totalMissingEvidenceIds - (baseline?.totalMissingEvidenceIds ?? 0),
      totalNoiseChatIdsDelta:
        after.totalNoiseChatIds - (baseline?.totalNoiseChatIds ?? 0),
      totalRetrievedChatIdsDelta:
        after.totalRetrievedChatIds - (baseline?.totalRetrievedChatIds ?? 0),
      wrongRecallCasesDelta:
        after.wrongRecallCases - (baseline?.wrongRecallCases ?? 0),
      zeroRecallCasesDelta:
        after.zeroRecallCases - (baseline?.zeroRecallCases ?? 0),
    };
  });
}

function buildCaseDeltas(input: {
  after: readonly Phase63RecallDiagnosticCaseEvidence[];
  baseline: readonly Phase63RecallDiagnosticCaseEvidence[];
}): Phase63RecallDiagnosticCaseDelta[] {
  const baselineById = new Map(
    input.baseline.map((testCase) => [testCase.questionId, testCase]),
  );
  const deltas: Phase63RecallDiagnosticCaseDelta[] = [];

  for (const after of input.after) {
    const baseline = baselineById.get(after.questionId);
    if (!baseline) {
      continue;
    }
    const recallDelta =
      after.evidenceChatRecall === null || baseline.evidenceChatRecall === null
        ? null
        : roundMetric(after.evidenceChatRecall - baseline.evidenceChatRecall);
    const recoveredChatIds = difference(
      baseline.missingChatIds,
      after.missingChatIds,
    );
    const newlyMissingChatIds = difference(
      after.missingChatIds,
      baseline.missingChatIds,
    );
    const newNoiseChatIds = difference(after.noiseChatIds, baseline.noiseChatIds);
    const removedNoiseChatIds = difference(
      baseline.noiseChatIds,
      after.noiseChatIds,
    );
    const retrievedChatIdsAdded = difference(
      after.retrievedChatIds,
      baseline.retrievedChatIds,
    );
    const retrievedChatIdsRemoved = difference(
      baseline.retrievedChatIds,
      after.retrievedChatIds,
    );
    const recallUnchanged =
      recallDelta === 0 ||
      (recallDelta === null && after.evidenceChatRecall === baseline.evidenceChatRecall);
    if (
      recallUnchanged &&
      recoveredChatIds.length === 0 &&
      newlyMissingChatIds.length === 0 &&
      newNoiseChatIds.length === 0 &&
      removedNoiseChatIds.length === 0 &&
      retrievedChatIdsAdded.length === 0 &&
      retrievedChatIdsRemoved.length === 0
    ) {
      continue;
    }

    deltas.push({
      after: {
        evidenceChatRecall: after.evidenceChatRecall,
        missingChatIds: after.missingChatIds,
        noiseChatIds: after.noiseChatIds,
        retrievedChatIds: after.retrievedChatIds,
      },
      baseline: {
        evidenceChatRecall: baseline.evidenceChatRecall,
        missingChatIds: baseline.missingChatIds,
        noiseChatIds: baseline.noiseChatIds,
        retrievedChatIds: baseline.retrievedChatIds,
      },
      category: after.category,
      hitChatIdsDelta: after.hitChatIds.length - baseline.hitChatIds.length,
      missingChatIdsDelta:
        after.missingChatIds.length - baseline.missingChatIds.length,
      newlyMissingChatIds,
      newNoiseChatIds,
      noiseChatIdsDelta: after.noiseChatIds.length - baseline.noiseChatIds.length,
      questionId: after.questionId,
      questionType: after.questionType,
      recallDelta,
      recoveredChatIds,
      removedNoiseChatIds,
    });
  }

  return deltas.sort((left, right) => {
    const recallDelta =
      Math.abs(right.recallDelta ?? 0) - Math.abs(left.recallDelta ?? 0);
    if (recallDelta !== 0) {
      return recallDelta;
    }
    const missingDelta =
      Math.abs(right.missingChatIdsDelta) - Math.abs(left.missingChatIdsDelta);
    if (missingDelta !== 0) {
      return missingDelta;
    }
    return left.questionId.localeCompare(right.questionId);
  });
}

export function analyzePhase63RecallDiagnostic(input: {
  baselineReport?: BeamReport;
  generatedAt: string;
  profile?: BeamProfile;
  report: BeamReport;
  reportPath: string;
  sourceContexts?: Map<string, Phase63RecallDiagnosticSourceCaseContext>;
  sourceContextWarning?: string;
  sourceTurnLimit?: number;
  baselineReportPath?: string;
}): Phase63RecallDiagnosticWorkbenchAnalysis {
  const profile = selectProfile({
    profile: input.profile,
    report: input.report,
  });
  const reportProfile = input.report.profiles[profile];
  if (!reportProfile) {
    throw new Error(`Recall diagnostic report has no ${profile} profile.`);
  }

  const sourceTurnLimit = input.sourceTurnLimit ?? DEFAULT_SOURCE_TURN_LIMIT;
  const caseEvidence = buildCaseEvidenceList({
    cases: reportProfile.cases,
    sourceContexts: input.sourceContexts,
    sourceTurnLimit,
  });
  const bucketSummaries = buildBucketSummaries(caseEvidence);
  const analysis: Phase63RecallDiagnosticWorkbenchAnalysis = {
    bucketSummaries,
    generatedAt: input.generatedAt,
    generatedBy: GENERATED_BY,
    globalSummary: summarizeGlobal(caseEvidence),
    incompleteRecallCases: caseEvidence.filter(
      (testCase) =>
        testCase.evidenceChatRecall !== null && testCase.evidenceChatRecall < 1,
    ),
    phase: "phase-63",
    profile,
    profileSummary: reportProfile.summary,
    reportPath: input.reportPath,
    runId: input.report.runId,
    sourceContextWarning: input.sourceContextWarning,
    zeroRecallCases: caseEvidence.filter(
      (testCase) =>
        testCase.evidenceChatRecall !== null && testCase.evidenceChatRecall === 0,
    ),
  };

  if (input.baselineReport) {
    const baselineProfile = selectProfile({
      profile,
      report: input.baselineReport,
    });
    const baselineReportProfile = input.baselineReport.profiles[baselineProfile];
    if (!baselineReportProfile) {
      throw new Error(
        `Baseline recall diagnostic report has no ${baselineProfile} profile.`,
      );
    }
    const baselineCaseEvidence = buildCaseEvidenceList({
      cases: baselineReportProfile.cases,
      sourceContexts: input.sourceContexts,
      sourceTurnLimit,
    });
    const baselineBuckets = buildBucketSummaries(baselineCaseEvidence);
    analysis.baseline = {
      profile: baselineProfile,
      reportPath: input.baselineReportPath ?? "",
      runId: input.baselineReport.runId,
    };
    analysis.bucketDeltas = buildBucketDeltas({
      after: bucketSummaries,
      baseline: baselineBuckets,
    });
    analysis.caseDeltas = buildCaseDeltas({
      after: caseEvidence,
      baseline: baselineCaseEvidence,
    });
  }

  return analysis;
}

function resolveDefaultReportPath(input: {
  outputDir?: string;
  root: string;
  runId?: string;
}): string {
  return join(
    input.outputDir ?? resolvePhase63OutputDir(input.root),
    input.runId ?? PHASE63_RECALL_DIAGNOSTIC_RUN_ID,
    "recall-diagnostic.json",
  );
}

export function parsePhase63RecallDiagnosticAnalysisCliOptions(
  argv: readonly string[],
): Phase63RecallDiagnosticAnalysisOptions {
  const profile = resolveCliFlagValueStrict(argv, "--profile") as BeamProfile | undefined;
  return {
    baselineReportPath: resolveCliFlagValueStrict(argv, "--baseline-report-path"),
    baselineRunId: resolveCliFlagValueStrict(argv, "--baseline-run-id"),
    benchmarkRoot: resolveCliFlagValueStrict(argv, "--benchmark-root"),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    profile,
    reportPath: resolveCliFlagValueStrict(argv, "--report-path"),
    runId: resolveCliFlagValueStrict(argv, "--run-id"),
    sourceTurnLimit: parseSourceTurnLimit(
      resolveCliFlagValueStrict(argv, "--source-turn-limit"),
    ),
  };
}

export async function runPhase63RecallDiagnosticAnalysis(
  options: Phase63RecallDiagnosticAnalysisOptions = {},
  dependencies: Phase63RecallDiagnosticAnalysisDependencies = {},
): Promise<Phase63RecallDiagnosticAnalysisRunResult> {
  const root = resolvePhase63RepoRoot();
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const now = dependencies.now ?? (() => new Date());
  const reportPath =
    options.reportPath ??
    resolveDefaultReportPath({
      outputDir: options.outputDir,
      root,
      runId: options.runId,
    });
  const report = JSON.parse(await readFileImpl(reportPath)) as BeamReport;
  const baselineReportPath =
    options.baselineReportPath ??
    (options.baselineRunId
      ? resolveDefaultReportPath({
        outputDir: options.outputDir,
        root,
        runId: options.baselineRunId,
      })
      : undefined);
  const baselineReport = baselineReportPath
    ? JSON.parse(await readFileImpl(baselineReportPath)) as BeamReport
    : undefined;
  let sourceContexts: Map<string, Phase63RecallDiagnosticSourceCaseContext> | undefined;
  let sourceContextWarning: string | undefined;
  const benchmarkRoot = options.benchmarkRoot ?? report.benchmarkRoot;
  if (benchmarkRoot) {
    try {
      const rows = await readPhase63BeamRows({
        benchmarkRoot,
        readFile: readFileImpl,
      });
      sourceContexts = buildSourceContexts({
        report,
        rows,
      });
    } catch (error) {
      sourceContextWarning = error instanceof Error ? error.message : String(error);
    }
  }

  const analysis = analyzePhase63RecallDiagnostic({
    baselineReport,
    baselineReportPath,
    generatedAt: now().toISOString(),
    profile: options.profile,
    report,
    reportPath,
    sourceContexts,
    sourceContextWarning,
    sourceTurnLimit: options.sourceTurnLimit,
  });
  const outputPath =
    options.outputPath ?? join(dirname(reportPath), "recall-diagnostic-analysis.json");

  await writeFileImpl(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
  return {
    analysis,
    outputPath,
  };
}

function buildCliSummary(
  result: Phase63RecallDiagnosticAnalysisRunResult,
): {
  baseline?: Phase63RecallDiagnosticWorkbenchAnalysis["baseline"];
  bucketDeltas?: Array<{
    averageEvidenceChatRecallDelta: number | null;
    category: string;
    incompleteRecallCasesDelta: number;
    totalHitEvidenceIdsDelta: number;
    totalMissingEvidenceIdsDelta: number;
    totalNoiseChatIdsDelta: number;
    wrongRecallCasesDelta: number;
    zeroRecallCasesDelta: number;
  }>;
  bucketSummaries: Phase63RecallDiagnosticBucketSummary[];
  caseDeltaCount?: number;
  globalSummary: Phase63RecallDiagnosticGlobalSummary;
  outputPath: string;
  profile: BeamProfile;
  runId: string;
  zeroRecallCaseCount: number;
} {
  return {
    baseline: result.analysis.baseline,
    bucketDeltas: result.analysis.bucketDeltas?.map((bucket) => ({
      averageEvidenceChatRecallDelta: bucket.averageEvidenceChatRecallDelta,
      category: bucket.category,
      incompleteRecallCasesDelta: bucket.incompleteRecallCasesDelta,
      totalHitEvidenceIdsDelta: bucket.totalHitEvidenceIdsDelta,
      totalMissingEvidenceIdsDelta: bucket.totalMissingEvidenceIdsDelta,
      totalNoiseChatIdsDelta: bucket.totalNoiseChatIdsDelta,
      wrongRecallCasesDelta: bucket.wrongRecallCasesDelta,
      zeroRecallCasesDelta: bucket.zeroRecallCasesDelta,
    })),
    bucketSummaries: result.analysis.bucketSummaries,
    caseDeltaCount: result.analysis.caseDeltas?.length,
    globalSummary: result.analysis.globalSummary,
    outputPath: result.outputPath,
    profile: result.analysis.profile,
    runId: result.analysis.runId,
    zeroRecallCaseCount: result.analysis.zeroRecallCases.length,
  };
}

if (import.meta.main) {
  const result = await runPhase63RecallDiagnosticAnalysis(
    parsePhase63RecallDiagnosticAnalysisCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(buildCliSummary(result), null, 2));
}
