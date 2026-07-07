import { describe, expect, it } from "bun:test";
import {
  parsePhase61StoredAnswerRescoreCliOptions,
  rescorePhase61ImplicitMemBenchStoredAnswers,
} from "../../scripts/rescore-phase-61-implicitmembench-stored-answers";
import type {
  ImplicitMemBenchResearchCase,
  ImplicitMemBenchResearchProfile,
} from "../../src/eval/implicitmembench-research";

type Profile =
  | "baseline-upstream-chat"
  | "goodmemory-distilled-feedback"
  | "goodmemory-raw-experience";

function textCase(caseId: string): ImplicitMemBenchResearchCase {
  return {
    caseId,
    datasetFamily: "classical_conditioning",
    expectedPattern: "Use QuickCheck instead of DeepAnalyzer.",
    feedbackSignal: "Prefer QuickCheck.",
    fixture: {
      scorer: "text_behavior_judge",
      test_probe: { content: "Please run detailed analysis." },
    },
    instance: {
      interference_phase: [{ content: "noise", role: "user" }],
      learning_phase: [{ content: "Use QuickCheck.", role: "user" }],
      test_probe: { content: "Please run detailed analysis.", role: "user" },
    },
    scorerFamily: "text_behavior_judge",
    sourceFile: "/tmp/ImplicitMemBench/dataset/classical_conditioning/text.json",
    taskFile: "text.json",
    taskName: "Text",
  } as unknown as ImplicitMemBenchResearchCase;
}

function structuredCase(caseId: string): ImplicitMemBenchResearchCase {
  return {
    caseId,
    datasetFamily: "procedural_memory",
    expectedPattern: "FETCH users",
    feedbackSignal: "Use FETCH.",
    fixture: {
      scorer: "structured_first_action",
    },
    instance: {
      interference_phase: [{ content: "noise", role: "user" }],
      learning_phase: [{ content: "Use FETCH.", role: "user" }],
      test_probe: { content: "Get users.", role: "user" },
    },
    scorerFamily: "structured_first_action",
    sourceFile: "/tmp/ImplicitMemBench/dataset/procedural_memory/structured.json",
    taskFile: "structured.json",
    taskName: "Structured",
  } as unknown as ImplicitMemBenchResearchCase;
}

function primingCase(caseId: string): ImplicitMemBenchResearchCase {
  return {
    caseId,
    datasetFamily: "priming",
    fixture: {
      scorer: "priming_pair_judge",
      themeKeywords: ["aurora"],
    },
    instance: {
      control_instance: {
        test_probe: { prompt: "Name a project." },
      },
      experimental_instance: {
        priming_phase: [{ content: "aurora theme", role: "user" }],
        test_probe: { prompt: "Name a project." },
      },
      interference_phase: [{ content: "noise", role: "user" }],
      priming_phase: [{ content: "aurora theme", role: "user" }],
      selected_source_theme: "aurora",
    },
    scorerFamily: "priming_pair_judge",
    sourceFile: "/tmp/ImplicitMemBench/dataset/priming/priming.json",
    taskFile: "priming.json",
    taskName: "Priming",
  } as unknown as ImplicitMemBenchResearchCase;
}

function row(input: {
  caseId: string;
  profile: Profile;
  scorerFamily: "priming_pair_judge" | "structured_first_action" | "text_behavior_judge";
}) {
  const base = {
    blocking: input.scorerFamily !== "priming_pair_judge",
    caseId: input.caseId,
    datasetFamily:
      input.scorerFamily === "priming_pair_judge"
        ? "priming"
        : input.scorerFamily === "structured_first_action"
          ? "procedural_memory"
          : "classical_conditioning",
    explicitRecallLeak: false,
    feedbackSignalApplied: input.profile !== "baseline-upstream-chat",
    judgeReason: "old judge",
    passed: input.scorerFamily === "priming_pair_judge" ? undefined : false,
    profile: input.profile,
    scorerFamily: input.scorerFamily,
    sourceFile: `/tmp/${input.caseId}.json`,
    taskFile: `${input.caseId}.json`,
    taskName: input.caseId,
  };
  if (input.scorerFamily === "priming_pair_judge") {
    return {
      ...base,
      primingControlAnswer: "control answer",
      primingExperimentalAnswer:
        input.profile === "baseline-upstream-chat"
          ? "plain answer"
          : "bright answer",
      primingInfluenceScore: 0,
    };
  }
  if (input.scorerFamily === "structured_first_action") {
    return {
      ...base,
      answer: "FETCH users",
      firstActionRaw: "FETCH users",
      passed: true,
    };
  }
  return {
    ...base,
    answer:
      input.profile === "baseline-upstream-chat"
        ? "Running DeepAnalyzer."
        : "Using QuickCheck.",
  };
}

