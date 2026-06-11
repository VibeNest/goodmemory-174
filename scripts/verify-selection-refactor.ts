import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BeamReport } from "../src/eval/beam";
import { runPhase63RecallDiagnosticAnalysis } from "./analyze-phase-63-recall-diagnostic";
import {
  runPhase63BeamRecallDiagnostic,
} from "./run-phase-63-beam-recall-diagnostic";
import { resolvePhase63OutputDir, resolvePhase63RepoRoot } from "./run-phase-63-shared";

export const SELECTION_REFACTOR_BASELINE_RUN_ID = "selection-refactor-baseline";
const DEFAULT_BENCHMARK_ROOT = "/private/tmp/BEAM";
const DEFAULT_PROFILE = "goodmemory-rules-only";
const DEFAULT_SCALE = "100K" as const;

export interface SelectionRefactorVerifyOptions {
  baselineRunId?: string;
  benchmarkRoot?: string;
  candidateRunId?: string;
  captureBaseline?: boolean;
  skipRun?: boolean;
}

export interface SelectionRefactorReportMismatch {
  detail: string;
  kind:
    | "case_count"
    | "missing_case"
    | "profile_missing"
    | "question_order"
    | "retrieved_chat_ids";
  questionId?: string;
}

export interface SelectionRefactorComparison {
  caseCount: number;
  mismatches: SelectionRefactorReportMismatch[];
}

interface ReportCaseView {
  questionId: string;
  retrievedChatIds: number[];
}

function readReportCases(
  report: BeamReport,
  profile: string,
): ReportCaseView[] | undefined {
  const profiles = report.profiles as Record<
    string,
    { cases?: Array<{ questionId: string; retrievedChatIds: number[] }> } | undefined
  >;
  const cases = profiles[profile]?.cases;
  if (!cases) {
    return undefined;
  }
  return cases.map((entry) => ({
    questionId: entry.questionId,
    retrievedChatIds: entry.retrievedChatIds,
  }));
}

export function comparePhase63RecallReports(input: {
  baseline: BeamReport;
  candidate: BeamReport;
  profile?: string;
}): SelectionRefactorComparison {
  const profile = input.profile ?? DEFAULT_PROFILE;
  const mismatches: SelectionRefactorReportMismatch[] = [];
  const baselineCases = readReportCases(input.baseline, profile);
  const candidateCases = readReportCases(input.candidate, profile);
  if (!baselineCases || !candidateCases) {
    mismatches.push({
      detail: `profile ${profile} missing from ${!baselineCases ? "baseline" : "candidate"} report`,
      kind: "profile_missing",
    });
    return { caseCount: 0, mismatches };
  }

  if (baselineCases.length !== candidateCases.length) {
    mismatches.push({
      detail: `case count baseline=${baselineCases.length} candidate=${candidateCases.length}`,
      kind: "case_count",
    });
  }

  const candidateByQuestionId = new Map(
    candidateCases.map((entry) => [entry.questionId, entry]),
  );
  for (const [index, baselineCase] of baselineCases.entries()) {
    const candidateCase = candidateByQuestionId.get(baselineCase.questionId);
    if (!candidateCase) {
      mismatches.push({
        detail: `case ${baselineCase.questionId} missing from candidate report`,
        kind: "missing_case",
        questionId: baselineCase.questionId,
      });
      continue;
    }

    if (candidateCases[index]?.questionId !== baselineCase.questionId) {
      mismatches.push({
        detail: `case order diverges at index ${index}: baseline=${baselineCase.questionId} candidate=${candidateCases[index]?.questionId}`,
        kind: "question_order",
        questionId: baselineCase.questionId,
      });
    }

    const baselineIds = baselineCase.retrievedChatIds.join(",");
    const candidateIds = candidateCase.retrievedChatIds.join(",");
    if (baselineIds !== candidateIds) {
      mismatches.push({
        detail: `retrievedChatIds baseline=[${baselineIds}] candidate=[${candidateIds}]`,
        kind: "retrieved_chat_ids",
        questionId: baselineCase.questionId,
      });
    }
  }

  return {
    caseCount: baselineCases.length,
    mismatches,
  };
}

