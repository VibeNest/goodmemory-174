import { describe, expect, it } from "bun:test";
import {
  type BenchmarkClaimReport,
  buildClaimGateReport,
  checkReadmeClaimTables,
  collectClaimNotes,
  evaluateClaimBoundary,
  extractPublicClaimsTableRows,
  parsePublicBenchmarkClaimGateCliOptions,
  README_CLAIMS_TABLE_END,
  README_CLAIMS_TABLE_START,
  validateClaimReport,
} from "../../scripts/run-public-benchmark-claim-gate";

function cleanReport(overrides: Partial<BenchmarkClaimReport> = {}): BenchmarkClaimReport {
  return {
    benchmark: "Example",
    claimBoundary: { publicClaimAllowed: true, reason: "all rules satisfied" },
    coverage: { complete: true },
    dataset: { license: "MIT", source: "https://example.com/bench", vendored: false },
    metrics: { baseline: 0.5, primary: "accuracy", score: 0.8 },
    model: { answerModel: "model-a", judgeModel: null, sameModelJudge: false },
    run: { command: "eval:example", commit: "abc1234", executionFailures: 0, packageVersion: "0.3.5" },
    status: "candidate_public_claim",
    ...overrides,
  };
}

describe("claim boundary rule engine", () => {
  it("allows a public claim only when no rule fires", () => {
    const verdict = evaluateClaimBoundary(cleanReport());
    expect(verdict.publicClaimAllowed).toBe(true);
    expect(verdict.blockers).toEqual([]);
  });

  it("blocks a same-model judge", () => {
    const verdict = evaluateClaimBoundary(
      cleanReport({ model: { answerModel: "gpt-5.5", judgeModel: "gpt-5.5", sameModelJudge: true } }),
    );
    expect(verdict.publicClaimAllowed).toBe(false);
    expect(verdict.blockers.join(" ")).toContain("same-model judge");
  });

  it("blocks on execution failures, missing baseline, broken provenance, and incomplete coverage", () => {
    expect(
      evaluateClaimBoundary(cleanReport({ run: { ...cleanReport().run, executionFailures: 1 } }))
        .publicClaimAllowed,
    ).toBe(false);
    expect(
      evaluateClaimBoundary(cleanReport({ metrics: { baseline: null, primary: "accuracy", score: 0.8 } }))
        .publicClaimAllowed,
    ).toBe(false);
    expect(
      evaluateClaimBoundary(cleanReport({ dataset: { license: null, source: "x", vendored: false } }))
        .publicClaimAllowed,
    ).toBe(false);
    expect(
      evaluateClaimBoundary(cleanReport({ coverage: { complete: false, note: "TTL/LRU unfinished" } }))
        .publicClaimAllowed,
    ).toBe(false);
  });
});

