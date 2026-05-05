import { describe, expect, it } from "bun:test";
import type {
  ImplicitMemBenchCaseResult,
  ImplicitMemBenchProfileSummary,
  ImplicitMemBenchResearchCase,
  ImplicitMemBenchResearchReport,
  ImplicitMemBenchScorerFamily,
} from "../../src/eval/implicitmembench-research";
import {
  configurePhase61Full300Environment,
  parsePhase61Full300CliOptions,
  PHASE61_FULL300_DEFAULT_MAX_CONCURRENCY,
  PHASE61_FULL300_DEFAULT_PRIMING_TIMEOUT_MS,
  PHASE61_FULL300_DEFAULT_SHARD_CONCURRENCY,
  PHASE61_FULL300_DEFAULT_SHARDS,
  resolvePhase61Full300OutputDir,
  resolvePhase61Full300Options,
  runPhase61Full300,
} from "../../scripts/run-phase-61-full300";

function buildRequiredEnv(): NodeJS.ProcessEnv {
  return {
    GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: "extractor-key",
    GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: "extractor-model",
    GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: "openai",
    GOODMEMORY_EMBEDDING_API_KEY: "embedding-key",
    GOODMEMORY_EMBEDDING_MODEL: "embedding-model",
    GOODMEMORY_EMBEDDING_PROVIDER: "openai",
    GOODMEMORY_EVAL_API_KEY: "eval-key",
    GOODMEMORY_EVAL_MAX_CONCURRENCY: "7",
    GOODMEMORY_EVAL_MODEL: "eval-model",
    GOODMEMORY_EVAL_PROVIDER: "openai",
    GOODMEMORY_IMPLICITMEMBENCH_PRIMING_TIMEOUT_MS: "180000",
    GOODMEMORY_IMPLICITMEMBENCH_ROOT: "/tmp/bench",
    GOODMEMORY_JUDGE_API_KEY: "judge-key",
    GOODMEMORY_JUDGE_MODEL: "judge-model",
    GOODMEMORY_JUDGE_PROVIDER: "openai",
    GOODMEMORY_TEST_POSTGRES_URL: "postgres://localhost/goodmemory_test",
  };
}

function buildCase(
  index: number,
  scorerFamily: ImplicitMemBenchScorerFamily = "text_behavior_judge",
): ImplicitMemBenchResearchCase {
  return {
    caseId: `classical_conditioning/case_${index}.json#001`,
    datasetFamily: "classical_conditioning",
    expectedPattern: "Use the remembered behavior.",
    feedbackSignal: "Use the remembered behavior.",
    fixture: {
      feedbackSignal: "Use the remembered behavior.",
      scorer: scorerFamily,
    },
    instance: {
      expected_pattern: "Use the remembered behavior.",
      learning_phase: [],
      task_id: "001",
      task_name: `Case ${index}`,
      test_probe: {
        content: "Probe",
        role: "user",
      },
    },
    scorerFamily,
    sourceFile: `/tmp/bench/dataset/classical_conditioning/case_${index}.json`,
    taskFile: `case_${index}.json`,
    taskName: `Case ${index}`,
  } as unknown as ImplicitMemBenchResearchCase;
}

function buildCaseResult(input: {
  caseDefinition: ImplicitMemBenchResearchCase;
  profile:
    | "baseline-upstream-chat"
    | "goodmemory-distilled-feedback"
    | "goodmemory-raw-experience";
}): ImplicitMemBenchCaseResult {
  return {
    answer: "ok",
    blocking: true,
    caseId: input.caseDefinition.caseId,
    datasetFamily: input.caseDefinition.datasetFamily,
    explicitRecallLeak: false,
    feedbackSignalApplied: input.profile !== "baseline-upstream-chat",
    judgeReason: "test",
    passed: input.profile !== "baseline-upstream-chat",
    profile: input.profile,
    scorerFamily: input.caseDefinition.scorerFamily,
    sourceFile: input.caseDefinition.sourceFile,
    taskFile: input.caseDefinition.taskFile,
    taskName: input.caseDefinition.taskName,
  };
}

