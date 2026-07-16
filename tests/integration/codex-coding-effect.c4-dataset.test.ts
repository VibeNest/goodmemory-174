import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildC4AssetLock,
  c4RepositoryIdForUrl,
  cleanupC4ControlledPilotDataset,
  materializeC4SourceRepository,
  prepareC4ControlledPilotDataset,
  serializeC4AssetLock,
} from "../../scripts/codex-coding-effect/c4-controlled-dataset";
import type { C4IndependentDatasetReview } from "../../scripts/codex-coding-effect/c4-contracts";
import {
  runC4AdaptiveBaselineCeiling,
  serializeC4BaselineCeilingReport,
} from "../../scripts/codex-coding-effect/c4-baseline-ceiling";
import type {
  C4BaselineCeilingTarget,
  C4BaselineStageResult,
} from "../../scripts/codex-coding-effect/c4-baseline-ceiling";
import {
  finalizeC4DatasetReadiness,
  runC4DatasetCoreReadiness,
} from "../../scripts/codex-coding-effect/c4-readiness";
import {
  buildC4IndependentReviewDispatch,
  buildC4IndependentReviewProvenance,
  buildC4IndependentReviewSpawnMessage,
  buildC4ReviewInputBundle,
  buildC4ReviewRequest,
  serializeC4ReviewArtifact,
} from "../../scripts/codex-coding-effect/c4-review-artifacts";

