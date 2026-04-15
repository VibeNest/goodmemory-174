import type {
  FactMemory,
  FeedbackMemory,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import type { MemoryRepositories } from "../storage/repositories";
import {
  createLearningProposal,
  type ExperienceModelInfluence,
  type ExperienceRecord,
  type LearningProposal,
} from "./contracts";

export interface AssistedReviewerExtension {
  enabled?: boolean;
  annotate?: (proposal: LearningProposal) => Promise<LearningProposal>;
}

export interface RulesOnlyReviewerConfig {
  repositories: MemoryRepositories;
  now?: () => string;
  createId?: () => string;
  createTraceId?: () => string;
  assistedReview?: AssistedReviewerExtension;
}

export interface ReflectiveReviewInput {
  scope: MemoryScope;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();

  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function collectUnique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function collectUniqueFromGroups(groups: Array<readonly string[] | undefined>): string[] {
  return collectUnique(groups.flatMap((group) => group ?? []));
}

function aggregateModelInfluence(
  experiences: ExperienceRecord[],
): ExperienceModelInfluence {
  const influences = new Set(experiences.map((experience) => experience.modelInfluence));

  if (influences.has("mixed")) {
    return "mixed";
  }
  if (influences.has("llm-assisted") && influences.has("rules-only")) {
    return "mixed";
  }
  if (influences.has("llm-assisted")) {
    return "llm-assisted";
  }
  if (influences.has("rules-only")) {
    return "rules-only";
  }

  return "none";
}

function findEquivalentPendingProposal(
  existing: LearningProposal[],
  candidate: LearningProposal,
): boolean {
  return existing.some(
    (proposal) =>
      proposal.status === "pending" &&
      proposal.proposalType === candidate.proposalType &&
      sameStringSet(proposal.linkedMemoryIds, candidate.linkedMemoryIds) &&
      sameStringSet(proposal.linkedArchiveIds, candidate.linkedArchiveIds),
  );
}

function buildFactSummary(fact: FactMemory | undefined): string {
  return fact?.content ?? "targeted memory item";
}

function buildFeedbackSummary(feedback: FeedbackMemory | undefined): string {
  return feedback?.rule ?? "repeated feedback guidance";
}

function sortExperiences(experiences: ExperienceRecord[]): ExperienceRecord[] {
  return [...experiences].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

function resolveProposalScope(experiences: ExperienceRecord[]): MemoryScope {
  const [first, ...rest] = experiences;

  if (!first) {
    throw new Error("Rules-only reviewer requires at least one source experience");
  }

  function resolveSharedOptionalField(
    key: "tenantId" | "workspaceId" | "agentId" | "sessionId",
  ) {
    return rest.every((experience) => experience[key] === first[key])
      ? first[key]
      : undefined;
  }

  return {
    userId: first.userId,
    tenantId: resolveSharedOptionalField("tenantId"),
    workspaceId: resolveSharedOptionalField("workspaceId"),
    agentId: resolveSharedOptionalField("agentId"),
    sessionId: resolveSharedOptionalField("sessionId"),
  };
}

function buildMemoryRevisionProposal(input: {
  createId: () => string;
  createTraceId: () => string;
  experiences: ExperienceRecord[];
  fact?: FactMemory;
  memoryId: string;
  now: string;
}): LearningProposal {
  const sorted = sortExperiences(input.experiences);
  const scope = resolveProposalScope(sorted);

  return createLearningProposal({
    id: input.createId(),
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    proposalType: "memory_revision",
    traceId: input.createTraceId(),
    summary: `Review repeated verification pressure on memory: ${buildFactSummary(input.fact)}`,
    rationale: `Rules-only reviewer saw ${sorted.length} verification traces pointing to the same memory. Repeated verification pressure suggests a governed revision instead of silent reuse.`,
    sourceExperienceIds: sorted.map((experience) => experience.id),
    linkedMemoryIds: [input.memoryId],
    linkedEvidenceIds: collectUniqueFromGroups(
      sorted.map((experience) => experience.linkedEvidenceIds),
    ),
    modelInfluence: aggregateModelInfluence(sorted),
    createdAt: input.now,
    updatedAt: input.now,
  });
}

function buildMaintenanceProposal(input: {
  createId: () => string;
  createTraceId: () => string;
  experience: ExperienceRecord;
  fact?: FactMemory;
  memoryId: string;
  now: string;
}): LearningProposal {
  const scope = resolveProposalScope([input.experience]);

  return createLearningProposal({
    id: input.createId(),
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    proposalType: "maintenance_action",
    traceId: input.createTraceId(),
    summary: `Re-check action-driving memory before reuse: ${buildFactSummary(input.fact)}`,
    rationale:
      "Rules-only reviewer saw a verification trace for this memory. The next step should stay in proposal space until maintenance or verification resolves it.",
    sourceExperienceIds: [input.experience.id],
    linkedMemoryIds: [input.memoryId],
    linkedEvidenceIds: input.experience.linkedEvidenceIds,
    modelInfluence: input.experience.modelInfluence,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

function buildProceduralPatternProposal(input: {
  createId: () => string;
  createTraceId: () => string;
  experiences: ExperienceRecord[];
  feedback?: FeedbackMemory;
  memoryId: string;
  now: string;
}): LearningProposal {
  const sorted = sortExperiences(input.experiences);
  const guidance = buildFeedbackSummary(input.feedback);
  const scope = resolveProposalScope(sorted);

  return createLearningProposal({
    id: input.createId(),
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    proposalType: "procedural_pattern",
    traceId: input.createTraceId(),
    summary: `Promote repeated guidance into a governed procedural pattern: ${guidance}`,
    rationale: `Rules-only reviewer saw ${sorted.length} successful feedback traces pointing to the same active guidance. This is stable enough to propose as a reusable procedural pattern.`,
    sourceExperienceIds: sorted.map((experience) => experience.id),
    linkedMemoryIds: [input.memoryId],
    linkedEvidenceIds: collectUniqueFromGroups(
      sorted.map((experience) => experience.linkedEvidenceIds),
    ),
    modelInfluence: aggregateModelInfluence(sorted),
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function createRulesOnlyReviewer(config: RulesOnlyReviewerConfig) {
  const now = config.now ?? (() => new Date().toISOString());
  const createId = config.createId ?? (() => crypto.randomUUID());
  const createTraceId = config.createTraceId ?? (() => crypto.randomUUID());

  return {
    async review(input: ReflectiveReviewInput): Promise<LearningProposal[]> {
      const [experiences, feedback, facts, existingProposals] = await Promise.all([
        config.repositories.experiences.listByScope(input.scope),
        config.repositories.feedback.listByScope(input.scope),
        config.repositories.facts.listByScope(input.scope),
        config.repositories.proposals.listByScope(input.scope),
      ]);

      const activeFeedbackById = new Map(
        feedback
          .filter((entry) => entry.lifecycle === "active")
          .map((entry) => [entry.id, entry] as const),
      );
      const activeFactsById = new Map(
        facts
          .filter((fact) => fact.lifecycle === "active")
          .map((fact) => [fact.id, fact] as const),
      );
      const timestamp = now();
      const proposals: LearningProposal[] = [];

      const verifyGroups = new Map<string, ExperienceRecord[]>();
      for (const experience of experiences) {
        if (experience.kind !== "verify" || experience.linkedMemoryIds.length === 0) {
          continue;
        }

        for (const memoryId of experience.linkedMemoryIds) {
          const group = verifyGroups.get(memoryId) ?? [];
          group.push(experience);
          verifyGroups.set(memoryId, group);
        }
      }

      for (const [memoryId, group] of verifyGroups.entries()) {
        const candidate =
          group.length >= 2
            ? buildMemoryRevisionProposal({
                createId,
                createTraceId,
                experiences: group,
                fact: activeFactsById.get(memoryId),
                memoryId,
                now: timestamp,
              })
            : buildMaintenanceProposal({
                createId,
                createTraceId,
                experience: group[0]!,
                fact: activeFactsById.get(memoryId),
                memoryId,
                now: timestamp,
              });

        if (!findEquivalentPendingProposal(existingProposals, candidate)) {
          proposals.push(candidate);
        }
      }

      const feedbackGroups = new Map<string, ExperienceRecord[]>();
      for (const experience of experiences) {
        if (experience.kind !== "feedback" || experience.linkedMemoryIds.length !== 1) {
          continue;
        }

        const [memoryId] = experience.linkedMemoryIds;
        if (!memoryId || !activeFeedbackById.has(memoryId)) {
          continue;
        }

        const group = feedbackGroups.get(memoryId) ?? [];
        group.push(experience);
        feedbackGroups.set(memoryId, group);
      }

      for (const [memoryId, group] of feedbackGroups.entries()) {
        if (group.length < 2) {
          continue;
        }

        const candidate = buildProceduralPatternProposal({
          createId,
          createTraceId,
          experiences: group,
          feedback: activeFeedbackById.get(memoryId),
          memoryId,
          now: timestamp,
        });

        if (!findEquivalentPendingProposal(existingProposals, candidate)) {
          proposals.push(candidate);
        }
      }

      if (config.assistedReview?.enabled && config.assistedReview.annotate) {
        const annotated: LearningProposal[] = [];
        for (const proposal of proposals) {
          annotated.push(await config.assistedReview.annotate(proposal));
        }
        return annotated;
      }

      return proposals;
    },
  };
}
