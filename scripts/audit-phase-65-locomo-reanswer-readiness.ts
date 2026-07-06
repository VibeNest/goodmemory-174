import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { LOCOMO_QA_CATEGORIES } from "../src/eval/locomo";
import type { LocomoQaCategory } from "../src/eval/locomo";
import {
  assertDistinctCliPathValues,
  resolveCliFlagValueStrict,
  resolveCliPathSegmentFlagValueStrict,
} from "./cli-options";
import { LOCOMO_REANSWER_JOB_BUCKET_SET } from "./locomo-reanswer-contracts";
import {
  assertLocomoReportHasCompleteLiveAnswers,
  assertLocomoReportQuestionCountMatchesCases,
} from "./locomo-report-compatibility";
import type { LocomoSmokeReport } from "./run-phase-65-locomo-smoke";

const GENERATED_BY = "scripts/audit-phase-65-locomo-reanswer-readiness.ts";
const REANSWER_GENERATED_BY = "scripts/reanswer-phase-65-locomo-report.ts";
const LIVE_ANSWER_ENV_VARS = [
  "GOODMEMORY_EVAL_PROVIDER",
  "GOODMEMORY_EVAL_MODEL",
  "GOODMEMORY_EVAL_API_KEY",
] as const;
const PROVIDER_EMBEDDING_ENV_VARS = [
  "GOODMEMORY_EMBEDDING_PROVIDER",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_API_KEY",
] as const;
const DEFAULT_OUTPUT_DIR = join(
  process.cwd(),
  "reports",
  "eval",
  "research",
  "phase-65",
  "locomo",
);
const LOCOMO_QA_CATEGORY_SET: ReadonlySet<string> = new Set(LOCOMO_QA_CATEGORIES);

interface CliOptions {
  manifestPath: string;
  outputPath?: string;
  runId?: string;
}

type EnvironmentRequirementGroup = "live-answer" | "provider-embedding";

interface EnvironmentReadiness {
  missingVars: string[];
  ready: boolean;
  requiredGroups: EnvironmentRequirementGroup[];
  requiredVars: string[];
}

interface ManifestReanswerJob {
  bucket: string | null;
  category: LocomoQaCategory | null;
  index: number;
  questionCount: number | null;
  questionIds: string[];
  sourceReportPath: string | null;
  sourceRunId: string | null;
}

interface ParsedManifest {
  jobs: ManifestReanswerJob[];
  perBucket: number | null;
}

interface SourceReadiness {
  allowCommonsenseResolution: boolean | null;
  answerContextMode: string | null;
  benchmarkRoot: string | null;
  blockers: string[];
  bm25Ranking: boolean | null;
  executionFailures: number | null;
  generatedBy: string | null;
  ingestMode: string | null;
  path: string;
  questionCount: number | null;
  questionCategories: LocomoQaCategory[] | null;
  ready: boolean;
  runId: string | null;
  semanticCandidateEmbeddingSource: string | null;
  semanticCandidates: {
    enabled: boolean;
    maxAdditions: number | null;
    minRelativeScore: number | null;
    minSimilarity: number | null;
    topK: number | null;
  } | null;
  strictNoEvidenceAbstention: boolean | null;
}

interface SourceRefreshPlan {
  blockers: string[];
  categories: LocomoQaCategory[];
  command: string | null;
  questionIds: string[];
  refreshedReportPath: string;
  sourceReportPath: string;
  sourceRunId: string | null;
  targetRunId: string;
}

interface ManifestRefreshPlan {
  command: string | null;
  outputPath: string;
  runId: string;
  sourceReportPaths: string[];
}

interface ReplayPlanCommand {
  bucket: string | null;
  category: LocomoQaCategory | null;
  command: string;
  manifestPath: string;
  questionCount: number | null;
  questionIds: string[];
  sourceReportPath: string;
  sourceRunId: string | null;
  targetRunId: string;
}

