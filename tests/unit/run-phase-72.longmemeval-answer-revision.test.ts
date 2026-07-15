import { describe, expect, it } from "bun:test";

import {
  buildPhase72LongMemEvalRevisionPrompt,
  buildPhase72LongMemEvalSelectorPrompt,
  collectPhase72LongMemEvalRetrievedTurns,
  isPhase72LongMemEvalExplicitAbstention,
  mergePhase72LongMemEvalAnswerRevisions,
  parsePhase72LongMemEvalAnswerRevisionOptions,
  resolvePhase72LongMemEvalConservativeRevision,
  resolvePhase72LongMemEvalAnswerRevisionModels,
  runPhase72LongMemEvalAnswerRevision,
  selectPhase72LongMemEvalFallbackTurnIds,
  selectPhase72LongMemEvalBm25Sessions,
  selectPhase72LongMemEvalHierarchicalTurnIds,
} from "../../scripts/run-phase-72-longmemeval-answer-revision";
import type {
  LongMemEvalCase,
  LongMemEvalCaseResult,
  LongMemEvalReport,
} from "../../src/eval/longmemeval";

const LIVE_ENV = {
  GOODMEMORY_EVAL_API_KEY: "answer-key",
  GOODMEMORY_EVAL_BASE_URL: "https://ai.gurkiai.com/v1",
  GOODMEMORY_EVAL_MODEL: "gpt-5.6-terra",
  GOODMEMORY_EVAL_PROVIDER: "openai",
  GOODMEMORY_JUDGE_API_KEY: "judge-key",
  GOODMEMORY_JUDGE_BASE_URL: "https://ai.gurkiai.com/v1",
  GOODMEMORY_JUDGE_MODEL: "gpt-5.5",
  GOODMEMORY_JUDGE_PROVIDER: "openai",
} as const;

function buildDatasetCase(): LongMemEvalCase {
  return {
    answer: "GOLD_ONLY_SECRET",
    answerSessionIds: ["session-retrieved"],
    haystackDates: ["2026-01-01", "2026-01-02"],
    haystackSessionIds: ["session-retrieved", "session-not-retrieved"],
    haystackSessions: [
      [
        {
          content: "The project is called Project Atlas.",
          hasAnswer: true,
          role: "user",
        },
      ],
      [
        {
          content: "The hidden gold answer must never enter the prompt.",
          hasAnswer: true,
          role: "assistant",
        },
      ],
    ],
    question: "What is the project called?",
    questionDate: "2026-01-03",
    questionId: "q-abstain",
    questionType: "single-session-user",
  };
}

function buildCaseResult(input: {
  correct: boolean;
  hypothesis: string;
  questionId: string;
}): LongMemEvalCaseResult {
  return {
    answerScore: {
      correct: input.correct,
      method: input.correct ? "exact" : "mismatch",
      reasoning: "fixture",
    },
    answerSessionIds: ["session-retrieved"],
    correct: input.correct,
    evidenceSessionRecall: 1,
    hypothesis: input.hypothesis,
    questionId: input.questionId,
    questionType: "single-session-user",
    retrievedSessionIds: ["session-retrieved"],
  };
}

function buildSourceReport(): LongMemEvalReport {
  const cases = [
    buildCaseResult({
      correct: false,
      hypothesis: "No answer",
      questionId: "q-abstain",
    }),
    buildCaseResult({
      correct: true,
      hypothesis: "Existing answer",
      questionId: "q-preserve",
    }),
  ];
  return {
    benchmarkFingerprint: "frozen-fingerprint",
    benchmarkRoot: "/cache/LongMemEval",
    generatedAt: "2026-07-14T00:00:00.000Z",
    generatedBy: "source-runner",
    ingestMode: "label-free-raw",
    mode: "full",
    outputDir: "/reports/longmemeval",
    phase: "phase-62",
    profiles: {
      "goodmemory-recommended": {
        cases,
        summary: {
          accuracy: 0.5,
          abstentionCorrectCases: 0,
          correctCases: 1,
          evidenceCaseCount: 2,
          evidenceSessionRecall: 1,
          missedRecallCases: 0,
          totalCases: 2,
          wrongAnswerCases: 1,
          wrongRecallCases: 0,
        },
      },
    },
    runDirectory: "/reports/longmemeval/source",
    runId: "source",
    source: {
      benchmark: "LongMemEval",
      license: "MIT code; dataset external",
      url: "https://github.com/xiaowu0162/LongMemEval",
    },
    summary: {
      abstentionCases: 0,
      caseCountsByQuestionType: { "single-session-user": 2 },
      executionFailures: 0,
      profilesCompared: ["goodmemory-recommended"],
      totalCases: 2,
    },
  };
}

