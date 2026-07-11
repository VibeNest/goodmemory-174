import type { MemoryPacket } from "../src/recall/contextBuilder";

export const PHASE70_RERANKER_MODEL = "gpt-5.6-terra";
export const PHASE70_RERANKER_GATEWAY = "https://ai.gurkiai.com/v1";
export const PHASE70_RERANKER_REQUEST_TIMEOUT_MS = 60_000;
export const PHASE70_LOCOMO_BENCHMARK_FINGERPRINT =
  "d134ede9c6e3371ca31f6b9769e3ceeeaebaacaebbc1a4d3548220e9887abc66";
export const PHASE70_TARGET_MIN_EVIDENCE_RECALL_DELTA = 0.03;
export const PHASE70_TARGET_MIN_NOISE_REDUCTION_RATIO = 0.2;
export const PHASE70_PROTECTION_MAX_EVIDENCE_RECALL_REGRESSION = 0.01;
export const PHASE70_MIN_TARGET_QUESTIONS = 20;
export const PHASE70_MIN_PROTECTION_QUESTIONS = 10;

export interface Phase70ContextMetrics {
  contextTurnIds: string[];
  evidenceRecall: number;
  noiseTurnCount: number;
}

export interface Phase70RerankerRow {
  baseline: Phase70ContextMetrics;
  candidate: Phase70ContextMetrics;
  caseId: string;
  category: string;
  cohort: "protection" | "target";
  evidenceTurnIds: string[];
  membershipUnchanged: boolean;
  questionId: string;
  reranker: {
    candidateCount: number;
    fallbackReason?: string;
    latencyMs: number;
    scoreCount: number;
    status: "applied" | "fallback" | "skipped";
  };
}

export interface Phase70CohortSummary {
  baselineEvidenceRecall: number;
  baselineNoisePerQuestion: number;
  candidateEvidenceRecall: number;
  candidateNoisePerQuestion: number;
  evidenceRecallDelta: number;
  noiseReductionRatio: number;
  questionCount: number;
}

export interface Phase70RerankerEvalReport {
  benchmark: "locomo";
  benchmarkFingerprint: string;
  benchmarkSource: string;
  executionFailures: number;
  generatedAt: string;
  metric: "memory-packet-top-6";
  model: {
    gateway: string;
    model: string;
    provider: "openai";
    requestTimeoutMs: number;
    role: "reranker";
  };
  rows: Phase70RerankerRow[];
  runId: string;
  selection: {
    manifestPath: string;
    manifestSha256: string;
    protectionCount: number;
    targetCount: number;
  };
  summary: Phase70RerankerSummary;
}

export interface Phase70RerankerSummary {
  overall: Phase70CohortSummary;
  protection: Phase70CohortSummary;
  target: Phase70CohortSummary;
}

export interface Phase70FallbackProof {
  fallbackReason: "provider_error";
  fallbackResultDigest: string;
  originalResultDigest: string;
  status: "fallback";
}

export interface Phase70GateResult {
  failures: string[];
  protection: Phase70CohortSummary;
  status: "failed" | "passed";
  target: Phase70CohortSummary;
  thresholds: {
    minProtectionQuestions: number;
    minTargetQuestions: number;
    protectionMaxEvidenceRecallRegression: number;
    targetMinEvidenceRecallDelta: number;
    targetMinNoiseReductionRatio: number;
  };
}

