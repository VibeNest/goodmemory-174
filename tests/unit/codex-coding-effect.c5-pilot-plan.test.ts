import { describe, expect, it } from "bun:test";

import {
  buildC5PilotPlan,
  serializeC5PilotPlan,
  verifyC5PilotPlan,
} from "../../scripts/codex-coding-effect/c5-pilot-plan";
import { loadCodexCodingEffectDataset } from "../../scripts/codex-coding-effect/dataset";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);
const SHA_E = "e".repeat(64);

describe("Codex coding-effect C5 pilot plan", () => {
  it("freezes the exact 6 x 2 x 2 longitudinal pilot without a public claim", async () => {
    const input = await planInput(73);
    const plan = buildC5PilotPlan(input);

    expect(plan).toMatchObject({
      analysis: {
        bootstrapSamples: 10_000,
        confidenceLevel: 0.95,
        materialEffectPercentagePoints: 10,
        power: 0.8,
        primaryResamplingUnit: "episode",
      },
      arms: ["no-memory", "goodmemory-installed"],
      claimBoundary: "internal-native-longitudinal-pilot-only",
      counts: {
        arms: 2,
        codexProcesses: 72,
        episodeArmRuns: 24,
        episodes: 6,
        repetitions: 2,
        stageRuns: 72,
        stages: 18,
      },
      evidenceClass: "native-longitudinal-pilot",
      excludedHosts: ["claude-code"],
      frozenPrehistoryUse: "leakage-audit-reference-only-never-seeded",
      historyPolicy: "native-stop-writeback-only",
      host: "codex",
      publicClaimEligible: false,
      publicCodingEffectProof: false,
      readmeRowAllowed: false,
      repetitions: [1, 2],
      sessionPolicy: "fresh-codex-process-no-resume-per-stage",
    });
    expect(plan.clusters).toHaveLength(12);
    expect(plan.episodeArmRuns).toHaveLength(24);
    expect(plan.episodeArmRuns.flatMap((run) => run.stages)).toHaveLength(72);
    expect(new Set(plan.episodeArmRuns.map((run) => run.id)).size).toBe(24);
    expect(new Set(plan.episodeArmRuns.flatMap((run) =>
      run.stages.map((stage) => stage.id)
    )).size).toBe(72);
    expect(plan.episodeArmRuns.every((run) =>
      run.stateMode === "canonical-snapshot" &&
      run.stages.map((stage) => stage.position).join(",") === "1,2,3" &&
      run.stages.every((stage) =>
        stage.freshSession &&
        !stage.resume &&
        stage.repositoryReset === "declared-stage-snapshot"
      )
    )).toBe(true);
    expect(plan.episodeArmRuns.every((run) =>
      run.stages[0]?.memoryExpectation === "none"
    )).toBe(true);
    expect(() => verifyC5PilotPlan(plan, input)).not.toThrow();
  });

  it("uses deterministic balanced randomization and keeps paired task inputs identical", async () => {
    const input = await planInput(73);
    const first = buildC5PilotPlan(input);
    const repeated = buildC5PilotPlan(input);
    const differentSeed = buildC5PilotPlan(await planInput(74));

    expect(serializeC5PilotPlan(first)).toBe(serializeC5PilotPlan(repeated));
    expect(serializeC5PilotPlan(first)).not.toBe(
      serializeC5PilotPlan(differentSeed),
    );
    expect(first.randomization).toMatchObject({
      algorithm: "sha256-ranked-balanced-pair-order-v1",
      goodMemoryFirstClusters: 6,
      noMemoryFirstClusters: 6,
      orderSeed: 73,
    });
    expect(first.clusters.filter((cluster) =>
      cluster.armOrder[0] === "goodmemory-installed"
    )).toHaveLength(6);
    expect(first.clusters.filter((cluster) =>
      cluster.armOrder[0] === "no-memory"
    )).toHaveLength(6);

    for (const cluster of first.clusters) {
      expect(new Set(cluster.armOrder)).toEqual(
        new Set(["no-memory", "goodmemory-installed"]),
      );
      const runs = first.episodeArmRuns.filter((run) =>
        run.clusterId === cluster.id
      );
      expect(runs.map((run) => run.arm)).toEqual(cluster.armOrder);
      for (const stageId of ["stage-1", "stage-2", "stage-3"]) {
        const pairedStages = runs.map((run) =>
          run.stages.find((stage) => stage.stageId === stageId)
        );
        expect(pairedStages[0]?.pairedTaskInputSha256).toBe(
          pairedStages[1]?.pairedTaskInputSha256,
        );
        expect(pairedStages[0]?.stageRunIdentitySha256).not.toBe(
          pairedStages[1]?.stageRunIdentitySha256,
        );
      }
    }
  });

  it("rejects invalid order seeds and any post-freeze plan mutation", async () => {
    const input = await planInput(73);
    expect(() => buildC5PilotPlan({
      ...input,
      materialEffectPercentagePoints: 0,
    })).toThrow("C5 material effect must be an integer from 1 to 50");
    expect(() => buildC5PilotPlan({ ...input, orderSeed: 0 })).toThrow(
      "C5 order seed must be a positive safe integer",
    );

    const plan = buildC5PilotPlan(input);
    expect(() => verifyC5PilotPlan({
      ...plan,
      publicClaimEligible: true as false,
    }, input)).toThrow("C5 pilot plan does not match its frozen inputs");
    expect(() => verifyC5PilotPlan({
      ...plan,
      clusters: plan.clusters.map((cluster, index) =>
        index === 0
          ? { ...cluster, armOrder: [...cluster.armOrder].reverse() }
          : cluster
      ),
    }, input)).toThrow("C5 pilot plan does not match its frozen inputs");
  });
});

async function planInput(orderSeed: number) {
  const loaded = await loadCodexCodingEffectDataset(
    "fixtures/codex-coding-effect/c4-controlled-pilot",
  );
  return {
    assetLockSha256: SHA_A,
    assetRootSha256: SHA_B,
    baselineCeilingReportSha256: SHA_C,
    c4ReadinessReportSha256: SHA_D,
    dataset: loaded.dataset,
    manifestSha256: SHA_E,
    materialEffectPercentagePoints: 10,
    orderSeed,
  } as const;
}
