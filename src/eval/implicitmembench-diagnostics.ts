import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchDatasetFamily,
  ImplicitMemBenchResearchReport,
  ImplicitMemBenchScorerFamily,
} from "./implicitmembench-research";

export type RawInternalizationDiagnosisBucket =
  | "executor_unsafe"
  | "hypothesis_missing"
  | "memory_miss"
  | "operator_failure"
  | "selected_and_passed"
  | "selected_but_not_enacted"
  | "support_conflict"
  | "wrong_exemplar";

export type RawInternalizationExecutionFailureBucket =
  | "certificate_error"
  | "invalid_json_response"
  | "semantic_search_failure"
  | "timeout"
  | "other";

export interface RawInternalizationDiagnosisCase {
  blocking: boolean;
  caseId: string;
  datasetFamily: ImplicitMemBenchDatasetFamily;
  diagnosis: RawInternalizationDiagnosisBucket;
  distilledPassed?: boolean;
  executionFailureBucket?: RawInternalizationExecutionFailureBucket;
  rawExecutionFailure?: string;
  rawPassed?: boolean;
  rawVsDistilledDelta: -1 | 0 | 1;
  scorerFamily: ImplicitMemBenchScorerFamily;
  taskFile: string;
  taskName: string;
}

export interface RawInternalizationDiagnosisSummary {
  byCase: RawInternalizationDiagnosisCase[];
  byDiagnosis: Record<RawInternalizationDiagnosisBucket, number>;
  byExecutionFailure: Record<RawInternalizationExecutionFailureBucket, number>;
  byFamily: Record<ImplicitMemBenchDatasetFamily, Record<RawInternalizationDiagnosisBucket, number>>;
  byScorer: Record<ImplicitMemBenchScorerFamily, Record<RawInternalizationDiagnosisBucket, number>>;
  byTask: Record<string, Record<RawInternalizationDiagnosisBucket, number>>;
  distilledPassedBlockingCases: number;
  rawBlockingExecutionFailures: number;
  rawNonBlockingExecutionFailures: number;
  rawPassedBlockingCases: number;
  rawVsDistilledDelta: {
    distilledOnlyPasses: number;
    rawOnlyPasses: number;
    sameOutcome: number;
  };
  reports: string[];
  totalBlockingCases: number;
  totalCases: number;
}

const DIAGNOSIS_BUCKETS: RawInternalizationDiagnosisBucket[] = [
  "executor_unsafe",
  "hypothesis_missing",
  "memory_miss",
  "operator_failure",
  "selected_and_passed",
  "selected_but_not_enacted",
  "support_conflict",
  "wrong_exemplar",
];

const EXECUTION_FAILURE_BUCKETS: RawInternalizationExecutionFailureBucket[] = [
  "certificate_error",
  "invalid_json_response",
  "semantic_search_failure",
  "timeout",
  "other",
];

function countRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function increment<T extends string>(record: Record<T, number>, key: T): void {
  record[key] = (record[key] ?? 0) + 1;
}

function bucketExecutionFailure(
  failure: string | undefined,
): RawInternalizationExecutionFailureBucket | undefined {
  if (!failure) {
    return undefined;
  }

  const normalized = failure.toLowerCase();
  if (/invalid\s+json|json\s+response/u.test(normalized)) {
    return "invalid_json_response";
  }
  if (/semantic[_\s-]*search/u.test(normalized)) {
    return "semantic_search_failure";
  }
  if (/timeout|timed\s+out|aborted/u.test(normalized)) {
    return "timeout";
  }
  if (/certificate|cert|tls|ssl/u.test(normalized)) {
    return "certificate_error";
  }

  return "other";
}

function bucketRawDiagnosis(
  rawCase: ImplicitMemBenchCaseResult,
): RawInternalizationDiagnosisBucket {
  if (rawCase.executionFailure) {
    return "operator_failure";
  }
  if (rawCase.passed) {
    return "selected_and_passed";
  }

  switch (rawCase.rawCarryover?.diagnosis) {
    case "executor_unsafe":
      return "executor_unsafe";
    case "hypothesis_missing":
    case "abstain":
      return "hypothesis_missing";
    case "support_conflict":
      return "support_conflict";
    case "wrong_exemplar":
      return "wrong_exemplar";
    case "reasoning_after_correct_hypothesis":
      return "selected_but_not_enacted";
    case "selected_and_passed":
      return "selected_and_passed";
    case "memory_miss":
    default:
      return rawCase.rawCarryover?.selectedPrototypeIds?.length
        ? "selected_but_not_enacted"
        : "memory_miss";
  }
}

function rawVsDistilledDelta(input: {
  distilledCase: ImplicitMemBenchCaseResult | undefined;
  rawCase: ImplicitMemBenchCaseResult;
}): -1 | 0 | 1 {
  const rawPassed = Boolean(input.rawCase.passed);
  const distilledPassed = Boolean(input.distilledCase?.passed);
  if (rawPassed === distilledPassed) {
    return 0;
  }

  return rawPassed ? 1 : -1;
}

