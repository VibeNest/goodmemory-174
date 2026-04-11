import type { MemoryScope } from "./domain/scope";
import type {
  ArtifactSpillRecord,
  EpisodeMemory,
  FactKind,
  FeedbackKind,
  FactMemory,
  FeedbackMemory,
  MemoryScopeKind,
  PreferenceMemory,
  ReferenceKind,
  ReferenceMemory,
  SessionBuffer,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "./domain/records";
import type { EvidenceRecord } from "./evidence/contracts";
import type { EmbeddingAdapter } from "./embedding/contracts";
import type {
  ExperienceRecord,
  SessionArchive,
} from "./evolution/contracts";
import type {
  MarkdownArtifactBundle,
} from "./governance/markdownArtifacts";
import {
  createFeedbackMemory,
} from "./domain/records";
import {
  createMemorySource,
} from "./domain/provenance";
import { EVIDENCE_COLLECTION } from "./evidence/contracts";
import {
  EXPERIENCES_COLLECTION,
  SESSION_ARCHIVES_COLLECTION,
} from "./evolution/contracts";
import type { MemorySourceMethod } from "./domain/provenance";
import type {
  ConflictResolution,
  GoodMemoryPolicyHooks,
  PolicyContext,
  PolicyMemoryRecord,
} from "./policy/hooks";
import { ARTIFACT_SPILL_COLLECTION } from "./runtime/spillover";
import {
  renderMemoryPacket,
  type MemoryPacket,
} from "./recall/contextBuilder";
import type { RecallRouterStrategy } from "./recall/router";
import { createRecallEngine } from "./recall/engine";
import { createRememberEngine } from "./remember/engine";
import { createDeterministicMemoryExtractor } from "./remember/deterministicExtractor";
import {
  createLanguageService,
  type LanguageAdapter,
  type LanguageConfig,
  type LocaleDetector,
} from "./language";
import {
  buildMarkdownArtifacts,
} from "./governance/markdownArtifacts";
import { createInMemoryDocumentStore, createInMemorySessionStore, createInMemoryVectorStore } from "./storage/memory";
import {
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "./storage/postgres";
import { createSQLiteDocumentStore, createSQLiteSessionStore } from "./storage/sqlite";
import { createMemoryRepositories } from "./storage/repositories";
import type { MemoryRepositories } from "./storage/repositories";
import type {
  DocumentStore,
  SessionStore,
  VectorStore,
} from "./storage/contracts";

export type { MemoryScope } from "./domain/scope";
export {
  isSameScope,
  normalizeScope,
  scopeToKey,
} from "./domain/scope";
export type {
  MemoryKind,
  MemoryPlane,
} from "./domain/taxonomy";
export {
  getMemoryPlane,
  isMemoryKind,
  MEMORY_KIND_TO_PLANE,
} from "./domain/taxonomy";
export type {
  ArtifactSpillRecord,
  EpisodeMemory,
  FactKind,
  FactMemory,
  FeedbackKind,
  FeedbackMemory,
  MemoryScopeKind,
  PreferenceMemory,
  ReferenceKind,
  ReferenceMemory,
  SessionMessage,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "./domain/records";
export {
  createEpisodeMemory,
  createFactMemory,
  createFeedbackMemory,
  createPreferenceMemory,
  createReferenceMemory,
  createSessionBuffer,
  createSessionJournal,
  createUserProfile,
  createWorkingMemorySnapshot,
} from "./domain/records";
export type {
  EvidenceKind,
  EvidenceRecord,
} from "./evidence/contracts";
export {
  createEvidenceRecord,
  EVIDENCE_COLLECTION,
} from "./evidence/contracts";
export type { EmbeddingAdapter } from "./embedding/contracts";
export type {
  ExperienceKind,
  ExperienceRecord,
  SessionArchive,
} from "./evolution/contracts";
export {
  createExperienceRecord,
  createSessionArchive,
  EXPERIENCES_COLLECTION,
  SESSION_ARCHIVES_COLLECTION,
} from "./evolution/contracts";
export type {
  MemoryLifecycleState,
  MemorySource,
  MemorySourceMethod,
} from "./domain/provenance";
export {
  createMemorySource,
  transitionLifecycle,
} from "./domain/provenance";
export type {
  DocumentStore,
  SessionStore,
  StorageDocument,
  StorageFilter,
  VectorRecord,
  VectorSearchInput,
  VectorSearchResult,
  VectorStore,
} from "./storage/contracts";
export {
  matchesFilter,
  shallowMergeDocument,
} from "./storage/contracts";
export {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "./storage/memory";
export {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
} from "./storage/sqlite";
export type { PostgresStorageConfig } from "./storage/postgres";
export {
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "./storage/postgres";
export type {
  MemoryRepositories,
  MemoryRepositoriesConfig,
} from "./storage/repositories";
export { createMemoryRepositories } from "./storage/repositories";
export type { MemoryPacket } from "./recall/contextBuilder";
export {
  buildMemoryPacket,
  renderMemoryPacket,
} from "./recall/contextBuilder";
export type {
  RecallCandidateTrace,
  RecallEngineConfig,
  RecallHit,
  RecallResult as InternalRecallResult,
} from "./recall/engine";
export { createRecallEngine } from "./recall/engine";
export type { VerificationHint } from "./verify/policy";
export { evaluateVerificationHints } from "./verify/policy";
export type {
  RecallRouterAvailability,
  RecallRouterStrategy,
  RecallSlot,
  RecallRuntimeAvailability,
  RecallRoutingInput,
  RecallSource,
  RetrievalProfile,
  RouterStrategyExplanation,
  RoutingDecision,
} from "./recall/router";
export {
  planRecall,
  resolveRetrievalProfile,
  resolveRouterStrategy,
} from "./recall/router";
export type {
  MemoryCandidate,
  MemoryCandidateExplicitness,
  MemoryCandidateKindHint,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractor,
} from "./remember/candidates";
export { createDeterministicMemoryExtractor } from "./remember/deterministicExtractor";
export type {
  LanguageAdapter,
  LanguageConfig,
  LocaleDetector,
  LocaleDetectorInput,
  LocaleResolutionSource,
  ResolvedLanguageContext,
} from "./language";
export type {
  ClassifiedCandidate,
  RememberEvent as RememberPipelineEvent,
  RememberResult as RememberPipelineResult,
} from "./remember/engine";
export { createRememberEngine } from "./remember/engine";
export type {
  ConflictResolution,
  GoodMemoryPolicyHooks,
  PolicyContext,
  PolicyMemoryRecord,
} from "./policy/hooks";
export {
  passesDefaultScopeGuard,
  toPolicyMemoryRecord,
} from "./policy/hooks";
export type {
  MarkdownArtifactBundle,
  MarkdownArtifactFile,
} from "./governance/markdownArtifacts";

export interface StorageConfig {
  provider: "memory" | "sqlite" | "postgres";
  url?: string;
}

export interface GoodMemoryConfig {
  storage: StorageConfig;
  policy?: GoodMemoryPolicyHooks;
  language?: LanguageConfig;
  adapters?: {
    documentStore?: DocumentStore;
    embeddingAdapter?: EmbeddingAdapter;
    sessionStore?: SessionStore;
    vectorStore?: VectorStore;
  };
  testing?: {
    extractor?: import("./remember/candidates").MemoryExtractor;
    now?: () => Date;
  };
}

export interface RecallInput {
  scope: MemoryScope;
  query: string;
  retrievalProfile?: "general_chat" | "coding_agent";
  strategy?: RecallRouterStrategy;
  ignoreMemory?: boolean;
  locale?: string;
}

export interface RecallResult {
  profile: UserProfile | null;
  preferences: PreferenceMemory[];
  references: ReferenceMemory[];
  facts: FactMemory[];
  feedback: FeedbackMemory[];
  archives: SessionArchive[];
  evidence: EvidenceRecord[];
  episodes: EpisodeMemory[];
  workingMemory: WorkingMemorySnapshot | null;
  journal: SessionJournal | null;
  packet: MemoryPacket;
  metadata: {
    routingDecision: import("./recall/router").RoutingDecision;
    tokenCount: number;
    latencyMs: number;
    hits: import("./recall/engine").RecallHit[];
    candidateTraces: import("./recall/engine").RecallCandidateTrace[];
    verificationHints: import("./verify/policy").VerificationHint[];
    policyApplied: string[];
    locale?: string;
    localeSource?: "explicit" | "detected" | "default";
    adapterId?: string;
    analysisMode?: "rules-only";
  };
}

export interface BuildContextInput {
  recall: RecallResult;
  output?: "json" | "markdown" | "system_prompt_fragment" | "developer_prompt_fragment";
  maxTokens?: number;
}

export interface BuildContextResult {
  output: "json" | "markdown" | "system_prompt_fragment" | "developer_prompt_fragment";
  content: string;
  estimatedTokens: number;
  omittedSections: string[];
}

export interface RememberInput {
  scope: MemoryScope;
  messages: Array<{ role: string; content: string }>;
  locale?: string;
}

export interface RememberResult {
  accepted: number;
  rejected: number;
  events: Array<{
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
    evidenceIds?: string[];
  }>;
  metadata?: {
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    adapterId: string;
    analysisMode: "rules-only";
  };
}

export interface ForgetInput {
  scope: MemoryScope;
  memoryId?: string;
}

export interface ForgetResult {
  forgotten: boolean;
}

export interface ExportMemoryInput {
  scope: MemoryScope;
  includeRuntime?: boolean;
}

export interface ExportMemoryResult {
  artifacts: MarkdownArtifactBundle;
  scope: MemoryScope;
  exportedAt: string;
  durable: {
    profile: UserProfile | null;
    preferences: PreferenceMemory[];
    references: ReferenceMemory[];
    facts: FactMemory[];
    feedback: FeedbackMemory[];
    episodes: EpisodeMemory[];
    archives: SessionArchive[];
    evidence: EvidenceRecord[];
    experiences: ExperienceRecord[];
  };
  runtime?: {
    workingMemory: WorkingMemorySnapshot | null;
    journal: SessionJournal | null;
    spills: ArtifactSpillRecord[];
  };
}

export interface DeleteAllMemoryInput {
  scope: MemoryScope;
  includeRuntime?: boolean;
}

export interface DeleteAllMemoryResult {
  scope: MemoryScope;
  deleted: {
    profiles: number;
    preferences: number;
    references: number;
    facts: number;
    feedback: number;
    episodes: number;
    archives: number;
    evidence: number;
    experiences: number;
    workingMemory: number;
    journal: number;
    artifactSpills: number;
  };
}

export interface FeedbackInput {
  scope: MemoryScope;
  signal: string;
  locale?: string;
}

export interface FeedbackResult {
  accepted: boolean;
  outcome?: "written" | "merged" | "superseded";
  memoryId?: string;
  kind?: FeedbackKind;
  metadata?: {
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    adapterId: string;
    analysisMode: "rules-only";
  };
}

export interface GoodMemory {
  recall(input: RecallInput): Promise<RecallResult>;
  buildContext(input: BuildContextInput): Promise<BuildContextResult>;
  remember(input: RememberInput): Promise<RememberResult>;
  forget(input: ForgetInput): Promise<ForgetResult>;
  exportMemory(input: ExportMemoryInput): Promise<ExportMemoryResult>;
  deleteAllMemory(input: DeleteAllMemoryInput): Promise<DeleteAllMemoryResult>;
  feedback(input: FeedbackInput): Promise<FeedbackResult>;
}

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
] as const;

function recordMatchesScope(record: ScopeBoundRecord, scope: MemoryScope): boolean {
  if (record.userId !== scope.userId) {
    return false;
  }

  const optionalKeys: Array<keyof MemoryScope> = [
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

function isPureUserScope(scope: MemoryScope): boolean {
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

class GoodMemoryImpl implements GoodMemory {
  private readonly documentStore;
  private readonly sessionStore;
  private readonly repositories;
  private readonly recallEngine;
  private readonly rememberEngine;
  private readonly language;

  constructor(private readonly config: GoodMemoryConfig) {
    if (config.storage.provider === "postgres" && !config.storage.url) {
      throw new Error(
        "Postgres storage provider requires storage.url to be configured.",
      );
    }

    const documentStore =
      config.adapters?.documentStore ??
      (config.storage.provider === "sqlite"
        ? createSQLiteDocumentStore(
            config.storage.url ?? ":memory:",
          )
        : config.storage.provider === "postgres"
          ? createPostgresDocumentStore({
              url: config.storage.url!,
            })
          : createInMemoryDocumentStore());
    const sessionStore =
      config.adapters?.sessionStore ??
      (config.storage.provider === "sqlite"
        ? createSQLiteSessionStore(
            config.storage.url ?? ":memory:",
          )
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
    this.recallEngine = createRecallEngine({
      repositories,
      sessionStore,
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
      documentStore,
      embedding: config.adapters?.embeddingAdapter,
      extractor:
        config.testing?.extractor ?? createDeterministicMemoryExtractor({
          service: language,
        }),
      language,
      policy: config.policy,
    });
  }

  async recall(input: RecallInput): Promise<RecallResult> {
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
    return this.rememberEngine.remember(input);
  }

  async forget(_input: ForgetInput): Promise<ForgetResult> {
    if (!_input.memoryId) {
      return {
        forgotten: false
      };
    }

    for (const collection of FORGETTABLE_COLLECTIONS) {
      const existing = await this.documentStore.get(collection, _input.memoryId);

      if (existing && recordMatchesScope(existing as ScopeBoundRecord, _input.scope)) {
        await deleteVectorForCollection(this.repositories, collection, _input.memoryId);
        await this.documentStore.delete(collection, _input.memoryId);
        return {
          forgotten: true
        };
      }
    }

    return {
      forgotten: false
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
    const deleted = {
      profiles: 0,
      preferences: 0,
      references: 0,
      facts: 0,
      feedback: 0,
      episodes: 0,
      archives: 0,
      evidence: 0,
      experiences: 0,
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
    ]);

    const preferences = allPreferences.filter((record) => recordMatchesScope(record, input.scope));
    const references = allReferences.filter((record) => recordMatchesScope(record, input.scope));
    const facts = allFacts.filter((record) => recordMatchesScope(record, input.scope));
    const feedback = allFeedback.filter((record) => recordMatchesScope(record, input.scope));
    const episodes = allEpisodes.filter((record) => recordMatchesScope(record, input.scope));
    const archives = allArchives.filter((record) => recordMatchesScope(record, input.scope));
    const evidence = allEvidence.filter((record) => recordMatchesScope(record, input.scope));
    const experiences = allExperiences.filter((record) => recordMatchesScope(record, input.scope));

    if (
      profile &&
      isPureUserScope(input.scope)
    ) {
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
        return {
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
      }

      await this.repositories.feedback.upsert(nextRecord);
      return {
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
    }

    return {
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
  }
}

export function createGoodMemory(config: GoodMemoryConfig): GoodMemory {
  return new GoodMemoryImpl(config);
}
