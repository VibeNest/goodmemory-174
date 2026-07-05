import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { parseLocomoUnionLiveCliOptions } from "../../scripts/measure-locomo-union-live";

describe("LoCoMo union live measurement", () => {
  it("parses live union scope and budget flags with strict numeric validation", () => {
    expect(
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--benchmark-root",
          "/tmp/LOCOMO-full",
          "--union-topk",
          "32",
          "--max-additions",
          "0",
          "--min-similarity",
          "0.8",
          "--limit",
          "12",
          "--concurrency",
          "2",
          "--output-dir",
          "/tmp/out",
          "--run-id",
          "union-live",
          "--resume",
          "--with-extraction",
          "--no-memory",
        ],
        "/repo",
      ),
    ).toEqual({
      benchmarkRoot: "/tmp/LOCOMO-full",
      concurrency: 2,
      limit: 12,
      maxAdditions: 0,
      minSimilarity: 0.8,
      noMemory: true,
      outputDir: "/tmp/out",
      resume: true,
      runId: "union-live",
      topK: 32,
      withExtraction: true,
    });

    expect(
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
        ],
        "/repo",
      ),
    ).toMatchObject({
      concurrency: 1,
      outputDir: join(
        "/repo",
        "reports",
        "eval",
        "research",
        "phase-65",
        "locomo",
      ),
      runId: "run-locomo-union16-live",
      topK: 16,
    });

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--resume",
          "--resume",
        ],
        "/repo",
      ),
    ).toThrow("--resume cannot be specified more than once.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--with-extraction",
          "--with-extraction",
        ],
        "/repo",
      ),
    ).toThrow("--with-extraction cannot be specified more than once.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--union-topk",
          "1e2",
        ],
        "/repo",
      ),
    ).toThrow("--union-topk must be a positive integer.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--max-additions",
          "1.5",
        ],
        "/repo",
      ),
    ).toThrow("--max-additions must be a non-negative integer.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--min-similarity",
          "8e-1",
        ],
        "/repo",
      ),
    ).toThrow("--min-similarity must be a non-negative number.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--concurrency",
          "0",
        ],
        "/repo",
      ),
    ).toThrow("--concurrency must be a positive integer.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--limit",
          "--resume",
        ],
        "/repo",
      ),
    ).toThrow("--limit requires a value.");
  });

  it("rejects missing string flag values before falling back to defaults", () => {
    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--benchmark-root",
          "--union-topk",
          "16",
        ],
        "/repo",
      ),
    ).toThrow("--benchmark-root requires a value.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--output-dir",
          "--run-id",
          "union-live",
        ],
        "/repo",
      ),
    ).toThrow("--output-dir requires a value.");

    expect(() =>
      parseLocomoUnionLiveCliOptions(
        [
          "bun",
          "run",
          "scripts/measure-locomo-union-live.ts",
          "--run-id",
          "--resume",
        ],
        "/repo",
      ),
    ).toThrow("--run-id requires a value.");
  });
});
