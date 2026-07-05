import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertCliPathSegmentValue,
  hasCliFlagStrict,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import {
  resolvePhase62OutputDir,
  resolvePhase62RepoRoot,
} from "./run-phase-62-shared";
import {
  LONGMEMEVAL_PROFILES,
  normalizeLongMemEvalProfileList,
  type LongMemEvalCaseResult,
  type LongMemEvalProfile,
  type LongMemEvalProfileReport,
  type LongMemEvalProfileSummary,
  type LongMemEvalReport,
} from "../src/eval/longmemeval";

export const PHASE62_FULL500_CANONICAL_RUN_ID =
  "run-phase62-longmemeval-full500-live-four-profile-20260506T034826Z";

const GENERATED_BY = "scripts/run-phase-62-full500-summary.ts";
const DEFAULT_EXPECTED_TOTAL_CASES = 500;
const DEFAULT_SHARDS = 10;

export interface Phase62Full500SummaryOptions {
  allowDuplicateCaseCoverage?: boolean;
  expectedTotalCases?: number;
  outputDir?: string;
  profiles?: readonly string[];
  runId?: string;
  shardRunIds?: readonly string[];
  shards?: number;
}

export interface Phase62Full500SummaryDependencies {
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, value: string) => Promise<void>;
}

function parseBooleanFlag(argv: readonly string[], flagName: string): boolean {
  return hasCliFlagStrict(argv, flagName);
}

function parsePositiveInteger(
  value: string | undefined,
  flagName: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

function parseRepeatedFlag(
  argv: readonly string[],
  flagName: string,
): string[] | undefined {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flagName) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${flagName} requires a value`);
      }
      values.push(value);
    }
  }
  return values.length === 0 ? undefined : values;
}

export function parsePhase62Full500SummaryOptions(
  argv: readonly string[],
): Phase62Full500SummaryOptions {
  return {
    allowDuplicateCaseCoverage: parseBooleanFlag(
      argv,
      "--allow-duplicate-case-coverage",
    ),
    expectedTotalCases: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--expected-total-cases"),
      "--expected-total-cases",
    ),
    outputDir: resolveCliFlagValueStrict(argv, "--output-dir"),
    profiles: parseRepeatedFlag(argv, "--profile"),
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
    shardRunIds: parseRepeatedFlag(argv, "--shard-run-id"),
    shards: parsePositiveInteger(
      resolveCliFlagValueStrict(argv, "--shards"),
      "--shards",
    ),
  };
}

function buildDefaultShardRunIds(input: {
  runId: string;
  shards: number;
}): string[] {
  return Array.from(
    { length: input.shards },
    (_, index) => `${input.runId}-shard-${String(index + 1).padStart(2, "0")}`,
  );
}

function validateShardReport(input: {
  allowPartialProfileCoverage: boolean;
  path: string;
  profiles: readonly LongMemEvalProfile[];
  value: unknown;
}): LongMemEvalReport {
  const { path, value } = input;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Phase 62 shard report must be an object: ${path}`);
  }

  const report = value as LongMemEvalReport;
  if (report.phase !== "phase-62") {
    throw new Error(`Phase 62 full-500 summary requires a phase-62 report: ${path}`);
  }
  if (report.mode !== "full") {
    throw new Error(`Phase 62 full-500 summary requires full mode: ${path}`);
  }
  if (report.source?.benchmark !== "LongMemEval") {
    throw new Error(
      `Phase 62 full-500 summary requires a LongMemEval report: ${path}`,
    );
  }

  let presentProfiles = 0;
  for (const profile of input.profiles) {
    const profileReport = report.profiles[profile];
    if (!profileReport) {
      if (!input.allowPartialProfileCoverage) {
        throw new Error(`Shard report is missing profile ${profile}: ${path}`);
      }
      continue;
    }
    presentProfiles += 1;
    if (profileReport.cases.length !== report.summary.totalCases) {
      throw new Error(
        `Shard profile ${profile} case count does not match shard total: ${path}`,
      );
    }
  }
  if (presentProfiles === 0) {
    throw new Error(`Shard report is missing LongMemEval profiles: ${path}`);
  }

  return report;
}