export interface LocomoReanswerReadinessAudit {
  benchmark: "locomo";
  blockedJobs: Array<{
    blockers: string[];
    bucket: string | null;
    category: LocomoQaCategory | null;
    index: number;
    questionCount: number | null;
    questionIds: string[];
    sourceReportPath: string | null;
    sourceRunId: string | null;
  }>;
  generatedAt: string;
  generatedBy: string;
  manifestPath: string;
  outputPath: string | null;
  phase: "phase-65";
  readyJobs: Array<{
    bucket: string | null;
    category: LocomoQaCategory | null;
    index: number;
    questionCount: number | null;
    questionIds: string[];
    sourceReportPath: string;
    sourceRunId: string | null;
  }>;
  refreshPlan: {
    environment: EnvironmentReadiness;
    manifest: ManifestRefreshPlan | null;
    note: string;
    sourceReports: SourceRefreshPlan[];
  };
  replayPlan: {
    commands: ReplayPlanCommand[];
    environment: EnvironmentReadiness;
    note: string;
  };
  runId: string;
  sourceReports: SourceReadiness[];
  summary: {
    blockedJobCount: number;
    jobCount: number;
    readyJobCount: number;
    sourceReportCount: number;
  };
}

export interface LocomoReanswerReadinessDependencies {
  env?: Record<string, string | undefined>;
  mkdir?: typeof mkdir;
  now?: () => Date;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, data: string) => Promise<void>;
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const manifestPath = resolveCliFlagValueStrict(argv, "--manifest");
  if (manifestPath === undefined) {
    throw new Error("--manifest is required.");
  }
  return {
    manifestPath,
    outputPath: resolveCliFlagValueStrict(argv, "--output-path"),
    runId: resolveCliPathSegmentFlagValueStrict(argv, "--run-id"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" ? value : null;
}

function optionalManifestStringField(input: {
  field: string;
  index: number;
  record: Record<string, unknown>;
}): string | null {
  const value = input.record[input.field];
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`reanswerJobs[${input.index}].${input.field} must be a string.`);
  }
  if (value.trim().length === 0) {
    throw new Error(`reanswerJobs[${input.index}].${input.field} must not be empty.`);
  }
  if (value.trim() !== value) {
    throw new Error(
      `reanswerJobs[${input.index}].${input.field} must not have leading or trailing whitespace.`,
    );
  }
  return value;
}

function parseQuestionIds(value: unknown, index: number): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`reanswerJobs[${index}].questionIds must be an array.`);
  }
  const questionIds: string[] = [];
  const seen = new Set<string>();
  for (const [questionIndex, questionId] of value.entries()) {
    if (typeof questionId !== "string") {
      throw new Error(
        `reanswerJobs[${index}].questionIds[${questionIndex}] must be a string.`,
      );
    }
    if (questionId.trim().length === 0) {
      throw new Error(
        `reanswerJobs[${index}].questionIds[${questionIndex}] must not be empty.`,
      );
    }
    if (questionId.trim() !== questionId) {
      throw new Error(
        `reanswerJobs[${index}].questionIds[${questionIndex}] must not have leading or trailing whitespace.`,
      );
    }
    if (seen.has(questionId)) {
      throw new Error(`reanswerJobs[${index}] contains duplicate questionId ${questionId}.`);
    }
    seen.add(questionId);
    questionIds.push(questionId);
  }
  return questionIds;
}

