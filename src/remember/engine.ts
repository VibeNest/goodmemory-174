import {
  createEpisodeMemory,
  createFactMemory,
  createFeedbackMemory,
  createPreferenceMemory,
  createReferenceMemory,
  createUserProfile,
} from "../domain/records";
import type {
  EpisodeMemory,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  UserProfile,
} from "../domain/records";
import { createMemorySource } from "../domain/provenance";
import type { MemorySourceMethod } from "../domain/provenance";
import type { DocumentStore } from "../storage/contracts";
import type { MemoryRepositories } from "../storage/repositories";
import type {
  MemoryCandidate,
  MemoryCandidateKindHint,
  MemoryExtractor,
  MemoryExtractionInput,
} from "./candidates";
import { createDeterministicMemoryExtractor } from "./deterministicExtractor";

type ScopedIdentity = {
  userId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  sessionId?: string;
};

export interface ClassifiedCandidate extends MemoryCandidate {
  memoryType: Exclude<MemoryCandidateKindHint, "episode" | "noise"> | "reject";
  decision: "write" | "reject";
  score: number;
  reason?: string;
}

export interface RememberEvent {
  candidateId: string;
  outcome: "written" | "merged" | "superseded" | "rejected";
  memoryType:
    | "profile"
    | "preference"
    | "reference"
    | "fact"
    | "feedback"
    | "episode";
  memoryId?: string;
  reason?: string;
  sourceMethod?: MemorySourceMethod;
}

export interface RememberResult {
  accepted: number;
  rejected: number;
  events: RememberEvent[];
}

export interface RememberEngineConfig {
  repositories: MemoryRepositories;
  documentStore: DocumentStore;
  extractor?: MemoryExtractor;
  now?: () => string;
  createId?: () => string;
  shouldWrite?: (candidate: ClassifiedCandidate) => boolean;
}

const SCORE_THRESHOLD = 0.7;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 4);
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function normalizeRule(value: string): string {
  return normalizeText(value);
}

function scoreCandidate(candidate: MemoryCandidate): number {
  if (candidate.kindHint === "noise") {
    return 0;
  }

  if (candidate.kindHint === "profile") {
    return candidate.explicitness === "explicit" ? 0.96 : 0.5;
  }

  if (candidate.kindHint === "feedback") {
    return 0.95;
  }

  if (candidate.kindHint === "preference") {
    return 0.9;
  }

  if (candidate.kindHint === "reference") {
    return 0.88;
  }

  if (candidate.kindHint === "fact") {
    return candidate.explicitness === "explicit" ? 0.92 : 0.64;
  }

  return 0.4;
}

function classifyCandidate(candidate: MemoryCandidate): ClassifiedCandidate {
  const score = scoreCandidate(candidate);

  if (candidate.kindHint === "noise") {
    return {
      ...candidate,
      memoryType: "reject",
      decision: "reject",
      score,
      reason: "noise",
    };
  }

  if (
    candidate.kindHint !== "profile" &&
    candidate.kindHint !== "preference" &&
    candidate.kindHint !== "reference" &&
    candidate.kindHint !== "fact" &&
    candidate.kindHint !== "feedback"
  ) {
    return {
      ...candidate,
      memoryType: "reject",
      decision: "reject",
      score,
      reason: "unsupported_kind",
    };
  }

  if (score < SCORE_THRESHOLD) {
    return {
      ...candidate,
      memoryType: "reject",
      decision: "reject",
      score,
      reason: "below_threshold",
    };
  }

  return {
    ...candidate,
    memoryType: candidate.kindHint,
    decision: "write",
    score,
  };
}