function buildQuestionIds(cases: readonly LongMemEvalCaseResult[]): string[] {
  return cases.map((caseResult) => caseResult.questionId);
}

function assertSameCaseSet(input: {
  actual: readonly string[];
  expected: readonly string[];
  path: string;
  profile: LongMemEvalProfile;
}): void {
  if (
    input.actual.length !== input.expected.length ||
    input.actual.some((questionId, index) => questionId !== input.expected[index])
  ) {
    throw new Error(
      `Shard profile ${input.profile} does not match the shard case order: ${input.path}`,
    );
  }
}

function calculateWrongRecall(input: LongMemEvalCaseResult): boolean {
  const answerSessionIds = new Set(input.answerSessionIds);
  return input.retrievedSessionIds.some(
    (sessionId) => !answerSessionIds.has(sessionId),
  );
}

function isAbstentionCaseResult(caseResult: LongMemEvalCaseResult): boolean {
  return caseResult.questionId.endsWith("_abs") ||
    caseResult.answerSessionIds.length === 0;
}

function summarizeProfile(
  cases: readonly LongMemEvalCaseResult[],
): LongMemEvalProfileSummary {
  const correctCases = cases.filter((caseResult) => caseResult.correct).length;
  const evidenceCases = cases.filter(
    (caseResult) => caseResult.evidenceSessionRecall !== null,
  );
  const evidenceSessionRecallTotal = evidenceCases.reduce(
    (sum, caseResult) => sum + (caseResult.evidenceSessionRecall ?? 0),
    0,
  );

  return {
    accuracy: cases.length === 0 ? 1 : correctCases / cases.length,
    abstentionCorrectCases: cases.filter(
      (caseResult) => isAbstentionCaseResult(caseResult) && caseResult.correct,
    ).length,
    correctCases,
    evidenceCaseCount: evidenceCases.length,
    evidenceSessionRecall:
      evidenceCases.length === 0
        ? null
        : evidenceSessionRecallTotal / evidenceCases.length,
    missedRecallCases: evidenceCases.filter(
      (caseResult) => (caseResult.evidenceSessionRecall ?? 0) < 1,
    ).length,
    totalCases: cases.length,
    wrongAnswerCases: cases.length - correctCases,
    wrongRecallCases: cases.filter(calculateWrongRecall).length,
  };
}

function countByQuestionType(
  cases: readonly LongMemEvalCaseResult[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const caseResult of cases) {
    counts[caseResult.questionType] = (counts[caseResult.questionType] ?? 0) + 1;
  }
  return counts;
}

function mergeProfileReports(
  reports: readonly LongMemEvalReport[],
  referenceCases: readonly LongMemEvalCaseResult[],
  allowDuplicateCaseCoverage: boolean,
  profiles: readonly LongMemEvalProfile[],
): Partial<Record<LongMemEvalProfile, LongMemEvalProfileReport>> {
  const profileReports: Partial<Record<LongMemEvalProfile, LongMemEvalProfileReport>> = {};
  for (const profile of profiles) {
    const cases = allowDuplicateCaseCoverage
      ? mergeProfileCasesByQuestionId({
          profile,
          referenceCases,
          reports,
        })
      : reports.flatMap((report) => report.profiles[profile]?.cases ?? []);
    profileReports[profile] = {
      cases,
      summary: summarizeProfile(cases),
    };
  }
  return profileReports;
}

function shouldReplaceCaseResult(input: {
  candidate: LongMemEvalCaseResult;
  existing?: LongMemEvalCaseResult;
}): boolean {
  if (!input.existing) {
    return true;
  }
  if (input.candidate.executionError && !input.existing.executionError) {
    return false;
  }
  return true;
}

