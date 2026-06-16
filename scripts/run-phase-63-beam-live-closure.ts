import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BeamCase, BeamProfile, BeamReport } from "../src/eval/beam";
import { normalizeBeamProfileList } from "../src/eval/beam";
import { resolveCliFlagValue } from "./cli-options";
import {
  flattenPhase63BeamCases,
  readPhase63BeamRows,
} from "./run-phase-63-beam-recall-diagnostic";
import {
  PHASE63_BEAM_LIVE_SLICE_REPORT_FILE_NAME,
  runPhase63BeamLiveSlice,
} from "./run-phase-63-beam-live-slice";
import type {
  Phase63BeamLiveSliceDependencies,
  Phase63BeamLiveSliceReport,
} from "./run-phase-63-beam-live-slice";
import {
  resolvePhase63OutputDir,
  resolvePhase63RepoRoot,
} from "./run-phase-63-shared";

export const PHASE63_BEAM_LIVE_CLOSURE_RUN_ID =
  "run-phase63-beam-100k-live-closure-current";
export const PHASE63_BEAM_LIVE_CLOSURE_REPORT_FILE_NAME =
  "phase-63-beam-closure-report.json";

const GENERATED_BY = "scripts/run-phase-63-beam-live-closure.ts";

export interface Phase63BeamLiveClosureCliOptions {
  benchmarkRoot?: string;
  outputDir?: string;
  profile?: BeamProfile;
  recallReportPath?: string;
  runId?: string;
  scale?: BeamCase["scale"];
}

export interface Phase63BeamLiveClosureReport {
  benchmarkRoot: string;
  generatedAt: string;
  generatedBy: typeof GENERATED_BY;
  liveReportPath: string;
  mode: "live-answer-closure";
  outputDir: string;
  phase: "phase-63";
  profile: BeamProfile;
  recallReportPath: string;
  runDirectory: string;
  runId: string;
  source: Phase63BeamLiveSliceReport["source"];
  status: "ready-for-gate";
  summary: {
    answerAccuracy: number;
    correctCases: number;
    evidenceCaseCount: number;
    evidenceChatRecall: number | null;
    executionFailures: number;
    expectedTotalCases: number;
    missedRecallCases: number;
    profilesCompared: BeamProfile[];
    recallDiagnosticEvidenceChatRecall: number | null;
    recallDiagnosticExecutionFailures: number;
    recallDiagnosticRunId: string;
    recallDiagnosticTotalCases: number;
    scale: BeamCase["scale"];
    totalCases: number;
    wrongAnswerCases: number;
    wrongRecallCases: number;
  };
}

export interface Phase63BeamLiveClosureDependencies
  extends Phase63BeamLiveSliceDependencies {
  runLiveSlice?: typeof runPhase63BeamLiveSlice;
}

function parseProfile(value: string | undefined): BeamProfile | undefined {
  if (!value) {
    return undefined;
  }
  const profiles = normalizeBeamProfileList([value]);
  if (profiles[0] !== "goodmemory-rules-only") {
    throw new Error(
      "Phase 63 BEAM live closure currently supports --profile goodmemory-rules-only.",
    );
  }
  return profiles[0];
}

function parseScale(value: string | undefined): BeamCase["scale"] | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "100K") {
    return value;
  }
  throw new Error("Phase 63 BEAM live closure currently supports --scale 100K.");
}

