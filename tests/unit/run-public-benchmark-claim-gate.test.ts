import { describe, expect, it } from "bun:test";
import {
  type BenchmarkClaimReport,
  buildClaimGateReport,
  checkClaimEvidenceArtifacts,
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
    evidence: {
      artifacts: [
        {
          assertions: [{ equals: true, path: ["ok"] }],
          description: "example report",
          path: "reports/example-report.json",
        },
      ],
    },
    metrics: { baseline: 0.5, primary: "accuracy", score: 0.8 },
    model: { answerModel: "model-a", judgeModel: null, sameModelJudge: false },
    publicClaim: {
      readmeDisclosureFragments: ["disclosed"],
      readmeRequiredFragments: ["x"],
    },
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
    expect(
      evaluateClaimBoundary(cleanReport({ evidence: { artifacts: [] } })).publicClaimAllowed,
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

  it("rejects malformed typed declaration fields before rule evaluation", () => {
    const malformed = validateClaimReport({
      ...cleanReport(),
      coverage: { complete: "true", note: " full coverage " },
      dataset: { license: " MIT", source: "", vendored: "false" },
      metrics: { baseline: "0.5", primary: " accuracy ", score: Number.NaN },
      model: { answerModel: "", judgeModel: " gpt-judge ", sameModelJudge: "false" },
      run: { command: "", commit: " abc1234", executionFailures: 1.5, packageVersion: null },
    });
    expect(malformed.valid).toBe(false);
    expect(malformed.errors).toContain("coverage.complete must be a boolean");
    expect(malformed.errors).toContain(
      "coverage.note must be a non-empty unpadded string when present",
    );
    expect(malformed.errors).toContain("dataset.source must be a non-empty unpadded string");
    expect(malformed.errors).toContain("dataset.license must be a non-empty unpadded string");
    expect(malformed.errors).toContain("dataset.vendored must be a boolean");
    expect(malformed.errors).toContain("run.command must be a non-empty unpadded string");
    expect(malformed.errors).toContain("run.commit must be a non-empty unpadded string");
    expect(malformed.errors).toContain(
      "run.executionFailures must be a non-negative safe integer",
    );
    expect(malformed.errors).toContain("run.packageVersion must be a non-empty unpadded string");
    expect(malformed.errors).toContain("model.answerModel must be a non-empty unpadded string");
    expect(malformed.errors).toContain(
      "model.judgeModel must be null or a non-empty unpadded string",
    );
    expect(malformed.errors).toContain("model.sameModelJudge must be a boolean");
    expect(malformed.errors).toContain(
      "metrics.baseline (finite number), primary (non-empty unpadded string), and score (finite number) are required",
    );
  });

  it("requires coverage to be declared explicitly", () => {
    const missingCoverage = validateClaimReport(cleanReport({ coverage: undefined }));
    expect(missingCoverage.valid).toBe(false);
    expect(missingCoverage.errors).toContain("coverage must be an object");
  });

  it("requires public declarations to define README display and disclosure fragments", () => {
    const missingPublicClaim = validateClaimReport(
      cleanReport({
        publicClaim: undefined,
      }),
    );
    expect(missingPublicClaim.valid).toBe(false);
    expect(missingPublicClaim.errors).toContain(
      "publicClaim must be an object for public claim declarations",
    );

    const malformedFragments = validateClaimReport(
      cleanReport({
        publicClaim: {
          readmeDisclosureFragments: ["disclosed", " disclosed ", "disclosed"],
          readmeRequiredFragments: ["0.8", " 0.5 ", "0.8"],
        },
      }),
    );
    expect(malformedFragments.valid).toBe(false);
    expect(malformedFragments.errors).toContain(
      "publicClaim.readmeRequiredFragments[1] must be a non-empty unpadded string",
    );
    expect(malformedFragments.errors).toContain(
      "publicClaim.readmeRequiredFragments[2] duplicates fragment 0.8",
    );
    expect(malformedFragments.errors).toContain(
      "publicClaim.readmeDisclosureFragments[1] must be a non-empty unpadded string",
    );
    expect(malformedFragments.errors).toContain(
      "publicClaim.readmeDisclosureFragments[2] duplicates fragment disclosed",
    );
  });

  it("rejects malformed evidence assertions before artifact checks", () => {
    const malformedEvidence = {
      artifacts: [
        {
          assertions: [
            { equals: 0, path: [] },
            { equals: { nested: true }, path: ["summary"] },
          ],
          description: "bad assertions",
          path: "reports/example-report.json",
        },
      ],
    } as unknown as BenchmarkClaimReport["evidence"];
    const bad = validateClaimReport(
      cleanReport({
        evidence: malformedEvidence,
      }),
    );
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(" ")).toContain("path must be a non-empty array");
    expect(bad.errors.join(" ")).toContain("equals must be a JSON scalar");
  });

  it("requires JSON evidence artifacts to carry assertions", () => {
    const missingAssertions = validateClaimReport(
      cleanReport({
        evidence: {
          artifacts: [{ description: "json without assertions", path: "reports/example.json" }],
        },
      }),
    );
    expect(missingAssertions.valid).toBe(false);
    expect(missingAssertions.errors).toContain(
      "evidence.artifacts[0].assertions must be a non-empty array for JSON artifacts",
    );

    const emptyAssertions = validateClaimReport(
      cleanReport({
        evidence: {
          artifacts: [
            {
              assertions: [],
              description: "json with empty assertions",
              path: "reports/example.json",
            },
          ],
        },
      }),
    );
    expect(emptyAssertions.valid).toBe(false);
    expect(emptyAssertions.errors).toContain(
      "evidence.artifacts[0].assertions must be a non-empty array for JSON artifacts",
    );
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
    const report = buildClaimGateReport(
      [{ file: "overclaimer.json", value: overClaim }],
      "2026-06-24T00:00:00Z",
    );
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
        { file: "honestblocked.json", value: blockedHonest },
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

  it("requires declaration filenames to match benchmark names", () => {
    const report = buildClaimGateReport(
      [{ file: "wrong-file.json", value: cleanReport({ benchmark: "LongMemEval" }) }],
      "t",
    );
    expect(report.entries[0]?.schemaErrors).toEqual([
      "claim declaration filename must be longmemeval.json for benchmark LongMemEval",
    ]);
    expect(report.entries[0]?.consistent).toBe(false);
    expect(report.summary.overClaiming).toBe(1);
    expect(report.publicClaimable).toEqual([]);
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

  it("treats unreadable declared evidence artifacts as claim blockers", () => {
    const report = buildClaimGateReport(
      [{ file: "evidencebacked.json", value: cleanReport({ benchmark: "EvidenceBacked" }) }],
      "t",
      [],
      new Map([
        ["evidencebacked.json", ["evidence artifact reports/missing.json cannot be read"]],
      ]),
    );
    expect(report.entries[0]?.computedPublicClaimAllowed).toBe(false);
    expect(report.entries[0]?.consistent).toBe(false);
    expect(report.entries[0]?.blockers.join(" ")).toContain("evidence artifact");
    expect(report.publicClaimable).toEqual([]);
  });

  it("fails consistency for broken evidence artifacts even when a declaration is already blocked", () => {
    const blocked = cleanReport({
      benchmark: "BlockedWithBrokenEvidence",
      claimBoundary: { publicClaimAllowed: false, reason: "same-model judge" },
      model: { answerModel: "gpt-5.5", judgeModel: "gpt-5.5", sameModelJudge: true },
    });
    const report = buildClaimGateReport(
      [{ file: "blockedwithbrokenevidence.json", value: blocked }],
      "t",
      [],
      new Map([
        [
          "blockedwithbrokenevidence.json",
          ["evidence artifact reports/missing.json cannot be read"],
        ],
      ]),
    );
    expect(report.entries[0]?.computedPublicClaimAllowed).toBe(false);
    expect(report.entries[0]?.consistent).toBe(false);
    expect(report.allConsistent).toBe(false);
  });

  it("checks declared evidence artifact paths without trusting claim prose", async () => {
    const ok = await checkClaimEvidenceArtifacts({
      file: "clean.json",
      readFile: async () => "{\"ok\":true}",
      repoRoot: "/repo",
      report: cleanReport(),
    });
    expect(ok).toEqual([]);

    const unsafe = await checkClaimEvidenceArtifacts({
      file: "unsafe.json",
      readFile: async () => "{\"ok\":true}",
      repoRoot: "/repo",
      report: cleanReport({
        evidence: { artifacts: [{ description: "unsafe", path: "../outside.json" }] },
      }),
    });
    expect(unsafe.join(" ")).toContain("must be a repo-relative path");

    const missing = await checkClaimEvidenceArtifacts({
      file: "missing.json",
      readFile: async () => {
        throw new Error("not found");
      },
      repoRoot: "/repo",
      report: cleanReport(),
    });
    expect(missing.join(" ")).toContain("cannot be read");

    const empty = await checkClaimEvidenceArtifacts({
      file: "empty.json",
      readFile: async () => "   ",
      repoRoot: "/repo",
      report: cleanReport(),
    });
    expect(empty.join(" ")).toContain("is empty");

    const malformedJson = await checkClaimEvidenceArtifacts({
      file: "malformed.json",
      readFile: async () => "{not-json",
      repoRoot: "/repo",
      report: cleanReport(),
    });
    expect(malformedJson.join(" ")).toContain("is not valid JSON");

    const mismatch = await checkClaimEvidenceArtifacts({
      file: "mismatch.json",
      readFile: async () => "{\"summary\":{\"executionFailures\":1}}",
      repoRoot: "/repo",
      report: cleanReport({
        evidence: {
          artifacts: [
            {
              assertions: [{ equals: 0, path: ["summary", "executionFailures"] }],
              description: "example report",
              path: "reports/example-report.json",
            },
          ],
        },
      }),
    });
    expect(mismatch.join(" ")).toContain("expected 0 but found 1");

    const missingPath = await checkClaimEvidenceArtifacts({
      file: "missing-path.json",
      readFile: async () => "{\"summary\":{}}",
      repoRoot: "/repo",
      report: cleanReport({
        evidence: {
          artifacts: [
            {
              assertions: [{ equals: 0, path: ["summary", "executionFailures"] }],
              description: "example report",
              path: "reports/example-report.json",
            },
          ],
        },
      }),
    });
    expect(missingPath.join(" ")).toContain("path summary.executionFailures was not found");
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
    "disclosed",
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
        { file: "longmemeval.json", value: cleanReport({ benchmark: "LongMemEval" }) },
        {
          file: "beam.json",
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
      [
        {
          content: readmeWithRows([
            "| LongMemEval full 500 | x | [longmemeval.json](./benchmark-claims/longmemeval.json) |",
          ]),
          file: "README.md",
        },
      ],
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

  it("requires public claim rows to link to their declaration files", () => {
    const entries = buildClaimGateReport(
      [{ file: "longmemeval.json", value: cleanReport({ benchmark: "LongMemEval" }) }],
      "t",
    ).entries;
    const missingLink = checkReadmeClaimTables(
      [{ content: readmeWithRows(["| LongMemEval full 500 | x | no link |"]), file: "README.md" }],
      entries,
    )[0];
    expect(missingLink?.consistent).toBe(false);
    expect(missingLink?.declarationLinkErrors).toEqual([
      "LongMemEval full 500 must link to benchmark-claims/longmemeval.json",
    ]);

    const wrongLink = checkReadmeClaimTables(
      [
        {
          content: readmeWithRows([
            "| LongMemEval full 500 | x | [beam.json](./benchmark-claims/beam.json) |",
          ]),
          file: "README.md",
        },
      ],
      entries,
    )[0];
    expect(wrongLink?.consistent).toBe(false);
    expect(wrongLink?.declarationLinkErrors).toEqual([
      "LongMemEval full 500 must link to benchmark-claims/longmemeval.json",
    ]);
  });

  it("requires public claim rows to include declaration-controlled result fragments", () => {
    const entries = buildClaimGateReport(
      [
        {
          file: "longmemeval.json",
          value: cleanReport({
            benchmark: "LongMemEval",
            publicClaim: {
              readmeDisclosureFragments: ["disclosed"],
              readmeRequiredFragments: ["0.720", "360/500", "0.068"],
            },
          }),
        },
      ],
      "t",
    ).entries;
    const ok = checkReadmeClaimTables(
      [
        {
          content: readmeWithRows([
            "| LongMemEval full 500 | **0.720** (360/500) vs 0.068 | [longmemeval.json](./benchmark-claims/longmemeval.json) |",
          ]),
          file: "README.md",
        },
      ],
      entries,
    )[0];
    expect(ok?.consistent).toBe(true);

    const drifted = checkReadmeClaimTables(
      [
        {
          content: readmeWithRows([
            "| LongMemEval full 500 | **0.999** (360/500) vs 0.068 | [longmemeval.json](./benchmark-claims/longmemeval.json) |",
          ]),
          file: "README.md",
        },
      ],
      entries,
    )[0];
    expect(drifted?.consistent).toBe(false);
    expect(drifted?.claimContentErrors).toEqual([
      'LongMemEval full 500 must include declaration fragment "0.720"',
    ]);
  });

  it("requires promoted README prose to include declaration-controlled disclosure fragments", () => {
    const entries = buildClaimGateReport(
      [
        {
          file: "beam.json",
          value: cleanReport({
            benchmark: "BEAM",
            publicClaim: {
              readmeDisclosureFragments: ["gpt-5.4", "0.9621", "0.6822"],
              readmeRequiredFragments: ["0.802"],
            },
          }),
        },
      ],
      "t",
    ).entries;
    const ok = checkReadmeClaimTables(
      [
        {
          content: `${readmeWithRows([
            "| BEAM 100K | **0.802** | [beam.json](./benchmark-claims/beam.json) |",
          ])}\nBEAM uses gpt-5.4 and reports fitted 0.9621 with generalization 0.6822.\n`,
          file: "README.md",
        },
      ],
      entries,
    )[0];
    expect(ok?.consistent).toBe(true);

    const missingDisclosure = checkReadmeClaimTables(
      [
        {
          content: readmeWithRows([
            "| BEAM 100K | **0.802** | [beam.json](./benchmark-claims/beam.json) |",
          ]),
          file: "README.md",
        },
      ],
      entries,
    )[0];
    expect(missingDisclosure?.consistent).toBe(false);
    expect(missingDisclosure?.disclosureErrors).toEqual([
      'BEAM 100K README disclosure must include declaration fragment "gpt-5.4"',
      'BEAM 100K README disclosure must include declaration fragment "0.9621"',
      'BEAM 100K README disclosure must include declaration fragment "0.6822"',
    ]);
  });

  it("requires claimable benchmarks to stay promoted in the public claims table", () => {
    const entries = buildClaimGateReport(
      [{ file: "longmemeval.json", value: cleanReport({ benchmark: "LongMemEval" }) }],
      "t",
    ).entries;
    const check = checkReadmeClaimTables(
      [{ content: readmeWithRows([]), file: "README.md" }],
      entries,
    )[0];
    expect(check?.consistent).toBe(false);
    expect(check?.missingClaimableBenchmarks).toEqual(["LongMemEval"]);
  });

  it("feeds readme consistency into the gate report", () => {
    const declarations = [
      { file: "longmemeval.json", value: cleanReport({ benchmark: "LongMemEval" }) },
    ];
    const good = buildClaimGateReport(declarations, "t", [
      {
        content: readmeWithRows([
          "| LongMemEval full 500 | x | [longmemeval.json](./benchmark-claims/longmemeval.json) |",
        ]),
        file: "README.md",
      },
    ]);
    expect(good.readmeConsistent).toBe(true);
    const missingRow = buildClaimGateReport(declarations, "t", [
      { content: readmeWithRows([]), file: "README.md" },
    ]);
    expect(missingRow.readmeConsistent).toBe(false);
    const bad = buildClaimGateReport(declarations, "t", [
      { content: "# no markers", file: "README.md" },
    ]);
    expect(bad.readmeConsistent).toBe(false);
  });
});
