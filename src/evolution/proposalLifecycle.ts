import type { LearningProposal } from "./contracts";

function sameOptionalString(left: string | undefined, right: string | undefined): boolean {
  return left === right;
}

export function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();

  return leftSorted.every((value, index) => value === rightSorted[index]);
}

export function sameProposalContent(
  left: LearningProposal,
  right: LearningProposal,
): boolean {
  return (
    left.proposalType === right.proposalType &&
    sameOptionalString(left.tenantId, right.tenantId) &&
    sameOptionalString(left.workspaceId, right.workspaceId) &&
    sameOptionalString(left.agentId, right.agentId) &&
    sameOptionalString(left.sessionId, right.sessionId) &&
    left.summary === right.summary &&
    left.rationale === right.rationale &&
    left.modelInfluence === right.modelInfluence &&
    sameStringSet(left.sourceExperienceIds, right.sourceExperienceIds) &&
    sameStringSet(left.linkedMemoryIds, right.linkedMemoryIds) &&
    sameStringSet(left.linkedArchiveIds, right.linkedArchiveIds) &&
    sameStringSet(left.linkedEvidenceIds, right.linkedEvidenceIds)
  );
}

export function refreshDelayedProposal(
  existing: LearningProposal,
  candidate: LearningProposal,
): LearningProposal {
  return {
    ...candidate,
    id: existing.id,
    traceId: existing.traceId,
    createdAt: existing.createdAt,
  };
}
