// LoCoMo candidate-budget delta analyzer. This compares two Phase 65 smoke
// reports and quantifies retrieval gain against added noise so widened semantic
// admission probes can be ranked before any default-promotion discussion.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  LOCOMO_QA_CATEGORIES,
  type LocomoQaCategory,
} from "../src/eval/locomo";
import { resolveCliFlagValue } from "./cli-options";
import type {
  LocomoCategoryRetrievalSummary,
  LocomoSmokeReport,
} from "./run-phase-65-locomo-smoke";

export const LOCOMO_BUDGET_DELTA_FILE_NAME = "budget-delta.json";

const GENERATED_BY = "scripts/analyze-phase-65-locomo-budget-delta.ts";
const CLAIM_BOUNDARY =
  "Research diagnostic only; not a public release or benchmark claim.";

interface ReportInput {
  path: string;
  report: LocomoSmokeReport;
}

interface CliOptions {
  baselineReportPath: string;
  candidateReportPath: string;
  outputPath?: string;
  runId?: string;
}

export interface LocomoBudgetDeltaComparison {
  addedNoiseTurnTotal: number;
  averageEvidenceRecallDelta: number;
  baseline: LocomoBudgetDeltaSide;
  candidate: LocomoBudgetDeltaSide;
  category: LocomoQaCategory;
  fullyRetrievedDelta: number;
  noiseTurnDelta: number;
  questionCount: number;
  recallDeltaPer100AddedNoiseTurns: number | null;
}

interface LocomoBudgetDeltaSide {
  averageEvidenceRecall: number;
  fullyRetrievedCount: number;
  noiseTurnTotal: number;
  runId: string;
  semanticCandidateEmbeddingSource: LocomoSmokeReport["semanticCandidateEmbeddingSource"];
  semanticCandidates: LocomoSmokeReport["semanticCandidates"];
}