function summarizeCases(
  cases: readonly ImplicitMemBenchCaseResult[],
): ImplicitMemBenchProfileSummary {
  return {
    caseCountsByDataset: {
      classical_conditioning: cases.length,
      priming: 0,
      procedural_memory: 0,
    },
    caseCountsByScorer: {
      priming_pair_judge: 0,
      structured_first_action: 0,
      text_behavior_judge: cases.length,
    },
    cases: [...cases],
    executionFailures: 0,
    explicitRecallLeakCount: 0,
    passedBlockingCases: cases.filter((caseResult) => caseResult.passed).length,
    primingAverageScore: null,
    totalBlockingCases: cases.length,
    totalCases: cases.length,
  };
}

function buildReport(input: {
  cases: readonly ImplicitMemBenchResearchCase[];
  kind: "baseline" | "goodmemory";
  runId: string;
}): ImplicitMemBenchResearchReport {
  const baselineCases = input.cases.map((caseDefinition) =>
    buildCaseResult({ caseDefinition, profile: "baseline-upstream-chat" }),
  );
  const rawCases = input.cases.map((caseDefinition) =>
    buildCaseResult({ caseDefinition, profile: "goodmemory-raw-experience" }),
  );
  const distilledCases = input.cases.map((caseDefinition) =>
    buildCaseResult({
      caseDefinition,
      profile: "goodmemory-distilled-feedback",
    }),
  );
  const profiles =
    input.kind === "baseline"
      ? { "baseline-upstream-chat": summarizeCases(baselineCases) }
      : {
          "goodmemory-distilled-feedback": summarizeCases(distilledCases),
          "goodmemory-raw-experience": summarizeCases(rawCases),
        };
  const totalCases =
    input.kind === "baseline"
      ? baselineCases.length
      : rawCases.length + distilledCases.length;
  const passedBlockingCases =
    input.kind === "baseline" ? 0 : rawCases.length + distilledCases.length;

  return {
    benchmarkRoot: "/tmp/bench",
    generatedAt: "2026-05-05T00:00:00.000Z",
    generatedBy: "tests",
    kind: input.kind,
    manifestPath:
      "/tmp/goodmemory/fixtures/implicitmembench-research/adapter-manifest.json",
    mode: "live",
    outputDir: "/tmp/out",
    profiles,
    runDirectory: `/tmp/out/${input.kind}/${input.runId}`,
    runId: input.runId,
    source: {
      benchmark: "ImplicitMemBench",
      license: "CC BY 4.0",
      url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
    },
    summary: {
      caseCountsByDataset: {
        classical_conditioning: totalCases,
        priming: 0,
        procedural_memory: 0,
      },
      caseCountsByScorer: {
        priming_pair_judge: 0,
        structured_first_action: 0,
        text_behavior_judge: totalCases,
      },
      executionFailures: 0,
      explicitRecallLeakCount: 0,
      passedBlockingCases,
      primingAverageScore: null,
      totalBlockingCases: totalCases,
      totalCases,
    },
  };
}