export function parsePhase63BeamLiveClosureCliOptions(
  argv: readonly string[],
): Phase63BeamLiveClosureCliOptions {
  return {
    benchmarkRoot:
      resolveCliFlagValue(argv, "--benchmark-root") ??
      process.env.GOODMEMORY_BEAM_ROOT,
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    profile: parseProfile(resolveCliFlagValue(argv, "--profile")),
    recallReportPath: resolveCliFlagValue(argv, "--recall-report"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    scale: parseScale(resolveCliFlagValue(argv, "--scale")),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRecallDiagnosticReport(input: {
  expectedTotalCases: number;
  profile: BeamProfile;
  report: unknown;
  scale: BeamCase["scale"];
}): BeamReport {
  if (!isRecord(input.report)) {
    throw new Error("Phase 63 BEAM closure requires a recall diagnostic object");
  }
  const report = input.report as unknown as BeamReport;
  if (report.phase !== "phase-63") {
    throw new Error("Phase 63 BEAM closure requires a phase-63 recall report");
  }
  if (report.mode !== "full") {
    throw new Error("Phase 63 BEAM closure requires a full recall diagnostic");
  }
  if (report.source?.benchmark !== "BEAM") {
    throw new Error("Phase 63 BEAM closure requires a BEAM recall report");
  }
  if (!report.profiles[input.profile]) {
    throw new Error(
      `Phase 63 BEAM recall report is missing profile ${input.profile}`,
    );
  }
  if (report.summary.scale !== input.scale) {
    throw new Error(`Phase 63 BEAM recall report must use ${input.scale}`);
  }
  if (report.summary.totalCases !== input.expectedTotalCases) {
    throw new Error(
      `Phase 63 BEAM recall report covers ${report.summary.totalCases} cases; expected ${input.expectedTotalCases}`,
    );
  }
  if (report.summary.executionFailures !== 0) {
    throw new Error("Phase 63 BEAM recall report must have zero execution failures");
  }
  return report;
}

function validateLiveClosureReport(input: {
  expectedTotalCases: number;
  profile: BeamProfile;
  report: Phase63BeamLiveSliceReport;
  scale: BeamCase["scale"];
}): void {
  if (input.report.phase !== "phase-63") {
    throw new Error("Phase 63 BEAM closure requires a phase-63 live report");
  }
  if (input.report.mode !== "live-answer-slice") {
    throw new Error("Phase 63 BEAM closure requires a live answer report");
  }
  if (input.report.source?.benchmark !== "BEAM") {
    throw new Error("Phase 63 BEAM closure requires a BEAM live report");
  }
  if (input.report.profile !== input.profile) {
    throw new Error(`Phase 63 BEAM live report must use profile ${input.profile}`);
  }
  if (input.report.summary.scale !== input.scale) {
    throw new Error(`Phase 63 BEAM live report must use ${input.scale}`);
  }
  if (input.report.summary.totalCases !== input.expectedTotalCases) {
    throw new Error(
      `Phase 63 BEAM live report covers ${input.report.summary.totalCases} cases; expected ${input.expectedTotalCases}`,
    );
  }
  if (input.report.summary.executionFailures !== 0) {
    throw new Error("Phase 63 BEAM live report must have zero execution failures");
  }
}

function getProfileEvidenceRecall(input: {
  profile: BeamProfile;
  report: BeamReport;
}): number | null {
  return input.report.profiles[input.profile]?.summary.evidenceChatRecall ?? null;
}

export async function runPhase63BeamLiveClosure(
  options: Phase63BeamLiveClosureCliOptions = {},
  dependencies: Phase63BeamLiveClosureDependencies = {},
): Promise<Phase63BeamLiveClosureReport> {
  const root = resolvePhase63RepoRoot();
  const benchmarkRoot = options.benchmarkRoot ?? process.env.GOODMEMORY_BEAM_ROOT;
  if (!benchmarkRoot) {
    throw new Error(
      "Phase 63 BEAM live closure requires --benchmark-root or GOODMEMORY_BEAM_ROOT.",
    );
  }
  if (!options.recallReportPath) {
    throw new Error("Phase 63 BEAM live closure requires --recall-report.");
  }

  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const now = dependencies.now ?? (() => new Date());
  const outputDir = options.outputDir ?? resolvePhase63OutputDir(root);
  const profile = options.profile ?? "goodmemory-rules-only";
  const runId = options.runId ?? PHASE63_BEAM_LIVE_CLOSURE_RUN_ID;
  const scale = options.scale ?? "100K";
  if (profile !== "goodmemory-rules-only") {
    throw new Error(
      "Phase 63 BEAM live closure currently supports goodmemory-rules-only only.",
    );
  }
  if (scale !== "100K") {
    throw new Error("Phase 63 BEAM live closure currently supports 100K only.");
  }

  const rows = await readPhase63BeamRows({
    benchmarkRoot,
    readFile: readFileImpl,
  });
  const expectedTotalCases = flattenPhase63BeamCases(rows, scale).length;
  const recallReport = validateRecallDiagnosticReport({
    expectedTotalCases,
    profile,
    report: JSON.parse(await readFileImpl(options.recallReportPath)),
    scale,
  });
  const runLiveSlice = dependencies.runLiveSlice ?? runPhase63BeamLiveSlice;
  const liveReport = await runLiveSlice(
    {
      benchmarkRoot,
      caseSelection: "all-cases",
      outputDir,
      profile,
      recallReportPath: options.recallReportPath,
      runId,
      scale,
    },
    dependencies,
  );
  validateLiveClosureReport({
    expectedTotalCases,
    profile,
    report: liveReport,
    scale,
  });

  const runDirectory = join(outputDir, runId);
  const report: Phase63BeamLiveClosureReport = {
    benchmarkRoot,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    liveReportPath: join(runDirectory, PHASE63_BEAM_LIVE_SLICE_REPORT_FILE_NAME),
    mode: "live-answer-closure",
    outputDir,
    phase: "phase-63",
    profile,
    recallReportPath: options.recallReportPath,
    runDirectory,
    runId,
    source: liveReport.source,
    status: "ready-for-gate",
    summary: {
      answerAccuracy:
        liveReport.summary.totalCases === 0
          ? 0
          : liveReport.summary.correctCases / liveReport.summary.totalCases,
      correctCases: liveReport.summary.correctCases,
      evidenceCaseCount: liveReport.summary.evidenceCaseCount,
      evidenceChatRecall: liveReport.summary.evidenceChatRecall,
      executionFailures: liveReport.summary.executionFailures,
      expectedTotalCases,
      missedRecallCases: liveReport.summary.missedRecallCases,
      profilesCompared: liveReport.summary.profilesCompared,
      recallDiagnosticEvidenceChatRecall: getProfileEvidenceRecall({
        profile,
        report: recallReport,
      }),
      recallDiagnosticExecutionFailures: recallReport.summary.executionFailures,
      recallDiagnosticRunId: recallReport.runId,
      recallDiagnosticTotalCases: recallReport.summary.totalCases,
      scale,
      totalCases: liveReport.summary.totalCases,
      wrongAnswerCases: liveReport.summary.wrongAnswerCases,
      wrongRecallCases: liveReport.summary.wrongRecallCases,
    },
  };

  await mkdirImpl(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, PHASE63_BEAM_LIVE_CLOSURE_REPORT_FILE_NAME),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function buildCliSummary(report: Phase63BeamLiveClosureReport): {
  liveReportPath: string;
  mode: "live-answer-closure";
  recallReportPath: string;
  reportPath: string;
  runDirectory: string;
  runId: string;
  status: "ready-for-gate";
  summary: Phase63BeamLiveClosureReport["summary"];
} {
  return {
    liveReportPath: report.liveReportPath,
    mode: report.mode,
    recallReportPath: report.recallReportPath,
    reportPath: join(
      report.runDirectory,
      PHASE63_BEAM_LIVE_CLOSURE_REPORT_FILE_NAME,
    ),
    runDirectory: report.runDirectory,
    runId: report.runId,
    status: report.status,
    summary: report.summary,
  };
}

if (import.meta.main) {
  const report = await runPhase63BeamLiveClosure(
    parsePhase63BeamLiveClosureCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(buildCliSummary(report), null, 2));
}