function parseManifestReanswerJobs(rawManifest: unknown): ParsedManifest {
  if (!isRecord(rawManifest)) {
    throw new Error("LoCoMo reanswer readiness manifest must be a JSON object.");
  }
  if (rawManifest.benchmark !== "locomo") {
    throw new Error("LoCoMo reanswer readiness manifest benchmark must be locomo.");
  }
  const rawJobs = rawManifest.reanswerJobs;
  if (!Array.isArray(rawJobs)) {
    throw new Error("LoCoMo reanswer readiness manifest reanswerJobs must be an array.");
  }
  const overall = isRecord(rawManifest.overall) ? rawManifest.overall : null;
  const perBucketValue = overall?.perBucket;
  const perBucket =
    typeof perBucketValue === "number" && Number.isSafeInteger(perBucketValue)
      ? perBucketValue
      : null;
  const jobs = rawJobs.map((rawJob, index) => {
    if (!isRecord(rawJob)) {
      throw new Error(`reanswerJobs[${index}] must be an object.`);
    }
    const bucket = stringField(rawJob, "bucket");
    if (bucket !== null && !LOCOMO_REANSWER_JOB_BUCKET_SET.has(bucket)) {
      throw new Error(`reanswerJobs[${index}].bucket ${bucket} is not recognized.`);
    }
    const rawCategory = stringField(rawJob, "category");
    if (rawCategory !== null && !LOCOMO_QA_CATEGORY_SET.has(rawCategory)) {
      throw new Error(`reanswerJobs[${index}].category ${rawCategory} is not recognized.`);
    }
    const category = rawCategory as LocomoQaCategory | null;
    const questionCountValue = rawJob.questionCount;
    const questionCount =
      typeof questionCountValue === "number" && Number.isSafeInteger(questionCountValue)
        ? questionCountValue
        : null;
    const questionIds = parseQuestionIds(rawJob.questionIds, index);
    if (questionCount !== null && questionCount !== questionIds.length) {
      throw new Error(
        `reanswerJobs[${index}].questionCount ${questionCount} does not match ` +
          `${questionIds.length} questionIds.`,
      );
    }
    return {
      bucket,
      category,
      index,
      questionCount,
      questionIds,
      sourceReportPath: optionalManifestStringField({
        field: "sourceReportPath",
        index,
        record: rawJob,
      }),
      sourceRunId: optionalManifestStringField({
        field: "sourceRunId",
        index,
        record: rawJob,
      }),
    };
  });
  return { jobs, perBucket };
}

function assertLocomoSmokeReport(
  value: unknown,
  path: string,
): asserts value is LocomoSmokeReport {
  if (
    !isRecord(value) ||
    value.benchmark !== "locomo" ||
    !Array.isArray(value.cases)
  ) {
    throw new Error(`Invalid LoCoMo smoke report: ${path}`);
  }
}

function normalizeSemanticCandidates(
  value: LocomoSmokeReport["semanticCandidates"],
): SourceReadiness["semanticCandidates"] {
  return {
    enabled: value.enabled,
    maxAdditions: value.maxAdditions ?? null,
    minRelativeScore: value.minRelativeScore ?? null,
    minSimilarity: value.minSimilarity ?? null,
    topK: value.topK ?? null,
  };
}

async function loadSourceReadiness(input: {
  path: string;
  readFile: (path: string) => Promise<string>;
}): Promise<SourceReadiness> {
  const blockers: string[] = [];
  let rawReport: unknown;
  try {
    rawReport = JSON.parse(await input.readFile(input.path)) as unknown;
  } catch (error) {
    return {
      allowCommonsenseResolution: null,
      answerContextMode: null,
      benchmarkRoot: null,
      blockers: [`source report cannot be read or parsed: ${String(error)}`],
      bm25Ranking: null,
      executionFailures: null,
      generatedBy: null,
      ingestMode: null,
      path: input.path,
      questionCount: null,
      questionCategories: null,
      ready: false,
      runId: null,
      semanticCandidateEmbeddingSource: null,
      semanticCandidates: null,
      strictNoEvidenceAbstention: null,
    };
  }

  try {
    assertLocomoSmokeReport(rawReport, input.path);
  } catch (error) {
    return {
      allowCommonsenseResolution: null,
      answerContextMode: null,
      benchmarkRoot: null,
      blockers: [String(error)],
      bm25Ranking: null,
      executionFailures: null,
      generatedBy: isRecord(rawReport) ? stringField(rawReport, "generatedBy") : null,
      ingestMode: null,
      path: input.path,
      questionCount: null,
      questionCategories: null,
      ready: false,
      runId: isRecord(rawReport) ? stringField(rawReport, "runId") : null,
      semanticCandidateEmbeddingSource: null,
      semanticCandidates: null,
      strictNoEvidenceAbstention: null,
    };
  }

  try {
    assertLocomoReportQuestionCountMatchesCases({
      path: input.path,
      report: rawReport,
    });
  } catch (error) {
    blockers.push(String(error));
  }
  if (rawReport.answerContextMode === undefined) {
    blockers.push("source report is missing answerContextMode");
  }
  if (rawReport.answerContextMode === "gold-evidence-only-pack") {
    blockers.push("source report is gold-evidence-only-pack");
  }
  if (rawReport.generatedBy === REANSWER_GENERATED_BY) {
    blockers.push("source report was generated by the reanswer runner");
  }
  if (rawReport.executionFailures > 0) {
    blockers.push(`source report has ${rawReport.executionFailures} execution failure(s)`);
  }
  if (rawReport.mode === "live-answer") {
    try {
      assertLocomoReportHasCompleteLiveAnswers({
        path: input.path,
        report: rawReport,
      });
    } catch (error) {
      blockers.push(String(error));
    }
  }

  return {
    allowCommonsenseResolution: rawReport.allowCommonsenseResolution ?? null,
    answerContextMode: rawReport.answerContextMode ?? null,
    benchmarkRoot: rawReport.externalRoot ?? rawReport.benchmarkSource,
    blockers,
    bm25Ranking: rawReport.bm25Ranking,
    executionFailures: rawReport.executionFailures,
    generatedBy: rawReport.generatedBy,
    ingestMode: rawReport.ingestMode,
    path: input.path,
    questionCount: rawReport.questionCount,
    questionCategories: rawReport.questionCategories,
    ready: blockers.length === 0,
    runId: rawReport.runId,
    semanticCandidateEmbeddingSource: rawReport.semanticCandidateEmbeddingSource,
    semanticCandidates: normalizeSemanticCandidates(rawReport.semanticCandidates),
    strictNoEvidenceAbstention: rawReport.strictNoEvidenceAbstention ?? null,
  };
}

