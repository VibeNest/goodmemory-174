import { describe, expect, it } from "bun:test";

import {
  buildOracleMatrixRunIdentity,
  measureOracleMatrixCoverage,
  ORACLE_MATRIX_ARMS,
  runOracleMatrixCase,
  selectOracleMatrixContextItems,
} from "../../src/eval/oracleMatrix";
import type {
  OracleMatrixCase,
  OracleMatrixProtocolReaderInput,
  OracleMatrixReaderInput,
} from "../../src/eval/oracleMatrix";

function createCase(): OracleMatrixCase {
  return {
    caseId: "case-1",
    expectedAnswer: "Postgres",
    goldEvidenceIds: ["raw-1", "raw-3"],
    protocolMetadata: { questionType: "knowledge_update" },
    question: "Which database is current?",
    rawEvidence: [
      { content: "Used SQLite.", id: "raw-1", sourceIds: ["raw-1"] },
      { content: "Adopted Redis for caching.", id: "raw-2", sourceIds: ["raw-2"] },
      { content: "Switched the database to Postgres.", id: "raw-3", sourceIds: ["raw-3"] },
    ],
    retrievedMemories: [
      { content: "Uses Redis for caching.", id: "memory-2", sourceIds: ["raw-2"] },
      { content: "Current database is Postgres.", id: "memory-3", sourceIds: ["raw-3"] },
    ],
    storedMemories: [
      { content: "Previously used SQLite.", id: "memory-1", sourceIds: ["raw-1"] },
      { content: "Uses Redis for caching.", id: "memory-2", sourceIds: ["raw-2"] },
      { content: "Current database is Postgres.", id: "memory-3", sourceIds: ["raw-3"] },
    ],
  };
}

describe("eval oracle matrix", () => {
  it("locks the six diagnostic arms", () => {
    expect(ORACLE_MATRIX_ARMS).toEqual([
      "no-memory",
      "oracle-raw",
      "oracle-memory",
      "retrieved-gold-only",
      "retrieved-full",
      "retrieved-full+protocol-reader",
    ]);
  });

  it("selects raw, stored, and retrieved evidence without turning retrieved gold into an oracle", () => {
    const testCase = createCase();
    const selectedIds = Object.fromEntries(
      ORACLE_MATRIX_ARMS.map((arm) => [
        arm,
        selectOracleMatrixContextItems({ arm, testCase }).map(({ id }) => id),
      ]),
    );

    expect(selectedIds).toEqual({
      "no-memory": [],
      "oracle-raw": ["raw-1", "raw-3"],
      "oracle-memory": ["memory-1", "memory-3"],
      "retrieved-gold-only": ["memory-3"],
      "retrieved-full": ["memory-2", "memory-3"],
      "retrieved-full+protocol-reader": ["memory-2", "memory-3"],
    });
  });

  it("uses one label-free reader for the first five arms and protocol metadata only for the sixth", async () => {
    const genericInputs: OracleMatrixReaderInput[] = [];
    const protocolInputs: OracleMatrixProtocolReaderInput[] = [];
    const results = await runOracleMatrixCase({
      genericReader: async (input) => {
        genericInputs.push(input);
        return "Postgres";
      },
      judge: async ({ answer, expectedAnswer }) => ({
        correct: answer === expectedAnswer,
      }),
      protocolReader: async (input) => {
        protocolInputs.push(input);
        return "Postgres";
      },
      testCase: createCase(),
    });

    expect(genericInputs).toHaveLength(5);
    expect(
      genericInputs.map((input) => Object.keys(input).sort()),
    ).toEqual(Array.from({ length: 5 }, () => ["context", "question"]));
    expect(protocolInputs).toHaveLength(1);
    expect(protocolInputs[0]?.protocolMetadata).toEqual({
      questionType: "knowledge_update",
    });
    expect(results.map(({ correct }) => correct)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(results[4]?.contextItemIds).toEqual(results[5]?.contextItemIds);
  });

  it("reports storage coverage separately from retrieval recall conditional on storage", () => {
    expect(measureOracleMatrixCoverage(createCase())).toEqual({
      goldEvidenceCount: 2,
      retrievedEvidenceRecall: 0.5,
      retrievedGoldEvidenceCount: 1,
      retrievalRecallGivenStorage: 0.5,
      storageCoverage: 1,
      storedGoldEvidenceCount: 2,
    });
  });

  it("retains an arm-level failure instead of dropping the rest of the matrix", async () => {
    const results = await runOracleMatrixCase({
      genericReader: async () => "Postgres",
      judge: async () => ({ correct: true }),
      protocolReader: async () => {
        throw new Error("protocol unavailable");
      },
      testCase: createCase(),
    });

    expect(results).toHaveLength(6);
    expect(results.slice(0, 5).every(({ correct }) => correct)).toBe(true);
    expect(results[5]).toMatchObject({
      answer: null,
      correct: false,
      executionError: "protocol unavailable",
    });
  });

  it("builds a stable identity that pins reader, judge, prompts, data, and budgets", () => {
    const identity = buildOracleMatrixRunIdentity({
      benchmark: "fixture",
      concurrency: 4,
      contextTokenBudget: 6_000,
      datasetSha256: "dataset-sha",
      generatedBy: "tests/unit/eval.oracle-matrix.test.ts",
      genericReader: {
        gateway: "https://ai.gurkiai.com/v1",
        maxOutputTokens: 512,
        model: "gpt-5.6-terra",
        promptSha256: "reader-prompt-sha",
        provider: "openai",
        temperature: 0,
      },
      judge: {
        gateway: "https://judge.example/v1",
        model: "independent-judge",
        promptSha256: "judge-prompt-sha",
        provider: "openai",
      },
      protocolReaderPromptSha256: "protocol-reader-prompt-sha",
      retrievalConfigSha256: "retrieval-config-sha",
      seed: 7,
      selectedCaseIdsSha256: "case-ids-sha",
      timeoutMs: 180_000,
    });

    expect(identity).toEqual({
      arms: ORACLE_MATRIX_ARMS,
      benchmark: "fixture",
      concurrency: 4,
      contextTokenBudget: 6_000,
      datasetSha256: "dataset-sha",
      generatedBy: "tests/unit/eval.oracle-matrix.test.ts",
      genericReader: {
        gateway: "https://ai.gurkiai.com/v1",
        maxOutputTokens: 512,
        model: "gpt-5.6-terra",
        promptSha256: "reader-prompt-sha",
        provider: "openai",
        temperature: 0,
      },
      judge: {
        gateway: "https://judge.example/v1",
        model: "independent-judge",
        promptSha256: "judge-prompt-sha",
        provider: "openai",
      },
      protocolReaderPromptSha256: "protocol-reader-prompt-sha",
      retrievalConfigSha256: "retrieval-config-sha",
      schemaVersion: 1,
      seed: 7,
      selectedCaseIdsSha256: "case-ids-sha",
      timeoutMs: 180_000,
    });
  });
});