function reportLabel(report: ImplicitMemBenchResearchReport): string {
  return `${report.runId}:${report.runDirectory}`;
}

export function buildRawInternalizationDiagnosisSummary(
  reports: readonly ImplicitMemBenchResearchReport[],
): RawInternalizationDiagnosisSummary {
  const rawCasesById = new Map<string, ImplicitMemBenchCaseResult>();
  const distilledCasesById = new Map<string, ImplicitMemBenchCaseResult>();

  for (const report of reports) {
    for (const rawCase of report.profiles["goodmemory-raw-experience"]?.cases ?? []) {
      rawCasesById.set(rawCase.caseId, rawCase);
    }
    for (const distilledCase of report.profiles["goodmemory-distilled-feedback"]?.cases ?? []) {
      distilledCasesById.set(distilledCase.caseId, distilledCase);
    }
  }

  const byDiagnosis = countRecord(DIAGNOSIS_BUCKETS);
  const byExecutionFailure = countRecord(EXECUTION_FAILURE_BUCKETS);
  const byFamily = {} as RawInternalizationDiagnosisSummary["byFamily"];
  const byScorer = {} as RawInternalizationDiagnosisSummary["byScorer"];
  const byTask: RawInternalizationDiagnosisSummary["byTask"] = {};
  const byCase: RawInternalizationDiagnosisCase[] = [];
  let rawPassedBlockingCases = 0;
  let distilledPassedBlockingCases = 0;
  let totalBlockingCases = 0;
  let rawBlockingExecutionFailures = 0;
  let rawNonBlockingExecutionFailures = 0;
  let rawOnlyPasses = 0;
  let distilledOnlyPasses = 0;
  let sameOutcome = 0;

  for (const rawCase of rawCasesById.values()) {
    const distilledCase = distilledCasesById.get(rawCase.caseId);
    const diagnosis = bucketRawDiagnosis(rawCase);
    const executionFailureBucket = bucketExecutionFailure(rawCase.executionFailure);
    const delta = rawVsDistilledDelta({ distilledCase, rawCase });

    increment(byDiagnosis, diagnosis);
    if (executionFailureBucket) {
      increment(byExecutionFailure, executionFailureBucket);
    }

    byFamily[rawCase.datasetFamily] ??= countRecord(DIAGNOSIS_BUCKETS);
    increment(byFamily[rawCase.datasetFamily], diagnosis);
    byScorer[rawCase.scorerFamily] ??= countRecord(DIAGNOSIS_BUCKETS);
    increment(byScorer[rawCase.scorerFamily], diagnosis);
    byTask[rawCase.taskFile] ??= countRecord(DIAGNOSIS_BUCKETS);
    increment(byTask[rawCase.taskFile], diagnosis);

    if (rawCase.blocking) {
      totalBlockingCases += 1;
      if (rawCase.passed) {
        rawPassedBlockingCases += 1;
      }
      if (distilledCase?.passed) {
        distilledPassedBlockingCases += 1;
      }
      if (rawCase.executionFailure) {
        rawBlockingExecutionFailures += 1;
      }
    } else if (rawCase.executionFailure) {
      rawNonBlockingExecutionFailures += 1;
    }

    if (delta === 1) {
      rawOnlyPasses += 1;
    } else if (delta === -1) {
      distilledOnlyPasses += 1;
    } else {
      sameOutcome += 1;
    }

    byCase.push({
      blocking: rawCase.blocking,
      caseId: rawCase.caseId,
      datasetFamily: rawCase.datasetFamily,
      diagnosis,
      ...(distilledCase?.passed !== undefined
        ? { distilledPassed: distilledCase.passed }
        : {}),
      ...(executionFailureBucket ? { executionFailureBucket } : {}),
      ...(rawCase.executionFailure
        ? { rawExecutionFailure: rawCase.executionFailure }
        : {}),
      ...(rawCase.passed !== undefined ? { rawPassed: rawCase.passed } : {}),
      rawVsDistilledDelta: delta,
      scorerFamily: rawCase.scorerFamily,
      taskFile: rawCase.taskFile,
      taskName: rawCase.taskName,
    });
  }

  byCase.sort((left, right) =>
    left.taskFile === right.taskFile
      ? left.caseId.localeCompare(right.caseId)
      : left.taskFile.localeCompare(right.taskFile),
  );

  return {
    byCase,
    byDiagnosis,
    byExecutionFailure,
    byFamily,
    byScorer,
    byTask,
    distilledPassedBlockingCases,
    rawBlockingExecutionFailures,
    rawNonBlockingExecutionFailures,
    rawPassedBlockingCases,
    rawVsDistilledDelta: {
      distilledOnlyPasses,
      rawOnlyPasses,
      sameOutcome,
    },
    reports: reports.map(reportLabel),
    totalBlockingCases,
    totalCases: rawCasesById.size,
  };
}
