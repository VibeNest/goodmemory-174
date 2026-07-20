import type { ModelUsageOperation } from "../provider/model-usage";

export const PHASE74_MAX_AVERAGE_MODEL_TOKEN_INCREASE_RATIO = 0.15;
export const PHASE74_MAX_P95_LATENCY_INCREASE_RATIO = 0.25;
export const PHASE74_MAX_PROTECTION_REGRESSION = 0.01;
export const PHASE74_MAX_RENDERED_CONTEXT_TOKENS = 6_000;
export const PHASE74_MIN_IMPROVED_FAMILIES = 2;
export const PHASE74_MIN_INDEPENDENT_RUNS = 3;
export const PHASE74_MIN_PRIMARY_FAMILY_DELTA = 0.03;
export const PHASE74_MIN_SECONDARY_FAMILY_DELTA = 0.01;
export const PHASE74_REQUIRED_CONFIDENCE_LEVEL = 0.95;
export const PHASE74_MODEL_USAGE_ACCOUNTING_VERSION =
  "phase74-model-usage-v2";
export const PHASE74_MODEL_USAGE_ALLOCATION_POLICY =
  "standalone-full-shared-v1";

const COMPARISON_TOLERANCE = 1e-12;

export interface Phase74ConfidenceEvidence {
  confidenceLevel: number;
  lower: number;
  method: "paired-bootstrap";
  upper: number;
}

export interface Phase74FamilyEvidence {
  delta: number;
  family: string;
  inference: Phase74ConfidenceEvidence;
  runIds: string[];
}

export interface Phase74ProtectionEvidence {
  delta: number;
  name: string;
}

export interface Phase74ModelUsageBranchEvidence {
  answerGenerationCaseCount: number;
  caseIdsSha256: string;
  completeRequestCount: number;
  logicalCaseCount: number;
  missingRequestCount: number;
  operationCounts: Partial<Record<ModelUsageOperation, number>>;
  partialRequestCount: number;
  pendingRequestCount: number;
  requestCount: number;
  totalTokens: number;
  unobservedCaseIds: string[];
}

export interface Phase74ModelUsagePoolEvidence {
  completeRequestCount: number;
  keyCount: number;
  keysSha256: string;
  missingRequestCount: number;
  operationCounts: Partial<Record<ModelUsageOperation, number>>;
  partialRequestCount: number;
  pendingRequestCount: number;
  requestCount: number;
  totalTokens: number;
}

export interface Phase74ModelUsageEvidence {
  accountingVersion: typeof PHASE74_MODEL_USAGE_ACCOUNTING_VERSION;
  allocationPolicy: typeof PHASE74_MODEL_USAGE_ALLOCATION_POLICY;
  baseline: Phase74ModelUsageBranchEvidence;
  candidate: Phase74ModelUsageBranchEvidence;
  costBoundary: "full-product" | "query-only" | "reader-only";
  ingestion: {
    baselineExclusive: Phase74ModelUsagePoolEvidence;
    candidateExclusive: Phase74ModelUsagePoolEvidence;
    shared: Phase74ModelUsagePoolEvidence;
  };
}

export interface Phase74PromotionGateInput {
  evidenceBoundary: {
    goldAware: boolean;
    protocolReader: boolean;
    seenCasesOnly: boolean;
  };
  families: Phase74FamilyEvidence[];
  operations: {
    baselineP95LatencyMs: number;
    candidateP95LatencyMs: number;
    executionFailures: number;
    modelUsage: Phase74ModelUsageEvidence;
    renderedContextMaxTokens: number;
  };
  protections: Phase74ProtectionEvidence[];
  // Deltas are candidate minus baseline; only hallucination rate is lower-is-better.
  safety: {
    abstentionAccuracyDelta: number;
    hallucinationRateDelta: number;
    privacyPassRateDelta: number;
    updateCorrectnessDelta: number;
  };
}

export interface Phase74PromotionGateResult {
  failures: string[];
  qualifyingFamilies: {
    primary?: string;
    secondary?: string;
  };
  status: "failed" | "passed";
  thresholds: {
    maxAverageModelTokenIncreaseRatio: number;
    maxP95LatencyIncreaseRatio: number;
    maxProtectionRegression: number;
    maxRenderedContextTokens: number;
    minImprovedFamilies: number;
    minIndependentRuns: number;
    minPrimaryFamilyDelta: number;
    minSecondaryFamilyDelta: number;
    requiredConfidenceLevel: number;
  };
}

function isAtLeast(value: number, threshold: number): boolean {
  return value + COMPARISON_TOLERANCE >= threshold;
}

function isAtMost(value: number, threshold: number): boolean {
  return value <= threshold + COMPARISON_TOLERANCE;
}

