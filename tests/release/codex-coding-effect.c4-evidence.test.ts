import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  buildC4AssetLock,
  loadC4AssetLock,
} from "../../scripts/codex-coding-effect/c4-controlled-dataset";
import {
  parseC4IndependentReviewDispatch,
  parseC4ReviewInputBundle,
} from "../../scripts/codex-coding-effect/c4-contracts";
import {
  buildC4IndependentReviewDispatch,
  buildC4IndependentReviewSpawnMessage,
  buildC4ReviewRequest,
  serializeC4ReviewArtifact,
} from "../../scripts/codex-coding-effect/c4-review-artifacts";
import type {
  C4DatasetCoreReadiness,
} from "../../scripts/codex-coding-effect/c4-readiness";
import {
  runC4DatasetCoreReadiness,
} from "../../scripts/codex-coding-effect/c4-readiness";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const DATASET_ROOT = join(
  REPOSITORY_ROOT,
  "fixtures/codex-coding-effect/c4-controlled-pilot",
);
const REPORT_ROOT = join(REPOSITORY_ROOT, "reports/quality-gates/phase-73");
const HISTORICAL_BASELINE_PATH = join(
  REPORT_ROOT,
  "c4-baseline-ceiling-pilot-v1.json",
);

describe("Codex coding-effect C4 tracked evidence", () => {
  it("binds the frozen dataset and current core while independent review remains open", async () => {
    const [
      coreBytes,
      dispatchBytes,
      historicalBaselineBytes,
      inputBundleBytes,
      manifestBytes,
      requestBytes,
      currentStatus,
      taskBoard,
      plan,
    ] = await Promise.all([
      readFile(join(REPORT_ROOT, "c4-controlled-pilot-core.json"), "utf8"),
      readFile(join(DATASET_ROOT, "review/dispatch.json"), "utf8"),
      readFile(HISTORICAL_BASELINE_PATH, "utf8"),
      readFile(join(DATASET_ROOT, "review/input-bundle.json"), "utf8"),
      readFile(join(DATASET_ROOT, "manifest.json"), "utf8"),
      readFile(join(DATASET_ROOT, "review/request.md"), "utf8"),
      readFile(
        join(
          REPOSITORY_ROOT,
          "docs/GoodMemory-Current-Status-and-Evidence.md",
        ),
        "utf8",
      ),
      readFile(
        join(
          REPOSITORY_ROOT,
          "task-board/78-phase-73-codex-installed-host-coding-effect-evaluation.txt",
        ),
        "utf8",
      ),
      readFile(
        join(
          REPOSITORY_ROOT,
          "docs/plans/GoodMemory-Codex-Coding-Effect-Evaluation-and-Development-Plan.md",
        ),
        "utf8",
      ),
    ]);
    const core = JSON.parse(coreBytes) as C4DatasetCoreReadiness;
    const dispatch = parseC4IndependentReviewDispatch(
      JSON.parse(dispatchBytes) as unknown,
    );
    const historicalBaseline = JSON.parse(historicalBaselineBytes) as {
      attemptedCount: number;
      claimBoundary: string;
      datasetId: string;
      decision: string;
      publicClaimEligible: boolean;
      resolvedCount: number;
    };
    const inputBundle = parseC4ReviewInputBundle(
      JSON.parse(inputBundleBytes) as unknown,
    );
    const manifest = JSON.parse(manifestBytes) as { datasetId: string };
    const { assetLock, assetLockSha256 } = await loadC4AssetLock(DATASET_ROOT);

    expect(historicalBaseline).toMatchObject({
      attemptedCount: 6,
      claimBoundary: "diagnostic-no-memory-ceiling-only",
      datasetId: "codex-c4-controlled-pilot-v1",
      decision: "redesign-episodes-before-c5",
      publicClaimEligible: false,
      resolvedCount: 6,
    });
    expect(await Bun.file(
      join(REPORT_ROOT, "c4-baseline-ceiling-pilot.json"),
    ).exists()).toBe(false);
    expect(await Bun.file(
      join(REPORT_ROOT, "c4-baseline-ceiling-pilot-stages"),
    ).exists()).toBe(false);
    expect(await Bun.file(
      join(REPORT_ROOT, "c4-baseline-ceiling-pilot"),
    ).exists()).toBe(false);
    expect(await buildC4AssetLock(DATASET_ROOT)).toEqual(assetLock);
    expect(core).toMatchObject({
      assetLockSha256,
      assetRootSha256: assetLock.assetRootSha256,
      authorAttestation: {
        authorTaskName: "/root",
        status: "accepted",
      },
      claimBoundary: "dataset-readiness-only-no-coding-uplift",
      counts: {
        baseProbes: 54,
        episodes: 6,
        repositories: 2,
        stages: 18,
      },
      excludedHosts: ["claude-code"],
      host: "codex",
      datasetId: "codex-c4-controlled-pilot-v2",
      publicClaimEligible: false,
      publicCodingEffectProof: false,
      readmeRowAllowed: false,
      status: "accepted",
    });
    expect(manifest.datasetId).toBe("codex-c4-controlled-pilot-v2");
    expect(inputBundle.datasetId).toBe("codex-c4-controlled-pilot-v2");
    expect(sha256(manifestBytes)).toBe(core.manifestSha256);
    expect(inputBundle.assetLockSha256).toBe(core.assetLockSha256);
    expect(inputBundle.assetFiles).toEqual(assetLock.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
    })));
    expect(inputBundle.assetRootSha256).toBe(core.assetRootSha256);
    expect(inputBundle.leakageAuditSha256).toBe(core.leakage.auditSha256);
    expect(inputBundle.manifestSha256).toBe(core.manifestSha256);
    expect(inputBundle.readinessCoreSha256).toBe(sha256(coreBytes));
    expect(requestBytes).toContain(sha256(inputBundleBytes));
    expect(requestBytes).toBe(buildC4ReviewRequest({
      inputBundleSha256: sha256(inputBundleBytes),
    }));
    expect(dispatchBytes).toBe(serializeC4ReviewArtifact(
      buildC4IndependentReviewDispatch({
        spawnMessage: buildC4IndependentReviewSpawnMessage(),
      }),
    ));
    expect(core.authorAttestation.authorTaskName).toBe("/root");
    expect(dispatch.authorTaskName).toBe("/root");
    expect(dispatch.reviewerAgentName).not.toBe(dispatch.authorTaskName);
    expect(dispatch.requestedTaskName).toBe(
      "c4_final_independent_review_v3",
    );
    expect(dispatch.spawnMessage.length).toBeGreaterThan(0);
    expect(inputBundle.excludedOutcomeArtifacts).toEqual([
      "c4-baseline-results",
      "c4-paired-results",
      "c5-paired-results",
    ]);
    expect(core.leakage.auditedHiddenArtifacts).toContain(
      "hidden-test-source",
    );
    expect(core.leakage.auditedSurfaces).toContain(
      "goodmemory-export-after-seeding",
    );
    expect(core.leakage.matrixCellCount).toBe(486);
    expect(core.leakage.mutationApplicableCellCount).toBe(648);
    expect(core.leakage.mutationCellCount).toBe(1458);
    expect(core.leakage.mutationNotApplicableCellCount).toBe(810);
    expect(core.leakage.stageCount).toBe(18);
    expect(core.leakage.stageMatrices.every((stage) =>
      stage.cells.length === 27 &&
      stage.mutationCells.length === 81
    )).toBe(true);
    expect(core.leakage.c5LiveReauditSurfaces).toEqual([
      "effective-codex-input-after-seeding",
      "flat-summary-after-seeding",
      "goodmemory-export-after-seeding",
      "goodmemory-hook-context-after-seeding",
    ]);
    expect(core.leakage.deferredC5Surfaces).toEqual(
      core.leakage.c5LiveReauditSurfaces,
    );
    expect([
      ...core.leakage.directFrozenSurfaces,
      ...core.leakage.deferredC5Surfaces,
    ].map(String).sort()).toEqual([...core.leakage.auditedSurfaces].sort());
    expect(core.stages).toHaveLength(18);
    expect(core.stages.every((stage) =>
      stage.baseProbeStable &&
      stage.baseProbes.length === 3 &&
      stage.goldPassed &&
      /^[a-f0-9]{64}$/u.test(stage.stageInputSha256)
    )).toBe(true);
    expect(core.repositories.every((repository) =>
      Object.keys(repository).sort().join(",") === "commit,id,tree,url"
    )).toBe(true);
    expect(coreBytes).not.toContain(REPOSITORY_ROOT);
    const regenerationRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-c4-release-regeneration-"),
    );
    try {
      const regenerated = await runC4DatasetCoreReadiness({
        datasetRoot: DATASET_ROOT,
        workspaceRoot: join(regenerationRoot, "readiness"),
      });
      expect(regenerated.coreBytes).toBe(coreBytes);
      expect(regenerated.coreSha256).toBe(sha256(coreBytes));
    } finally {
      await rm(regenerationRoot, { force: true, recursive: true });
    }
    expect(await Bun.file(
      join(DATASET_ROOT, "review/independent-review.json"),
    ).exists()).toBe(false);
    expect(await Bun.file(
      join(DATASET_ROOT, "review/provenance.json"),
    ).exists()).toBe(false);
    expect(await Bun.file(
      join(REPORT_ROOT, "c4-controlled-pilot-readiness.json"),
    ).exists()).toBe(false);
    expect(taskBoard).toContain(
      "[OPEN] C4 controlled pilot dataset readiness awaits a new v2 no-memory baseline",
    );
    expect(plan).toContain(
      "C4 implementation status (2026-07-16): **reopened pending independent review**.",
    );
    expect(currentStatus).toContain(
      "C4 therefore remains open until the v2 baseline exists",
    );
  }, 120_000);
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
