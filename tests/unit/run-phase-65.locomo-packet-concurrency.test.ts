import { describe, expect, it } from "bun:test";

import type { GoodMemory } from "../../src/api/contracts";
import type { LocomoCase } from "../../src/eval/locomo";
import {
  parseLocomoSmokeCliOptions,
  runLocomoSmoke,
} from "../../scripts/run-phase-65-locomo-smoke";

const testCase: LocomoCase = {
  caseId: "locomo-concurrency",
  questions: [
    {
      adversarialAnswer: null,
      category: "single_hop",
      evidenceTurnIds: ["D1:1"],
      goldAnswer: "apple",
      matchMode: "f1_token_overlap",
      question: "What was the first answer?",
      questionId: "q1",
    },
    {
      adversarialAnswer: null,
      category: "single_hop",
      evidenceTurnIds: ["D1:1"],
      goldAnswer: "apple",
      matchMode: "f1_token_overlap",
      question: "What was the second answer?",
      questionId: "q2",
    },
    {
      adversarialAnswer: null,
      category: "single_hop",
      evidenceTurnIds: ["D1:1"],
      goldAnswer: "apple",
      matchMode: "f1_token_overlap",
      question: "What was the third answer?",
      questionId: "q3",
    },
  ],
  sourceConversation: "synthetic-concurrency",
  speakers: ["A", "B"],
  turns: [
    {
      content: "The answer is apple.",
      diaId: "D1:1",
      speaker: "A",
    },
    {
      content: "Unrelated context.",
      diaId: "D1:2",
      speaker: "B",
    },
  ],
};

function createFakeMemory(onRecall: () => Promise<void>): GoodMemory {
  return {
    async recall() {
      await onRecall();
      return {
        archives: [],
        episodes: [],
        evidence: [],
        facts: [
          {
            content: "[LOCOMO dia_id=D1:2 speaker=B] Unrelated context.",
          },
          {
            content: "[LOCOMO dia_id=D1:1 speaker=A] The answer is apple.",
          },
        ],
        feedback: [],
        packet: {
          factSummary:
            "- [LOCOMO dia_id=D1:1 speaker=A] The answer is apple.",
        },
        preferences: [],
        references: [],
      } as never;
    },
    async remember() {
      return {} as never;
    },
  } as unknown as GoodMemory;
}

describe("phase-65 LoCoMo packet context and concurrency", () => {
  it("parses explicit packet context and positive concurrency", () => {
    const parsed = parseLocomoSmokeCliOptions([
      "bun",
      "run",
      "scripts/run-phase-65-locomo-smoke.ts",
      "--live",
      "--answer-from-packet",
      "--concurrency",
      "40",
    ]);

    expect(parsed.answerFromPacket).toBe(true);
    expect(parsed.concurrency).toBe(40);
    expect(() =>
      parseLocomoSmokeCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-smoke.ts",
        "--concurrency",
        "0",
      ]),
    ).toThrow("--concurrency must be a positive integer");
  });

  it("uses packet turn ids for scoring and answers while preserving source order", async () => {
    let activeRecalls = 0;
    let maxActiveRecalls = 0;
    const answerTurnIds: string[][] = [];
    const memory = createFakeMemory(async () => {
      activeRecalls += 1;
      maxActiveRecalls = Math.max(maxActiveRecalls, activeRecalls);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeRecalls -= 1;
    });

    const report = await runLocomoSmoke(
      {
        answerFromPacket: true,
        benchmarkRoot: "/benchmark",
        concurrency: 2,
        evidencePack: true,
        live: true,
        outputDir: "/tmp/locomo-packet-concurrency",
        runId: "packet-concurrency",
      },
      {
        answerGenerator: async ({ retrievedTurnIds }) => {
          answerTurnIds.push([...retrievedTurnIds]);
          return "apple";
        },
        appendFile: async () => undefined,
        createMemory: () => memory,
        mkdir: async () => undefined,
        readFile: async () => JSON.stringify({ cases: [testCase] }),
        writeFile: async () => undefined,
      },
    );

    expect(maxActiveRecalls).toBe(2);
    expect(report.concurrency).toBe(2);
    expect(report.answerContextMode).toBe("packet-evidence-pack");
    expect(report.cases.map((row) => row.questionId)).toEqual([
      "q1",
      "q2",
      "q3",
    ]);
    expect(report.cases.every((row) => row.evidenceRecall === 1)).toBe(true);
    expect(report.cases.every((row) => row.noiseTurnCount === 0)).toBe(true);
    expect(
      report.cases.every(
        (row) => JSON.stringify(row.retrievedTurnIds) === '["D1:1"]',
      ),
    ).toBe(true);
    expect(answerTurnIds).toEqual([["D1:1"], ["D1:1"], ["D1:1"]]);
  });
});
