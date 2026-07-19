import { createHash } from "node:crypto";

import { c4BaselineStageInputSha256 } from "./c4-baseline-ceiling";
import { validateC4ControlledPilotDataset } from "./c4-contracts";
import type {
  CodexCodingEffectDataset,
  CodexCodingEffectDatasetV2,
} from "./dataset";

export const C5_PILOT_ARMS = [
  "no-memory",
  "goodmemory-installed",
] as const;

export type C5PilotArm = typeof C5_PILOT_ARMS[number];

export interface C5PilotPlanInput {
  assetLockSha256: string;
  assetRootSha256: string;
  baselineCeilingReportSha256: string;
  c4ReadinessReportSha256: string;
  dataset: CodexCodingEffectDataset;
  manifestSha256: string;
  materialEffectPercentagePoints: number;
  orderSeed: number;
}

export interface C5PilotCluster {
  armOrder: C5PilotArm[];
  episodeId: string;
  executionPosition: number;
  id: string;
  randomizationRankSha256: string;
  repetition: 1 | 2;
}

export interface C5PilotStageRun {
  c4StageInputSha256: string;
  freshSession: true;
  id: string;
  memoryExpectation: "irrelevant-control" | "none" | "required";
  pairedTaskInputSha256: string;
  position: number;
  priorStageIds: string[];
  promptPath: string;
  repositoryReset: "declared-stage-snapshot";
  resume: false;
  snapshot: string;
  stageId: string;
  stageRunIdentitySha256: string;
}

export interface C5PilotEpisodeArmRun {
  arm: C5PilotArm;
  armOrderPosition: 1 | 2;
  clusterId: string;
  episodeId: string;
  executionPosition: number;
  id: string;
  repetition: 1 | 2;
  stages: C5PilotStageRun[];
  stateMode: "canonical-snapshot";
}

export interface C5PilotPlan {
  analysis: {
    bootstrapSamples: 10_000;
    confidenceLevel: 0.95;
    materialEffectPercentagePoints: number;
    power: 0.8;
    primaryResamplingUnit: "episode";
  };
  arms: ["no-memory", "goodmemory-installed"];
  bindings: {
    assetLockSha256: string;
    assetRootSha256: string;
    baselineCeilingReportSha256: string;
    c4ReadinessReportSha256: string;
    manifestSha256: string;
  };
  claimBoundary: "internal-native-longitudinal-pilot-only";
  clusters: C5PilotCluster[];
  counts: {
    arms: 2;
    codexProcesses: number;
    episodeArmRuns: number;
    episodes: number;
    repetitions: 2;
    stageRuns: number;
    stages: number;
  };
  datasetId: "codex-c4-controlled-pilot-v2";
  datasetSnapshotMode: "asset-locked-copy";
  episodeArmRuns: C5PilotEpisodeArmRun[];
  evidenceClass: "native-longitudinal-pilot";
  excludedHosts: ["claude-code"];
  frozenPrehistoryUse: "leakage-audit-reference-only-never-seeded";
  historyPolicy: "native-stop-writeback-only";
  host: "codex";
  maxConcurrency: 1;
  networkAccess: false;
  phase: "C5";
  publicClaimEligible: false;
  publicCodingEffectProof: false;
  randomization: {
    algorithm: "sha256-ranked-balanced-pair-order-v1";
    clusterOrderSha256: string;
    goodMemoryFirstClusters: number;
    noMemoryFirstClusters: number;
    orderSeed: number;
  };
  readmeRowAllowed: false;
  repetitions: [1, 2];
  schemaVersion: 1;
  sessionPolicy: "fresh-codex-process-no-resume-per-stage";
}

interface ClusterCandidate {
  armRankSha256: string;
  clusterRankSha256: string;
  episode: CodexCodingEffectDatasetV2["episodes"][number];
  id: string;
  repetition: 1 | 2;
}