function resolveOutputPath(options: CliOptions): string {
  if (options.outputPath !== undefined) {
    return options.outputPath;
  }
  const runId = options.runId ?? "locomo-reanswer-readiness-current";
  return join(DEFAULT_OUTPUT_DIR, runId, "reanswer-readiness.json");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function sourceRefreshRunId(sourceRunId: string | null, index: number): string {
  const base = sourceRunId ?? `source-${index}`;
  return `${base}-lineage-refresh-current`;
}

function smokeReportPathForRunId(runId: string): string {
  return join(
    "reports",
    "eval",
    "research",
    "phase-65",
    "locomo",
    runId,
    "smoke-report.json",
  );
}

function answerPolicySlicePathForRunId(runId: string): string {
  return join(
    "reports",
    "eval",
    "research",
    "phase-65",
    "locomo",
    runId,
    "answer-policy-slice.json",
  );
}

function appendUnique<T extends string>(target: T[], value: T): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function envValueIsSet(
  env: Record<string, string | undefined>,
  key: string,
): boolean {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0;
}

function buildEnvironmentReadiness(input: {
  env: Record<string, string | undefined>;
  requiredGroups: readonly EnvironmentRequirementGroup[];
}): EnvironmentReadiness {
  const requiredGroups: EnvironmentRequirementGroup[] = [];
  const requiredVars: string[] = [];
  for (const group of input.requiredGroups) {
    appendUnique(requiredGroups, group);
    const groupVars =
      group === "live-answer" ? LIVE_ANSWER_ENV_VARS : PROVIDER_EMBEDDING_ENV_VARS;
    for (const envVar of groupVars) {
      appendUnique(requiredVars, envVar);
    }
  }
  const missingVars = requiredVars.filter(
    (envVar) => !envValueIsSet(input.env, envVar),
  );
  return {
    missingVars,
    ready: missingVars.length === 0,
    requiredGroups,
    requiredVars,
  };
}

function buildSourceRefreshCommand(input: {
  questionIds: readonly string[];
  source: SourceReadiness;
  targetRunId: string;
}): string | null {
  if (input.source.benchmarkRoot === null) {
    return null;
  }
  const args = [
    "bun",
    "run",
    "eval:phase-65-smoke",
    "--",
    "--benchmark-root",
    input.source.benchmarkRoot,
  ];
  for (const questionId of input.questionIds) {
    args.push("--question-id", questionId);
  }
  if (input.source.bm25Ranking === true) {
    args.push("--bm25");
  }
  if (input.source.ingestMode === "conversational-extraction") {
    args.push("--conversational-extraction");
  }
  if (input.source.semanticCandidateEmbeddingSource === "provider") {
    args.push("--provider-embedding");
  }
  if (input.source.semanticCandidates?.enabled === true) {
    args.push("--semantic-candidates");
    const { maxAdditions, minRelativeScore, minSimilarity, topK } =
      input.source.semanticCandidates;
    if (topK !== null) {
      args.push("--semantic-candidate-top-k", String(topK));
    }
    if (maxAdditions !== null) {
      args.push("--semantic-candidate-max-additions", String(maxAdditions));
    }
    if (minRelativeScore !== null) {
      args.push(
        "--semantic-candidate-min-relative-score",
        String(minRelativeScore),
      );
    }
    if (minSimilarity !== null) {
      args.push("--semantic-candidate-min-similarity", String(minSimilarity));
    }
  }
  args.push("--live", "--evidence-pack");
  if (input.source.allowCommonsenseResolution === true) {
    args.push("--allow-commonsense-resolution");
  }
  if (input.source.strictNoEvidenceAbstention === true) {
    args.push("--strict-no-evidence-abstention");
  }
  args.push("--run-id", input.targetRunId);
  return args.map(shellQuote).join(" ");
}

function buildRefreshPlan(input: {
  env: Record<string, string | undefined>;
  jobs: readonly ManifestReanswerJob[];
  perBucket: number | null;
  runId: string;
  sourceReports: readonly SourceReadiness[];
}): LocomoReanswerReadinessAudit["refreshPlan"] {
  const sourceByPath = new Map(
    input.sourceReports.map((sourceReport) => [sourceReport.path, sourceReport]),
  );
  const jobsBySourcePath = new Map<string, ManifestReanswerJob[]>();
  for (const job of input.jobs) {
    if (job.sourceReportPath === null) {
      continue;
    }
    const current = jobsBySourcePath.get(job.sourceReportPath) ?? [];
    current.push(job);
    jobsBySourcePath.set(job.sourceReportPath, current);
  }

  const sourceReports: SourceRefreshPlan[] = [];
  const requiredEnvironmentGroups: EnvironmentRequirementGroup[] = [];
  let index = 0;
  for (const [sourceReportPath, jobs] of jobsBySourcePath.entries()) {
    const source = sourceByPath.get(sourceReportPath);
    if (source === undefined || source.ready) {
      continue;
    }
    const questionIds = [...new Set(jobs.flatMap((job) => job.questionIds))];
    const categories = [
      ...new Set(
        jobs.flatMap((job) => (job.category === null ? [] : [job.category])),
      ),
    ];
    const targetRunId = sourceRefreshRunId(source.runId, index);
    const command = buildSourceRefreshCommand({
      questionIds,
      source,
      targetRunId,
    });
    if (command !== null) {
      appendUnique(requiredEnvironmentGroups, "live-answer");
      if (source.semanticCandidateEmbeddingSource === "provider") {
        appendUnique(requiredEnvironmentGroups, "provider-embedding");
      }
    }
    sourceReports.push({
      blockers: source.blockers,
      categories,
      command,
      questionIds,
      refreshedReportPath: smokeReportPathForRunId(targetRunId),
      sourceReportPath,
      sourceRunId: source.runId,
      targetRunId,
    });
    index += 1;
  }

  const sourceReportPaths = sourceReports.map(
    (sourceReport) => sourceReport.command === null
      ? null
      : sourceReport.refreshedReportPath,
  ).filter(
    (sourceReportPath): sourceReportPath is string => sourceReportPath !== null,
  );
  const manifestRunId = `${input.runId}-slice-refresh-current`;
  const outputPath = answerPolicySlicePathForRunId(manifestRunId);
  const manifest =
    sourceReportPaths.length === 0
      ? null
      : {
          command: [
            "bun",
            "run",
            "analyze:phase-65-locomo-answer-policy-slice",
            "--",
            ...sourceReportPaths.flatMap((path) => ["--report", path]),
            ...(input.perBucket === null
              ? []
              : ["--per-bucket", String(input.perBucket)]),
            "--run-id",
            manifestRunId,
            "--output-path",
            outputPath,
          ]
            .map(shellQuote)
            .join(" "),
          outputPath,
          runId: manifestRunId,
          sourceReportPaths,
        };
  return {
    environment: buildEnvironmentReadiness({
      env: input.env,
      requiredGroups: requiredEnvironmentGroups,
    }),
    manifest,
    note:
      "Run source refresh commands first, regenerate the answer-policy slice " +
      "from the refreshed reports, then rerun this readiness audit before " +
      "bucket/category reanswer replay.",
    sourceReports,
  };
}

function buildReplayCommand(input: {
  job: LocomoReanswerReadinessAudit["readyJobs"][number];
  source: SourceReadiness;
  targetRunId: string;
}): string {
  const args = [
    "bun",
    "run",
    "eval:phase-65-reanswer-report",
    "--",
    "--source-report",
    input.job.sourceReportPath,
  ];
  for (const questionId of input.job.questionIds) {
    args.push("--question-id", questionId);
  }
  if (input.source.allowCommonsenseResolution === true) {
    args.push("--allow-commonsense-resolution");
  }
  if (input.source.strictNoEvidenceAbstention === true) {
    args.push("--strict-no-evidence-abstention");
  }
  args.push("--run-id", input.targetRunId);
  return args.map(shellQuote).join(" ");
}

function buildReplayPlan(input: {
  env: Record<string, string | undefined>;
  manifestPath: string;
  readyJobs: readonly LocomoReanswerReadinessAudit["readyJobs"][number][];
  runId: string;
  sourceReports: readonly SourceReadiness[];
}): LocomoReanswerReadinessAudit["replayPlan"] {
  const sourceByPath = new Map(
    input.sourceReports.map((sourceReport) => [sourceReport.path, sourceReport]),
  );
  const commands: ReplayPlanCommand[] = [];
  for (const job of input.readyJobs) {
    const source = sourceByPath.get(job.sourceReportPath);
    if (source === undefined) {
      continue;
    }
    const targetRunId = `${input.runId}-ready-job-${job.index}-reanswer-current`;
    commands.push({
      bucket: job.bucket,
      category: job.category,
      command: buildReplayCommand({ job, source, targetRunId }),
      manifestPath: input.manifestPath,
      questionCount: job.questionCount,
      questionIds: job.questionIds,
      sourceReportPath: job.sourceReportPath,
      sourceRunId: job.sourceRunId,
      targetRunId,
    });
  }
  return {
    commands,
    environment: buildEnvironmentReadiness({
      env: input.env,
      requiredGroups: ["live-answer"],
    }),
    note:
      "Replay commands are scoped to readiness-proven jobs with explicit " +
      "question ids so blocked jobs in the same manifest cannot be swept into " +
      "a bucket/category replay. Use the manifestPath and readyJobs fields for " +
      "lineage, or rerun with --question-id-file plus filters after the audit " +
      "reports all intended jobs ready.",
  };
}

export async function auditLocomoReanswerReadiness(
  options: CliOptions,
  deps: LocomoReanswerReadinessDependencies = {},
): Promise<LocomoReanswerReadinessAudit> {
  const readFileImpl = deps.readFile ?? ((path: string) => readFile(path, "utf8"));
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const rawManifest = JSON.parse(await readFileImpl(options.manifestPath)) as unknown;
  const { jobs, perBucket } = parseManifestReanswerJobs(rawManifest);
  const sourcePaths = [...new Set(jobs.flatMap((job) => job.sourceReportPath ?? []))];
  const sourceReports = await Promise.all(
    sourcePaths.map((path) => loadSourceReadiness({ path, readFile: readFileImpl })),
  );
  const sourceReadinessByPath = new Map(
    sourceReports.map((sourceReport) => [sourceReport.path, sourceReport]),
  );
  const readyJobs: LocomoReanswerReadinessAudit["readyJobs"] = [];
  const blockedJobs: LocomoReanswerReadinessAudit["blockedJobs"] = [];
  for (const job of jobs) {
    const blockers: string[] = [];
    if (job.sourceReportPath === null) {
      blockers.push("reanswer job is missing sourceReportPath");
    }
    const sourceReadiness =
      job.sourceReportPath === null
        ? undefined
        : sourceReadinessByPath.get(job.sourceReportPath);
    if (sourceReadiness !== undefined) {
      blockers.push(...sourceReadiness.blockers);
      if (
        job.sourceRunId !== null &&
        sourceReadiness.runId !== null &&
        job.sourceRunId !== sourceReadiness.runId
      ) {
        blockers.push(
          `reanswer job sourceRunId ${job.sourceRunId} does not match ` +
            `source report runId ${sourceReadiness.runId}`,
        );
      }
    }
    if (blockers.length === 0 && job.sourceReportPath !== null) {
      readyJobs.push({
        bucket: job.bucket,
        category: job.category,
        index: job.index,
        questionCount: job.questionCount,
        questionIds: job.questionIds,
        sourceReportPath: job.sourceReportPath,
        sourceRunId: job.sourceRunId,
      });
    } else {
      blockedJobs.push({
        blockers,
        bucket: job.bucket,
        category: job.category,
        index: job.index,
        questionCount: job.questionCount,
        questionIds: job.questionIds,
        sourceReportPath: job.sourceReportPath,
        sourceRunId: job.sourceRunId,
      });
    }
  }
  const outputPath = resolveOutputPath(options);
  if (options.manifestPath === outputPath) {
    throw new Error("--output-path must not overwrite --manifest.");
  }
  const audit: LocomoReanswerReadinessAudit = {
    benchmark: "locomo",
    blockedJobs,
    generatedAt: now().toISOString(),
    generatedBy: GENERATED_BY,
    manifestPath: options.manifestPath,
    outputPath,
    phase: "phase-65",
    readyJobs,
    refreshPlan: buildRefreshPlan({
      env,
      jobs,
      perBucket,
      runId: options.runId ?? "locomo-reanswer-readiness-current",
      sourceReports,
    }),
    replayPlan: buildReplayPlan({
      env,
      manifestPath: options.manifestPath,
      readyJobs,
      runId: options.runId ?? "locomo-reanswer-readiness-current",
      sourceReports,
    }),
    runId: options.runId ?? "locomo-reanswer-readiness-current",
    sourceReports,
    summary: {
      blockedJobCount: blockedJobs.length,
      jobCount: jobs.length,
      readyJobCount: readyJobs.length,
      sourceReportCount: sourceReports.length,
    },
  };
  return audit;
}

export async function runLocomoReanswerReadinessAudit(
  argv: readonly string[],
  deps: LocomoReanswerReadinessDependencies = {},
): Promise<{ audit: LocomoReanswerReadinessAudit; outputPath: string }> {
  const options = parseCliOptions(argv);
  if (options.outputPath !== undefined) {
    assertDistinctCliPathValues({
      firstFlag: "--manifest",
      firstValue: options.manifestPath,
      secondFlag: "--output-path",
      secondValue: options.outputPath,
    });
  }
  const audit = await auditLocomoReanswerReadiness(options, deps);
  const outputPath = audit.outputPath;
  if (outputPath === null) {
    throw new Error("LoCoMo reanswer readiness outputPath unexpectedly resolved to null.");
  }
  const mkdirImpl = deps.mkdir ?? mkdir;
  const writeFileImpl = deps.writeFile ?? writeFile;
  await mkdirImpl(dirname(outputPath), { recursive: true });
  await writeFileImpl(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
  return { audit, outputPath };
}

if (import.meta.main) {
  runLocomoReanswerReadinessAudit(process.argv)
    .then(({ audit, outputPath }) => {
      process.stdout.write(
        `${JSON.stringify(
          {
            outputPath,
            runId: audit.runId,
            summary: audit.summary,
          },
          null,
          2,
        )}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `LoCoMo reanswer readiness audit failed: ${String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
