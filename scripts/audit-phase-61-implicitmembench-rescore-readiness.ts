import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";

const GENERATED_BY = "scripts/audit-phase-61-implicitmembench-rescore-readiness.ts";
const DEFAULT_OUTPUT_DIR = join(
  process.cwd(),
  "reports",
  "eval",
  "research",
  "phase-61",
  "implicitmembench",
);
const GOODMEMORY_COMPOSITE_PROFILE =
  "goodmemory-distilled-feedback+controlled-priming";
const GOODMEMORY_BLOCKING_SOURCE_PROFILE = "goodmemory-distilled-feedback";
const GOODMEMORY_PRIMING_SOURCE_PROFILE = "goodmemory-raw-experience";
const BASELINE_PROFILE = "baseline-upstream-chat";
const EXPECTED_FULL300_SHAPE = {
  baselineCases: 300,
  blockingCases: 200,
  goodmemoryCompositeCases: 300,
  primingCases: 100,
  structuredFirstActionCases: 35,
  textBehaviorJudgeCases: 165,
} as const;
const JUDGE_ENV_VARS = [
  "GOODMEMORY_JUDGE_BASE_URL",
  "GOODMEMORY_JUDGE_API_KEY",
  "GOODMEMORY_JUDGE_MODEL",
] as const;
const SCORER_FAMILIES = [
  "priming_pair_judge",
  "structured_first_action",
  "text_behavior_judge",
] as const;

type ScorerFamily = (typeof SCORER_FAMILIES)[number];

interface CliOptions {
  answerModel?: string;
  outputPath?: string;
  overallReportPath: string;
  runId?: string;
}

interface SourceArtifact {
  bytes: number;
  path: string;
  sha256: string;
}

interface EnvironmentReadiness {
  answerModel: string | null;
  independentJudgeReady: boolean;
  judgeGatewayReady: boolean;
  judgeModel: string | null;
  missingVars: string[];
  ready: boolean;
  requiredVars: string[];
  sameModelJudge: boolean | null;
}

interface CaseScopeSummary {
  baselineCaseCount: number;
  deterministicCaseCount: number;
  goodmemoryCompositeCaseCount: number;
  judgeRequiredCaseCount: number;
  primingJudgeCaseCount: number;
  structuredFirstActionCaseCount: number;
  textBehaviorJudgeCaseCount: number;
}

interface StoredAnswerSourceSummary {
  blockers: string[];
  caseCount: number;
  executionFailureCount: number;
  path: string;
  profiles: string[];
  ready: boolean;
  runId: string | null;
}

interface RescoreProfilePlan {
  blockingSourceProfile: string;
  compositeProfile: string;
  deterministicScorer: "structured_first_action";
  judgeRequiredScorers: ["text_behavior_judge", "priming_pair_judge"];
  primingSourceProfile: string;
}

export interface Phase61ImplicitMemBenchRescoreReadinessAudit {
  benchmark: "implicitmembench";
  blockers: string[];
  caseScope: CaseScopeSummary;
  environment: EnvironmentReadiness;
  generatedAt: string;
  generatedBy: string;
  outputPath: string | null;
  phase: "phase-61";
  readiness: {
    baselineStoredAnswersReady: boolean;
    goodmemoryCompositeStoredAnswersReady: boolean;
    liveIndependentJudgeReady: boolean;
    readyForIndependentJudgeRescore: boolean;
    storedAnswersReady: boolean;
  };
  rescorePlan: {
    note: string;
    profile: RescoreProfilePlan;
    sourceAnswersUnchanged: true;
  };
  runId: string;
  sourceArtifacts: {
    baselineReport: SourceArtifact | null;
    goodmemoryReport: SourceArtifact | null;
    overallReport: SourceArtifact;
  };
  sourceReports: {
    baseline: StoredAnswerSourceSummary | null;
    goodmemory: StoredAnswerSourceSummary | null;
  };
  sourceRunId: string | null;
  sourceScore: {
    baselineOverallRate: number | null;
    bestGoodMemoryOverallRate: number | null;
    goodmemoryCompositePassedEquivalent: number | null;
    goodmemoryCompositeTotal: number | null;
  };
}

interface AuditDependencies {
  env?: Record<string, string | undefined>;
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, data: string) => Promise<void>;
}

interface ReadJsonResult {
  artifact: SourceArtifact;
  parsed: unknown;
}

