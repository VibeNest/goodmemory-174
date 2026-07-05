import { describe, expect, it } from "bun:test";
import { parseLocomoLeversCliOptions } from "../../scripts/measure-locomo-levers";

describe("LoCoMo lever measurement CLI", () => {
  it("parses lever-measurement scope with strict limit and arm validation", () => {
    expect(
      parseLocomoLeversCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-levers.ts",
        "--benchmark-root",
        "/tmp/LOCOMO-full",
        "--output-dir",
        "/tmp/out",
        "--live",
        "--limit",
        "15",
        "--arms",
        "jaccard-baseline, bm25+decompose",
      ]),
    ).toEqual({
      armLabels: ["jaccard-baseline", "bm25+decompose"],
      benchmarkRoot: "/tmp/LOCOMO-full",
      limit: 15,
      live: true,
      outputDir: "/tmp/out",
    });

    expect(() =>
      parseLocomoLeversCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-levers.ts",
        "--live",
        "--live",
      ]),
    ).toThrow("--live cannot be specified more than once.");

    expect(() =>
      parseLocomoLeversCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-levers.ts",
        "--limit",
        "1e2",
      ]),
    ).toThrow("--limit must be a positive integer.");

    expect(() =>
      parseLocomoLeversCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-levers.ts",
        "--limit",
        "--live",
      ]),
    ).toThrow("--limit requires a value.");

    expect(() =>
      parseLocomoLeversCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-levers.ts",
        "--arms",
        "bm25+decompose,missing-arm",
      ]),
    ).toThrow("--arms contains unknown arm 'missing-arm'.");

    expect(() =>
      parseLocomoLeversCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-levers.ts",
        "--arms",
        "bm25,bm25",
      ]),
    ).toThrow("--arms contains duplicate arm 'bm25'.");

    expect(() =>
      parseLocomoLeversCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-levers.ts",
        "--arms",
        "--limit",
        "1",
      ]),
    ).toThrow("--arms requires a value.");
  });

  it("rejects missing string flag values before falling back to defaults", () => {
    expect(() =>
      parseLocomoLeversCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-levers.ts",
        "--benchmark-root",
        "--output-dir",
        "/tmp/out",
      ]),
    ).toThrow("--benchmark-root requires a value.");

    expect(() =>
      parseLocomoLeversCliOptions([
        "bun",
        "run",
        "scripts/measure-locomo-levers.ts",
        "--output-dir",
        "--live",
      ]),
    ).toThrow("--output-dir requires a value.");
  });
});
