import { describe, expect, it } from "bun:test";
import {
  buildAblationMemoryContext,
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
        "--mode",
        "gold-evidence-only",
        "--run-id",
        "run-abl",
        "--scale",
        "500K",
        "--profile",
        "goodmemory-hybrid",
      ]),
    ).toMatchObject({
      benchmarkRoot: "/tmp/BEAM",
      mode: "gold-evidence-only",
      profile: "goodmemory-hybrid",
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
      selectAblationChatIds({ ...shared, mode: "gold-evidence-pack" }),
    ).toEqual([2, 4]);
    expect(
      selectAblationChatIds({ ...shared, mode: "retrieved-evidence-pack" }),
    ).toEqual([2, 3]);
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
});
