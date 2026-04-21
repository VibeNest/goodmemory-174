import type {
  ArtifactSpillRecord,
  FeedbackMemory,
} from "../domain/records";
import { createFeedbackMemory } from "../domain/records";
import { createMemorySource } from "../domain/provenance";
import { EVIDENCE_COLLECTION } from "../evidence/contracts";
import type { BehavioralOutcomeObservationResult } from "../evolution/behavioralTelemetry";
import { createProceduralPatternCompiler } from "../evolution/compiler";
import type { LearningProposal } from "../evolution/contracts";
import { createProposalGateProcessor } from "../evolution/gates";
import { createRulesOnlyReviewer } from "../evolution/reviewer";
import {
  EXPERIENCES_COLLECTION,
  LEARNING_PROPOSALS_COLLECTION,
  PROMOTION_RECORDS_COLLECTION,
  SESSION_ARCHIVES_COLLECTION,
} from "../evolution/contracts";
import { buildMarkdownArtifacts } from "../governance/markdownArtifacts";
import type { RetrievalStrategyRolloutConfig } from "../governance/retrievalInternalRollout";
import { createLanguageService } from "../language";
import {
  createDreamMaintenanceGate,
  createDreamMaintenanceOrchestrator,
} from "../maintenance/dream";
import { createMaintenanceRunner } from "../maintenance/runner";
import { ARTIFACT_SPILL_COLLECTION } from "../runtime/spillover";
import type { RecallRouterAssistant } from "../recall/assistant";
import { renderMemoryPacket } from "../recall/contextBuilder";
import { createRecallEngine } from "../recall/engine";
import { createDeterministicMemoryExtractor } from "../remember/deterministicExtractor";
import { createRememberEngine } from "../remember/engine";
import { createInMemoryDocumentStore, createInMemorySessionStore, createInMemoryVectorStore } from "../storage/memory";
import { createAutoStorageAdapters } from "../storage/auto";
import {
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "../storage/postgres";
import { createMemoryRepositories } from "../storage/repositories";
import type {
  GovernanceRepositoryPort,
  GovernanceVectorPort,
} from "../storage/ports";
import {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createSQLiteVectorStore,
} from "../storage/sqlite";
import {
  createProviderEmbeddingAdapter,
  createProviderMemoryExtractor,
} from "../provider/layer";
import {
  attachGoodMemoryEvalSupport,
  type GoodMemoryEvalSupport,
} from "./evalSupport";
import { createEvolutionRuntime } from "./evolutionRuntime";
import { deleteVectorForCollection } from "./governance";
import { wrapInternalRetrievalRolloutMemory } from "./internalRetrievalRollout";
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
  RunMaintenanceInput,
  RunMaintenanceResult,
} from "./contracts";
import {
  resolveGoodMemoryRuntimeResolution,
  resolveAssistedExtractorModelConfigFromEnv,
} from "./runtimeResolution";

type ScopeBoundRecord = {
  userId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  sessionId?: string;
};

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

export interface InternalGoodMemoryOptions {
  assistedRecallRouter?: RecallRouterAssistant;
  assistedReviewer?: boolean;
  behavioralOutcomeRecorder?: boolean;
  retrievalStrategyRollout?: RetrievalStrategyRolloutConfig;
}

const ASSISTED_REVIEWER_PREFIX = "[assisted reviewer] ";

function prefixAssistedReviewerText(value: string): string {
  return value.startsWith(ASSISTED_REVIEWER_PREFIX)
    ? value
    : `${ASSISTED_REVIEWER_PREFIX}${value}`;
}

function annotateAssistedReviewerProposal(
  proposal: LearningProposal,
  timestamp: string,
): LearningProposal {
  return {
    ...proposal,
    summary: prefixAssistedReviewerText(proposal.summary),
    rationale: prefixAssistedReviewerText(proposal.rationale),
    modelInfluence: "llm-assisted",
    updatedAt: timestamp,
  };
}

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

class GoodMemoryImpl implements GoodMemory {
  private readonly documentStore;
  private readonly sessionStore;
  private readonly governanceRepositories: GovernanceRepositoryPort;
  private readonly governanceVectors: GovernanceVectorPort | null;
  private readonly recallEngine;
  private readonly rememberEngine;
  private readonly evolutionRuntime: ReturnType<typeof createEvolutionRuntime>;
  private readonly language;
  private readonly now: () => Date;

