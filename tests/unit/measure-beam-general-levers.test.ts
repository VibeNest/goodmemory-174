import { describe, expect, it } from "bun:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoodMemory } from "../../src";
import type { EmbeddingAdapter } from "../../src/embedding/contracts";
import type {
  BeamProfile,
  BeamProfileReport,
  BeamProfileSummary,
  BeamReport,
} from "../../src/eval/beam";
import { inspectGoodMemoryRuntime } from "../../src/api/runtimeInfo";
import type { BeamGeneralLeverRecallDiagnosticRunner } from "../../scripts/measure-beam-general-levers";
import {
  parseBeamGeneralLeverCliOptions,
  runBeamGeneralLeverMeasure,
} from "../../scripts/measure-beam-general-levers";

const SUMMARY: BeamProfileSummary = {
  abstentionCorrectCases: 0,
  accuracy: 0,
  correctCases: 0,
  evidenceCaseCount: 0,
  evidenceChatRecall: 0.6822,
  missedRecallCases: 0,
  totalCases: 0,
  wrongAnswerCases: 0,
  wrongRecallCases: 0,
};

const EMBEDDING_ENV_KEYS = [
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_PROVIDER",
] as const;

function snapshotEmbeddingEnv(): Record<(typeof EMBEDDING_ENV_KEYS)[number], string | undefined> {
  return Object.fromEntries(
    EMBEDDING_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof EMBEDDING_ENV_KEYS)[number], string | undefined>;
}