export function collectPacketTurnIds(
  packet: Pick<MemoryPacket, "factSummary">,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const content = packet.factSummary ?? "";
  for (const match of content.matchAll(/\bdia_id[:=](D\d+:\d+)/gu)) {
    const id = match[1];
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function summarizeCohort(
  rows: readonly Phase70RerankerRow[],
): Phase70CohortSummary {
  const questionCount = rows.length;
  if (questionCount === 0) {
    return {
      baselineEvidenceRecall: 0,
      baselineNoisePerQuestion: 0,
      candidateEvidenceRecall: 0,
      candidateNoisePerQuestion: 0,
      evidenceRecallDelta: 0,
      noiseReductionRatio: 0,
      questionCount: 0,
    };
  }
  const baselineEvidenceRecall =
    rows.reduce((sum, row) => sum + row.baseline.evidenceRecall, 0) /
    questionCount;
  const candidateEvidenceRecall =
    rows.reduce((sum, row) => sum + row.candidate.evidenceRecall, 0) /
    questionCount;
  const baselineNoisePerQuestion =
    rows.reduce((sum, row) => sum + row.baseline.noiseTurnCount, 0) /
    questionCount;
  const candidateNoisePerQuestion =
    rows.reduce((sum, row) => sum + row.candidate.noiseTurnCount, 0) /
    questionCount;
  return {
    baselineEvidenceRecall,
    baselineNoisePerQuestion,
    candidateEvidenceRecall,
    candidateNoisePerQuestion,
    evidenceRecallDelta: candidateEvidenceRecall - baselineEvidenceRecall,
    noiseReductionRatio:
      baselineNoisePerQuestion === 0
        ? 0
        : (baselineNoisePerQuestion - candidateNoisePerQuestion) /
          baselineNoisePerQuestion,
    questionCount,
  };
}

export function summarizePhase70RerankerRows(
  rows: readonly Phase70RerankerRow[],
): Phase70RerankerSummary {
  return {
    overall: summarizeCohort(rows),
    protection: summarizeCohort(
      rows.filter((row) => row.cohort === "protection"),
    ),
    target: summarizeCohort(rows.filter((row) => row.cohort === "target")),
  };
}

function sameSummary(
  left: Phase70RerankerSummary,
  right: Phase70RerankerSummary,
): boolean {
  const keys: Array<keyof Phase70CohortSummary> = [
    "baselineEvidenceRecall",
    "baselineNoisePerQuestion",
    "candidateEvidenceRecall",
    "candidateNoisePerQuestion",
    "evidenceRecallDelta",
    "noiseReductionRatio",
    "questionCount",
  ];
  return (["overall", "protection", "target"] as const).every((cohort) =>
    keys.every(
      (key) => Math.abs(left[cohort][key] - right[cohort][key]) <= 1e-12,
    ),
  );
}

export function evaluatePhase70RerankerGate(
  report: Phase70RerankerEvalReport,
  fallbackProof: Phase70FallbackProof,
): Phase70GateResult {
  const failures: string[] = [];
  const summary = summarizePhase70RerankerRows(report.rows);
  const targetRows = report.rows.filter((row) => row.cohort === "target");
  const protectionRows = report.rows.filter(
    (row) => row.cohort === "protection",
  );
  const rowIds = report.rows.map((row) => `${row.caseId}:${row.questionId}`);

  if (report.benchmark !== "locomo") {
    failures.push("Phase 70 report benchmark must be locomo");
  }
  if (report.benchmarkFingerprint !== PHASE70_LOCOMO_BENCHMARK_FINGERPRINT) {
    failures.push("LoCoMo benchmark fingerprint is not the pinned Phase 70 source");
  }
  if (
    report.model.provider !== "openai" ||
    report.model.model !== PHASE70_RERANKER_MODEL ||
    report.model.gateway !== PHASE70_RERANKER_GATEWAY ||
    report.model.requestTimeoutMs !== PHASE70_RERANKER_REQUEST_TIMEOUT_MS ||
    report.model.role !== "reranker"
  ) {
    failures.push(
      `Phase 70 reranker must use ${PHASE70_RERANKER_MODEL} through ${PHASE70_RERANKER_GATEWAY} with a ${PHASE70_RERANKER_REQUEST_TIMEOUT_MS}ms timeout`,
    );
  }
  if (report.metric !== "memory-packet-top-6") {
    failures.push("Phase 70 must score the real memory-packet top-6 context");
  }
  if (report.executionFailures !== 0) {
    failures.push(`executionFailures must be 0, received ${report.executionFailures}`);
  }
  if (new Set(rowIds).size !== rowIds.length) {
    failures.push("Phase 70 report contains duplicate questions");
  }
  if (targetRows.length < PHASE70_MIN_TARGET_QUESTIONS) {
    failures.push(
      `target cohort must contain at least ${PHASE70_MIN_TARGET_QUESTIONS} questions`,
    );
  }
  if (protectionRows.length < PHASE70_MIN_PROTECTION_QUESTIONS) {
    failures.push(
      `protection cohort must contain at least ${PHASE70_MIN_PROTECTION_QUESTIONS} questions`,
    );
  }
  if (
    report.selection.targetCount !== targetRows.length ||
    report.selection.protectionCount !== protectionRows.length
  ) {
    failures.push("selection counts do not match report rows");
  }
  if (!/^[a-f0-9]{64}$/u.test(report.selection.manifestSha256)) {
    failures.push("selection manifest SHA-256 is invalid");
  }
  if (!sameSummary(report.summary, summary)) {
    failures.push("report summary does not match question rows");
  }
  if (report.rows.some((row) => row.membershipUnchanged !== true)) {
    failures.push("reranking changed candidate membership");
  }
  if (report.rows.some((row) => row.reranker.status === "fallback")) {
    failures.push("focused provider run contains reranker fallback rows");
  }
  if (report.rows.some((row) => row.reranker.status !== "applied")) {
    failures.push("every focused row must apply provider reranking");
  }
  if (
    report.rows.some(
      (row) =>
        row.reranker.status === "applied" &&
        row.reranker.scoreCount !== row.reranker.candidateCount,
    )
  ) {
    failures.push("applied reranker rows must score every candidate");
  }

  const targetImproved =
    summary.target.evidenceRecallDelta + Number.EPSILON >=
      PHASE70_TARGET_MIN_EVIDENCE_RECALL_DELTA ||
    (summary.target.evidenceRecallDelta + Number.EPSILON >=
      -PHASE70_PROTECTION_MAX_EVIDENCE_RECALL_REGRESSION &&
      summary.target.noiseReductionRatio + Number.EPSILON >=
        PHASE70_TARGET_MIN_NOISE_REDUCTION_RATIO);
  if (!targetImproved) {
    failures.push(
      "target cohort did not gain 0.03 evidence recall or reduce context noise by 20%",
    );
  }
  if (
    summary.protection.evidenceRecallDelta + Number.EPSILON <
    -PHASE70_PROTECTION_MAX_EVIDENCE_RECALL_REGRESSION
  ) {
    failures.push("protection cohort regressed by more than 0.01 evidence recall");
  }
  if (
    fallbackProof.status !== "fallback" ||
    fallbackProof.fallbackReason !== "provider_error" ||
    fallbackProof.originalResultDigest !== fallbackProof.fallbackResultDigest
  ) {
    failures.push("provider failure did not preserve deterministic recall");
  }

  return {
    failures,
    protection: summary.protection,
    status: failures.length === 0 ? "passed" : "failed",
    target: summary.target,
    thresholds: {
      minProtectionQuestions: PHASE70_MIN_PROTECTION_QUESTIONS,
      minTargetQuestions: PHASE70_MIN_TARGET_QUESTIONS,
      protectionMaxEvidenceRecallRegression:
        PHASE70_PROTECTION_MAX_EVIDENCE_RECALL_REGRESSION,
      targetMinEvidenceRecallDelta: PHASE70_TARGET_MIN_EVIDENCE_RECALL_DELTA,
      targetMinNoiseReductionRatio: PHASE70_TARGET_MIN_NOISE_REDUCTION_RATIO,
    },
  };
}
