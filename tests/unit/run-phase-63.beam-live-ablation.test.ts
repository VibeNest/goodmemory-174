import { describe, expect, it } from "bun:test";
import {
  buildAblationEvidencePlanPrompt,
  buildAblationMemoryContext,
  buildAblationRerankerQuery,
  parsePhase63AblationCliOptions,
  runPhase63BeamLiveAblation,
  selectAblationChatIds,
} from "../../scripts/run-phase-63-beam-live-ablation";
import type { BeamChatTurn } from "../../src/eval/beam";

function turn(id: number, content: string, role = "user"): BeamChatTurn {
  return { content, id, index: `1,${id}`, questionType: "", role, timeAnchor: "Jan" };
}

function buildRawRows(): unknown[] {
  return [
    {
      chat: [
        [
          {
            content: "Intro turn.",
            id: 1,
            index: "1,1",
            question_type: null,
            role: "user",
            time_anchor: "Jan-1",
          },
          {
            content: "Pepper is the dog.",
            id: 2,
            index: "1,2",
            question_type: "information_extraction",
            role: "user",
            time_anchor: "Jan-2",
          },
          {
            content: "Unrelated assistant chatter.",
            id: 3,
            index: "1,3",
            question_type: null,
            role: "assistant",
            time_anchor: "Jan-3",
          },
        ],
      ],
      conversation_id: "conv-1",
      conversation_plan: "PLAN",
      conversation_seed: {
        category: "Pets",
        id: 1,
        subtopics: ["dog"],
        theme: "pets",
        title: "Dog",
      },
      narratives: "n",
      probing_questions: {
        information_extraction: [
          {
            answer: "Pepper",
            evidence_chat_ids: [2],
            question: "What is the dog's name?",
            question_id: "conv-1:information_extraction:1",
            question_type: "information_extraction",
          },
        ],
        abstention: [
          {
            evidence_chat_ids: [],
            question: "Which car did they buy?",
            question_id: "conv-1:abstention:1",
            question_type: "abstention",
          },
        ],
      },
      user_profile: { user_info: "U", user_relationships: "None" },
      user_questions: [],
    },
  ];
}

function buildLiveReport(): string {
  return JSON.stringify({
    cases: [
      {
        questionId: "conv-1:information_extraction:1",
        retrievedChatIds: [2, 3],
      },
      { questionId: "conv-1:abstention:1", retrievedChatIds: [1] },
    ],
  });
}

