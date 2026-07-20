import { describe, expect, it } from "bun:test";

import {
  buildPhase74VersionComparison,
  parsePhase74VersionBaselineCliOptions,
} from "../../scripts/run-phase-74-version-baseline";

describe("Phase 74 release baseline runner", () => {
  it("builds paired score and binary inference from the same aligned cases", () => {
    const comparison = buildPhase74VersionComparison({
      baseline: [
        { answer: "wrong", caseId: "case-1", correct: false, score: 0 },
        { answer: "right", caseId: "case-2", correct: true, score: 1 },
      ],
      candidate: [
        { answer: "right", caseId: "case-1", correct: true, score: 1 },
        { answer: "right", caseId: "case-2", correct: true, score: 1 },
      ],
    });

    expect(comparison).toMatchObject({
      baselineMean: 0.5,
      candidateMean: 1,
      caseCount: 2,
      meanDelta: 0.5,
      mcnemar: { baselineOnly: 0, candidateOnly: 1 },
      pairedBootstrap: { delta: 0.5 },
    });
  });

  it("parses an explicit release-vs-candidate run with hard limits", () => {
    expect(parsePhase74VersionBaselineCliOptions([
      "bun",
      "run-phase-74-version-baseline.ts",
      "--benchmark",
      "longmemeval",
      "--benchmark-root",
      "/private/tmp/phase74/longmemeval",
      "--candidate-run-dir",
      "/private/tmp/phase74/candidate",
      "--candidate-stage",
      "E2",
      "--candidate-arm",
      "claim-temporal-on",
      "--release-source-root",
      "/private/tmp/phase74/release",
      "--release-archive",
      "/private/tmp/phase74/release.tar",
      "--output-dir",
      "/private/tmp/phase74/version-runs",
      "--run-id",
      "release-vs-candidate-r1",
      "--case-selection-seed",
      "7401",
      "--case-selection-size",
      "2",
      "--max-language-calls",
      "200",
      "--embedding-spend-limit-usd",
      "1",
    ])).toEqual({
      benchmark: "longmemeval",
      benchmarkRoot: "/private/tmp/phase74/longmemeval",
      candidateArm: "claim-temporal-on",
      candidateRunDirectory: "/private/tmp/phase74/candidate",
      candidateStage: "E2",
      caseSelectionSeed: 7401,
      caseSelectionSize: 2,
      embeddingSpendLimitUsd: 1,
      maxLanguageCalls: 200,
      outputDir: "/private/tmp/phase74/version-runs",
      releaseArchive: "/private/tmp/phase74/release.tar",
      releaseSourceRoot: "/private/tmp/phase74/release",
      runId: "release-vs-candidate-r1",
    });
  });

  it("rejects missing source paths and invalid budgets", () => {
    expect(() => parsePhase74VersionBaselineCliOptions([
      "bun",
      "run-phase-74-version-baseline.ts",
      "--benchmark",
      "longmemeval",
    ])).toThrow("requires");
  });
});