function profileSummary(cases: Array<Record<string, unknown>>) {
  return {
    caseCountsByDataset: {
      classical_conditioning: cases.filter(
        (caseResult) => caseResult.datasetFamily === "classical_conditioning",
      ).length,
      priming: cases.filter((caseResult) => caseResult.datasetFamily === "priming").length,
      procedural_memory: cases.filter(
        (caseResult) => caseResult.datasetFamily === "procedural_memory",
      ).length,
    },
    caseCountsByScorer: {
      priming_pair_judge: cases.filter(
        (caseResult) => caseResult.scorerFamily === "priming_pair_judge",
      ).length,
      structured_first_action: cases.filter(
        (caseResult) => caseResult.scorerFamily === "structured_first_action",
      ).length,
      text_behavior_judge: cases.filter(
        (caseResult) => caseResult.scorerFamily === "text_behavior_judge",
      ).length,
    },
    cases,
    executionFailures: 0,
    explicitRecallLeakCount: 0,
    passedBlockingCases: cases.filter(
      (caseResult) => caseResult.blocking && caseResult.passed,
    ).length,
    primingAverageScore: null,
    totalBlockingCases: cases.filter((caseResult) => caseResult.blocking).length,
    totalCases: cases.length,
  };
}

function sourceReports(): Record<string, unknown> {
  const baselineRows = [
    row({ caseId: "text-1", profile: "baseline-upstream-chat", scorerFamily: "text_behavior_judge" }),
    row({ caseId: "structured-1", profile: "baseline-upstream-chat", scorerFamily: "structured_first_action" }),
    row({ caseId: "priming-1", profile: "baseline-upstream-chat", scorerFamily: "priming_pair_judge" }),
  ];
  const distilledRows = [
    row({ caseId: "text-1", profile: "goodmemory-distilled-feedback", scorerFamily: "text_behavior_judge" }),
    row({ caseId: "structured-1", profile: "goodmemory-distilled-feedback", scorerFamily: "structured_first_action" }),
  ];
  const rawRows = [
    row({ caseId: "priming-1", profile: "goodmemory-raw-experience", scorerFamily: "priming_pair_judge" }),
  ];
  return {
    "/reports/overall.json": {
      generatedBy: "scripts/run-phase-61-full300.ts",
      runId: "source-run",
      sourceReports: {
        baselineReportPath: "/reports/baseline.json",
        goodmemoryReportPath: "/reports/goodmemory.json",
      },
    },
    "/reports/baseline.json": {
      benchmarkRoot: "/tmp/ImplicitMemBench",
      generatedAt: "2026-07-06T00:00:00.000Z",
      generatedBy: "scripts/run-phase-61-full300.ts",
      kind: "baseline",
      manifestPath: "/fixtures/manifest.json",
      mode: "live",
      outputDir: "/reports/baseline",
      profiles: {
        "baseline-upstream-chat": profileSummary(baselineRows),
      },
      runDirectory: "/reports/baseline/source-run",
      runId: "source-run",
      source: {
        benchmark: "ImplicitMemBench",
        license: "CC BY 4.0",
        url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
      },
      summary: profileSummary(baselineRows),
    },
    "/reports/goodmemory.json": {
      benchmarkRoot: "/tmp/ImplicitMemBench",
      generatedAt: "2026-07-06T00:00:00.000Z",
      generatedBy: "scripts/run-phase-61-full300.ts",
      kind: "goodmemory",
      manifestPath: "/fixtures/manifest.json",
      mode: "live",
      outputDir: "/reports/goodmemory",
      profiles: {
        "goodmemory-distilled-feedback": profileSummary(distilledRows),
        "goodmemory-raw-experience": profileSummary(rawRows),
      },
      runDirectory: "/reports/goodmemory/source-run",
      runId: "source-run",
      source: {
        benchmark: "ImplicitMemBench",
        license: "CC BY 4.0",
        url: "https://github.com/qinchonghanzuibang/ImplicitMemBench",
      },
      summary: profileSummary([...distilledRows, ...rawRows]),
    },
  };
}

