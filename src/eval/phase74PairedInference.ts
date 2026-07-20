const DEFAULT_BOOTSTRAP_SAMPLES = 10_000;
const DEFAULT_BOOTSTRAP_SEED = 74;
const LOWER_PERCENTILE = 0.025;
const UPPER_PERCENTILE = 0.975;

interface CaseIdentity {
  caseId: string;
}

export interface NumericCaseOutcome extends CaseIdentity {
  value: number;
}

export interface BinaryCaseOutcome extends CaseIdentity {
  passed: boolean;
}

export interface PairedMeanDeltaInput {
  baseline: readonly NumericCaseOutcome[];
  bootstrapSamples?: number;
  candidate: readonly NumericCaseOutcome[];
  seed?: number;
}

export interface PairedMeanDeltaInference {
  bootstrapSamples: number;
  caseCount: number;
  confidenceLevel: 0.95;
  delta: number;
  lower: number;
  method: "paired-bootstrap";
  seed: number;
  upper: number;
}

export interface ExactMcNemarInput {
  baseline: readonly BinaryCaseOutcome[];
  candidate: readonly BinaryCaseOutcome[];
}

export interface ExactMcNemarInference {
  baselineOnly: number;
  candidateOnly: number;
  caseCount: number;
  discordantCount: number;
  method: "mcnemar";
  pValue: number;
}

function assertAlignedCases(
  baseline: readonly CaseIdentity[],
  candidate: readonly CaseIdentity[],
): void {
  if (baseline.length !== candidate.length) {
    throw new Error(
      `paired inputs must have equal lengths: baseline=${baseline.length}, candidate=${candidate.length}`,
    );
  }
  if (baseline.length === 0) {
    throw new Error("paired inputs must contain at least one case");
  }

  const seen = new Set<string>();
  for (let index = 0; index < baseline.length; index += 1) {
    const expected = baseline[index]!.caseId;
    if (seen.has(expected)) {
      throw new Error(`paired inputs contain duplicate case ID ${expected}`);
    }
    seen.add(expected);
    const received = candidate[index]!.caseId;
    if (expected !== received) {
      throw new Error(
        `paired case ID mismatch at index ${index}: expected ${expected}, received ${received}`,
      );
    }
  }
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

function mean(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

function percentile(sortedValues: readonly number[], probability: number): number {
  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex]!;
  const upper = sortedValues[upperIndex]!;
  return lower + (upper - lower) * (position - lowerIndex);
}

export function inferPairedMeanDelta(
  input: PairedMeanDeltaInput,
): PairedMeanDeltaInference {
  assertAlignedCases(input.baseline, input.candidate);

  const bootstrapSamples = input.bootstrapSamples ?? DEFAULT_BOOTSTRAP_SAMPLES;
  const seed = input.seed ?? DEFAULT_BOOTSTRAP_SEED;
  if (!Number.isInteger(bootstrapSamples) || bootstrapSamples <= 0) {
    throw new Error("bootstrapSamples must be a positive integer");
  }
  if (!Number.isInteger(seed)) {
    throw new Error("seed must be an integer");
  }

  const deltas = input.baseline.map(
    ({ value }, index) => input.candidate[index]!.value - value,
  );
  const random = createSeededRandom(seed);
  const sampledMeans: number[] = [];

  for (let sample = 0; sample < bootstrapSamples; sample += 1) {
    let sampledTotal = 0;
    for (let draw = 0; draw < deltas.length; draw += 1) {
      sampledTotal += deltas[Math.floor(random() * deltas.length)]!;
    }
    sampledMeans.push(sampledTotal / deltas.length);
  }
  sampledMeans.sort((left, right) => left - right);

  return {
    bootstrapSamples,
    caseCount: deltas.length,
    confidenceLevel: 0.95,
    delta: mean(deltas),
    lower: percentile(sampledMeans, LOWER_PERCENTILE),
    method: "paired-bootstrap",
    seed,
    upper: percentile(sampledMeans, UPPER_PERCENTILE),
  };
}

function addLogProbabilities(left: number, right: number): number {
  if (left === Number.NEGATIVE_INFINITY) {
    return right;
  }
  const larger = Math.max(left, right);
  const smaller = Math.min(left, right);
  return larger + Math.log1p(Math.exp(smaller - larger));
}

function binomialHalfLowerTail(trials: number, successes: number): number {
  let logProbability = -trials * Math.LN2;
  let logTotal = Number.NEGATIVE_INFINITY;
  for (let count = 0; count <= successes; count += 1) {
    logTotal = addLogProbabilities(logTotal, logProbability);
    logProbability +=
      Math.log(trials - count) - Math.log(count + 1);
  }
  return Math.exp(logTotal);
}

export function inferExactMcNemar(
  input: ExactMcNemarInput,
): ExactMcNemarInference {
  assertAlignedCases(input.baseline, input.candidate);

  let baselineOnly = 0;
  let candidateOnly = 0;
  for (let index = 0; index < input.baseline.length; index += 1) {
    const baselinePassed = input.baseline[index]!.passed;
    const candidatePassed = input.candidate[index]!.passed;
    if (baselinePassed && !candidatePassed) {
      baselineOnly += 1;
    } else if (!baselinePassed && candidatePassed) {
      candidateOnly += 1;
    }
  }

  const discordantCount = baselineOnly + candidateOnly;
  const smallerDiscordantCount = Math.min(baselineOnly, candidateOnly);
  const pValue =
    discordantCount === 0
      ? 1
      : Math.min(
          1,
          2 *
            binomialHalfLowerTail(
              discordantCount,
              smallerDiscordantCount,
            ),
        );

  return {
    baselineOnly,
    candidateOnly,
    caseCount: input.baseline.length,
    discordantCount,
    method: "mcnemar",
    pValue,
  };
}