function restoreEmbeddingEnv(
  snapshot: Record<(typeof EMBEDDING_ENV_KEYS)[number], string | undefined>,
): void {
  for (const key of EMBEDDING_ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

function buildReport(input: {
  profile: BeamProfile;
  runId: string;
}): BeamReport {
  const profileReport = {
    cases: [],
    summary: SUMMARY,
  } satisfies BeamProfileReport;

  return {
    benchmarkRoot: "/tmp/BEAM",
    generatedAt: "2026-07-05T00:00:00.000Z",
    generatedBy: "scripts/measure-beam-general-levers.ts",
    mode: "full",
    outputDir: "/tmp/out",
    phase: "phase-63",
    profiles: {
      [input.profile]: profileReport,
    },
    runDirectory: `/tmp/out/${input.runId}`,
    runId: input.runId,
    source: {
      benchmark: "BEAM",
      license: "cc-by-sa-4.0 dataset; paper external",
      url: "https://huggingface.co/datasets/Mohammadta/BEAM",
    },
    summary: {
      caseCountsByQuestionType: {},
      executionFailures: 0,
      profilesCompared: [input.profile],
      scale: "100K",
      totalCases: 0,
    },
  };
}

describe("measure BEAM general levers", () => {
  it("parses strict CLI options for a single arm", () => {
    expect(
      parseBeamGeneralLeverCliOptions([
        "bun",
        "run",
        "scripts/measure-beam-general-levers.ts",
        "--arm",
        "bm25-union16",
        "--benchmark-root",
        "/tmp/BEAM",
        "--semantic-topk",
        "32",
        "--limit",
        "12",
        "--output-dir",
        "/tmp/out",
        "--run-id",
        "run-beam-general-levers",
        "--keep-gates",
      ]),
    ).toEqual({
      arm: "bm25-union16",
      benchmarkRoot: "/tmp/BEAM",
      keepGates: true,
      limit: 12,
      outputDir: "/tmp/out",
      runId: "run-beam-general-levers",
      semanticTopK: 32,
    });
  });

  it("rejects duplicate or malformed evidence selectors before running", () => {
    expect(() =>
      parseBeamGeneralLeverCliOptions([
        "bun",
        "run",
        "scripts/measure-beam-general-levers.ts",
        "--arm",
        "floor",
        "--arm",
        "bm25",
      ]),
    ).toThrow("--arm cannot be specified more than once.");

    expect(() =>
      parseBeamGeneralLeverCliOptions([
        "bun",
        "run",
        "scripts/measure-beam-general-levers.ts",
        "--arm",
        "union16",
        "--semantic-topk",
        "0",
      ]),
    ).toThrow("--semantic-topk must be a positive integer.");

    expect(() =>
      parseBeamGeneralLeverCliOptions([
        "bun",
        "run",
        "scripts/measure-beam-general-levers.ts",
        "--arm",
        "floor",
        "--keep-gates",
        "--keep-gates",
      ]),
    ).toThrow("--keep-gates cannot be specified more than once.");
  });

  it("rejects output run ids that are not single path segments", async () => {
    expect(() =>
      parseBeamGeneralLeverCliOptions([
        "bun",
        "run",
        "scripts/measure-beam-general-levers.ts",
        "--arm",
        "floor",
        "--run-id",
        "../outside-beam",
      ]),
    ).toThrow("--run-id must be a single path segment.");

    await expect(
      runBeamGeneralLeverMeasure(
        {
          arm: "floor",
          benchmarkRoot: "/tmp/BEAM",
          keepGates: false,
          runId: "../outside-beam",
          semanticTopK: 16,
        },
        {
          env: { HOME: "/tmp/home" },
          listNarrowGateIds: () => [],
          log: () => {},
          runRecallDiagnostic: async () => {
            throw new Error("should not run recall diagnostic");
          },
        },
      ),
    ).rejects.toThrow("--run-id must be a single path segment.");
  });

  it("disables every registered narrow gate for a generalization run", async () => {
    const env: Record<string, string | undefined> = { HOME: "/tmp/home" };
    const logs: string[] = [];
    let resetCount = 0;
    let receivedProfile: BeamProfile | undefined;
    let receivedRunId: string | undefined;
    let receivedBenchmarkRoot: string | undefined;
    let receivedDisabledGates: string | undefined;
    let receivedOutputDir: string | undefined;
    let hasMemoryFactory = false;
    const runRecallDiagnostic: BeamGeneralLeverRecallDiagnosticRunner = async (
      options,
      dependencies,
    ) => {
      receivedBenchmarkRoot = options.benchmarkRoot;
      receivedDisabledGates = env.GOODMEMORY_DISABLED_NARROW_GATES;
      receivedOutputDir = options.outputDir;
      receivedProfile = options.profiles?.[0] as BeamProfile | undefined;
      receivedRunId = options.runId;
      hasMemoryFactory = typeof dependencies?.createMemory === "function";
      return buildReport({
        profile: receivedProfile ?? "goodmemory-hybrid",
        runId: receivedRunId ?? "run-missing",
      });
    };

    const summary = await runBeamGeneralLeverMeasure(
      {
        arm: "bm25",
        keepGates: false,
        outputDir: "/tmp/out",
        semanticTopK: 16,
      },
      {
        env,
        listNarrowGateIds: () => ["gate-a", "gate-b"],
        log: (message) => logs.push(message),
        resetNarrowGateDisables: () => {
          resetCount += 1;
        },
        runRecallDiagnostic,
      },
    );

    expect(receivedDisabledGates).toBe("gate-a,gate-b");
    expect(env.GOODMEMORY_DISABLED_NARROW_GATES).toBeUndefined();
    expect(logs).toEqual(["narrow gates disabled: 2"]);
    expect(resetCount).toBe(2);
    expect(receivedBenchmarkRoot).toBe("/tmp/home/.goodmemory-beam");
    expect(receivedOutputDir).toBe("/tmp/out");
    expect(receivedProfile).toBe("goodmemory-hybrid");
    expect(receivedRunId).toBe("run-p5-beam-levers-bm25-generalization");
    expect(hasMemoryFactory).toBe(true);
    expect(summary).toEqual({
      arm: "bm25",
      gatesDisabled: true,
      profile: "goodmemory-hybrid",
      runId: "run-p5-beam-levers-bm25-generalization",
      semanticTopK: null,
      summary: SUMMARY,
    });
  });

  it("keeps the bm25 arm embedding-free even when provider embedding env is present", async () => {
    const savedEmbeddingEnv = snapshotEmbeddingEnv();
    const env: Record<string, string | undefined> = { HOME: "/tmp/home" };
    let embeddingEnabled: boolean | undefined;

    try {
      process.env.GOODMEMORY_EMBEDDING_PROVIDER = "openai";
      process.env.GOODMEMORY_EMBEDDING_MODEL = "text-embedding-3-small";
      process.env.GOODMEMORY_EMBEDDING_API_KEY = "test-embedding-key";
      process.env.GOODMEMORY_EMBEDDING_BASE_URL = "https://embedding.test/v1";

      await runBeamGeneralLeverMeasure(
        {
          arm: "bm25",
          keepGates: false,
          semanticTopK: 16,
        },
        {
          env,
          listNarrowGateIds: () => [],
          log: () => {},
          runRecallDiagnostic: async (options, dependencies) => {
            const memory = dependencies?.createMemory?.();
            embeddingEnabled = memory
              ? inspectGoodMemoryRuntime(memory)?.embeddingEnabled
              : undefined;
            return buildReport({
              profile: (options.profiles?.[0] as BeamProfile | undefined) ??
                "goodmemory-hybrid",
              runId: options.runId ?? "run-missing",
            });
          },
        },
      );

      expect(embeddingEnabled).toBe(false);
    } finally {
      restoreEmbeddingEnv(savedEmbeddingEnv);
    }
  });

  it("includes non-default semantic topK in the default union run id", async () => {
    let receivedRunId: string | undefined;

    const summary = await runBeamGeneralLeverMeasure(
      {
        arm: "union16",
        benchmarkRoot: "/tmp/BEAM",
        keepGates: false,
        semanticTopK: 32,
      },
      {
        env: {
          GOODMEMORY_EMBEDDING_API_KEY: "embedding-key",
          GOODMEMORY_EMBEDDING_BASE_URL: "https://embedding.test/v1",
          GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
          HOME: "/tmp/home",
        },
        listNarrowGateIds: () => [],
        log: () => {},
        runRecallDiagnostic: async (options) => {
          receivedRunId = options.runId;
          return buildReport({
            profile: (options.profiles?.[0] as BeamProfile | undefined) ??
              "goodmemory-hybrid",
            runId: options.runId ?? "run-missing",
          });
        },
      },
    );

    expect(receivedRunId).toBe("run-p5-beam-levers-union32-generalization");
    expect(summary.runId).toBe("run-p5-beam-levers-union32-generalization");
    expect(summary.semanticTopK).toBe(32);
  });

  it("combines BM25 additive ranking with provider semantic union", async () => {
    const query = "What helps you relax in the evenings?";
    const lexicalFact = "Quiet music helps you relax in the evenings.";
    const unionFact = "Marco goes fishing at the lake to destress.";
    const scope = { userId: "beam-user", workspaceId: "beam-workspace" };
    const embedding: EmbeddingAdapter = {
      async embed(texts) {
        return texts.map((text) => {
          if (text === query) {
            return [1, 0, 0];
          }
          if (text.includes("music")) {
            return [1, 0, 0];
          }
          if (text.includes("fishing")) {
            return [0.95, 0.05, 0];
          }
          return [0, 1, 0];
        });
      },
    };
    const memory = createGoodMemory({
      adapters: {
        embeddingAdapter: embedding,
      },
      retrieval: {
        bm25Ranking: true,
        semanticCandidates: {
          maxAdditions: 1,
          topK: 2,
        },
      },
      storage: { provider: "memory" },
    });

    await memory.remember({
      annotations: [lexicalFact, unionFact].map((_, messageIndex) => ({
        confirmed: true,
        kindHint: "fact" as const,
        messageIndex,
        reason: "test seed",
        remember: "always" as const,
        verified: true,
      })),
      extractionStrategy: "rules-only",
      messages: [
        { content: lexicalFact, role: "user" },
        { content: unionFact, role: "user" },
      ],
      scope,
    });

    const result = await memory.recall({
      scope,
      query,
      strategy: "hybrid",
    });
    const lexicalTrace = result.metadata.candidateTraces.find((trace) =>
      trace.memoryType === "fact" &&
      trace.returned &&
      trace.lexicalScore > 0,
    );
    const unionTrace = result.metadata.candidateTraces.find(
      (trace) => trace.fallback === "semantic_union" && trace.returned,
    );

    expect(result.facts.map((fact) => fact.content)).toContain(lexicalFact);
    expect(result.facts.map((fact) => fact.content)).toContain(unionFact);
    expect(lexicalTrace?.semanticScore).toBeGreaterThan(0);
    expect(unionTrace?.semanticScore).toBeUndefined();
  });

  it("does not call provider semantic search for BM25-only hybrid ranking", async () => {
    const query = "Which migration blocker affects Orion?";
    const fact = "Orion migration blocker is the pending rollback plan.";
    const scope = { userId: "beam-user", workspaceId: "beam-workspace" };
    const embedding: EmbeddingAdapter = {
      async embed(texts) {
        if (texts.includes(query)) {
          throw new Error("BM25-only recall should not call semantic search");
        }
        return texts.map(() => [0, 1, 0]);
      },
    };
    const memory = createGoodMemory({
      adapters: {
        embeddingAdapter: embedding,
      },
      retrieval: {
        bm25Ranking: true,
      },
      storage: { provider: "memory" },
    });

    await memory.remember({
      annotations: [
        {
          confirmed: true,
          kindHint: "fact" as const,
          messageIndex: 0,
          reason: "test seed",
          remember: "always" as const,
          verified: true,
        },
      ],
      extractionStrategy: "rules-only",
      messages: [{ content: fact, role: "user" }],
      scope,
    });

    const result = await memory.recall({
      scope,
      query,
      strategy: "hybrid",
    });

    expect(result.facts.map((item) => item.content)).toContain(fact);
  });

  it("clears narrow-gate disables for a fitted keep-gates run", async () => {
    const env: Record<string, string | undefined> = {
      GOODMEMORY_DISABLED_NARROW_GATES: "stale-gate",
      HOME: "/tmp/home",
    };
    let resetCount = 0;
    let receivedDisabledGates: string | undefined;
    const runRecallDiagnostic: BeamGeneralLeverRecallDiagnosticRunner = async (
      options,
    ) => {
      receivedDisabledGates = env.GOODMEMORY_DISABLED_NARROW_GATES;
      return buildReport({
        profile: (options.profiles?.[0] as BeamProfile | undefined) ?? "goodmemory-rules-only",
        runId: options.runId ?? "run-missing",
      });
    };

    const summary = await runBeamGeneralLeverMeasure(
      {
        arm: "floor",
        keepGates: true,
        semanticTopK: 16,
      },
      {
        env,
        log: () => {},
        resetNarrowGateDisables: () => {
          resetCount += 1;
        },
        runRecallDiagnostic,
      },
    );

    expect(receivedDisabledGates).toBeUndefined();
    expect(env.GOODMEMORY_DISABLED_NARROW_GATES).toBe("stale-gate");
    expect(resetCount).toBe(2);
    expect(summary.gatesDisabled).toBe(false);
    expect(summary.profile).toBe("goodmemory-rules-only");
    expect(summary.runId).toBe("run-p5-beam-levers-floor-fitted");
  });

  it("restores narrow-gate disables when the diagnostic fails", async () => {
    const env: Record<string, string | undefined> = {
      GOODMEMORY_DISABLED_NARROW_GATES: "preexisting-gate",
      HOME: "/tmp/home",
    };
    let resetCount = 0;

    await expect(
      runBeamGeneralLeverMeasure(
        {
          arm: "bm25",
          keepGates: false,
          semanticTopK: 16,
        },
        {
          env,
          listNarrowGateIds: () => ["gate-a"],
          log: () => {},
          resetNarrowGateDisables: () => {
            resetCount += 1;
          },
          runRecallDiagnostic: async () => {
            throw new Error("diagnostic failed");
          },
        },
      ),
    ).rejects.toThrow("diagnostic failed");

    expect(env.GOODMEMORY_DISABLED_NARROW_GATES).toBe("preexisting-gate");
    expect(resetCount).toBe(2);
  });

  it("runs the floor arm without assisted extractor env dependencies", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "gm-beam-general-levers-"));
    const benchmarkRoot = join(tempRoot, "beam-root");
    const outputDir = join(tempRoot, "out");
    const savedAssistedEnv = {
      apiKey: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY,
      baseUrl: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL,
      model: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL,
      provider: process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER,
    };

    try {
      await mkdir(benchmarkRoot, { recursive: true });
      await cp(
        join(
          import.meta.dir,
          "../../fixtures/external-benchmarks/beam/beam_100k_smoke.json",
        ),
        join(benchmarkRoot, "100K.json"),
      );
      process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY = "present-but-partial";
      delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL;
      delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL;
      delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER;

      const summary = await runBeamGeneralLeverMeasure(
        {
          arm: "floor",
          benchmarkRoot,
          keepGates: false,
          limit: 1,
          outputDir,
          runId: "run-floor-env-isolated",
          semanticTopK: 16,
        },
        {
          env: process.env,
          listNarrowGateIds: () => ["gate-a"],
          log: () => {},
        },
      );

      expect(summary).toMatchObject({
        arm: "floor",
        gatesDisabled: true,
        profile: "goodmemory-rules-only",
        runId: "run-floor-env-isolated",
        semanticTopK: null,
      });
      expect(summary.summary?.totalCases).toBe(1);
      expect(summary.summary?.evidenceChatRecall).toBe(1);
    } finally {
      if (savedAssistedEnv.apiKey === undefined) {
        delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY;
      } else {
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY =
          savedAssistedEnv.apiKey;
      }
      if (savedAssistedEnv.baseUrl === undefined) {
        delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL;
      } else {
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL =
          savedAssistedEnv.baseUrl;
      }
      if (savedAssistedEnv.model === undefined) {
        delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL;
      } else {
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL = savedAssistedEnv.model;
      }
      if (savedAssistedEnv.provider === undefined) {
        delete process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER;
      } else {
        process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER =
          savedAssistedEnv.provider;
      }
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