function mergeProfileCasesByQuestionId(input: {
  profile: LongMemEvalProfile;
  referenceCases: readonly LongMemEvalCaseResult[];
  reports: readonly LongMemEvalReport[];
}): LongMemEvalCaseResult[] {
  const casesByQuestionId = new Map<string, LongMemEvalCaseResult>();
  for (const report of input.reports) {
    const profileCases = report.profiles[input.profile]?.cases ?? [];
    for (const candidate of profileCases) {
      const existing = casesByQuestionId.get(candidate.questionId);
      if (shouldReplaceCaseResult({ candidate, existing })) {
        casesByQuestionId.set(candidate.questionId, candidate);
      }
    }
  }

  return input.referenceCases.map((referenceCase) => {
    const caseResult = casesByQuestionId.get(referenceCase.questionId);
    if (!caseResult) {
      throw new Error(
        `Phase 62 full-500 summary is missing profile ${input.profile} case ${referenceCase.questionId}`,
      );
    }
    return caseResult;
  });
}

function uniqueCasesByQuestionId(
  cases: readonly LongMemEvalCaseResult[],
): LongMemEvalCaseResult[] {
  const seen = new Set<string>();
  const unique: LongMemEvalCaseResult[] = [];
  for (const caseResult of cases) {
    if (seen.has(caseResult.questionId)) {
      continue;
    }
    seen.add(caseResult.questionId);
    unique.push(caseResult);
  }
  return unique;
}

function assertExpectedCoverage(input: {
  allowDuplicateCaseCoverage: boolean;
  expectedTotalCases: number;
  profiles: readonly LongMemEvalProfile[];
  reports: readonly LongMemEvalReport[];
}): LongMemEvalCaseResult[] {
  const referenceProfile = input.profiles[0];
  if (!referenceProfile) {
    throw new Error("Phase 62 full-500 summary requires at least one profile");
  }
  const referenceCases = input.reports.flatMap(
    (report) => report.profiles[referenceProfile]?.cases ?? [],
  );
  if (input.allowDuplicateCaseCoverage) {
    const uniqueBaselineCases = uniqueCasesByQuestionId(referenceCases);
    if (uniqueBaselineCases.length === input.expectedTotalCases) {
      return uniqueBaselineCases;
    }

    const uniqueAnyProfileCases = uniqueCasesByQuestionId(
      input.reports.flatMap((report) =>
        Object.values(report.profiles).flatMap(
          (profileReport) => profileReport?.cases ?? [],
        ),
      ),
    );
    if (uniqueAnyProfileCases.length !== input.expectedTotalCases) {
      throw new Error(
        `Phase 62 full-500 summary expected ${input.expectedTotalCases} unique cases but found ${uniqueAnyProfileCases.length}`,
      );
    }
    return uniqueAnyProfileCases;
  }

  const seen = new Set<string>();
  for (const questionId of buildQuestionIds(referenceCases)) {
    if (seen.has(questionId)) {
      throw new Error(`Phase 62 full-500 summary found duplicate case ${questionId}`);
    }
    seen.add(questionId);
  }
  if (seen.size !== input.expectedTotalCases) {
    throw new Error(
      `Phase 62 full-500 summary expected ${input.expectedTotalCases} unique cases but found ${seen.size}`,
    );
  }
  return referenceCases;
}

function validateShardCaseAlignment(input: {
  allowPartialProfileCoverage: boolean;
  path: string;
  profiles: readonly LongMemEvalProfile[];
  report: LongMemEvalReport;
}): void {
  const referenceProfile = input.profiles.find(
    (profile) => input.report.profiles[profile],
  );
  if (!referenceProfile) {
    throw new Error(`Shard report is missing LongMemEval profiles: ${input.path}`);
  }

  const reference = buildQuestionIds(
    input.report.profiles[referenceProfile]?.cases ?? [],
  );
  for (const profile of input.profiles) {
    const profileReport = input.report.profiles[profile];
    if (!profileReport && input.allowPartialProfileCoverage) {
      continue;
    }
    assertSameCaseSet({
      actual: buildQuestionIds(profileReport?.cases ?? []),
      expected: reference,
      path: input.path,
      profile,
    });
  }
}

