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
  LearningProposal,
  PromotionRecord,
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
  LEARNING_PROPOSALS_COLLECTION,
  PROMOTION_RECORDS_COLLECTION,
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
import type { MemoryExtractionStrategy } from "./remember/candidates";
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
  ExperienceMetrics,
  ExperienceModelInfluence,
  ExperienceTrigger,
  LearningProposal,
  LearningProposalStatus,
  LearningProposalType,
  PromotionDecision,
  PromotionGateOutcome,
  PromotionRecord,
  SessionArchive,
} from "./evolution/contracts";
export {
  createExperienceRecord,
  createLearningProposal,
  createPromotionRecord,
  createSessionArchive,
  EXPERIENCES_COLLECTION,
  LEARNING_PROPOSALS_COLLECTION,
  PROMOTION_RECORDS_COLLECTION,
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
  MemoryExtractionStrategy,
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
export type {
  PreCompactSalvageInput,
  RuntimeContextServiceConfig,
  RuntimeContextState,
  RuntimeRecallSnapshot,
  RuntimeSalvageHooks,
  SessionEndSalvageInput,
  SessionJournalPatch,
  SessionSummaryInput,
  WorkingMemoryPatch,
} from "./runtime/contextService";
export { createRuntimeContextService } from "./runtime/contextService";
export type { RuntimeSalvageConfig } from "./evolution/salvage";
export { createRuntimeSalvageHooks } from "./evolution/salvage";

export type {
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
  StorageConfig,
} from "./api/contracts";
export { createGoodMemory } from "./api/createGoodMemory";
