import type { MemoryScope } from "../domain/scope";
import type { SessionMessage } from "../domain/records";
import type { RuntimeSalvageHooks } from "../runtime/contextService";
import type { EvolutionRepositoryPort } from "../storage/ports";
import { createLearningProposal, type LearningProposal, type PromotionDecision } from "./contracts";
import { createProposalGateProcessor } from "./gates";
import { refreshDelayedProposal, sameProposalContent } from "./proposalLifecycle";

export interface RuntimeSalvageConfig {
  repositories: EvolutionRepositoryPort;
  createId?: () => string;
  createTraceId?: () => string;
  now?: () => string;
}

function buildProposalKey(input: {
  proposalType: LearningProposal["proposalType"];
  sessionId?: string;
  linkedArchiveIds: string[];
}): string {
  return [
    input.proposalType,
    input.sessionId ?? "",
    [...input.linkedArchiveIds].sort().join(","),
  ].join("::");
}

function isRetainedProposalDecision(status: PromotionDecision | "pending"): boolean {
  return status !== "rejected";
}

async function existingProposalKeys(
  repositories: EvolutionRepositoryPort,
  scope: MemoryScope,
): Promise<Map<string, LearningProposal>> {
  const retained = (await repositories.proposals.listByScope(scope)).filter(
    (proposal) => isRetainedProposalDecision(proposal.status),
  );

  return new Map(
    retained.map((proposal) =>
      [
        buildProposalKey({
          proposalType: proposal.proposalType,
          sessionId: proposal.sessionId,
          linkedArchiveIds: proposal.linkedArchiveIds,
        }),
        proposal,
      ] as const,
    ),
  );
}

function addProposalIfNew(
  proposal: LearningProposal,
  retainedKeys: Map<string, LearningProposal>,
  candidates: LearningProposal[],
): void {
  const key = buildProposalKey({
    proposalType: proposal.proposalType,
    sessionId: proposal.sessionId,
    linkedArchiveIds: proposal.linkedArchiveIds,
  });

  const existing = retainedKeys.get(key);
  if (!existing) {
    retainedKeys.set(key, proposal);
    candidates.push(proposal);
    return;
  }

  if (existing.status !== "delayed") {
    return;
  }

  if (sameProposalContent(existing, proposal)) {
    return;
  }

  const refreshed = refreshDelayedProposal(existing, proposal);
  retainedKeys.set(key, refreshed);
  candidates.push(refreshed);
}

function clipText(content: string, maxLength = 120): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function renderMessageExcerpt(messages: SessionMessage[]): string | undefined {
  if (messages.length === 0) {
    return undefined;
  }

  return messages
    .map((message) => `${message.role}: ${clipText(message.content)}`)
    .join(" | ");
}

function selectCandidatePattern(input: {
  evictedMessages: SessionMessage[];
  journalKeyResults: string[];
  nextMessage: SessionMessage;
  temporaryDecisions: string[];
}): string | undefined {
  const explicitCandidate = [
    ...input.temporaryDecisions,
    ...input.journalKeyResults,
  ][0];
  if (explicitCandidate) {
    return explicitCandidate;
  }

  const transcriptCandidate = [...input.evictedMessages, input.nextMessage]
    .map((message) => clipText(message.content, 80))
    .find((content) => content.length > 0);

  return transcriptCandidate;
}