describe("Codex coding-effect C4 controlled dataset", () => {
  it("materializes and verifies six three-stage episodes without live Codex", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-dataset-"));
    const fixture = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "dataset"),
    });
    try {
      expect(fixture.dataset.schemaVersion).toBe(2);
      expect(fixture.dataset.episodes).toHaveLength(6);
      expect(fixture.dataset.episodes.flatMap((episode) => episode.stages))
        .toHaveLength(18);
      expect(new Set(
        fixture.dataset.episodes.map((episode) => episode.repository.url),
      ).size).toBe(2);
      expect(fixture.assetLock.files.some((file) =>
        file.path === "manifest.json"
      )).toBe(true);
      expect(fixture.assetLock.files.some((file) =>
        file.path === "provenance/author-attestation.json"
      )).toBe(true);
      expect(fixture.assetLock.files.filter((file) =>
        file.path.startsWith("evaluator/gold/")
      )).toHaveLength(18);
      const sourceBytes = await readFile(
        join(fixture.root, "repositories/continuity-utils/src/tasks.ts"),
        "utf8",
      );
      expect(sourceBytes.endsWith("\n")).toBe(true);
      expect(sourceBytes.endsWith("\n\n")).toBe(false);

      const result = await runC4DatasetCoreReadiness({
        datasetRoot: fixture.root,
        workspaceRoot: join(sandbox, "readiness"),
      });

      expect(result.core.status).toBe("accepted");
      expect(result.coreBytes).not.toContain(sandbox);
      expect(result.core.counts).toEqual({
        baseProbes: 54,
        episodes: 6,
        repositories: 2,
        stages: 18,
      });
      expect(result.core.stages).toHaveLength(18);
      expect(result.core.stages.every((stage) =>
        stage.baseProbeStable &&
        stage.baseProbes.length === 3 &&
        stage.goldPassed
      )).toBe(true);
      expect(result.core.leakage.status).toBe("accepted");
      expect(result.core.licenses.status).toBe("accepted");
      expect(result.core.authorAttestation).toMatchObject({
        authorTaskName: "/root",
        status: "accepted",
      });
      expect(result.core.host).toBe("codex");
      expect(result.core.excludedHosts).toEqual(["claude-code"]);
      expect(result.core.readmeRowAllowed).toBe(false);
      expect(result.core.publicClaimEligible).toBe(false);
      expect(result.core.publicCodingEffectProof).toBe(false);

      const repeated = await runC4DatasetCoreReadiness({
        datasetRoot: fixture.root,
        workspaceRoot: join(sandbox, "readiness-repeat"),
      });
      expect(repeated.coreSha256).toBe(result.coreSha256);
      expect(repeated.coreBytes).toBe(result.coreBytes);

      const review = independentReviewArtifacts(
        result,
        fixture.dataset.episodes,
        fixture.assetLock.files.map((file) => ({
          path: file.path,
          sha256: file.sha256,
        })),
      );
      const baselineBytes = await baselineCeilingBytes(result, "proceed");
      const final = finalizeC4DatasetReadiness({
        baselineBytes,
        result,
        ...review,
      });
      expect(final.report).toMatchObject({
        authorTaskName: "/root",
        baselineCeiling: {
          ceilingRisk: false,
          decision: "proceed-to-c5-pilot",
          infrastructureFailureCount: 0,
        },
        claimBoundary: "dataset-readiness-only-no-coding-uplift",
        nextEvidencePhase: "C5-native-longitudinal-pilot",
        publicClaimEligible: false,
        publicCodingEffectProof: false,
        reviewContextPolicy: "fork-turns-none",
        reviewerAgentName: "/root/c4_final_independent_review",
        reviewerIdentityEvidence:
          "orchestrator-attestation-not-cryptographic-receipt",
        reviewerType: "independent-ai-agent",
        schemaVersion: 3,
        status: "accepted",
      });
      expect(final.report.baselineCeiling.reportSha256).toBe(
        sha256(baselineBytes),
      );
      expect(final.report.reviewSha256).toHaveLength(64);
      expect(() => finalizeC4DatasetReadiness({
        baselineBytes,
        result,
        ...review,
        reviewBytes: `${JSON.stringify({
          ...JSON.parse(review.reviewBytes) as C4IndependentDatasetReview,
          readinessCoreSha256: "f".repeat(64),
        }, null, 2)}\n`,
      })).toThrow("C4 independent review response hash mismatch");
      expect(() => finalizeC4DatasetReadiness({
        baselineBytes,
        result,
        ...review,
        requestBytes: `${review.requestBytes}drift`,
      })).toThrow("C4 independent review request is not canonical");
      expect(() => finalizeC4DatasetReadiness({
        baselineBytes,
        result,
        ...review,
        inputBundleBytes: review.inputBundleBytes.replace(
          "2026-07-15T19:59:00.000Z",
          "2026-07-15T19:59:01.000Z",
        ),
      })).toThrow("C4 independent review request is not canonical");
      expect(() => finalizeC4DatasetReadiness({
        baselineBytes,
        result,
        ...review,
        dispatchBytes: mutateDispatch(review.dispatchBytes),
      })).toThrow("C4 independent review dispatch is not canonical");
      expect(() => finalizeC4DatasetReadiness({
        baselineBytes,
        result,
        ...review,
        provenanceBytes: review.provenanceBytes.replace(
          '"authorTaskName": "/root"',
          '"authorTaskName": "/root/other"',
        ),
      })).toThrow(
        "C4 orchestrator attestation must be made by the author task",
      );
      const incompleteInventoryReview = independentReviewArtifacts(
        result,
        fixture.dataset.episodes,
        fixture.assetLock.files.slice(1).map((file) => ({
          path: file.path,
          sha256: file.sha256,
        })),
      );
      expect(() => finalizeC4DatasetReadiness({
        baselineBytes,
        result,
        ...incompleteInventoryReview,
      })).toThrow(
        "C4 review input bundle does not match the full frozen asset inventory",
      );
      await expect(finalizeWithBaseline(
        result,
        review,
        "redesign",
      )).rejects.toThrow(
        "C4 baseline ceiling report requires episode redesign before C5",
      );
      await expect(finalizeWithBaseline(
        result,
        review,
        "inconclusive",
      )).rejects.toThrow("C4 baseline ceiling report is inconclusive");
      const mismatchedBaseline = await baselineCeilingBytes(
        result,
        "proceed",
        "f".repeat(64),
      );
      expect(() => finalizeC4DatasetReadiness({
        baselineBytes: mismatchedBaseline,
        result,
        ...review,
      })).toThrow("C4 baseline asset lock binding mismatch");
      expect(() => finalizeC4DatasetReadiness({
        baselineBytes: baselineBytes.replace(
          /"stageEvidenceAggregateSha256": "[a-f0-9]{64}"/u,
          `"stageEvidenceAggregateSha256": "${"f".repeat(64)}"`,
        ),
        result,
        ...review,
      })).toThrow("C4 baseline stage evidence aggregate is inconsistent");
    } finally {
      await cleanupC4ControlledPilotDataset(fixture);
      await rm(sandbox, { force: true, recursive: true });
    }
  }, 120_000);

  it("rejects asset drift before running readiness probes", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-drift-"));
    const fixture = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "dataset"),
    });
    try {
      const promptPath = join(
        fixture.root,
        fixture.dataset.episodes[0]!.stages[0]!.promptPath,
      );
      await writeFile(
        promptPath,
        `${await readFile(promptPath, "utf8")}drift\n`,
        "utf8",
      );
      await expect(runC4DatasetCoreReadiness({
        datasetRoot: fixture.root,
        workspaceRoot: join(sandbox, "readiness"),
      })).rejects.toThrow("C4 asset lock mismatch");
    } finally {
      await cleanupC4ControlledPilotDataset(fixture);
      await rm(sandbox, { force: true, recursive: true });
    }
  });

  it("rejects hidden fail-to-pass inputs copied into agent-visible prompts", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-leakage-"));
    const fixture = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "dataset"),
    });
    try {
      const episode = fixture.dataset.episodes.find((candidate) =>
        candidate.id === "irrelevant-history-control"
      )!;
      const promptPath = join(fixture.root, episode.stages[2]!.promptPath);
      await writeFile(
        promptPath,
        `${await readFile(promptPath, "utf8")}Reproduce docs/setup guide#intro exactly.\n`,
        "utf8",
      );
      const assetLock = await buildC4AssetLock(fixture.root);
      await writeFile(
        join(fixture.root, "asset-lock.json"),
        serializeC4AssetLock(assetLock),
        "utf8",
      );

      await expect(runC4DatasetCoreReadiness({
        datasetRoot: fixture.root,
        workspaceRoot: join(sandbox, "readiness"),
      })).rejects.toThrow("C4 leakage audit failed for irrelevant-history-control");
    } finally {
      await cleanupC4ControlledPilotDataset(fixture);
      await rm(sandbox, { force: true, recursive: true });
    }
  });

  it("rejects numeric hidden values copied into agent-visible prompts", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-number-leakage-"));
    const fixture = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "dataset"),
    });
    try {
      const episode = fixture.dataset.episodes.find((candidate) =>
        candidate.id === "stale-time-unit-update"
      )!;
      const promptPath = join(fixture.root, episode.stages[0]!.promptPath);
      await writeFile(
        promptPath,
        `${await readFile(promptPath, "utf8")}Assert 2.5 -> 2500.\n`,
        "utf8",
      );
      const assetLock = await buildC4AssetLock(fixture.root);
      await writeFile(
        join(fixture.root, "asset-lock.json"),
        serializeC4AssetLock(assetLock),
        "utf8",
      );

      await expect(runC4DatasetCoreReadiness({
        datasetRoot: fixture.root,
        workspaceRoot: join(sandbox, "readiness"),
      })).rejects.toThrow("C4 leakage audit failed for stale-time-unit-update");
    } finally {
      await cleanupC4ControlledPilotDataset(fixture);
      await rm(sandbox, { force: true, recursive: true });
    }
  }, 120_000);

  it("rejects pass-to-pass values copied into agent-visible prompts", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-p2p-leakage-"));
    const fixture = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "dataset"),
    });
    try {
      const episode = fixture.dataset.episodes.find((candidate) =>
        candidate.id === "validated-first-delimiter"
      )!;
      const promptPath = join(fixture.root, episode.stages[0]!.promptPath);
      await writeFile(
        promptPath,
        `${await readFile(promptPath, "utf8")}The hidden values are left and right.\n`,
        "utf8",
      );
      const assetLock = await buildC4AssetLock(fixture.root);
      await writeFile(
        join(fixture.root, "asset-lock.json"),
        serializeC4AssetLock(assetLock),
        "utf8",
      );

      await expect(runC4DatasetCoreReadiness({
        datasetRoot: fixture.root,
        workspaceRoot: join(sandbox, "readiness"),
      })).rejects.toThrow(
        "C4 leakage audit failed for validated-first-delimiter",
      );
    } finally {
      await cleanupC4ControlledPilotDataset(fixture);
      await rm(sandbox, { force: true, recursive: true });
    }
  }, 120_000);

  it("rejects short code tokens copied from a real gold patch into a visible prompt", async () => {
    const sandbox = await mkdtemp(join(
      tmpdir(),
      "goodmemory-c4-short-gold-leakage-",
    ));
    const fixture = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "dataset"),
    });
    try {
      const episode = fixture.dataset.episodes.find((candidate) =>
        candidate.id === "irrelevant-history-control"
      )!;
      const promptPath = join(fixture.root, episode.stages[0]!.promptPath);
      await writeFile(
        promptPath,
        `${await readFile(promptPath, "utf8")}Use the hidden code token .trim() exactly.\n`,
        "utf8",
      );
      const assetLock = await buildC4AssetLock(fixture.root);
      await writeFile(
        join(fixture.root, "asset-lock.json"),
        serializeC4AssetLock(assetLock),
        "utf8",
      );

      await expect(runC4DatasetCoreReadiness({
        datasetRoot: fixture.root,
        workspaceRoot: join(sandbox, "readiness"),
      })).rejects.toThrow(
        "C4 leakage audit failed for irrelevant-history-control",
      );
    } finally {
      await cleanupC4ControlledPilotDataset(fixture);
      await rm(sandbox, { force: true, recursive: true });
    }
  }, 120_000);

  it("rejects hidden values copied into newly added agent-visible repository files", async () => {
    const sandbox = await mkdtemp(join(
      tmpdir(),
      "goodmemory-c4-visible-file-leakage-",
    ));
    const fixture = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "dataset"),
    });
    try {
      const episode = fixture.dataset.episodes.find((candidate) =>
        candidate.id === "irrelevant-history-control"
      )!;
      const repositoryId = c4RepositoryIdForUrl(episode.repository.url);
      await writeFile(
        join(
          fixture.root,
          "repositories",
          repositoryId,
          "HINTS.md",
        ),
        "Reproduce docs/setup guide#intro exactly.\n",
        "utf8",
      );
      const reconstructed = join(sandbox, "reconstructed");
      const repositoryIdentity = await materializeC4SourceRepository({
        datasetRoot: fixture.root,
        destination: reconstructed,
        repositoryId,
      });
      const manifestPath = join(fixture.root, "manifest.json");
      const manifest = JSON.parse(
        await readFile(manifestPath, "utf8"),
      ) as {
        episodes: Array<{
          repository: { baseCommit: string; url: string };
          stages: Array<{ snapshot: string }>;
        }>;
      };
      for (const candidate of manifest.episodes) {
        if (candidate.repository.url !== episode.repository.url) {
          continue;
        }
        candidate.repository.baseCommit = repositoryIdentity.commit;
        for (const stage of candidate.stages) {
          stage.snapshot = repositoryIdentity.commit;
        }
      }
      await writeFile(
        manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
      await rm(reconstructed, { force: true, recursive: true });
      const assetLock = await buildC4AssetLock(fixture.root);
      await writeFile(
        join(fixture.root, "asset-lock.json"),
        serializeC4AssetLock(assetLock),
        "utf8",
      );

      await expect(runC4DatasetCoreReadiness({
        datasetRoot: fixture.root,
        workspaceRoot: join(sandbox, "readiness"),
      })).rejects.toThrow(
        "C4 leakage audit failed for irrelevant-history-control",
      );
    } finally {
      await cleanupC4ControlledPilotDataset(fixture);
      await rm(sandbox, { force: true, recursive: true });
    }
  }, 120_000);

  it("materializes byte-identical manifests and asset locks from scratch", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "goodmemory-c4-repeat-"));
    const first = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "first"),
    });
    const second = await prepareC4ControlledPilotDataset({
      root: join(sandbox, "second"),
    });
    try {
      expect(first.assetLockSha256).toBe(second.assetLockSha256);
      expect(first.assetLock.assetRootSha256).toBe(
        second.assetLock.assetRootSha256,
      );
      expect(await readFile(join(first.root, "manifest.json"), "utf8")).toBe(
        await readFile(join(second.root, "manifest.json"), "utf8"),
      );
    } finally {
      await cleanupC4ControlledPilotDataset(first);
      await cleanupC4ControlledPilotDataset(second);
      await rm(sandbox, { force: true, recursive: true });
    }
  });
});

