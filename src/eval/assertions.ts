import type { ScenarioFixture } from "./dataset";
import type { EvalAnswerPackage } from "./runners";
import {
  findAffirmedSignals,
  findMissingAffirmedSignals,
  findNegatedSignals,
} from "./signalMatching";

export interface EvalAssertionCheck {
  id:
    | "transfer_signals_present"
    | "non_transfer_signals_absent"
    | "update_wins_present"
    | "stale_suppression_absent"
    | "wrong_personalization_absent"
    | "provenance_explainable";
  passed: boolean;
  details: string[];
}

export interface EvalAssertionSummary {
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  checks: EvalAssertionCheck[];
  contaminationFindings: string[];
  updateFindings: string[];
}

function collectSurfacedEvidenceText(answerPackage: EvalAnswerPackage): string {
  const segments: string[] = [answerPackage.answer];

  if (answerPackage.memoryContext) {
    segments.push(answerPackage.memoryContext);
  }

  const retrieved = answerPackage.retrieved;
  if (retrieved?.renderedMemoryContext && !answerPackage.memoryContext) {
    segments.push(retrieved.renderedMemoryContext);
  }

  return segments.join("\n");
}

function buildPositiveSignalAssessment(input: {
  signals: string[];
  haystack: string;
  answer: string;
}): {
  missing: string[];
  conflicted: string[];
} {
  const missing = new Set(findMissingAffirmedSignals(input.signals, input.haystack));
  const negatedInAnswer = new Set(findNegatedSignals(input.signals, input.answer));
  const affirmedInAnswer = new Set(findAffirmedSignals(input.signals, input.answer));
  const conflicted = new Set<string>();

  for (const signal of negatedInAnswer) {
    if (affirmedInAnswer.has(signal)) {
      conflicted.add(signal);
      continue;
    }

    missing.add(signal);
  }

  return {
    missing: [...missing],
    conflicted: [...conflicted],
  };
}

function buildSignalCheck(input: {
  id: EvalAssertionCheck["id"];
  expectedPresent?: string[];
  expectedAbsent?: string[];
  haystack: string;
  answer?: string;
}): EvalAssertionCheck {
  if (input.expectedPresent) {
    const assessment = buildPositiveSignalAssessment({
      signals: input.expectedPresent,
      haystack: input.haystack,
      answer: input.answer ?? "",
    });
    return {
      id: input.id,
      passed:
        assessment.missing.length === 0 && assessment.conflicted.length === 0,
      details:
        assessment.missing.length === 0 && assessment.conflicted.length === 0
          ? input.expectedPresent.map((signal) => `present:${signal}`)
          : [
              ...assessment.missing.map((signal) => `missing:${signal}`),
              ...assessment.conflicted.map((signal) => `conflicted:${signal}`),
            ],
    };
  }

  const matched = findAffirmedSignals(input.expectedAbsent ?? [], input.haystack);
  return {
    id: input.id,
    passed: matched.length === 0,
    details:
      matched.length === 0
        ? (input.expectedAbsent ?? []).map((signal) => `absent:${signal}`)
        : matched.map((signal) => `unexpected:${signal}`),
  };
}

function buildPositiveUpdateFindings(input: {
  signals: string[];
  haystack: string;
  answer: string;
}): string[] {
  const assessment = buildPositiveSignalAssessment(input);
  return [
    ...assessment.missing,
    ...assessment.conflicted.map((signal) => `conflicted:${signal}`),
  ];
}

function buildProvenanceCheck(answerPackage: EvalAnswerPackage): EvalAssertionCheck {
  const retrieved = answerPackage.retrieved;
  if (!retrieved) {
    return {
      id: "provenance_explainable",
      passed: false,
      details: ["missing:retrieved_memory"],
    };
  }

  const missingHitReasons = retrieved.hits.filter((hit) => !hit.reason);
  const missingSourceMethods = retrieved.hits.filter((hit) => {
    return (
      (hit.type === "fact" || hit.type === "preference" || hit.type === "reference") &&
      !hit.sourceMethod
    );
  });
  const missingWriteReasons = answerPackage.trace.rememberEvents.flatMap((session) =>
    (session.events ?? [])
      .filter((event) => !event.reason)
      .map((event) => `${session.sessionId}:${event.memoryType}`),
  );
  const missingCandidateTraceForHits = retrieved.hits
    .filter(
      (hit) =>
        (hit.type === "fact" ||
          hit.type === "reference" ||
          hit.type === "episode") &&
        !retrieved.candidateTraces.some(
          (trace) => trace.memoryId === hit.id && trace.returned,
        ),
    )
    .map((hit) => `missing_candidate_trace_for_hit:${hit.type}:${hit.id}`);
  const incompleteCandidateTraceReasons = retrieved.candidateTraces
    .filter((trace) => (trace.returned ? !trace.whyReturned : !trace.whySuppressed))
    .map((trace) => `missing_candidate_trace_reason:${trace.memoryType}:${trace.memoryId}`);

  const details = [
    ...missingHitReasons.map((hit) => `missing_hit_reason:${hit.type}:${hit.id}`),
    ...missingSourceMethods.map((hit) => `missing_source_method:${hit.type}:${hit.id}`),
    ...missingWriteReasons.map((entry) => `missing_write_reason:${entry}`),
    ...missingCandidateTraceForHits,
    ...incompleteCandidateTraceReasons,
  ];

  return {
    id: "provenance_explainable",
    passed: details.length === 0,
    details: details.length > 0 ? details : ["provenance:complete"],
  };
}

export function evaluateScenarioAssertions(input: {
  scenario: ScenarioFixture;
  goodmemory: EvalAnswerPackage;
}): EvalAssertionSummary {
  const haystack = collectSurfacedEvidenceText(input.goodmemory);
  const answer = input.goodmemory.answer;
  const checks: EvalAssertionCheck[] = [
    buildSignalCheck({
      id: "transfer_signals_present",
      expectedPresent: input.scenario.evaluation.expected_transfer_signals,
      haystack,
      answer,
    }),
    buildSignalCheck({
      id: "non_transfer_signals_absent",
      expectedAbsent: input.scenario.evaluation.expected_non_transfer_signals,
      haystack,
    }),
    buildSignalCheck({
      id: "update_wins_present",
      expectedPresent: input.scenario.evaluation.expected_update_wins,
      haystack,
      answer,
    }),
    buildSignalCheck({
      id: "stale_suppression_absent",
      expectedAbsent: input.scenario.evaluation.expected_stale_suppression,
      haystack,
    }),
    buildSignalCheck({
      id: "wrong_personalization_absent",
      expectedAbsent: input.scenario.evaluation.wrong_personalization_signals,
      haystack,
    }),
    buildProvenanceCheck(input.goodmemory),
  ];

  const contaminationFindings = [
    ...findAffirmedSignals(
      input.scenario.evaluation.expected_non_transfer_signals,
      haystack,
    ),
    ...findAffirmedSignals(
      input.scenario.evaluation.wrong_personalization_signals,
      haystack,
    ),
  ];
  const updateFindings = [
    ...buildPositiveUpdateFindings({
      signals: input.scenario.evaluation.expected_update_wins,
      haystack,
      answer,
    }),
    ...findAffirmedSignals(
      input.scenario.evaluation.expected_stale_suppression,
      haystack,
    ),
  ];
  const passedChecks = checks.filter((check) => check.passed).length;

  return {
    passed: passedChecks === checks.length,
    totalChecks: checks.length,
    passedChecks,
    checks,
    contaminationFindings,
    updateFindings,
  };
}
