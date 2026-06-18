// Memory administration operations (export / delete-all) extracted from the
// createGoodMemory composition root. These are self-contained data operations
// over the governance repositories + stores, so they live here as pure
// functions that take their dependencies explicitly; GoodMemoryImpl delegates
// to them. Keeps the composition root focused on wiring rather than
// per-operation orchestration.
import type { ArtifactSpillRecord } from "../domain/records";
import { EVIDENCE_COLLECTION } from "../evidence/contracts";
import {
  EXPERIENCES_COLLECTION,
  LEARNING_PROPOSALS_COLLECTION,
  PROMOTION_RECORDS_COLLECTION,
  SESSION_ARCHIVES_COLLECTION,
} from "../evolution/contracts";
import { buildMarkdownArtifacts } from "../governance/markdownArtifacts";
import type { GoodMemoryTracer } from "../observability/tracer";
import { ARTIFACT_SPILL_COLLECTION } from "../runtime/spillover";
import type { DocumentStore, SessionStore } from "../storage/contracts";
import type {
  GovernanceRepositoryPort,
  GovernanceVectorPort,
} from "../storage/ports";
import { deleteVectorForCollection } from "./governance";
import type {
  DeleteAllMemoryInput,
  DeleteAllMemoryResult,
  ExportMemoryInput,
  ExportMemoryResult,
  ForgetInput,
} from "./contracts";

export type ScopeBoundRecord = {
  userId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  sessionId?: string;
};

export interface MemoryAdminDeps {
  tracer: GoodMemoryTracer;
  governanceRepositories: GovernanceRepositoryPort;
  governanceVectors: GovernanceVectorPort | null;
  sessionStore: SessionStore;
  documentStore: DocumentStore;
}

export function recordMatchesScope(
  record: ScopeBoundRecord,
  scope: ForgetInput["scope"],
): boolean {
  if (record.userId !== scope.userId) {
    return false;
  }

  const optionalKeys: Array<keyof ForgetInput["scope"]> = [
    "tenantId",
    "workspaceId",
    "agentId",
    "sessionId",
  ];

  return optionalKeys.every((key) => {
    const expected = scope[key];
    if (expected === undefined) {
      return true;
    }

    return record[key] === expected;
  });
}

export function isPureUserScope(scope: ForgetInput["scope"]): boolean {
  return (
    scope.tenantId === undefined &&
    scope.workspaceId === undefined &&
    scope.agentId === undefined &&
    scope.sessionId === undefined
  );
}

