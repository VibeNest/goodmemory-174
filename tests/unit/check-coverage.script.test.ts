import { describe, expect, it } from "bun:test";
import {
  GROUPS,
  evaluateCoverage,
  parseLcov,
  resolveOverallRecords,
} from "../../scripts/check-coverage";

function buildCoverageRecords(
  overrides: Record<string, { found: number; covered: number }> = {},
) {
  const root = process.cwd();
  const defaults: Record<string, { found: number; covered: number }> = {
    "src/domain/example.ts": { found: 10, covered: 10 },
    "src/remember/example.ts": { found: 10, covered: 10 },
    "src/recall/example.ts": { found: 10, covered: 10 },
    "src/runtime/example.ts": { found: 10, covered: 10 },
    "src/maintenance/example.ts": { found: 10, covered: 10 },
    "src/verify/example.ts": { found: 10, covered: 10 },
    "src/storage/example.ts": { found: 10, covered: 10 },
    "src/eval/example.ts": { found: 10, covered: 10 },
    "src/provider/example.ts": { found: 10, covered: 10 },
    "scripts/run-eval.ts": { found: 20, covered: 19 },
    "scripts/summarize-eval.ts": { found: 31, covered: 25 },
  };

  return parseLcov(
    Object.entries({ ...defaults, ...overrides })
      .flatMap(([path, counts]) => [
        `SF:${root}/${path}`,
        `LF:${counts.found}`,
        `LH:${counts.covered}`,
      ])
      .join("\n"),
  );
}

describe("check-coverage script", () => {
  it("includes summarize-eval in group gates and overall coverage", () => {
    const records = buildCoverageRecords();

    expect(GROUPS.some((group) => group.name === "scripts/summarize-eval.ts")).toBe(true);
    expect(resolveOverallRecords(records).slice(0, 3).map((record) => record.path)).toEqual([
      "src/domain/example.ts",
      "src/remember/example.ts",
      "src/recall/example.ts",
    ]);
    expect(resolveOverallRecords(records).slice(-2).map((record) => record.path)).toEqual([
      "scripts/run-eval.ts",
      "scripts/summarize-eval.ts",
    ]);

    const result = evaluateCoverage(records);
    expect(
      result.groups.find((group) => group.name === "scripts/summarize-eval.ts")?.percent,
    ).toBeCloseTo(80.65, 2);
    expect(result.failures).toEqual([]);
  });

  it("fails when summarize-eval coverage drops below the threshold", () => {
    const records = buildCoverageRecords({
      "scripts/run-eval.ts": { found: 20, covered: 20 },
      "scripts/summarize-eval.ts": { found: 10, covered: 7 },
    });

    const result = evaluateCoverage(records);
    expect(result.failures).toContain("scripts/summarize-eval.ts line coverage 70.00% < 80.00%");
  });
});