export function createRuntimeSalvageHooks(
  config: RuntimeSalvageConfig,
): RuntimeSalvageHooks {
  const now = config.now ?? (() => new Date().toISOString());
  const createId = config.createId ?? (() => crypto.randomUUID());
  const createTraceId = config.createTraceId ?? (() => crypto.randomUUID());
  const proposalGate = createProposalGateProcessor({
    repositories: config.repositories,
    now,
    createId,
    createTraceId,
  });

  return {
    async onPreCompact(input) {
      const retainedKeys = await existingProposalKeys(
        config.repositories,
        input.scope,
      );
      const candidates: LearningProposal[] = [];
      const timestamp = now();
      const { workingMemory, journal } = input.runtimeState;
      const evictedContext = renderMessageExcerpt(input.evictedMessages);

      if (workingMemory.openLoops.length > 0) {
        addProposalIfNew(
          createLearningProposal({
            id: createId(),
            userId: input.scope.userId,
            tenantId: input.scope.tenantId,
            workspaceId: input.scope.workspaceId,
            agentId: input.scope.agentId,
            sessionId: input.scope.sessionId,
            proposalType: "maintenance_action",
            traceId: createTraceId(),
            summary: `Pre-compact salvage unresolved loops before context loss: ${workingMemory.openLoops.join(", ")}`,
            rationale: [
              `Compaction overflow (${input.overflowCount}) would trim active session context while these open loops remain unresolved.`,
              evictedContext
                ? `Evicted context: ${evictedContext}`
                : undefined,
            ]
              .filter((segment): segment is string => Boolean(segment))
              .join(" "),
            linkedArchiveIds: [],
            linkedMemoryIds: [],
            linkedEvidenceIds: [],
            sourceExperienceIds: [],
            modelInfluence: "rules-only",
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
          retainedKeys,
          candidates,
        );
      }

      const candidatePattern = selectCandidatePattern({
        evictedMessages: input.evictedMessages,
        journalKeyResults: journal.keyResults ?? [],
        nextMessage: input.nextMessage,
        temporaryDecisions: workingMemory.temporaryDecisions ?? [],
      });

      if (candidatePattern) {
        addProposalIfNew(
          createLearningProposal({
            id: createId(),
            userId: input.scope.userId,
            tenantId: input.scope.tenantId,
            workspaceId: input.scope.workspaceId,
            agentId: input.scope.agentId,
            sessionId: input.scope.sessionId,
            proposalType: "procedural_pattern",
            traceId: createTraceId(),
            summary: `Pre-compact salvage candidate procedural pattern: ${candidatePattern}`,
            rationale: [
              "Compaction boundary exposed a stable decision/result that should be preserved as a governed procedural proposal instead of being lost with runtime state.",
              evictedContext
                ? `Evicted context: ${evictedContext}`
                : undefined,
            ]
              .filter((segment): segment is string => Boolean(segment))
              .join(" "),
            linkedArchiveIds: [],
            linkedMemoryIds: [],
            linkedEvidenceIds: [],
            sourceExperienceIds: [],
            modelInfluence: "rules-only",
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
          retainedKeys,
          candidates,
        );
      }

      if (candidates.length > 0) {
        await proposalGate.process({
          scope: input.scope,
          proposals: candidates,
        });
      }
    },

    async onSessionEnd(input) {
      const retainedKeys = await existingProposalKeys(
        config.repositories,
        input.scope,
      );
      const candidates: LearningProposal[] = [];
      const timestamp = now();
      const archive = input.archive;

      if (archive.unresolvedItems.length > 0) {
        addProposalIfNew(
          createLearningProposal({
            id: createId(),
            userId: input.scope.userId,
            tenantId: input.scope.tenantId,
            workspaceId: input.scope.workspaceId,
            agentId: input.scope.agentId,
            sessionId: input.scope.sessionId,
            proposalType: "maintenance_action",
            traceId: createTraceId(),
            summary: `Session-end salvage unresolved loops from archive ${archive.id}: ${archive.unresolvedItems.join(", ")}`,
            rationale:
              "Session end archived unresolved continuity signals. They should become governed maintenance proposals rather than disappear behind the archive boundary.",
            linkedArchiveIds: [archive.id],
            linkedMemoryIds: [],
            linkedEvidenceIds: [],
            sourceExperienceIds: [],
            modelInfluence: "rules-only",
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
          retainedKeys,
          candidates,
        );
      }

      const candidatePattern = archive.keyDecisions[0];
      if (candidatePattern) {
        addProposalIfNew(
          createLearningProposal({
            id: createId(),
            userId: input.scope.userId,
            tenantId: input.scope.tenantId,
            workspaceId: input.scope.workspaceId,
            agentId: input.scope.agentId,
            sessionId: input.scope.sessionId,
            proposalType: "procedural_pattern",
            traceId: createTraceId(),
            summary: `Session-end salvage candidate procedural pattern from archive ${archive.id}: ${candidatePattern}`,
            rationale:
              "Session-end archival preserved a stable decision that should be evaluated as a reusable procedural pattern under governance.",
            linkedArchiveIds: [archive.id],
            linkedMemoryIds: [],
            linkedEvidenceIds: [],
            sourceExperienceIds: [],
            modelInfluence: "rules-only",
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
          retainedKeys,
          candidates,
        );
      }

      if (candidates.length > 0) {
        await proposalGate.process({
          scope: input.scope,
          proposals: candidates,
        });
      }
    },
  };
}
