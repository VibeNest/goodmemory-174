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
  MarkdownArtifactBundle,
} from "./governance/markdownArtifacts";
import {
  createFeedbackMemory,
} from "./domain/records";
import {
  createMemorySource,
} from "./domain/provenance";
import { EVIDENCE_COLLECTION } from "./evidence/contracts";
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
} from "./storage/postgresPublic";
import {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createSQLiteVectorStore,
} from "./storage/sqlitePublic";
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
  MemoryLifecycleState,
  MemorySource,
  MemorySourceMethod,
} from "./domain/provenance";
export {
  createMemorySource,
  transitionLifecycle,
} from "./domain/provenance";
export type {
  ConditionalDocumentWriteBatch,
  DocumentStore,
  DocumentWriteOperation,
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
  createSQLiteVectorStore,
} from "./storage/sqlitePublic";
export type { PostgresStorageConfig } from "./storage/postgresPublic";
export {
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "./storage/postgresPublic";
export type { MemoryPacket } from "./recall/contextBuilder";
export {
  buildMemoryPacket,
  renderMemoryPacket,
} from "./recall/contextBuilder";
export type {
  RecallCandidateTrace,
  RecallHit,
} from "./recall/engine";
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
  MessageAnnotation,
  MemoryCandidate,
  MemoryCandidateAnnotationTrace,
  MemoryCandidateExplicitness,
  MemoryCandidateKindHint,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryExtractionStrategy,
  MemoryExtractor,
} from "./remember/candidates";
export { createDeterministicMemoryExtractor } from "./remember/deterministicExtractor";
export type {
  AssistantMemoryPolicy,
  NamedRememberProfileExtractor,
  RememberConfig,
  RememberPresetId,
  RememberProfile,
  RememberProfileExtractor,
  RememberProfileMatcher,
  RememberRule,
  RememberRuleMatchContext,
  RememberRuleMessageContext,
} from "./remember/profiles";
export { rememberRules } from "./remember/profiles";
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
  GoodMemoryObservabilityConfig,
  GoodMemoryScopeDigest,
  GoodMemoryTraceAttributeValue,
  GoodMemoryTraceLink,
  GoodMemoryTraceRedaction,
  GoodMemoryTraceSink,
  GoodMemoryTraceSpan,
  GoodMemoryTraceSpanName,
  GoodMemoryTraceSpanStatus,
} from "./observability/contracts";
export type {
  RuntimeArchiveStore,
  RuntimeArchiveStoreConfig,
  RuntimeContextService,
  RuntimeContextServiceConfig,
  RuntimeContextState,
  RuntimeEndSessionArchiveOptions,
  RuntimeEndSessionOptions,
  RuntimeRecallSnapshot,
  SessionJournalPatch,
  SessionSummaryInput,
  WorkingMemoryPatch,
} from "./runtime/public";
export {
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "./runtime/public";

export type {
  BuildContextInput,
  BuildContextResult,
  DeleteAllMemoryInput,
  DeleteAllMemoryResult,
  ExportMemoryInput,
  ExportMemoryResult,
  FeedbackInput,
  FeedbackPromotionReceipt,
  FeedbackProposalReceipt,
  FeedbackResult,
  ForgetInput,
  ForgetResult,
  GoodMemory,
  GoodMemoryConfig,
  GoodMemoryEmbeddingProviderConfig,
  GoodMemoryEmbeddingProviderId,
  GoodMemoryExtractionProviderConfig,
  GoodMemoryExtractionProviderId,
  GoodMemoryJobsDrainInput,
  GoodMemoryJobsDrainResult,
  GoodMemoryJobsFacade,
  GoodMemoryJobsLookupInput,
  GoodMemoryProviderConfig,
  GoodMemoryRuntimeAppendMessageInput,
  GoodMemoryRuntimeBufferResult,
  GoodMemoryRuntimeEndSessionInput,
  GoodMemoryRuntimeFacade,
  GoodMemoryRuntimeGetRecallSnapshotInput,
  GoodMemoryRuntimeRecallSnapshotResult,
  GoodMemoryRuntimeSessionJournalResult,
  GoodMemoryRuntimeSetSessionSummaryInput,
  GoodMemoryRuntimeStartSessionInput,
  GoodMemoryRuntimeStateResult,
  GoodMemoryRuntimeSummaryOnlyArchiveOptions,
  GoodMemoryRuntimeUpdateSessionJournalInput,
  GoodMemoryRuntimeUpdateWorkingMemoryInput,
  GoodMemoryRuntimeWorkingMemoryResult,
  EnqueueRememberJobInput,
  MemoryWriteJob,
  MemoryWriteJobErrorCode,
  MemoryWriteJobLastError,
  MemoryWriteJobOperation,
  MemoryWriteJobReason,
  MemoryWriteJobStatus,
  RecallInput,
  RecallResult,
  RevisableMemoryType,
  ReviseMemoryEvidenceSource,
  ReviseMemoryInput,
  ReviseMemoryReason,
  ReviseMemoryResult,
  RememberInput,
  RememberResult,
  RunMaintenanceInput,
  RunMaintenanceResult,
  StorageConfig,
} from "./api/contracts";
export { createGoodMemory } from "./api/createGoodMemory";
export type {
  GoodMemoryRuntimeInfo,
  GoodMemoryStorageRuntimeInfo,
} from "./api/runtimeInfo";
export {
  inspectGoodMemoryRuntime,
  resolveGoodMemoryRuntimeInfo,
} from "./api/runtimeInfo";
