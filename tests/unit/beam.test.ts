import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  runBeamSuite,
  scoreBeamAnswer,
  validateBeamRows,
  type BeamCase,
} from "../../src/eval/beam";

const FIXTURE_PATH = join(
  import.meta.dir,
  "../../fixtures/external-benchmarks/beam/beam_100k_smoke.json",
);

describe("BEAM eval adapter", () => {
  it("validates the synthetic BEAM smoke fixture shape", async () => {
    const rows = validateBeamRows(JSON.parse(await readFile(FIXTURE_PATH, "utf8")));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.conversationSeed.category).toBe("Coding");
    expect(rows[0]?.chat.flat()).toHaveLength(5);
    expect(rows[0]?.probingQuestions.map((question) => question.questionId)).toEqual([
      "beam-smoke-q1",
      "beam-smoke-q2",
      "beam-smoke-q3",
    ]);
  });

  it("scores BEAM abstention questions separately from answerable questions", () => {
    const testCase = {
      answer: "No answer.",
      answerable: false,
      chat: [],
      conversationId: "beam-smoke",
      evidenceChatIds: [],
      question: "Which database did Mira choose?",
      questionId: "beam-smoke-q3",
      questionType: "abstention",
      scale: "100K",
    } satisfies BeamCase;

    expect(scoreBeamAnswer(testCase, "No answer.")).toEqual({
      correct: true,
      method: "abstention",
      reasoning: "The hypothesis correctly abstains for an unanswerable BEAM question.",
    });
    expect(scoreBeamAnswer(testCase, "Postgres").correct).toBe(false);
  });

  it("normalizes real BEAM probing question literals from the rows API", () => {
    const rows = validateBeamRows([
      {
        chat: [
          [
            {
              content: "I implemented the Flask homepage route.",
              id: 24,
              index: "1-1",
              question_type: "implementation",
              role: "user",
              time_anchor: "March 15, 2024",
            },
            {
              content: "I later said I never wrote Flask routes.",
              id: 58,
              index: null,
              question_type: null,
              role: "user",
              time_anchor: null,
            },
          ],
        ],
        conversation_id: "1",
        conversation_plan: "BATCH 1 PLAN",
        conversation_seed: {
          category: "Coding",
          id: 1,
          subtopics: ["Flask"],
          theme: "Budget tracker",
          title: "Building a Flask App",
        },
        narratives: "Technical Problem-Solving Labels",
        probing_questions:
          "{'abstention': [{'question': 'What feedback changed the UI?', 'ideal_response': 'Based on the provided chat, there is no information related to user feedback.', 'rubric': ['no information']}], 'contradiction_resolution': [{'question': 'Have I worked with Flask routes?', 'ideal_answer': \"I notice you've mentioned contradictory information about this.\", 'source_chat_ids': {'first_statement': [58], 'second_statement': [24]}, 'rubric': ['contradictory information']}], 'event_ordering': [{'question': 'What order did I mention Flask work?', 'answer': 'Homepage route first, never-routes statement second.', 'source_chat_ids': [24, [58]], 'rubric': ['homepage route']}]}",
        user_profile: {
          user_info: "USER PROFILE: Craig",
          user_relationships: "None",
        },
        user_questions: [],
      },
    ]);

    expect(rows[0]?.probingQuestions.map((question) => question.questionId)).toEqual([
      "1:abstention:1",
      "1:contradiction_resolution:1",
      "1:event_ordering:1",
    ]);
    expect(rows[0]?.probingQuestions.map((question) => question.answerable)).toEqual([
      false,
      true,
      true,
    ]);
    expect(rows[0]?.probingQuestions[1]?.answer).toContain(
      "contradictory information",
    );
    expect(rows[0]?.probingQuestions[1]?.evidenceChatIds).toEqual([58, 24]);
    expect(rows[0]?.probingQuestions[2]?.evidenceChatIds).toEqual([24, 58]);
  });

  it("runs the smoke suite and writes a phase-63 BEAM report", async () => {
    const writes = new Map<string, string>();
    const report = await runBeamSuite(
      {
        benchmarkRoot: "/tmp/beam",
        generatedBy: "tests",
        mode: "smoke",
        outputDir: "/tmp/out",
      },
      {
        mkdir: async () => undefined,
        now: () => new Date("2026-05-18T00:00:00.000Z"),
        readFile: async () => readFile(FIXTURE_PATH, "utf8"),
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.phase).toBe("phase-63");
    expect(report.summary.totalCases).toBe(3);
    expect(report.summary.executionFailures).toBe(0);
    expect(report.profiles["goodmemory-hybrid"]?.summary.correctCases).toBe(3);
    expect(report.profiles["baseline-no-memory"]?.summary.correctCases).toBe(1);
    expect(writes.has("/tmp/out/run-phase63-beam-smoke-current/report.json")).toBe(true);
  });
});
