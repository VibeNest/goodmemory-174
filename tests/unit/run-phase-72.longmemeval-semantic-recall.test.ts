import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
  buildPhase72LongMemEvalSemanticRunConfiguration,
  createBoundedPhase72EmbeddingAdapter,
  createPhase72LongMemEvalDenseEvidenceAugmenter,
  createObservedPhase72EmbeddingAdapter,
  createObservedPhase72MemoryExtractor,
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

  it("loads the outcome-derived evidence-turn cohorts with source-report provenance", async () => {
    const selection = await loadPhase72LongMemEvalSemanticSelection(join(
      process.cwd(),
      "scripts",
      "eval-profiles",
      "phase-72",
      "longmemeval-session-dense-selection.json",
    ));

    expect(selection.selectionPurpose).toBe("evidence-turn-augmentation");
    expect(selection.target.questionIds).toHaveLength(32);
    expect(selection.protection.questionIds).toHaveLength(32);
    expect(new Set([
      ...selection.target.questionIds,
      ...selection.protection.questionIds,
    ]).size).toBe(64);
    expect(selection.sourceReport).toEqual({
      path:
        "reports/eval/research/phase-72/longmemeval/run-phase72-longmemeval-semantic-live-full500-c40-v3-retry-merged-v4/report.json",
      sha256: "f8d360eb5f2b01394732b7030d1d93eada6a06c9fb2a8f0cff869869e9af916a",
    });
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

  it("discloses provider reranking without credentials", () => {
    const embedding = resolvePhase72LongMemEvalSemanticEmbedding(
      EMBEDDING_ENV,
      "provider",
    );
    const runConfiguration = buildPhase72LongMemEvalSemanticRunConfiguration(
      embedding,
      {
        apiKey: "reranking-key",
        baseURL: "https://ai.gurkiai.com/v1",
        model: "gpt-5.6-terra",
        provider: "openai",
        requestTimeoutMs: 45_000,
      },
    );

    expect(runConfiguration.reranking).toEqual({
      gateway: "https://ai.gurkiai.com/v1",
      maxConcurrency: 1,
      maxAttempts: 4,
      model: "gpt-5.6-terra",
      provider: "openai",
      requestTimeoutMs: 45_000,
    });
    expect(JSON.stringify(runConfiguration)).not.toContain("reranking-key");
  });

  it("discloses conversational extraction without credentials", () => {
    const embedding = resolvePhase72LongMemEvalSemanticEmbedding(
      EMBEDDING_ENV,
      "provider",
    );
    const runConfiguration = buildPhase72LongMemEvalSemanticRunConfiguration(
      embedding,
      undefined,
      {
        apiKey: "extraction-key",
        baseURL: "https://ai.gurkiai.com/v1",
        contextualDescriptors: false,
        mode: "conversational",
        model: "gpt-5.6-terra",
        provider: "openai",
      },
    );

    expect(runConfiguration.extractionStrategy).toBe("llm-assisted");
    expect(runConfiguration.extraction).toEqual({
      contextualDescriptors: false,
      gateway: "https://ai.gurkiai.com/v1",
      mode: "conversational",
      model: "gpt-5.6-terra",
      provider: "openai",
    });
    expect(JSON.stringify(runConfiguration)).not.toContain("extraction-key");
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

  it("logs assisted extraction outcomes without logging conversation text", async () => {
    const events: unknown[] = [];
    const times = [200, 275];
    const extractor = createObservedPhase72MemoryExtractor({
      inner: {
        extract: async () => ({
          candidates: [],
          ignoredMessageCount: 1,
        }),
      },
      now: () => times.shift() ?? 275,
      writeEvent: async (event) => {
        events.push(event);
      },
    });

    expect(await extractor.extract({
      messages: [{ content: "private benchmark text", role: "user" }],
      scope: { userId: "test-user" },
    })).toEqual({
      candidates: [],
      ignoredMessageCount: 1,
    });
    expect(events).toEqual([
      {
        callId: 1,
        event: "start",
        messageChars: 22,
        messageCount: 1,
      },
      {
        callId: 1,
        candidateCount: 0,
        durationMs: 75,
        event: "success",
        ignoredMessageCount: 1,
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

  it("adds only dense evidence from retrieved sessions while preserving the default lines", async () => {
    const embeddedTexts: string[][] = [];
    const augmenter = createPhase72LongMemEvalDenseEvidenceAugmenter({
      embeddingAdapter: {
        embed: async (texts) => {
          embeddedTexts.push(texts);
          return texts.map((text) =>
            text.includes("dense answer") || text.includes("Which evidence")
              ? [1, 0]
              : [0, 1]
          );
        },
      },
      maxAdditions: 2,
    });

    const additions = await augmenter({
      context: "",
      defaultEvidenceLines: ["Existing default evidence."],
      evidenceBySessionId: new Map([
        [
          "retrieved",
          [
            {
              content: "Existing default evidence.",
              messageIndex: 0,
              role: "user",
              sessionId: "retrieved",
              tags: [],
            },
            {
              content: "The dense answer is forty two.",
              messageIndex: 1,
              role: "assistant",
              sessionId: "retrieved",
              tags: [],
            },
          ],
        ],
        [
          "not-retrieved",
          [{
            content: "A dense answer outside the admitted parent session.",
            messageIndex: 0,
            role: "assistant",
            sessionId: "not-retrieved",
            tags: [],
          }],
        ],
      ]),
      question: "Which evidence gives the answer?",
      selectedSessionIds: ["retrieved"],
    });

    expect(additions).toEqual(["The dense answer is forty two."]);
    expect(embeddedTexts).toEqual([[
      "Which evidence gives the answer?",
      "The dense answer is forty two.",
    ]]);
  });

  it("defaults semantic recall diagnostics to 40-way case concurrency", () => {
    expect(parsePhase72LongMemEvalSemanticRecallOptions([
      "bun",
      "run-phase-72-longmemeval-semantic-recall.ts",
    ], "/repo", "/cache").maxConcurrency).toBe(40);
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
