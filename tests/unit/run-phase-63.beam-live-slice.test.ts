import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  buildPhase63BeamAnswerMemoryContext,
  buildPhase63BeamPrompt,
  compressPhase63BeamMemoryContextText,
  extractPhase63BeamRequestedItemCount,
  parsePhase63BeamLiveSliceCliOptions,
  runPhase63BeamLiveSlice,
} from "../../scripts/run-phase-63-beam-live-slice";

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
      },
      user_profile: {
        user_info: "USER PROFILE: Mira",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
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
      benchmarkRoot: "/tmp/BEAM",
      caseIds: ["beam-live-q1"],
      limit: 2,
      outputDir: undefined,
      profile: "goodmemory-rules-only",
      recallReportPath: "/tmp/recall.json",
      runId: "run-beam-live",
      scale: undefined,
    });
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