export async function exportMemoryOperation(
  deps: MemoryAdminDeps,
  input: ExportMemoryInput,
): Promise<ExportMemoryResult> {
  const trace = await deps.tracer.start({
    name: "memory.export",
    scope: input.scope,
    attributes: {
      includeRuntime: Boolean(input.includeRuntime),
    },
  });

  try {
    const [
      profile,
      preferences,
      references,
      facts,
      feedback,
      episodes,
      archives,
      evidence,
      experiences,
      proposals,
      promotions,
      workingMemory,
      journal,
      allSpills,
    ] = await Promise.all([
      deps.governanceRepositories.profiles.get(input.scope.userId),
      deps.governanceRepositories.preferences.listByScope(input.scope),
      deps.governanceRepositories.references.listByScope(input.scope),
      deps.governanceRepositories.facts.listByScope(input.scope),
      deps.governanceRepositories.feedback.listByScope(input.scope),
      deps.governanceRepositories.episodes.listByScope(input.scope),
      deps.governanceRepositories.archives.listByScope(input.scope),
      deps.governanceRepositories.evidence.listByScope(input.scope),
      deps.governanceRepositories.experiences.listByScope(input.scope),
      deps.governanceRepositories.proposals.listByScope(input.scope),
      deps.governanceRepositories.promotions.listByScope(input.scope),
      input.includeRuntime && input.scope.sessionId
        ? deps.sessionStore.getWorkingMemory(input.scope)
        : Promise.resolve(null),
      input.includeRuntime && input.scope.sessionId
        ? deps.sessionStore.getJournal(input.scope)
        : Promise.resolve(null),
      input.includeRuntime
        ? deps.documentStore.query<ArtifactSpillRecord>(ARTIFACT_SPILL_COLLECTION)
        : Promise.resolve([]),
    ]);

    const spills = allSpills.filter((record) =>
      recordMatchesScope(record.scope, input.scope),
    );

    const durable = {
      profile: isPureUserScope(input.scope) ? profile : null,
      preferences: preferences.filter((record) => recordMatchesScope(record, input.scope)),
      references: references.filter((record) => recordMatchesScope(record, input.scope)),
      facts: facts.filter((record) => recordMatchesScope(record, input.scope)),
      feedback: feedback.filter((record) => recordMatchesScope(record, input.scope)),
      episodes: episodes.filter((record) => recordMatchesScope(record, input.scope)),
      archives: archives.filter((record) => recordMatchesScope(record, input.scope)),
      evidence: evidence.filter((record) => recordMatchesScope(record, input.scope)),
      experiences: experiences.filter((record) => recordMatchesScope(record, input.scope)),
      proposals: proposals.filter((record) => recordMatchesScope(record, input.scope)),
      promotions: promotions.filter((record) => recordMatchesScope(record, input.scope)),
    };
    const runtime = input.includeRuntime
      ? {
          workingMemory,
          journal,
          spills,
        }
      : undefined;

    await trace.succeeded({
      attributes: {
        factCount: durable.facts.length,
        feedbackCount: durable.feedback.length,
        preferenceCount: durable.preferences.length,
        referenceCount: durable.references.length,
      },
    });

    return {
      artifacts: buildMarkdownArtifacts({
        scope: input.scope,
        durable,
        runtime,
      }),
      scope: input.scope,
      exportedAt: new Date().toISOString(),
      ...(trace.traceId ? { traceId: trace.traceId } : {}),
      durable,
      runtime,
    };
  } catch (error) {
    await trace.failed({ error });
    throw error;
  }
}

