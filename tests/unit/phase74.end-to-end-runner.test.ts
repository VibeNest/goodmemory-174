import { describe, expect, it } from "bun:test";

import {
  runPhase74Generalization,
  type Phase74GeneralizationCase,
} from "../../src/eval/phase74Generalization";
import { buildEvalRunIdentity } from "../../src/eval/runIdentity";

const testCase: Phase74GeneralizationCase = {
  caseId: "case-1",
  expectedAnswer: "Postgres",
  goldEvidenceIds: ["session-1"],
  question: "Which database is current?",
  rawEvidence: [{
    content: "Current database is Postgres.",
    id: "raw-1",
    sourceIds: ["session-1"],
  }],
};

function identity() {
  return buildEvalRunIdentity({
    answerModel: {
      gateway: "deterministic://reader",
      model: "generic-reader-v1",
      provider: "deterministic",
    },
    benchmark: "phase74-test",
    configuration: {
      context: { maxTokens: 6_000, tokenizer: "test-counter-v1" },
    },
    datasetSha256: "dataset-sha",
    generatedAt: "2026-07-18T00:00:00.000Z",
    generatedBy: "phase74.end-to-end-runner.test.ts",
    judgeModel: {
      gateway: "deterministic://judge",
      model: "independent-judge-v1",
      provider: "deterministic",
    },
    promptSha256s: { reader: "reader-sha", judge: "judge-sha" },
    runId: "phase74-e2-test",
  });
}

describe("Phase 74 retrieval-stage end-to-end scoring", () => {
  it("answers and judges each frozen E2 arm within the rendered-context budget", async () => {
    const readerInputs: Array<{ context: string; purpose?: string }> = [];
    const report = await runPhase74Generalization({
      cases: [testCase],
      countRenderedTokens: (content) => content.length,
      executeRetrieval: async ({ arm, stage }) => ({
        retrievedMemories: [{
          content: `${stage}:${arm} Postgres ${"x".repeat(7_000)}`,
          id: `${stage}:${arm}`,
          sourceIds: ["session-1"],
        }],
        snapshotId: `${stage}:${arm}`,
        storedMemories: [],
      }),
      genericReader: async ({ context, purpose }) => {
        readerInputs.push({ context, purpose });
        return context.includes("Postgres") ? "Postgres" : "No answer";
      },
      identity: identity(),
      includeOracle: false,
      judge: async ({ answer }) => ({ correct: answer === "Postgres" }),
      persistIdentity: async () => undefined,
      protocolReader: async () => "unused",
      renderEvidenceLedger: async () => "unused",
      scoreAnswer: () => 0.42,
      stages: ["E2"],
    });

    expect(readerInputs.map(({ purpose }) => purpose)).toEqual([
      "final:baseline:E2:claim-temporal-off",
      "final:candidate:E2:claim-temporal-on",
    ]);
    expect(readerInputs.every(({ context }) => context.length <= 6_000)).toBe(
      true,
    );
    expect(report.executions).toEqual([
      expect.objectContaining({
        answer: "Postgres",
        arm: "claim-temporal-off",
        contextTokens: 6_000,
        correct: true,
        score: 0.42,
      }),
      expect.objectContaining({
        answer: "Postgres",
        arm: "claim-temporal-on",
        contextTokens: 6_000,
        correct: true,
        score: 0.42,
      }),
    ]);
  });
});