export async function runPhase62Full500Summary(
  options: Phase62Full500SummaryOptions = {},
  dependencies: Phase62Full500SummaryDependencies = {},
): Promise<LongMemEvalReport> {
  const root = resolvePhase62RepoRoot();
  const outputDir = options.outputDir ?? resolvePhase62OutputDir(root);
  const runId = options.runId ?? PHASE62_FULL500_CANONICAL_RUN_ID;
  assertCliPathSegmentValue({ flag: "--run-id", value: runId });
  const profiles = normalizeLongMemEvalProfileList(options.profiles);
  const shardRunIds =
    options.shardRunIds ??
    buildDefaultShardRunIds({
      runId,
      shards: options.shards ?? DEFAULT_SHARDS,
    });
  const expectedTotalCases =
    options.expectedTotalCases ?? DEFAULT_EXPECTED_TOTAL_CASES;
  const readFileImpl =
    dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const writeFileImpl = dependencies.writeFile ?? writeFile;
  const now = dependencies.now ?? (() => new Date());

  const reports: LongMemEvalReport[] = [];
  for (const shardRunId of shardRunIds) {
    const path = join(outputDir, shardRunId, "report.json");
    const report = validateShardReport({
      allowPartialProfileCoverage: options.allowDuplicateCaseCoverage === true,
      path,
      profiles,
      value: JSON.parse(await readFileImpl(path)),
    });
    validateShardCaseAlignment({
      allowPartialProfileCoverage: options.allowDuplicateCaseCoverage === true,
      path,
      profiles,
      report,
    });
    reports.push(report);
  }

  const referenceCases = assertExpectedCoverage({
    allowDuplicateCaseCoverage: options.allowDuplicateCaseCoverage === true,
    expectedTotalCases,
    profiles,
    reports,
  });
  const profileReports = mergeProfileReports(
    reports,
    referenceCases,
    options.allowDuplicateCaseCoverage === true,
    profiles,
  );
  const runDirectory = join(outputDir, runId);
  const aggregateReport: LongMemEvalReport = {
    benchmarkRoot: reports[0]?.benchmarkRoot ?? "/tmp/LongMemEval",
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    mode: "full",
    outputDir,
    phase: "phase-62",
    profiles: profileReports,
    runDirectory,
    runId,
    source: {
      benchmark: "LongMemEval",
      license: "MIT code; dataset external",
      url: "https://github.com/xiaowu0162/LongMemEval",
    },
    summary: {
      abstentionCases: referenceCases.filter(
        isAbstentionCaseResult,
      ).length,
      caseCountsByQuestionType: countByQuestionType(referenceCases),
      executionFailures: Object.values(profileReports).reduce(
        (sum, profileReport) =>
          sum +
          profileReport.cases.filter((caseResult) => caseResult.executionError)
            .length,
        0,
      ),
      profilesCompared: [...profiles],
      totalCases: referenceCases.length,
    },
  };

  await mkdir(runDirectory, { recursive: true });
  await writeFileImpl(
    join(runDirectory, "report.json"),
    `${JSON.stringify(aggregateReport, null, 2)}\n`,
  );
  return aggregateReport;
}

if (import.meta.main) {
  const report = await runPhase62Full500Summary(
    parsePhase62Full500SummaryOptions(Bun.argv),
  );
  console.log(
    JSON.stringify(
      {
        executionFailures: report.summary.executionFailures,
        profiles: Object.fromEntries(
          LONGMEMEVAL_PROFILES.map((profile) => [
            profile,
            report.profiles[profile]?.summary,
          ]),
        ),
        runDirectory: report.runDirectory,
        runId: report.runId,
        totalCases: report.summary.totalCases,
      },
      null,
      2,
    ),
  );
}