function independentReviewArtifacts(
  result: Awaited<ReturnType<typeof runC4DatasetCoreReadiness>>,
  episodes: readonly { author: string; id: string }[],
  assetFiles: ReadonlyArray<{ path: string; sha256: string }>,
): {
  dispatchBytes: string;
  inputBundleBytes: string;
  provenanceBytes: string;
  requestBytes: string;
  reviewBytes: string;
} {
  const inputBundleBytes = serializeC4ReviewArtifact(
    buildC4ReviewInputBundle({
      assetFiles,
      assetLockSha256: result.core.assetLockSha256,
      assetRootSha256: result.core.assetRootSha256,
      createdAt: "2026-07-15T19:59:00.000Z",
      leakageAuditSha256: result.core.leakage.auditSha256,
      manifestSha256: result.core.manifestSha256,
      readinessCoreSha256: result.coreSha256,
    }),
  );
  const review: C4IndependentDatasetReview = {
    assetLockSha256: result.core.assetLockSha256,
    assetRootSha256: result.core.assetRootSha256,
    c4AbResultsInspected: false,
    codingOutcomeArtifactsInspected: false,
    datasetId: result.core.datasetId,
    episodeReviews: episodes.map((episode) => ({
      author: episode.author,
      checks: {
        codingNotTrivia: true,
        hiddenTestsFair: true,
        memoryUsefulNotAnswer: true,
        negativeControlCredible: true,
        noRepositorySpecificRunnerException: true,
      },
      episodeId: episode.id,
      rationale: "Independent dataset review accepted the task and evaluator boundary.",
    })),
    inputBundleSha256: sha256(inputBundleBytes),
    leakageAuditSha256: result.core.leakage.auditSha256,
    manifestSha256: result.core.manifestSha256,
    publicCodingEffectProof: false,
    readinessCoreSha256: result.coreSha256,
    reviewedAt: "2026-07-15T20:00:00.000Z",
    reviewer: "Codex C4 independent reviewer",
    reviewerTaskName: "/root/c4_final_independent_review",
    schemaVersion: 2,
    scope: "dataset-only-no-coding-outcomes",
    status: "accepted",
  };
  const reviewBytes = `${JSON.stringify(review, null, 2)}\n`;
  const requestBytes = buildC4ReviewRequest({
    inputBundleSha256: sha256(inputBundleBytes),
  });
  const dispatchBytes = serializeC4ReviewArtifact(
    buildC4IndependentReviewDispatch({
      spawnMessage: buildC4IndependentReviewSpawnMessage(),
    }),
  );
  const provenanceBytes = serializeC4ReviewArtifact(
    buildC4IndependentReviewProvenance({
      authorTaskName: result.core.authorAttestation.authorTaskName,
      dispatchBytes,
      inputBundleBytes,
      recordedAt: "2026-07-15T20:01:00.000Z",
      requestBytes,
      responseBytes: reviewBytes,
      reviewerAgentName: "/root/c4_final_independent_review",
    }),
  );
  return {
    dispatchBytes,
    inputBundleBytes,
    provenanceBytes,
    requestBytes,
    reviewBytes,
  };
}

