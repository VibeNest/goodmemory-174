import { describe, expect, it } from "bun:test";
import {
  auditPhase61ImplicitMemBenchRescoreReadiness,
  parsePhase61ImplicitMemBenchRescoreReadinessCliOptions,
  runPhase61ImplicitMemBenchRescoreReadinessAudit,
} from "../../scripts/audit-phase-61-implicitmembench-rescore-readiness";

type ScorerFamily =
  | "priming_pair_judge"
  | "structured_first_action"
  | "text_behavior_judge";

interface RowOptions {
  index: number;
  profile: "baseline-upstream-chat" | "goodmemory-distilled-feedback" | "goodmemory-raw-experience";
  scorerFamily: ScorerFamily;
}

function sourceFile(index: number, scorerFamily: ScorerFamily): string {
  const family =
    scorerFamily === "priming_pair_judge"
      ? "priming"
      : scorerFamily === "structured_first_action"
        ? "procedural_memory"
        : "classical_conditioning";
  return `/tmp/ImplicitMemBench/dataset/${family}/case_${index}.json`;
}

function row(input: RowOptions): Record<string, unknown> {
  const base = {
    blocking: input.scorerFamily !== "priming_pair_judge",
    caseId: `${input.scorerFamily}/case_${input.index}.json#001`,
    datasetFamily:
      input.scorerFamily === "priming_pair_judge"
        ? "priming"
        : input.scorerFamily === "structured_first_action"
          ? "procedural_memory"
          : "classical_conditioning",
    explicitRecallLeak: false,
    feedbackSignalApplied: input.profile !== "baseline-upstream-chat",
    judgeReason: "test",
    passed: input.scorerFamily === "priming_pair_judge" ? undefined : true,
    profile: input.profile,
    scorerFamily: input.scorerFamily,
    sourceFile: sourceFile(input.index, input.scorerFamily),
    taskFile: `case_${input.index}.json`,
    taskName: `Case ${input.index}`,
  };
  if (input.scorerFamily === "priming_pair_judge") {
    return {
      ...base,
      primingControlAnswer: "neutral answer",
      primingExperimentalAnswer: "thematic answer",
      primingInfluenceScore: 75,
    };
  }
  if (input.scorerFamily === "structured_first_action") {
    return {
      ...base,
      answer: "FETCH users | FILTER age > 30",
      firstActionRaw: "FETCH users | FILTER age > 30",
    };
  }
  return {
    ...base,
    answer: "Use the remembered safe behavior.",
  };
}

function rows(input: {
  count: number;
  offset?: number;
  profile: RowOptions["profile"];
  scorerFamily: ScorerFamily;
}): Record<string, unknown>[] {
  const offset = input.offset ?? 0;
  return Array.from({ length: input.count }, (_, index) =>
    row({
      index: offset + index + 1,
      profile: input.profile,
      scorerFamily: input.scorerFamily,
    }),
  );
}

function summary(cases: Record<string, unknown>[]): Record<string, unknown> {
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
    executionFailures: cases.filter((caseResult) => caseResult.executionFailure).length,
    explicitRecallLeakCount: 0,
    passedBlockingCases: cases.filter(
      (caseResult) => caseResult.blocking && caseResult.passed,
    ).length,
    primingAverageScore: null,
    totalBlockingCases: cases.filter((caseResult) => caseResult.blocking).length,
    totalCases: cases.length,
  };
}

