import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertCliPathSegmentValue,
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import { resolvePhase63OutputDir, resolvePhase63RepoRoot } from "./run-phase-63-shared";
import type {
  BeamCaseResult,
  BeamProfile,
  BeamProfileReport,
  BeamReport,
} from "../src/eval/beam";

export const PHASE63_INITIAL_FULL_RUN_ID =
  "run-phase63-beam-100k-full-initial-20260518T000335Z";

export interface Phase63BeamReportAnalysisOptions {
  outputPath?: string;
  reportPath?: string;
  runId?: string;
}

export interface Phase63BeamReportAnalysisDependencies {
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

export interface Phase63BeamFailureBuckets {
  byCategory: Record<string, number>;
  byQuestionType: Record<string, number>;
  total: number;
}

export interface Phase63BeamRetrievalPressure {
  averageDistractorChatIds: number;
  averageEvidenceChatIds: number;
  averageRetrievedChatIds: number;
  casesWithDistractors: number;
  evidenceCases: number;
  maxRetrievedChatIds: number;
  totalDistractorChatIds: number;
  totalRetrievedChatIds: number;
}

export interface Phase63BeamProfileAnalysis {
  answerFailures: Phase63BeamFailureBuckets;
  missedRecall: Phase63BeamFailureBuckets;
  profile: BeamProfile;
  retrievalPressure: Phase63BeamRetrievalPressure;
  summary: BeamProfileReport["summary"];
  wrongRecall: Phase63BeamFailureBuckets;
}

export interface Phase63BeamDatasetAnalysis {
  abstentionCases: number;
  answerableCases: number;
  answerableWithoutEvidenceIds: number;
  caseCountsByCategory: Record<string, number>;
  evidenceCases: number;
  scale: BeamReport["summary"]["scale"];
  totalCases: number;
}

export interface Phase63BeamMissCaseAnalysis {
  boundaryFindings: string[];
  dataset: Phase63BeamDatasetAnalysis;
  generatedAt: string;
  generatedBy: "scripts/analyze-phase-63-beam-report.ts";
  nextActions: string[];
  phase: "phase-63";
  profiles: Partial<Record<BeamProfile, Phase63BeamProfileAnalysis>>;
  runId: string;
  sourceReportPath: string;
  status: "needs-live-retrieval-analysis";
}

export interface Phase63BeamReportAnalysisRunResult {
  analysis: Phase63BeamMissCaseAnalysis;
  outputPath: string;
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export function inferPhase63BeamCaseCategory(input: {
  questionId: string;
  questionType: string;
}): string {
  const parts = input.questionId.split(":");
  if (parts.length >= 3 && /^\d+$/u.test(parts[0] ?? "")) {
    const category = parts[1];
    if (category) {
      return category;
    }
  }
  return input.questionType;
}

function buildFailureBuckets(
  cases: readonly BeamCaseResult[],
  predicate: (testCase: BeamCaseResult) => boolean,
): Phase63BeamFailureBuckets {
  const byCategory: Record<string, number> = {};
  const byQuestionType: Record<string, number> = {};
  let total = 0;

  for (const testCase of cases) {
    if (!predicate(testCase)) {
      continue;
    }
    total += 1;
    increment(
      byCategory,
      inferPhase63BeamCaseCategory({
        questionId: testCase.questionId,
        questionType: testCase.questionType,
      }),
    );
    increment(byQuestionType, testCase.questionType);
  }

  return {
    byCategory,
    byQuestionType,
    total,
  };
}

function countDistractors(testCase: BeamCaseResult): number {
  const evidenceIds = new Set(testCase.evidenceChatIds);
  return testCase.retrievedChatIds.filter((id) => !evidenceIds.has(id)).length;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function analyzeRetrievalPressure(
  cases: readonly BeamCaseResult[],
): Phase63BeamRetrievalPressure {
  const totalRetrievedChatIds = cases.reduce(
    (sum, testCase) => sum + testCase.retrievedChatIds.length,
    0,
  );
  const totalEvidenceChatIds = cases.reduce(
    (sum, testCase) => sum + testCase.evidenceChatIds.length,
    0,
  );
  const distractorCounts = cases.map(countDistractors);
  const totalDistractorChatIds = distractorCounts.reduce(
    (sum, count) => sum + count,
    0,
  );
  const maxRetrievedChatIds = cases.reduce(
    (max, testCase) => Math.max(max, testCase.retrievedChatIds.length),
    0,
  );

  return {
    averageDistractorChatIds:
      cases.length === 0 ? 0 : roundMetric(totalDistractorChatIds / cases.length),
    averageEvidenceChatIds:
      cases.length === 0 ? 0 : roundMetric(totalEvidenceChatIds / cases.length),
    averageRetrievedChatIds:
      cases.length === 0 ? 0 : roundMetric(totalRetrievedChatIds / cases.length),
    casesWithDistractors: distractorCounts.filter((count) => count > 0).length,
    evidenceCases: cases.filter((testCase) => testCase.evidenceChatRecall !== null)
      .length,
    maxRetrievedChatIds,
    totalDistractorChatIds,
    totalRetrievedChatIds,
  };
}

function analyzeProfile(
  profile: BeamProfile,
  report: BeamProfileReport,
): Phase63BeamProfileAnalysis {
  return {
    answerFailures: buildFailureBuckets(
      report.cases,
      (testCase) => !testCase.correct,
    ),
    missedRecall: buildFailureBuckets(
      report.cases,
      (testCase) =>
        testCase.evidenceChatRecall !== null && testCase.evidenceChatRecall < 1,
    ),
    profile,
    retrievalPressure: analyzeRetrievalPressure(report.cases),
    summary: report.summary,
    wrongRecall: buildFailureBuckets(
      report.cases,
      (testCase) =>
        testCase.evidenceChatIds.length === 0
          ? testCase.retrievedChatIds.length > 0
          : testCase.retrievedChatIds.some(
              (id) => !testCase.evidenceChatIds.includes(id),
            ),
    ),
  };
}

function collectAllCases(report: BeamReport): BeamCaseResult[] {
  let selected: BeamCaseResult[] = [];
  for (const profile of report.summary.profilesCompared) {
    const cases = report.profiles[profile]?.cases ?? [];
    if (cases.length > selected.length) {
      selected = cases;
    }
  }
  return [...selected];
}

function analyzeDataset(report: BeamReport): Phase63BeamDatasetAnalysis {
  const cases = collectAllCases(report);
  const caseCountsByCategory: Record<string, number> = {};

  for (const testCase of cases) {
    increment(
      caseCountsByCategory,
      inferPhase63BeamCaseCategory({
        questionId: testCase.questionId,
        questionType: testCase.questionType,
      }),
    );
  }

  return {
    abstentionCases: cases.filter((testCase) => !testCase.answerable).length,
    answerableCases: cases.filter((testCase) => testCase.answerable).length,
    answerableWithoutEvidenceIds: cases.filter(
      (testCase) => testCase.answerable && testCase.evidenceChatIds.length === 0,
    ).length,
    caseCountsByCategory,
    evidenceCases: cases.filter((testCase) => testCase.evidenceChatRecall !== null)
      .length,
    scale: report.summary.scale,
    totalCases: report.summary.totalCases,
  };
}

function buildBoundaryFindings(report: BeamReport): string[] {
  const findings: string[] = [];
  const noMemory = report.profiles["baseline-no-memory"]?.summary;
  const fullContext = report.profiles["baseline-full-context"]?.summary;
  const goodMemoryProfiles = [
    report.profiles["goodmemory-rules-only"]?.summary,
    report.profiles["goodmemory-hybrid"]?.summary,
  ].filter((summary): summary is BeamProfileReport["summary"] => Boolean(summary));

  if (noMemory && noMemory.wrongAnswerCases > 0) {
    findings.push(
      "baseline-no-memory is the expected lower-bound control: it answers only abstention cases and misses answerable evidence.",
    );
  }
  if (fullContext && fullContext.wrongRecallCases > 0) {
    findings.push(
      "baseline-full-context is answer-complete but noise-heavy: retrieving every chat turn creates wrong-recall/token-pressure cases.",
    );
  }
  if (
    goodMemoryProfiles.length > 0 &&
    goodMemoryProfiles.every(
      (summary) =>
        summary.wrongAnswerCases === 0 &&
        summary.missedRecallCases === 0 &&
        summary.wrongRecallCases === 0,
    )
  ) {
    findings.push(
      "goodmemory profiles currently use deterministic oracle hypotheses/evidence ids; this report is not live GoodMemory answer-quality proof.",
    );
  }
  if (analyzeDataset(report).answerableWithoutEvidenceIds > 0) {
    findings.push(
      "some answerable BEAM cases have no source_chat_ids/evidence ids, so live analysis needs a source-id-blind answer-quality bucket.",
    );
  }

  return findings;
}

function buildNextActions(): string[] {
  return [
    "Add or run a real GoodMemory BEAM recall diagnostic that seeds chat turns and measures retrieved chat ids without oracle retrieval.",
    "Run a small live answer-generation plus judge slice after recall diagnostics identify representative evidence and noise failures.",
    "Only implement generic GoodMemory repairs after the real recall/live buckets show concrete reusable failure families.",
  ];
}

export function analyzePhase63BeamReport(
  report: BeamReport,
  input: {
    generatedAt: string;
    sourceReportPath: string;
  },
): Phase63BeamMissCaseAnalysis {
  const profiles: Partial<Record<BeamProfile, Phase63BeamProfileAnalysis>> = {};
  for (const profile of report.summary.profilesCompared) {
    const profileReport = report.profiles[profile];
    if (profileReport) {
      profiles[profile] = analyzeProfile(profile, profileReport);
    }
  }

  return {
    boundaryFindings: buildBoundaryFindings(report),
    dataset: analyzeDataset(report),
    generatedAt: input.generatedAt,
    generatedBy: "scripts/analyze-phase-63-beam-report.ts",
    nextActions: buildNextActions(),
    phase: "phase-63",
    profiles,
    runId: report.runId,
    sourceReportPath: input.sourceReportPath,
    status: "needs-live-retrieval-analysis",
  };
}

function resolveDefaultReportPath(root: string, runId?: string): string {
  return join(
    resolvePhase63OutputDir(root),
    runId ?? PHASE63_INITIAL_FULL_RUN_ID,
    "report.json",
  );
}

export function parsePhase63BeamAnalysisCliOptions(
  argv: readonly string[],
): Phase63BeamReportAnalysisOptions {
  return {
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    reportPath: resolveCliFlagValueStrict(argv, "--report-path"),
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
  };
}

export async function runPhase63BeamReportAnalysis(
  options: Phase63BeamReportAnalysisOptions = {},
  dependencies: Phase63BeamReportAnalysisDependencies = {},
): Promise<Phase63BeamReportAnalysisRunResult> {
  const root = resolvePhase63RepoRoot();
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const now = dependencies.now ?? (() => new Date());
  if (options.runId !== undefined) {
    assertCliPathSegmentValue({ flag: "--run-id", value: options.runId });
  }
  const reportPath = options.reportPath ?? resolveDefaultReportPath(root, options.runId);
  const outputPath =
    options.outputPath ?? join(dirname(reportPath), "miss-case-analysis.json");
  assertDistinctCliPathValues({
    firstFlag: "--output-path",
    firstValue: outputPath,
    secondFlag: "--report-path",
    secondValue: reportPath,
  });
  const report = JSON.parse(await readFileImpl(reportPath)) as BeamReport;
  const analysis = analyzePhase63BeamReport(report, {
    generatedAt: now().toISOString(),
    sourceReportPath: reportPath,
  });

  await writeFileImpl(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
  return {
    analysis,
    outputPath,
  };
}

if (import.meta.main) {
  const result = await runPhase63BeamReportAnalysis(
    parsePhase63BeamAnalysisCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(result.analysis, null, 2));
}