export async function deleteAllMemoryOperation(
  deps: MemoryAdminDeps,
  input: DeleteAllMemoryInput,
): Promise<DeleteAllMemoryResult> {
  const trace = await deps.tracer.start({
    name: "memory.delete_all",
    scope: input.scope,
    attributes: {
      includeRuntime: input.includeRuntime !== false,
    },
  });
  const deleted: DeleteAllMemoryResult["deleted"] = {
    profiles: 0,
    preferences: 0,
    references: 0,
    facts: 0,
    feedback: 0,
    episodes: 0,
    archives: 0,
    evidence: 0,
    experiences: 0,
    proposals: 0,
    promotions: 0,
    workingMemory: 0,
    journal: 0,
    artifactSpills: 0,
  };

  try {
    const [
      profile,
      allPreferences,
      allReferences,
      allFacts,
      allFeedback,
      allEpisodes,
      allArchives,
      allEvidence,
      allExperiences,
      allProposals,
      allPromotions,
    ] = await Promise.all([
      deps.governanceRepositories.profiles.get(input.scope.userId),
      deps.governanceRepositories.preferences.listByScope(input.scope),
      deps.governanceRepositories.references.listByScope(input.scope),
      deps.governanceRepositories.facts.listByScope(input.scope),
      deps.governanceRepositories.feedback.listByScope(input.scope),
      deps.governanceRepositories.episodes.listByScope(input.scope),
      deps.governanceRepositories.archives.listByScope(input.scope),
      deps.governanceRepositories.evidence.listByScope(input.scope),
      deps.governanceRepositories.experiences.listByScope(input.scope),
      deps.governanceRepositories.proposals.listByScope(input.scope),
      deps.governanceRepositories.promotions.listByScope(input.scope),
    ]);

    const preferences = allPreferences.filter((record) =>
      recordMatchesScope(record, input.scope),
    );
    const references = allReferences.filter((record) =>
      recordMatchesScope(record, input.scope),
    );
    const facts = allFacts.filter((record) => recordMatchesScope(record, input.scope));
    const feedback = allFeedback.filter((record) =>
      recordMatchesScope(record, input.scope),
    );
    const episodes = allEpisodes.filter((record) =>
      recordMatchesScope(record, input.scope),
    );
    const archives = allArchives.filter((record) =>
      recordMatchesScope(record, input.scope),
    );
    const evidence = allEvidence.filter((record) =>
      recordMatchesScope(record, input.scope),
    );
    const experiences = allExperiences.filter((record) =>
      recordMatchesScope(record, input.scope),
    );
    const proposals = allProposals.filter((record) =>
      recordMatchesScope(record, input.scope),
    );
    const promotions = allPromotions.filter((record) =>
      recordMatchesScope(record, input.scope),
    );

    if (profile && isPureUserScope(input.scope)) {
      await deps.documentStore.delete("profiles", input.scope.userId);
      deleted.profiles = 1;
    }

    for (const preference of preferences) {
      await deps.documentStore.delete("preferences", preference.id);
      deleted.preferences += 1;
    }
    for (const reference of references) {
      await deleteVectorForCollection(deps.governanceVectors, "references", reference.id);
      await deps.documentStore.delete("references", reference.id);
      deleted.references += 1;
    }
    for (const fact of facts) {
      await deleteVectorForCollection(deps.governanceVectors, "facts", fact.id);
      await deps.documentStore.delete("facts", fact.id);
      deleted.facts += 1;
    }
    for (const feedbackItem of feedback) {
      await deps.documentStore.delete("feedback", feedbackItem.id);
      deleted.feedback += 1;
    }
    for (const episode of episodes) {
      await deleteVectorForCollection(deps.governanceVectors, "episodes", episode.id);
      await deps.documentStore.delete("episodes", episode.id);
      deleted.episodes += 1;
    }
    for (const archive of archives) {
      await deps.documentStore.delete(SESSION_ARCHIVES_COLLECTION, archive.id);
      deleted.archives += 1;
    }
    for (const evidenceRecord of evidence) {
      await deps.documentStore.delete(EVIDENCE_COLLECTION, evidenceRecord.id);
      deleted.evidence += 1;
    }
    for (const experience of experiences) {
      await deps.documentStore.delete(EXPERIENCES_COLLECTION, experience.id);
      deleted.experiences += 1;
    }
    for (const proposal of proposals) {
      await deps.documentStore.delete(LEARNING_PROPOSALS_COLLECTION, proposal.id);
      deleted.proposals += 1;
    }
    for (const promotion of promotions) {
      await deps.documentStore.delete(PROMOTION_RECORDS_COLLECTION, promotion.id);
      deleted.promotions += 1;
    }

    if (input.includeRuntime !== false) {
      const allSpills = await deps.documentStore.query<ArtifactSpillRecord>(
        ARTIFACT_SPILL_COLLECTION,
      );
      const spills = allSpills.filter((record) =>
        recordMatchesScope(record.scope, input.scope),
      );

      deleted.workingMemory = await deps.sessionStore.deleteWorkingMemoryByScope(
        input.scope,
      );
      deleted.journal = await deps.sessionStore.deleteJournalsByScope(input.scope);
      await deps.sessionStore.deleteBuffersByScope(input.scope);
      for (const spill of spills) {
        await deps.documentStore.delete(ARTIFACT_SPILL_COLLECTION, spill.id);
        deleted.artifactSpills += 1;
      }
    }

    await trace.succeeded({
      attributes: {
        deletedFacts: deleted.facts,
        deletedFeedback: deleted.feedback,
        deletedPreferences: deleted.preferences,
        deletedReferences: deleted.references,
      },
    });

    return {
      scope: input.scope,
      ...(trace.traceId ? { traceId: trace.traceId } : {}),
      deleted,
    };
  } catch (error) {
    await trace.failed({ error });
    throw error;
  }
}
