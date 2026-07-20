import { describe, expect, it } from "bun:test";

import {
  buildPhase74OfficialScoringIdentity,
  createPhase74OfficialAnswerAssessor,
} from "../../src/eval/phase74OfficialScoring";
import type { AttributedModelUsageAttempt } from "../../src/eval/modelUsage";

const judgeModel = {
  apiKey: "judge-key",
  baseURL: "https://ai.gurkiai.com/v1",
  model: "gpt-5.5",
  provider: "openai" as const,
};

describe("Phase 74 official scoring", () => {
  it("publishes benchmark-specific primary metric identities", () => {
    expect(buildPhase74OfficialScoringIdentity("longmemeval")).toMatchObject({
      binaryCorrectRule: "official-yes-no",
      primaryMetric: "accuracy",
      scorer: "longmemeval-official-qa-accuracy-v1",
    });
    expect(buildPhase74OfficialScoringIdentity("locomo")).toMatchObject({
      binaryCorrectRule: "official-score-equals-one",
      primaryMetric: "macro-mean-category-aware-f1",
      scorer: expect.stringContaining("snap-research/locomo@"),
    });
  });

  it("scores LoCoMo locally with the pinned category-aware scorer", async () => {
    const events: AttributedModelUsageAttempt[] = [];
    const assess = createPhase74OfficialAnswerAssessor({
      benchmark: "locomo",
      events,
      model: judgeModel,
    });

    const result = await assess({
      answer: "running clubs",
      purpose: "final:candidate:E2:claim-temporal-on",
      testCase: {
        caseId: "locomo/q1",
        expectedAnswer: "run club",
        goldEvidenceIds: [],
        protocolMetadata: { category: "single_hop" },
        question: "What club?",
        rawEvidence: [],
      },
    });

    expect(result).toEqual({ correct: true, score: 1 });
    expect(events).toEqual([]);
  });

  it("judges LongMemEval with the pinned per-question-type prompt", async () => {
    const events: AttributedModelUsageAttempt[] = [];
    let requestBody = "";
    const assess = createPhase74OfficialAnswerAssessor({
      benchmark: "longmemeval",
      events,
      fetch: async (_url, init) => {
        requestBody = String(init?.body);
        return new Response([
          'data: {"choices":[{"delta":{"content":"Yes"},"index":0}]}',
          'data: {"choices":[],"usage":{"prompt_tokens":30,"completion_tokens":1}}',
          "data: [DONE]",
          "",
        ].join("\n\n"), {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        });
      },
      model: judgeModel,
    });

    expect(await assess({
      answer: "19 days",
      purpose: "final:candidate:E2:claim-temporal-on",
      testCase: {
        caseId: "lme/q1",
        expectedAnswer: "18 days",
        goldEvidenceIds: [],
        protocolMetadata: { questionType: "temporal-reasoning" },
        question: "How long?",
        rawEvidence: [],
      },
    })).toEqual({ correct: true, score: 1 });
    expect(requestBody).toContain("do not penalize off-by-one errors");
    expect(JSON.parse(requestBody)).toMatchObject({
      max_tokens: 10,
      model: "gpt-5.5",
      temperature: 0,
    });
    expect(events).toEqual([
      expect.objectContaining({
        branch: "judge",
        caseId: "lme/q1",
        completeness: "complete",
        operation: "judge",
      }),
    ]);
  });

  it("fails closed when required protocol metadata is missing", async () => {
    const assess = createPhase74OfficialAnswerAssessor({
      benchmark: "locomo",
      events: [],
      model: judgeModel,
    });
    await expect(assess({
      answer: "answer",
      purpose: "final:baseline:E1:fact-only",
      testCase: {
        caseId: "locomo/q1",
        expectedAnswer: "gold",
        goldEvidenceIds: [],
        question: "question",
        rawEvidence: [],
      },
    })).rejects.toThrow("valid official category");
  });
});