async function baselineCeilingBytes(
  result: Awaited<ReturnType<typeof runC4DatasetCoreReadiness>>,
  outcome: "inconclusive" | "proceed" | "redesign",
  assetLockSha256 = result.core.assetLockSha256,
): Promise<string> {
  let executionIndex = 0;
  const report = await runC4AdaptiveBaselineCeiling({
    executeStage: async (target) => {
      executionIndex += 1;
      return baselineStageResult(target, outcome, executionIndex);
    },
    runIdentity: {
      assetLockSha256,
      assetRootSha256: result.core.assetRootSha256,
      claimBoundary: "diagnostic-no-memory-ceiling-only",
      codexExecutableSha256: "d".repeat(64),
      codexVersion: "codex-cli 0.144.5",
      datasetId: result.core.datasetId,
      generatedAt: "2026-07-16T11:00:00.000Z",
      host: "codex",
      manifestSha256: result.core.manifestSha256,
      model: "gpt-5.6-sol",
      networkAccess: false,
      publicClaimEligible: false,
      reasoningEffort: "xhigh",
      runId: "c4-baseline-test",
      schemaVersion: 1,
      strategy: "stage-3-first-then-stage-2-if-needed",
    },
    targets: result.core.episodes.flatMap((episode) => [
      {
        episodeId: episode.id,
        position: 2 as const,
        stageId: "stage-2" as const,
      },
      {
        episodeId: episode.id,
        position: 3 as const,
        stageId: "stage-3" as const,
      },
    ]),
  });
  return serializeC4BaselineCeilingReport(report);
}

