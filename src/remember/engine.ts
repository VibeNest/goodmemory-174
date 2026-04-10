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
import type {
  GoodMemoryPolicyHooks,
  PolicyContext,
} from "../policy/hooks";
import { toPolicyMemoryRecord } from "../policy/hooks";
import {
  createLanguageService,
  type LanguageService,
} from "../language";

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
  metadata?: {
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    adapterId: string;
    analysisMode: "rules-only";
  };
}

export interface RememberEngineConfig {
  repositories: MemoryRepositories;
  documentStore: DocumentStore;
  extractor?: MemoryExtractor;
  now?: () => string;
  createId?: () => string;
  shouldWrite?: (candidate: ClassifiedCandidate) => boolean;
  language?: LanguageService;
  policy?: Pick<
    GoodMemoryPolicyHooks,
    "shouldRemember" | "redact" | "resolveConflict"
  >;
}

const SCORE_THRESHOLD = 0.7;

function toRememberEventMemoryType(
  memoryType: ClassifiedCandidate["memoryType"],
): RememberEvent["memoryType"] {
  return memoryType === "reject" ? "fact" : memoryType;
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

function hasValidCandidatePayload(candidate: MemoryCandidate): boolean {
  const trimmedContent = candidate.content.trim();

  if (candidate.kindHint === "profile" || candidate.kindHint === "fact" || candidate.kindHint === "feedback") {
    return trimmedContent.length > 0;
  }

  if (candidate.kindHint === "preference") {
    return String(candidate.metadata?.preferenceValue ?? candidate.content).trim().length > 0;
  }

  if (candidate.kindHint === "reference") {
    return String(candidate.metadata?.referencePointer ?? candidate.content).trim().length > 0;
  }

  return true;
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

  if (!hasValidCandidatePayload(candidate)) {
    return {
      ...candidate,
      memoryType: "reject",
      decision: "reject",
      score,
      reason: "invalid_payload",
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
  const profileField = candidate.metadata?.profileField ?? "name";
  const baseProfile = existing ?? createUserProfile({
    userId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (profileField === "currentProject") {
    return {
      ...baseProfile,
      activeContext: {
        ...baseProfile.activeContext,
        currentProjects: [
          ...new Set([
            ...baseProfile.activeContext.currentProjects,
            candidate.content,
          ]),
        ],
      },
      version: baseProfile.version + (existing ? 1 : 0),
      updatedAt: timestamp,
    };
  }

  const identity = {
    ...baseProfile.identity,
    [profileField]: candidate.content,
  };

  return existing
    ? {
        ...existing,
        identity,
        version: existing.version + 1,
        updatedAt: timestamp,
      }
    : {
        ...baseProfile,
        identity,
      };
}

function getProfileWriteReason(candidate: ClassifiedCandidate): string {
  const profileField = candidate.metadata?.profileField ?? "name";
  const suffix = profileField
    .replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
    .toLowerCase();

  return `explicit_profile_${suffix}`;
}

function buildPreference(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
  locale: string,
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
      locale,
    }),
    updatedAt: timestamp,
  });
}

function buildReference(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
  locale: string,
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
      locale,
    }),
    referenceKind: candidate.metadata?.referenceKind,
    subject: candidate.metadata?.subject ?? "unknown",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function resolveReferenceSubject(
  candidate: ClassifiedCandidate,
  scopedReferences: ReferenceMemory[],
): string {
  const candidateSubject = candidate.metadata?.subject?.trim();
  if (candidateSubject && candidateSubject !== "unknown") {
    return candidateSubject;
  }

  const supersededPointer = candidate.metadata?.supersedesPointer;
  if (supersededPointer) {
    const supersededReference = scopedReferences.find(
      (reference) =>
        reference.lifecycle === "active" &&
        reference.pointer === supersededPointer &&
        reference.subject &&
        reference.subject !== "unknown",
    );

    if (supersededReference?.subject) {
      return supersededReference.subject;
    }
  }

  return "unknown";
}

function buildFact(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
  locale: string,
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
      locale,
    }),
    factKind: candidate.metadata?.factKind,
    scopeKind: candidate.metadata?.scopeKind,
    subject: candidate.metadata?.subject ?? "unknown",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function buildFeedback(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
  locale: string,
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
      locale,
    }),
    updatedAt: timestamp,
  });
}

function selectSubstantiveAssistantMessages(
  messages: MemoryExtractionInput["messages"],
  language: LanguageService,
  locale?: string,
): string[] {
  return messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0)
    .filter((content) => {
      const resolved = language.resolveFromText({
        locale,
        text: content,
      });
      return (
        !language.isAssistantAcknowledgement(content, resolved) ||
        language.isAssistantContinuitySignal(content, resolved) ||
        content.length >= 24
      );
    });
}