function reports(): Record<string, unknown> {
  const distilledCases = [
    ...rows({
      count: 165,
      profile: "goodmemory-distilled-feedback",
      scorerFamily: "text_behavior_judge",
    }),
    ...rows({
      count: 35,
      offset: 165,
      profile: "goodmemory-distilled-feedback",
      scorerFamily: "structured_first_action",
    }),
  ];
  const rawCases = [
    ...rows({
      count: 100,
      offset: 200,
      profile: "goodmemory-raw-experience",
      scorerFamily: "priming_pair_judge",
    }),
  ];
  const baselineCases = [
    ...rows({
      count: 165,
      profile: "baseline-upstream-chat",
      scorerFamily: "text_behavior_judge",
    }),
    ...rows({
      count: 35,
      offset: 165,
      profile: "baseline-upstream-chat",
      scorerFamily: "structured_first_action",
    }),
    ...rows({
      count: 100,
      offset: 200,
      profile: "baseline-upstream-chat",
      scorerFamily: "priming_pair_judge",
    }),
  ];

  return {
    "/reports/overall.json": {
      comparison: {
        baselineOverallRate: 0.41,
        bestGoodMemoryOverallRate: 0.7081666666666666,
      },
      generatedBy: "scripts/run-phase-61-full300.ts",
      profiles: {
        "goodmemory-distilled-feedback+controlled-priming": {
          full300OverallScore: {
            passedEquivalent: 212.45,
            rate: 0.7081666666666666,
            total: 300,
          },
        },
      },
      runId: "run-phase61-full300-rerun-20260706-codex-current",
      sourceReports: {
        baselineReportPath: "/reports/baseline.json",
        goodmemoryReportPath: "/reports/goodmemory.json",
      },
    },
    "/reports/goodmemory.json": {
      generatedBy: "scripts/run-phase-60-eval.ts",
      kind: "goodmemory",
      profiles: {
        "goodmemory-distilled-feedback": summary(distilledCases),
        "goodmemory-raw-experience": summary(rawCases),
      },
      runId: "run-phase61-full300-rerun-20260706-codex-current",
    },
    "/reports/baseline.json": {
      generatedBy: "scripts/run-phase-60-eval.ts",
      kind: "baseline",
      profiles: {
        "baseline-upstream-chat": summary(baselineCases),
      },
      runId: "run-phase61-full300-rerun-20260706-codex-current",
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

describe("phase-61 ImplicitMemBench stored-answer rescore readiness audit", () => {
  it("marks canonical full-300 stored answers ready while keeping live judge env separate", async () => {
    const audit = await auditPhase61ImplicitMemBenchRescoreReadiness(
      {
        overallReportPath: "/reports/overall.json",
        runId: "implicitmembench-rescore-readiness-current",
      },
      {
        env: {},
        now: () => new Date("2026-07-06T00:00:00.000Z"),
        readFile: readFixture(reports()),
      },
    );

    expect(audit.blockers).toEqual([]);
    expect(audit.caseScope).toEqual({
      baselineCaseCount: 300,
      deterministicCaseCount: 35,
      goodmemoryCompositeCaseCount: 300,
      judgeRequiredCaseCount: 265,
      primingJudgeCaseCount: 100,
      structuredFirstActionCaseCount: 35,
      textBehaviorJudgeCaseCount: 165,
    });
    expect(audit.readiness.storedAnswersReady).toBe(true);
    expect(audit.readiness.readyForIndependentJudgeRescore).toBe(false);
    expect(audit.environment.missingVars).toEqual([
      "GOODMEMORY_JUDGE_BASE_URL",
      "GOODMEMORY_JUDGE_API_KEY",
      "GOODMEMORY_JUDGE_MODEL",
      "GOODMEMORY_EVAL_MODEL or --answer-model",
    ]);
    expect(audit.sourceArtifacts.goodmemoryReport?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(audit.sourceScore.bestGoodMemoryOverallRate).toBe(0.7081666666666666);
  });

  it("marks live independent-judge rescore ready only when judge env is present", async () => {
    const audit = await auditPhase61ImplicitMemBenchRescoreReadiness(
      {
        overallReportPath: "/reports/overall.json",
        runId: "implicitmembench-rescore-readiness-current",
      },
      {
        env: {
          GOODMEMORY_EVAL_MODEL: "gpt-5.5",
          GOODMEMORY_JUDGE_API_KEY: "key",
          GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
          GOODMEMORY_JUDGE_MODEL: "gemini-flash",
        },
        readFile: readFixture(reports()),
      },
    );

    expect(audit.readiness.storedAnswersReady).toBe(true);
    expect(audit.readiness.liveIndependentJudgeReady).toBe(true);
    expect(audit.readiness.readyForIndependentJudgeRescore).toBe(true);
  });

  it("does not treat a same-model judge gateway as independent", async () => {
    const audit = await auditPhase61ImplicitMemBenchRescoreReadiness(
      {
        overallReportPath: "/reports/overall.json",
        runId: "implicitmembench-rescore-readiness-current",
      },
      {
        env: {
          GOODMEMORY_EVAL_MODEL: "gpt-5.5",
          GOODMEMORY_JUDGE_API_KEY: "key",
          GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
          GOODMEMORY_JUDGE_MODEL: "gpt-5.5",
        },
        readFile: readFixture(reports()),
      },
    );

    expect(audit.environment.judgeGatewayReady).toBe(true);
    expect(audit.environment.sameModelJudge).toBe(true);
    expect(audit.environment.independentJudgeReady).toBe(false);
    expect(audit.readiness.readyForIndependentJudgeRescore).toBe(false);
  });

  it("blocks incomplete stored answers and shape drift", async () => {
    const fixtures = reports();
    const goodmemoryReport = fixtures["/reports/goodmemory.json"] as Record<string, unknown>;
    const profiles = goodmemoryReport.profiles as Record<string, Record<string, unknown>>;
    const rawSummary = profiles["goodmemory-raw-experience"];
    const rawCases = rawSummary?.cases as Record<string, unknown>[];
    delete rawCases[0]?.primingExperimentalAnswer;
    rawCases.pop();

    const audit = await auditPhase61ImplicitMemBenchRescoreReadiness(
      {
        overallReportPath: "/reports/overall.json",
        runId: "implicitmembench-rescore-readiness-current",
      },
      {
        env: {
          GOODMEMORY_EVAL_MODEL: "gpt-5.5",
          GOODMEMORY_JUDGE_API_KEY: "key",
          GOODMEMORY_JUDGE_BASE_URL: "https://judge.example/v1",
          GOODMEMORY_JUDGE_MODEL: "gemini-flash",
        },
        readFile: readFixture(fixtures),
      },
    );

    expect(audit.readiness.storedAnswersReady).toBe(false);
    expect(audit.readiness.readyForIndependentJudgeRescore).toBe(false);
    expect(audit.blockers.join(" ")).toContain("missing primingExperimentalAnswer");
    expect(audit.blockers).toContain("goodmemory composite rows expected 300, found 299");
    expect(audit.blockers).toContain("goodmemory priming rows expected 100, found 99");
  });

  it("rejects duplicate CLI selectors and writes the audit artifact", async () => {
    expect(() =>
      parsePhase61ImplicitMemBenchRescoreReadinessCliOptions([
        "bun",
        "run",
        "scripts/audit-phase-61-implicitmembench-rescore-readiness.ts",
        "--overall-report",
        "/reports/a.json",
        "--overall-report",
        "/reports/b.json",
      ]),
    ).toThrow("--overall-report cannot be specified more than once.");

    expect(() =>
      parsePhase61ImplicitMemBenchRescoreReadinessCliOptions([
        "bun",
        "run",
        "scripts/audit-phase-61-implicitmembench-rescore-readiness.ts",
        "--overall-report",
        "/reports/a.json",
        "--run-id",
        "../escape",
      ]),
    ).toThrow("--run-id must be a single path segment.");

    const writes: Array<{ data: string; path: string }> = [];
    const audit = await runPhase61ImplicitMemBenchRescoreReadinessAudit(
      {
        outputPath: "/reports/out/rescore-readiness.json",
        overallReportPath: "/reports/overall.json",
        runId: "implicitmembench-rescore-readiness-current",
      },
      {
        mkdir: async () => undefined,
        readFile: readFixture(reports()),
        writeFile: async (path, data) => {
          writes.push({ data, path });
        },
      },
    );

    expect(audit.outputPath).toBe("/reports/out/rescore-readiness.json");
    expect(writes[0]?.path).toBe("/reports/out/rescore-readiness.json");
    expect(JSON.parse(writes[0]?.data ?? "{}").benchmark).toBe("implicitmembench");
  });
});