export function buildC5PilotPlan(input: C5PilotPlanInput): C5PilotPlan {
  validateInput(input);
  const dataset = validateC5Dataset(input.dataset);
  const candidates = buildClusterCandidates(dataset, input.orderSeed);
  const goodMemoryFirst = new Set(
    [...candidates]
      .sort(compareArmRank)
      .slice(0, candidates.length / 2)
      .map((candidate) => candidate.id),
  );
  const orderedCandidates = [...candidates].sort(compareClusterRank);
  const clusters = orderedCandidates.map((candidate, index): C5PilotCluster => ({
    armOrder: goodMemoryFirst.has(candidate.id)
      ? ["goodmemory-installed", "no-memory"]
      : ["no-memory", "goodmemory-installed"],
    episodeId: candidate.episode.id,
    executionPosition: index + 1,
    id: candidate.id,
    randomizationRankSha256: candidate.clusterRankSha256,
    repetition: candidate.repetition,
  }));
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const episodeArmRuns = clusters.flatMap((cluster) => {
    const candidate = candidatesById.get(cluster.id);
    if (candidate === undefined) {
      throw new Error(`missing C5 cluster candidate ${cluster.id}`);
    }
    return cluster.armOrder.map((arm, armIndex) => buildEpisodeArmRun({
      arm,
      armOrderPosition: (armIndex + 1) as 1 | 2,
      candidate,
      cluster,
      input,
    }));
  });
  const stageCount = dataset.episodes.reduce(
    (count, episode) => count + episode.stages.length,
    0,
  );
  const clusterOrderSha256 = sha256(JSON.stringify(clusters.map((cluster) => ({
    armOrder: cluster.armOrder,
    id: cluster.id,
  }))));

  return {
    analysis: {
      bootstrapSamples: 10_000,
      confidenceLevel: 0.95,
      materialEffectPercentagePoints: input.materialEffectPercentagePoints,
      power: 0.8,
      primaryResamplingUnit: "episode",
    },
    arms: ["no-memory", "goodmemory-installed"],
    bindings: {
      assetLockSha256: input.assetLockSha256,
      assetRootSha256: input.assetRootSha256,
      baselineCeilingReportSha256: input.baselineCeilingReportSha256,
      c4ReadinessReportSha256: input.c4ReadinessReportSha256,
      manifestSha256: input.manifestSha256,
    },
    claimBoundary: "internal-native-longitudinal-pilot-only",
    clusters,
    counts: {
      arms: 2,
      codexProcesses: episodeArmRuns.reduce(
        (count, run) => count + run.stages.length,
        0,
      ),
      episodeArmRuns: episodeArmRuns.length,
      episodes: dataset.episodes.length,
      repetitions: 2,
      stageRuns: episodeArmRuns.reduce(
        (count, run) => count + run.stages.length,
        0,
      ),
      stages: stageCount,
    },
    datasetId: "codex-c4-controlled-pilot-v2",
    datasetSnapshotMode: "asset-locked-copy",
    episodeArmRuns,
    evidenceClass: "native-longitudinal-pilot",
    excludedHosts: ["claude-code"],
    frozenPrehistoryUse: "leakage-audit-reference-only-never-seeded",
    historyPolicy: "native-stop-writeback-only",
    host: "codex",
    maxConcurrency: 1,
    networkAccess: false,
    phase: "C5",
    publicClaimEligible: false,
    publicCodingEffectProof: false,
    randomization: {
      algorithm: "sha256-ranked-balanced-pair-order-v1",
      clusterOrderSha256,
      goodMemoryFirstClusters: clusters.filter((cluster) =>
        cluster.armOrder[0] === "goodmemory-installed"
      ).length,
      noMemoryFirstClusters: clusters.filter((cluster) =>
        cluster.armOrder[0] === "no-memory"
      ).length,
      orderSeed: input.orderSeed,
    },
    readmeRowAllowed: false,
    repetitions: [1, 2],
    schemaVersion: 1,
    sessionPolicy: "fresh-codex-process-no-resume-per-stage",
  };
}

