import {
  createFactMemory,
  createFeedbackMemory,
  createPreferenceMemory,
  createReferenceMemory,
  createUserProfile,
  isActiveMemoryLifecycle,
} from "../domain/records";
import type {
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  UserProfile,
} from "../domain/records";
import { createMemorySource } from "../domain/provenance";
import {
  createEvidenceRecord,
} from "../evidence/contracts";
import type { EvidenceRecord } from "../evidence/contracts";
import type { MemorySourceMethod } from "../domain/provenance";
import type { ClassifiedCandidate, ScopedIdentity } from "./contracts";
import { extractCanonicalReferencePointer } from "./normalization";

const EVIDENCE_MAX_EXCERPT_CHARS = 280;

export function buildProfile(
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

export function getProfileWriteReason(candidate: ClassifiedCandidate): string {
  const profileField = candidate.metadata?.profileField ?? "name";
  const suffix = profileField
    .replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
    .toLowerCase();

  return `explicit_profile_${suffix}`;
}

export function buildPreference(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
  locale: string,
) {
  return createPreferenceMemory({
    id,
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    category: candidate.metadata?.preferenceCategory ?? "general_preference",
    value: candidate.metadata?.preferenceValue ?? candidate.content,
    tags: candidate.metadata?.tags,
    attributes: candidate.metadata?.attributes,
    source: createMemorySource({
      method: candidate.explicitness,
      extractedAt: timestamp,
      locale,
    }),
    updatedAt: timestamp,
  });
}

export function buildReference(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  id: string,
  timestamp: string,
  locale: string,
): ReferenceMemory {
  const resolvedPointer =
    extractCanonicalReferencePointer(candidate.metadata?.referencePointer) ??
    extractCanonicalReferencePointer(candidate.content) ??
    candidate.metadata?.referencePointer ??
    candidate.content;
  const resolvedTitle = candidate.metadata?.referenceTitle?.trim();

  return createReferenceMemory({
    id,
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    title:
      resolvedTitle && resolvedTitle.length > 0
        ? resolvedTitle
        : resolvedPointer.split("/").at(-1) ?? resolvedPointer,
    pointer: resolvedPointer,
    source: createMemorySource({
      method: candidate.explicitness,
      extractedAt: timestamp,
      locale,
    }),
    referenceKind: candidate.metadata?.referenceKind,
    subject: candidate.metadata?.subject ?? "unknown",
    tags: candidate.metadata?.tags,
    attributes: candidate.metadata?.attributes,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function resolveReferenceSubject(
  candidate: ClassifiedCandidate,
  scopedReferences: ReferenceMemory[],
): string {
  const candidateSubject = candidate.metadata?.subject?.trim();
  if (candidateSubject && candidateSubject !== "unknown") {
    return candidateSubject;
  }

  const supersededPointer = candidate.metadata?.supersedesPointer;
  if (supersededPointer) {
    const canonicalSupersededPointer =
      extractCanonicalReferencePointer(supersededPointer) ?? supersededPointer;
    const supersededReference = scopedReferences.find(
      (reference) =>
        isActiveMemoryLifecycle(reference) &&
        (extractCanonicalReferencePointer(reference.pointer) ?? reference.pointer) ===
          canonicalSupersededPointer &&
        reference.subject &&
        reference.subject !== "unknown",
    );

    if (supersededReference?.subject) {
      return supersededReference.subject;
    }
  }

  return "unknown";
}

export function buildFact(
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
    tags: candidate.metadata?.tags,
    attributes: candidate.metadata?.attributes,
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

function resolveFactCategory(
  existing: FactMemory["category"],
  candidate: ClassifiedCandidate,
): FactMemory["category"] {
  const next = candidate.metadata?.category;
  if (!next || next === existing) {
    return existing;
  }

  if (existing === "project") {
    return next;
  }

  return existing;
}

function resolveFactKind(
  existing: FactMemory["factKind"],
  candidate: ClassifiedCandidate,
): FactMemory["factKind"] {
  const next = candidate.metadata?.factKind;
  if (!next || next === existing) {
    return existing;
  }

  if (!existing || existing === "generic_project") {
    return next;
  }

  return existing;
}

function resolveFactScopeKind(
  existing: FactMemory["scopeKind"],
  candidate: ClassifiedCandidate,
): FactMemory["scopeKind"] {
  return existing ?? candidate.metadata?.scopeKind;
}

function resolveFactSubject(
  existing: FactMemory["subject"],
  candidate: ClassifiedCandidate,
): FactMemory["subject"] {
  const next = candidate.metadata?.subject?.trim();
  if (!next || next === "unknown" || next === existing) {
    return existing;
  }

  if (!existing || existing === "unknown") {
    return next;
  }

  return existing;
}

function sourceMethodStrength(method: MemorySourceMethod): number {
  if (method === "explicit" || method === "confirmed") {
    return 2;
  }
  if (method === "import") {
    return 1;
  }

  return 0;
}

function strengthenSourceMethod(
  source: FactMemory["source"] | ReferenceMemory["source"],
  candidate: ClassifiedCandidate,
  timestamp: string,
  locale: string,
): FactMemory["source"] | ReferenceMemory["source"] {
  if (sourceMethodStrength(candidate.explicitness) <= sourceMethodStrength(source.method)) {
    return source;
  }

  return createMemorySource({
    ...source,
    method: candidate.explicitness,
    extractedAt: timestamp,
    locale,
  });
}

function mergeTags(
  existing: string[] | undefined,
  next: string[] | undefined,
): string[] | undefined {
  const merged = [...new Set([...(existing ?? []), ...(next ?? [])])];

  return merged.length > 0 ? merged : undefined;
}

function sameTags(
  left: string[] | undefined,
  right: string[] | undefined,
): boolean {
  const leftTags = left ?? [];
  const rightTags = right ?? [];

  return leftTags.length === rightTags.length &&
    leftTags.every((tag, index) => tag === rightTags[index]);
}

function mergeAttributes<
  TAttributes extends Record<string, string | number | boolean | null>,
>(
  existing: TAttributes | undefined,
  next: TAttributes | undefined,
): TAttributes | undefined {
  const merged = {
    ...(existing ?? {}),
    ...(next ?? {}),
  } as TAttributes;

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function sameAttributes(
  left: Record<string, string | number | boolean | null> | undefined,
  right: Record<string, string | number | boolean | null> | undefined,
): boolean {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});

  return leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => right?.[key] === value);
}

export function enrichDuplicatePreference(
  preference: PreferenceMemory,
  candidate: ClassifiedCandidate,
  timestamp: string,
  locale: string,
): PreferenceMemory | null {
  const tags = mergeTags(preference.tags, candidate.metadata?.tags);
  const attributes = mergeAttributes(
    preference.attributes,
    candidate.metadata?.attributes,
  );
  const source = strengthenSourceMethod(
    preference.source,
    candidate,
    timestamp,
    locale,
  ) as PreferenceMemory["source"];

  if (
    sameTags(tags, preference.tags) &&
    sameAttributes(attributes, preference.attributes) &&
    source.method === preference.source.method
  ) {
    return null;
  }

  return createPreferenceMemory({
    ...preference,
    tags,
    attributes,
    source,
    updatedAt: timestamp,
  });
}

export function enrichDuplicateFact(
  fact: FactMemory,
  candidate: ClassifiedCandidate,
  timestamp: string,
  locale: string,
): FactMemory | null {
  const category = resolveFactCategory(fact.category, candidate);
  const factKind = resolveFactKind(fact.factKind, candidate);
  const scopeKind = resolveFactScopeKind(fact.scopeKind, candidate);
  const subject = resolveFactSubject(fact.subject, candidate);
  const source = strengthenSourceMethod(
    fact.source,
    candidate,
    timestamp,
    locale,
  ) as FactMemory["source"];
  const tags = mergeTags(fact.tags, candidate.metadata?.tags);
  const attributes = mergeAttributes(fact.attributes, candidate.metadata?.attributes);

  if (
    category === fact.category &&
    factKind === fact.factKind &&
    scopeKind === fact.scopeKind &&
    subject === fact.subject &&
    sameTags(tags, fact.tags) &&
    sameAttributes(attributes, fact.attributes) &&
    source.method === fact.source.method
  ) {
    return null;
  }

  return createFactMemory({
    ...fact,
    category,
    factKind,
    scopeKind,
    subject,
    tags,
    attributes,
    source,
    updatedAt: timestamp,
  });
}

function referenceKindStrength(kind: ReferenceMemory["referenceKind"]): number {
  if (kind === "source_of_truth") {
    return 3;
  }
  if (kind === "runbook" || kind === "dashboard" || kind === "tracker") {
    return 2;
  }
  if (kind === "doc") {
    return 1;
  }

  return 0;
}

function resolveDuplicateReferenceKind(
  existing: ReferenceMemory["referenceKind"],
  candidate: ClassifiedCandidate,
): ReferenceMemory["referenceKind"] {
  const next = candidate.metadata?.referenceKind;
  if (!next || next === existing) {
    return existing;
  }

  return referenceKindStrength(next) > referenceKindStrength(existing)
    ? next
    : existing;
}

function resolveDuplicateReferenceSubject(
  existing: ReferenceMemory["subject"],
  candidate: ClassifiedCandidate,
): ReferenceMemory["subject"] {
  const next = candidate.metadata?.subject?.trim();
  if (!next || next === "unknown" || next === existing) {
    return existing;
  }

  if (!existing || existing === "unknown") {
    return next;
  }

  return existing;
}

export function enrichDuplicateReference(
  reference: ReferenceMemory,
  candidate: ClassifiedCandidate,
  timestamp: string,
  locale: string,
): ReferenceMemory | null {
  const referenceKind = resolveDuplicateReferenceKind(
    reference.referenceKind,
    candidate,
  );
  const subject = resolveDuplicateReferenceSubject(reference.subject, candidate);
  const source = strengthenSourceMethod(
    reference.source,
    candidate,
    timestamp,
    locale,
  ) as ReferenceMemory["source"];
  const tags = mergeTags(reference.tags, candidate.metadata?.tags);
  const attributes = mergeAttributes(
    reference.attributes,
    candidate.metadata?.attributes,
  );

  if (
    referenceKind === reference.referenceKind &&
    subject === reference.subject &&
    sameTags(tags, reference.tags) &&
    sameAttributes(attributes, reference.attributes) &&
    source.method === reference.source.method
  ) {
    return null;
  }

  return createReferenceMemory({
    ...reference,
    referenceKind,
    subject,
    tags,
    attributes,
    source,
    updatedAt: timestamp,
  });
}

export function buildFeedback(
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
    tags: candidate.metadata?.tags,
    attributes: candidate.metadata?.attributes,
    source: createMemorySource({
      method: candidate.explicitness,
      extractedAt: timestamp,
      locale,
    }),
    updatedAt: timestamp,
  });
}

export function enrichDuplicateFeedback(
  feedback: FeedbackMemory,
  candidate: ClassifiedCandidate,
  timestamp: string,
  locale: string,
): FeedbackMemory | null {
  const tags = mergeTags(feedback.tags, candidate.metadata?.tags);
  const attributes = mergeAttributes(
    feedback.attributes,
    candidate.metadata?.attributes,
  );
  const source = strengthenSourceMethod(
    feedback.source,
    candidate,
    timestamp,
    locale,
  ) as FeedbackMemory["source"];

  if (
    sameTags(tags, feedback.tags) &&
    sameAttributes(attributes, feedback.attributes) &&
    source.method === feedback.source.method
  ) {
    return null;
  }

  return createFeedbackMemory({
    ...feedback,
    tags,
    attributes,
    source,
    updatedAt: timestamp,
  });
}

function buildEvidenceExcerpt(
  candidate: ClassifiedCandidate,
  sourceMessageContent?: string,
): string {
  const excerpt = (sourceMessageContent ?? candidate.content).trim();

  if (excerpt.length <= EVIDENCE_MAX_EXCERPT_CHARS) {
    return excerpt;
  }

  return `${excerpt.slice(0, EVIDENCE_MAX_EXCERPT_CHARS - 3)}...`;
}

export function buildCandidateEvidence(
  scope: ScopedIdentity,
  candidate: ClassifiedCandidate,
  memoryId: string,
  evidenceId: string,
  timestamp: string,
  locale: string,
  sourceMessageContent?: string,
): EvidenceRecord {
  return createEvidenceRecord({
    id: evidenceId,
    userId: scope.userId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    agentId: scope.agentId,
    sessionId: scope.sessionId,
    kind: "conversation_excerpt",
    excerpt: buildEvidenceExcerpt(candidate, sourceMessageContent),
    source: createMemorySource({
      method: candidate.explicitness,
      extractedAt: timestamp,
      sessionId: scope.sessionId,
      locale,
    }),
    linkedMemoryIds: [memoryId],
  });
}
