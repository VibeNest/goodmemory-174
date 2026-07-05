import { describe, expect, it } from "bun:test";
import {
  LONGMEMEVAL_DETERMINISTIC_METHODS,
  parseDeterministicSubsetCliOptions,
  renderDeterministicSubsetMarkdown,
  summarizeLongMemEvalDeterministicSubset,
  summarizeProfileDeterministicSubset,
} from "../../scripts/run-phase-62-deterministic-subset";
import type {
  LongMemEvalAnswerScoreMethod,
  LongMemEvalCaseResult,
  LongMemEvalProfile,
  LongMemEvalProfileReport,
  LongMemEvalReport,
} from "../../src/eval/longmemeval";

function makeCase(input: {
  questionId: string;
  correct: boolean;
  method?: LongMemEvalAnswerScoreMethod;
  executionError?: boolean;
}): LongMemEvalCaseResult {
  return {
    answerScore:
      input.method === undefined
        ? undefined
        : { correct: input.correct, method: input.method, reasoning: "" },
    answerSessionIds: ["s1"],
    correct: input.correct,
    evidenceSessionRecall: null,
    executionError: input.executionError
      ? { message: "boom", stage: "answer_generation" }
      : undefined,
    hypothesis: "h",
    questionId: input.questionId,
    questionType: "single-session-user",
    retrievedSessionIds: ["s1"],
  };
}

function makeReport(
  profiles: Partial<Record<LongMemEvalProfile, LongMemEvalCaseResult[]>>,
): LongMemEvalReport {
  const profileReports: Partial<
    Record<LongMemEvalProfile, LongMemEvalProfileReport>
  > = {};
  for (const [profile, cases] of Object.entries(profiles)) {
    profileReports[profile as LongMemEvalProfile] = {
      cases: cases ?? [],
      // summary is unused by the analyzer; minimal stub.
      summary: {
        accuracy: 0,
        abstentionCorrectCases: 0,
        correctCases: 0,
        evidenceCaseCount: 0,
        evidenceSessionRecall: null,
        missedRecallCases: 0,
        totalCases: (cases ?? []).length,
        wrongAnswerCases: 0,
        wrongRecallCases: 0,
      },
    };
  }
  return {
    benchmarkRoot: "/tmp/lme",
    generatedAt: "2026-06-27T00:00:00.000Z",
    generatedBy: "test",
    mode: "full",
    outputDir: "/tmp/out",
    phase: "phase-62",
    profiles: profileReports,
    runDirectory: "/tmp/out/run",
    runId: "run-test",
    source: {
      benchmark: "LongMemEval",
      license: "MIT code; dataset external",
      url: "https://github.com/xiaowu0162/LongMemEval",
    },
    summary: {
      abstentionCases: 0,
      caseCountsByQuestionType: {},
      executionFailures: 0,
      profilesCompared: [],
      totalCases: 0,
    },
  };
}