function baselineStageResult(
  target: C4BaselineCeilingTarget,
  outcome: "inconclusive" | "proceed" | "redesign",
  executionIndex: number,
): C4BaselineStageResult {
  const infrastructureFailure = outcome === "inconclusive" &&
    executionIndex === 1;
  const resolved = outcome === "redesign" &&
    target.stageId === "stage-3" &&
    executionIndex <= 5;
  return {
    changedFiles: resolved ? ["src/tasks.ts"] : [],
    codexStatus: infrastructureFailure ? "failed" : "completed",
    disposition: infrastructureFailure
      ? "infrastructure-failure"
      : "finalized",
    episodeId: target.episodeId,
    executionFailureStage: infrastructureFailure ? "codex-exec" : null,
    failToPassStatus: resolved ? "passed" : "failed",
    passToPassStatus: infrastructureFailure ? "not-run" : "passed",
    patchSha256: resolved ? "e".repeat(64) : null,
    resolved,
    stageEvidenceSha256: sha256(
      `${target.episodeId}/${target.stageId}/${outcome}`,
    ),
    stageId: target.stageId,
    taskFailureReasons: infrastructureFailure ? ["codex-exec"] : [],
    threadId: infrastructureFailure
      ? null
      : `thread-${target.episodeId}-${target.stageId}`,
  };
}

async function finalizeWithBaseline(
  result: Awaited<ReturnType<typeof runC4DatasetCoreReadiness>>,
  review: ReturnType<typeof independentReviewArtifacts>,
  outcome: "inconclusive" | "proceed" | "redesign",
) {
  return finalizeC4DatasetReadiness({
    baselineBytes: await baselineCeilingBytes(result, outcome),
    result,
    ...review,
  });
}

function mutateDispatch(dispatchBytes: string): string {
  const dispatch = JSON.parse(dispatchBytes) as { spawnMessage: string };
  dispatch.spawnMessage = `${dispatch.spawnMessage} Custom instruction.`;
  return `${JSON.stringify(dispatch, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