function selectQualifyingFamilies(
  families: readonly Phase74FamilyEvidence[],
): Phase74PromotionGateResult["qualifyingFamilies"] {
  let firstPrimary: Phase74FamilyEvidence | undefined;
  for (const primary of families) {
    if (!isAtLeast(primary.delta, PHASE74_MIN_PRIMARY_FAMILY_DELTA)) {
      continue;
    }
    firstPrimary ??= primary;
    const secondary = families.find(
      (candidate) =>
        candidate.family !== primary.family &&
        isAtLeast(candidate.delta, PHASE74_MIN_SECONDARY_FAMILY_DELTA) &&
        candidate.inference.lower > 0,
    );
    if (secondary) {
      return {
        primary: primary.family,
        secondary: secondary.family,
      };
    }
  }
  return firstPrimary ? { primary: firstPrimary.family } : {};
}

function validateModelUsageBranch(input: {
  branch: "baseline" | "candidate";
  evidence: Phase74ModelUsageBranchEvidence;
  failures: string[];
}): number | null {
  const { branch, evidence, failures } = input;
  const countFields = [
    evidence.answerGenerationCaseCount,
    evidence.completeRequestCount,
    evidence.logicalCaseCount,
    evidence.missingRequestCount,
    evidence.partialRequestCount,
    evidence.pendingRequestCount,
    evidence.requestCount,
  ];
  if (countFields.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    failures.push(`${branch} model usage counts must be non-negative integers`);
    return null;
  }
  if (evidence.logicalCaseCount === 0) {
    failures.push(`${branch} model usage logicalCaseCount must be greater than 0`);
  }
  if (evidence.caseIdsSha256.trim() === "") {
    failures.push(`${branch} model usage caseIdsSha256 is required`);
  }
  const operationCounts = Object.values(evidence.operationCounts);
  if (operationCounts.some((value) =>
    value === undefined || !Number.isSafeInteger(value) || value < 0
  )) {
    failures.push(`${branch} model usage operation counts are invalid`);
  }
  const operationRequestCount = operationCounts.reduce(
    (total, value) => total + (value ?? 0),
    0,
  );
  if (operationRequestCount !== evidence.requestCount) {
    failures.push(`${branch} model usage operation counts are inconsistent`);
  }
  if (
    evidence.answerGenerationCaseCount !== evidence.logicalCaseCount ||
    (evidence.operationCounts.answer_generation ?? 0) <
      evidence.logicalCaseCount
  ) {
    failures.push(
      `${branch} model usage must contain answer generation for every logical case`,
    );
  }
  if (evidence.unobservedCaseIds.length > 0) {
    failures.push(`${branch} model usage has unobserved logical cases`);
  }
  if ((evidence.operationCounts.judge ?? 0) > 0) {
    failures.push(`${branch} product model usage must not include judge operations`);
  }
  if (evidence.requestCount === 0 || evidence.completeRequestCount === 0) {
    failures.push(
      `${branch} model usage must contain at least one complete request`,
    );
  }
  if (
    evidence.completeRequestCount +
        evidence.partialRequestCount +
        evidence.missingRequestCount +
        evidence.pendingRequestCount !==
      evidence.requestCount
  ) {
    failures.push(`${branch} model usage request counts are inconsistent`);
  }
  if (evidence.pendingRequestCount > 0) {
    failures.push(`${branch} model usage contains pending requests`);
  }
  if (
    evidence.partialRequestCount > 0 ||
    evidence.missingRequestCount > 0 ||
    evidence.completeRequestCount !== evidence.requestCount
  ) {
    failures.push(`${branch} model usage contains incomplete requests`);
  }
  if (!Number.isFinite(evidence.totalTokens) || evidence.totalTokens <= 0) {
    failures.push(`${branch} model usage totalTokens must be greater than 0`);
  }
  if (evidence.logicalCaseCount === 0 || evidence.totalTokens <= 0) {
    return null;
  }
  return evidence.totalTokens / evidence.logicalCaseCount;
}