function buildProfile(
  userId: string,
  existing: UserProfile | null,
  candidate: ClassifiedCandidate,
  timestamp: string,
): UserProfile {
  return existing
    ? {
        ...existing,
        identity: {
          ...existing.identity,
          name: candidate.content,
        },
        version: existing.version + 1,
        updatedAt: timestamp,
      }
    : createUserProfile({
        userId,
        identity: {
          name: candidate.content,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
}

function buildPreference(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
): PreferenceMemory {
  return createPreferenceMemory({
    id,
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    category: candidate.metadata?.preferenceCategory ?? "general_preference",
    value: candidate.metadata?.preferenceValue ?? candidate.content,
    source: createMemorySource({
      method: candidate.explicitness,
      extractedAt: timestamp,
    }),
    updatedAt: timestamp,
  });
}

function buildReference(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
): ReferenceMemory {
  return createReferenceMemory({
    id,
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    title: candidate.metadata?.referenceTitle ?? candidate.content,
    pointer: candidate.metadata?.referencePointer ?? candidate.content,
    source: createMemorySource({
      method: candidate.explicitness,
      extractedAt: timestamp,
    }),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function buildFact(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
): FactMemory {
  return createFactMemory({
    id,
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    category: candidate.metadata?.category ?? "project",
    content: candidate.content,
    source: createMemorySource({
      method: candidate.explicitness,
      extractedAt: timestamp,
    }),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function buildFeedback(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
): FeedbackMemory {
  return createFeedbackMemory({
    id,
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    rule: candidate.content,
    kind: candidate.metadata?.feedbackKind ?? "do",
    appliesTo: candidate.metadata?.appliesTo,
    source: createMemorySource({
      method: candidate.explicitness,
      extractedAt: timestamp,
    }),
    updatedAt: timestamp,
  });
}

function maybeBuildEpisode(
  input: MemoryExtractionInput,
  candidates: MemoryCandidate[],
  id: string,
  timestamp: string,
): EpisodeMemory | null {
  const hasAssistantTurn = input.messages.some((message) => message.role === "assistant");
  const userMessages = input.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((value) => value.length > 0);

  if (!hasAssistantTurn || userMessages.length < 2 || candidates.length < 2) {
    return null;
  }

  return createEpisodeMemory({
    id,
    userId: input.scope.userId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    agentId: input.scope.agentId,
    sessionId: input.scope.sessionId,
    summary: `Conversation covered: ${userMessages.slice(0, 2).join(" / ")}`,
    keyDecisions: [],
    unresolvedItems: [],
    topics: userMessages
      .slice(0, 2)
      .map((message) => message.split(" ").slice(0, 3).join(" ")),
    importance: 0.7,
    confidence: 0.8,
    createdAt: timestamp,
  });
}

export function createRememberEngine(config: RememberEngineConfig) {
  const extractor = config.extractor ?? createDeterministicMemoryExtractor();
  const now = config.now ?? (() => new Date().toISOString());
  const createId = config.createId ?? (() => crypto.randomUUID());

  return {
    classifyCandidate,

    async extract(input: MemoryExtractionInput) {
      return extractor.extract(input);
    },

    async remember(input: MemoryExtractionInput): Promise<RememberResult> {
      const extraction = await extractor.extract(input);
      const events: RememberEvent[] = [];
      let accepted = 0;
      let rejected = 0;

      for (const candidate of extraction.candidates) {
        const classified = classifyCandidate(candidate);

        if (
          classified.decision === "reject" ||
          (config.shouldWrite && !config.shouldWrite(classified))
        ) {
          rejected += 1;
          events.push({
            candidateId: candidate.id,
            outcome: "rejected",
            memoryType:
              classified.memoryType === "reject" ? "fact" : classified.memoryType,
            reason: classified.reason ?? "policy_rejected",
            sourceMethod: candidate.explicitness,
          });
          continue;
        }

        const timestamp = now();

        if (classified.memoryType === "profile") {
          const existing = await config.repositories.profiles.get(input.scope.userId);
          const profile = buildProfile(
            input.scope.userId,
            existing,
            classified,
            timestamp,
          );
          await config.repositories.profiles.upsert(profile);
          accepted += 1;
          events.push({
            candidateId: candidate.id,
            outcome: "written",
            memoryType: "profile",
            memoryId: profile.userId,
            reason: "explicit_profile",
            sourceMethod: classified.explicitness,
          });
          continue;
        }

        if (classified.memoryType === "preference") {
          const preference = buildPreference(input.scope, classified, createId(), timestamp);
          await config.repositories.preferences.upsert(preference);
          accepted += 1;
          events.push({
            candidateId: candidate.id,
            outcome: "written",
            memoryType: "preference",
            memoryId: preference.id,
            reason: "explicit_preference",
            sourceMethod: classified.explicitness,
          });
          continue;
        }

        if (classified.memoryType === "reference") {
          const scopedReferences = await config.repositories.references.listByScope(
            input.scope,
          );
          const pointer = classified.metadata?.referencePointer ?? classified.content;
          const duplicate = scopedReferences.find(
            (reference) =>
              reference.lifecycle === "active" && reference.pointer === pointer,
          );

          if (duplicate) {
            accepted += 1;
            events.push({
              candidateId: candidate.id,
              outcome: "merged",
              memoryType: "reference",
              memoryId: duplicate.id,
              reason: "duplicate_reference",
              sourceMethod: classified.explicitness,
            });
            continue;
          }

          const superseded = scopedReferences.find(
            (reference) =>
              reference.lifecycle === "active" &&
              reference.pointer === classified.metadata?.supersedesPointer,
          );
          const reference = buildReference(input.scope, classified, createId(), timestamp);

          if (superseded) {
            await config.repositories.references.add(
              createReferenceMemory({
                ...superseded,
                lifecycle: "superseded",
                updatedAt: timestamp,
              }),
            );
          }

          await config.repositories.references.add(reference);
          accepted += 1;
          events.push({
            candidateId: candidate.id,
            outcome: superseded ? "superseded" : "written",
            memoryType: "reference",
            memoryId: reference.id,
            reason: superseded ? "superseded_reference" : "explicit_reference",
            sourceMethod: classified.explicitness,
          });
          continue;
        }

        if (classified.memoryType === "fact") {
          const facts = await config.repositories.facts.listByScope(input.scope);
          const normalizedContent = normalizeText(classified.content);
          const duplicate = facts.find(
            (fact) =>
              fact.lifecycle === "active" &&
              normalizeText(fact.content) === normalizedContent,
          );

          if (duplicate) {
            accepted += 1;
            events.push({
              candidateId: candidate.id,
              outcome: "merged",
              memoryType: "fact",
              memoryId: duplicate.id,
              reason: "duplicate_fact",
              sourceMethod: classified.explicitness,
            });
            continue;
          }

          const superseded = facts.find(
            (fact) =>
              fact.lifecycle === "active" &&
              fact.source.method !== "explicit" &&
              classified.explicitness === "explicit" &&
              tokenOverlap(fact.content, classified.content) >= 0.4,
          );

          const fact = buildFact(input.scope, classified, createId(), timestamp);

          if (superseded) {
            await config.repositories.facts.add(
              createFactMemory({
                ...superseded,
                lifecycle: "superseded",
                isActive: false,
                supersededBy: fact.id,
                updatedAt: timestamp,
              }),
            );
          }

          await config.repositories.facts.add(fact);
          accepted += 1;
          events.push({
            candidateId: candidate.id,
            outcome: superseded ? "superseded" : "written",
            memoryType: "fact",
            memoryId: fact.id,
            reason: superseded ? "superseded_inferred_fact" : "explicit_fact",
            sourceMethod: classified.explicitness,
          });
          continue;
        }

        const scopedFeedback = await config.repositories.feedback.listByScope(input.scope);
        const normalizedRule = normalizeRule(classified.content);
        const duplicate = scopedFeedback.find(
          (feedback) =>
            feedback.lifecycle === "active" &&
            feedback.kind === (classified.metadata?.feedbackKind ?? "do") &&
            normalizeRule(feedback.rule) === normalizedRule,
        );

        if (duplicate) {
          accepted += 1;
          events.push({
            candidateId: candidate.id,
            outcome: "merged",
            memoryType: "feedback",
            memoryId: duplicate.id,
            reason: "duplicate_feedback",
            sourceMethod: classified.explicitness,
          });
          continue;
        }

        const superseded = scopedFeedback.find(
          (feedback) =>
            feedback.lifecycle === "active" &&
            feedback.appliesTo === classified.metadata?.appliesTo &&
            feedback.kind === (classified.metadata?.feedbackKind ?? "do"),
        );
        const feedback = buildFeedback(input.scope, classified, createId(), timestamp);

        if (superseded) {
          await config.repositories.feedback.upsert(
            createFeedbackMemory({
              ...superseded,
              lifecycle: "superseded",
              supersededBy: feedback.id,
              updatedAt: timestamp,
            }),
          );
        }

        await config.repositories.feedback.upsert(feedback);
        accepted += 1;
        events.push({
          candidateId: candidate.id,
          outcome: superseded ? "superseded" : "written",
          memoryType: "feedback",
          memoryId: feedback.id,
          reason: superseded ? "superseded_feedback" : "explicit_feedback",
          sourceMethod: classified.explicitness,
        });
      }

      const episode = maybeBuildEpisode(
        input,
        extraction.candidates,
        createId(),
        now(),
      );
      if (episode) {
        await config.repositories.episodes.add(episode);
        accepted += 1;
        events.push({
          candidateId: `episode:${episode.id}`,
          outcome: "written",
          memoryType: "episode",
          memoryId: episode.id,
          reason: "conversation_episode",
          sourceMethod: "explicit",
        });
      }

      rejected += extraction.ignoredMessageCount;

      return {
        accepted,
        rejected,
        events,
      };
    },
  };
}
