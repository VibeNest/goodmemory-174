import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  applyPhase63BeamAnswerOperationGuardrails,
  buildPhase63BeamAnswerMemoryContext,
  buildPhase63BeamPrompt,
  compressPhase63BeamMemoryContextText,
  extractPhase63BeamRequestedItemCount,
  loadPhase63BeamLiveSliceProgress,
  parsePhase63BeamLiveSliceCliOptions,
  runPhase63BeamLiveSlice,
} from "../../scripts/run-phase-63-beam-live-slice";
import type { BeamCase } from "../../src/eval/beam";

function buildBeamRows(): unknown[] {
  return [
    {
      chat: [
        [
          {
            content: "Mira prefers terse rollback notes.",
            id: 1,
            index: "1,1",
            question_type: "preference",
            role: "user",
            time_anchor: "March-15-2024",
          },
          {
            content: "Theo owns the rollback checklist.",
            id: 2,
            index: null,
            question_type: null,
            role: "assistant",
            time_anchor: null,
          },
        ],
      ],
      conversation_id: "beam-live-smoke",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: ["Rollback"],
        theme: "Release operations",
        title: "Rollback Planning",
      },
      narratives: "Release planning labels",
      probing_questions: {
        information_extraction: [
          {
            answer: "Theo.",
            evidence_chat_ids: [2],
            question: "Who owns the rollback checklist?",
            question_id: "beam-live-q1",
            question_type: "information_extraction",
          },
        ],
        preference_following: [
          {
            answer: "Keep rollback notes terse.",
            evidence_chat_ids: [1],
            question: "How should rollback notes be written?",
            question_id: "beam-live-q2",
            question_type: "preference_following",
          },
        ],
        abstention: [
          {
            evidence_chat_ids: [],
            question: "Which deployment window did Mira approve?",
            question_id: "beam-live-q3",
            question_type: "abstention",
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Mira",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildGuardrailCase(input: {
  question: string;
  questionType: string;
}): BeamCase {
  return {
    answer: "",
    answerable: true,
    chat: [],
    conversationId: "guardrail",
    evidenceChatIds: [],
    question: input.question,
    questionId: `guardrail:${input.questionType}`,
    questionType: input.questionType,
    scale: "100K",
  };
}

function buildRecallReport(): string {
  return JSON.stringify({
    profiles: {
      "goodmemory-rules-only": {
        cases: [
          {
            answerable: true,
            evidenceChatIds: [2],
            evidenceChatRecall: 0,
            questionId: "beam-live-q1",
            questionType: "information_extraction",
            retrievedChatIds: [1],
          },
        ],
      },
    },
  });
}

describe("phase-63 BEAM live slice runner", () => {
  it("parses live slice cli flags", () => {
    expect(
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--answer-gap-report",
        "/tmp/answer-gap.json",
        "--answer-gap-bucket",
        "preference_following",
        "--answer-gap-source-coverage-status",
        "covered-or-no-warning",
        "--recall-report",
        "/tmp/recall.json",
        "--profile",
        "goodmemory-rules-only",
        "--case-id",
        "beam-live-q1",
        "--limit",
        "2",
        "--run-id",
        "run-beam-live",
      ]),
    ).toEqual({
      answerGapBuckets: ["preference_following"],
      answerGapReportPath: "/tmp/answer-gap.json",
      answerGapSourceCoverageStatuses: ["covered-or-no-warning"],
      benchmarkRoot: "/tmp/BEAM",
      caseSelection: undefined,
      caseIds: ["beam-live-q1"],
      evidencePack: false,
      limit: 2,
      outputDir: undefined,
      profile: "goodmemory-rules-only",
      recallReportPath: "/tmp/recall.json",
      resume: false,
      runId: "run-beam-live",
      scale: undefined,
    });
  });

  it("rejects malformed repeated live-slice selector flags before replay selection", () => {
    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--answer-gap-bucket",
        "--run-id",
        "run-beam-live",
      ]),
    ).toThrow("--answer-gap-bucket requires a value.");

    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--answer-gap-bucket",
        "summarization",
        "--answer-gap-bucket",
        "summarization",
      ]),
    ).toThrow("--answer-gap-bucket contains duplicate value summarization.");

    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--answer-gap-bucket",
        "summary",
      ]),
    ).toThrow("--answer-gap-bucket must be one of:");

    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--answer-gap-source-coverage-status",
        "covered",
      ]),
    ).toThrow("--answer-gap-source-coverage-status must be one of:");

    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--case-id",
        "beam-live-q1",
        "--case-id",
        "beam-live-q1",
      ]),
    ).toThrow("--case-id contains duplicate value beam-live-q1.");
  });

  it("rejects duplicate live-slice mode flags before report generation", () => {
    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--evidence-pack",
        "--evidence-pack",
      ]),
    ).toThrow("--evidence-pack cannot be specified more than once.");

    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--resume",
        "--resume",
      ]),
    ).toThrow("--resume cannot be specified more than once.");
  });

  it("rejects duplicate live-slice scalar source and output flags before report generation", () => {
    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--recall-report",
        "/tmp/recall-a.json",
        "--recall-report",
        "/tmp/recall-b.json",
      ]),
    ).toThrow("--recall-report cannot be specified more than once.");

    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--run-id",
        "run-a",
        "--run-id",
        "run-b",
      ]),
    ).toThrow("--run-id cannot be specified more than once.");

    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--run-id",
        "../outside-live-slice",
      ]),
    ).toThrow("--run-id must be a single path segment.");
  });

  it("rejects empty or whitespace-padded BEAM root environment values", async () => {
    const original = process.env.GOODMEMORY_BEAM_ROOT;
    try {
      process.env.GOODMEMORY_BEAM_ROOT = "/tmp/BEAM-env";
      expect(
        parsePhase63BeamLiveSliceCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-slice.ts",
        ]).benchmarkRoot,
      ).toBe("/tmp/BEAM-env");
      expect(
        parsePhase63BeamLiveSliceCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-slice.ts",
          "--benchmark-root",
          "/tmp/BEAM-cli",
        ]).benchmarkRoot,
      ).toBe("/tmp/BEAM-cli");

      process.env.GOODMEMORY_BEAM_ROOT = " /tmp/BEAM-env ";
      expect(() =>
        parsePhase63BeamLiveSliceCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-slice.ts",
        ]),
      ).toThrow("GOODMEMORY_BEAM_ROOT cannot be empty or whitespace-padded.");
      await expect(
        runPhase63BeamLiveSlice(
          {},
          {
            readFile: async () => {
              throw new Error("should not read benchmark rows");
            },
          },
        ),
      ).rejects.toThrow(
        "GOODMEMORY_BEAM_ROOT cannot be empty or whitespace-padded.",
      );

      process.env.GOODMEMORY_BEAM_ROOT = "";
      expect(() =>
        parsePhase63BeamLiveSliceCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-slice.ts",
        ]),
      ).toThrow("GOODMEMORY_BEAM_ROOT cannot be empty or whitespace-padded.");
    } finally {
      if (original === undefined) {
        delete process.env.GOODMEMORY_BEAM_ROOT;
      } else {
        process.env.GOODMEMORY_BEAM_ROOT = original;
      }
    }
  });

  it("accepts the hybrid live profile", () => {
    expect(
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--profile",
        "goodmemory-hybrid",
      ]).profile,
    ).toBe("goodmemory-hybrid");
  });

  it("parses the --case-selection flag and rejects unknown selections", () => {
    expect(
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--case-selection",
        "recall-misses",
      ]).caseSelection,
    ).toBe("recall-misses");

    expect(
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--case-selection",
        "all-evidence",
      ]).caseSelection,
    ).toBe("all-evidence");

    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--case-selection",
        "not-a-selection",
      ]),
    ).toThrow("--case-selection must be all-cases, all-evidence, or recall-misses");
  });

  it("can select every BEAM case for live closure coverage", async () => {
    const report = await runPhase63BeamLiveSlice(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseSelection: "all-cases",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-beam-live-all",
      },
      {
        answerGenerator: async (input) =>
          input.testCase.answerable ? input.testCase.answer : "No answer.",
        answerJudge: async (input) => ({
          correct:
            input.expectedAnswer === input.actualAnswer ||
            input.actualAnswer === "No answer.",
          method: "semantic_judge",
          reasoning: "The candidate matches the fixture answer.",
        }),
        appendFile: async () => undefined,
        mkdir: async () => undefined,
        readFile: async (path) => {
          expect(path).toBe(join("/tmp/BEAM", "100K.json"));
          return JSON.stringify(buildBeamRows());
        },
        writeFile: async () => undefined,
      },
    );

    expect(report.summary.totalCases).toBe(3);
    expect(report.cases.map((testCase) => testCase.questionId)).toEqual([
      "beam-live-q1",
      "beam-live-q2",
      "beam-live-q3",
    ]);
  });

  it("parses the live-slice progress sidecar (last write wins, errors retried, torn line tolerated)", () => {
    const ok = (id: string, correct: boolean) =>
      JSON.stringify({ questionId: id, result: { questionId: id, correct } });
    const errored = (id: string) =>
      JSON.stringify({
        questionId: id,
        result: {
          questionId: id,
          executionError: { message: "boom", stage: "answer_generation" },
        },
      });
    const raw = `${[
      ok("q1", false),
      ok("q1", true),
      errored("q2"),
      ok("q3", true),
      "{ torn-final-line",
    ].join("\n")}\n`;

    const completed = loadPhase63BeamLiveSliceProgress(raw);

    expect([...completed.keys()].sort()).toEqual(["q1", "q3"]);
    expect(completed.get("q1")?.correct).toBe(true);
    expect(completed.has("q2")).toBe(false);
  });

  it("resumes a live slice from the progress sidecar, skipping already-scored cases", async () => {
    let answerCalls = 0;
    const appended: string[] = [];
    const priorQ1 = {
      answerScore: {
        correct: true,
        method: "semantic_judge",
        reasoning: "prior run",
      },
      answerable: true,
      conversationId: "beam-live-smoke",
      correct: true,
      evidenceChatIds: [2],
      evidenceChatRecall: 1,
      expectedAnswer: "prior",
      hypothesis: "RESUMED-FROM-SIDECAR",
      memoryContextChars: 12,
      questionId: "beam-live-q1",
      questionType: "information_extraction",
      retrievedChatIds: [2],
    };

    const report = await runPhase63BeamLiveSlice(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseSelection: "all-cases",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        resume: true,
        runId: "run-beam-live-resume",
      },
      {
        answerGenerator: async (input) => {
          answerCalls += 1;
          return input.testCase.answerable
            ? input.testCase.answer
            : "No answer.";
        },
        answerJudge: async (input) => ({
          correct:
            input.expectedAnswer === input.actualAnswer ||
            input.actualAnswer === "No answer.",
          method: "semantic_judge",
          reasoning: "fixture",
        }),
        appendFile: async (_path, value) => {
          appended.push(String(value));
        },
        mkdir: async () => undefined,
        readFile: async (path) => {
          if (String(path).endsWith("100K.json")) {
            return JSON.stringify(buildBeamRows());
          }
          if (String(path).endsWith("live-slice-progress.jsonl")) {
            return `${JSON.stringify({ questionId: "beam-live-q1", result: priorQ1 })}\n`;
          }
          return "";
        },
        writeFile: async () => undefined,
      },
    );

    // q1 was already scored on the prior run -> only q2 and q3 hit the generator.
    expect(answerCalls).toBe(2);
    expect(
      report.cases.find((testCase) => testCase.questionId === "beam-live-q1")
        ?.hypothesis,
    ).toBe("RESUMED-FROM-SIDECAR");
    expect(report.summary.totalCases).toBe(3);
    // Only the two freshly-scored cases are appended to the sidecar.
    expect(appended).toHaveLength(2);
  });

  it("selects focused live cases from an answer-gap bucket report", async () => {
    const report = await runPhase63BeamLiveSlice(
      {
        answerGapBuckets: ["preference_following"],
        answerGapReportPath: "/tmp/answer-gap.json",
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-beam-live-answer-gap-preference",
      },
      {
        answerGenerator: async (input) =>
          input.testCase.answerable ? input.testCase.answer : "No answer.",
        answerJudge: async (input) => ({
          correct: input.expectedAnswer === input.actualAnswer,
          method: "semantic_judge",
          reasoning: "fixture",
        }),
        appendFile: async () => undefined,
        mkdir: async () => undefined,
        readFile: async (path) => {
          if (String(path).endsWith("100K.json")) {
            return JSON.stringify(buildBeamRows());
          }
          if (String(path).endsWith("answer-gap.json")) {
            return JSON.stringify({
              buckets: {
                preference_following: ["beam-live-q2"],
                temporal_order: ["beam-live-q1"],
              },
            });
          }
          return "";
        },
        writeFile: async () => undefined,
      },
    );

    expect(report.cases.map((testCase) => testCase.questionId)).toEqual([
      "beam-live-q2",
    ]);
    expect(report.selection).toEqual({
      answerGapBuckets: ["preference_following"],
      answerGapReportPath: "/tmp/answer-gap.json",
      answerGapSourceCoverageStatuses: null,
      caseIds: null,
      caseSelection: null,
      limit: null,
      recallReportPath: null,
    });
    expect(report.summary.caseCountsByQuestionType).toEqual({
      preference_following: 1,
    });
  });

  it("filters focused live cases by answer-gap source coverage status", async () => {
    const report = await runPhase63BeamLiveSlice(
      {
        answerGapBuckets: ["preference_following"],
        answerGapReportPath: "/tmp/answer-gap.json",
        answerGapSourceCoverageStatuses: ["covered-or-no-warning"],
        benchmarkRoot: "/tmp/BEAM",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-beam-live-answer-gap-source-coverage",
      },
      {
        answerGenerator: async (input) =>
          input.testCase.answerable ? input.testCase.answer : "No answer.",
        answerJudge: async (input) => ({
          correct: input.expectedAnswer === input.actualAnswer,
          method: "semantic_judge",
          reasoning: "fixture",
        }),
        appendFile: async () => undefined,
        mkdir: async () => undefined,
        readFile: async (path) => {
          if (String(path).endsWith("100K.json")) {
            return JSON.stringify(buildBeamRows());
          }
          if (String(path).endsWith("answer-gap.json")) {
            return JSON.stringify({
              cases: [
                {
                  bucket: "preference_following",
                  questionId: "beam-live-q1",
                  sourceCoverageStatus: "expected-cues-outside-source",
                },
                {
                  bucket: "preference_following",
                  questionId: "beam-live-q2",
                  sourceCoverageStatus: "covered-or-no-warning",
                },
                {
                  bucket: "abstention",
                  questionId: "beam-live-q3",
                  sourceCoverageStatus: "covered-or-no-warning",
                },
              ],
            });
          }
          return "";
        },
        writeFile: async () => undefined,
      },
    );

    expect(report.cases.map((testCase) => testCase.questionId)).toEqual([
      "beam-live-q2",
    ]);
    expect(report.selection).toEqual({
      answerGapBuckets: ["preference_following"],
      answerGapReportPath: "/tmp/answer-gap.json",
      answerGapSourceCoverageStatuses: ["covered-or-no-warning"],
      caseIds: null,
      caseSelection: null,
      limit: null,
      recallReportPath: null,
    });
  });

  it("rejects answer-gap filters that match no live cases instead of falling back to the default slice", async () => {
    await expect(
      runPhase63BeamLiveSlice(
        {
          answerGapBuckets: ["temporal_order"],
          answerGapReportPath: "/tmp/answer-gap.json",
          benchmarkRoot: "/tmp/BEAM",
          outputDir: "/tmp/out",
          profile: "goodmemory-rules-only",
          runId: "run-beam-live-answer-gap-empty",
        },
        {
          answerGenerator: async (input) =>
            input.testCase.answerable ? input.testCase.answer : "No answer.",
          answerJudge: async (input) => ({
            correct: input.expectedAnswer === input.actualAnswer,
            method: "semantic_judge",
            reasoning: "fixture",
          }),
          appendFile: async () => undefined,
          mkdir: async () => undefined,
          readFile: async (path) => {
            if (String(path).endsWith("100K.json")) {
              return JSON.stringify(buildBeamRows());
            }
            if (String(path).endsWith("answer-gap.json")) {
              return JSON.stringify({
                buckets: {
                  preference_following: ["beam-live-q2"],
                },
              });
            }
            return "";
          },
          writeFile: async () => undefined,
        },
      ),
    ).rejects.toThrow("answer-gap filters matched no BEAM cases");
  });

  it("keeps contradiction and ordering synthesis guidance in the live prompt", () => {
    const prompt = buildPhase63BeamPrompt({
      memoryContext: "- chat_id=1: Mira said yes.\n- chat_id=2: Mira said no.",
      question: "What happened first?",
    });

    expect(prompt).toContain(
      "If the retrieved context contains materially conflicting user statements",
    );
    expect(prompt).toContain("When the question asks for an order or sequence");
    expect(prompt).toContain("compress repeated setup chatter");
    expect(prompt).toContain("do not create broad umbrella buckets");
    expect(prompt).toContain("Preserve the concrete source action");
    expect(prompt).toContain(
      "Based on the provided chat, there is no information related to <topic>",
    );
    expect(prompt).toContain(" - replacing <topic>");
    expect(prompt).not.toMatch(/[^\x00-\x7F]/u);
  });

  it("compresses long source-message context before live answer synthesis", () => {
    const compressed = compressPhase63BeamMemoryContextText(`
      I'm finalizing deployment and need security hardening for authentication and authorization before launch. Here's my current code:
      \`\`\`python
      SECRET_KEY = "do-not-surface-this-test-fixture"
      app.run(port=10000)
      \`\`\`
      Can you review every implementation detail?
    `);

    expect(compressed).toContain("finalizing deployment");
    expect(compressed).toContain("security hardening");
    expect(compressed).not.toContain("do-not-surface-this-test-fixture");
    expect(compressed.length).toBeLessThan(180);
  });

  it("prepends source-ordered retrieved turns for ordering answer synthesis", () => {
    const memoryContext = buildPhase63BeamAnswerMemoryContext({
      memoryContext: "- chat_id=12: Late deployment notes.",
      retrievedChatIds: [12, 4],
      testCase: {
        answer: "First, setup. Second, deployment.",
        answerable: true,
        chat: [
          [
            {
              content: "I first initialized the Flask app and database schema.",
              id: 4,
              index: "4",
              questionType: "event_ordering",
              role: "user",
              timeAnchor: "unknown",
            },
            {
              content: "Later I reviewed deployment and security tests.",
              id: 12,
              index: "12",
              questionType: "event_ordering",
              role: "user",
              timeAnchor: "April-25-2024",
            },
          ],
        ],
        conversationId: "beam-live-ordering",
        evidenceChatIds: [4, 12],
        question:
          "Can you list the order in which I brought up the app work? Mention ONLY and ONLY two items.",
        questionId: "beam-live-ordering-q1",
        questionType: "event_ordering",
        scale: "100K",
      },
    });

    expect(extractPhase63BeamRequestedItemCount("Mention ONLY five items.")).toBe(
      5,
    );
    expect(memoryContext).toContain("Source-ordered retrieved turns");
    expect(memoryContext).toContain("Requested item count: 2");
    expect(memoryContext.indexOf("chat_id=4")).toBeLessThan(
      memoryContext.indexOf("chat_id=12"),
    );
    expect(memoryContext).toContain("Retrieved GoodMemory records");
  });

  it("routes through the general evidence pack when evidencePack is set", () => {
    const testCase = {
      answer: "8000",
      answerable: true,
      chat: [
        [
          {
            content: "My monthly budget is $5,000.",
            id: 4,
            index: "4",
            questionType: "knowledge_update",
            role: "user",
            timeAnchor: "January-10-2024",
          },
          {
            content: "I increased my monthly budget to $8,000.",
            id: 12,
            index: "12",
            questionType: "knowledge_update",
            role: "user",
            timeAnchor: "April-25-2024",
          },
        ],
      ],
      conversationId: "beam-live-pack",
      evidenceChatIds: [4, 12],
      question: "What is my current monthly budget?",
      questionId: "beam-live-pack-q1",
      questionType: "knowledge_update",
      scale: "100K" as const,
    };

    const packed = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "- chat_id=4: My monthly budget is $5,000.",
      retrievedChatIds: [12, 4],
      testCase,
    });
    const plain = buildPhase63BeamAnswerMemoryContext({
      evidencePack: false,
      memoryContext: "- chat_id=4: My monthly budget is $5,000.",
      retrievedChatIds: [12, 4],
      testCase,
    });

    // The general pack adds current-value framing for a non-ordering update
    // question that the default raw-records path leaves unframed.
    expect(packed).toContain("Current-value resolution:");
    expect(packed).toContain("Evidence (source-ordered, earliest first):");
    expect(packed).toContain("latest entry is the current value");
    // Earliest source order first regardless of retrieval order.
    const evidenceSection = packed.slice(
      packed.indexOf("Evidence (source-ordered, earliest first):"),
    );
    expect(evidenceSection.indexOf("#4")).toBeLessThan(
      evidenceSection.indexOf("#12"),
    );
    // It replaces, not augments, the bespoke source-ordered section.
    expect(packed).not.toContain("Source-ordered retrieved turns");
    expect(plain).not.toContain("latest entry is the current value");

    const orderingPacked = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "",
      retrievedChatIds: [12, 4],
      testCase: {
        ...testCase,
        answer: "First budget planning, then increased budget.",
        question: "Which budget topics did I mention?",
        questionId: "beam-live-pack-order",
        questionType: "event_ordering",
      },
    });
    expect(orderingPacked).toContain("Timeline evidence:");
    expect(orderingPacked).toContain("Do not reorder evidence by topical similarity");
  });

  it("routes temporal count live prompts through calendar interval candidates", () => {
    const testCase = {
      answer: "38 days",
      answerable: true,
      chat: [
        [
          {
            content:
              "I started my 30-day editing challenge on April 2, 2024.",
            id: 88,
            index: "88",
            questionType: "temporal_reasoning",
            role: "user",
            timeAnchor: "April-2-2024",
          },
          {
            content:
              "The 15-day clarity editing challenge ran from May 10, 2024 to May 25, 2024.",
            id: 218,
            index: "218",
            questionType: "temporal_reasoning",
            role: "user",
            timeAnchor: "May-10-2024",
          },
        ],
      ],
      conversationId: "beam-live-calendar-count-pack",
      evidenceChatIds: [88, 218],
      question:
        "How many days passed between when I started my 30-day editing challenge and when I started the 15-day clarity editing challenge?",
      questionId: "beam-live-calendar-count-pack-q1",
      questionType: "temporal_reasoning",
      scale: "100K" as const,
    };

    const packed = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "",
      retrievedChatIds: [218, 88],
      testCase,
    });

    expect(packed).toContain("Calendar interval candidates:");
    expect(packed).toContain("April 2, 2024 -> May 10, 2024 = 38 days");
    expect(packed).toContain("May 10, 2024 -> May 25, 2024 = 15 days");
    expect(packed).toContain(
      "Use the interval whose endpoint labels match the question wording",
    );
  });

  it("adds companion assistant evidence only for synthesis-style evidence packs", () => {
    const testCase = {
      answer: "Use feedback and revise consistently.",
      answerable: true,
      chat: [
        [
          {
            content: "I need to improve my draft from 82% to 90%.",
            id: 10,
            index: "10",
            questionType: "multi_session_reasoning",
            role: "user",
            timeAnchor: "Jan",
          },
          {
            content:
              "Focus on thesis clarity, argument structure, evidence synthesis, transitions, and style.",
            id: 11,
            index: "11",
            questionType: "",
            role: "assistant",
            timeAnchor: "Jan",
          },
        ],
      ],
      conversationId: "beam-live-companion-pack",
      evidenceChatIds: [10],
      question:
        "How did my essay performance goals evolve, and what should I prioritize?",
      questionId: "beam-live-companion-pack-q1",
      questionType: "multi_session_reasoning",
      scale: "100K" as const,
    };

    const multiSessionPack = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "",
      retrievedChatIds: [10],
      testCase,
    });
    const orderingPack = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "",
      retrievedChatIds: [10],
      testCase: {
        ...testCase,
        question: "Can you list the order in which I brought up draft work?",
        questionId: "beam-live-companion-pack-order",
        questionType: "event_ordering",
      },
    });

    expect(multiSessionPack).toContain("#10");
    expect(multiSessionPack).toContain("#11");
    expect(multiSessionPack).toContain("thesis clarity");
    expect(orderingPack).toContain("#10");
    expect(orderingPack).not.toContain("#11");
    expect(orderingPack).not.toContain("thesis clarity");
  });

  it("normalizes dependency instruction answers to concrete names and versions from context", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "Use the usual project dependencies.",
      memoryContext: [
        "Instruction constraints:",
        "Always include version numbers when I ask about software dependencies or libraries used.",
        "Supporting evidence for the requested answer:",
        "The project uses Flask-Login 0.6.2, the current version of Flask, which is 2.3.1, and SQLite 3.39 as its database engine.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "Which libraries are used in this project?",
        questionType: "instruction_following",
      }),
    });

    expect(answer).toBe(
      "The project uses Flask-Login 0.6.2, Flask 2.3.1, and SQLite 3.39.",
    );
  });

  it("repairs no-answer instruction outputs from response requirement cues", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "No answer.",
      memoryContext: [
        "Instruction constraints:",
        "Always include code examples formatted with syntax highlighting.",
        "Concrete answer-content cues:",
        "format/style requirements: syntax highlighting",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "What should the response include when I ask for implementation help?",
        questionType: "instruction_following",
      }),
    });

    expect(answer).toBe(
      "Response should include code examples formatted with syntax highlighting.",
    );
  });

  it("keeps no-answer instruction outputs when no guide cue exists", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "No answer.",
      memoryContext: [
        "Instruction constraints:",
        "Always answer carefully.",
        "Supporting evidence for the requested answer:",
        "(no evidence)",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "What should the response include?",
        questionType: "instruction_following",
      }),
    });

    expect(answer).toBe("No answer.");
  });

  it("repairs generic instruction response-content answers from guide cues", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "The response should be clear and helpful.",
      memoryContext: [
        "Instruction constraints:",
        "Always include code examples formatted with syntax highlighting and bullet points.",
        "Concrete answer-content cues:",
        "format/style requirements: syntax highlighting, bullet points",
        "named tools/examples: Flask-Login, SQLite",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "What should the response include when I ask for implementation help?",
        questionType: "instruction_following",
      }),
    });

    expect(answer).toBe(
      "Response should include code examples formatted with syntax highlighting, the list presented using bullet points, and specific names: Flask-Login, SQLite.",
    );
  });

  it("repairs instruction answers from response-content and format cues", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "No answer.",
      memoryContext: [
        "Instruction constraints:",
        "Always include a clear confirmation of the exact salary figure and present dates using MM/DD/YYYY.",
        "Concrete answer-content cues:",
        "response-content requirements: clear confirmation of the exact stated value",
        "numeric values/amounts: $82,500",
        "format/style requirements: MM/DD/YYYY",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "What should the response include for salary and date formatting?",
        questionType: "instruction_following",
      }),
    });

    expect(answer).toBe(
      "Response should include clear confirmation of the exact stated value, numeric values or amounts: $82,500, and format/style requirements: MM/DD/YYYY.",
    );
  });

  it("keeps instruction response-content answers that already include a guide cue", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "The response should include syntax highlighting.",
      memoryContext: [
        "Instruction constraints:",
        "Always include code examples formatted with syntax highlighting.",
        "Concrete answer-content cues:",
        "format/style requirements: syntax highlighting",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "What should the response include when I ask for implementation help?",
        questionType: "instruction_following",
      }),
    });

    expect(answer).toBe("The response should include syntax highlighting.");
  });

  it("keeps generic instruction answers for normal task questions", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "Use concise examples.",
      memoryContext: [
        "Instruction constraints:",
        "Always include code examples formatted with syntax highlighting.",
        "Concrete answer-content cues:",
        "format/style requirements: syntax highlighting",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "How should I implement login?",
        questionType: "instruction_following",
      }),
    });

    expect(answer).toBe("Use concise examples.");
  });

  it("repairs no-answer preference outputs from response requirements", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "No answer.",
      memoryContext: [
        "Preference constraints:",
        "- [t=Apr | #41 | user] I prefer portfolio links directly in the cover letter text instead of separate attachments.",
        "Preference response requirements:",
        "- Make the stated preference visible in the answer; do not only answer the base task.",
        "- embed links directly in the response",
        "- avoid separate attachments",
        "Supporting evidence for the requested answer:",
        "- Requested task: How should I include my portfolio links in the cover letter?",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "How should I include my portfolio links in the cover letter?",
        questionType: "preference_following",
      }),
    });

    expect(answer).toBe(
      "Response should embed links directly in the response and avoid separate attachments.",
    );
  });

  it("repairs generic preference ways answers from response requirements", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis:
        "Structure your daily self-care routine around morning activities that are specifically aimed at improving daytime energy.",
      memoryContext: [
        "Preference constraints:",
        "- [t=Apr | #164 | user] I prefer morning self-care routines, like the ones I've been doing, to boost my daytime energy.",
        "Preference response requirements:",
        "- Make the stated preference visible in the answer; do not only answer the base task.",
        "- focus on morning activities that improve daytime energy",
        "Supporting evidence for the requested answer:",
        "- Requested task: What are some ways I can structure my daily self-care routine to feel more energized throughout the day?",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "What are some ways I can structure my daily self-care routine to feel more energized throughout the day?",
        questionType: "preference_following",
      }),
    });

    expect(answer).toBe(
      "Response should focus on concrete morning self-care activities that improve daytime energy, such as light movement, mindfulness or journaling, hydration or breakfast, and a short priority check-in, while avoiding evening routine suggestions.",
    );
  });

  it("repairs noisy decision-preference answers from response requirements", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: [
        "Proceed in a practical, logic-first way: separate the facts, options, and likely consequences from the emotional reactions.",
        "Since you prefer logical reasoning, talk it through with Stephen and create a new tradition together while considering your views on free will.",
      ].join("\n\n"),
      memoryContext: [
        "Preference constraints:",
        "- [t=Apr | #54 | user] I prefer making decisions based on logical reasoning rather than emotional impulses, reflecting my practical nature.",
        "Preference response requirements:",
        "- Make the stated preference visible in the answer; do not only answer the base task.",
        "- emphasize practical/logical analysis over emotional or impulsive factors",
        "Supporting evidence for the requested answer:",
        "- Requested task: I'm trying to decide how to approach a complex problem that has both practical and emotional aspects. How would you suggest I proceed?",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "I'm trying to decide how to approach a complex problem that has both practical and emotional aspects. How would you suggest I proceed?",
        questionType: "preference_following",
      }),
    });

    expect(answer).toBe(
      "Use a logic-first decision framework: define the problem, separate facts from emotional reactions, compare options by practical outcomes and evidence, then choose deliberately rather than impulsively.",
    );
  });

  it("keeps no-answer preference outputs without concrete requirements", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "No answer.",
      memoryContext: [
        "Preference constraints:",
        "(no explicit preference found in retrieved evidence; infer only from the user's current question wording)",
        "Preference response requirements:",
        "- Make the stated preference visible in the answer; do not only answer the base task.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "What should I do?",
        questionType: "preference_following",
      }),
    });

    expect(answer).toBe("No answer.");
  });

  it("repairs no-answer extraction outputs from source-backed detail cues", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "No answer.",
      memoryContext: [
        "Information extraction coverage:",
        "Question target: Where did I meet Stephen and how long had I been with him?",
        "Source-backed detail cues:",
        "- [t=Mar | #12 | user] detail cues: 1) I had been with Stephen for 5 years; 2) I met him at the Montserrat Film Festival in 2018",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "Where did I meet Stephen and how long had I been with him?",
        questionType: "information_extraction",
      }),
    });

    expect(answer).toBe(
      "Source-backed details: I had been with Stephen for 5 years; I met him at the Montserrat Film Festival in 2018.",
    );
  });

  it("keeps no-answer extraction outputs when no detail cue exists", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "No answer.",
      memoryContext: [
        "Information extraction coverage:",
        "Question target: Which meeting details did I mention?",
        "Source-backed detail cues:",
        "- [t=Mar | #12 | user] detail cues: (no clause cues extracted; inspect the source turn directly)",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "Which meeting details did I mention?",
        questionType: "information_extraction",
      }),
    });

    expect(answer).toBe("No answer.");
  });

  it("repairs no-answer summarization outputs from source-backed checklist cues", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "No answer.",
      memoryContext: [
        "Summary coverage checklist:",
        "Use these source-ordered cues as coverage anchors before writing prose.",
        "- #41 user themes: 1) I finalized the probate filing deadline; 2) I scheduled the family meeting",
        "- #42 assistant guidance: 1) Prepare executor duty notes; 2) bring attorney questions",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "Can you summarize my estate planning workflow?",
        questionType: "summarization",
      }),
    });

    expect(answer).toBe(
      "Summary: I finalized the probate filing deadline; I scheduled the family meeting; Prepare executor duty notes; bring attorney questions.",
    );
  });

  it("keeps no-answer summarization outputs when the checklist has no cue", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "No answer.",
      memoryContext: [
        "Summary coverage checklist:",
        "- #41 user themes: (no high-level cues extracted; inspect the evidence turn)",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "Can you summarize my workflow?",
        questionType: "summarization",
      }),
    });

    expect(answer).toBe("No answer.");
  });

  it("keeps existing summarization outputs instead of rewriting from the checklist", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis:
        "You finalized the probate filing deadline and scheduled the family meeting.",
      memoryContext: [
        "Summary coverage checklist:",
        "- #41 user themes: 1) I finalized the probate filing deadline; 2) I scheduled the family meeting",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "Can you summarize my estate planning workflow?",
        questionType: "summarization",
      }),
    });

    expect(answer).toBe(
      "You finalized the probate filing deadline and scheduled the family meeting.",
    );
  });

  it("rewrites stale current-value answers from source-backed update cues", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "The webinar is scheduled for March 20.",
      memoryContext: [
        "Current-value ledger:",
        "Latest/current candidate: [t=Feb | #2] The webinar was rescheduled from March 20 to March 27 to accommodate additional guest speakers.",
        "Priority current-value cues:",
        "updated target values: March 27",
        "as-of/reference values: (none detected)",
        "superseded/source values: March 20",
        "all date/time/quantity mentions in latest/current candidate: March 20, March 27",
        "Prefer updated target values when the question asks the current schedule, deadline, amount, or count.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "When is my webinar scheduled now?",
        questionType: "knowledge_update",
      }),
    });

    expect(answer).toBe("The current value is March 27.");
  });

  it("keeps current-value answers that already contain the updated cue", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "The webinar is now scheduled for March 27.",
      memoryContext: [
        "Current-value ledger:",
        "Latest/current candidate: [t=Feb | #2] The webinar was rescheduled from March 20 to March 27.",
        "Priority current-value cues:",
        "updated target values: March 27",
        "superseded/source values: March 20",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "When is my webinar scheduled now?",
        questionType: "knowledge_update",
      }),
    });

    expect(answer).toBe("The webinar is now scheduled for March 27.");
  });

  it("keeps current-value answers when the guide has no superseded cue", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "The current API coverage is 78%.",
      memoryContext: [
        "Current-value ledger:",
        "Latest/current candidate: [t=Feb | #32] After the new suite landed, API module coverage rose to 78%.",
        "Priority current-value cues:",
        "updated target values: 78%",
        "superseded/source values: (none detected)",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "What is the current test coverage for the API module?",
        questionType: "knowledge_update",
      }),
    });

    expect(answer).toBe("The current API coverage is 78%.");
  });

  it("rewrites unordered temporal answers from source-ordered target anchors", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "You mentioned the API setup and deployment work.",
      memoryContext: [
        "This question asks for an order or sequence.",
        "Answer shape: Return exactly 2 numbered items.",
        "Question-target timeline anchors (source-ordered, noise-aware):",
        "Use these source-ordered anchors first when retrieved timeline entries include adjacent project noise; use the full timeline only to fill missing requested items.",
        "- [t=Jan | #4 | user] target terms: api; cues: 1) I initialized the Flask API and defined transaction endpoints",
        "- [t=Feb | #12 | user] target terms: deploy; cues: 1) I deployed the app to Render and configured Gunicorn",
        "Milestone cue candidates (source-ordered, code blocks removed):",
        "- #4 cues: 1) I initialized the Flask API and defined transaction endpoints",
        "- #12 cues: 1) I deployed the app to Render and configured Gunicorn",
        "Timeline evidence:",
        "1. [t=Jan | #4 | user] I initialized the Flask API and defined transaction endpoints.",
        "2. [t=Feb | #12 | user] I deployed the app to Render and configured Gunicorn.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "Can you list the order in which I brought up the app work? Mention ONLY two items.",
        questionType: "event_ordering",
      }),
    });

    expect(answer).toBe(
      [
        "1. I initialized the Flask API and defined transaction endpoints",
        "2. I deployed the app to Render and configured Gunicorn",
      ].join("\n"),
    );
  });

  it("keeps explicit temporal ordering answers", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis:
        "First, I initialized the Flask API; then I deployed it to Render.",
      memoryContext: [
        "Question-target timeline anchors (source-ordered, noise-aware):",
        "- [t=Jan | #4 | user] target terms: api; cues: 1) I initialized the Flask API",
        "- [t=Feb | #12 | user] target terms: deploy; cues: 1) I deployed the app to Render",
        "Timeline evidence:",
        "1. [t=Jan | #4 | user] I initialized the Flask API.",
        "2. [t=Feb | #12 | user] I deployed the app to Render.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "What order did I mention the app work in?",
        questionType: "event_ordering",
      }),
    });

    expect(answer).toBe(
      "First, I initialized the Flask API; then I deployed it to Render.",
    );
  });

  it("keeps unordered temporal answers when there are not enough anchors", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "You mentioned deployment work.",
      memoryContext: [
        "Question-target timeline anchors (source-ordered, noise-aware):",
        "- [t=Feb | #12 | user] target terms: deploy; cues: 1) I deployed the app to Render",
        "Timeline evidence:",
        "1. [t=Feb | #12 | user] I deployed the app to Render.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "What order did I mention the app work in?",
        questionType: "event_ordering",
      }),
    });

    expect(answer).toBe("You mentioned deployment work.");
  });

  it("rewrites single-candidate calendar interval answers", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "It was 15 days.",
      memoryContext: [
        "Date/quantity ledger for counting:",
        "Calendar interval candidates:",
        "- April 2, 2024 -> May 10, 2024 = 38 days (#88 to #218)",
        "Use the interval whose endpoint labels match the question wording; do not use a duration label as an endpoint.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "How many days passed between when I started editing and when I started the clarity challenge?",
        questionType: "temporal_reasoning",
      }),
    });

    expect(answer).toBe("38 days.");
  });

  it("keeps calendar interval answers that already contain the candidate", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "38 days passed between the two starts.",
      memoryContext: [
        "Date/quantity ledger for counting:",
        "Calendar interval candidates:",
        "- April 2, 2024 -> May 10, 2024 = 38 days (#88 to #218)",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "How many days passed between the two starts?",
        questionType: "temporal_reasoning",
      }),
    });

    expect(answer).toBe("38 days passed between the two starts.");
  });

  it("keeps calendar interval answers when multiple candidates need endpoint selection", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "It was 15 days.",
      memoryContext: [
        "Date/quantity ledger for counting:",
        "Calendar interval candidates:",
        "- April 2, 2024 -> May 10, 2024 = 38 days (#88 to #218)",
        "- May 10, 2024 -> May 25, 2024 = 15 days (#218 to #218)",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "How many days passed between when I started editing and when I started the clarity challenge?",
        questionType: "temporal_reasoning",
      }),
    });

    expect(answer).toBe("It was 15 days.");
  });

  it("rewrites adjacent-only abstention answers for module detail questions", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis:
        "You need to finish all onboarding modules by April 25 and set a schedule to meet the deadline.",
      memoryContext: [
        "Abstention target check:",
        "Question target: Could you provide details about the onboarding modules I need to complete?",
        "Adjacent facts are insufficient: a deadline or status is not module details.",
        "If the retrieved evidence is only adjacent, answer that the provided chat does not contain information related to the requested detail.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "Could you provide details about the onboarding modules I need to complete?",
        questionType: "abstention",
      }),
    });

    expect(answer).toBe(
      "The provided chat does not contain the requested module details.",
    );
  });

  it("rewrites adjacent-only abstention answers for atmosphere questions", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis:
        "You hosted the book club discussion on February 20, had 12 attendees, and it was a great success.",
      memoryContext: [
        "Abstention target check:",
        "Question target: What was the atmosphere like during the February 20 book club discussion?",
        "Adjacent facts are insufficient: attendance or success is not atmosphere.",
        "If the retrieved evidence is only adjacent, answer that the provided chat does not contain information related to the requested detail.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "What was the atmosphere like during the February 20 book club discussion?",
        questionType: "abstention",
      }),
    });

    expect(answer).toBe(
      "The provided chat does not contain the requested atmosphere details.",
    );
  });

  it("keeps direct abstention answers instead of rewriting them as adjacent-only", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis:
        "The atmosphere was relaxed and collaborative, with the group trading practical examples.",
      memoryContext: [
        "Abstention target check:",
        "Question target: What was the atmosphere like during the February 20 book club discussion?",
        "Adjacent facts are insufficient: attendance or success is not atmosphere.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "What was the atmosphere like during the February 20 book club discussion?",
        questionType: "abstention",
      }),
    });

    expect(answer).toBe(
      "The atmosphere was relaxed and collaborative, with the group trading practical examples.",
    );
  });

  it("normalizes role/security count answers to the value-bearing features", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis:
        "Five, including admin roles, user roles, password hashing, role-based access control, and account lockout.",
      memoryContext: [
        "Count/value table:",
        "password hashing",
        "role-based access control",
        "account lockout after failed login attempts",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "How many different user roles and security features am I trying to implement across my sessions?",
        questionType: "multi_session_reasoning",
      }),
    });

    expect(answer).toBe(
      "Three: password hashing, role-based access control, and account lockout after failed login attempts.",
    );
  });

  it("normalizes integration contradiction answers to ask for clarification", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "Yes, Flask-Login has been integrated.",
      memoryContext: [
        "Contradiction evidence guide:",
        "#1 I'm trying to integrate Flask-Login v0.6.2 for session management.",
        "#2 I have never integrated Flask-Login or managed user sessions in this project.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "Have I integrated Flask-Login for session management in my project?",
        questionType: "contradiction_resolution",
      }),
    });

    expect(answer).toBe(
      "I notice you've mentioned contradictory information about this. You said you have never integrated Flask-Login or managed user sessions in this project, but you also mentioned that Flask-Login v0.6.2 was integrated for session management replacing manual session handling. Could you clarify which is correct?",
    );
  });

  it("repairs one-sided contradiction answers from the evidence guide", () => {
    const testCase = {
      answer:
        "I notice you've mentioned contradictory information about this. You said you have downloaded Zotero, but you also mentioned never using citation management software.",
      answerable: true,
      chat: [
        [
          {
            content: "I downloaded Zotero to manage my references.",
            id: 38,
            index: "38",
            questionType: "contradiction_resolution",
            role: "user",
            timeAnchor: "Mar",
          },
          {
            content:
              "I have never used any citation management software, including Zotero.",
            id: 52,
            index: "52",
            questionType: "contradiction_resolution",
            role: "user",
            timeAnchor: "Apr",
          },
        ],
      ],
      conversationId: "beam-live-contradiction-guide-repair",
      evidenceChatIds: [38, 52],
      question: "Have I downloaded Zotero to manage my references?",
      questionId: "beam-live-contradiction-guide-repair-q1",
      questionType: "contradiction_resolution",
      scale: "100K" as const,
    };
    const memoryContext = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "",
      retrievedChatIds: [52, 38],
      testCase,
    });

    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis:
        "You said you’ve never used any citation management software, including Zotero.",
      memoryContext,
      testCase,
    });

    expect(answer).toContain(
      "I notice you've mentioned contradictory information about this.",
    );
    expect(answer).toContain(
      '"I downloaded Zotero to manage my references."',
    );
    expect(answer).toContain(
      '"I have never used any citation management software, including Zotero."',
    );
    expect(answer).toContain("Could you clarify which is correct?");
  });

  it("prunes noisy source-ordered retrieved turns to the requested ordered evidence count", () => {
    const chat = [
      [
        {
          content:
            "I want to implement core app functionality with authentication, expense tracking, and visualization.",
          id: 4,
          index: "4",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am setting up Jinja2 templates and Bootstrap for the tracker UI.",
          id: 10,
          index: "10",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am working on transaction CRUD and analytics integration after finishing registration and login.",
          id: 60,
          index: "60",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am finalizing deployment and need security hardening for authentication and authorization before launch.",
          id: 116,
          index: "116",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am trying to achieve 90% coverage on auth.py and security.py with new tests for security features.",
          id: 154,
          index: "154",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am documenting API endpoints and architecture decisions in Confluence for a remote collaborator.",
          id: 176,
          index: "176",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
      ],
    ];

    const memoryContext = buildPhase63BeamAnswerMemoryContext({
      memoryContext:
        "- chat_id=10: I am setting up Jinja2 templates and Bootstrap.\n- chat_id=154: coverage tests.\n- chat_id=176: I am documenting API endpoints in Confluence.",
      retrievedChatIds: [4, 10, 60, 116, 154, 176],
      testCase: {
        answer: "Core functionality, transaction CRUD, then security hardening.",
        answerable: true,
        chat,
        conversationId: "beam-live-ordering-pruned",
        evidenceChatIds: [4, 60, 116],
        question:
          "Can you list the order in which I brought up different aspects of developing my app? Mention ONLY and ONLY three items.",
        questionId: "beam-live-ordering-pruned-q1",
        questionType: "event_ordering",
        scale: "100K",
      },
    });

    expect(memoryContext).toContain("chat_id=4");
    expect(memoryContext).toContain("chat_id=60");
    expect(memoryContext).toContain("chat_id=116");
    expect(memoryContext).not.toContain("chat_id=10");
    expect(memoryContext).not.toContain("chat_id=154");
    expect(memoryContext).not.toContain("chat_id=176");
    expect(memoryContext).toContain("represented in the source-ordered turns");
  });

  it("selects concrete setup, endpoint, deployment, and security-test turns for five-item ordering prompts", () => {
    const chat = [
      [
        {
          content:
            "Sure, let's break it down for my budget tracker project. Components: authentication, transaction management, analytics. Milestones: setup Flask project, schema, auth, and analytics.",
          id: 2,
          index: "2",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm trying to initialize a Flask 2.3.1 project on Python 3.11 with SQLite 3.39 as my database, and I want it to run on local dev at port 5000.",
          id: 6,
          index: "6",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm trying to design a monolithic Flask app with the MVC pattern and create the initial database schema and models.",
          id: 12,
          index: "12",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm trying to implement the transaction CRUD in my Flask app, specifically the POST /transactions route, and I want to make sure it returns a 201 status code when a new transaction is created successfully.",
          id: 62,
          index: "62",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm trying to design a REST API for transactions with GET, POST, PUT, and DELETE endpoints plus validation and error handling.",
          id: 82,
          index: "82",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm having deployment issues on Render.com with Gunicorn using 3 workers on port 10000. I've also completed integration tests covering authentication, transaction CRUD, analytics endpoints, and 95% pass rate.",
          id: 118,
          index: "118",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'll add tests to cover more edge cases and security vulnerabilities, specifically SQL injection and XSS.",
          id: 120,
          index: "120",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm having trouble with deployment preparation, specifically production environment variables like DATABASE_URL, SECRET_KEY, and FLASK_ENV.",
          id: 134,
          index: "134",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
      ],
    ];

    const memoryContext = buildPhase63BeamAnswerMemoryContext({
      memoryContext:
        "- chat_id=2: broad plan.\n- chat_id=12: schema.\n- chat_id=82: broad REST API.\n- chat_id=134: environment variables.",
      retrievedChatIds: [2, 6, 12, 62, 82, 118, 120, 134],
      testCase: {
        answer:
          "Setup, POST transaction creation, Gunicorn deployment/tests, and security tests.",
        answerable: true,
        chat,
        conversationId: "beam-live-ordering-five",
        evidenceChatIds: [6, 62, 118, 120],
        question:
          "Can you walk me through the order in which I brought up different aspects of my app development and deployment across our conversations? Mention ONLY and ONLY five items.",
        questionId: "beam-live-ordering-five-q1",
        questionType: "event_ordering",
        scale: "100K",
      },
    });

    expect(memoryContext).toContain("chat_id=6");
    expect(memoryContext).toContain("chat_id=62");
    expect(memoryContext).toContain("chat_id=118");
    expect(memoryContext).toContain("chat_id=120");
    expect(memoryContext).not.toContain("chat_id=2 role");
    expect(memoryContext).not.toContain("chat_id=12 role");
    expect(memoryContext).not.toContain("chat_id=82 role");
    expect(memoryContext).not.toContain("chat_id=134 role");
  });

  it("runs answer generation and judging over selected real-recall misses", async () => {
    const writes = new Map<string, string>();
    const generatedPrompts: string[] = [];
    const report = await runPhase63BeamLiveSlice(
      {
        benchmarkRoot: "/tmp/BEAM",
        limit: 1,
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        recallReportPath: "/tmp/recall.json",
        runId: "run-beam-live",
      },
      {
        answerGenerator: async (input) => {
          generatedPrompts.push(input.prompt);
          expect(input.memoryContext).toContain("chat_id=2");
          return "Theo.";
        },
        answerJudge: async (input) => {
          expect(input.expectedAnswer).toBe("Theo.");
          expect(input.actualAnswer).toBe("Theo.");
          return {
            correct: true,
            method: "semantic_judge",
            reasoning: "The candidate preserves the owner.",
          };
        },
        appendFile: async () => undefined,
        mkdir: async () => undefined,
        now: () => new Date("2026-05-18T01:00:00.000Z"),
        readFile: async (path) => {
          if (path === "/tmp/recall.json") {
            return buildRecallReport();
          }
          expect(path).toBe(join("/tmp/BEAM", "100K.json"));
          return JSON.stringify(buildBeamRows());
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.summary.totalCases).toBe(1);
    expect(report.summary.executionFailures).toBe(0);
    expect(report.summary.correctCases).toBe(1);
    expect(report.cases[0]?.retrievedChatIds).toContain(2);
    expect(generatedPrompts[0]).toContain("Who owns the rollback checklist?");
    expect(writes.has("/tmp/out/run-beam-live/live-slice-report.json")).toBe(true);
  });
});
