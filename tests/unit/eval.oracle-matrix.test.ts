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
    const countedContexts: string[] = [];
    const results = await runOracleMatrixCase({
      countRenderedTokens: (context) => {
        countedContexts.push(context);
        return context.length + 7;
      },
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

    expect(countedContexts).toEqual([
      ...genericInputs.map(({ context }) => context),
      protocolInputs[0]!.context,
    ]);
    expect(results.map(({ renderedContextTokens }) => renderedContextTokens))
      .toEqual(countedContexts.map((context) => context.length + 7));
    expect(genericInputs).toHaveLength(5);
    expect(
      genericInputs.map((input) => Object.keys(input).sort()),
    ).toEqual(Array.from({ length: 5 }, () => [
      "caseId",
      "context",
      "purpose",
      "question",
    ]));
    expect(genericInputs.map(({ caseId }) => caseId)).toEqual(
      Array.from({ length: 5 }, () => "case-1"),
    );
    expect(genericInputs.map(({ purpose }) => purpose)).toEqual(
      ORACLE_MATRIX_ARMS.slice(0, 5).map((arm) => `oracle:${arm}`),
    );
    expect(genericInputs.every((input) =>
      !("protocolMetadata" in input) && !("expectedAnswer" in input)
    )).toBe(true);
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

  it("enforces the frozen context budget before every reader and records truncation", async () => {
    const readerContexts: string[] = [];
    const longCase = createCase();
    longCase.goldEvidenceIds = ["raw-1", "raw-2"];
    longCase.rawEvidence = [
      {
        content: "a".repeat(500),
        id: "raw-1",
        sourceIds: ["raw-1"],
      },
      {
        content: "second item",
        id: "x".repeat(200),
        sourceIds: ["raw-2"],
      },
    ];
    longCase.retrievedMemories = longCase.rawEvidence;
    longCase.storedMemories = longCase.rawEvidence;

    const results = await runOracleMatrixCase({
      contextTokenBudget: 96,
      countRenderedTokens: (context) => context.length,
      genericReader: async ({ context }) => {
        readerContexts.push(context);
        return "Postgres";
      },
      judge: async () => ({ correct: true }),
      protocolReader: async ({ context }) => {
        readerContexts.push(context);
        return "Postgres";
      },
      testCase: longCase,
    });

    expect(readerContexts).toHaveLength(6);
    expect(readerContexts.every((context) => context.length <= 96)).toBe(true);
    expect(results.every(({ renderedContextTokens }) =>
      renderedContextTokens <= 96
    )).toBe(true);
    const raw = results.find(({ arm }) => arm === "oracle-raw");
    expect(raw).toMatchObject({
      contextItemIds: ["raw-1"],
      contextTruncated: true,
      renderedContextTokens: 96,
    });
    expect(raw!.renderedContextTokensBeforeTruncation).toBeGreaterThan(96);
    expect(raw!.contextCharsBeforeTruncation).toBeGreaterThan(
      raw!.contextChars,
    );
    expect(readerContexts.some((context) => context.includes("x".repeat(200))))
      .toBe(false);
  });

  it("safely truncates one oversized item while retaining only its visible id", async () => {
    const readerContexts: string[] = [];
    const inputCase = createCase();
    inputCase.goldEvidenceIds = ["raw-1"];
    inputCase.rawEvidence = [{
      content: "😀".repeat(100),
      id: "raw-1",
      sourceIds: ["raw-1"],
    }];
    inputCase.retrievedMemories = inputCase.rawEvidence;
    inputCase.storedMemories = inputCase.rawEvidence;

    const results = await runOracleMatrixCase({
      contextTokenBudget: 79,
      countRenderedTokens: (context) => context.length,
      genericReader: async ({ context }) => {
        readerContexts.push(context);
        return "Postgres";
      },
      judge: async () => ({ correct: true }),
      protocolReader: async ({ context }) => {
        readerContexts.push(context);
        return "Postgres";
      },
      testCase: inputCase,
    });
    const raw = results.find(({ arm }) => arm === "oracle-raw");

    expect(raw?.contextItemIds).toEqual(["raw-1"]);
    expect(raw?.renderedContextTokens).toBeLessThanOrEqual(79);
    expect(raw?.contextTruncated).toBe(true);
    expect(readerContexts.every((context) =>
      new TextDecoder().decode(new TextEncoder().encode(context)) === context
    )).toBe(true);
  });

  it("reports storage coverage separately from retrieval recall conditional on storage", () => {
    expect(measureOracleMatrixCoverage(createCase())).toEqual({
      evaluable: true,
      goldEvidenceCount: 2,
      retrievedEvidenceRecall: 0.5,
      retrievedGoldEvidenceCount: 1,
      retrievalRecallGivenStorage: 0.5,
      storageCoverage: 1,
      storedGoldEvidenceCount: 2,
      unresolvedGoldEvidenceIds: [],
    });
  });

  it("marks gold-dependent coverage and oracle arms non-evaluable when upstream evidence is missing", async () => {
    const testCase = {
      ...createCase(),
      goldEvidenceIds: [...createCase().goldEvidenceIds, "raw-missing"],
      unresolvedGoldEvidenceIds: ["raw-missing"],
    };
    const genericPurposes: string[] = [];
    const results = await runOracleMatrixCase({
      countRenderedTokens: (context) => context.length,
      genericReader: async ({ purpose }) => {
        genericPurposes.push(purpose!);
        return "Postgres";
      },
      judge: async () => ({ correct: true }),
      protocolReader: async () => "Postgres",
      testCase,
    });

    expect(measureOracleMatrixCoverage(testCase)).toEqual({
      evaluable: false,
      goldEvidenceCount: 3,
      retrievedEvidenceRecall: null,
      retrievedGoldEvidenceCount: 1,
      retrievalRecallGivenStorage: null,
      storageCoverage: null,
      storedGoldEvidenceCount: 2,
      unresolvedGoldEvidenceIds: ["raw-missing"],
    });
    expect(results.filter(({ evaluable }) => !evaluable).map(({ arm }) => arm))
      .toEqual(["oracle-raw", "oracle-memory", "retrieved-gold-only"]);
    expect(results.filter(({ evaluable }) => !evaluable).every((result) =>
      result.answer === null && result.correct === null &&
      result.notEvaluableReason?.includes("raw-missing")
    )).toBe(true);
    expect(genericPurposes).toEqual([
      "oracle:no-memory",
      "oracle:retrieved-full",
    ]);
  });

  it("retains an arm-level failure instead of dropping the rest of the matrix", async () => {
    const results = await runOracleMatrixCase({
      countRenderedTokens: (context) => context.length,
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
