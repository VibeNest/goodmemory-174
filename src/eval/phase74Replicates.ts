import {
  inferExactMcNemar,
  type ExactMcNemarInference,
  type PairedMeanDeltaInference,
} from "./phase74PairedInference";

export interface Phase74ReplicateCaseOutcome {
  caseId: string;
  clusterId: string;
  passed: boolean;
  value: number;
}

export interface Phase74ReplicateComparison {
  baselineArm: string;
  benchmark: "locomo" | "longmemeval";
  candidateArm: string;
  selectedCaseIdsSha256: string;
  stage: "E1" | "E2" | "E3";
}

const PHASE74_REPLICATE_ARMS = {
  E1: {
    baselineArm: "fact-only",
    candidateArm: "atomic-contextual-raw-pointer",
  },
  E2: {
    baselineArm: "claim-temporal-off",
    candidateArm: "claim-temporal-on",
  },
  E3: {
    baselineArm: "recall-plan-off",
    candidateArm: "recall-plan-deterministic",
  },
} as const;

export function buildPhase74ReplicateComparison(input: {
  benchmark: Phase74ReplicateComparison["benchmark"];
  selectedCaseIdsSha256: string;
  stage: Phase74ReplicateComparison["stage"];
}): Phase74ReplicateComparison {
  if (!/^[a-f0-9]{64}$/u.test(input.selectedCaseIdsSha256)) {
    throw new Error("Phase 74 replicate comparison requires a SHA-256 case digest.");
  }
  return {
    ...PHASE74_REPLICATE_ARMS[input.stage],
    benchmark: input.benchmark,
    selectedCaseIdsSha256: input.selectedCaseIdsSha256,
    stage: input.stage,
  };
}

export interface Phase74ReplicateRun {
  baseline: readonly Phase74ReplicateCaseOutcome[];
  candidate: readonly Phase74ReplicateCaseOutcome[];
  comparison: Phase74ReplicateComparison;
  experimentIdentityHash: string;
  identityHash: string;
  replicate: 1 | 2 | 3;
  runId: string;
}

export interface Phase74ReplicateAggregation {
  caseCount: number;
  clusterCount: number;
  comparison: Phase74ReplicateComparison;
  inference: Phase74HierarchicalInference;
  mcnemarByReplicate: Array<{
    inference: ExactMcNemarInference;
    replicate: 1 | 2 | 3;
  }>;
  replicates: readonly [1, 2, 3];
  replicateDeltas: number[];
}

export interface Phase74HierarchicalInference
  extends PairedMeanDeltaInference {
  replicateCount: number;
  samplingUnit: "replicate-and-cluster";
}