interface CaseRow {
  answer?: unknown;
  blocking?: unknown;
  caseId?: unknown;
  executionFailure?: unknown;
  firstActionRaw?: unknown;
  passed?: unknown;
  primingControlAnswer?: unknown;
  primingExperimentalAnswer?: unknown;
  profile?: unknown;
  scorerFamily?: unknown;
  sourceFile?: unknown;
}

interface RowValidationInput {
  expectedProfile: string;
  row: CaseRow;
  rowLabel: string;
}

interface ValidatedRows {
  blockers: string[];
  executionFailureCount: number;
  rows: CaseRow[];
}

interface SourceReportInspection {
  blockers: string[];
  casesByProfile: Map<string, CaseRow[]>;
  executionFailureCount: number;
  profiles: string[];
  runId: string | null;
  totalCases: number;
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const overallReportPath = resolveCliFlagValueStrict(argv, "--overall-report");
  if (overallReportPath === undefined) {
    throw new Error("--overall-report is required.");
  }
  return {
    answerModel: resolveCliFlagValueStrict(argv, "--answer-model"),
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    overallReportPath,
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScorerFamily(value: unknown): value is ScorerFamily {
  return typeof value === "string" && SCORER_FAMILIES.includes(value as ScorerFamily);
}

function strictString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readProfileCases(input: {
  profile: string;
  report: unknown;
  sourceLabel: string;
}): { blockers: string[]; cases: CaseRow[] } {
  const blockers: string[] = [];
  if (!isRecord(input.report)) {
    return {
      blockers: [`${input.sourceLabel} report must be a JSON object`],
      cases: [],
    };
  }
  const profiles = input.report.profiles;
  if (!isRecord(profiles)) {
    return {
      blockers: [`${input.sourceLabel} report missing profiles object`],
      cases: [],
    };
  }
  const profileSummary = profiles[input.profile];
  if (!isRecord(profileSummary)) {
    return {
      blockers: [`${input.sourceLabel} report missing profile ${input.profile}`],
      cases: [],
    };
  }
  const cases = profileSummary.cases;
  if (!Array.isArray(cases)) {
    return {
      blockers: [`${input.sourceLabel} profile ${input.profile} missing cases array`],
      cases: [],
    };
  }
  const caseRows: CaseRow[] = [];
  for (const [index, row] of cases.entries()) {
    if (!isRecord(row)) {
      blockers.push(
        `${input.sourceLabel} profile ${input.profile} cases[${index}] must be an object`,
      );
      continue;
    }
    caseRows.push(row);
  }
  return { blockers, cases: caseRows };
}

function inspectSourceReport(input: {
  path: string;
  report: unknown;
}): SourceReportInspection {
  const blockers: string[] = [];
  if (!isRecord(input.report)) {
    return {
      blockers: [`${input.path} must be a JSON object`],
      casesByProfile: new Map(),
      executionFailureCount: 0,
      profiles: [],
      runId: null,
      totalCases: 0,
    };
  }
  const profiles = input.report.profiles;
  if (!isRecord(profiles)) {
    return {
      blockers: [`${input.path} missing profiles object`],
      casesByProfile: new Map(),
      executionFailureCount: 0,
      profiles: [],
      runId: strictString(input.report.runId),
      totalCases: 0,
    };
  }
  const casesByProfile = new Map<string, CaseRow[]>();
  let executionFailureCount = 0;
  let totalCases = 0;
  for (const [profile, summary] of Object.entries(profiles)) {
    if (!isRecord(summary)) {
      blockers.push(`${input.path} profile ${profile} must be an object`);
      continue;
    }
    if (!Array.isArray(summary.cases)) {
      blockers.push(`${input.path} profile ${profile} missing cases array`);
      continue;
    }
    const rows: CaseRow[] = [];
    for (const [index, row] of summary.cases.entries()) {
      if (!isRecord(row)) {
        blockers.push(`${input.path} profile ${profile} cases[${index}] must be an object`);
        continue;
      }
      rows.push(row);
      if (typeof row.executionFailure === "string" && row.executionFailure.length > 0) {
        executionFailureCount += 1;
      }
    }
    casesByProfile.set(profile, rows);
    totalCases += rows.length;
  }

  return {
    blockers,
    casesByProfile,
    executionFailureCount,
    profiles: [...casesByProfile.keys()].sort(),
    runId: strictString(input.report.runId),
    totalCases,
  };
}

function sourceSummary(input: {
  blockers: string[];
  inspection: SourceReportInspection;
  path: string;
}): StoredAnswerSourceSummary {
  const blockers = [...input.blockers, ...input.inspection.blockers];
  return {
    blockers,
    caseCount: input.inspection.totalCases,
    executionFailureCount: input.inspection.executionFailureCount,
    path: input.path,
    profiles: input.inspection.profiles,
    ready: blockers.length === 0,
    runId: input.inspection.runId,
  };
}

function validateStoredAnswerRow(input: RowValidationInput): string[] {
  const blockers: string[] = [];
  const caseId = strictString(input.row.caseId);
  if (!caseId) {
    blockers.push(`${input.rowLabel} missing caseId`);
  }
  if (input.row.profile !== input.expectedProfile) {
    blockers.push(`${input.rowLabel} profile must be ${input.expectedProfile}`);
  }
  if (!isScorerFamily(input.row.scorerFamily)) {
    blockers.push(`${input.rowLabel} has unsupported scorerFamily`);
  }
  if (!strictString(input.row.sourceFile)) {
    blockers.push(`${input.rowLabel} missing sourceFile`);
  }
  if (typeof input.row.executionFailure === "string" && input.row.executionFailure.length > 0) {
    blockers.push(`${input.rowLabel} has executionFailure: ${input.row.executionFailure}`);
  }

  if (input.row.scorerFamily === "priming_pair_judge") {
    if (!strictString(input.row.primingControlAnswer)) {
      blockers.push(`${input.rowLabel} missing primingControlAnswer`);
    }
    if (!strictString(input.row.primingExperimentalAnswer)) {
      blockers.push(`${input.rowLabel} missing primingExperimentalAnswer`);
    }
    return blockers;
  }

  if (!strictString(input.row.answer)) {
    blockers.push(`${input.rowLabel} missing answer`);
  }
  return blockers;
}

function validateRows(input: {
  expectedProfile: string;
  rows: CaseRow[];
  sourceLabel: string;
}): ValidatedRows {
  const blockers: string[] = [];
  let executionFailureCount = 0;
  const seenCaseIds = new Set<string>();
  for (const [index, row] of input.rows.entries()) {
    const caseId = strictString(row.caseId);
    if (caseId) {
      if (seenCaseIds.has(caseId)) {
        blockers.push(`${input.sourceLabel} duplicate caseId ${caseId}`);
      }
      seenCaseIds.add(caseId);
    }
    if (typeof row.executionFailure === "string" && row.executionFailure.length > 0) {
      executionFailureCount += 1;
    }
    blockers.push(
      ...validateStoredAnswerRow({
        expectedProfile: input.expectedProfile,
        row,
        rowLabel: `${input.sourceLabel} case[${index}]${caseId ? ` ${caseId}` : ""}`,
      }),
    );
  }
  return { blockers, executionFailureCount, rows: input.rows };
}

function countScorers(rows: readonly CaseRow[]): Record<ScorerFamily, number> {
  return {
    priming_pair_judge: rows.filter((row) => row.scorerFamily === "priming_pair_judge").length,
    structured_first_action: rows.filter((row) => row.scorerFamily === "structured_first_action").length,
    text_behavior_judge: rows.filter((row) => row.scorerFamily === "text_behavior_judge").length,
  };
}

function pushCountBlocker(input: {
  actual: number;
  blockers: string[];
  expected: number;
  label: string;
}): void {
  if (input.actual !== input.expected) {
    input.blockers.push(
      `${input.label} expected ${input.expected}, found ${input.actual}`,
    );
  }
}

function readStrictEnvValue(
  env: Record<string, string | undefined>,
  name: string,
): string | null {
  const value = env[name];
  if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function envReadiness(input: {
  answerModel?: string;
  env: Record<string, string | undefined>;
}): EnvironmentReadiness {
  const missingVars: string[] = JUDGE_ENV_VARS.filter((name) => {
    const value = input.env[name];
    return typeof value !== "string" || value.trim().length === 0 || value.trim() !== value;
  });
  const answerModel =
    input.answerModel ?? readStrictEnvValue(input.env, "GOODMEMORY_EVAL_MODEL");
  if (!answerModel) {
    missingVars.push("GOODMEMORY_EVAL_MODEL or --answer-model");
  }
  const judgeModel = readStrictEnvValue(input.env, "GOODMEMORY_JUDGE_MODEL");
  const sameModelJudge =
    answerModel && judgeModel ? answerModel === judgeModel : null;
  const judgeGatewayReady = JUDGE_ENV_VARS.every(
    (name) => readStrictEnvValue(input.env, name) !== null,
  );
  const independentJudgeReady =
    judgeGatewayReady && Boolean(answerModel) && sameModelJudge === false;
  return {
    answerModel,
    independentJudgeReady,
    judgeGatewayReady,
    judgeModel,
    missingVars,
    ready: independentJudgeReady,
    requiredVars: [...JUDGE_ENV_VARS],
    sameModelJudge,
  };
}

async function readJsonWithFingerprint(input: {
  path: string;
  readFileImpl: (path: string) => Promise<string>;
}): Promise<ReadJsonResult> {
  const content = await input.readFileImpl(input.path);
  const hash = createHash("sha256").update(content).digest("hex");
  return {
    artifact: {
      bytes: Buffer.byteLength(content),
      path: input.path,
      sha256: hash,
    },
    parsed: JSON.parse(content) as unknown,
  };
}

function resolveOutputPath(options: CliOptions): string {
  const runId = options.runId ?? "implicitmembench-rescore-readiness-current";
  return options.outputPath ?? join(DEFAULT_OUTPUT_DIR, runId, "rescore-readiness.json");
}

function getSourceReportPath(input: {
  field: "baselineReportPath" | "goodmemoryReportPath";
  overallReport: unknown;
}): string | null {
  if (!isRecord(input.overallReport) || !isRecord(input.overallReport.sourceReports)) {
    return null;
  }
  return strictString(input.overallReport.sourceReports[input.field]);
}

function getSourceScore(overallReport: unknown): Phase61ImplicitMemBenchRescoreReadinessAudit["sourceScore"] {
  if (!isRecord(overallReport)) {
    return {
      baselineOverallRate: null,
      bestGoodMemoryOverallRate: null,
      goodmemoryCompositePassedEquivalent: null,
      goodmemoryCompositeTotal: null,
    };
  }
  const comparison = isRecord(overallReport.comparison) ? overallReport.comparison : {};
  const profiles = isRecord(overallReport.profiles) ? overallReport.profiles : {};
  const composite = isRecord(profiles[GOODMEMORY_COMPOSITE_PROFILE])
    ? profiles[GOODMEMORY_COMPOSITE_PROFILE]
    : {};
  const full300OverallScore = isRecord(composite.full300OverallScore)
    ? composite.full300OverallScore
    : {};
  return {
    baselineOverallRate: numberOrNull(comparison.baselineOverallRate),
    bestGoodMemoryOverallRate: numberOrNull(comparison.bestGoodMemoryOverallRate),
    goodmemoryCompositePassedEquivalent: numberOrNull(
      full300OverallScore.passedEquivalent,
    ),
    goodmemoryCompositeTotal: numberOrNull(full300OverallScore.total),
  };
}

export function parsePhase61ImplicitMemBenchRescoreReadinessCliOptions(
  argv: readonly string[],
): CliOptions {
  return parseCliOptions(argv);
}

export async function auditPhase61ImplicitMemBenchRescoreReadiness(
  options: CliOptions,
  dependencies: AuditDependencies = {},
): Promise<Phase61ImplicitMemBenchRescoreReadinessAudit> {
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const now = dependencies.now ?? (() => new Date());
  const env = dependencies.env ?? process.env;
  const outputPath = resolveOutputPath(options);
  assertDistinctCliPathValues({
    firstFlag: "--overall-report",
    firstValue: options.overallReportPath,
    secondFlag: "--output-path",
    secondValue: outputPath,
  });

  const blockers: string[] = [];
  const overall = await readJsonWithFingerprint({
    path: options.overallReportPath,
    readFileImpl,
  });
  const goodmemoryReportPath = getSourceReportPath({
    field: "goodmemoryReportPath",
    overallReport: overall.parsed,
  });
  const baselineReportPath = getSourceReportPath({
    field: "baselineReportPath",
    overallReport: overall.parsed,
  });
  if (!goodmemoryReportPath) {
    blockers.push("overall report missing sourceReports.goodmemoryReportPath");
  }
  if (!baselineReportPath) {
    blockers.push("overall report missing sourceReports.baselineReportPath");
  }

  const goodmemory = goodmemoryReportPath
    ? await readJsonWithFingerprint({ path: goodmemoryReportPath, readFileImpl })
    : null;
  const baseline = baselineReportPath
    ? await readJsonWithFingerprint({ path: baselineReportPath, readFileImpl })
    : null;
  const goodmemoryInspection = goodmemory
    ? inspectSourceReport({ path: goodmemory.artifact.path, report: goodmemory.parsed })
    : null;
  const baselineInspection = baseline
    ? inspectSourceReport({ path: baseline.artifact.path, report: baseline.parsed })
    : null;

  const goodmemoryBlocking = goodmemory
    ? readProfileCases({
        profile: GOODMEMORY_BLOCKING_SOURCE_PROFILE,
        report: goodmemory.parsed,
        sourceLabel: "goodmemory",
      })
    : { blockers: ["goodmemory source report missing"], cases: [] };
  const goodmemoryPriming = goodmemory
    ? readProfileCases({
        profile: GOODMEMORY_PRIMING_SOURCE_PROFILE,
        report: goodmemory.parsed,
        sourceLabel: "goodmemory",
      })
    : { blockers: ["goodmemory source report missing"], cases: [] };
  const baselineCases = baseline
    ? readProfileCases({
        profile: BASELINE_PROFILE,
        report: baseline.parsed,
        sourceLabel: "baseline",
      })
    : { blockers: ["baseline source report missing"], cases: [] };

  const goodmemoryCompositeRows = [
    ...goodmemoryBlocking.cases.filter((row) => row.blocking === true),
    ...goodmemoryPriming.cases.filter((row) => row.scorerFamily === "priming_pair_judge"),
  ];
  const goodmemoryComposite = validateRows({
    expectedProfile: GOODMEMORY_BLOCKING_SOURCE_PROFILE,
    rows: goodmemoryCompositeRows.filter((row) => row.scorerFamily !== "priming_pair_judge"),
    sourceLabel: "goodmemory composite blocking",
  });
  const goodmemoryPrimingRows = validateRows({
    expectedProfile: GOODMEMORY_PRIMING_SOURCE_PROFILE,
    rows: goodmemoryCompositeRows.filter((row) => row.scorerFamily === "priming_pair_judge"),
    sourceLabel: "goodmemory composite priming",
  });
  const baselineValidated = validateRows({
    expectedProfile: BASELINE_PROFILE,
    rows: baselineCases.cases,
    sourceLabel: "baseline",
  });
  blockers.push(
    ...goodmemoryBlocking.blockers,
    ...goodmemoryPriming.blockers,
    ...baselineCases.blockers,
    ...goodmemoryComposite.blockers,
    ...goodmemoryPrimingRows.blockers,
    ...baselineValidated.blockers,
  );

  const goodmemoryScorerCounts = countScorers(goodmemoryCompositeRows);
  const baselineScorerCounts = countScorers(baselineCases.cases);
  pushCountBlocker({
    actual: goodmemoryCompositeRows.length,
    blockers,
    expected: EXPECTED_FULL300_SHAPE.goodmemoryCompositeCases,
    label: "goodmemory composite rows",
  });
  pushCountBlocker({
    actual: baselineCases.cases.length,
    blockers,
    expected: EXPECTED_FULL300_SHAPE.baselineCases,
    label: "baseline rows",
  });
  pushCountBlocker({
    actual: goodmemoryCompositeRows.filter((row) => row.blocking === true).length,
    blockers,
    expected: EXPECTED_FULL300_SHAPE.blockingCases,
    label: "goodmemory blocking rows",
  });
  pushCountBlocker({
    actual: goodmemoryScorerCounts.priming_pair_judge,
    blockers,
    expected: EXPECTED_FULL300_SHAPE.primingCases,
    label: "goodmemory priming rows",
  });
  pushCountBlocker({
    actual: goodmemoryScorerCounts.structured_first_action,
    blockers,
    expected: EXPECTED_FULL300_SHAPE.structuredFirstActionCases,
    label: "goodmemory structured_first_action rows",
  });
  pushCountBlocker({
    actual: goodmemoryScorerCounts.text_behavior_judge,
    blockers,
    expected: EXPECTED_FULL300_SHAPE.textBehaviorJudgeCases,
    label: "goodmemory text_behavior_judge rows",
  });
  pushCountBlocker({
    actual: baselineScorerCounts.priming_pair_judge,
    blockers,
    expected: EXPECTED_FULL300_SHAPE.primingCases,
    label: "baseline priming rows",
  });
  pushCountBlocker({
    actual: baselineScorerCounts.structured_first_action,
    blockers,
    expected: EXPECTED_FULL300_SHAPE.structuredFirstActionCases,
    label: "baseline structured_first_action rows",
  });
  pushCountBlocker({
    actual: baselineScorerCounts.text_behavior_judge,
    blockers,
    expected: EXPECTED_FULL300_SHAPE.textBehaviorJudgeCases,
    label: "baseline text_behavior_judge rows",
  });

  const environment = envReadiness({
    answerModel: options.answerModel,
    env,
  });
  const storedAnswersReady = blockers.length === 0;
  const sourceRunId = isRecord(overall.parsed) ? strictString(overall.parsed.runId) : null;
  const runId = options.runId ?? "implicitmembench-rescore-readiness-current";

  return {
    benchmark: "implicitmembench",
    blockers,
    caseScope: {
      baselineCaseCount: baselineCases.cases.length,
      deterministicCaseCount: goodmemoryScorerCounts.structured_first_action,
      goodmemoryCompositeCaseCount: goodmemoryCompositeRows.length,
      judgeRequiredCaseCount:
        goodmemoryScorerCounts.text_behavior_judge +
        goodmemoryScorerCounts.priming_pair_judge,
      primingJudgeCaseCount: goodmemoryScorerCounts.priming_pair_judge,
      structuredFirstActionCaseCount: goodmemoryScorerCounts.structured_first_action,
      textBehaviorJudgeCaseCount: goodmemoryScorerCounts.text_behavior_judge,
    },
    environment,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    outputPath,
    phase: "phase-61",
    readiness: {
      baselineStoredAnswersReady:
        baselineValidated.blockers.length === 0 && baselineCases.cases.length === 300,
      goodmemoryCompositeStoredAnswersReady:
        goodmemoryComposite.blockers.length === 0 &&
        goodmemoryPrimingRows.blockers.length === 0 &&
        goodmemoryCompositeRows.length === 300,
      liveIndependentJudgeReady: environment.ready,
      readyForIndependentJudgeRescore: storedAnswersReady && environment.ready,
      storedAnswersReady,
    },
    rescorePlan: {
      note:
        "Stored-answer readiness only: independent-judge promotion still requires a separate rescore run to judge text_behavior_judge and priming_pair_judge rows without regenerating answers.",
      profile: {
        blockingSourceProfile: GOODMEMORY_BLOCKING_SOURCE_PROFILE,
        compositeProfile: GOODMEMORY_COMPOSITE_PROFILE,
        deterministicScorer: "structured_first_action",
        judgeRequiredScorers: ["text_behavior_judge", "priming_pair_judge"],
        primingSourceProfile: GOODMEMORY_PRIMING_SOURCE_PROFILE,
      },
      sourceAnswersUnchanged: true,
    },
    runId,
    sourceArtifacts: {
      baselineReport: baseline?.artifact ?? null,
      goodmemoryReport: goodmemory?.artifact ?? null,
      overallReport: overall.artifact,
    },
    sourceReports: {
      baseline:
        baseline && baselineInspection
          ? sourceSummary({
              blockers: baselineCases.blockers,
              inspection: baselineInspection,
              path: baseline.artifact.path,
            })
          : null,
      goodmemory:
        goodmemory && goodmemoryInspection
          ? sourceSummary({
              blockers: [...goodmemoryBlocking.blockers, ...goodmemoryPriming.blockers],
              inspection: goodmemoryInspection,
              path: goodmemory.artifact.path,
            })
          : null,
    },
    sourceRunId,
    sourceScore: getSourceScore(overall.parsed),
  };
}

export async function runPhase61ImplicitMemBenchRescoreReadinessAudit(
  options: CliOptions,
  dependencies: AuditDependencies = {},
): Promise<Phase61ImplicitMemBenchRescoreReadinessAudit> {
  const audit = await auditPhase61ImplicitMemBenchRescoreReadiness(options, dependencies);
  const mkdirImpl = dependencies.mkdir ?? mkdir;
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  if (!audit.outputPath) {
    return audit;
  }
  await mkdirImpl(dirname(audit.outputPath), { recursive: true });
  await writeFileImpl(audit.outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  return audit;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv);
  const audit = await runPhase61ImplicitMemBenchRescoreReadinessAudit(options);
  console.log(JSON.stringify(audit, null, 2));
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