export function serializeC5PilotPlan(plan: C5PilotPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

export function verifyC5PilotPlan(
  plan: C5PilotPlan,
  input: C5PilotPlanInput,
): void {
  const expected = buildC5PilotPlan(input);
  if (serializeC5PilotPlan(plan) !== serializeC5PilotPlan(expected)) {
    throw new Error("C5 pilot plan does not match its frozen inputs");
  }
}

function buildClusterCandidates(
  dataset: CodexCodingEffectDatasetV2,
  orderSeed: number,
): ClusterCandidate[] {
  return dataset.episodes.flatMap((episode) =>
    ([1, 2] as const).map((repetition) => {
      const id = `${episode.id}/repetition-${repetition}`;
      return {
        armRankSha256: randomizationHash(orderSeed, "arm-order", id),
        clusterRankSha256: randomizationHash(orderSeed, "cluster-order", id),
        episode,
        id,
        repetition,
      };
    })
  );
}

function buildEpisodeArmRun(input: {
  arm: C5PilotArm;
  armOrderPosition: 1 | 2;
  candidate: ClusterCandidate;
  cluster: C5PilotCluster;
  input: C5PilotPlanInput;
}): C5PilotEpisodeArmRun {
  const runId = `${input.cluster.id}/${input.arm}`;
  return {
    arm: input.arm,
    armOrderPosition: input.armOrderPosition,
    clusterId: input.cluster.id,
    episodeId: input.candidate.episode.id,
    executionPosition:
      ((input.cluster.executionPosition - 1) * C5_PILOT_ARMS.length) +
      input.armOrderPosition,
    id: runId,
    repetition: input.candidate.repetition,
    stages: input.candidate.episode.stages.map((stage, index) => {
      const priorStageIds = input.candidate.episode.stages
        .slice(0, index)
        .map((priorStage) => priorStage.id);
      const pairedTaskInputSha256 = sha256(JSON.stringify({
        datasetId: input.input.dataset.datasetId,
        episodeId: input.candidate.episode.id,
        manifestSha256: input.input.manifestSha256,
        preparation: input.candidate.episode.preparation,
        priorStageIds,
        protocol: "native-longitudinal",
        repetition: input.candidate.repetition,
        repository: input.candidate.episode.repository,
        stage,
        stateMode: input.candidate.episode.stateMode,
      }));
      return {
        c4StageInputSha256: c4BaselineStageInputSha256(
          input.candidate.episode,
          stage,
        ),
        freshSession: true,
        id: `${runId}/${stage.id}`,
        memoryExpectation: stage.memoryExpectation.mode,
        pairedTaskInputSha256,
        position: stage.position,
        priorStageIds,
        promptPath: stage.promptPath,
        repositoryReset: "declared-stage-snapshot",
        resume: false,
        snapshot: stage.snapshot,
        stageId: stage.id,
        stageRunIdentitySha256: sha256(JSON.stringify({
          arm: input.arm,
          pairedTaskInputSha256,
          runId,
        })),
      };
    }),
    stateMode: "canonical-snapshot",
  };
}

function compareArmRank(first: ClusterCandidate, second: ClusterCandidate): number {
  return first.armRankSha256.localeCompare(second.armRankSha256) ||
    first.id.localeCompare(second.id);
}

function compareClusterRank(
  first: ClusterCandidate,
  second: ClusterCandidate,
): number {
  return first.clusterRankSha256.localeCompare(second.clusterRankSha256) ||
    first.id.localeCompare(second.id);
}

function randomizationHash(
  orderSeed: number,
  purpose: "arm-order" | "cluster-order",
  clusterId: string,
): string {
  return sha256(JSON.stringify({ clusterId, orderSeed, purpose }));
}

function validateC5Dataset(
  dataset: CodexCodingEffectDataset,
): CodexCodingEffectDatasetV2 {
  const validated = validateC4ControlledPilotDataset(dataset);
  for (const episode of validated.episodes) {
    if (episode.stateMode !== "canonical-snapshot") {
      throw new Error(`C5 pilot episode ${episode.id} must use canonical-snapshot`);
    }
    if (episode.stages.length !== 3) {
      throw new Error(`C5 pilot episode ${episode.id} must have exactly 3 stages`);
    }
  }
  return validated;
}

function validateInput(input: C5PilotPlanInput): void {
  if (
    !Number.isSafeInteger(input.materialEffectPercentagePoints) ||
    input.materialEffectPercentagePoints < 1 ||
    input.materialEffectPercentagePoints > 50
  ) {
    throw new Error(
      "C5 material effect must be an integer from 1 to 50 percentage points",
    );
  }
  if (!Number.isSafeInteger(input.orderSeed) || input.orderSeed <= 0) {
    throw new Error("C5 order seed must be a positive safe integer");
  }
  for (const [name, value] of Object.entries({
    assetLockSha256: input.assetLockSha256,
    assetRootSha256: input.assetRootSha256,
    baselineCeilingReportSha256: input.baselineCeilingReportSha256,
    c4ReadinessReportSha256: input.c4ReadinessReportSha256,
    manifestSha256: input.manifestSha256,
  })) {
    if (!/^[a-f0-9]{64}$/u.test(value)) {
      throw new Error(`C5 ${name} must be a SHA-256 digest`);
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