export function parseSelectionRefactorVerifyCliOptions(
  argv: readonly string[],
): SelectionRefactorVerifyOptions {
  const readFlag = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };

  return {
    baselineRunId: readFlag("--baseline-run-id"),
    benchmarkRoot: readFlag("--benchmark-root"),
    candidateRunId: readFlag("--candidate-run-id"),
    captureBaseline: argv.includes("--capture-baseline"),
    skipRun: argv.includes("--skip-run"),
  };
}

async function readReport(runId: string): Promise<BeamReport> {
  const root = resolvePhase63RepoRoot();
  const reportPath = join(
    resolvePhase63OutputDir(root),
    runId,
    "recall-diagnostic.json",
  );
  return JSON.parse(await readFile(reportPath, "utf8")) as BeamReport;
}

async function gitShortSha(): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = (await new Response(proc.stdout).text()).trim();
    return output || "unknown";
  } catch {
    return "unknown";
  }
}

export async function runSelectionRefactorVerification(
  options: SelectionRefactorVerifyOptions = {},
): Promise<{ ok: boolean; comparison?: SelectionRefactorComparison }> {
  const baselineRunId =
    options.baselineRunId ?? SELECTION_REFACTOR_BASELINE_RUN_ID;
  const benchmarkRoot = options.benchmarkRoot ?? DEFAULT_BENCHMARK_ROOT;

  if (options.captureBaseline) {
    console.log(`Capturing selection-refactor baseline run: ${baselineRunId}`);
    await runPhase63BeamRecallDiagnostic({
      benchmarkRoot,
      profiles: [DEFAULT_PROFILE],
      runId: baselineRunId,
      scale: DEFAULT_SCALE,
    });
    console.log("Baseline captured.");
    return { ok: true };
  }

  const candidateRunId =
    options.candidateRunId ??
    `selection-refactor-candidate-${await gitShortSha()}`;
  if (!options.skipRun) {
    console.log(`Running candidate diagnostic: ${candidateRunId}`);
    await runPhase63BeamRecallDiagnostic({
      benchmarkRoot,
      profiles: [DEFAULT_PROFILE],
      runId: candidateRunId,
      scale: DEFAULT_SCALE,
    });
  }

  const [baselineReport, candidateReport] = await Promise.all([
    readReport(baselineRunId),
    readReport(candidateRunId),
  ]);
  const comparison = comparePhase63RecallReports({
    baseline: baselineReport,
    candidate: candidateReport,
  });

  const { analysis } = await runPhase63RecallDiagnosticAnalysis({
    baselineRunId,
    benchmarkRoot,
    runId: candidateRunId,
  });
  const caseDeltaCount = analysis.caseDeltas?.length ?? -1;

  if (comparison.mismatches.length === 0 && caseDeltaCount === 0) {
    console.log(
      `PASS: ${comparison.caseCount} cases byte-identical (ordered retrievedChatIds) and caseDeltas=0 vs ${baselineRunId}.`,
    );
    return { comparison, ok: true };
  }

  console.error(
    `FAIL: ${comparison.mismatches.length} ordered mismatches, analyzer caseDeltas=${caseDeltaCount}.`,
  );
  for (const mismatch of comparison.mismatches.slice(0, 10)) {
    console.error(
      `  [${mismatch.kind}] ${mismatch.questionId ?? "-"}: ${mismatch.detail}`,
    );
  }
  return { comparison, ok: false };
}

if (import.meta.main) {
  const result = await runSelectionRefactorVerification(
    parseSelectionRefactorVerifyCliOptions(Bun.argv),
  );
  if (!result.ok) {
    process.exit(1);
  }
}
