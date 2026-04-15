import type {
  FeedbackResult,
  RecallResult,
  RememberResult,
} from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import {
  createExperienceRecord,
  type ExperienceModelInfluence,
  type ExperienceRecord,
} from "./contracts";

interface ObservationRecordInput {
  createdAt: string;
  createId: () => string;
  scope: MemoryScope;
  traceId: string;
}

function collectUnique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function collectUniqueFromGroups(groups: Array<readonly string[] | undefined>): string[] {
  return collectUnique(groups.flatMap((group) => group ?? []));
}

function resolveRememberInfluence(result: RememberResult): ExperienceModelInfluence {
  if (result.metadata?.resolvedExtractionStrategy === "llm-assisted") {
    return "llm-assisted";
  }

  return "rules-only";
}

function resolveRecallInfluence(result: RecallResult): ExperienceModelInfluence {
  if (result.metadata.routingDecision.strategy === "llm-assisted") {
    return "llm-assisted";
  }

  return "rules-only";
}

function buildRememberSummary(result: RememberResult): string {
  return `Remember accepted ${result.accepted} candidate(s) and rejected ${result.rejected} candidate(s).`;
}

function buildRecallSummary(result: RecallResult): string {
  if (result.metadata.policyApplied.includes("ignore_memory")) {
    return "Recall skipped memory retrieval because ignoreMemory was enabled.";
  }

  return `Recall ${result.metadata.routingDecision.strategy} returned ${result.metadata.hits.length} hit(s).`;
}

function buildVerifySummary(result: RecallResult): string {
  return `Verification raised ${result.metadata.verificationHints.length} hint(s) for recalled memory.`;
}

function resolveRecallOutcome(
  result: RecallResult,
): "success" | "failure" | "mixed" | "skipped" {
  if (result.metadata.policyApplied.includes("ignore_memory")) {
    return "skipped";
  }

  return result.metadata.hits.length > 0 ? "success" : "failure";
}

function buildFeedbackSummary(result: FeedbackResult): string {
  if (!result.accepted) {
    return "Feedback was rejected before it became durable guidance.";
  }

  return `Feedback ${result.outcome ?? "accepted"} as ${
    result.kind ?? "general guidance"
  }.`;
}

export function buildRememberExperienceRecord(
  input: ObservationRecordInput & { result: RememberResult },
): ExperienceRecord {
  const linkedMemoryIds = collectUnique(
    input.result.events.map((event) => event.memoryId),
  );
  const linkedEvidenceIds = collectUniqueFromGroups(
    input.result.events.map((event) => event.evidenceIds),
  );
  const policyApplied = collectUnique(
    input.result.events
      .map((event) => event.reason)
      .filter((reason) => reason?.startsWith("policy")),
  );

  return createExperienceRecord({
    id: input.createId(),
    userId: input.scope.userId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    agentId: input.scope.agentId,
    sessionId: input.scope.sessionId,
    kind: "remember",
    traceId: input.traceId,
    trigger: "api",
    modelInfluence: resolveRememberInfluence(input.result),
    summary: buildRememberSummary(input.result),
    outcome:
      input.result.accepted > 0 && input.result.rejected > 0
        ? "mixed"
        : input.result.accepted > 0
          ? "success"
          : input.result.rejected > 0
            ? "failure"
            : "skipped",
    policyApplied,
    metrics: {
      accepted: input.result.accepted,
      rejected: input.result.rejected,
    },
    linkedMemoryIds,
    linkedEvidenceIds,
    createdAt: input.createdAt,
  });
}

export function buildRecallExperienceRecords(
  input: ObservationRecordInput & { result: RecallResult },
): ExperienceRecord[] {
  const linkedMemoryIds = collectUnique([
    ...input.result.preferences.map((record) => record.id),
    ...input.result.references.map((record) => record.id),
    ...input.result.facts.map((record) => record.id),
    ...input.result.feedback.map((record) => record.id),
    ...input.result.episodes.map((record) => record.id),
  ]);
  const linkedArchiveIds = collectUnique(
    input.result.archives.map((record) => record.id),
  );
  const linkedEvidenceIds = collectUnique([
    ...input.result.evidence.map((record) => record.id),
    ...collectUniqueFromGroups(
      input.result.metadata.hits.map((hit) => hit.evidenceIds),
    ),
    ...collectUniqueFromGroups(
      input.result.metadata.verificationHints.map((hint) => hint.evidenceIds),
    ),
  ]);

  const recallRecord = createExperienceRecord({
    id: input.createId(),
    userId: input.scope.userId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    agentId: input.scope.agentId,
    sessionId: input.scope.sessionId,
    kind: "recall",
    traceId: input.traceId,
    trigger: "api",
    modelInfluence: resolveRecallInfluence(input.result),
    summary: buildRecallSummary(input.result),
    outcome: resolveRecallOutcome(input.result),
    policyApplied: input.result.metadata.policyApplied,
    metrics: {
      hitCount: input.result.metadata.hits.length,
      verificationHintCount: input.result.metadata.verificationHints.length,
      latencyMs: input.result.metadata.latencyMs,
      tokenCount: input.result.metadata.tokenCount,
    },
    linkedMemoryIds,
    linkedArchiveIds,
    linkedEvidenceIds,
    createdAt: input.createdAt,
  });

  if (input.result.metadata.verificationHints.length === 0) {
    return [recallRecord];
  }

  const verifyRecord = createExperienceRecord({
    id: input.createId(),
    userId: input.scope.userId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    agentId: input.scope.agentId,
    sessionId: input.scope.sessionId,
    kind: "verify",
    traceId: input.traceId,
    sourceTraceIds: [input.traceId],
    trigger: "api",
    modelInfluence: resolveRecallInfluence(input.result),
    summary: buildVerifySummary(input.result),
    outcome: "mixed",
    policyApplied: input.result.metadata.policyApplied,
    metrics: {
      verificationHintCount: input.result.metadata.verificationHints.length,
    },
    linkedMemoryIds: collectUnique(
      input.result.metadata.verificationHints.map((hint) => hint.memoryId),
    ),
    linkedEvidenceIds: collectUniqueFromGroups(
      input.result.metadata.verificationHints.map((hint) => hint.evidenceIds),
    ),
    createdAt: input.createdAt,
  });

  return [recallRecord, verifyRecord];
}

export function buildFeedbackExperienceRecord(
  input: ObservationRecordInput & { result: FeedbackResult },
): ExperienceRecord {
  return createExperienceRecord({
    id: input.createId(),
    userId: input.scope.userId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    agentId: input.scope.agentId,
    sessionId: input.scope.sessionId,
    kind: "feedback",
    traceId: input.traceId,
    trigger: "api",
    modelInfluence:
      input.result.metadata?.analysisMode === "rules-only" ? "rules-only" : "none",
    summary: buildFeedbackSummary(input.result),
    outcome: input.result.accepted ? "success" : "failure",
    metrics: {
      accepted: input.result.accepted ? 1 : 0,
      rejected: input.result.accepted ? 0 : 1,
    },
    linkedMemoryIds: collectUnique([input.result.memoryId]),
    createdAt: input.createdAt,
  });
}
