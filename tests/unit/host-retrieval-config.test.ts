import { describe, expect, it } from "bun:test";
import { parseInstalledHostRuntimeConfig } from "../../src/install/hostConfigValidation";

// The retrieval section is how installed hosts reach the measured quality
// levers (BM25 hybrid, semantic candidate union, the recommended preset).
// Absence must stay byte-identical to today's rules-only behavior.

function baseConfig(retrieval?: unknown): Record<string, unknown> {
  return {
    host: "claude",
    ...(retrieval !== undefined ? { retrieval } : {}),
    storage: {
      path: "/tmp/goodmemory.sqlite",
      provider: "sqlite",
    },
    userId: "user-1",
    version: 1,
  };
}

describe("installed host retrieval config", () => {
  it("omits the retrieval field entirely when absent", () => {
    const parsed = parseInstalledHostRuntimeConfig(baseConfig(), "claude");

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect("retrieval" in parsed.config).toBe(false);
  });

  it("round-trips bm25Ranking and rejects non-boolean values", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      baseConfig({ bm25Ranking: true }),
      "claude",
    );
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect(parsed.config.retrieval).toEqual({ bm25Ranking: true });

    expect(
      parseInstalledHostRuntimeConfig(baseConfig({ bm25Ranking: "yes" }), "claude"),
    ).toEqual({
      detail: "retrieval.bm25Ranking must be a boolean",
      status: "invalid",
    });

    expect(
      parseInstalledHostRuntimeConfig(baseConfig("hybrid"), "claude"),
    ).toEqual({
      detail: "retrieval must be a JSON object",
      status: "invalid",
    });
  });

  it("validates semanticCandidates fields one by one", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      baseConfig({
        semanticCandidates: {
          maxAdditions: 8,
          minRelativeScore: 0.4,
          minSimilarity: 0.25,
          topK: 16,
        },
      }),
      "claude",
    );
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect(parsed.config.retrieval).toEqual({
      semanticCandidates: {
        maxAdditions: 8,
        minRelativeScore: 0.4,
        minSimilarity: 0.25,
        topK: 16,
      },
    });

    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ semanticCandidates: { topK: 0 } }),
        "claude",
      ),
    ).toEqual({
      detail: "retrieval.semanticCandidates.topK must be a positive integer",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ semanticCandidates: { topK: 16.5 } }),
        "claude",
      ),
    ).toEqual({
      detail: "retrieval.semanticCandidates.topK must be a positive integer",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ semanticCandidates: { maxAdditions: -1 } }),
        "claude",
      ),
    ).toEqual({
      detail:
        "retrieval.semanticCandidates.maxAdditions must be a positive integer",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ semanticCandidates: { maxAdditions: 4.5 } }),
        "claude",
      ),
    ).toEqual({
      detail:
        "retrieval.semanticCandidates.maxAdditions must be a positive integer",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ semanticCandidates: { minSimilarity: 1.5 } }),
        "claude",
      ),
    ).toEqual({
      detail:
        "retrieval.semanticCandidates.minSimilarity must be a number between 0 and 1",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ semanticCandidates: { minRelativeScore: "high" } }),
        "claude",
      ),
    ).toEqual({
      detail:
        "retrieval.semanticCandidates.minRelativeScore must be a number between 0 and 1",
      status: "invalid",
    });
    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ semanticCandidates: "on" }),
        "claude",
      ),
    ).toEqual({
      detail: "retrieval.semanticCandidates must be a JSON object",
      status: "invalid",
    });
  });

  it("accepts the recommended preset and rejects unknown presets", () => {
    const parsed = parseInstalledHostRuntimeConfig(
      baseConfig({ preset: "recommended" }),
      "claude",
    );
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }
    expect(parsed.config.retrieval).toEqual({ preset: "recommended" });

    expect(
      parseInstalledHostRuntimeConfig(
        baseConfig({ preset: "champion" }),
        "claude",
      ),
    ).toEqual({
      detail: "retrieval.preset must be recommended",
      status: "invalid",
    });
  });
});