describe("Phase 72 LongMemEval answer revision", () => {
  it("defaults to a full-report, 40-way Terra revision run", () => {
    expect(parsePhase72LongMemEvalAnswerRevisionOptions(
      ["bun", "run-phase-72-longmemeval-answer-revision.ts"],
      "/repo",
      "/cache",
    )).toEqual({
      allCases: false,
      benchmarkRoot: "/cache/LongMemEval",
      bm25SessionAugmentationLimit: 0,
      maxConcurrency: 40,
      outputDir: "/repo/reports/eval/research/phase-72/longmemeval",
      runId: "run-phase72-longmemeval-no-answer-listwise-hybrid-full500-terra-v1",
      selectedTurnLimit: 4,
      selectorChunkSize: 0,
      selectorChunkTurnLimit: 4,
      selectorReduceLimit: 0,
      sourceReportPath:
        "/repo/reports/eval/research/phase-72/longmemeval/run-phase72-longmemeval-semantic-live-full500-c40-v3-retry-merged-v4/report.json",
    });
  });

  it("supports a disclosed all-case conservative revision arm", () => {
    expect(parsePhase72LongMemEvalAnswerRevisionOptions([
      "bun",
      "run-phase-72-longmemeval-answer-revision.ts",
      "--all-cases",
      "--run-id",
      "all-case-revision",
    ], "/repo", "/cache")).toMatchObject({
      allCases: true,
      runId: "all-case-revision",
    });
  });

  it("supports a frozen selection with provider-free BM25 session augmentation", () => {
    expect(parsePhase72LongMemEvalAnswerRevisionOptions([
      "bun",
      "run-phase-72-longmemeval-answer-revision.ts",
      "--all-cases",
      "--selection-file",
      "/repo/selection.json",
      "--bm25-session-augmentation-limit",
      "2",
      "--selected-turn-limit",
      "8",
      "--selector-chunk-size",
      "32",
      "--selector-chunk-turn-limit",
      "3",
      "--selector-reduce-limit",
      "12",
    ], "/repo", "/cache")).toMatchObject({
      allCases: true,
      bm25SessionAugmentationLimit: 2,
      selectedTurnLimit: 8,
      selectionFile: "/repo/selection.json",
      selectorChunkSize: 32,
      selectorChunkTurnLimit: 3,
      selectorReduceLimit: 12,
    });
  });

  it("pins Terra generation and an independent gpt-5.5 rescore contract", () => {
    expect(resolvePhase72LongMemEvalAnswerRevisionModels(LIVE_ENV)).toEqual({
      answer: {
        gateway: "https://ai.gurkiai.com/v1",
        model: "gpt-5.6-terra",
        provider: "openai",
      },
      judge: {
        gateway: "https://ai.gurkiai.com/v1",
        model: "gpt-5.5",
        provider: "openai",
      },
    });
    expect(() => resolvePhase72LongMemEvalAnswerRevisionModels({
      ...LIVE_ENV,
      GOODMEMORY_JUDGE_MODEL: "gpt-5.6-terra",
    })).toThrow("gpt-5.5");
  });

  it("routes only canonical explicit abstentions", () => {
    expect(isPhase72LongMemEvalExplicitAbstention("No answer")).toBe(true);
    expect(isPhase72LongMemEvalExplicitAbstention(" No answer. ")).toBe(true);
    expect(isPhase72LongMemEvalExplicitAbstention("I do not know")).toBe(false);
    expect(isPhase72LongMemEvalExplicitAbstention("No answer is available because...")).toBe(false);
  });

  it("never degrades a substantive source answer into an abstention", () => {
    expect(resolvePhase72LongMemEvalConservativeRevision({
      candidate: "No answer",
      source: "17 days ago.",
    })).toBe("17 days ago.");
    expect(resolvePhase72LongMemEvalConservativeRevision({
      candidate: "Project Atlas",
      source: "No answer",
    })).toBe("Project Atlas");
    expect(resolvePhase72LongMemEvalConservativeRevision({
      candidate: "Project Atlas",
      source: "Project Apollo",
    })).toBe("Project Atlas");
  });

  it("preserves a scalar answer when a revision only widens it to a containing range", () => {
    expect(resolvePhase72LongMemEvalConservativeRevision({
      candidate: "About $49-51 after comparing the two options.",
      source: "About $50 after comparing the two options.",
    })).toBe("About $50 after comparing the two options.");
    expect(resolvePhase72LongMemEvalConservativeRevision({
      candidate: "About 49 to 51 minutes.",
      source: "About 50 minutes.",
    })).toBe("About 50 minutes.");
    expect(resolvePhase72LongMemEvalConservativeRevision({
      candidate: "2 projects.",
      source: "4 projects.",
    })).toBe("2 projects.");
  });

  it("collects candidate turns only from sessions retrieved by the source run", () => {
    expect(collectPhase72LongMemEvalRetrievedTurns({
      sourceCase: buildCaseResult({
        correct: false,
        hypothesis: "No answer",
        questionId: "q-abstain",
      }),
      testCase: buildDatasetCase(),
    })).toEqual([
      {
        content: "The project is called Project Atlas.",
        date: "2026-01-01",
        id: "session-retrieved::0",
        role: "user",
      },
    ]);
  });

  it("adds only the highest-scoring unretrieved BM25 sessions", () => {
    const testCase = buildDatasetCase();
    testCase.haystackSessions[1]![0]!.content =
      "Project Atlas study abroad details in Australia.";
    expect(selectPhase72LongMemEvalBm25Sessions({
      limit: 1,
      query: "Where was the Project Atlas study abroad program?",
      retrievedSessionIds: ["session-retrieved"],
      testCase,
    })).toEqual(["session-not-retrieved"]);
  });

  it("falls back to deterministic BM25 turn selection", () => {
    expect(selectPhase72LongMemEvalFallbackTurnIds({
      limit: 1,
      question: "What is the Project Atlas deadline?",
      turns: [{
        content: "Coffee preferences and breakfast plans.",
        date: "2026-01-01",
        id: "noise::0",
        role: "user",
      }, {
        content: "Project Atlas has a Friday deadline.",
        date: "2026-01-02",
        id: "answer::0",
        role: "user",
      }],
    })).toEqual(["answer::0"]);
  });

  it("fuses bounded global and chunk-local selector channels", async () => {
    const turns = Array.from({ length: 5 }, (_, index) => ({
      content: `Evidence ${index}`,
      date: "2026-01-01",
      id: `session::${index}`,
      role: "user",
    }));
    const calls: Array<{ limit: number; turnIds: string[] }> = [];

    const result = await selectPhase72LongMemEvalHierarchicalTurnIds({
      currentAnswer: "No answer",
      question: "What happened?",
      questionDate: "2026-01-03",
      selectedTurnLimit: 4,
      selectorChunkSize: 2,
      selectorChunkTurnLimit: 1,
      selectorReduceLimit: 0,
      selectTurnIds: async (input) => {
        calls.push({
          limit: input.selectedTurnLimit,
          turnIds: input.turns.map((turn) => turn.id),
        });
        return input.turns.length === turns.length
          ? ["session::0", "outside::0"]
          : [input.turns.at(-1)!.id, "outside::0"];
      },
      turns,
    });

    expect(result).toEqual({
      globalSelectedIds: ["session::0"],
      localSelectedIds: ["session::1", "session::3", "session::4"],
      reducedSelectedIds: [],
      selectedIds: ["session::0", "session::1", "session::3", "session::4"],
    });
    expect(calls.map((call) => call.limit)).toEqual([4, 1, 1, 1]);
  });

  it("reduces chunk-local winners without sending the full turn set globally", async () => {
    const turns = Array.from({ length: 5 }, (_, index) => ({
      content: `Evidence ${index}`,
      date: "2026-01-01",
      id: `session::${index}`,
      role: "user",
    }));
    const calls: Array<{ limit: number; turnIds: string[] }> = [];

    const result = await selectPhase72LongMemEvalHierarchicalTurnIds({
      currentAnswer: "No answer",
      question: "What happened?",
      questionDate: "2026-01-03",
      selectedTurnLimit: 4,
      selectorChunkSize: 2,
      selectorChunkTurnLimit: 1,
      selectorReduceLimit: 2,
      selectTurnIds: async (input) => {
        calls.push({
          limit: input.selectedTurnLimit,
          turnIds: input.turns.map((turn) => turn.id),
        });
        return input.turns.length === 3
          ? ["session::1", "session::4"]
          : [input.turns.at(-1)!.id];
      },
      turns,
    });

    expect(result).toEqual({
      globalSelectedIds: [],
      localSelectedIds: ["session::1", "session::3", "session::4"],
      reducedSelectedIds: ["session::1", "session::4"],
      selectedIds: ["session::1", "session::4"],
    });
    expect(calls).toEqual([
      { limit: 1, turnIds: ["session::0", "session::1"] },
      { limit: 1, turnIds: ["session::2", "session::3"] },
      { limit: 1, turnIds: ["session::4"] },
      { limit: 2, turnIds: ["session::1", "session::3", "session::4"] },
    ]);
  });

  it("keeps gold answers and answer labels out of selector and revision prompts", () => {
    const testCase = buildDatasetCase();
    const turns = collectPhase72LongMemEvalRetrievedTurns({
      sourceCase: buildCaseResult({
        correct: false,
        hypothesis: "No answer",
        questionId: "q-abstain",
      }),
      testCase,
    });
    const selectorPrompt = buildPhase72LongMemEvalSelectorPrompt({
      currentAnswer: "No answer",
      question: testCase.question,
      questionDate: testCase.questionDate,
      selectedTurnLimit: 8,
      turns,
    });
    const revisionPrompt = buildPhase72LongMemEvalRevisionPrompt({
      currentAnswer: "No answer",
      question: testCase.question,
      questionDate: testCase.questionDate,
      turns,
    });
    for (const prompt of [selectorPrompt, revisionPrompt]) {
      expect(prompt).not.toContain("has_answer");
      expect(prompt).not.toContain("answerSessionIds");
      expect(prompt).not.toContain(testCase.answer);
      expect(prompt).not.toContain("session-not-retrieved");
    }
    expect(selectorPrompt).toContain("Select up to 8 conversation turns");
  });

  it("replaces only routed rows and preserves the rest of the source report", () => {
    const source = buildSourceReport();
    const preserved = source.profiles["goodmemory-recommended"]!.cases[1]!;
    preserved.correct = false;
    preserved.answerScore = {
      correct: false,
      method: "semantic_judge",
      reasoning: "Source report used a different scoring protocol.",
    };
    const revised = buildCaseResult({
      correct: true,
      hypothesis: "Project Atlas",
      questionId: "q-abstain",
    });
    const preservedTestCase = buildDatasetCase();
    preservedTestCase.answer = "Existing answer";
    preservedTestCase.question = "What was the existing answer?";
    preservedTestCase.questionId = "q-preserve";
    const merged = mergePhase72LongMemEvalAnswerRevisions({
      generatedAt: "2026-07-14T01:00:00.000Z",
      outputDir: "/reports/longmemeval",
      revisions: [revised],
      runId: "hybrid",
      source,
      testCases: [buildDatasetCase(), preservedTestCase],
    });

    const cases = merged.profiles["goodmemory-recommended"]!.cases;
    expect(cases[0]!.hypothesis).toBe(revised.hypothesis);
    expect(cases[1]!.hypothesis).toBe(preserved.hypothesis);
    expect(cases[1]).toMatchObject({
      answerScore: { correct: true, method: "exact" },
      correct: true,
    });
    expect(merged.profiles["goodmemory-recommended"]!.summary).toMatchObject({
      accuracy: 0.5,
      correctCases: 1,
      totalCases: 2,
      wrongAnswerCases: 1,
    });
    expect(merged.runConfiguration).toEqual(source.runConfiguration);
    expect(merged.summary.executionFailures).toBe(0);
  });

  it("does not write a final artifact when selection fails", async () => {
    const source = buildSourceReport();
    delete source.benchmarkFingerprint;
    const rawDataset = [{
      answer: "GOLD_ONLY_SECRET",
      answer_session_ids: ["session-retrieved"],
      haystack_dates: ["2026-01-01", "2026-01-02"],
      haystack_session_ids: ["session-retrieved", "session-not-retrieved"],
      haystack_sessions: [
        [{
          content: "The project is called Project Atlas.",
          has_answer: true,
          role: "user",
        }],
        [{
          content: "Unretrieved evidence.",
          has_answer: true,
          role: "assistant",
        }],
      ],
      question: "What is the project called?",
      question_date: "2026-01-03",
      question_id: "q-abstain",
      question_type: "single-session-user",
    }, {
      answer: "Existing answer",
      answer_session_ids: ["session-retrieved"],
      haystack_dates: ["2026-01-01"],
      haystack_session_ids: ["session-retrieved"],
      haystack_sessions: [[{
        content: "Existing answer.",
        has_answer: true,
        role: "user",
      }]],
      question: "What was the existing answer?",
      question_date: "2026-01-03",
      question_id: "q-preserve",
      question_type: "single-session-user",
    }];
    const writes: string[] = [];

    await expect(runPhase72LongMemEvalAnswerRevision({
      allCases: false,
      benchmarkRoot: "/cache/LongMemEval",
      bm25SessionAugmentationLimit: 0,
      maxConcurrency: 40,
      outputDir: "/reports/longmemeval",
      runId: "failed-run",
      selectedTurnLimit: 4,
      selectorChunkSize: 0,
      selectorChunkTurnLimit: 4,
      selectorReduceLimit: 0,
      sourceReportPath: "/reports/source.json",
    }, LIVE_ENV, {
      mkdir: async () => {},
      readFile: async (path) => path.endsWith("source.json")
        ? JSON.stringify(source)
        : JSON.stringify(rawDataset),
      reviseAnswer: async () => "Project Atlas",
      selectTurnIds: async () => {
        throw new Error("selector unavailable");
      },
      writeFile: async (path) => {
        writes.push(path);
      },
    })).rejects.toThrow("selector unavailable");
    expect(writes).toEqual([]);
  });
});