function comparisonKey(comparison: Phase74ReplicateComparison): string {
  return JSON.stringify([
    comparison.benchmark,
    comparison.stage,
    comparison.baselineArm,
    comparison.candidateArm,
    comparison.selectedCaseIdsSha256,
  ]);
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function assertSamePopulation(
  reference: readonly Phase74ReplicateCaseOutcome[],
  candidate: readonly Phase74ReplicateCaseOutcome[],
): void {
  if (reference.length !== candidate.length) {
    throw new Error(
      `paired inputs must have equal lengths: baseline=${reference.length}, candidate=${candidate.length}`,
    );
  }
  const seen = new Set<string>();
  for (let index = 0; index < reference.length; index += 1) {
    const expected = reference[index]!;
    const received = candidate[index]!;
    if (seen.has(expected.caseId)) {
      throw new Error(`paired inputs contain duplicate case ID ${expected.caseId}`);
    }
    seen.add(expected.caseId);
    if (expected.caseId !== received.caseId) {
      throw new Error(
        `paired case ID mismatch at index ${index}: expected ${expected.caseId}, received ${received.caseId}`,
      );
    }
    if (expected.clusterId !== received.clusterId) {
      throw new Error(`cluster identity drift for ${expected.caseId}`);
    }
  }
}

function clusterMeans(
  outcomes: readonly { caseId: string; clusterId: string; value: number }[],
) {
  const groups = new Map<string, number[]>();
  for (const outcome of outcomes) {
    groups.set(outcome.clusterId, [
      ...(groups.get(outcome.clusterId) ?? []),
      outcome.value,
    ]);
  }
  return [...groups].map(([caseId, values]) => ({
    caseId,
    value: mean(values),
  }));
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function percentile(sortedValues: readonly number[], probability: number): number {
  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex]!;
  const upper = sortedValues[upperIndex]!;
  return lower + (upper - lower) * (position - lowerIndex);
}

interface Phase74ClusterDelta {
  count: number;
  sum: number;
}

function runClusterDeltas(run: Phase74ReplicateRun): Phase74ClusterDelta[] {
  const grouped = new Map<string, number[]>();
  for (let index = 0; index < run.baseline.length; index += 1) {
    const baseline = run.baseline[index]!;
    const candidate = run.candidate[index]!;
    grouped.set(baseline.clusterId, [
      ...(grouped.get(baseline.clusterId) ?? []),
      candidate.value - baseline.value,
    ]);
  }
  return [...grouped.values()].map((values) => ({
    count: values.length,
    sum: values.reduce((total, value) => total + value, 0),
  }));
}

function questionWeightedMean(deltas: readonly Phase74ClusterDelta[]): number {
  const total = deltas.reduce((sum, cluster) => sum + cluster.sum, 0);
  const count = deltas.reduce((sum, cluster) => sum + cluster.count, 0);
  return total / count;
}

function inferHierarchicalDelta(input: {
  bootstrapSamples?: number;
  runs: readonly Phase74ReplicateRun[];
  seed?: number;
}): Phase74HierarchicalInference {
  const bootstrapSamples = input.bootstrapSamples ?? 10_000;
  const seed = input.seed ?? 74;
  if (!Number.isInteger(bootstrapSamples) || bootstrapSamples <= 0) {
    throw new Error("bootstrapSamples must be a positive integer");
  }
  if (!Number.isInteger(seed)) {
    throw new Error("seed must be an integer");
  }
  const deltas = input.runs.map(runClusterDeltas);
  const clusterCount = deltas[0]!.length;
  const random = createSeededRandom(seed);
  const sampledMeans: number[] = [];
  for (let sample = 0; sample < bootstrapSamples; sample += 1) {
    let total = 0;
    let caseCount = 0;
    for (let replicateDraw = 0; replicateDraw < deltas.length; replicateDraw += 1) {
      const replicate = deltas[Math.floor(random() * deltas.length)]!;
      for (let clusterDraw = 0; clusterDraw < clusterCount; clusterDraw += 1) {
        const cluster = replicate[Math.floor(random() * clusterCount)]!;
        total += cluster.sum;
        caseCount += cluster.count;
      }
    }
    sampledMeans.push(total / caseCount);
  }
  sampledMeans.sort((left, right) => left - right);
  return {
    bootstrapSamples,
    caseCount: input.runs[0]!.baseline.length,
    confidenceLevel: 0.95,
    delta: mean(deltas.map(questionWeightedMean)),
    lower: percentile(sampledMeans, 0.025),
    method: "paired-bootstrap",
    replicateCount: deltas.length,
    samplingUnit: "replicate-and-cluster",
    seed,
    upper: percentile(sampledMeans, 0.975),
  };
}

export function aggregatePhase74Replicates(input: {
  bootstrapSamples?: number;
  runs: readonly Phase74ReplicateRun[];
  seed?: number;
}): Phase74ReplicateAggregation {
  const runs = [...input.runs].sort(
    (left, right) => left.replicate - right.replicate,
  );
  if (
    runs.length !== 3 ||
    runs[0]?.replicate !== 1 ||
    runs[1]?.replicate !== 2 ||
    runs[2]?.replicate !== 3
  ) {
    throw new Error("Phase 74 requires replicates 1, 2, and 3 exactly once.");
  }
  if (new Set(runs.map(({ experimentIdentityHash }) =>
    experimentIdentityHash
  )).size !== 1) {
    throw new Error("Phase 74 replicate experiment identity drift.");
  }
  for (const run of runs) {
    const expected = buildPhase74ReplicateComparison({
      benchmark: run.comparison.benchmark,
      selectedCaseIdsSha256: run.comparison.selectedCaseIdsSha256,
      stage: run.comparison.stage,
    });
    if (comparisonKey(run.comparison) !== comparisonKey(expected)) {
      throw new Error("Phase 74 replicate comparison arms do not match its stage.");
    }
  }
  if (new Set(runs.map(({ comparison }) => comparisonKey(comparison))).size !== 1) {
    throw new Error("Phase 74 replicate comparison identity drift.");
  }
  if (new Set(runs.map(({ runId }) => runId)).size !== runs.length) {
    throw new Error("Phase 74 replicate run IDs must be unique.");
  }
  if (new Set(runs.map(({ identityHash }) => identityHash)).size !== runs.length) {
    throw new Error(
      "Phase 74 replicate run identity hashes must be unique.",
    );
  }

  const reference = runs[0]!.baseline;
  for (const run of runs) {
    assertSamePopulation(run.baseline, run.candidate);
    assertSamePopulation(reference, run.baseline);
  }

  const clusterCount = clusterMeans(reference).length;
  const inference = inferHierarchicalDelta({
    ...(input.bootstrapSamples === undefined
      ? {}
      : { bootstrapSamples: input.bootstrapSamples }),
    runs,
    ...(input.seed === undefined ? {} : { seed: input.seed }),
  });
  const replicateDeltas = runs.map((run) =>
    questionWeightedMean(runClusterDeltas(run))
  );
  return {
    caseCount: reference.length,
    clusterCount,
    comparison: runs[0]!.comparison,
    inference,
    mcnemarByReplicate: runs.map((run) => ({
      inference: inferExactMcNemar({
        baseline: run.baseline.map(({ caseId, passed }) => ({ caseId, passed })),
        candidate: run.candidate.map(({ caseId, passed }) => ({ caseId, passed })),
      }),
      replicate: run.replicate,
    })),
    replicates: [1, 2, 3],
    replicateDeltas,
  };
}
