import { createExperienceRecord, EXPERIENCES_COLLECTION } from "../evolution/contracts";
import type { ExperienceRecord } from "../evolution/contracts";
import type { HostActionAssessmentRecordInput, HostActionAssessmentRecordResult } from "./integrationSupport";
import type { DocumentStore } from "../storage/contracts";
import type { ForgetInput } from "./contracts";

function summarizeHostActionAssessment(
  input: HostActionAssessmentRecordInput,
): string {
  const parts = [
    `Host pre-action policy ${input.decision}`,
    input.actionSummary,
  ];
  if (input.reason.trim().length > 0) {
    parts.push(input.reason.trim());
  }
  if (input.requiredPreconditions.length > 0) {
    parts.push(`Preconditions: ${input.requiredPreconditions.join("; ")}.`);
  }
  if (input.recommendedFirstStepSummary?.trim()) {
    parts.push(`First step: ${input.recommendedFirstStepSummary.trim()}.`);
  }
  return parts.join(". ");
}

function resolveHostActionAssessmentOutcome(
  decision: HostActionAssessmentRecordInput["decision"],
): ExperienceRecord["outcome"] {
  if (decision === "blocked" || decision === "review_required") {
    return "skipped";
  }

  return "success";
}

function encodeHostActionAssessmentKeyPart(label: string, value: string): string {
  return `${label}=${encodeURIComponent(value)}`;
}

function buildHostActionAssessmentExperienceId(
  assessment: HostActionAssessmentRecordInput,
): string {
  const scopeKey = [
    encodeHostActionAssessmentKeyPart("user", assessment.scope.userId),
    assessment.scope.tenantId
      ? encodeHostActionAssessmentKeyPart("tenant", assessment.scope.tenantId)
      : undefined,
    assessment.scope.workspaceId
      ? encodeHostActionAssessmentKeyPart("workspace", assessment.scope.workspaceId)
      : undefined,
    assessment.scope.agentId
      ? encodeHostActionAssessmentKeyPart("agent", assessment.scope.agentId)
      : undefined,
    assessment.scope.sessionId
      ? encodeHostActionAssessmentKeyPart("session", assessment.scope.sessionId)
      : undefined,
  ].filter((segment): segment is string => Boolean(segment));
  const lineageKey = [
    assessment.runId
      ? encodeHostActionAssessmentKeyPart("run", assessment.runId)
      : undefined,
    assessment.attemptId
      ? encodeHostActionAssessmentKeyPart("attempt", assessment.attemptId)
      : undefined,
    encodeHostActionAssessmentKeyPart("turn", assessment.turnId),
    encodeHostActionAssessmentKeyPart("action", assessment.actionId),
  ].filter((segment): segment is string => Boolean(segment));

  return `host_action_assessment.${[...scopeKey, ...lineageKey].join(".")}`;
}

export async function recordHostActionAssessment(input: {
  assessment: HostActionAssessmentRecordInput;
  documentStore: DocumentStore;
  persist(input: {
    experience: ExperienceRecord;
    scope: ForgetInput["scope"];
  }): Promise<void>;
}): Promise<HostActionAssessmentRecordResult> {
  const experienceId = buildHostActionAssessmentExperienceId(input.assessment);
  const existing = await input.documentStore.get(EXPERIENCES_COLLECTION, experienceId);
  if (existing) {
    return {
      experienceId,
      recorded: false,
    };
  }

  const experience = createExperienceRecord({
    id: experienceId,
    userId: input.assessment.scope.userId,
    tenantId: input.assessment.scope.tenantId,
    workspaceId: input.assessment.scope.workspaceId,
    agentId: input.assessment.scope.agentId,
    sessionId: input.assessment.scope.sessionId,
    kind: "maintenance",
    traceId: input.assessment.actionId,
    sourceTraceIds: [input.assessment.actionId],
    trigger: "governance",
    modelInfluence: "none",
    summary: summarizeHostActionAssessment(input.assessment),
    outcome: resolveHostActionAssessmentOutcome(input.assessment.decision),
    policyApplied: input.assessment.policyApplied,
    metrics: {
      verificationHintCount: input.assessment.requiredPreconditions.length,
    },
    linkedMemoryIds: input.assessment.matchedMemoryIds,
    linkedEvidenceIds: input.assessment.matchedEvidenceIds,
    createdAt: input.assessment.occurredAt,
  });

  await input.persist({
    scope: input.assessment.scope,
    experience,
  });

  return {
    experienceId,
    recorded: true,
  };
}