function validateModelUsagePool(input: {
  evidence: Phase74ModelUsagePoolEvidence;
  failures: string[];
  pool: keyof Phase74ModelUsageEvidence["ingestion"];
}): void {
  const { evidence, failures, pool } = input;
  const label = `${pool} ingestion model usage`;
  const countFields = [
    evidence.completeRequestCount,
    evidence.keyCount,
    evidence.missingRequestCount,
    evidence.partialRequestCount,
    evidence.pendingRequestCount,
    evidence.requestCount,
    evidence.totalTokens,
  ];
  if (countFields.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    failures.push(`${label} counts must be non-negative integers`);
  }
  if (evidence.keysSha256.trim() === "") {
    failures.push(`${label} keysSha256 is required`);
  }
  const operationCounts = Object.values(evidence.operationCounts);
  if (operationCounts.some((value) =>
    value === undefined || !Number.isSafeInteger(value) || value < 0
  )) {
    failures.push(`${label} operation counts are invalid`);
  }
  const operationRequestCount = operationCounts.reduce(
    (total, value) => total + (value ?? 0),
    0,
  );
  if (operationRequestCount !== evidence.requestCount) {
    failures.push(`${label} operation counts are inconsistent`);
  }
  if (
    evidence.completeRequestCount +
        evidence.partialRequestCount +
        evidence.missingRequestCount +
        evidence.pendingRequestCount !==
      evidence.requestCount
  ) {
    failures.push(`${label} request counts are inconsistent`);
  }
  if (evidence.pendingRequestCount > 0) {
    failures.push(`${label} contains pending requests`);
  }
  if (evidence.keyCount > 0 && evidence.requestCount === 0) {
    failures.push(`${label} must contain requests for every allocated key`);
  }
  if (
    evidence.keyCount > 0 &&
    (evidence.operationCounts.assisted_extraction ?? 0) < evidence.keyCount
  ) {
    failures.push(
      `${label} must contain assisted extraction for every allocated key`,
    );
  }
  if (
    evidence.partialRequestCount > 0 ||
    evidence.missingRequestCount > 0 ||
    evidence.pendingRequestCount > 0 ||
    evidence.completeRequestCount !== evidence.requestCount
  ) {
    failures.push(`${label} contains incomplete requests`);
  }
}

function resolveAverageModelTokens(input: {
  failures: string[];
  modelUsage: Phase74ModelUsageEvidence | undefined;
}): { baseline: number; candidate: number } | null {
  if (!input.modelUsage) {
    input.failures.push("complete model usage evidence is required");
    return null;
  }
  if (
    input.modelUsage.accountingVersion !==
    PHASE74_MODEL_USAGE_ACCOUNTING_VERSION
  ) {
    input.failures.push(
      `model usage accountingVersion must be ${PHASE74_MODEL_USAGE_ACCOUNTING_VERSION}`,
    );
  }
  if (
    input.modelUsage.allocationPolicy !==
    PHASE74_MODEL_USAGE_ALLOCATION_POLICY
  ) {
    input.failures.push(
      `model usage allocationPolicy must be ${PHASE74_MODEL_USAGE_ALLOCATION_POLICY}`,
    );
  }
  if (input.modelUsage.costBoundary !== "full-product") {
    input.failures.push("model usage costBoundary must be full-product");
  }
  for (const pool of [
    "baselineExclusive",
    "candidateExclusive",
    "shared",
  ] as const) {
    validateModelUsagePool({
      evidence: input.modelUsage.ingestion[pool],
      failures: input.failures,
      pool,
    });
  }
  const baseline = validateModelUsageBranch({
    branch: "baseline",
    evidence: input.modelUsage.baseline,
    failures: input.failures,
  });
  const candidate = validateModelUsageBranch({
    branch: "candidate",
    evidence: input.modelUsage.candidate,
    failures: input.failures,
  });
  if (
    input.modelUsage.baseline.logicalCaseCount !==
    input.modelUsage.candidate.logicalCaseCount
  ) {
    input.failures.push(
      "baseline and candidate model usage must cover the same logical cases",
    );
  }
  if (
    input.modelUsage.baseline.caseIdsSha256 !==
    input.modelUsage.candidate.caseIdsSha256
  ) {
    input.failures.push(
      "baseline and candidate model usage must cover the identical case cohort",
    );
  }
  return baseline === null || candidate === null
    ? null
    : { baseline, candidate };
}

