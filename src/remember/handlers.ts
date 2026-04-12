import {
  createFactMemory,
  createFeedbackMemory,
  createReferenceMemory,
} from "../domain/records";
import {
  buildFactEmbeddingWrite,
  buildReferenceEmbeddingWrite,
} from "../embedding/vectorWrites";
import { toPolicyMemoryRecord } from "../policy/hooks";
import { buildRememberEventTrace } from "./classification";
import {
  buildCandidateEvidence,
  buildFact,
  buildFeedback,
  buildPreference,
  buildProfile,
  buildReference,
  enrichDuplicateFact,
  enrichDuplicateReference,
  getProfileWriteReason,
  resolveReferenceSubject,
} from "./builders";
import type {
  ClassifiedCandidate,
  RememberWriteContext,
  RememberWriteState,
} from "./contracts";

function pushAcceptedEvent(
  state: RememberWriteState,
  event: RememberWriteState["events"][number],
): void {
  state.accepted += 1;
  state.events.push(event);
}

export async function writeRememberCandidate(input: {
  candidateId: string;
  candidate: ClassifiedCandidate;
  context: RememberWriteContext;
  state: RememberWriteState;
}): Promise<void> {
  const { candidateId, candidate, context, state } = input;
  const timestamp = context.now();

  if (candidate.memoryType === "profile") {
    const existing = await context.repositories.profiles.get(context.input.scope.userId);
    const profile = buildProfile(
      context.input.scope.userId,
      existing,
      candidate,
      timestamp,
    );
    await context.setDocumentWithRollback("profiles", profile.userId, profile);
    pushAcceptedEvent(state, {
      candidateId,
      outcome: "written",
      memoryType: "profile",
      memoryId: profile.userId,
      reason: getProfileWriteReason(candidate),
      ...buildRememberEventTrace(candidate),
    });
    return;
  }

  if (candidate.memoryType === "preference") {
    const scopedPreferences = await context.repositories.preferences.listByScope(
      context.input.scope,
    );
    const category =
      candidate.metadata?.preferenceCategory ?? "general_preference";
    const value = String(
      candidate.metadata?.preferenceValue ?? candidate.content,
    ).trim();
    const duplicate = scopedPreferences.find(
      (preference) =>
        preference.category === category &&
        String(preference.value).trim().toLowerCase() === value.toLowerCase(),
    );

    if (duplicate) {
      pushAcceptedEvent(state, {
        candidateId,
        outcome: "merged",
        memoryType: "preference",
        memoryId: duplicate.id,
        reason: "duplicate_preference",
        ...buildRememberEventTrace(candidate),
      });
      return;
    }

    const conflictingPreferences = scopedPreferences
      .filter((preference) => preference.category === category)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    if (conflictingPreferences.length > 0) {
      const current = conflictingPreferences[0]!;
      const updatedPreference = buildPreference(
        context.input.scope,
        candidate,
        current.id,
        timestamp,
        context.resolvedLanguage.locale,
      );

      await context.setDocumentWithRollback(
        "preferences",
        updatedPreference.id,
        updatedPreference,
      );
      for (const stale of conflictingPreferences.slice(1)) {
        await context.deleteDocumentWithRollback("preferences", stale.id);
      }

      pushAcceptedEvent(state, {
        candidateId,
        outcome: "superseded",
        memoryType: "preference",
        memoryId: updatedPreference.id,
        reason: "superseded_preference",
        ...buildRememberEventTrace(candidate),
      });
      return;
    }

    const preference = buildPreference(
      context.input.scope,
      candidate,
      context.createId(),
      timestamp,
      context.resolvedLanguage.locale,
    );
    await context.setDocumentWithRollback("preferences", preference.id, preference);
    pushAcceptedEvent(state, {
      candidateId,
      outcome: "written",
      memoryType: "preference",
      memoryId: preference.id,
      reason: "explicit_preference",
      ...buildRememberEventTrace(candidate),
    });
    return;
  }

  if (candidate.memoryType === "reference") {
    const scopedReferences = await context.repositories.references.listByScope(
      context.input.scope,
    );
    const resolvedSubject = resolveReferenceSubject(
      candidate,
      scopedReferences,
    );
    const referenceCandidate =
      resolvedSubject === candidate.metadata?.subject
        ? candidate
        : {
            ...candidate,
            metadata: {
              ...candidate.metadata,
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
      const enrichedDuplicate = enrichDuplicateReference(
        duplicate,
        referenceCandidate,
        timestamp,
        context.resolvedLanguage.locale,
      );
      if (enrichedDuplicate) {
        await context.setDocumentWithRollback(
          "references",
          duplicate.id,
          enrichedDuplicate,
        );
      }
      const evidenceId = context.createId();
      await context.setDocumentWithRollback(
        "evidence",
        evidenceId,
        buildCandidateEvidence(
          context.input.scope,
          referenceCandidate,
          duplicate.id,
          evidenceId,
          timestamp,
          context.resolvedLanguage.locale,
          context.input.messages[referenceCandidate.sourceMessageIndex]?.content,
        ),
      );
      pushAcceptedEvent(state, {
        candidateId,
        outcome: "merged",
        memoryType: "reference",
        memoryId: duplicate.id,
        reason: "duplicate_reference",
        ...buildRememberEventTrace(candidate),
        evidenceIds: [evidenceId],
      });
      return;
    }

    const superseded = scopedReferences.find(
      (reference) =>
        reference.lifecycle === "active" &&
        reference.pointer === referenceCandidate.metadata?.supersedesPointer,
    );
    if (superseded && context.policy?.resolveConflict) {
      const resolution = await context.policy.resolveConflict(
        toPolicyMemoryRecord(superseded, "reference"),
        referenceCandidate,
        context.policyContext,
      );

      if (resolution.action === "keep_existing") {
        state.rejected += 1;
        state.events.push({
          candidateId,
          outcome: "rejected",
          memoryType: "reference",
          memoryId: superseded.id,
          reason: resolution.reason ?? "policy_keep_existing",
          ...buildRememberEventTrace(candidate),
        });
        return;
      }
    }
    const reference = buildReference(
      context.input.scope,
      referenceCandidate,
      context.createId(),
      timestamp,
      context.resolvedLanguage.locale,
    );
    const referenceEmbeddingWrite = buildReferenceEmbeddingWrite(reference);
    const supersededReferenceVector =
      superseded && context.vectorIndex
        ? await context.vectorIndex.getReferenceEmbedding(superseded.id)
        : null;

    if (superseded) {
      await context.setDocumentWithRollback(
        "references",
        superseded.id,
        createReferenceMemory({
          ...superseded,
          lifecycle: "superseded",
          updatedAt: timestamp,
        }),
      );
      state.pendingVectorDeletes.push({
        id: superseded.id,
        memoryType: "reference",
        restoreRecord: supersededReferenceVector
          ? {
              ...supersededReferenceVector,
              memoryType: "reference",
            }
          : null,
      });
    }

    await context.setDocumentWithRollback("references", reference.id, reference);
    state.pendingEmbeddingWrites.push(referenceEmbeddingWrite);
    const evidenceId = context.createId();
    await context.setDocumentWithRollback(
      "evidence",
      evidenceId,
      buildCandidateEvidence(
        context.input.scope,
        referenceCandidate,
        reference.id,
        evidenceId,
        timestamp,
        context.resolvedLanguage.locale,
        context.input.messages[referenceCandidate.sourceMessageIndex]?.content,
      ),
    );
    pushAcceptedEvent(state, {
      candidateId,
      outcome: superseded ? "superseded" : "written",
      memoryType: "reference",
      memoryId: reference.id,
      reason: superseded ? "superseded_reference" : "explicit_reference",
      ...buildRememberEventTrace(candidate),
      evidenceIds: [evidenceId],
    });
    return;
  }

  if (candidate.memoryType === "fact") {
    const facts = await context.repositories.facts.listByScope(context.input.scope);
    const normalizedContent = context.language.normalizeForEquality(
      candidate.content,
      context.resolvedLanguage,
    );
    const duplicate = facts.find(
      (fact) =>
        fact.lifecycle === "active" &&
        context.language.normalizeForEquality(fact.content, context.resolvedLanguage) ===
          normalizedContent,
    );

    if (duplicate) {
      const enrichedDuplicate = enrichDuplicateFact(
        duplicate,
        candidate,
        timestamp,
        context.resolvedLanguage.locale,
      );
      if (enrichedDuplicate) {
        await context.setDocumentWithRollback("facts", duplicate.id, enrichedDuplicate);
      }
      const evidenceId = context.createId();
      await context.setDocumentWithRollback(
        "evidence",
        evidenceId,
        buildCandidateEvidence(
          context.input.scope,
          candidate,
          duplicate.id,
          evidenceId,
          timestamp,
          context.resolvedLanguage.locale,
          context.input.messages[candidate.sourceMessageIndex]?.content,
        ),
      );
      pushAcceptedEvent(state, {
        candidateId,
        outcome: "merged",
        memoryType: "fact",
        memoryId: duplicate.id,
        reason: "duplicate_fact",
        ...buildRememberEventTrace(candidate),
        evidenceIds: [evidenceId],
      });
      return;
    }

    const superseded = facts.find(
      (fact) =>
        fact.lifecycle === "active" &&
        fact.source.method !== "explicit" &&
        candidate.explicitness === "explicit" &&
        context.language.tokenOverlap(
          fact.content,
          candidate.content,
          context.resolvedLanguage,
        ) >= 0.4,
    );

    if (superseded && context.policy?.resolveConflict) {
      const resolution = await context.policy.resolveConflict(
        toPolicyMemoryRecord(superseded, "fact"),
        candidate,
        context.policyContext,
      );

      if (resolution.action === "keep_existing") {
        state.rejected += 1;
        state.events.push({
          candidateId,
          outcome: "rejected",
          memoryType: "fact",
          memoryId: superseded.id,
          reason: resolution.reason ?? "policy_keep_existing",
          ...buildRememberEventTrace(candidate),
        });
        return;
      }
    }

    const fact = buildFact(
      context.input.scope,
      candidate,
      context.createId(),
      timestamp,
      context.resolvedLanguage.locale,
    );
    const factEmbeddingWrite = buildFactEmbeddingWrite(fact);
    const supersededFactVector =
      superseded && context.vectorIndex
        ? await context.vectorIndex.getFactEmbedding(superseded.id)
        : null;

    if (superseded) {
      await context.setDocumentWithRollback(
        "facts",
        superseded.id,
        createFactMemory({
          ...superseded,
          lifecycle: "superseded",
          isActive: false,
          supersededBy: fact.id,
          updatedAt: timestamp,
        }),
      );
      state.pendingVectorDeletes.push({
        id: superseded.id,
        memoryType: "fact",
        restoreRecord: supersededFactVector
          ? {
              ...supersededFactVector,
              memoryType: "fact",
            }
          : null,
      });
    }

    await context.setDocumentWithRollback("facts", fact.id, fact);
    state.pendingEmbeddingWrites.push(factEmbeddingWrite);
    const evidenceId = context.createId();
    await context.setDocumentWithRollback(
      "evidence",
      evidenceId,
      buildCandidateEvidence(
        context.input.scope,
        candidate,
        fact.id,
        evidenceId,
        timestamp,
        context.resolvedLanguage.locale,
        context.input.messages[candidate.sourceMessageIndex]?.content,
      ),
    );
    pushAcceptedEvent(state, {
      candidateId,
      outcome: superseded ? "superseded" : "written",
      memoryType: "fact",
      memoryId: fact.id,
      reason: superseded ? "superseded_inferred_fact" : "explicit_fact",
      ...buildRememberEventTrace(candidate),
      evidenceIds: [evidenceId],
    });
    return;
  }

  const scopedFeedback = await context.repositories.feedback.listByScope(context.input.scope);
  const normalizedRule = context.language.normalizeForEquality(
    candidate.content,
    context.resolvedLanguage,
  );
  const duplicate = scopedFeedback.find(
    (feedback) =>
      feedback.lifecycle === "active" &&
      feedback.kind === (candidate.metadata?.feedbackKind ?? "do") &&
      context.language.normalizeForEquality(feedback.rule, context.resolvedLanguage) ===
        normalizedRule,
  );

  if (duplicate) {
    pushAcceptedEvent(state, {
      candidateId,
      outcome: "merged",
      memoryType: "feedback",
      memoryId: duplicate.id,
      reason: "duplicate_feedback",
      ...buildRememberEventTrace(candidate),
    });
    return;
  }

  const superseded = scopedFeedback.find(
    (feedback) =>
      feedback.lifecycle === "active" &&
      feedback.appliesTo === candidate.metadata?.appliesTo &&
      feedback.kind === (candidate.metadata?.feedbackKind ?? "do"),
  );
  if (superseded && context.policy?.resolveConflict) {
    const resolution = await context.policy.resolveConflict(
      toPolicyMemoryRecord(superseded, "feedback"),
      candidate,
      context.policyContext,
    );

    if (resolution.action === "keep_existing") {
      state.rejected += 1;
      state.events.push({
        candidateId,
        outcome: "rejected",
        memoryType: "feedback",
        memoryId: superseded.id,
        reason: resolution.reason ?? "policy_keep_existing",
        ...buildRememberEventTrace(candidate),
      });
      return;
    }
  }
  const feedback = buildFeedback(
    context.input.scope,
    candidate,
    context.createId(),
    timestamp,
    context.resolvedLanguage.locale,
  );

  if (superseded) {
    await context.setDocumentWithRollback(
      "feedback",
      superseded.id,
      createFeedbackMemory({
        ...superseded,
        lifecycle: "superseded",
        supersededBy: feedback.id,
        updatedAt: timestamp,
      }),
    );
  }

  await context.setDocumentWithRollback("feedback", feedback.id, feedback);
  pushAcceptedEvent(state, {
    candidateId,
    outcome: superseded ? "superseded" : "written",
    memoryType: "feedback",
    memoryId: feedback.id,
    reason: superseded ? "superseded_feedback" : "explicit_feedback",
    ...buildRememberEventTrace(candidate),
  });
}