describe("phase-63 BEAM live ablation runner", () => {
  it("parses cli options and rejects unknown modes", () => {
    expect(
      parsePhase63AblationCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-ablation.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--case-ids",
        "conv-1:information_extraction:1,conv-1:abstention:1",
        "--mode",
        "gold-evidence-only",
        "--retrieved-top-k",
        "20",
        "--plan-stored-evidence",
        "--rerank-stored-evidence",
        "--reranker-query-mode",
        "current-value",
        "--run-id",
        "run-abl",
        "--scale",
        "500K",
        "--profile",
        "goodmemory-hybrid",
      ]),
    ).toMatchObject({
      benchmarkRoot: "/tmp/BEAM",
      caseIds: [
        "conv-1:information_extraction:1",
        "conv-1:abstention:1",
      ],
      mode: "gold-evidence-only",
      planStoredEvidence: true,
      profile: "goodmemory-hybrid",
      rerankStoredEvidence: true,
      rerankerQueryMode: "current-value",
      retrievedTopK: 20,
      runId: "run-abl",
      scale: "500K",
    });
    expect(() =>
      parsePhase63AblationCliOptions([
        "bun",
        "run",
        "x",
        "--mode",
        "not-a-mode",
      ]),
    ).toThrow("--mode must be one of");
    expect(() =>
      parsePhase63AblationCliOptions([
        "bun",
        "run",
        "x",
        "--profile",
        "baseline-no-memory",
      ]),
    ).toThrow("currently supports --profile goodmemory-rules-only or goodmemory-hybrid");
    expect(() =>
      parsePhase63AblationCliOptions([
        "bun",
        "run",
        "x",
        "--scale",
        "50K",
      ]),
    ).toThrow("--scale must be 100K, 500K, 1M, 10M, or unknown");
  });

  it("rejects duplicate scalar CLI selectors before running ablations", () => {
    for (const flagName of [
      "--benchmark-root",
      "--case-ids",
      "--limit",
      "--live-report",
      "--mode",
      "--output-dir",
      "--profile",
      "--retrieved-top-k",
      "--reranker-query-mode",
      "--run-id",
      "--scale",
    ]) {
      expect(() =>
        parsePhase63AblationCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-ablation.ts",
          flagName,
          flagName === "--mode" ? "gold-evidence-only" : "first",
          flagName,
          flagName === "--mode" ? "full-context" : "second",
        ]),
      ).toThrow(`${flagName} cannot be specified more than once.`);
    }
  });

  it("rejects empty or whitespace-padded BEAM root environment values", async () => {
    const original = process.env.GOODMEMORY_BEAM_ROOT;
    try {
      process.env.GOODMEMORY_BEAM_ROOT = "/tmp/BEAM-env";
      expect(
        parsePhase63AblationCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-ablation.ts",
          "--mode",
          "full-context",
        ]).benchmarkRoot,
      ).toBe("/tmp/BEAM-env");
      expect(
        parsePhase63AblationCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-ablation.ts",
          "--mode",
          "full-context",
          "--benchmark-root",
          "/tmp/BEAM-cli",
        ]).benchmarkRoot,
      ).toBe("/tmp/BEAM-cli");

      process.env.GOODMEMORY_BEAM_ROOT = " /tmp/BEAM-env ";
      expect(() =>
        parsePhase63AblationCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-ablation.ts",
          "--mode",
          "full-context",
        ]),
      ).toThrow("GOODMEMORY_BEAM_ROOT cannot be empty or whitespace-padded.");
      await expect(
        runPhase63BeamLiveAblation(
          { mode: "full-context" },
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
        parsePhase63AblationCliOptions([
          "bun",
          "run",
          "scripts/run-phase-63-beam-live-ablation.ts",
          "--mode",
          "full-context",
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

  it("rejects output run ids that are not single path segments", async () => {
    expect(() =>
      parsePhase63AblationCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-ablation.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--mode",
        "gold-evidence-only",
        "--run-id",
        "../outside-beam",
      ]),
    ).toThrow("--run-id must be a single path segment.");

    await expect(
      runPhase63BeamLiveAblation(
        {
          benchmarkRoot: "/tmp/BEAM",
          mode: "gold-evidence-only",
          runId: "../outside-beam",
        },
        {
          readFile: async () => {
            throw new Error("should not read benchmark rows");
          },
        },
      ),
    ).rejects.toThrow("--run-id must be a single path segment.");
  });

  it("selects chat ids per ablation mode", () => {
    const shared = {
      allChatIds: [1, 2, 3, 4],
      evidenceChatIds: [2, 4],
      retrievedChatIds: [2, 3],
    };
    expect(
      selectAblationChatIds({ ...shared, mode: "gold-evidence-only" }),
    ).toEqual([2, 4]);
    expect(
      selectAblationChatIds({ ...shared, mode: "retrieved-hit-only" }),
    ).toEqual([2]);
    expect(
      selectAblationChatIds({ ...shared, mode: "retrieved-raw-uncompressed" }),
    ).toEqual([2, 3]);
    expect(selectAblationChatIds({ ...shared, mode: "full-context" })).toEqual([
      1, 2, 3, 4,
    ]);
    expect(
      selectAblationChatIds({ ...shared, mode: "full-context-evidence-pack" }),
    ).toEqual([1, 2, 3, 4]);
    expect(
      selectAblationChatIds({ ...shared, mode: "gold-evidence-pack" }),
    ).toEqual([2, 4]);
    expect(
      selectAblationChatIds({ ...shared, mode: "retrieved-evidence-pack" }),
    ).toEqual([2, 3]);
    expect(
      selectAblationChatIds({
        ...shared,
        mode: "retrieved-evidence-pack",
        retrievedTopK: 1,
      }),
    ).toEqual([2]);
    expect(
      selectAblationChatIds({
        ...shared,
        mode: "retrieved-hit-only",
        retrievedChatIds: [3, 2, 4],
        retrievedTopK: 2,
      }),
    ).toEqual([2]);
  });

  it("rejects malformed case-id and retrieval-budget selectors", () => {
    expect(() =>
      parsePhase63AblationCliOptions([
        "bun",
        "run",
        "x",
        "--case-ids",
        "one,,two",
      ]),
    ).toThrow("--case-ids must contain unique, non-empty question IDs");
    expect(() =>
      parsePhase63AblationCliOptions([
        "bun",
        "run",
        "x",
        "--case-ids",
        "one,one",
      ]),
    ).toThrow("--case-ids must contain unique, non-empty question IDs");
    expect(() =>
      parsePhase63AblationCliOptions([
        "bun",
        "run",
        "x",
        "--retrieved-top-k",
        "0",
      ]),
    ).toThrow("--retrieved-top-k must be a positive integer");
    expect(() =>
      parsePhase63AblationCliOptions([
        "bun",
        "run",
        "x",
        "--reranker-query-mode",
        "benchmark-specific",
      ]),
    ).toThrow("--reranker-query-mode must be question or current-value");
  });

  it("builds a benchmark-agnostic current-value selector query", () => {
    const query = buildAblationRerankerQuery({
      mode: "current-value",
      question: "What is my current API quota?",
    });

    expect(query).toContain("exact requested attribute");
    expect(query).toContain("latest supported value");
    expect(query).toContain("What is my current API quota?");
    expect(query).not.toContain("BEAM");
  });

  it("builds a benchmark-agnostic minimal sufficient evidence plan", () => {
    const prompt = buildAblationEvidencePlanPrompt({
      documents: [
        { id: "1", text: "The quota used to be 10." },
        { id: "2", text: "The quota is now 20." },
      ],
      maxSelections: 4,
      query: "What is my current API quota?",
    });

    expect(prompt).toContain("minimal sufficient evidence set");
    expect(prompt).toContain("Sufficiency takes priority over sparsity");
    expect(prompt).toContain('"compact"');
    expect(prompt).toContain('"preserve-candidates"');
    expect(prompt).toContain("latest directly supported value");
    expect(prompt).toContain("at most 4 candidate IDs");
    expect(prompt).toContain('"id":"2"');
    expect(prompt).not.toContain("BEAM");
  });

  it("builds source-ordered, deduplicated context and skips unknown ids", () => {
    const turnsById = new Map<number, BeamChatTurn>([
      [2, turn(2, "second")],
      [1, turn(1, "first")],
    ]);
    const context = buildAblationMemoryContext({
      chatIds: [2, 1, 2, 9],
      turnsById,
    });
    expect(context).toBe(
      "[BEAM chat_id=1 role=user time=Jan] first\n[BEAM chat_id=2 role=user time=Jan] second",
    );
  });

  it("requires a live report for retrieval-dependent modes", async () => {
    await expect(
      runPhase63BeamLiveAblation({
        benchmarkRoot: "/tmp/BEAM",
        mode: "retrieved-hit-only",
      }),
    ).rejects.toThrow("requires --live-report");
  });

  it("rejects an output report path that would overwrite the live report before reading inputs", async () => {
    await expect(
      runPhase63BeamLiveAblation(
        {
          benchmarkRoot: "/tmp/BEAM",
          liveReportPath: "/tmp/out/run-abl/ablation-report.json",
          mode: "retrieved-hit-only",
          outputDir: "/tmp/out",
          runId: "run-abl",
        },
        {
          readFile: async () => {
            throw new Error("should not read benchmark or live report");
          },
        },
      ),
    ).rejects.toThrow(
      "--output-path and --live-report must refer to different paths",
    );
  });

  it("runs the gold-evidence-only ablation end to end", async () => {
    const written: Record<string, string> = {};
    const report = await runPhase63BeamLiveAblation(
      {
        benchmarkRoot: "/tmp/BEAM",
        mode: "gold-evidence-only",
        outputDir: "/tmp/out",
        runId: "run-abl-gold",
      },
      {
        concurrency: 1,
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildRawRows()),
        writeFile: async (path, value) => {
          written[path] = value;
        },
        mkdir: async () => undefined,
        // echo the supplied context as the answer; judge marks correct when the
        // gold evidence turn (chat_id=2) is present.
        answerGenerator: async (input) => input.memoryContext,
        answerJudge: async (input) => ({
          correct: input.actualAnswer.includes("chat_id=2"),
          method: "semantic_judge",
          reasoning: "fixture",
        }),
      },
    );

    expect(report.mode).toBe("gold-evidence-only");
    expect(report.summary.totalCases).toBe(2);
    expect(report.summary.correctCases).toBe(1);
    expect(report.summary.answerAccuracy).toBe(0.5);
    expect(report.summary.executionFailures).toBe(0);
    const answerableCase = report.cases.find(
      (testCase) => testCase.questionId === "conv-1:information_extraction:1",
    );
    expect(answerableCase?.contextChatCount).toBe(1);
    expect(answerableCase?.correct).toBe(true);
    expect(written["/tmp/out/run-abl-gold/ablation-report.json"]).toContain(
      "answerAccuracy",
    );
  });

  it("uses recorded retrieval hits for the retrieved-hit-only ablation", async () => {
    const report = await runPhase63BeamLiveAblation(
      {
        benchmarkRoot: "/tmp/BEAM",
        liveReportPath: "/tmp/live.json",
        mode: "retrieved-hit-only",
        outputDir: "/tmp/out",
        runId: "run-abl-hit",
      },
      {
        concurrency: 1,
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async (path) =>
          path === "/tmp/live.json"
            ? buildLiveReport()
            : JSON.stringify(buildRawRows()),
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        answerGenerator: async (input) => input.memoryContext,
        answerJudge: async (input) => ({
          correct: input.actualAnswer.includes("chat_id=2"),
          method: "semantic_judge",
          reasoning: "fixture",
        }),
      },
    );
    // q1 retrieved [2,3] intersect evidence [2] -> [2] only (noise 3 dropped).
    const answerableCase = report.cases.find(
      (testCase) => testCase.questionId === "conv-1:information_extraction:1",
    );
    expect(answerableCase?.contextChatCount).toBe(1);
    expect(answerableCase?.correct).toBe(true);
    expect(report.summary.correctCases).toBe(1);
  });

  it("runs only explicit cases and bounds recorded retrieval before context assembly", async () => {
    const report = await runPhase63BeamLiveAblation(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseIds: ["conv-1:information_extraction:1"],
        liveReportPath: "/tmp/live.json",
        mode: "retrieved-evidence-pack",
        outputDir: "/tmp/out",
        retrievedTopK: 1,
        runId: "run-abl-budgeted",
      },
      {
        concurrency: 1,
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async (path) =>
          path === "/tmp/live.json"
            ? buildLiveReport()
            : JSON.stringify(buildRawRows()),
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        answerGenerator: async (input) => input.memoryContext,
        answerJudge: async () => ({
          correct: true,
          method: "semantic_judge",
          reasoning: "fixture",
        }),
      },
    );

    expect(report.summary.totalCases).toBe(1);
    expect(report.cases[0]?.questionId).toBe(
      "conv-1:information_extraction:1",
    );
    expect(report.cases[0]?.contextChatCount).toBe(1);
  });

  it("listwise-reranks the complete stored candidate set before applying top-k", async () => {
    const report = await runPhase63BeamLiveAblation(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseIds: ["conv-1:information_extraction:1"],
        liveReportPath: "/tmp/live.json",
        mode: "retrieved-evidence-pack",
        outputDir: "/tmp/out",
        rerankStoredEvidence: true,
        retrievedTopK: 1,
        runId: "run-abl-reranked",
      },
      {
        concurrency: 1,
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async (path) =>
          path === "/tmp/live.json"
            ? buildLiveReport()
            : JSON.stringify(buildRawRows()),
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        reranker: {
          async rerank({ documents }) {
            return documents.map((document) => ({
              id: document.id,
              score: document.id === "3" ? 1 : 0,
            }));
          },
        },
        answerGenerator: async (input) => input.memoryContext,
        answerJudge: async () => ({
          correct: true,
          method: "semantic_judge",
          reasoning: "fixture",
        }),
      },
    );

    expect(report.cases[0]?.contextChatIds).toEqual([3]);
    expect(report.cases[0]?.contextChatCount).toBe(1);
  });

  it("plans a minimal evidence set from the complete stored candidate set", async () => {
    const seenDocumentIds: string[][] = [];
    const seenDocumentTexts: string[][] = [];
    const report = await runPhase63BeamLiveAblation(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseIds: ["conv-1:information_extraction:1"],
        liveReportPath: "/tmp/live.json",
        mode: "retrieved-evidence-pack",
        outputDir: "/tmp/out",
        planStoredEvidence: true,
        retrievedTopK: 1,
        runId: "run-abl-planned",
      },
      {
        answerGenerator: async (input) => input.memoryContext,
        answerJudge: async () => ({
          correct: true,
          method: "semantic_judge",
          reasoning: "fixture",
        }),
        concurrency: 1,
        evidenceSelector: async (input) => {
          seenDocumentIds.push(input.documents.map((document) => document.id));
          seenDocumentTexts.push(input.documents.map((document) => document.text));
          expect(input.maxSelections).toBe(1);
          return { mode: "compact", selectedCandidateIds: ["2"] };
        },
        mkdir: async () => undefined,
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async (path) =>
          path === "/tmp/live.json"
            ? buildLiveReport()
            : JSON.stringify(buildRawRows()),
        writeFile: async () => undefined,
      },
    );

    expect(seenDocumentIds).toEqual([["2", "3"]]);
    expect(seenDocumentTexts[0]?.[0]).toContain(
      "[source_id=2 role=user time=Jan-2]",
    );
    expect(report.cases[0]?.contextChatIds).toEqual([2]);
    expect(report.cases[0]?.evidencePlanMode).toBe("compact");
    expect(report.selection.planStoredEvidence).toBe(true);
    expect(report.selection.retrievedTopK).toBe(1);
  });

  it("preserves the original candidate set when the evidence plan is not safely compactable", async () => {
    const report = await runPhase63BeamLiveAblation(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseIds: ["conv-1:information_extraction:1"],
        liveReportPath: "/tmp/live.json",
        mode: "retrieved-evidence-pack",
        outputDir: "/tmp/out",
        planStoredEvidence: true,
        retrievedTopK: 1,
        runId: "run-abl-preserved",
      },
      {
        answerGenerator: async (input) => input.memoryContext,
        answerJudge: async () => ({
          correct: true,
          method: "semantic_judge",
          reasoning: "fixture",
        }),
        concurrency: 1,
        evidenceSelector: async () => ({
          mode: "preserve-candidates",
          selectedCandidateIds: [],
        }),
        mkdir: async () => undefined,
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async (path) =>
          path === "/tmp/live.json"
            ? buildLiveReport()
            : JSON.stringify(buildRawRows()),
        writeFile: async () => undefined,
      },
    );

    expect(report.cases[0]?.contextChatIds).toEqual([2, 3]);
    expect(report.cases[0]?.evidencePlanMode).toBe("preserve-candidates");
  });

  it("uses the live runner evidence-pack protocol including assistant companions", async () => {
    const rawRows = buildRawRows();
    const firstRow = rawRows[0] as {
      probing_questions: Record<string, unknown>;
    };
    firstRow.probing_questions.multi_session_reasoning = [
      {
        answer: "Pepper",
        question: "What did we conclude about the dog across the discussion?",
        question_id: "conv-1:multi_session_reasoning:1",
        question_type: "multi_session_reasoning",
        source_chat_ids: [2],
      },
    ];
    let seenContext = "";
    const report = await runPhase63BeamLiveAblation(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseIds: ["conv-1:multi_session_reasoning:1"],
        liveReportPath: "/tmp/live.json",
        mode: "retrieved-evidence-pack",
        outputDir: "/tmp/out",
        planStoredEvidence: true,
        runId: "run-abl-companion",
      },
      {
        answerGenerator: async (input) => {
          seenContext = input.memoryContext;
          return input.memoryContext;
        },
        answerJudge: async () => ({
          correct: true,
          method: "semantic_judge",
          reasoning: "fixture",
        }),
        concurrency: 1,
        evidenceSelector: async () => ({
          mode: "preserve-candidates",
          selectedCandidateIds: [],
        }),
        mkdir: async () => undefined,
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async (path) =>
          path === "/tmp/live.json"
            ? JSON.stringify({
                cases: [
                  {
                    questionId: "conv-1:multi_session_reasoning:1",
                    retrievedChatIds: [2],
                  },
                ],
              })
            : JSON.stringify(rawRows),
        writeFile: async () => undefined,
      },
    );

    expect(report.summary.executionFailures).toBe(0);
    expect(seenContext).toContain("#2 | user");
    expect(seenContext).toContain("#3 | assistant");
    expect(seenContext).toContain("Unrelated assistant chatter.");
  });

  it("records a planner failure on the affected case without aborting the run", async () => {
    const report = await runPhase63BeamLiveAblation(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseIds: ["conv-1:information_extraction:1"],
        liveReportPath: "/tmp/live.json",
        mode: "retrieved-evidence-pack",
        outputDir: "/tmp/out",
        planStoredEvidence: true,
        runId: "run-abl-plan-failure",
      },
      {
        answerGenerator: async (input) => input.memoryContext,
        answerJudge: async () => ({
          correct: true,
          method: "semantic_judge",
          reasoning: "fixture",
        }),
        concurrency: 1,
        evidenceSelector: async () => {
          throw new Error("planner unavailable");
        },
        mkdir: async () => undefined,
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async (path) =>
          path === "/tmp/live.json"
            ? buildLiveReport()
            : JSON.stringify(buildRawRows()),
        writeFile: async () => undefined,
      },
    );

    expect(report.summary.executionFailures).toBe(1);
    expect(report.cases[0]?.executionError).toContain("planner unavailable");
  });

  it("supports a full-context listwise upper-bound probe", async () => {
    const report = await runPhase63BeamLiveAblation(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseIds: ["conv-1:information_extraction:1"],
        mode: "full-context",
        outputDir: "/tmp/out",
        rerankStoredEvidence: true,
        retrievedTopK: 1,
        runId: "run-abl-full-reranked",
      },
      {
        concurrency: 1,
        now: () => new Date("2026-06-22T00:00:00.000Z"),
        readFile: async () => JSON.stringify(buildRawRows()),
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        reranker: {
          async rerank({ documents }) {
            return documents.map((document) => ({
              id: document.id,
              score: document.id === "2" ? 1 : 0,
            }));
          },
        },
        answerGenerator: async (input) => input.memoryContext,
        answerJudge: async () => ({
          correct: true,
          method: "semantic_judge",
          reasoning: "fixture",
        }),
      },
    );

    expect(report.cases[0]?.contextChatIds).toEqual([2]);
  });
});
