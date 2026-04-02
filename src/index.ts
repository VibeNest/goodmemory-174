import type { MemoryScope } from "./domain/scope";
import type {
  EpisodeMemory,
  FeedbackKind,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "./domain/records";
import { createFeedbackMemory } from "./domain/records";
import {
  createMemorySource,
} from "./domain/provenance";
import type { MemorySourceMethod } from "./domain/provenance";
import {
  renderMemoryPacket,
  type MemoryPacket,
} from "./recall/contextBuilder";
import { createRecallEngine } from "./recall/engine";
import { createRememberEngine } from "./remember/engine";
import { createDeterministicMemoryExtractor } from "./remember/deterministicExtractor";
import { createInMemoryDocumentStore, createInMemorySessionStore, createInMemoryVectorStore } from "./storage/memory";
import {
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "./storage/postgres";
import { createSQLiteDocumentStore, createSQLiteSessionStore } from "./storage/sqlite";
import { createMemoryRepositories } from "./storage/repositories";
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
  FactMemory,
  FeedbackKind,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  SessionMessage,
  SessionBuffer,
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
export type { MemoryRepositoriesConfig } from "./storage/repositories";
export { createMemoryRepositories } from "./storage/repositories";
export type { MemoryPacket } from "./recall/contextBuilder";
export {
  buildMemoryPacket,
  renderMemoryPacket,
} from "./recall/contextBuilder";
export type {
  RecallEngineConfig,
  RecallHit,
  RecallResult as InternalRecallResult,
} from "./recall/engine";
export { createRecallEngine } from "./recall/engine";
export type { VerificationHint } from "./verify/policy";
export { evaluateVerificationHints } from "./verify/policy";
export type {
  RecallRuntimeAvailability,
  RecallRoutingInput,
  RecallSource,
  RetrievalProfile,
  RoutingDecision,
} from "./recall/router";
export {
  planRecall,
  resolveRetrievalProfile,
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
  ClassifiedCandidate,
  RememberEvent as RememberPipelineEvent,
  RememberResult as RememberPipelineResult,
} from "./remember/engine";
export { createRememberEngine } from "./remember/engine";

export interface StorageConfig {
  provider: "memory" | "sqlite" | "postgres";
  url?: string;
}

export interface GoodMemoryConfig {
  storage: StorageConfig;
  adapters?: {
    documentStore?: DocumentStore;
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
}

export interface RecallResult {
  profile: UserProfile | null;
  preferences: PreferenceMemory[];
  references: ReferenceMemory[];
  facts: FactMemory[];
  feedback: FeedbackMemory[];
  episodes: EpisodeMemory[];
  workingMemory: WorkingMemorySnapshot | null;
  journal: SessionJournal | null;
  packet: MemoryPacket;
  metadata: {
    routingDecision: import("./recall/router").RoutingDecision;
    tokenCount: number;
    latencyMs: number;
    hits: import("./recall/engine").RecallHit[];
    verificationHints: import("./verify/policy").VerificationHint[];
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
}

export interface RememberInput {
  scope: MemoryScope;
  messages: Array<{ role: string; content: string }>;
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
  }>;
}

export interface ForgetInput {
  scope: MemoryScope;
  memoryId?: string;
}

export interface ForgetResult {
  forgotten: boolean;
}

export interface FeedbackInput {
  scope: MemoryScope;
  signal: string;
}

export interface FeedbackResult {
  accepted: boolean;
  outcome?: "written" | "merged" | "superseded";
  memoryId?: string;
  kind?: FeedbackKind;
}

export interface GoodMemory {
  recall(input: RecallInput): Promise<RecallResult>;
  buildContext(input: BuildContextInput): Promise<BuildContextResult>;
  remember(input: RememberInput): Promise<RememberResult>;
  forget(input: ForgetInput): Promise<ForgetResult>;
  feedback(input: FeedbackInput): Promise<FeedbackResult>;
}

function normalizeFeedbackRule(signal: string): string {
  return signal
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveFeedbackKind(signal: string): FeedbackKind {
  const normalized = signal.toLowerCase();

  if (
    normalized.includes("worked well") ||
    normalized.includes("keep using") ||
    normalized.includes("effective") ||
    normalized.includes("successful")
  ) {
    return "validated_pattern";
  }

  if (normalized.includes("don't") || normalized.includes("do not")) {
    return "dont";
  }

  if (normalized.includes("prefer")) {
    return "prefer";
  }

  return "do";
}

function recordMatchesScope(record: Record<string, unknown>, scope: MemoryScope): boolean {
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

class GoodMemoryImpl implements GoodMemory {
  private readonly documentStore;
  private readonly repositories;
  private readonly recallEngine;
  private readonly rememberEngine;

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

    this.documentStore = documentStore;
    this.repositories = repositories;
    this.recallEngine = createRecallEngine({
      repositories,
      sessionStore,
      now: config.testing?.now ? () => config.testing!.now!().getTime() : undefined,
      referenceTime: config.testing?.now
        ? () => config.testing!.now!().toISOString()
        : undefined,
    });
    this.rememberEngine = createRememberEngine({
      repositories,
      documentStore,
      extractor:
        config.testing?.extractor ?? createDeterministicMemoryExtractor(),
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
      content: rendered.content
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

    const collections = [
      "facts",
      "feedback",
      "profiles",
      "preferences",
      "references",
      "episodes",
    ];

    for (const collection of collections) {
      const existing = await this.documentStore.get(collection, _input.memoryId);

      if (existing && recordMatchesScope(existing as Record<string, unknown>, _input.scope)) {
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

  async feedback(input: FeedbackInput): Promise<FeedbackResult> {
    const existing = await this.repositories.feedback.listByScope(input.scope);
    const kind = deriveFeedbackKind(input.signal);
    const normalizedRule = normalizeFeedbackRule(input.signal);
    const duplicate = existing.find(
      (record: FeedbackMemory) =>
        record.lifecycle === "active" &&
        record.kind === kind &&
        normalizeFeedbackRule(record.rule) === normalizedRule,
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
        };
      }

      await this.repositories.feedback.upsert(nextRecord);
      return {
        accepted: true,
        outcome: "written",
        memoryId: nextRecord.id,
        kind,
      };
    }

    return {
      accepted: true,
      outcome: "merged",
      memoryId: duplicate.id,
      kind,
    };
  }
}

export function createGoodMemory(config: GoodMemoryConfig): GoodMemory {
  return new GoodMemoryImpl(config);
}