describe("LongMemEval deterministic-subset analyzer", () => {
  it("rejects duplicate scalar claim analyzer flags before reading reports", () => {
    for (const flag of [
      "--baseline-profile",
      "--claim-profile",
      "--output-dir",
      "--report-path",
      "--run-id",
    ]) {
      expect(() =>
        parseDeterministicSubsetCliOptions([
          "bun",
          "run",
          "scripts/run-phase-62-deterministic-subset.ts",
          flag,
          "first",
          flag,
          "second",
        ]),
      ).toThrow(`${flag} cannot be specified more than once.`);
    }
  });

  it("excludes semantic_judge from the deterministic methods", () => {
    expect(LONGMEMEVAL_DETERMINISTIC_METHODS).not.toContain("semantic_judge");
    expect(LONGMEMEVAL_DETERMINISTIC_METHODS).not.toContain("mismatch");
    expect([...LONGMEMEVAL_DETERMINISTIC_METHODS].sort()).toEqual([
      "abstention",
      "contains",
      "exact",
      "expected_alternative",
      "numeric_count",
    ]);
  });

  it("counts only deterministic methods as judge-free correct", () => {
    const cases: LongMemEvalCaseResult[] = [
      makeCase({ questionId: "q1", correct: true, method: "exact" }),
      makeCase({ questionId: "q2", correct: true, method: "contains" }),
      makeCase({ questionId: "q3", correct: true, method: "abstention" }),
      makeCase({ questionId: "q4", correct: true, method: "numeric_count" }),
      makeCase({
        questionId: "q5",
        correct: true,
        method: "expected_alternative",
      }),
      // judge-rescued: correct, but only because the LLM judge said so.
      makeCase({ questionId: "q6", correct: true, method: "semantic_judge" }),
      // deterministic mismatch -> wrong.
      makeCase({ questionId: "q7", correct: false, method: "mismatch" }),
      // execution failure -> not correct, no score.
      makeCase({ questionId: "q8", correct: false, executionError: true }),
    ];

    const b = summarizeProfileDeterministicSubset("goodmemory-hybrid", cases);
    expect(b.totalCases).toBe(8);
    expect(b.deterministicCorrect).toBe(5);
    expect(b.deterministicSubsetAccuracy).toBeCloseTo(5 / 8, 10);
    expect(b.judgeRescuedCorrect).toBe(1);
    expect(b.overallCorrect).toBe(6);
    expect(b.overallAccuracy).toBeCloseTo(6 / 8, 10);
    expect(b.judgeContribution).toBeCloseTo(1 / 8, 10);
    expect(b.executionFailures).toBe(1);
    expect(b.correctMissingScore).toBe(0);
    expect(b.correctMethodCounts).toEqual({
      exact: 1,
      contains: 1,
      abstention: 1,
      numeric_count: 1,
      expected_alternative: 1,
      semantic_judge: 1,
    });
  });

  it("treats a correct case with no answerScore as missing, not deterministic", () => {
    const cases: LongMemEvalCaseResult[] = [
      makeCase({ questionId: "q1", correct: true, method: "exact" }),
      // correct but no recorded score: defensive — must NOT inflate the judge-free subset.
      makeCase({ questionId: "q2", correct: true }),
    ];
    const b = summarizeProfileDeterministicSubset("goodmemory-hybrid", cases);
    expect(b.overallCorrect).toBe(2);
    expect(b.deterministicCorrect).toBe(1);
    expect(b.correctMissingScore).toBe(1);
    expect(b.deterministicSubsetAccuracy).toBeCloseTo(1 / 2, 10);
  });

  it("derives the claim, baseline, and memory lift across profiles", () => {
    const report = makeReport({
      "goodmemory-hybrid": [
        makeCase({ questionId: "q1", correct: true, method: "exact" }),
        makeCase({ questionId: "q2", correct: true, method: "contains" }),
        makeCase({ questionId: "q3", correct: true, method: "abstention" }),
        makeCase({ questionId: "q4", correct: true, method: "numeric_count" }),
        makeCase({
          questionId: "q5",
          correct: true,
          method: "expected_alternative",
        }),
        makeCase({ questionId: "q6", correct: true, method: "semantic_judge" }),
        makeCase({ questionId: "q7", correct: false, method: "mismatch" }),
        makeCase({ questionId: "q8", correct: false, executionError: true }),
      ],
      "baseline-no-memory": [
        makeCase({ questionId: "q1", correct: true, method: "exact" }),
        makeCase({ questionId: "q2", correct: true, method: "abstention" }),
        makeCase({ questionId: "q3", correct: false, method: "mismatch" }),
        makeCase({ questionId: "q4", correct: false, method: "mismatch" }),
      ],
    });

    const subset = summarizeLongMemEvalDeterministicSubset({ report });
    expect(subset.claimProfile).toBe("goodmemory-hybrid");
    expect(subset.baselineProfile).toBe("baseline-no-memory");
    expect(subset.claim?.deterministicSubsetAccuracy).toBeCloseTo(5 / 8, 10);
    expect(subset.claim?.judgeFree).toBe(true);
    expect(subset.claim?.executionFailures).toBe(1);
    expect(subset.baseline?.deterministicSubsetAccuracy).toBeCloseTo(2 / 4, 10);
    // 0.625 hybrid − 0.5 no-memory.
    expect(subset.memoryLift).toBeCloseTo(5 / 8 - 1 / 2, 10);
    // profile ordering follows LONGMEMEVAL_PROFILES (no-memory before hybrid).
    expect(subset.profiles.map((p) => p.profile)).toEqual([
      "baseline-no-memory",
      "goodmemory-hybrid",
    ]);
  });

  it("nulls the baseline and lift when the baseline profile is absent", () => {
    const report = makeReport({
      "goodmemory-hybrid": [
        makeCase({ questionId: "q1", correct: true, method: "exact" }),
      ],
    });
    const subset = summarizeLongMemEvalDeterministicSubset({ report });
    expect(subset.claim?.deterministicSubsetAccuracy).toBeCloseTo(1, 10);
    expect(subset.baseline).toBeNull();
    expect(subset.baselineProfile).toBeNull();
    expect(subset.memoryLift).toBeNull();
  });

  it("renders a judge-free markdown summary with the headline number", () => {
    const report = makeReport({
      "goodmemory-hybrid": [
        makeCase({ questionId: "q1", correct: true, method: "exact" }),
        makeCase({ questionId: "q2", correct: false, method: "mismatch" }),
      ],
    });
    const md = renderDeterministicSubsetMarkdown(
      summarizeLongMemEvalDeterministicSubset({ report }),
    );
    expect(md).toContain("Deterministic-Subset Accuracy (judge-free)");
    expect(md).toContain("judge-free claim: 50.0%");
    expect(md).toContain("JUDGE-FREE");
    expect(md).toContain("| goodmemory-hybrid |");
  });
});