function extractEpisodeUnresolvedItems(
  userMessages: string[],
  language: LanguageService,
  locale?: string,
): string[] {
  return userMessages
    .filter((message) =>
      language.isUnresolvedSignal(
        message,
        language.resolveFromText({
          locale,
          text: message,
        }),
      ),
    )
    .slice(0, 2);
}

function maybeBuildEpisode(
  input: MemoryExtractionInput,
  candidates: MemoryCandidate[],
  id: string,
  timestamp: string,
  language: LanguageService,
  locale: string,
): EpisodeMemory | null {
  const userMessages = input.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter((value) => value.length > 0);
  const substantiveAssistantMessages = selectSubstantiveAssistantMessages(
    input.messages,
    language,
    input.locale,
  );

  if (
    candidates.length === 0 ||
    userMessages.length === 0 ||
    substantiveAssistantMessages.length === 0
  ) {
    return null;
  }

  const summarySegments = userMessages.slice(0, 2);
  if (substantiveAssistantMessages.length > 0) {
    summarySegments.push(
      `Assistant follow-through: ${substantiveAssistantMessages[0]}`,
    );
  }

  return createEpisodeMemory({
    id,
    userId: input.scope.userId,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    agentId: input.scope.agentId,
    sessionId: input.scope.sessionId,
    summary: `Conversation covered: ${summarySegments.join(" / ")}`,
    keyDecisions: substantiveAssistantMessages.slice(0, 2),
    unresolvedItems: extractEpisodeUnresolvedItems(
      userMessages,
      language,
      input.locale,
    ),
    topics: userMessages
      .slice(0, 2)
      .map((message) => message.split(" ").slice(0, 3).join(" ")),
    importance: 0.7,
    confidence: 0.8,
    locale,
    createdAt: timestamp,
  });
}

