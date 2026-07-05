import { describe, expect, it } from "bun:test";
import { parseLocomoNeuralCliOptions } from "../../scripts/measure-locomo-neural";

describe("LoCoMo neural measurement CLI", () => {
  it("parses retrieval-measurement scope with strict limit and arm validation", () => {
    expect(
      parseLocomoNeuralCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-neural.ts",
        "--benchmark-root",
        "/tmp/LOCOMO-full",
        "--limit",
        "20",
        "--arms",
        "bm25, neural(text-embedding-3-small)",
      ]),
    ).toEqual({
      armLabels: ["bm25", "neural(text-embedding-3-small)"],
      benchmarkRoot: "/tmp/LOCOMO-full",
      limit: 20,
    });

    expect(() =>
      parseLocomoNeuralCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-neural.ts",
        "--limit",
        "1e2",
      ]),
    ).toThrow("--limit must be a positive integer.");

    expect(() =>
      parseLocomoNeuralCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-neural.ts",
        "--limit",
        "--arms",
        "bm25",
      ]),
    ).toThrow("--limit requires a value.");

    expect(() =>
      parseLocomoNeuralCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-neural.ts",
        "--arms",
        "bm25,unsupported",
      ]),
    ).toThrow("--arms contains unknown arm 'unsupported'.");

    expect(() =>
      parseLocomoNeuralCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-neural.ts",
        "--arms",
        "bm25,bm25",
      ]),
    ).toThrow("--arms contains duplicate arm 'bm25'.");

    expect(() =>
      parseLocomoNeuralCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-neural.ts",
        "--arms",
        "bm25",
        "--arms",
        "neural(text-embedding-3-small)",
      ]),
    ).toThrow("--arms cannot be specified more than once.");

    expect(() =>
      parseLocomoNeuralCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-neural.ts",
        "--arms",
        "--limit",
        "1",
      ]),
    ).toThrow("--arms requires a value.");
  });

  it("rejects missing benchmark-root before falling back to the environment", () => {
    expect(() =>
      parseLocomoNeuralCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-neural.ts",
        "--benchmark-root",
        "--limit",
        "20",
      ]),
    ).toThrow("--benchmark-root requires a value.");
  });
});
