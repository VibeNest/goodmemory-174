import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
  buildPhase72LongMemEvalSemanticRunConfiguration,
  createBoundedPhase72EmbeddingAdapter,
  createObservedPhase72EmbeddingAdapter,
  evaluatePhase72LongMemEvalSemanticAdmission,
  loadPhase72LongMemEvalSemanticSelection,
  parsePhase72LongMemEvalSemanticRecallOptions,
  resolvePhase72LongMemEvalSemanticEmbedding,
} from "../../scripts/run-phase-72-longmemeval-semantic-recall";

const EMBEDDING_ENV = {
  GOODMEMORY_EMBEDDING_API_KEY: "embedding-key",
  GOODMEMORY_EMBEDDING_BASE_URL: "https://openrouter.ai/api/v1",
  GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
  GOODMEMORY_EMBEDDING_PROVIDER: "openai",
} as const;

describe("Phase 72 LongMemEval semantic recall runner", () => {
  it("parses a resumable fixed-cohort run", () => {
    expect(parsePhase72LongMemEvalSemanticRecallOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-recall.ts",
      "--benchmark-root",
      "/bench/LongMemEval",
      "--selection-file",
      "/repo/selection.json",
      "--output-dir",
      "/repo/reports",
      "--run-id",
      "semantic-probe",
      "--embedding-mode",
      "provider",
      "--cohort",
      "target",
      "--max-concurrency",
      "2",
      "--resume",
      "--retry-failures",
    ], "/repo", "/cache")).toEqual({
      benchmarkRoot: "/bench/LongMemEval",
      cohort: "target",
      embeddingMode: "provider",
      maxConcurrency: 2,
      outputDir: "/repo/reports",
      resume: true,
      retryFailures: true,
      runId: "semantic-probe",
      selectionFile: "/repo/selection.json",
    });
  });

  it("loads the frozen 32-target and 32-protection cohorts without overlap", async () => {
    const selection = await loadPhase72LongMemEvalSemanticSelection(join(
      process.cwd(),
      "scripts",
      "eval-profiles",
      "phase-72",
      "longmemeval-semantic-recall-selection.json",
    ));

    expect(selection.target.questionIds).toHaveLength(32);
    expect(selection.protection.questionIds).toHaveLength(32);
    expect(new Set([
      ...selection.target.questionIds,
      ...selection.protection.questionIds,
    ]).size).toBe(64);
    expect(selection.benchmarkFingerprint).toBe(
      "195fa256c468ff68079f5a05de2572deb47fa2c06b5d48e1d3ad4f3e044a5203",
    );
  });

  it("pins provider embeddings and keeps credentials out of report identity", () => {
    const embedding = resolvePhase72LongMemEvalSemanticEmbedding(
      EMBEDDING_ENV,
      "provider",
    );
    expect(embedding.mode).toBe("provider");
    if (embedding.mode !== "provider") {
      throw new Error("Expected provider embedding configuration.");
    }
    expect(embedding.model).toMatchObject({
      baseURL: "https://openrouter.ai/api/v1",
      model: "text-embedding-3-small",
      provider: "openai",
    });

    const runConfiguration =
      buildPhase72LongMemEvalSemanticRunConfiguration(embedding);
    expect(runConfiguration.providerEmbedding).toBe(true);
    expect(runConfiguration.embedding).toEqual({
      gateway: "https://openrouter.ai/api/v1",
      maxBatchChars: 32000,
      maxBatchTexts: 8,
      maxTextChars: 16000,
      model: "text-embedding-3-small",
      provider: "openai",
    });
    expect(JSON.stringify(runConfiguration)).not.toContain("embedding-key");
  });

  it("keeps the provider-free floor explicit", () => {
    const embedding = resolvePhase72LongMemEvalSemanticEmbedding(
      {},
      "none",
    );
    expect(embedding).toEqual({ mode: "none" });
    expect(buildPhase72LongMemEvalSemanticRunConfiguration(embedding))
      .toMatchObject({
        embedding: null,
        providerEmbedding: false,
      });
  });

  it("logs embedding batch shape and latency without logging text", async () => {
    const events: unknown[] = [];
    const times = [100, 145];
    const adapter = createObservedPhase72EmbeddingAdapter({
      inner: {
        embed: async () => [[0.1, 0.2, 0.3]],
      },
      now: () => times.shift() ?? 145,
      writeEvent: async (event) => {
        events.push(event);
      },
    });

    expect(await adapter.embed(["private benchmark text"])).toEqual([
      [0.1, 0.2, 0.3],
    ]);
    expect(events).toEqual([
      {
        callId: 1,
        event: "start",
        textChars: 22,
        textCount: 1,
      },
      {
        callId: 1,
        dimensions: 3,
        durationMs: 45,
        event: "success",
        vectorCount: 1,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("private benchmark text");
  });

  it("bounds and splits provider embedding requests without reordering vectors", async () => {
    const batches: string[][] = [];
    const adapter = createBoundedPhase72EmbeddingAdapter({
      inner: {
        embed: async (texts) => {
          batches.push(texts);
          return texts.map((text) => [text.length]);
        },
      },
      maxBatchChars: 6,
      maxBatchTexts: 2,
      maxTextChars: 4,
    });

    expect(await adapter.embed(["abcdef", "xy", "z"])).toEqual([
      [4],
      [2],
      [1],
    ]);
    expect(batches).toEqual([
      ["abcd", "xy"],
      ["z"],
    ]);
  });

  it("admits only a 3pt target lift with at most 1pt protection regression", () => {
    expect(evaluatePhase72LongMemEvalSemanticAdmission({
      baseline: {
        executionFailures: 0,
        protectionRecall: 0.89,
        targetRecall: 0.24,
      },
      candidate: {
        executionFailures: 0,
        protectionRecall: 0.88,
        targetRecall: 0.27,
      },
    })).toMatchObject({
      admitted: true,
      protectionRegressionPoints: 1,
      targetGainPoints: 3,
    });

    expect(evaluatePhase72LongMemEvalSemanticAdmission({
      baseline: {
        executionFailures: 0,
        protectionRecall: 0.89,
        targetRecall: 0.24,
      },
      candidate: {
        executionFailures: 0,
        protectionRecall: 0.87,
        targetRecall: 0.30,
      },
    }).admitted).toBe(false);
  });
});