export function createRememberEngine(config: RememberEngineConfig) {
  const language = config.language ?? createLanguageService();
  const extractor =
    config.extractor ??
    createDeterministicMemoryExtractor({
      service: language,
    });
  const now = config.now ?? (() => new Date().toISOString());
  const createId = config.createId ?? (() => crypto.randomUUID());

  return {
    classifyCandidate,

    async extract(input: MemoryExtractionInput) {
      return extractor.extract(input);
    },

    async remember(input: MemoryExtractionInput): Promise<RememberResult> {
      const resolvedLanguage = language.resolveFromMessages({
        locale: input.locale,
        messages: input.messages,
      });
      const extraction = await extractor.extract(input);
      const events: RememberEvent[] = [];
      let accepted = 0;
      let rejected = 0;
      const policyContext: PolicyContext = {
        scope: input.scope,
        phase: "remember",
        locale: resolvedLanguage.locale,
        localeSource: resolvedLanguage.localeSource,
      };

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
            memoryType: toRememberEventMemoryType(classified.memoryType),
            reason: classified.reason ?? "policy_rejected",
            sourceMethod: candidate.explicitness,
          });
          continue;
        }

        let effectiveCandidate: ClassifiedCandidate = classified;

        if (config.policy?.redact) {
          const redacted = await config.policy.redact(effectiveCandidate, policyContext);
          const redactedCandidate: MemoryCandidate = {
            ...effectiveCandidate,
            kindHint: redacted.kindHint,
            content: redacted.content,
            metadata: redacted.metadata,
            explicitness: redacted.explicitness,
          };
          effectiveCandidate = classifyCandidate(redactedCandidate);

          if (effectiveCandidate.decision === "reject") {
            rejected += 1;
            events.push({
              candidateId: candidate.id,
              outcome: "rejected",
              memoryType: toRememberEventMemoryType(effectiveCandidate.memoryType),
              reason:
                effectiveCandidate.reason === "invalid_payload"
                  ? "invalid_after_redaction"
                  : effectiveCandidate.reason ?? "policy_redacted_invalid",
              sourceMethod: effectiveCandidate.explicitness,
            });
            continue;
          }
        }

        if (
          config.policy?.shouldRemember &&
          !(await config.policy.shouldRemember(effectiveCandidate, policyContext))
        ) {
          rejected += 1;
          events.push({
            candidateId: candidate.id,
            outcome: "rejected",
            memoryType: toRememberEventMemoryType(effectiveCandidate.memoryType),
            reason: "policy_blocked",
            sourceMethod: effectiveCandidate.explicitness,
          });
          continue;
        }

        const timestamp = now();

        if (effectiveCandidate.memoryType === "profile") {
          const existing = await config.repositories.profiles.get(input.scope.userId);
          const profile = buildProfile(
            input.scope.userId,
            existing,
            effectiveCandidate,
            timestamp,
          );
          await config.repositories.profiles.upsert(profile);
          accepted += 1;
          events.push({
            candidateId: candidate.id,
            outcome: "written",
            memoryType: "profile",
            memoryId: profile.userId,
            reason: getProfileWriteReason(effectiveCandidate),
            sourceMethod: effectiveCandidate.explicitness,
          });
          continue;
        }

        if (effectiveCandidate.memoryType === "preference") {
          const scopedPreferences = await config.repositories.preferences.listByScope(
            input.scope,
          );
          const category =
            effectiveCandidate.metadata?.preferenceCategory ?? "general_preference";
          const value = String(
            effectiveCandidate.metadata?.preferenceValue ?? effectiveCandidate.content,
          ).trim();
          const duplicate = scopedPreferences.find(
            (preference) =>
              preference.category === category &&
              String(preference.value).trim().toLowerCase() === value.toLowerCase(),
          );

          if (duplicate) {
            accepted += 1;
            events.push({
              candidateId: candidate.id,
              outcome: "merged",
              memoryType: "preference",
              memoryId: duplicate.id,
              reason: "duplicate_preference",
              sourceMethod: effectiveCandidate.explicitness,
            });
            continue;
          }

          const conflictingPreferences = scopedPreferences
            .filter((preference) => preference.category === category)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

          if (conflictingPreferences.length > 0) {
            const current = conflictingPreferences[0]!;
            const updatedPreference = buildPreference(
              input.scope,
              effectiveCandidate,
              current.id,
              timestamp,
              resolvedLanguage.locale,
            );

            await config.repositories.preferences.upsert(updatedPreference);
            for (const stale of conflictingPreferences.slice(1)) {
              await config.documentStore.delete("preferences", stale.id);
            }

            accepted += 1;
            events.push({
              candidateId: candidate.id,
              outcome: "superseded",
              memoryType: "preference",
              memoryId: updatedPreference.id,
              reason: "superseded_preference",
              sourceMethod: effectiveCandidate.explicitness,
            });
            continue;
          }

          const preference = buildPreference(
            input.scope,
            effectiveCandidate,
            createId(),
            timestamp,
            resolvedLanguage.locale,
          );
          await config.repositories.preferences.upsert(preference);
          accepted += 1;
          events.push({
            candidateId: candidate.id,
            outcome: "written",
            memoryType: "preference",
            memoryId: preference.id,
            reason: "explicit_preference",
            sourceMethod: effectiveCandidate.explicitness,
          });
          continue;
        }

        if (effectiveCandidate.memoryType === "reference") {
          const scopedReferences = await config.repositories.references.listByScope(
            input.scope,
          );
          const resolvedSubject = resolveReferenceSubject(
            effectiveCandidate,
            scopedReferences,
          );
          const referenceCandidate =
            resolvedSubject === effectiveCandidate.metadata?.subject
              ? effectiveCandidate
              : {
                  ...effectiveCandidate,
                  metadata: {
                    ...effectiveCandidate.metadata,
                    subject: resolvedSubject,
                  },
                };
          const pointer =
            referenceCandidate.metadata?.referencePointer ?? referenceCandidate.content;
          const duplicate = scopedReferences.find(
            (reference) =>
              reference.lifecycle === "active" && reference.pointer === pointer,
          );

          if (duplicate) {
            if (
              duplicate.subject === "unknown" &&
              referenceCandidate.metadata?.subject &&
              referenceCandidate.metadata.subject !== "unknown"
            ) {
              await config.repositories.references.add(
                createReferenceMemory({
                  ...duplicate,
                  subject: referenceCandidate.metadata.subject,
                  updatedAt: timestamp,
                }),
              );
            }
            accepted += 1;
            events.push({
              candidateId: candidate.id,
              outcome: "merged",
              memoryType: "reference",
              memoryId: duplicate.id,
              reason: "duplicate_reference",
              sourceMethod: effectiveCandidate.explicitness,
            });
            continue;
          }

          const superseded = scopedReferences.find(
            (reference) =>
              reference.lifecycle === "active" &&
              reference.pointer === referenceCandidate.metadata?.supersedesPointer,
          );
          if (superseded && config.policy?.resolveConflict) {
            const resolution = await config.policy.resolveConflict(
              toPolicyMemoryRecord(superseded, "reference"),
              referenceCandidate,
              policyContext,
            );

            if (resolution.action === "keep_existing") {
              rejected += 1;
              events.push({
                candidateId: candidate.id,
                outcome: "rejected",
                memoryType: "reference",
                memoryId: superseded.id,
                reason: resolution.reason ?? "policy_keep_existing",
                sourceMethod: effectiveCandidate.explicitness,
              });
              continue;
            }
          }
          const reference = buildReference(
            input.scope,
            referenceCandidate,
            createId(),
            timestamp,
            resolvedLanguage.locale,
          );

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
            sourceMethod: effectiveCandidate.explicitness,
          });
          continue;
        }

        if (effectiveCandidate.memoryType === "fact") {
          const facts = await config.repositories.facts.listByScope(input.scope);
          const normalizedContent = language.normalizeForEquality(
            effectiveCandidate.content,
            resolvedLanguage,
          );
          const duplicate = facts.find(
            (fact) =>
              fact.lifecycle === "active" &&
              language.normalizeForEquality(fact.content, resolvedLanguage) === normalizedContent,
          );

          if (duplicate) {
            accepted += 1;
            events.push({
              candidateId: candidate.id,
              outcome: "merged",
              memoryType: "fact",
              memoryId: duplicate.id,
              reason: "duplicate_fact",
              sourceMethod: effectiveCandidate.explicitness,
            });
            continue;
          }

          const superseded = facts.find(
            (fact) =>
              fact.lifecycle === "active" &&
              fact.source.method !== "explicit" &&
              effectiveCandidate.explicitness === "explicit" &&
              language.tokenOverlap(
                fact.content,
                effectiveCandidate.content,
                resolvedLanguage,
              ) >= 0.4,
          );

          if (superseded && config.policy?.resolveConflict) {
            const resolution = await config.policy.resolveConflict(
              toPolicyMemoryRecord(superseded, "fact"),
              effectiveCandidate,
              policyContext,
            );

            if (resolution.action === "keep_existing") {
              rejected += 1;
              events.push({
                candidateId: candidate.id,
                outcome: "rejected",
                memoryType: "fact",
                memoryId: superseded.id,
                reason: resolution.reason ?? "policy_keep_existing",
                sourceMethod: effectiveCandidate.explicitness,
              });
              continue;
            }
          }

          const fact = buildFact(
            input.scope,
            effectiveCandidate,
            createId(),
            timestamp,
            resolvedLanguage.locale,
          );

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
            sourceMethod: effectiveCandidate.explicitness,
          });
          continue;
        }

        const scopedFeedback = await config.repositories.feedback.listByScope(input.scope);
        const normalizedRule = language.normalizeForEquality(
          effectiveCandidate.content,
          resolvedLanguage,
        );
        const duplicate = scopedFeedback.find(
          (feedback) =>
            feedback.lifecycle === "active" &&
            feedback.kind === (effectiveCandidate.metadata?.feedbackKind ?? "do") &&
            language.normalizeForEquality(feedback.rule, resolvedLanguage) === normalizedRule,
        );

        if (duplicate) {
          accepted += 1;
          events.push({
            candidateId: candidate.id,
            outcome: "merged",
            memoryType: "feedback",
            memoryId: duplicate.id,
            reason: "duplicate_feedback",
            sourceMethod: effectiveCandidate.explicitness,
          });
          continue;
        }

        const superseded = scopedFeedback.find(
          (feedback) =>
            feedback.lifecycle === "active" &&
            feedback.appliesTo === effectiveCandidate.metadata?.appliesTo &&
            feedback.kind === (effectiveCandidate.metadata?.feedbackKind ?? "do"),
        );
        if (superseded && config.policy?.resolveConflict) {
          const resolution = await config.policy.resolveConflict(
            toPolicyMemoryRecord(superseded, "feedback"),
            effectiveCandidate,
            policyContext,
          );

          if (resolution.action === "keep_existing") {
            rejected += 1;
            events.push({
              candidateId: candidate.id,
              outcome: "rejected",
              memoryType: "feedback",
              memoryId: superseded.id,
              reason: resolution.reason ?? "policy_keep_existing",
              sourceMethod: effectiveCandidate.explicitness,
            });
            continue;
          }
        }
        const feedback = buildFeedback(
          input.scope,
          effectiveCandidate,
          createId(),
          timestamp,
          resolvedLanguage.locale,
        );

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
            sourceMethod: effectiveCandidate.explicitness,
          });
      }

      const episode = maybeBuildEpisode(
        input,
        extraction.candidates,
        createId(),
        now(),
        language,
        resolvedLanguage.locale,
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
        metadata: {
          locale: resolvedLanguage.locale,
          localeSource: resolvedLanguage.localeSource,
          adapterId: resolvedLanguage.adapterId,
          analysisMode: resolvedLanguage.analysisMode,
        },
      };
    },
  };
}