describe("claim report schema validation", () => {
  it("accepts a well-formed report and rejects a malformed one", () => {
    expect(validateClaimReport(cleanReport()).valid).toBe(true);
    const bad = validateClaimReport({ benchmark: "X" });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});

describe("claim gate report", () => {
  it("rejects duplicate CLI mode and source flags before claim evaluation", () => {
    expect(() =>
      parsePublicBenchmarkClaimGateCliOptions([
        "bun",
        "run",
        "scripts/run-public-benchmark-claim-gate.ts",
        "--strict",
        "--strict",
      ]),
    ).toThrow("--strict cannot be specified more than once.");

    expect(() =>
      parsePublicBenchmarkClaimGateCliOptions([
        "bun",
        "run",
        "scripts/run-public-benchmark-claim-gate.ts",
        "--claims-dir",
        "/tmp/claims-a",
        "--claims-dir",
        "/tmp/claims-b",
      ]),
    ).toThrow("--claims-dir cannot be specified more than once.");
  });

  it("flags over-claiming (declared public when rules forbid)", () => {
    const overClaim = cleanReport({
      benchmark: "OverClaimer",
      model: { answerModel: "gpt-5.5", judgeModel: "gpt-5.5", sameModelJudge: true },
      claimBoundary: { publicClaimAllowed: true, reason: "wishful" },
    });
    const report = buildClaimGateReport([{ file: "over.json", value: overClaim }], "2026-06-24T00:00:00Z");
    expect(report.summary.overClaiming).toBe(1);
    expect(report.entries[0]?.consistent).toBe(false);
    expect(report.allConsistent).toBe(false);
    expect(report.publicClaimable).toEqual([]);
  });

  it("treats an honest blocked declaration as consistent and lists a clean one as claimable", () => {
    const blockedHonest = cleanReport({
      benchmark: "HonestBlocked",
      model: { answerModel: "gpt-5.5", judgeModel: "gpt-5.5", sameModelJudge: true },
      claimBoundary: { publicClaimAllowed: false, reason: "same-model judge" },
    });
    const clean = cleanReport({ benchmark: "Clean" });
    const report = buildClaimGateReport(
      [
        { file: "blocked.json", value: blockedHonest },
        { file: "clean.json", value: clean },
      ],
      "2026-06-24T00:00:00Z",
    );
    expect(report.allConsistent).toBe(true);
    expect(report.summary.overClaiming).toBe(0);
    expect(report.publicClaimable).toEqual(["Clean"]);
  });

  it("marks a schema-invalid declaration inconsistent", () => {
    const report = buildClaimGateReport([{ file: "broken.json", value: { benchmark: "Broken" } }], "t");
    expect(report.entries[0]?.schemaErrors.length).toBeGreaterThan(0);
    expect(report.allConsistent).toBe(false);
  });

  it("blocks a vendored dataset", () => {
    const verdict = evaluateClaimBoundary(
      cleanReport({ dataset: { license: "MIT", source: "https://example.com", vendored: true } }),
    );
    expect(verdict.publicClaimAllowed).toBe(false);
    expect(verdict.blockers.join(" ")).toContain("vendored");
  });

  it("notes a non-commercial license without blocking it", () => {
    const nc = cleanReport({
      dataset: { license: "CC BY-NC 4.0", source: "https://example.com", vendored: false },
    });
    expect(evaluateClaimBoundary(nc).publicClaimAllowed).toBe(true);
    expect(collectClaimNotes(nc).join(" ")).toContain("non-commercial");
    expect(collectClaimNotes(cleanReport())).toEqual([]);
  });
});

function readmeWithRows(rows: string[]): string {
  return [
    "# Title",
    "",
    README_CLAIMS_TABLE_START,
    "| Benchmark | Result | Claim declaration |",
    "|---|---:|---|",
    ...rows,
    README_CLAIMS_TABLE_END,
    "",
  ].join("\n");
}

describe("README public-claims table check", () => {
  it("extracts rows between the markers, skipping header and separator", () => {
    const parsed = extractPublicClaimsTableRows(
      readmeWithRows([
        "| LongMemEval full 500 | **0.720** | [x](./benchmark-claims/longmemeval.json) |",
        "| MemoryAgentBench (CR, TTL) | **CR 0.959** | [x](./benchmark-claims/memoryagentbench.json) |",
      ]),
    );
    expect(parsed.markersFound).toBe(true);
    expect(parsed.rows).toEqual(["LongMemEval full 500", "MemoryAgentBench (CR, TTL)"]);
  });

  it("reports missing markers", () => {
    expect(extractPublicClaimsTableRows("# no table here").markersFound).toBe(false);
  });

  it("passes when public rows map to claimable declarations and flags forbidden/unknown rows", () => {
    const entries = buildClaimGateReport(
      [
        { file: "clean.json", value: cleanReport({ benchmark: "LongMemEval" }) },
        {
          file: "blocked.json",
          value: cleanReport({
            benchmark: "BEAM",
            model: { answerModel: "gpt-5.5", judgeModel: "gpt-5.5", sameModelJudge: true },
            claimBoundary: { publicClaimAllowed: false, reason: "same-model judge" },
          }),
        },
      ],
      "t",
    ).entries;

    const ok = checkReadmeClaimTables(
      [{ content: readmeWithRows(["| LongMemEval full 500 | x | y |"]), file: "README.md" }],
      entries,
    )[0];
    expect(ok?.consistent).toBe(true);

    const forbidden = checkReadmeClaimTables(
      [{ content: readmeWithRows(["| BEAM (100K) | x | y |"]), file: "README.md" }],
      entries,
    )[0];
    expect(forbidden?.consistent).toBe(false);
    expect(forbidden?.forbiddenRows).toEqual(["BEAM (100K)"]);

    const unknown = checkReadmeClaimTables(
      [{ content: readmeWithRows(["| MysteryBench | x | y |"]), file: "README.md" }],
      entries,
    )[0];
    expect(unknown?.consistent).toBe(false);
    expect(unknown?.unmatchedRows).toEqual(["MysteryBench"]);

    const missingMarkers = checkReadmeClaimTables(
      [{ content: "# stripped", file: "README.zh-CN.md" }],
      entries,
    )[0];
    expect(missingMarkers?.consistent).toBe(false);
  });

  it("treats a claimable benchmark missing from the table as info, not failure", () => {
    const entries = buildClaimGateReport(
      [{ file: "clean.json", value: cleanReport({ benchmark: "LongMemEval" }) }],
      "t",
    ).entries;
    const check = checkReadmeClaimTables(
      [{ content: readmeWithRows([]), file: "README.md" }],
      entries,
    )[0];
    expect(check?.consistent).toBe(true);
    expect(check?.missingClaimableBenchmarks).toEqual(["LongMemEval"]);
  });

  it("feeds readme consistency into the gate report", () => {
    const declarations = [{ file: "clean.json", value: cleanReport({ benchmark: "LongMemEval" }) }];
    const good = buildClaimGateReport(declarations, "t", [
      { content: readmeWithRows(["| LongMemEval full 500 | x | y |"]), file: "README.md" },
    ]);
    expect(good.readmeConsistent).toBe(true);
    const bad = buildClaimGateReport(declarations, "t", [
      { content: "# no markers", file: "README.md" },
    ]);
    expect(bad.readmeConsistent).toBe(false);
  });
});