describe("run-phase-61 full300 script", () => {
  it("parses one-command live options from env with timestamped run ids", () => {
    const options = parsePhase61Full300CliOptions(
      ["bun", "run", "scripts/run-phase-61-full300.ts"],
      {
        env: buildRequiredEnv(),
        now: () => new Date("2026-05-05T12:34:56.000Z"),
      },
    );

    expect(options).toEqual({
      benchmarkRoot: "/tmp/bench",
      maxConcurrency: undefined,
      outputDir: undefined,
      primingTimeoutMs: 180000,
      runId: "run-phase61-full300-20260505T123456Z",
      shardConcurrency: undefined,
      shards: undefined,
    });
  });

  it("configures Postgres-backed storage and priming timeout without exposing secrets", () => {
    const env = buildRequiredEnv();

    const summary = configurePhase61Full300Environment(
      {
        benchmarkRoot: "/tmp/bench",
        maxConcurrency: 7,
        outputDir: "/tmp/out",
        primingTimeoutMs: PHASE61_FULL300_DEFAULT_PRIMING_TIMEOUT_MS,
        runId: "run-phase61-full300-test",
        shardConcurrency: PHASE61_FULL300_DEFAULT_SHARD_CONCURRENCY,
        shards: PHASE61_FULL300_DEFAULT_SHARDS,
      },
      env,
    );

    expect(summary).toEqual({
      missingRequiredEnv: [],
      postgresUrlSource: "GOODMEMORY_TEST_POSTGRES_URL",
      storageProvider: "postgres",
    });
    expect(env.GOODMEMORY_STORAGE_PROVIDER).toBe("postgres");
    expect(env.GOODMEMORY_STORAGE_URL).toBe(
      "postgres://localhost/goodmemory_test",
    );
    expect(env.GOODMEMORY_IMPLICITMEMBENCH_TIMEOUT_MS).toBe("180000");
    expect(env.GOODMEMORY_IMPLICITMEMBENCH_PRIMING_TIMEOUT_MS).toBe("180000");
  });

  it("defaults Phase 61 full-300 to ten shards with bounded parallelism", () => {
    const options = resolvePhase61Full300Options({
      benchmarkRoot: "/tmp/bench",
      outputDir: "/tmp/out",
      runId: "run-phase61-full300-test",
    });

    expect(options.shards).toBe(PHASE61_FULL300_DEFAULT_SHARDS);
    expect(options.shardConcurrency).toBe(
      PHASE61_FULL300_DEFAULT_SHARD_CONCURRENCY,
    );
    expect(options.maxConcurrency).toBe(PHASE61_FULL300_DEFAULT_MAX_CONCURRENCY);
    expect(options.shardConcurrency).toBe(6);
  });

  it("runs Phase 60 live full-300 through ten-shard capable wrapper", async () => {
    const env = buildRequiredEnv();
    const cases = [buildCase(1), buildCase(2), buildCase(3), buildCase(4)];
    const receivedRunIds: string[] = [];
    let receivedInput:
      | {
          benchmarkRoot?: string;
          cases?: readonly ImplicitMemBenchResearchCase[];
          maxConcurrency?: number;
          outputDir?: string;
          runId?: string;
          smoke?: boolean;
        }
      | undefined;

    const result = await runPhase61Full300(
      {
        benchmarkRoot: "/tmp/bench",
        maxConcurrency: 3,
        outputDir: "/tmp/out",
        primingTimeoutMs: 180000,
        runId: "run-phase61-full300-test",
        shards: 2,
      },
      {
        env,
        listCases: async () => cases,
        runEval: async (input) => {
          receivedInput = input;
          receivedRunIds.push(input?.runId ?? "");
          const shardCases = input?.cases ?? [];
          return {
            baselineReport: buildReport({
              cases: shardCases,
              kind: "baseline",
              runId: input?.runId ?? "missing-run-id",
            }),
            comparisonReport: {} as never,
            goodmemoryReport: buildReport({
              cases: shardCases,
              kind: "goodmemory",
              runId: input?.runId ?? "missing-run-id",
            }),
            phase60Summary: {} as never,
          };
        },
      },
    );

    expect(receivedInput).toEqual({
      benchmarkRoot: "/tmp/bench",
      cases: [cases[1], cases[3]],
      maxConcurrency: 3,
      outputDir: "/tmp/out",
      runId: "run-phase61-full300-test-shard-02",
      smoke: false,
    });
    expect(receivedRunIds).toEqual([
      "run-phase61-full300-test-shard-01",
      "run-phase61-full300-test-shard-02",
    ]);
    expect(result.shardCount).toBe(2);
    expect(result.shardReportPaths).toEqual([
      "/tmp/out/run-phase61-full300-test-shard-01/overall-summary.json",
      "/tmp/out/run-phase61-full300-test-shard-02/overall-summary.json",
    ]);
    expect(result.summary.benchmark).toEqual({
      blockingCases: 200,
      primingCases: 100,
      totalCases: 300,
    });
    expect(result.overallSummaryPath).toBe(
      "/tmp/out/run-phase61-full300-test/overall-summary.json",
    );
    expect(result.goodmemoryReportPath).toBe(
      "/tmp/out/goodmemory/run-phase61-full300-test/report.json",
    );
    expect(env.GOODMEMORY_STORAGE_PROVIDER).toBe("postgres");
  });

  it("resolves the default live output directory outside fallback reports", () => {
    expect(resolvePhase61Full300OutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live/phase-61-full300",
    );
  });
});
