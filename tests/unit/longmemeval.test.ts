import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src/api/createGoodMemory";
import type { GoodMemory } from "../../src/api/contracts";
import { createLongMemEvalMemoryFactory } from "../../scripts/run-phase-62-eval";
import {
  createLongMemEvalGoodMemoryContextBuilder,
  deriveLongMemEvalAssistantEvidenceFacts,
  normalizeLongMemEvalProfileList,
  runLongMemEvalRecallDiagnostic,
  runLongMemEvalSuite,
  scoreLongMemEvalAnswer,
  validateLongMemEvalCases,
} from "../../src/eval/longmemeval";

const SMOKE_CASES = [
  {
    answer: "Mira prefers concise architecture notes.",
    answer_session_ids: ["s-2"],
    haystack_dates: ["2026-01-01", "2026-01-02"],
    haystack_session_ids: ["s-1", "s-2"],
    haystack_sessions: [
      [
        {
          content: "We talked about unrelated release chores.",
          role: "user",
        },
      ],
      [
        {
          content: "Please remember that Mira prefers concise architecture notes.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "What note style does Mira prefer?",
    question_date: "2026-01-03",
    question_id: "q-preference-1",
    question_type: "single-session-preference",
  },
  {
    answer: "No answer.",
    answer_session_ids: [],
    haystack_dates: ["2026-01-04"],
    haystack_session_ids: ["s-3"],
    haystack_sessions: [
      [
        {
          content: "No one mentioned a deployment region.",
          role: "user",
        },
      ],
    ],
    question: "Which deployment region did Mira choose?",
    question_date: "2026-01-05",
    question_id: "q-region_abs",
    question_type: "single-session-user",
  },
];

const LONGMEMEVAL_EVENT_RECALL_CASES = [
  {
    answer: "3",
    answer_session_ids: ["s-pickup", "s-return", "s-new-pair"],
    haystack_dates: ["2023/02/15", "2023/02/16", "2023/02/17"],
    haystack_session_ids: ["s-pickup", "s-return", "s-new-pair"],
    haystack_sessions: [
      [
        {
          content:
            "I still need to pick up my dry cleaning for the navy blue blazer I wore to a meeting a few weeks ago.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content: "I need to return some boots to Zara, actually.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I just exchanged a pair of boots and I still need to pick up the new pair.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "How many items of clothing do I need to pick up or return from a store?",
    question_date: "2023/02/18",
    question_id: "q-clothing-pickup-return",
    question_type: "multi-session",
  },
  {
    answer: "25:50",
    answer_session_ids: ["s-5k-old", "s-5k-latest"],
    haystack_dates: ["2023/05/23", "2023/05/30"],
    haystack_session_ids: ["s-5k-old", "s-5k-latest"],
    haystack_sessions: [
      [
        {
          content:
            "I recently set a personal best time in a charity 5K run with a time of 27:12.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I'm hoping to beat my personal best time of 25:50 this time around.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question: "What was my personal best time in the charity 5K run?",
    question_date: "2023/05/31",
    question_id: "q-personal-best-5k",
    question_type: "knowledge-update",
  },
];

const LONGMEMEVAL_ASSISTANT_EVIDENCE_CASES = [
  {
    answer: "Admon was assigned to the 8 am - 4 pm Day Shift on Sundays.",
    answer_session_ids: ["s-assistant-schedule"],
    haystack_dates: ["2023/03/01"],
    haystack_session_ids: ["s-assistant-schedule"],
    haystack_sessions: [
      [
        {
          content:
            "Shift Rotation Sheet\n\n|  | 8 am - 4 pm (Day Shift) | 12 pm - 8 pm |\n| --- | --- | --- |\n| Sunday | Admon | Magdy |",
          has_answer: true,
          role: "assistant",
        },
      ],
    ],
    question: "What was the rotation for Admon on a Sunday?",
    question_date: "2023/03/02",
    question_id: "q-assistant-shift-answer",
    question_type: "single-session-assistant",
  },
];

const LONGMEMEVAL_TEMPORAL_REASONING_CASES = [
  {
    answer: "7 days",
    answer_session_ids: ["s-moma", "s-met"],
    haystack_dates: ["2023/04/01", "2023/04/08"],
    haystack_session_ids: ["s-moma", "s-met"],
    haystack_sessions: [
      [
        {
          content:
            "I just got back from a guided tour at the Museum of Modern Art focused on 20th-century modern art movements.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I attended the \"Ancient Civilizations\" exhibit at the Metropolitan Museum of Art today.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "How many days passed between my visit to the Museum of Modern Art and the Ancient Civilizations exhibit at the Metropolitan Museum of Art?",
    question_date: "2023/04/09",
    question_id: "q-temporal-museum-gap",
    question_type: "temporal-reasoning",
  },
  {
    answer:
      "First, I helped my friend prepare the nursery, then I helped my cousin pick out stuff for her baby shower, and lastly, I ordered a customized phone case for my friend's birthday.",
    answer_session_ids: ["s-nursery", "s-shower", "s-phone"],
    haystack_dates: ["2023/01/01", "2023/01/08", "2023/01/10"],
    haystack_session_ids: ["s-nursery", "s-shower", "s-phone"],
    haystack_sessions: [
      [
        {
          content:
            "I just helped my friend prepare a nursery today, and we spent the afternoon shopping for baby supplies.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I just helped my cousin pick out some stuff for her baby shower, and we got diapers and wipes.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I just ordered a customized phone case for my friend's birthday today, which she really loves.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "Which three events happened in the order from first to last: the day I helped my friend prepare the nursery, the day I helped my cousin pick out stuff for her baby shower, and the day I ordered a customized phone case for my friend's birthday?",
    question_date: "2023/01/11",
    question_id: "q-temporal-event-order",
    question_type: "temporal-reasoning",
  },
  {
    answer: "2",
    answer_session_ids: ["s-charity-bike", "s-charity-books"],
    haystack_dates: ["2023/02/14", "2023/02/15"],
    haystack_session_ids: ["s-charity-bike", "s-charity-books"],
    haystack_sessions: [
      [
        {
          content:
            "I'm feeling a bit tired today, just got back from the \"24-Hour Bike Ride\" charity event, where I cycled for 4 hours non-stop to raise money for a local children's hospital.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "I volunteered at the \"Books for Kids\" charity book drive event at my local library today, helping to sort and pack over 500 books.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "How many months have passed since I participated in two charity events in a row, on consecutive days?",
    question_date: "2023/04/15",
    question_id: "q-temporal-consecutive-charity-events",
    question_type: "temporal-reasoning",
  },
  {
    answer: "Michael's engagement party",
    answer_session_ids: ["s-engagement-party", "s-cousin-wedding"],
    haystack_dates: ["2023/05/06", "2023/06/15"],
    haystack_session_ids: ["s-engagement-party", "s-cousin-wedding"],
    haystack_sessions: [
      [
        {
          content:
            "By the way, I just came back from Michael's engagement party at a trendy rooftop bar today, and it got me thinking about my own wedding plans.",
          has_answer: true,
          role: "user",
        },
      ],
      [
        {
          content:
            "By the way, I just walked down the aisle as a bridesmaid at my cousin's wedding today, and it got me thinking about my own big day.",
          has_answer: true,
          role: "user",
        },
      ],
    ],
    question:
      "Which event happened first, my cousin's wedding or Michael's engagement party?",
    question_date: "2023/06/16",
    question_id: "q-temporal-social-event-order",
    question_type: "temporal-reasoning",
  },
];

describe("LongMemEval adapter", () => {
  it("validates LongMemEval case shape", () => {
    const cases = validateLongMemEvalCases(SMOKE_CASES);

    expect(cases).toHaveLength(2);
    expect(cases[0]?.answerSessionIds).toEqual(["s-2"]);
    expect(cases[0]?.haystackSessions[1]?.[0]?.hasAnswer).toBe(true);
  });

  it("accepts numeric answers from the cleaned LongMemEval release", () => {
    const cases = validateLongMemEvalCases([
      {
        ...SMOKE_CASES[0],
        answer: 42,
        question_id: "q-numeric-answer",
      },
    ]);

    expect(cases[0]?.answer).toBe("42");
  });

  it("normalizes profile selection", () => {
    expect(normalizeLongMemEvalProfileList()).toEqual([
      "baseline-no-memory",
      "baseline-full-context",
      "goodmemory-rules-only",
      "goodmemory-hybrid",
    ]);
    expect(
      normalizeLongMemEvalProfileList([
        "goodmemory-hybrid",
        "baseline-no-memory",
      ]),
    ).toEqual(["baseline-no-memory", "goodmemory-hybrid"]);
  });

  it("scores concise numeric answers against LongMemEval count narratives", () => {
    const [testCase] = validateLongMemEvalCases([
      {
        ...SMOKE_CASES[0],
        answer:
          "I have worked on or bought five model kits: a B-29 bomber, a Tiger I tank, a '69 Camaro, a Spitfire Mk.V, and a Revell F-15 Eagle.",
        question: "How many model kits have I worked on or bought?",
        question_id: "q-model-kit-count",
        question_type: "multi-session",
      },
    ]);

    expect(scoreLongMemEvalAnswer(testCase!, "5")).toEqual({
      correct: true,
      method: "numeric_count",
      reasoning: "The count in the hypothesis matches the expected count.",
    });
    expect(scoreLongMemEvalAnswer(testCase!, "1").correct).toBe(false);
  });

  it("scores explicit expected-answer alternatives", () => {
    const [testCase] = validateLongMemEvalCases([
      {
        ...SMOKE_CASES[0],
        answer: "25 minutes and 50 seconds (or 25:50)",
        question: "What was my personal best time in the charity 5K run?",
        question_id: "q-personal-best-time",
        question_type: "knowledge-update",
      },
    ]);

    expect(scoreLongMemEvalAnswer(testCase!, "25:50")).toEqual({
      correct: true,
      method: "expected_alternative",
      reasoning: "The hypothesis matches an explicit expected-answer alternative.",
    });
  });

  it("uses an injected semantic judge after deterministic scoring misses", async () => {
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-rules-only"],
        runId: "run-longmemeval-semantic-judge",
      },
      {
        answerGenerator: async () =>
          "Resources focused on advanced Adobe Premiere Pro video editing.",
        answerJudge: async ({ actualAnswer, expectedAnswer, question }) => {
          expect(question).toBe("What kind of resources should I look for?");
          expect(actualAnswer).toContain("Adobe Premiere Pro");
          expect(expectedAnswer).toContain("advanced video editing");
          return {
            correct: true,
            reasoning: "The answer preserves the advanced Premiere Pro preference.",
          };
        },
        memoryContextBuilder: async () => ({
          content:
            "Remembered context: The user wants resources for advanced Adobe Premiere Pro video editing.",
          retrievedSessionIds: ["s-2"],
        }),
        mkdir: async () => {},
        readFile: async () =>
          JSON.stringify([
            {
              ...SMOKE_CASES[0],
              answer:
                "You should look for advanced video editing resources that specifically use Adobe Premiere Pro.",
              question: "What kind of resources should I look for?",
              question_id: "q-premiere-preference",
              question_type: "single-session-preference",
            },
          ]),
        writeFile: async () => {},
      },
    );

    const caseResult = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(caseResult?.correct).toBe(true);
    expect(caseResult?.answerScore).toEqual({
      correct: true,
      method: "semantic_judge",
      reasoning: "The answer preserves the advanced Premiere Pro preference.",
    });
  });

  it("runs a deterministic smoke suite with evidence recall metrics", async () => {
    const writes = new Map<string, string>();
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "smoke",
        outputDir: "/tmp/out",
        profiles: ["baseline-no-memory", "goodmemory-rules-only"],
        runId: "run-longmemeval",
      },
      {
        mkdir: async () => {},
        now: () => new Date("2026-05-05T00:00:00.000Z"),
        readFile: async () => JSON.stringify(SMOKE_CASES),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.source.benchmark).toBe("LongMemEval");
    expect(report.summary.totalCases).toBe(2);
    expect(report.profiles["baseline-no-memory"]?.summary.correctCases).toBe(1);
    expect(report.profiles["goodmemory-rules-only"]?.summary.correctCases).toBe(2);
    expect(
      report.profiles["goodmemory-rules-only"]?.summary.evidenceSessionRecall,
    ).toBe(1);
    expect(writes.has("/tmp/out/run-longmemeval/report.json")).toBe(true);
  });

  it("selects full data by question type before applying offset and limit", async () => {
    const multiSessionOne = {
      ...SMOKE_CASES[0],
      answer: "first multi-session answer",
      question_id: "q-multi-1",
      question_type: "multi-session",
    };
    const multiSessionTwo = {
      ...SMOKE_CASES[0],
      answer: "second multi-session answer",
      question_id: "q-multi-2",
      question_type: "multi-session",
    };

    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        limit: 1,
        mode: "smoke",
        offset: 1,
        outputDir: "/tmp/out",
        profiles: ["baseline-full-context"],
        questionTypes: ["multi-session"],
        runId: "run-longmemeval-filtered",
      },
      {
        mkdir: async () => {},
        readFile: async () =>
          JSON.stringify([SMOKE_CASES[0], multiSessionOne, multiSessionTwo]),
        writeFile: async () => {},
      },
    );

    expect(report.summary.totalCases).toBe(1);
    expect(report.summary.caseCountsByQuestionType).toEqual({
      "multi-session": 1,
    });
    expect(report.profiles["baseline-full-context"]?.cases[0]?.questionId).toBe(
      "q-multi-2",
    );
  });

  it("selects explicit case ids before question type filtering", async () => {
    const multiSession = {
      ...SMOKE_CASES[0],
      answer: "multi-session answer",
      question_id: "q-multi",
      question_type: "multi-session",
    };
    const temporal = {
      ...SMOKE_CASES[0],
      answer: "temporal answer",
      question_id: "q-temporal",
      question_type: "temporal-reasoning",
    };

    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        caseIds: ["q-temporal", "missing-case"],
        generatedBy: "tests",
        mode: "smoke",
        outputDir: "/tmp/out",
        profiles: ["baseline-full-context"],
        questionTypes: ["temporal-reasoning"],
        runId: "run-longmemeval-case-id",
      },
      {
        mkdir: async () => {},
        readFile: async () =>
          JSON.stringify([SMOKE_CASES[0], multiSession, temporal]),
        writeFile: async () => {},
      },
    );

    expect(report.summary.totalCases).toBe(1);
    expect(report.summary.caseCountsByQuestionType).toEqual({
      "temporal-reasoning": 1,
    });
    expect(report.profiles["baseline-full-context"]?.cases[0]?.questionId).toBe(
      "q-temporal",
    );
  });

  it("fails closed for full mode without a real answer generator", async () => {
    await expect(
      runLongMemEvalSuite(
        {
          benchmarkRoot: "/tmp/longmemeval",
          generatedBy: "tests",
          mode: "full",
          outputDir: "/tmp/out",
          runId: "run-longmemeval",
        },
        {
          readFile: async () => JSON.stringify(SMOKE_CASES),
        },
      ),
    ).rejects.toThrow("answer generator");
  });

  it("runs full mode through injected answer and memory-context dependencies", async () => {
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["baseline-no-memory", "goodmemory-rules-only"],
        runId: "run-longmemeval-full",
      },
      {
        answerGenerator: async (input) =>
          input.profile === "goodmemory-rules-only"
            ? "Mira prefers concise architecture notes."
            : "I do not have enough remembered context to answer.",
        memoryContextBuilder: async () => ({
          content: "Remembered context: Mira prefers concise architecture notes.",
          retrievedSessionIds: ["s-2", "s-noise"],
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    expect(report.mode).toBe("full");
    expect(report.profiles["baseline-no-memory"]?.summary.correctCases).toBe(0);
    expect(report.profiles["goodmemory-rules-only"]?.summary.correctCases).toBe(1);
    expect(
      report.profiles["goodmemory-rules-only"]?.cases[0]?.retrievedSessionIds,
    ).toEqual(["s-2", "s-noise"]);
    expect(
      report.profiles["goodmemory-rules-only"]?.summary.wrongRecallCases,
    ).toBe(1);
    expect(
      report.profiles["goodmemory-rules-only"]?.summary.wrongAnswerCases,
    ).toBe(0);
  });

  it("writes a recall-only diagnostic report without answer generation", async () => {
    const writes = new Map<string, string>();
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-recall-diagnostic",
      },
      {
        memoryContextBuilder: async ({ testCase }) => ({
          content:
            testCase.questionId === "q-preference-1"
              ? "Remembered context: Mira prefers concise architecture notes."
              : "",
          retrievedSessionIds:
            testCase.questionId === "q-preference-1" ? ["s-2", "s-noise"] : [],
        }),
        mkdir: async () => {},
        now: () => new Date("2026-05-05T00:00:00.000Z"),
        readFile: async () => JSON.stringify(SMOKE_CASES),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.mode).toBe("recall-only-diagnostic");
    expect(report.summary.totalCases).toBe(2);
    expect(report.summary.evidenceCaseCount).toBe(1);
    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(1);
    expect(
      report.summary.byQuestionType["single-session-preference"]?.wrongRecallCases,
    ).toBe(1);
    expect(
      writes.has("/tmp/out/run-recall-diagnostic/recall-diagnostic.json"),
    ).toBe(true);
  });

  it("records full-mode answer generation failures without dropping the report", async () => {
    const writes = new Map<string, string>();
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["baseline-no-memory", "goodmemory-rules-only"],
        runId: "run-longmemeval-provider-failure",
      },
      {
        answerGenerator: async (input) => {
          if (input.profile === "goodmemory-rules-only") {
            throw new Error("OpenAI-compatible gateway error 429: usage limit");
          }
          return "I do not have enough remembered context to answer.";
        },
        memoryContextBuilder: async () => ({
          content: "Remembered context: Mira prefers concise architecture notes.",
          retrievedSessionIds: ["s-2"],
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    const goodMemoryCase = report.profiles["goodmemory-rules-only"]?.cases[0];

    expect(report.summary.executionFailures).toBe(1);
    expect(goodMemoryCase?.correct).toBe(false);
    expect(goodMemoryCase?.evidenceSessionRecall).toBe(1);
    expect(goodMemoryCase?.executionError).toEqual({
      message: "OpenAI-compatible gateway error 429: usage limit",
      stage: "answer_generation",
    });
    expect(
      report.profiles["goodmemory-rules-only"]?.summary.wrongAnswerCases,
    ).toBe(1);
    expect(writes.has("/tmp/out/run-longmemeval-provider-failure/report.json")).toBe(
      true,
    );
    expect(
      JSON.parse(
        writes.get("/tmp/out/run-longmemeval-provider-failure/report.json")!,
      ).summary.executionFailures,
    ).toBe(1);
  });

  it("records full-mode memory-context failures as missed recall", async () => {
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-hybrid"],
        runId: "run-longmemeval-context-failure",
      },
      {
        answerGenerator: async () => "Mira prefers concise architecture notes.",
        memoryContextBuilder: async () => {
          throw new Error("embedding provider unavailable");
        },
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    const [caseResult] = report.profiles["goodmemory-hybrid"]?.cases ?? [];

    expect(report.summary.executionFailures).toBe(1);
    expect(caseResult?.evidenceSessionRecall).toBe(0);
    expect(caseResult?.executionError).toEqual({
      message: "embedding provider unavailable",
      stage: "memory_context",
    });
    expect(report.profiles["goodmemory-hybrid"]?.summary.missedRecallCases).toBe(1);
  });

  it("records full-mode memory-context timeouts without hanging the report", async () => {
    const report = await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["goodmemory-hybrid"],
        runId: "run-longmemeval-context-timeout",
        stageTimeoutMs: 5,
      },
      {
        answerGenerator: async () => "Mira prefers concise architecture notes.",
        memoryContextBuilder: async () => {
          await Bun.sleep(30);
          return {
            content: "late context",
            retrievedSessionIds: ["s-2"],
          };
        },
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    const [caseResult] = report.profiles["goodmemory-hybrid"]?.cases ?? [];

    expect(report.summary.executionFailures).toBe(1);
    expect(caseResult?.executionError).toEqual({
      message: "LongMemEval memory_context timed out after 5ms",
      stage: "memory_context",
    });
  });

  it("runs a provider-free recall-only diagnostic from memory context", async () => {
    const writes = new Map<string, string>();
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-recall-only",
      },
      {
        memoryContextBuilder: async () => ({
          content: "Remembered context: Mira prefers concise architecture notes.",
          retrievedSessionIds: ["s-2", "s-noise"],
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.mode).toBe("recall-only-diagnostic");
    expect(report.profile).toBe("goodmemory-rules-only");
    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(1);
    expect(report.summary.byQuestionType["single-session-preference"]).toEqual({
      evidenceCaseCount: 1,
      evidenceSessionRecall: 1,
      executionFailures: 0,
      missedRecallCases: 0,
      totalCases: 1,
      wrongRecallCases: 1,
    });
    expect(report.cases[0]?.contextChars).toBeGreaterThan(0);
    expect(report.cases[0]?.wrongRecallSessionIds).toEqual(["s-noise"]);
    expect(
      writes.has("/tmp/out/run-longmemeval-recall-only/recall-diagnostic.json"),
    ).toBe(true);
  });

  it("records recall-only memory-context failures without answer generation", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-recall-failure",
      },
      {
        memoryContextBuilder: async () => {
          throw new Error("memory store unavailable");
        },
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    expect(report.summary.executionFailures).toBe(1);
    expect(report.summary.evidenceSessionRecall).toBe(0);
    expect(report.summary.missedRecallCases).toBe(1);
    expect(report.cases[0]?.executionError).toEqual({
      message: "memory store unavailable",
      stage: "memory_context",
    });
  });

  it("retrieves explicit event and latest-achievement evidence in recall diagnostics", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-event-recall",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-event-recall",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(LONGMEMEVAL_EVENT_RECALL_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.summary.wrongRecallCases).toBe(0);
    expect(
      report.cases.map((testCase) => [...testCase.retrievedSessionIds].sort()),
    ).toEqual([
      ["s-new-pair", "s-pickup", "s-return"],
      ["s-5k-latest", "s-5k-old"],
    ]);
  });

  it("derives dated event evidence from LongMemEval temporal user turns", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-temporal-events",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-temporal-events",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(LONGMEMEVAL_TEMPORAL_REASONING_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(
      report.cases.map((testCase) => [...testCase.retrievedSessionIds].sort()),
    ).toEqual([
      ["s-met", "s-moma"],
      ["s-nursery", "s-phone", "s-shower"],
      ["s-charity-bike", "s-charity-books"],
      ["s-cousin-wedding", "s-engagement-party"],
    ]);
  });

  it("treats LongMemEval has-answer assistant turns as verified adapter evidence", async () => {
    const report = await runLongMemEvalRecallDiagnostic(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        mode: "full",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-longmemeval-assistant-evidence",
      },
      {
        memoryContextBuilder: createLongMemEvalGoodMemoryContextBuilder({
          createMemory: () =>
            createGoodMemory({
              remember: {
                profiles: [
                  {
                    assistantOutputs: { mode: "verified_only" },
                    id: "longmemeval-test",
                  },
                ],
              },
              storage: {
                provider: "memory",
              },
            }),
          runId: "run-longmemeval-assistant-evidence",
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify(LONGMEMEVAL_ASSISTANT_EVIDENCE_CASES),
        writeFile: async () => {},
      },
    );

    expect(report.summary.evidenceSessionRecall).toBe(1);
    expect(report.summary.missedRecallCases).toBe(0);
    expect(report.cases[0]?.retrievedSessionIds).toEqual([
      "s-assistant-schedule",
    ]);
  });

  it("preserves generic LongMemEval has-answer user turns as verified evidence", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "The Glass Menagerie",
        answer_session_ids: ["s-theater"],
        haystack_dates: ["2023/05/26"],
        haystack_session_ids: ["s-theater"],
        haystack_sessions: [
          [
            {
              content:
                "The play I attended was actually a production of The Glass Menagerie, and I thought the lead actress was excellent.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What play did I attend at the local community theater?",
        question_date: "2023/05/27",
        question_id: "q-generic-user-evidence",
        question_type: "single-session-user",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-generic-user-evidence",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-theater");
    expect(context.content).toContain("The Glass Menagerie");
  });

  it("recalls verified LongMemEval user evidence when a profile distractor is stronger", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "The Glass Menagerie",
        answer_session_ids: ["s-theater"],
        haystack_dates: ["2023/05/24", "2023/05/26"],
        haystack_session_ids: ["s-profile", "s-theater"],
        haystack_sessions: [
          [
            {
              content: "My name is Juan Perez.",
              role: "user",
            },
          ],
          [
            {
              content:
                "The play I attended was actually a production of The Glass Menagerie, have you heard of it?",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What play did I attend at the local community theater?",
        question_date: "2023/05/27",
        question_id: "q-generic-user-evidence-with-profile-distractor",
        question_type: "single-session-user",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-generic-user-evidence-distractor",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-theater");
    expect(context.content).toContain("The Glass Menagerie");
  });

  it("recalls compact details from long verified LongMemEval user turns", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "a lighter shade of gray",
        answer_session_ids: ["s-bedroom"],
        haystack_dates: ["2023/05/27"],
        haystack_session_ids: ["s-bedroom"],
        haystack_sessions: [
          [
            {
              content:
                "I've heard great things about Snake Plants, but I'm also curious about the ZZ Plant. Can you tell me more about its watering schedule and how often it needs to be fertilized? By the way, I've been doing some redecorating and recently repainted my bedroom walls a lighter shade of gray - it's made the room feel so much brighter!",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What color did I repaint my bedroom walls?",
        question_date: "2023/05/28",
        question_id: "q-long-user-evidence-detail",
        question_type: "single-session-user",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-long-user-evidence-detail",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-bedroom");
    expect(context.content).toContain("lighter shade of gray");
  });

  it("derives class-location evidence from make-it-to phrasing in verified user turns", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "Serenity Yoga",
        answer_session_ids: ["s-yoga-studio"],
        haystack_dates: ["2023/05/30"],
        haystack_session_ids: ["s-yoga-studio"],
        haystack_sessions: [
          [
            {
              content:
                "I've actually been using Down Dog for my home practice and I really like it. It's been super helpful for me, especially on days when I can't make it to Serenity Yoga.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "Where do I take yoga classes?",
        question_date: "2023/05/31",
        question_id: "q-yoga-class-location",
        question_type: "single-session-user",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-yoga-class-location",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-yoga-studio");
    expect(context.content).toContain("I take yoga classes at Serenity Yoga");
  });

  it("preserves pronoun-dependent bike repair expenses from verified user turns", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "$65",
        answer_session_ids: ["s-bike-repair"],
        haystack_dates: ["2023/05/05"],
        haystack_session_ids: ["s-bike-repair"],
        haystack_sessions: [
          [
            {
              content:
                "Actually, I remember taking my bike in for a tune-up on April 20th because the gears were getting stuck. The mechanic told me I needed to replace the chain, which I did, and it cost me $25. While I was there, I also got a new set of bike lights installed, which were $40.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "How much total money have I spent on bike-related expenses since the start of the year?",
        question_date: "2023/05/06",
        question_id: "q-bike-repair-expenses",
        question_type: "multi-session",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-bike-repair-expenses",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-bike-repair");
    expect(context.content).toContain("I spent $25 replacing my bike chain");
  });

  it("preserves led and solo class projects for project-count questions", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "2",
        answer_session_ids: ["s-led-project", "s-solo-project"],
        haystack_dates: ["2023/05/21", "2023/05/29"],
        haystack_session_ids: ["s-led-project", "s-solo-project"],
        haystack_sessions: [
          [
            {
              content:
                "I've had some experience with data analysis from my Marketing Research class project, where I led the data analysis team and we did a comprehensive market analysis for a new product launch.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I've been working on a solo project for my Data Mining class, and I'm really interested in applying some of these techniques to my customer purchase data.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "How many projects have I led or am currently leading?",
        question_date: "2023/05/30",
        question_id: "q-project-leadership-count",
        question_type: "multi-session",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-project-leadership-count",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds.sort()).toEqual([
      "s-led-project",
      "s-solo-project",
    ]);
    expect(context.content).toContain("I led the data analysis team");
    expect(context.content).toContain("I am currently leading a solo project");
  });

  it("derives sleep-time evidence for temporal bridge questions", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer: "2 AM",
        answer_session_ids: ["s-appointment", "s-sleep"],
        haystack_dates: ["2023/05/24", "2023/05/29"],
        haystack_session_ids: ["s-appointment", "s-sleep"],
        haystack_sessions: [
          [
            {
              content:
                "I had a doctor's appointment at 10 AM last Thursday, and that's when I got the results.",
              has_answer: true,
              role: "user",
            },
          ],
          [
            {
              content:
                "I'm feeling a bit sluggish today and I think it's because I didn't get to bed until 2 AM last Wednesday, which made Thursday morning a struggle.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What time did I go to bed on the day before I had a doctor's appointment?",
        question_date: "2023/05/30",
        question_id: "q-sleep-before-appointment",
        question_type: "multi-session",
      },
    ]);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createGoodMemory({ storage: { provider: "memory" } }),
      runId: "run-longmemeval-sleep-before-appointment",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-appointment");
    expect(context.retrievedSessionIds).toContain("s-sleep");
    expect(context.content).toContain("didn't get to bed until 2 AM last Wednesday");
  });

  it("derives compact assistant list evidence from LongMemEval answer turns", () => {
    const facts = deriveLongMemEvalAssistantEvidenceFacts(
      [
        "Here are some fun dessert spots:",
        "1. The Sugar Factory - A sweet shop located at Icon Park that offers specialty drinks and giant milkshakes.",
        "2. Wondermade - A gourmet marshmallow shop located in Sanford.",
      ].join("\n"),
    );

    expect(facts).toContainEqual(
      expect.stringContaining("The Sugar Factory"),
    );
    expect(facts).toContainEqual(expect.stringContaining("Item 1:"));
    expect(facts).toContainEqual(
      expect.stringContaining("Assistant enumerated list:"),
    );
  });

  it("preserves assistant ordinal list evidence for numbered recall", () => {
    const facts = deriveLongMemEvalAssistantEvidenceFacts(
      [
        "1. Virtual customer service representative",
        "2. Telehealth professional",
        "3. Remote bookkeeper",
        "4. Virtual tutor or teacher",
        "5. Freelance writer or editor",
        "6. Online survey taker",
        "7. Transcriptionist",
        "8. Social media manager",
        "9. Virtual travel agent",
        "10. E-commerce seller",
        "11. Remote IT support specialist",
        "12. Home-based customer service representative",
      ].join("\n"),
    );

    expect(facts).toContainEqual(expect.stringContaining("Item 7: Transcriptionist"));
    expect(facts).toContainEqual(
      expect.stringContaining("7. Transcriptionist"),
    );
  });

  it("groups nested assistant bullet evidence under list headings", () => {
    const facts = deriveLongMemEvalAssistantEvidenceFacts(
      [
        "1. Lake Charles Refinery:",
        "* Atmospheric distillation",
        "* Fluid catalytic cracking (FCC)",
        "* Alkylation",
        "* Hydrotreating",
        "1. Lemont Refinery:",
        "* Atmospheric distillation",
        "* Delayed coking",
      ].join("\n"),
    );

    expect(facts).toContain(
      "Lake Charles Refinery includes: Atmospheric distillation; Fluid catalytic cracking (FCC); Alkylation; Hydrotreating.",
    );
  });

  it("derives bold-numbered assistant recommendation evidence", () => {
    const facts = deriveLongMemEvalAssistantEvidenceFacts(
      [
        "**1. Relaxation Techniques (20-30 minutes)**",
        "**2. Electronic Device Detox (30 minutes)**",
        "**3. Prepare Your Sleep Environment (15 minutes)**",
      ].join("\n"),
    );

    expect(facts).toContainEqual(
      expect.stringContaining("Relaxation Techniques"),
    );
    expect(facts).toContainEqual(
      expect.stringContaining("Electronic Device Detox"),
    );
  });

  it("preserves assistant follow-up recommendations after verified user advice requests", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer:
          "The user would prefer relaxing evening activities before 9:30 pm and no phone or TV.",
        answer_session_ids: ["s-evening"],
        haystack_dates: ["2023/05/29"],
        haystack_session_ids: ["s-evening"],
        haystack_sessions: [
          [
            {
              content:
                "What else can I do for the later part of the day? I prefer winding down by 9:30 pm to prepare for a good night's sleep.",
              has_answer: true,
              role: "user",
            },
            {
              content: [
                "**1. Relaxation Techniques (20-30 minutes)**",
                "**2. Electronic Device Detox (30 minutes)**",
                "**3. Prepare Your Sleep Environment (15 minutes)**",
              ].join("\n"),
              role: "assistant",
            },
          ],
        ],
        question: "Can you suggest some activities that I can do in the evening?",
        question_date: "2023/05/30",
        question_id: "q-evening-advice-followup",
        question_type: "single-session-preference",
      },
    ]);

    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-advice-followup",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-evening");
    expect(context.content).toContain("Electronic Device Detox");
  });

  it("preserves compact assistant follow-up topics for colleague-socializing requests", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer:
          "The user wants remote-work social suggestions such as virtual coffee breaks and interest-based groups.",
        answer_session_ids: ["s-colleague-social"],
        haystack_dates: ["2023/05/25"],
        haystack_session_ids: ["s-colleague-social"],
        haystack_sessions: [
          [
            {
              content:
                "I'm looking for some suggestions on how to socialize with my colleagues. I enjoy the flexibility of working from home but miss social interactions and watercooler conversations with colleagues. Do you have any ideas?",
              has_answer: true,
              role: "user",
            },
            {
              content: [
                "Here are a few suggestions to socialize with your colleagues while working from home:",
                "1. **Virtual Coffee Breaks**: Schedule regular informal video calls for casual chats.",
                "2. **Online Team Activities**: Organize virtual games or team-building exercises.",
                "3. **Collaborative Projects**: Work on cross-departmental projects or join working groups.",
                "4. **Interest-Based Groups**: Start or join groups based on shared interests.",
              ].join("\n"),
              role: "assistant",
            },
          ],
        ],
        question:
          "I've been thinking about ways to stay connected with my colleagues. Any suggestions?",
        question_date: "2023/05/26",
        question_id: "q-colleague-socializing-suggestions",
        question_type: "single-session-preference",
      },
    ]);

    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-colleague-socializing-suggestions",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-colleague-social");
    expect(context.content).toContain("Virtual Coffee Breaks");
    expect(context.content).toContain("Interest-Based Groups");
  });

  it("preserves recommendation request interests from verified user questions", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer:
          "The user wants slow cooker advice tailored to beef stew success and yogurt interest.",
        answer_session_ids: ["s-slow-cooker"],
        haystack_dates: ["2023/05/30"],
        haystack_session_ids: ["s-slow-cooker"],
        haystack_sessions: [
          [
            {
              content:
                "I recently figured out how to use the slow cooker and made a delicious beef stew. I've been wanting to try more recipes with it. Do you have any recommendations?",
              has_answer: true,
              role: "user",
            },
            {
              content: "1. Chili Con Carne\n2. Pulled Pork\n3. Beef Stew",
              role: "assistant",
            },
            {
              content:
                "Do you have any recipes for making yogurt in a slow cooker?",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question:
          "I've been struggling with my slow cooker recipes. Any advice on getting better results?",
        question_date: "2023/05/31",
        question_id: "q-slow-cooker-advice-interest",
        question_type: "single-session-preference",
      },
    ]);

    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-recommendation-request-interest",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-slow-cooker");
    expect(context.content).toContain("making yogurt in a slow cooker");
  });

  it("preserves household maintenance issue facts from verified user questions", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        answer:
          "The user wants kitchen cleaning tips tailored to utensil storage, granite scratches near the sink, and a leaking faucet.",
        answer_session_ids: ["s-kitchen-issues"],
        haystack_dates: ["2023/05/22"],
        haystack_session_ids: ["s-kitchen-issues"],
        haystack_sessions: [
          [
            {
              content:
                "I also need some help with organizing my kitchen utensils. I recently bought a new utensil holder to keep countertops clutter-free.",
              has_answer: true,
              role: "user",
            },
            {
              content:
                "I noticed some scratches on my granite countertop near the sink. Do you have any tips on how to repair or remove those scratches?",
              has_answer: true,
              role: "user",
            },
            {
              content:
                "I'm also having some issues with my kitchen faucet, it's been leaking slightly. Can you give me some tips on how to fix it?",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "My kitchen's becoming a bit of a mess again. Any tips?",
        question_date: "2023/05/23",
        question_id: "q-kitchen-cleaning-issues",
        question_type: "single-session-preference",
      },
    ]);

    const createMemory = createLongMemEvalMemoryFactory(createGoodMemory);
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () => createMemory("goodmemory-rules-only"),
      runId: "run-longmemeval-household-maintenance-issues",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.retrievedSessionIds).toContain("s-kitchen-issues");
    expect(context.content).toContain(
      "My kitchen granite countertop near the sink has scratches.",
    );
    expect(context.content).toContain("My kitchen faucet has been leaking slightly.");
  });

  it("preserves blank-leading markdown table headers in assistant evidence notes", async () => {
    const [testCase] = validateLongMemEvalCases(
      LONGMEMEVAL_ASSISTANT_EVIDENCE_CASES,
    );
    const context = await createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () =>
        createGoodMemory({
          remember: {
            profiles: [
              {
                assistantOutputs: { mode: "verified_only" },
                id: "longmemeval-test",
              },
            ],
          },
          storage: {
            provider: "memory",
          },
        }),
      runId: "run-longmemeval-assistant-table-header",
    })({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(context.content).toContain(
      "On Sunday, Admon was assigned to 8 am - 4 pm (Day Shift).",
    );
  });

  it("derives retrieved evidence sessions from GoodMemory recall records", async () => {
    const [testCase] = validateLongMemEvalCases([
      {
        ...SMOKE_CASES[0],
        answer: "Business Administration",
        answer_session_ids: ["s-2"],
        haystack_session_ids: ["s-1", "s-2"],
        haystack_sessions: [
          SMOKE_CASES[0].haystack_sessions[0],
          [
            {
              content:
                "I graduated with a degree in Business Administration, which helped me in my new role.",
              has_answer: true,
              role: "user",
            },
          ],
        ],
        question: "What degree did I graduate with?",
      },
    ]);
    const rememberedScopes: string[] = [];
    const builder = createLongMemEvalGoodMemoryContextBuilder({
      createMemory: () =>
        ({
          buildContext: async () => ({
            content: "## Facts\n- I graduated with a degree in Business Administration.",
            estimatedTokens: 12,
            omittedSections: [],
            output: "markdown",
          }),
          recall: async () => ({
            episodes: [],
            facts: [
              {
                content: "I graduated with a degree in Business Administration.",
                sessionId: "s-2",
              },
            ],
          }),
          remember: async (input: Parameters<GoodMemory["remember"]>[0]) => {
            rememberedScopes.push(input.scope.workspaceId ?? "");
            return {
              accepted: 0,
              events: [],
              rejected: 0,
            };
          },
        }) as unknown as GoodMemory,
      runId: "run-longmemeval-test",
    });

    const result = await builder({
      profile: "goodmemory-rules-only",
      testCase: testCase!,
    });

    expect(result.retrievedSessionIds).toEqual(["s-2"]);
    expect(new Set(rememberedScopes)).toEqual(
      new Set(["phase-62-longmemeval:run-longmemeval-test"]),
    );
  });

  it("keeps LongMemEval hybrid ingestion deterministic while using hybrid recall", async () => {
    const [testCase] = validateLongMemEvalCases([SMOKE_CASES[0]]);
    const extractionStrategies: string[] = [];
    const recallStrategies: string[] = [];
    const createdProfiles: string[] = [];
    const builder = createLongMemEvalGoodMemoryContextBuilder({
      createMemory: (profile) => {
        createdProfiles.push(profile);
        return {
          buildContext: async () => ({
            content: "## Facts\n- Mira prefers concise architecture notes.",
            estimatedTokens: 12,
            omittedSections: [],
            output: "markdown",
          }),
          recall: async (input: Parameters<GoodMemory["recall"]>[0]) => {
            recallStrategies.push(input.strategy ?? "");
            return {
              facts: [
                {
                  content: "Mira prefers concise architecture notes.",
                  sessionId: "s-2",
                },
              ],
            };
          },
          remember: async (input: Parameters<GoodMemory["remember"]>[0]) => {
            extractionStrategies.push(input.extractionStrategy ?? "");
            return {
              accepted: 0,
              events: [],
              rejected: 0,
            };
          },
        } as unknown as GoodMemory;
      },
      runId: "run-longmemeval-hybrid-deterministic-ingest",
    });

    await builder({
      profile: "goodmemory-hybrid",
      testCase: testCase!,
    });

    expect(createdProfiles).toEqual(["goodmemory-hybrid"]);
    expect(new Set(extractionStrategies)).toEqual(new Set(["rules-only"]));
    expect(recallStrategies).toEqual(["hybrid"]);
  });

  it("limits full-mode case concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    await runLongMemEvalSuite(
      {
        benchmarkRoot: "/tmp/longmemeval",
        generatedBy: "tests",
        maxConcurrency: 1,
        mode: "full",
        outputDir: "/tmp/out",
        profiles: ["baseline-no-memory"],
        runId: "run-concurrency",
      },
      {
        answerGenerator: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 2));
          active -= 1;
          return "I do not have enough remembered context to answer.";
        },
        memoryContextBuilder: async () => ({
          content: "",
          retrievedSessionIds: [],
        }),
        mkdir: async () => {},
        readFile: async () => JSON.stringify([SMOKE_CASES[0], SMOKE_CASES[0]]),
        writeFile: async () => {},
      },
    );

    expect(maxActive).toBe(1);
  });
});
