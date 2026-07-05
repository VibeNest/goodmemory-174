import { describe, expect, it } from "bun:test";
import {
  buildEmbeddingFreeComparisonRow,
  EMBEDDING_FREE_COMPARISON_ARMS,
  parseEmbeddingFreeComparisonCliOptions,
  renderEmbeddingFreeComparison,
  runEmbeddingFreeComparison,
} from "../../scripts/run-phase-65-locomo-embedding-free-comparison";
import {
  overallLocomoEvidenceRecall,
  type LocomoQuestionRetrieval,
  type LocomoSmokeReport,
} from "../../scripts/run-phase-65-locomo-smoke";

describe("embedding-free LoCoMo comparison runner", () => {
  it("defines the deterministic arms in increasing-capability order", () => {
    expect(EMBEDDING_FREE_COMPARISON_ARMS.map((arm) => arm.label)).toEqual([
      "jaccard-rules-only",
      "bm25",
      "bm25+decompose+nhop+rerank",
    ]);
    expect(EMBEDDING_FREE_COMPARISON_ARMS[0]?.options).toEqual({});
    expect(EMBEDDING_FREE_COMPARISON_ARMS[1]?.options).toEqual({ bm25: true });
    expect(EMBEDDING_FREE_COMPARISON_ARMS[2]?.options).toEqual({
      bm25: true,
      decompose: true,
      multiHop: true,
      rerank: true,
    });
  });

  it("computes question-weighted overall evidence recall", () => {
    expect(overallLocomoEvidenceRecall([])).toBe(0);
    expect(
      overallLocomoEvidenceRecall([
        { evidenceRecall: 1 } as LocomoQuestionRetrieval,
        { evidenceRecall: 0 } as LocomoQuestionRetrieval,
        { evidenceRecall: 0.5 } as LocomoQuestionRetrieval,
      ]),
    ).toBeCloseTo(0.5, 5);
  });

  it("builds a comparison row from a report and renders a markdown table", () => {
    const report = {
      cases: [
        { evidenceRecall: 0.4 } as LocomoQuestionRetrieval,
        { evidenceRecall: 0.6 } as LocomoQuestionRetrieval,
      ],
      executionFailures: 0,
      questionCount: 2,
    } as LocomoSmokeReport;
    const row = buildEmbeddingFreeComparisonRow("bm25", report);
    expect(row.overallEvidenceRecall).toBeCloseTo(0.5, 5);

    const md = renderEmbeddingFreeComparison([
      {
        label: "bm25",
        overallEvidenceRecall: 0.352,
        executionFailures: 0,
        questionCount: 120,
      },
    ]);
    expect(md).toContain("| bm25 | 35.2% | 0 | 120 |");
  });

  it("parses comparison CLI scope with strict positive limit validation", () => {
    expect(
      parseEmbeddingFreeComparisonCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        "--benchmark-root",
        "/tmp/LOCOMO",
        "--output-dir",
        "/tmp/out",
        "--limit",
        "10",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/LOCOMO",
      limit: 10,
      outputDir: "/tmp/out",
    });

    expect(() =>
      parseEmbeddingFreeComparisonCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        "--limit",
        "10x",
      ]),
    ).toThrow("--limit must be a positive integer.");

    expect(() =>
      parseEmbeddingFreeComparisonCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        "--limit",
        "1e2",
      ]),
    ).toThrow("--limit must be a positive integer.");

    expect(() =>
      parseEmbeddingFreeComparisonCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        "--limit",
      ]),
    ).toThrow("--limit requires a value.");

    expect(() =>
      parseEmbeddingFreeComparisonCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        "--limit",
        "--output-dir",
        "/tmp/out",
      ]),
    ).toThrow("--limit requires a value.");
  });

  it("rejects missing string flag values before falling back to defaults", () => {
    expect(() =>
      parseEmbeddingFreeComparisonCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        "--benchmark-root",
        "--output-dir",
        "/tmp/out",
      ]),
    ).toThrow("--benchmark-root requires a value.");

    expect(() =>
      parseEmbeddingFreeComparisonCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        "--output-dir",
        "--limit",
        "10",
      ]),
    ).toThrow("--output-dir requires a value.");
  });

  it("rejects empty or whitespace-padded LoCoMo root environment values", () => {
    const original = process.env.GOODMEMORY_LOCOMO_ROOT;
    try {
      process.env.GOODMEMORY_LOCOMO_ROOT = "/tmp/LOCOMO-env";
      expect(
        parseEmbeddingFreeComparisonCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        ]).benchmarkRoot,
      ).toBe("/tmp/LOCOMO-env");

      expect(
        parseEmbeddingFreeComparisonCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
          "--benchmark-root",
          "/tmp/LOCOMO-cli",
        ]).benchmarkRoot,
      ).toBe("/tmp/LOCOMO-cli");

      process.env.GOODMEMORY_LOCOMO_ROOT = " /tmp/LOCOMO-env ";
      expect(() =>
        parseEmbeddingFreeComparisonCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        ]),
      ).toThrow("GOODMEMORY_LOCOMO_ROOT cannot be empty or whitespace-padded.");

      process.env.GOODMEMORY_LOCOMO_ROOT = "";
      expect(() =>
        parseEmbeddingFreeComparisonCliOptions([
          "bun",
          "run",
          "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        ]),
      ).toThrow("GOODMEMORY_LOCOMO_ROOT cannot be empty or whitespace-padded.");
    } finally {
      if (original === undefined) {
        delete process.env.GOODMEMORY_LOCOMO_ROOT;
      } else {
        process.env.GOODMEMORY_LOCOMO_ROOT = original;
      }
    }
  });

  it("rejects output directories that resolve to the benchmark root before running arms", async () => {
    expect(() =>
      parseEmbeddingFreeComparisonCliOptions([
        "bun",
        "run",
        "scripts/run-phase-65-locomo-embedding-free-comparison.ts",
        "--benchmark-root",
        "/tmp/LOCOMO",
        "--output-dir",
        "/tmp/LOCOMO",
      ]),
    ).toThrow(
      "--benchmark-root and --output-dir must refer to different paths",
    );

    await expect(
      runEmbeddingFreeComparison(
        {
          benchmarkRoot: "/tmp/LOCOMO",
          outputDir: "/tmp/LOCOMO",
        },
        {
          readFile: async () => {
            throw new Error("should not read benchmark root");
          },
        },
      ),
    ).rejects.toThrow(
      "--benchmark-root and --output-dir must refer to different paths",
    );
  });

  it("runs every deterministic arm on the synthetic smoke (gateway-free, in-memory)", async () => {
    const rows = await runEmbeddingFreeComparison(
      { outputDir: "/tmp/locomo-ef" },
      {
        mkdir: async () => undefined,
        writeFile: (async () => undefined) as never,
      },
    );
    expect(rows.map((row) => row.label)).toEqual([
      "jaccard-rules-only",
      "bm25",
      "bm25+decompose+nhop+rerank",
    ]);
    for (const row of rows) {
      expect(row.executionFailures).toBe(0);
      expect(row.questionCount).toBeGreaterThan(0);
    }
  });
});