  constructor(
    private readonly config: GoodMemoryConfig,
    internal?: InternalGoodMemoryOptions,
  ) {
    const runtimeResolution = resolveGoodMemoryRuntimeResolution({
      config,
    });
    const storagePlan = runtimeResolution.storagePlan;
    const explicitStorage = storagePlan.mode === "explicit" ? storagePlan.storage : null;
    const autoStorageAdapters =
      storagePlan.mode === "auto"
        ? createAutoStorageAdapters({
            postgresUrl: storagePlan.postgresUrl,
            sqliteUrl: storagePlan.sqliteUrl,
          })
        : null;
    const embeddingAdapter =
      config.adapters?.embeddingAdapter ??
      (runtimeResolution.embeddingModelConfig
        ? createProviderEmbeddingAdapter({
            model: runtimeResolution.embeddingModelConfig,
          })
        : undefined);
    const assistedExtractor =
      config.adapters?.assistedExtractor ??
      (runtimeResolution.assistedExtractorModelConfig
        ? createProviderMemoryExtractor({
            model: runtimeResolution.assistedExtractorModelConfig,
          })
        : undefined);
    const documentStore =
      config.adapters?.documentStore ??
      (autoStorageAdapters
        ? autoStorageAdapters.documentStore
        : explicitStorage?.provider === "sqlite"
        ? createSQLiteDocumentStore(explicitStorage.url)
        : explicitStorage?.provider === "postgres"
          ? createPostgresDocumentStore({
              url: explicitStorage.url,
            })
          : createInMemoryDocumentStore());
    const sessionStore =
      config.adapters?.sessionStore ??
      (autoStorageAdapters
        ? autoStorageAdapters.sessionStore
        : explicitStorage?.provider === "sqlite"
        ? createSQLiteSessionStore(explicitStorage.url)
        : explicitStorage?.provider === "postgres"
          ? createPostgresSessionStore({
              url: explicitStorage.url,
            })
          : createInMemorySessionStore());
    const vectorStore =
      config.adapters?.vectorStore ??
      (autoStorageAdapters
        ? autoStorageAdapters.vectorStore
        : explicitStorage?.provider === "postgres"
        ? createPostgresVectorStore({
            url: explicitStorage.url,
          })
        : explicitStorage?.provider === "sqlite"
          ? createSQLiteVectorStore(explicitStorage.url)
          : createInMemoryVectorStore());
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
      vectorStore,
    });
    const language = createLanguageService(config.language);

    this.documentStore = documentStore;
    this.sessionStore = sessionStore;
    this.governanceRepositories = repositories;
    this.governanceVectors = repositories.vectorIndex;
    this.language = language;
    this.now = config.testing?.now ?? (() => new Date());
    this.recallEngine = createRecallEngine({
      assistedRouter: internal?.assistedRecallRouter,
      repositories,
      runtime: sessionStore,
      vectorIndex: repositories.vectorIndex,
      embedding: embeddingAdapter,
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
      assistedExtractor,
      documentStore,
      embedding: embeddingAdapter,
      extractor:
        config.testing?.extractor ??
        createDeterministicMemoryExtractor({
          service: language,
        }),
      language,
      policy: config.policy,
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      ...(internal?.assistedReviewer
        ? {
            assistedReview: {
              enabled: true,
              annotate: async (proposal: LearningProposal) =>
                annotateAssistedReviewerProposal(
                  proposal,
                  this.now().toISOString(),
                ),
            },
          }
        : {}),
    });
    const proposalGate = createProposalGateProcessor({
      repositories,
    });
    const proceduralPatternCompiler = createProceduralPatternCompiler({
      repositories,
      language,
      now: () => this.now().toISOString(),
    });
    const maintenanceRunner = createMaintenanceRunner({
      repositories,
      vectorIndex: repositories.vectorIndex,
      embedding: embeddingAdapter,
      language,
      now: () => this.now().toISOString(),
    });
    const dreamMaintenanceGate = createDreamMaintenanceGate();
    const dreamMaintenance = createDreamMaintenanceOrchestrator({
      gate: dreamMaintenanceGate,
      maintenanceRunner,
      reviewer,
      proposalGate,
      compiler: proceduralPatternCompiler,
    });
    this.evolutionRuntime = createEvolutionRuntime({
      governanceRepositories: repositories,
      reviewer,
      proposalGate,
      compiler: proceduralPatternCompiler,
      dreamMaintenance,
      now: () => this.now().toISOString(),
    });
  }

  async recall(input: RecallInput): Promise<RecallResult> {
    const result = await this.recallEngine.recall(input);
    await this.evolutionRuntime.handleRecall({
      scope: input.scope,
      result,
    });

    return result;
  }

  async diagnoseRecall(input: RecallInput): Promise<RecallResult> {
    return this.recallEngine.recall(input);
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
    await this.evolutionRuntime.handleRemember({
      scope: input.scope,
      result,
    });

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
        await deleteVectorForCollection(
          this.governanceVectors,
          collection,
          input.memoryId,
        );
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
      this.governanceRepositories.profiles.get(input.scope.userId),
      this.governanceRepositories.preferences.listByScope(input.scope),
      this.governanceRepositories.references.listByScope(input.scope),
      this.governanceRepositories.facts.listByScope(input.scope),
      this.governanceRepositories.feedback.listByScope(input.scope),
      this.governanceRepositories.episodes.listByScope(input.scope),
      this.governanceRepositories.archives.listByScope(input.scope),
      this.governanceRepositories.evidence.listByScope(input.scope),
      this.governanceRepositories.experiences.listByScope(input.scope),
      this.governanceRepositories.proposals.listByScope(input.scope),
      this.governanceRepositories.promotions.listByScope(input.scope),
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
      this.governanceRepositories.profiles.get(input.scope.userId),
      this.governanceRepositories.preferences.listByScope(input.scope),
      this.governanceRepositories.references.listByScope(input.scope),
      this.governanceRepositories.facts.listByScope(input.scope),
      this.governanceRepositories.feedback.listByScope(input.scope),
      this.governanceRepositories.episodes.listByScope(input.scope),
      this.governanceRepositories.archives.listByScope(input.scope),
      this.governanceRepositories.evidence.listByScope(input.scope),
      this.governanceRepositories.experiences.listByScope(input.scope),
      this.governanceRepositories.proposals.listByScope(input.scope),
      this.governanceRepositories.promotions.listByScope(input.scope),
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
      await deleteVectorForCollection(this.governanceVectors, "references", reference.id);
      await this.documentStore.delete("references", reference.id);
      deleted.references += 1;
    }
    for (const fact of facts) {
      await deleteVectorForCollection(this.governanceVectors, "facts", fact.id);
      await this.documentStore.delete("facts", fact.id);
      deleted.facts += 1;
    }
    for (const feedbackItem of feedback) {
      await this.documentStore.delete("feedback", feedbackItem.id);
      deleted.feedback += 1;
    }
    for (const episode of episodes) {
      await deleteVectorForCollection(this.governanceVectors, "episodes", episode.id);
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
    const existing = await this.governanceRepositories.feedback.listByScope(input.scope);
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
        await this.governanceRepositories.feedback.upsert(
          createFeedbackMemory({
            ...superseded,
            lifecycle: "superseded",
            supersededBy: nextRecord.id,
            updatedAt: timestamp,
          }),
        );

        await this.governanceRepositories.feedback.upsert(nextRecord);
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

        await this.evolutionRuntime.handleFeedback({
          scope: input.scope,
          result,
        });

        return result;
      }

      await this.governanceRepositories.feedback.upsert(nextRecord);
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

      await this.evolutionRuntime.handleFeedback({
        scope: input.scope,
        result,
      });

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

    await this.evolutionRuntime.handleFeedback({
      scope: input.scope,
      result,
    });

    return result;
  }

  async runMaintenance(input: RunMaintenanceInput): Promise<RunMaintenanceResult> {
    return this.evolutionRuntime.runMaintenance(input);
  }
}

