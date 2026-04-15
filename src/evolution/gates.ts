import type { MemoryScope } from "../domain/scope";
import type { EvolutionRepositoryPort } from "../storage/ports";
import {
  createPromotionRecord,
  type LearningProposal,
  type PromotionDecision,
  type PromotionGateOutcome,
  type PromotionRecord,
} from "./contracts";

export interface ProposalGateDecision {
  decision: PromotionDecision;
  evalOutcome: PromotionGateOutcome;
  policyOutcome: PromotionGateOutcome;
  promotion: PromotionRecord;
  proposal: LearningProposal;
  rationale: string;
  verificationOutcome: PromotionGateOutcome;
}

export interface ProposalGateProcessorConfig {
  repositories: EvolutionRepositoryPort;
  createId?: () => string;
  createTraceId?: () => string;
  now?: () => string;
}

export interface ProposalGateProcessInput {
  scope: MemoryScope;
  proposals: LearningProposal[];
}

function matchesScope(proposal: LearningProposal, scope: MemoryScope): boolean {
  return (
    proposal.userId === scope.userId &&
    proposal.tenantId === scope.tenantId &&
    proposal.workspaceId === scope.workspaceId &&
    proposal.agentId === scope.agentId
  );
}

function evaluatePolicyGate(
  proposal: LearningProposal,
  scope: MemoryScope,
): {
  outcome: PromotionGateOutcome;
  rationale: string;
} {
  if (!matchesScope(proposal, scope)) {
    return {
      outcome: "blocked",
      rationale: "proposal scope does not match the current review scope",
    };
  }

  if (!proposal.summary.trim() || !proposal.rationale.trim()) {
    return {
      outcome: "blocked",
      rationale: "proposal summary and rationale are required",
    };
  }

  return {
    outcome: "passed",
    rationale: "proposal passed the deterministic policy gate",
  };
}

function evaluateVerificationGate(
  proposal: LearningProposal,
): {
  outcome: PromotionGateOutcome;
  rationale: string;
} {
  if (proposal.proposalType === "maintenance_action") {
    const hasLineage =
      proposal.linkedMemoryIds.length > 0 ||
      proposal.linkedArchiveIds.length > 0 ||
      proposal.linkedEvidenceIds.length > 0 ||
      proposal.sourceExperienceIds.length > 0;

    return hasLineage
      ? {
          outcome: "passed",
          rationale: "proposal carries enough lineage for a low-risk maintenance review",
        }
      : {
          outcome: "review_required",
          rationale: "maintenance proposals require memory, archive, evidence, or experience lineage",
        };
  }

  if (
    proposal.proposalType === "memory_revision" &&
    proposal.linkedMemoryIds.length > 0 &&
    (
      proposal.linkedEvidenceIds.length > 0 ||
      proposal.sourceExperienceIds.length > 0
    )
  ) {
    return {
      outcome: "passed",
      rationale: "revision proposal has target memory plus evidence or experience lineage",
    };
  }

  if (
    proposal.proposalType === "procedural_pattern" &&
    (
      proposal.sourceExperienceIds.length >= 2 ||
      proposal.linkedArchiveIds.length > 0
    )
  ) {
    return {
      outcome: "passed",
      rationale: "procedural proposal has repeated experience or archive-backed lineage",
    };
  }

  return {
    outcome: "review_required",
    rationale: "proposal needs more verification context before it can pass automatically",
  };
}

function evaluateEvalGate(
  proposal: LearningProposal,
): {
  outcome: PromotionGateOutcome;
  rationale: string;
} {
  if (proposal.modelInfluence === "llm-assisted" || proposal.modelInfluence === "mixed") {
    return {
      outcome: "review_required",
      rationale: "model-assisted proposal requires human or eval review before promotion",
    };
  }

  if (proposal.proposalType === "maintenance_action") {
    return {
      outcome: "passed",
      rationale: "low-risk maintenance proposals can pass the initial eval gate",
    };
  }

  return {
    outcome: "review_required",
    rationale: "high-risk proposals stay delayed until later eval and promotion phases",
  };
}

function finalizeDecision(input: {
  evalOutcome: PromotionGateOutcome;
  policyOutcome: PromotionGateOutcome;
  verificationOutcome: PromotionGateOutcome;
}): PromotionDecision {
  if (input.policyOutcome === "blocked") {
    return "rejected";
  }

  if (
    input.verificationOutcome === "review_required" ||
    input.evalOutcome === "review_required"
  ) {
    return "delayed";
  }

  return "accepted";
}

export function createProposalGateProcessor(
  config: ProposalGateProcessorConfig,
) {
  const now = config.now ?? (() => new Date().toISOString());
  const createId = config.createId ?? (() => crypto.randomUUID());
  const createTraceId = config.createTraceId ?? (() => crypto.randomUUID());

  async function rollbackFinalizedProposal(
    proposalId: string,
    previousProposal: LearningProposal | null,
  ): Promise<void> {
    if (previousProposal) {
      await config.repositories.proposals.add(previousProposal);
      return;
    }

    await config.repositories.proposals.delete(proposalId);
  }

  return {
    async process(input: ProposalGateProcessInput): Promise<ProposalGateDecision[]> {
      const timestamp = now();
      const decisions: ProposalGateDecision[] = [];

      for (const proposal of input.proposals) {
        const policy = evaluatePolicyGate(proposal, input.scope);
        const verification = evaluateVerificationGate(proposal);
        const evalGate = evaluateEvalGate(proposal);
        const decision = finalizeDecision({
          policyOutcome: policy.outcome,
          verificationOutcome: verification.outcome,
          evalOutcome: evalGate.outcome,
        });
        const rationale = [policy.rationale, verification.rationale, evalGate.rationale]
          .filter(Boolean)
          .join("; ");
        const finalizedProposal: LearningProposal = {
          ...proposal,
          status: decision,
          updatedAt: timestamp,
        };
        const promotion = createPromotionRecord({
          id: createId(),
          proposalId: proposal.id,
          userId: proposal.userId,
          tenantId: proposal.tenantId,
          workspaceId: proposal.workspaceId,
          agentId: proposal.agentId,
          sessionId: proposal.sessionId,
          traceId: createTraceId(),
          decision,
          summary: `${decision} proposal: ${proposal.summary}`,
          rationale,
          sourceExperienceIds: proposal.sourceExperienceIds,
          linkedMemoryIds: proposal.linkedMemoryIds,
          linkedArchiveIds: proposal.linkedArchiveIds,
          linkedEvidenceIds: proposal.linkedEvidenceIds,
          policyOutcome: policy.outcome,
          verificationOutcome: verification.outcome,
          evalOutcome: evalGate.outcome,
          createdAt: timestamp,
          decidedAt: timestamp,
        });
        const previousProposal = await config.repositories.proposals.get(proposal.id);

        await config.repositories.proposals.add(finalizedProposal);

        try {
          await config.repositories.promotions.add(promotion);
        } catch (error) {
          try {
            await rollbackFinalizedProposal(proposal.id, previousProposal);
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              `Failed to persist promotion and roll back proposal ${proposal.id}`,
            );
          }

          throw error;
        }

        decisions.push({
          decision,
          proposal: finalizedProposal,
          promotion,
          rationale,
          policyOutcome: policy.outcome,
          verificationOutcome: verification.outcome,
          evalOutcome: evalGate.outcome,
        });
      }

      return decisions;
    },
  };
}