function readFixture(fixtures: Record<string, unknown>) {
  return async (path: string): Promise<string> => {
    if (!(path in fixtures)) {
      throw new Error(`ENOENT ${path}`);
    }
    return JSON.stringify(fixtures[path]);
  };
}

describe("phase-61 ImplicitMemBench stored-answer rescore", () => {
  it("rescoring uses stored answers and recomputes the composite full score", async () => {
    const appends: Array<{ data: string; path: string }> = [];
    const writes: Array<{ data: string; path: string }> = [];
    const judgedText: Array<{ answer: string; profile: ImplicitMemBenchResearchProfile }> = [];
    const judgedPriming: Array<{ experimentalAnswer: string; profile: ImplicitMemBenchResearchProfile }> = [];

    const summary = await rescorePhase61ImplicitMemBenchStoredAnswers(
      {
        maxConcurrency: 2,
        outputDir: "/reports/rescore",
        overallReportPath: "/reports/overall.json",
        runId: "rescore-current",
      },
      {
        appendFile: async (path, data) => {
          appends.push({ data: String(data), path: String(path) });
        },
        env: {
          GOODMEMORY_EVAL_MODEL: "answer-model",
          GOODMEMORY_JUDGE_API_KEY: "key",
          GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
          GOODMEMORY_JUDGE_MODEL: "judge-model",
        },
        judgePrimingPair: async (input) => {
          judgedPriming.push({
            experimentalAnswer: input.experimentalAnswer,
            profile: input.profile,
          });
          return {
            priming_influence_score:
              input.profile === "baseline-upstream-chat" ? 10 : 80,
            reasoning: `priming ${input.profile}`,
          };
        },
        judgeTextBehavior: async (input) => {
          judgedText.push({ answer: input.answer, profile: input.profile });
          return {
            failure_tags: [],
            passed: input.profile !== "baseline-upstream-chat",
            reasoning: `text ${input.profile}`,
          };
        },
        listCases: async () => [
          textCase("text-1"),
          structuredCase("structured-1"),
          primingCase("priming-1"),
        ],
        mkdir: async () => undefined,
        now: () => new Date("2026-07-06T01:00:00.000Z"),
        readFile: readFixture(sourceReports()),
        writeFile: async (path, data) => {
          writes.push({ data, path });
        },
      },
    );

    expect(judgedText).toEqual([
      { answer: "Running DeepAnalyzer.", profile: "baseline-upstream-chat" },
      { answer: "Using QuickCheck.", profile: "goodmemory-distilled-feedback" },
    ]);
    expect(judgedPriming).toEqual([
      { experimentalAnswer: "plain answer", profile: "baseline-upstream-chat" },
      { experimentalAnswer: "bright answer", profile: "goodmemory-raw-experience" },
    ]);
    expect(summary.sameModelJudge).toBe(false);
    expect(summary.sourceAnswersUnchanged).toBe(true);
    expect(
      summary.overallSummary.profiles["baseline-upstream-chat"]?.full300OverallScore,
    ).toEqual({ passedEquivalent: 1.1, rate: 1.1 / 3, total: 3 });
    expect(
      summary.overallSummary.profiles[
        "goodmemory-distilled-feedback+controlled-priming"
      ]?.full300OverallScore,
    ).toEqual({ passedEquivalent: 2.8, rate: 2.8 / 3, total: 3 });
    expect(summary.outputReports).toMatchObject({
      progressPath: "/reports/rescore/rescore-current/progress.jsonl",
      runIdentityPath: "/reports/rescore/rescore-current/run-identity.json",
    });
    expect(writes.map((entry) => entry.path)).toEqual([
      "/reports/rescore/rescore-current/run-identity.json",
      "/reports/rescore/rescore-current/baseline-report.json",
      "/reports/rescore/rescore-current/goodmemory-report.json",
      "/reports/rescore/rescore-current/overall-summary.json",
      "/reports/rescore/rescore-current/rescore-summary.json",
    ]);
    expect(appends.map((entry) => entry.path)).toEqual([
      "/reports/rescore/rescore-current/progress.jsonl",
      "/reports/rescore/rescore-current/progress.jsonl",
      "/reports/rescore/rescore-current/progress.jsonl",
      "/reports/rescore/rescore-current/progress.jsonl",
    ]);
  });

  it("resumes from matching progress cache without rejudging stored answers", async () => {
    const files: Record<string, string> = Object.fromEntries(
      Object.entries(sourceReports()).map(([path, value]) => [
        path,
        JSON.stringify(value),
      ]),
    );
    let appendCalls = 0;
    let judgeCalls = 0;
    const readFile = async (path: string): Promise<string> => {
      if (!(path in files)) {
        throw new Error(`ENOENT ${path}`);
      }
      return files[path]!;
    };
    const writeFile = async (path: string, data: string): Promise<void> => {
      files[path] = data;
    };
    const appendFile = async (path: string, data: string): Promise<void> => {
      appendCalls += 1;
      files[path] = `${files[path] ?? ""}${data}`;
    };

    const commonInput = {
      maxConcurrency: 2,
      outputDir: "/reports/rescore",
      overallReportPath: "/reports/overall.json",
      runId: "rescore-current",
    };
    const firstSummary = await rescorePhase61ImplicitMemBenchStoredAnswers(
      commonInput,
      {
        appendFile,
        env: {
          GOODMEMORY_EVAL_MODEL: "answer-model",
          GOODMEMORY_JUDGE_API_KEY: "key",
          GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
          GOODMEMORY_JUDGE_MODEL: "judge-model",
        },
        judgePrimingPair: async (input) => {
          judgeCalls += 1;
          return {
            priming_influence_score:
              input.profile === "baseline-upstream-chat" ? 10 : 80,
            reasoning: `priming ${input.profile}`,
          };
        },
        judgeTextBehavior: async (input) => {
          judgeCalls += 1;
          return {
            failure_tags: [],
            passed: input.profile !== "baseline-upstream-chat",
            reasoning: `text ${input.profile}`,
          };
        },
        listCases: async () => [
          textCase("text-1"),
          structuredCase("structured-1"),
          primingCase("priming-1"),
        ],
        mkdir: async () => undefined,
        now: () => new Date("2026-07-06T01:00:00.000Z"),
        readFile,
        writeFile,
      },
    );

    expect(judgeCalls).toBe(4);
    expect(appendCalls).toBe(4);

    const secondSummary = await rescorePhase61ImplicitMemBenchStoredAnswers(
      commonInput,
      {
        appendFile,
        env: {
          GOODMEMORY_EVAL_MODEL: "answer-model",
          GOODMEMORY_JUDGE_API_KEY: "key",
          GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
          GOODMEMORY_JUDGE_MODEL: "judge-model",
        },
        judgePrimingPair: async () => {
          throw new Error("should not rejudge priming");
        },
        judgeTextBehavior: async () => {
          throw new Error("should not rejudge text");
        },
        listCases: async () => [
          textCase("text-1"),
          structuredCase("structured-1"),
          primingCase("priming-1"),
        ],
        mkdir: async () => undefined,
        now: () => new Date("2026-07-06T01:00:00.000Z"),
        readFile,
        writeFile,
      },
    );

    expect(judgeCalls).toBe(4);
    expect(appendCalls).toBe(4);
    expect(secondSummary.overallSummary.profiles).toEqual(
      firstSummary.overallSummary.profiles,
    );
  });

  it("rejects same-model judge configuration before reading source reports", async () => {
    await expect(
      rescorePhase61ImplicitMemBenchStoredAnswers(
        {
          overallReportPath: "/reports/overall.json",
          runId: "rescore-current",
        },
        {
          env: {
            GOODMEMORY_EVAL_MODEL: "gpt-5.5",
            GOODMEMORY_JUDGE_API_KEY: "key",
            GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
            GOODMEMORY_JUDGE_MODEL: "gpt-5.5",
          },
          readFile: async () => {
            throw new Error("should not read");
          },
        },
      ),
    ).rejects.toThrow(
      "requires an independent judge; answer model and judge model are both gpt-5.5",
    );
  });

  it("rejects incomplete source scope before judge calls or writes", async () => {
    const fixtures = sourceReports();
    const goodmemoryReport = fixtures["/reports/goodmemory.json"] as Record<string, unknown>;
    const profiles = goodmemoryReport.profiles as Record<string, Record<string, unknown>>;
    const rawSummary = profiles["goodmemory-raw-experience"];
    rawSummary.cases = [];
    const writes: Array<{ data: string; path: string }> = [];
    let judgeCalls = 0;

    await expect(
      rescorePhase61ImplicitMemBenchStoredAnswers(
        {
          outputDir: "/reports/rescore",
          overallReportPath: "/reports/overall.json",
          runId: "rescore-current",
        },
        {
          env: {
            GOODMEMORY_EVAL_MODEL: "answer-model",
            GOODMEMORY_JUDGE_API_KEY: "key",
            GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
            GOODMEMORY_JUDGE_MODEL: "judge-model",
          },
          judgePrimingPair: async () => {
            judgeCalls += 1;
            return {
              priming_influence_score: 0,
              reasoning: "should not run",
            };
          },
          judgeTextBehavior: async () => {
            judgeCalls += 1;
            return {
              failure_tags: [],
              passed: false,
              reasoning: "should not run",
            };
          },
          listCases: async () => [
            textCase("text-1"),
            structuredCase("structured-1"),
            primingCase("priming-1"),
          ],
          mkdir: async () => undefined,
          readFile: readFixture(fixtures),
          writeFile: async (path, data) => {
            writes.push({ data, path });
          },
        },
      ),
    ).rejects.toThrow(
      "goodmemory raw priming source rows must exactly match stored-answer rescore scope",
    );

    expect(judgeCalls).toBe(0);
    expect(writes).toEqual([]);
  });

  it("parses strict CLI selectors", () => {
    expect(() =>
      parsePhase61StoredAnswerRescoreCliOptions([
        "bun",
        "run",
        "scripts/rescore-phase-61-implicitmembench-stored-answers.ts",
        "--overall-report",
        "/reports/a.json",
        "--overall-report",
        "/reports/b.json",
      ]),
    ).toThrow("--overall-report cannot be specified more than once.");

    expect(() =>
      parsePhase61StoredAnswerRescoreCliOptions([
        "bun",
        "run",
        "scripts/rescore-phase-61-implicitmembench-stored-answers.ts",
        "--overall-report",
        "/reports/a.json",
        "--run-id",
        "../escape",
      ]),
    ).toThrow("--run-id must be a single path segment.");

    expect(
      parsePhase61StoredAnswerRescoreCliOptions([
        "bun",
        "run",
        "scripts/rescore-phase-61-implicitmembench-stored-answers.ts",
        "--overall-report",
        "/reports/a.json",
        "--run-id",
        "rescore-current",
        "--max-concurrency",
        "4",
      ]),
    ).toEqual({
      maxConcurrency: 4,
      overallReportPath: "/reports/a.json",
      runId: "rescore-current",
    });
  });
});
