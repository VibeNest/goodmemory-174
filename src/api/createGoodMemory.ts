import type {
  ArtifactSpillRecord,
  FactMemory,
  FeedbackMemory,
} from "../domain/records";
import { createFeedbackMemory } from "../domain/records";
import { createMemorySource } from "../domain/provenance";
import { EVIDENCE_COLLECTION } from "../evidence/contracts";
import type { ExperienceRecord } from "../evolution/contracts";
import {
  buildFeedbackExperienceRecord,
  buildRecallExperienceRecords,
  buildRememberExperienceRecord,
} from "../evolution/observations";
import { createProposalGateProcessor } from "../evolution/gates";
import { createRulesOnlyReviewer } from "../evolution/reviewer";
import type {
  FeedbackObservationResult,
  RecallObservationResult,
  RememberObservationResult,
} from "../evolution/observation-results";
import {
  EXPERIENCES_COLLECTION,
  LEARNING_PROPOSALS_COLLECTION,
  PROMOTION_RECORDS_COLLECTION,
  SESSION_ARCHIVES_COLLECTION,
} from "../evolution/contracts";
import { buildMarkdownArtifacts } from "../governance/markdownArtifacts";
import { createLanguageService } from "../language";
import { ARTIFACT_SPILL_COLLECTION } from "../runtime/spillover";
import { renderMemoryPacket } from "../recall/contextBuilder";
import { createRecallEngine } from "../recall/engine";
import { createDeterministicMemoryExtractor } from "../remember/deterministicExtractor";
import { createRememberEngine } from "../remember/engine";
import { createInMemoryDocumentStore, createInMemorySessionStore, createInMemoryVectorStore } from "../storage/memory";
import {
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "../storage/postgres";
import { createMemoryRepositories } from "../storage/repositories";
import type { MemoryRepositories } from "../storage/repositories";
import { createSQLiteDocumentStore, createSQLiteSessionStore } from "../storage/sqlite";
import type {
  BuildContextInput,
  BuildContextResult,
  DeleteAllMemoryInput,
  DeleteAllMemoryResult,
  ExportMemoryInput,
  ExportMemoryResult,
  FeedbackInput,
  FeedbackResult,
  ForgetInput,
  ForgetResult,
  GoodMemory,
  GoodMemoryConfig,
  RecallInput,
  RecallResult,
  RememberInput,
  RememberResult,
} from "./contracts";

type ScopeBoundRecord = {
  userId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  sessionId?: string;
};

interface RecallTouchSummary {
  reinforcedFeedbackCount: number;
  touchedFactCount: number;
}

const LOW_RISK_RECALL_TOUCH_WINDOW_MS = 5 * 60 * 1000;

const FORGETTABLE_COLLECTIONS = [
  "facts",
  "feedback",
  "profiles",
  "preferences",
  "references",
  "episodes",
  SESSION_ARCHIVES_COLLECTION,
  EVIDENCE_COLLECTION,
  EXPERIENCES_COLLECTION,
  LEARNING_PROPOSALS_COLLECTION,
  PROMOTION_RECORDS_COLLECTION,
] as const;

function recordMatchesScope(record: ScopeBoundRecord, scope: ForgetInput["scope"]): boolean {
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

function isPureUserScope(scope: ForgetInput["scope"]): boolean {
  return (
    scope.tenantId === undefined &&
    scope.workspaceId === undefined &&
    scope.agentId === undefined &&
    scope.sessionId === undefined
  );
}

async function deleteVectorForCollection(
  repositories: MemoryRepositories,
  collection: string,
  id: string,
): Promise<void> {
  if (!repositories.vectorIndex) {
    return;
  }

  if (collection === "facts") {
    await repositories.vectorIndex.deleteFactEmbedding(id);
    return;
  }
  if (collection === "references") {
    await repositories.vectorIndex.deleteReferenceEmbedding(id);
    return;
  }
  if (collection === "episodes") {
    await repositories.vectorIndex.deleteEpisodeEmbedding(id);
  }
}

function shouldApplyLowRiskTouch(
  previousTimestamp: string | undefined,
  nextTimestamp: string,
): boolean {
  if (!previousTimestamp) {
    return true;
  }

  const previousMs = new Date(previousTimestamp).getTime();
  const nextMs = new Date(nextTimestamp).getTime();

  if (!Number.isFinite(previousMs) || !Number.isFinite(nextMs)) {
    return true;
  }

  return nextMs - previousMs >= LOW_RISK_RECALL_TOUCH_WINDOW_MS;
}

async function applyRecallTouchHelpers(
  repositories: MemoryRepositories,
  result: RecallResult,
  timestamp: string,
): Promise<RecallTouchSummary> {
  const nextFacts = result.facts
    .filter(
      (fact) =>
        fact.lifecycle === "active" &&
        shouldApplyLowRiskTouch(fact.lastAccessedAt, timestamp),
    )
    .map((fact) => {
      const nextFact: FactMemory = {
        ...fact,
        accessCount: fact.accessCount + 1,
        lastAccessedAt: timestamp,
      };

      return nextFact;
    });
  const nextFeedback = result.feedback
    .filter(
      (feedback) =>
        feedback.lifecycle === "active" &&
        shouldApplyLowRiskTouch(feedback.lastUsedAt, timestamp),
    )
    .map((feedback) => {
      const reinforcedFeedback: FeedbackMemory = {
        ...feedback,
        lastUsedAt: timestamp,
      };

      return reinforcedFeedback;
    });

  await Promise.all([
    ...nextFacts.map((fact) => repositories.facts.add(fact)),
    ...nextFeedback.map((feedback) => repositories.feedback.upsert(feedback)),
  ]);

  const touchedFacts = new Map(nextFacts.map((fact) => [fact.id, fact] as const));
  const reinforcedFeedback = new Map(
    nextFeedback.map((feedback) => [feedback.id, feedback] as const),
  );

  if (touchedFacts.size > 0) {
    result.facts = result.facts.map((fact) => touchedFacts.get(fact.id) ?? fact);
  }
  if (reinforcedFeedback.size > 0) {
    result.feedback = result.feedback.map(
      (feedback) => reinforcedFeedback.get(feedback.id) ?? feedback,
    );
  }

  return {
    reinforcedFeedbackCount: nextFeedback.length,
    touchedFactCount: nextFacts.length,
  };
}

function toRememberObservationResult(
  result: RememberResult,
): RememberObservationResult {
  return {
    accepted: result.accepted,
    rejected: result.rejected,
    events: result.events.map((event) => ({
      memoryId: event.memoryId,
      evidenceIds: event.evidenceIds,
      reason: event.reason,
    })),
    modelInfluence:
      result.metadata?.resolvedExtractionStrategy === "llm-assisted"
        ? "llm-assisted"
        : "rules-only",
  };
}

function toRecallObservationResult(
  result: RecallResult,
  touchSummary?: RecallTouchSummary,
): RecallObservationResult {
  return {
    preferences: result.preferences.map((record) => ({ id: record.id })),
    references: result.references.map((record) => ({ id: record.id })),
    facts: result.facts.map((record) => ({ id: record.id })),
    feedback: result.feedback.map((record) => ({ id: record.id })),
    archives: result.archives.map((record) => ({ id: record.id })),
    evidence: result.evidence.map((record) => ({ id: record.id })),
    episodes: result.episodes.map((record) => ({ id: record.id })),
    strategy: result.metadata.routingDecision.strategy,
    hitCount: result.metadata.hits.length,
    hits: result.metadata.hits.map((hit) => ({
      evidenceIds: hit.evidenceIds,
    })),
    verificationHints: result.metadata.verificationHints.map((hint) => ({
      memoryId: hint.memoryId,
      evidenceIds: hint.evidenceIds,
    })),
    latencyMs: result.metadata.latencyMs,
    tokenCount: result.metadata.tokenCount,
    touchedFactCount: touchSummary?.touchedFactCount ?? 0,
    reinforcedFeedbackCount: touchSummary?.reinforcedFeedbackCount ?? 0,
    policyApplied: result.metadata.policyApplied,
    modelInfluence:
      result.metadata.routingDecision.strategy === "llm-assisted"
        ? "llm-assisted"
        : "rules-only",
  };
}

function toFeedbackObservationResult(
  result: FeedbackResult,
): FeedbackObservationResult {
  return {
    accepted: result.accepted,
    outcome: result.outcome,
    kind: result.kind,
    memoryId: result.memoryId,
    modelInfluence:
      result.metadata?.analysisMode === "rules-only" ? "rules-only" : "none",
  };
}

class GoodMemoryImpl implements GoodMemory {
  private readonly documentStore;
  private readonly sessionStore;
  private readonly repositories;
  private readonly recallEngine;
  private readonly rememberEngine;
  private readonly reviewer;
  private readonly proposalGate;
  private readonly language;
  private readonly now: () => Date;

  constructor(private readonly config: GoodMemoryConfig) {
    if (config.storage.provider === "postgres" && !config.storage.url) {
      throw new Error(
        "Postgres storage provider requires storage.url to be configured.",
      );
    }

    const documentStore =
      config.adapters?.documentStore ??
      (config.storage.provider === "sqlite"
        ? createSQLiteDocumentStore(config.storage.url ?? ":memory:")
        : config.storage.provider === "postgres"
          ? createPostgresDocumentStore({
              url: config.storage.url!,
            })
          : createInMemoryDocumentStore());
    const sessionStore =
      config.adapters?.sessionStore ??
      (config.storage.provider === "sqlite"
        ? createSQLiteSessionStore(config.storage.url ?? ":memory:")
        : config.storage.provider === "postgres"
          ? createPostgresSessionStore({
              url: config.storage.url!,
            })
          : createInMemorySessionStore());
    const vectorStore =
      config.adapters?.vectorStore ??
      (config.storage.provider === "postgres"
        ? createPostgresVectorStore({
            url: config.storage.url!,
          })
        : createInMemoryVectorStore());
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
      vectorStore,
    });
    const language = createLanguageService(config.language);

    this.documentStore = documentStore;
    this.sessionStore = sessionStore;
    this.repositories = repositories;
    this.language = language;
    this.now = config.testing?.now ?? (() => new Date());
    this.recallEngine = createRecallEngine({
      repositories,
      runtime: sessionStore,
      vectorIndex: repositories.vectorIndex,
      embedding: config.adapters?.embeddingAdapter,
      now: config.testing?.now ? () => config.testing!.now!().getTime() : undefined,
      referenceTime: config.testing?.now
        ? () => config.testing!.now!().toISOString()
        : undefined,
      language,
      policy: config.policy,
    });
    this.rememberEngine = createRememberEngine({
      repositories,
      vectorIndex: repositories.vectorIndex,
      assistedExtractor: config.adapters?.assistedExtractor,
      documentStore,
      embedding: config.adapters?.embeddingAdapter,
      extractor:
        config.testing?.extractor ??
        createDeterministicMemoryExtractor({
          service: language,
        }),
      language,
      policy: config.policy,
    });
    this.reviewer = createRulesOnlyReviewer({
      repositories,
    });
    this.proposalGate = createProposalGateProcessor({
      repositories,
    });
  }

  async recall(input: RecallInput): Promise<RecallResult> {
    const result = await this.recallEngine.recall(input);
    const timestamp = this.now().toISOString();
    const traceId = crypto.randomUUID();
    const touchSummary = await applyRecallTouchHelpers(
      this.repositories,
      result,
      timestamp,
    );

    await this.persistExperienceRecords(
      buildRecallExperienceRecords({
        scope: input.scope,
        result: toRecallObservationResult(result, touchSummary),
        traceId,
        createdAt: timestamp,
        createId: () => crypto.randomUUID(),
      }),
    );
    await this.runRulesOnlyReview(input.scope);

    return result;
  }

  async buildContext(input: BuildContextInput): Promise<BuildContextResult> {
    const output = input.output ?? "json";
    const rendered = renderMemoryPacket(input.recall.packet, output, input.maxTokens);

    return {
      output,
      content: rendered.content,
      estimatedTokens: rendered.estimatedTokens,
      omittedSections: rendered.omittedSections,
    };
  }

  async remember(input: RememberInput): Promise<RememberResult> {
    const result = await this.rememberEngine.remember(input);
    const timestamp = new Date().toISOString();
    const traceId = crypto.randomUUID();

    await this.persistExperienceRecords([
      buildRememberExperienceRecord({
        scope: input.scope,
        result: toRememberObservationResult(result),
        traceId,
        createdAt: timestamp,
        createId: () => crypto.randomUUID(),
      }),
    ]);
    await this.runRulesOnlyReview(input.scope);

    return result;
  }

  async forget(input: ForgetInput): Promise<ForgetResult> {
    if (!input.memoryId) {
      return {
        forgotten: false,
      };
    }

    for (const collection of FORGETTABLE_COLLECTIONS) {
      const existing = await this.documentStore.get(collection, input.memoryId);

      if (existing && recordMatchesScope(existing as ScopeBoundRecord, input.scope)) {
        await deleteVectorForCollection(this.repositories, collection, input.memoryId);
        await this.documentStore.delete(collection, input.memoryId);
        return {
          forgotten: true,
        };
      }
    }

    return {
      forgotten: false,
    };
  }

  async exportMemory(input: ExportMemoryInput): Promise<ExportMemoryResult> {
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
      this.repositories.profiles.get(input.scope.userId),
      this.repositories.preferences.listByScope(input.scope),
      this.repositories.references.listByScope(input.scope),
      this.repositories.facts.listByScope(input.scope),
      this.repositories.feedback.listByScope(input.scope),
      this.repositories.episodes.listByScope(input.scope),
      this.repositories.archives.listByScope(input.scope),
      this.repositories.evidence.listByScope(input.scope),
      this.repositories.experiences.listByScope(input.scope),
      this.repositories.proposals.listByScope(input.scope),
      this.repositories.promotions.listByScope(input.scope),
      input.includeRuntime && input.scope.sessionId
        ? this.sessionStore.getWorkingMemory(input.scope)
        : Promise.resolve(null),
      input.includeRuntime && input.scope.sessionId
        ? this.sessionStore.getJournal(input.scope)
        : Promise.resolve(null),
      input.includeRuntime
        ? this.documentStore.query<ArtifactSpillRecord>(ARTIFACT_SPILL_COLLECTION)
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

    return {
      artifacts: buildMarkdownArtifacts({
        scope: input.scope,
        durable,
        runtime,
      }),
      scope: input.scope,
      exportedAt: new Date().toISOString(),
      durable,
      runtime,
    };
  }

  async deleteAllMemory(input: DeleteAllMemoryInput): Promise<DeleteAllMemoryResult> {
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
      this.repositories.profiles.get(input.scope.userId),
      this.repositories.preferences.listByScope(input.scope),
      this.repositories.references.listByScope(input.scope),
      this.repositories.facts.listByScope(input.scope),
      this.repositories.feedback.listByScope(input.scope),
      this.repositories.episodes.listByScope(input.scope),
      this.repositories.archives.listByScope(input.scope),
      this.repositories.evidence.listByScope(input.scope),
      this.repositories.experiences.listByScope(input.scope),
      this.repositories.proposals.listByScope(input.scope),
      this.repositories.promotions.listByScope(input.scope),
    ]);

    const preferences = allPreferences.filter((record) => recordMatchesScope(record, input.scope));
    const references = allReferences.filter((record) => recordMatchesScope(record, input.scope));
    const facts = allFacts.filter((record) => recordMatchesScope(record, input.scope));
    const feedback = allFeedback.filter((record) => recordMatchesScope(record, input.scope));
    const episodes = allEpisodes.filter((record) => recordMatchesScope(record, input.scope));
    const archives = allArchives.filter((record) => recordMatchesScope(record, input.scope));
    const evidence = allEvidence.filter((record) => recordMatchesScope(record, input.scope));
    const experiences = allExperiences.filter((record) => recordMatchesScope(record, input.scope));
    const proposals = allProposals.filter((record) => recordMatchesScope(record, input.scope));
    const promotions = allPromotions.filter((record) =>
      recordMatchesScope(record, input.scope)
    );

    if (profile && isPureUserScope(input.scope)) {
      await this.documentStore.delete("profiles", input.scope.userId);
      deleted.profiles = 1;
    }

    for (const preference of preferences) {
      await this.documentStore.delete("preferences", preference.id);
      deleted.preferences += 1;
    }
    for (const reference of references) {
      await deleteVectorForCollection(this.repositories, "references", reference.id);
      await this.documentStore.delete("references", reference.id);
      deleted.references += 1;
    }
    for (const fact of facts) {
      await deleteVectorForCollection(this.repositories, "facts", fact.id);
      await this.documentStore.delete("facts", fact.id);
      deleted.facts += 1;
    }
    for (const feedbackItem of feedback) {
      await this.documentStore.delete("feedback", feedbackItem.id);
      deleted.feedback += 1;
    }
    for (const episode of episodes) {
      await deleteVectorForCollection(this.repositories, "episodes", episode.id);
      await this.documentStore.delete("episodes", episode.id);
      deleted.episodes += 1;
    }
    for (const archive of archives) {
      await this.documentStore.delete(SESSION_ARCHIVES_COLLECTION, archive.id);
      deleted.archives += 1;
    }
    for (const evidenceRecord of evidence) {
      await this.documentStore.delete(EVIDENCE_COLLECTION, evidenceRecord.id);
      deleted.evidence += 1;
    }
    for (const experience of experiences) {
      await this.documentStore.delete(EXPERIENCES_COLLECTION, experience.id);
      deleted.experiences += 1;
    }
    for (const proposal of proposals) {
      await this.documentStore.delete(LEARNING_PROPOSALS_COLLECTION, proposal.id);
      deleted.proposals += 1;
    }
    for (const promotion of promotions) {
      await this.documentStore.delete(PROMOTION_RECORDS_COLLECTION, promotion.id);
      deleted.promotions += 1;
    }

    if (input.includeRuntime !== false) {
      const allSpills = await this.documentStore.query<ArtifactSpillRecord>(
        ARTIFACT_SPILL_COLLECTION,
      );
      const spills = allSpills.filter((record) =>
        recordMatchesScope(record.scope, input.scope),
      );

      deleted.workingMemory = await this.sessionStore.deleteWorkingMemoryByScope(
        input.scope,
      );
      deleted.journal = await this.sessionStore.deleteJournalsByScope(input.scope);
      await this.sessionStore.deleteBuffersByScope(input.scope);
      for (const spill of spills) {
        await this.documentStore.delete(ARTIFACT_SPILL_COLLECTION, spill.id);
        deleted.artifactSpills += 1;
      }
    }

    return {
      scope: input.scope,
      deleted,
    };
  }

  async feedback(input: FeedbackInput): Promise<FeedbackResult> {
    const resolvedLanguage = this.language.resolveFromText({
      locale: input.locale,
      text: input.signal,
    });
    const existing = await this.repositories.feedback.listByScope(input.scope);
    const kind = this.language.deriveFeedbackKind(input.signal, resolvedLanguage);
    const normalizedRule = this.language.normalizeForEquality(
      input.signal,
      resolvedLanguage,
    );
    const duplicate = existing.find(
      (record: FeedbackMemory) =>
        record.lifecycle === "active" &&
        record.kind === kind &&
        this.language.normalizeForEquality(record.rule, resolvedLanguage) === normalizedRule,
    );

    if (!duplicate) {
      const superseded = existing.find(
        (record: FeedbackMemory) =>
          record.lifecycle === "active" &&
          record.appliesTo === "general_response" &&
          record.kind === kind,
      );
      const timestamp = new Date().toISOString();
      const nextRecord = createFeedbackMemory({
        id: crypto.randomUUID(),
        userId: input.scope.userId,
        tenantId: input.scope.tenantId,
        workspaceId: input.scope.workspaceId,
        agentId: input.scope.agentId,
        sessionId: input.scope.sessionId,
        rule: input.signal,
        kind,
        appliesTo: "general_response",
        source: createMemorySource({
          method: "explicit",
          extractedAt: timestamp,
          sessionId: input.scope.sessionId,
          locale: resolvedLanguage.locale,
        }),
        updatedAt: timestamp,
      });

      if (superseded) {
        await this.repositories.feedback.upsert(
          createFeedbackMemory({
            ...superseded,
            lifecycle: "superseded",
            supersededBy: nextRecord.id,
            updatedAt: timestamp,
          }),
        );

        await this.repositories.feedback.upsert(nextRecord);
        const result: FeedbackResult = {
          accepted: true,
          outcome: "superseded",
          memoryId: nextRecord.id,
          kind,
          metadata: {
            locale: resolvedLanguage.locale,
            localeSource: resolvedLanguage.localeSource,
            adapterId: resolvedLanguage.adapterId,
            analysisMode: resolvedLanguage.analysisMode,
          },
        };

        await this.persistExperienceRecords([
          buildFeedbackExperienceRecord({
            scope: input.scope,
            result: toFeedbackObservationResult(result),
            traceId: crypto.randomUUID(),
            createdAt: timestamp,
            createId: () => crypto.randomUUID(),
          }),
        ]);
        await this.runRulesOnlyReview(input.scope);

        return result;
      }

      await this.repositories.feedback.upsert(nextRecord);
      const result: FeedbackResult = {
        accepted: true,
        outcome: "written",
        memoryId: nextRecord.id,
        kind,
        metadata: {
          locale: resolvedLanguage.locale,
          localeSource: resolvedLanguage.localeSource,
          adapterId: resolvedLanguage.adapterId,
          analysisMode: resolvedLanguage.analysisMode,
        },
      };

      await this.persistExperienceRecords([
        buildFeedbackExperienceRecord({
          scope: input.scope,
          result: toFeedbackObservationResult(result),
          traceId: crypto.randomUUID(),
          createdAt: timestamp,
          createId: () => crypto.randomUUID(),
        }),
      ]);
      await this.runRulesOnlyReview(input.scope);

      return result;
    }

    const result: FeedbackResult = {
      accepted: true,
      outcome: "merged",
      memoryId: duplicate.id,
      kind,
      metadata: {
        locale: resolvedLanguage.locale,
        localeSource: resolvedLanguage.localeSource,
        adapterId: resolvedLanguage.adapterId,
        analysisMode: resolvedLanguage.analysisMode,
      },
    };

    await this.persistExperienceRecords([
      buildFeedbackExperienceRecord({
        scope: input.scope,
        result: toFeedbackObservationResult(result),
        traceId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        createId: () => crypto.randomUUID(),
      }),
    ]);
    await this.runRulesOnlyReview(input.scope);

    return result;
  }

  private async persistExperienceRecords(records: ExperienceRecord[]): Promise<void> {
    for (const record of records) {
      try {
        await this.repositories.experiences.add(record);
      } catch (error) {
        console.error("Failed to persist experience record", error);
      }
    }
  }

  private async runRulesOnlyReview(scope: RememberInput["scope"]): Promise<void> {
    try {
      const proposals = await this.reviewer.review({ scope });

      if (proposals.length === 0) {
        return;
      }

      await this.proposalGate.process({
        scope,
        proposals,
      });
    } catch (error) {
      console.error("Failed to run rules-only reviewer", error);
    }
  }
}

export function createGoodMemory(config: GoodMemoryConfig): GoodMemory {
  return new GoodMemoryImpl(config);
}