export function evaluatePhase74PromotionGate(
  input: Phase74PromotionGateInput,
): Phase74PromotionGateResult {
  const failures: string[] = [];
  const familyNames = input.families.map(({ family }) => family);

  if (new Set(familyNames).size !== familyNames.length) {
    failures.push("benchmark families must be unique");
  }

  for (const family of input.families) {
    const independentRunCount = new Set(family.runIds).size;
    if (independentRunCount < PHASE74_MIN_INDEPENDENT_RUNS) {
      failures.push(
        `${family.family} must contain at least ${PHASE74_MIN_INDEPENDENT_RUNS} independent runs, received ${independentRunCount}`,
      );
    }
    if (independentRunCount !== family.runIds.length) {
      failures.push(`${family.family} contains duplicate run identities`);
    }
    if (family.inference.method !== "paired-bootstrap") {
      failures.push(
        `${family.family} promotion confidence evidence must use paired-bootstrap`,
      );
    }
    if (
      Math.abs(
        family.inference.confidenceLevel - PHASE74_REQUIRED_CONFIDENCE_LEVEL,
      ) > COMPARISON_TOLERANCE
    ) {
      failures.push(
        `${family.family} confidence evidence must use a ${PHASE74_REQUIRED_CONFIDENCE_LEVEL} confidence level`,
      );
    }
    if (
      !isAtLeast(family.delta, family.inference.lower) ||
      !isAtMost(family.delta, family.inference.upper)
    ) {
      failures.push(
        `${family.family} confidence interval must contain its observed delta`,
      );
    }
  }

  const improvedFamilyCount = new Set(
    input.families
      .filter(({ delta }) => delta > 0)
      .map(({ family }) => family),
  ).size;
  if (improvedFamilyCount < PHASE74_MIN_IMPROVED_FAMILIES) {
    failures.push(
      `at least ${PHASE74_MIN_IMPROVED_FAMILIES} independent benchmark families must improve`,
    );
  }

  const qualifyingFamilies = selectQualifyingFamilies(input.families);
  if (!qualifyingFamilies.primary) {
    failures.push(
      `no family improved by at least ${PHASE74_MIN_PRIMARY_FAMILY_DELTA}`,
    );
  }
  if (!qualifyingFamilies.secondary) {
    failures.push(
      `no distinct secondary family improved by at least ${PHASE74_MIN_SECONDARY_FAMILY_DELTA} with a 95% confidence lower bound above 0`,
    );
  }

  if (input.protections.length === 0) {
    failures.push("at least one protection set is required");
  }
  for (const protection of input.protections) {
    if (
      !isAtLeast(protection.delta, -PHASE74_MAX_PROTECTION_REGRESSION)
    ) {
      failures.push(
        `${protection.name} regressed by more than ${PHASE74_MAX_PROTECTION_REGRESSION}`,
      );
    }
  }

  const { operations } = input;
  const averageModelTokens = resolveAverageModelTokens({
    failures,
    modelUsage: operations.modelUsage,
  });
  if (
    !isAtMost(
      operations.renderedContextMaxTokens,
      PHASE74_MAX_RENDERED_CONTEXT_TOKENS,
    )
  ) {
    failures.push(
      `rendered context exceeded ${PHASE74_MAX_RENDERED_CONTEXT_TOKENS} tokens`,
    );
  }
  if (
    averageModelTokens &&
    !isAtMost(
      averageModelTokens.candidate,
      averageModelTokens.baseline *
        (1 + PHASE74_MAX_AVERAGE_MODEL_TOKEN_INCREASE_RATIO),
    )
  ) {
    failures.push("average model tokens increased by more than 15%");
  }
  if (
    !isAtMost(
      operations.candidateP95LatencyMs,
      operations.baselineP95LatencyMs *
        (1 + PHASE74_MAX_P95_LATENCY_INCREASE_RATIO),
    )
  ) {
    failures.push("p95 latency increased by more than 25%");
  }
  if (operations.executionFailures !== 0) {
    failures.push(
      `executionFailures must be 0, received ${operations.executionFailures}`,
    );
  }

  if (input.safety.hallucinationRateDelta > COMPARISON_TOLERANCE) {
    failures.push("hallucination rate regressed");
  }
  if (input.safety.updateCorrectnessDelta < -COMPARISON_TOLERANCE) {
    failures.push("update correctness regressed");
  }
  if (input.safety.abstentionAccuracyDelta < -COMPARISON_TOLERANCE) {
    failures.push("abstention accuracy regressed");
  }
  if (input.safety.privacyPassRateDelta < -COMPARISON_TOLERANCE) {
    failures.push("privacy pass rate regressed");
  }

  if (input.evidenceBoundary.protocolReader) {
    failures.push(
      "protocol-reader results cannot authorize product promotion",
    );
  }
  if (input.evidenceBoundary.goldAware) {
    failures.push("gold-aware results cannot authorize product promotion");
  }
  if (input.evidenceBoundary.seenCasesOnly) {
    failures.push("seen-case-only results cannot authorize product promotion");
  }

  return {
    failures,
    qualifyingFamilies,
    status: failures.length === 0 ? "passed" : "failed",
    thresholds: {
      maxAverageModelTokenIncreaseRatio:
        PHASE74_MAX_AVERAGE_MODEL_TOKEN_INCREASE_RATIO,
      maxP95LatencyIncreaseRatio: PHASE74_MAX_P95_LATENCY_INCREASE_RATIO,
      maxProtectionRegression: PHASE74_MAX_PROTECTION_REGRESSION,
      maxRenderedContextTokens: PHASE74_MAX_RENDERED_CONTEXT_TOKENS,
      minImprovedFamilies: PHASE74_MIN_IMPROVED_FAMILIES,
      minIndependentRuns: PHASE74_MIN_INDEPENDENT_RUNS,
      minPrimaryFamilyDelta: PHASE74_MIN_PRIMARY_FAMILY_DELTA,
      minSecondaryFamilyDelta: PHASE74_MIN_SECONDARY_FAMILY_DELTA,
      requiredConfidenceLevel: PHASE74_REQUIRED_CONFIDENCE_LEVEL,
    },
  };
}