export function createGoodMemory(config: GoodMemoryConfig): GoodMemory {
  return createInternalGoodMemory(config);
}

export function createInternalGoodMemory(
  config: GoodMemoryConfig,
  internal?: InternalGoodMemoryOptions,
): GoodMemory {
  const impl = new GoodMemoryImpl(config, internal);
  const memory = wrapInternalRetrievalRolloutMemory(
    impl,
    {
      assistedRecallRouterEnabled: Boolean(internal?.assistedRecallRouter),
      config,
      now: config.testing?.now,
      rollout: internal?.retrievalStrategyRollout,
    },
  );
  const implWithInternals = impl as unknown as {
    evolutionRuntime: {
      handleBehavioralOutcome: (input: {
        result: BehavioralOutcomeObservationResult;
        scope: ForgetInput["scope"];
      }) => Promise<void>;
    };
  };
  type BehavioralOutcomeSupportInput = Parameters<
    Exclude<GoodMemoryEvalSupport["recordBehavioralOutcome"], undefined>
  >[0];
  const support = {
    ...(internal?.assistedRecallRouter ? { assistedRecallRouter: true } : {}),
    ...(internal?.assistedReviewer ? { assistedReviewer: true } : {}),
    ...(internal?.behavioralOutcomeRecorder
      ? {
          recordBehavioralOutcome: (input: BehavioralOutcomeSupportInput) =>
            implWithInternals.evolutionRuntime.handleBehavioralOutcome({
              scope: input.scope,
              result: {
                cue: input.cue,
                evidenceExcerpt: input.evidenceExcerpt,
                failureClass: input.failureClass,
                firstAction: input.firstAction,
                modelInfluence: input.modelInfluence ?? "rules-only",
                outcome: input.outcome,
                saferAlternative: input.saferAlternative,
              },
            }),
        }
      : {}),
  };

  if (Object.keys(support).length === 0) {
    return memory;
  }

  return attachGoodMemoryEvalSupport(memory, support);
}