export interface LocomoBudgetDeltaAnalysis {
  baselineReport: { path: string; runId: string };
  benchmark: "locomo";
  candidateReport: { path: string; runId: string };
  claimBoundary: string;
  comparisons: LocomoBudgetDeltaComparison[];
  generatedAt: string;
  generatedBy: string;
  mode: LocomoSmokeReport["mode"];
  outputPath: string | null;
  phase: "phase-65";
  runId: string;
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const baselineReportPath = resolveCliFlagValue(argv, "--baseline-report");
  const candidateReportPath = resolveCliFlagValue(argv, "--candidate-report");
  if (!baselineReportPath) {
    throw new Error("LoCoMo budget-delta analysis requires --baseline-report.");
  }
  if (!candidateReportPath) {
    throw new Error("LoCoMo budget-delta analysis requires --candidate-report.");
  }
  return {
    baselineReportPath,
    candidateReportPath,
    outputPath: resolveCliFlagValue(argv, "--output-path"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSmokeReport(
  report: unknown,
  path: string,
): asserts report is LocomoSmokeReport {
  if (!isRecord(report)) {
    throw new Error(`Report ${path} must be a JSON object.`);
  }
  if (report.phase !== "phase-65" || report.benchmark !== "locomo") {
    throw new Error(`Report ${path} is not a Phase 65 LoCoMo smoke report.`);
  }
  if (!Array.isArray(report.categories)) {
    throw new Error(`Report ${path} must include categories[].`);
  }
}

function assertSameJsonField(
  fieldName: string,
  baselineValue: unknown,
  candidateValue: unknown,
): void {
  if (JSON.stringify(candidateValue) !== JSON.stringify(baselineValue)) {
    throw new Error(
      `Report ${fieldName} mismatch: baseline=${JSON.stringify(baselineValue)}, ` +
        `candidate=${JSON.stringify(candidateValue)}.`,
    );
  }
}

function validateCompatibleReports(input: {
  baseline: ReportInput;
  candidate: ReportInput;
}): void {
  const { baseline, candidate } = input;
  if (baseline.report.mode !== candidate.report.mode) {
    throw new Error(
      `Report mode mismatch: baseline=${baseline.report.mode}, ` +
        `candidate=${candidate.report.mode}.`,
    );
  }
  assertSameJsonField(
    "answerEvaluation",
    baseline.report.answerEvaluation,
    candidate.report.answerEvaluation,
  );
  assertSameJsonField(
    "benchmarkSource",
    baseline.report.benchmarkSource,
    candidate.report.benchmarkSource,
  );
  assertSameJsonField(
    "externalRoot",
    baseline.report.externalRoot,
    candidate.report.externalRoot,
  );
  assertSameJsonField("caseIds", baseline.report.caseIds, candidate.report.caseIds);
  assertSameJsonField(
    "questionCategories",
    baseline.report.questionCategories,
    candidate.report.questionCategories,
  );
  assertSameJsonField(
    "profilesCompared",
    baseline.report.profilesCompared,
    candidate.report.profilesCompared,
  );
  assertSameJsonField(
    "bm25Ranking",
    baseline.report.bm25Ranking,
    candidate.report.bm25Ranking,
  );
  assertSameJsonField(
    "ingestMode",
    baseline.report.ingestMode,
    candidate.report.ingestMode,
  );
  assertSameJsonField(
    "answerContextMode",
    baseline.report.answerContextMode ?? "legacy-unrecorded",
    candidate.report.answerContextMode ?? "legacy-unrecorded",
  );
  assertSameJsonField(
    "allowCommonsenseResolution",
    baseline.report.allowCommonsenseResolution ?? false,
    candidate.report.allowCommonsenseResolution ?? false,
  );
  assertSameJsonField(
    "semanticCandidateEmbeddingSource",
    baseline.report.semanticCandidateEmbeddingSource,
    candidate.report.semanticCandidateEmbeddingSource,
  );
  if (baseline.report.executionFailures > 0) {
    throw new Error(
      `Baseline report ${baseline.path} has ${baseline.report.executionFailures} execution failure(s).`,
    );
  }
  if (candidate.report.executionFailures > 0) {
    throw new Error(
      `Candidate report ${candidate.path} has ${candidate.report.executionFailures} execution failure(s).`,
    );
  }
}

function categoryMap(
  report: LocomoSmokeReport,
): Map<LocomoQaCategory, LocomoCategoryRetrievalSummary> {
  return new Map(
    report.categories.map((summary) => [summary.category, summary]),
  );
}

function side(
  report: LocomoSmokeReport,
  summary: LocomoCategoryRetrievalSummary,
): LocomoBudgetDeltaSide {
  return {
    averageEvidenceRecall: summary.averageEvidenceRecall,
    fullyRetrievedCount: summary.fullyRetrievedCount,
    noiseTurnTotal: summary.noiseTurnTotal,
    runId: report.runId,
    semanticCandidateEmbeddingSource: report.semanticCandidateEmbeddingSource,
    semanticCandidates: report.semanticCandidates,
  };
}

function questionIdentitiesForCategory(
  report: LocomoSmokeReport,
  category: LocomoQaCategory,
): string[] {
  return report.cases
    .filter((result) => result.category === category)
    .map((result) => `${result.caseId}::${result.questionId}`);
}

function assertSameQuestionIdentity(input: {
  baseline: ReportInput;
  baselineSummary: LocomoCategoryRetrievalSummary;
  candidate: ReportInput;
  candidateSummary: LocomoCategoryRetrievalSummary;
}): void {
  const baselineIdentities = questionIdentitiesForCategory(
    input.baseline.report,
    input.baselineSummary.category,
  );
  const candidateIdentities = questionIdentitiesForCategory(
    input.candidate.report,
    input.candidateSummary.category,
  );
  if (
    baselineIdentities.length !== input.baselineSummary.questionCount ||
    candidateIdentities.length !== input.candidateSummary.questionCount
  ) {
    throw new Error(
      `Category ${input.baselineSummary.category} question identity cannot be ` +
        "validated because cases[] does not match the category questionCount.",
    );
  }
  if (JSON.stringify(candidateIdentities) !== JSON.stringify(baselineIdentities)) {
    throw new Error(
      `Category ${input.baselineSummary.category} question identity mismatch.`,
    );
  }
}

function compareCategory(input: {
  baseline: ReportInput;
  baselineSummary: LocomoCategoryRetrievalSummary;
  candidate: ReportInput;
  candidateSummary: LocomoCategoryRetrievalSummary;
}): LocomoBudgetDeltaComparison {
  const { baseline, baselineSummary, candidate, candidateSummary } = input;
  if (baselineSummary.questionCount !== candidateSummary.questionCount) {
    throw new Error(
      `Category ${baselineSummary.category} questionCount mismatch: ` +
        `baseline=${baselineSummary.questionCount}, ` +
      `candidate=${candidateSummary.questionCount}.`,
    );
  }
  assertSameQuestionIdentity(input);
  const averageEvidenceRecallDelta =
    candidateSummary.averageEvidenceRecall -
    baselineSummary.averageEvidenceRecall;
  const noiseTurnDelta =
    candidateSummary.noiseTurnTotal - baselineSummary.noiseTurnTotal;
  const addedNoiseTurnTotal = Math.max(0, noiseTurnDelta);

  return {
    addedNoiseTurnTotal,
    averageEvidenceRecallDelta,
    baseline: side(baseline.report, baselineSummary),
    candidate: side(candidate.report, candidateSummary),
    category: baselineSummary.category,
    fullyRetrievedDelta:
      candidateSummary.fullyRetrievedCount -
      baselineSummary.fullyRetrievedCount,
    noiseTurnDelta,
    questionCount: baselineSummary.questionCount,
    recallDeltaPer100AddedNoiseTurns:
      addedNoiseTurnTotal === 0
        ? null
        : (averageEvidenceRecallDelta / addedNoiseTurnTotal) * 100,
  };
}

function defaultOutputPath(candidateReportPath: string, runId: string): string {
  return join(
    dirname(candidateReportPath),
    "..",
    runId,
    LOCOMO_BUDGET_DELTA_FILE_NAME,
  );
}

export function analyzeLocomoBudgetDelta(input: {
  baseline: ReportInput;
  candidate: ReportInput;
  generatedAt?: string;
  outputPath?: string;
  runId?: string;
}): LocomoBudgetDeltaAnalysis {
  validateCompatibleReports(input);
  const baselineByCategory = categoryMap(input.baseline.report);
  const candidateByCategory = categoryMap(input.candidate.report);
  const comparisons: LocomoBudgetDeltaComparison[] = [];

  for (const category of LOCOMO_QA_CATEGORIES) {
    const baselineSummary = baselineByCategory.get(category);
    const candidateSummary = candidateByCategory.get(category);
    if (
      !baselineSummary ||
      !candidateSummary ||
      baselineSummary.questionCount === 0 ||
      candidateSummary.questionCount === 0
    ) {
      continue;
    }
    comparisons.push(
      compareCategory({
        baseline: input.baseline,
        baselineSummary,
        candidate: input.candidate,
        candidateSummary,
      }),
    );
  }

  if (comparisons.length === 0) {
    throw new Error(
      "LoCoMo budget-delta analysis found no overlapping non-empty categories.",
    );
  }

  return {
    baselineReport: {
      path: input.baseline.path,
      runId: input.baseline.report.runId,
    },
    benchmark: "locomo",
    candidateReport: {
      path: input.candidate.path,
      runId: input.candidate.report.runId,
    },
    claimBoundary: CLAIM_BOUNDARY,
    comparisons,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    generatedBy: GENERATED_BY,
    mode: input.baseline.report.mode,
    outputPath: input.outputPath ?? null,
    phase: "phase-65",
    runId: input.runId ?? "locomo-budget-delta-current",
  };
}

export async function runLocomoBudgetDeltaAnalysis(
  argv: readonly string[],
  deps: {
    mkdir?: (path: string, options: { recursive: boolean }) => Promise<unknown>;
    now?: () => Date;
    readFile?: (path: string) => Promise<string>;
    writeFile?: (path: string, value: string) => Promise<void>;
  } = {},
): Promise<{ analysis: LocomoBudgetDeltaAnalysis; outputPath: string }> {
  const options = parseCliOptions(argv);
  const readFileImpl = deps.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = deps.writeFile ?? writeFile;
  const mkdirImpl = deps.mkdir ?? mkdir;
  const outputPath =
    options.outputPath ??
    defaultOutputPath(
      options.candidateReportPath,
      options.runId ?? "locomo-budget-delta-current",
    );

  const baselineParsed = JSON.parse(
    await readFileImpl(options.baselineReportPath),
  ) as unknown;
  const candidateParsed = JSON.parse(
    await readFileImpl(options.candidateReportPath),
  ) as unknown;
  assertSmokeReport(baselineParsed, options.baselineReportPath);
  assertSmokeReport(candidateParsed, options.candidateReportPath);

  const analysis = analyzeLocomoBudgetDelta({
    baseline: {
      path: options.baselineReportPath,
      report: baselineParsed,
    },
    candidate: {
      path: options.candidateReportPath,
      report: candidateParsed,
    },
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    outputPath,
    runId: options.runId,
  });
  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(analysis, null, 2)}\n`);
  return { analysis, outputPath };
}

if (import.meta.main) {
  runLocomoBudgetDeltaAnalysis(process.argv)
    .then(({ analysis, outputPath }) => {
      process.stdout.write(
        `${JSON.stringify(
          {
            comparisons: analysis.comparisons,
            outputPath,
            runId: analysis.runId,
          },
          null,
          2,
        )}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `LoCoMo budget-delta analysis failed: ${String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
