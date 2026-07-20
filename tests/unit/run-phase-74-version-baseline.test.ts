import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildPhase74ReleaseWorkerInput,
  buildPhase74VersionComparison,
  createPhase74FreshVersionRunDirectory,
  parsePhase74VersionBaselineCliOptions,
  preparePhase74VersionDataset,
} from "../../scripts/run-phase-74-version-baseline";
import type { Phase74DatasetBundle } from "../../src/eval/phase74Datasets";

describe("Phase 74 release baseline runner", () => {
  it("refuses to reuse a partial version-comparison run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "phase74-version-run-"));
    try {
      const runDirectory = await createPhase74FreshVersionRunDirectory(
        root,
        "comparison-r1",
      );
      await writeFile(join(runDirectory, "partial.json"), "{}\n", "utf8");
      await expect(createPhase74FreshVersionRunDirectory(
        root,
        "comparison-r1",
      )).rejects.toThrow("already exists");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("feeds release ingestion the same opaque recall payload as the candidate", () => {
    const workerInput = buildPhase74ReleaseWorkerInput({
      caseId: "locomo-original-id",
      expectedAnswer: "Pepper",
      goldEvidenceIds: ["D1:1"],
      memoryGroupId: "locomo-original-group",
      question: "What is the dog's name?",
      rawEvidence: [{
        content: "I adopted Pepper.",
        id: "conversation/D1:1",
        sourceIds: ["D1:1"],
      }, {
        content: "Pepper likes walks.",
        id: "conversation/D1:2",
        sourceIds: ["D1:2"],
      }],
      unresolvedGoldEvidenceIds: [],
    });

    expect(workerInput.caseId).toMatch(/^case-[a-f0-9]{64}$/u);
    expect(workerInput.memoryGroupId).toMatch(/^group-[a-f0-9]{64}$/u);
    expect(workerInput.rawEvidence.map(({ id }) => id)).toEqual([
      "evidence-1",
      "evidence-2",
    ]);
    expect(workerInput.rawEvidence[0]?.sourceIds[0]?.split(":")[0]).toBe(
      workerInput.rawEvidence[1]?.sourceIds[0]?.split(":")[0],
    );
    expect(JSON.stringify(workerInput)).not.toContain("locomo-original");
    expect(JSON.stringify(workerInput)).not.toContain("D1:");
  });

  it("binds a subset comparison to the selected candidate manifest", () => {
    const cases = Array.from({ length: 3 }, (_, index) => ({
      caseId: `case-${index + 1}`,
      expectedAnswer: `answer-${index + 1}`,
      goldEvidenceIds: [],
      question: `Question ${index + 1}?`,
      rawEvidence: [{
        content: `Evidence ${index + 1}`,
        id: `evidence-${index + 1}`,
        sourceIds: [`source-${index + 1}`],
      }],
      unresolvedGoldEvidenceIds: [],
    }));
    const bundle: Phase74DatasetBundle = {
      cases,
      manifest: {
        adaptedCasesSha256: "f".repeat(64),
        benchmark: "longmemeval",
        caseCount: cases.length,
        datasetSha256: "a".repeat(64),
        normalizedFingerprint: "b".repeat(64),
        schemaVersion: 2,
        selectedCaseIdsSha256: "c".repeat(64),
        source: {
          commit: "d".repeat(40),
          license: "MIT",
          repository: "https://example.test/dataset",
          sourceSha256: "e".repeat(64),
          sourceUrl: "https://example.test/dataset.json",
        },
        unresolvedGoldEvidence: [],
        unresolvedGoldEvidenceCount: 0,
      },
    };

    const prepared = preparePhase74VersionDataset({
      dataset: bundle,
      seed: 7401,
      size: 1,
    });

    expect(prepared.selection.cases).toHaveLength(1);
    expect(prepared.dataset.cases).toEqual(prepared.selection.cases);
    expect(prepared.dataset.manifest).toMatchObject({
      caseCount: 1,
      datasetSha256: bundle.manifest.datasetSha256,
      source: bundle.manifest.source,
    });
    expect(prepared.dataset.manifest).not.toEqual(bundle.manifest);
  });

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
