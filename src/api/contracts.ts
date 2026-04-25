import type { MemoryScope } from "../domain/scope";
import type {
  ArtifactSpillRecord,
  EpisodeMemory,
  FactMemory,
  FeedbackKind,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  SessionBuffer,
  SessionJournal,
  SessionMessage,
  UserProfile,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemorySourceMethod } from "../domain/provenance";
import type { EmbeddingAdapter } from "../embedding/contracts";
import type { EvidenceRecord } from "../evidence/contracts";
import type {
  ExperienceRecord,
  LearningProposal,
  LearningProposalStatus,
  LearningProposalType,
  PromotionDecision,
  PromotionRecord,
  SessionArchive,
} from "../evolution/contracts";
import type { MarkdownArtifactBundle } from "../governance/markdownArtifacts";
import type { LanguageConfig } from "../language";
import type {
  GoodMemoryObservabilityConfig,
  GoodMemoryScopeDigest,
} from "../observability/contracts";
import type { MaintenanceJobName, MaintenanceRunReport } from "../maintenance/runner";
import type { GoodMemoryPolicyHooks } from "../policy/hooks";
import type { MemoryPacket } from "../recall/contextBuilder";
import type {
  RecallCandidateTrace,
  RecallHit,
} from "../recall/engine";
import type { RecallAssistantInfluence } from "../recall/assistant";
import type {
  RecallRouterStrategy,
  RoutingDecision,
} from "../recall/router";
import type {
  MessageAnnotation,
  MemoryExtractionStrategy,
  MemoryExtractor,
} from "../remember/candidates";
import type { RememberConfig } from "../remember/profiles";
import type { RememberResult as RememberPipelineResult } from "../remember/contracts";
import type {
  RuntimeContextState,
  RuntimeRecallSnapshot,
  SessionJournalPatch,
  SessionSummaryInput,
  WorkingMemoryPatch,
} from "../runtime/contextService";
import type {
  DocumentStore,
  SessionStore,
  VectorStore,
} from "../storage/contracts";
import type { VerificationHint } from "../verify/policy";

export interface StorageConfig {
  provider?: "memory" | "sqlite" | "postgres";
  url?: string;
}

export type GoodMemoryEmbeddingProviderId = "openai";
export type GoodMemoryExtractionProviderId = "openai" | "anthropic";

export interface GoodMemoryEmbeddingProviderConfig {
  provider: GoodMemoryEmbeddingProviderId;
  model: string;
  apiKey: string;
  baseURL?: string;
}

export interface GoodMemoryExtractionProviderConfig {
  provider: GoodMemoryExtractionProviderId;
  model: string;
  apiKey: string;
  baseURL?: string;
}

export interface GoodMemoryProviderConfig {
  embedding?: GoodMemoryEmbeddingProviderConfig;
  extraction?: GoodMemoryExtractionProviderConfig;
}

export interface GoodMemoryConfig {
  storage?: StorageConfig;
  policy?: GoodMemoryPolicyHooks;
  language?: LanguageConfig;
  remember?: RememberConfig;
  observability?: GoodMemoryObservabilityConfig;
  providers?: GoodMemoryProviderConfig;
  adapters?: {
    assistedExtractor?: MemoryExtractor;
    documentStore?: DocumentStore;
    embeddingAdapter?: EmbeddingAdapter;
    sessionStore?: SessionStore;
    vectorStore?: VectorStore;
  };
  testing?: {
    extractor?: MemoryExtractor;
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
    assistantInfluence?: RecallAssistantInfluence;
    routingDecision: RoutingDecision;
    tokenCount: number;
    latencyMs: number;
    hits: RecallHit[];
    candidateTraces: RecallCandidateTrace[];
    verificationHints: VerificationHint[];
    policyApplied: string[];
    locale?: string;
    localeSource?: "explicit" | "detected" | "default";
    adapterId?: string;
    analysisMode?: "rules-only";
    traceId?: string;
    traceScopeDigest?: GoodMemoryScopeDigest;
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
  traceId?: string;
}

export interface RememberInput {
  scope: MemoryScope;
  messages: Array<{ role: string; content: string }>;
  annotations?: MessageAnnotation[];
  extractionStrategy?: MemoryExtractionStrategy;
  locale?: string;
}

export interface RememberResult {
  accepted: number;
  rejected: number;
  events: RememberPipelineResult["events"];
  metadata?: {
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    adapterId: string;
    analysisMode: "rules-only";
    requestedExtractionStrategy: MemoryExtractionStrategy;
    resolvedExtractionStrategy: MemoryExtractionStrategy;
    traceId?: string;
  };
}

export type RevisableMemoryType =
  | "preference"
  | "reference"
  | "fact"
  | "feedback";

export type ReviseMemoryReason =
  | "user_correction"
  | "manual_review"
  | "system_repair"
  | (string & {});

export type ReviseMemoryEvidenceSource =
  | "user_message"
  | "manual_review"
  | "system";

export interface ReviseMemoryInput {
  scope: MemoryScope;
  target: {
    memoryId: string;
  };
  revision: {
    content: string;
  };
  reason: ReviseMemoryReason;
  evidence?: {
    source: ReviseMemoryEvidenceSource;
    message?: string;
    excerpt?: string;
    sourceUri?: string;
    sourceMessageIds?: string[];
  };
  idempotencyKey: string;
  locale?: string;
}

export interface ReviseMemoryResult {
  accepted: boolean;
  outcome: "superseded" | "blocked" | "not_found" | "unsupported";
  memoryType?: RevisableMemoryType;
  previousMemoryId?: string;
  newMemoryId?: string;
  evidenceIds?: string[];
  supersedeLineage?: {
    supersedes: string;
    supersededBy: string;
  };
  policyApplied: string[];
  reason?: string;
  traceId?: string;
  warnings?: string[];
}

export interface ForgetInput {
  scope: MemoryScope;
  memoryId?: string;
}

export interface ForgetResult {
  forgotten: boolean;
  traceId?: string;
}

export interface ExportMemoryInput {
  scope: MemoryScope;
  includeRuntime?: boolean;
}

export interface ExportMemoryResult {
  artifacts: MarkdownArtifactBundle;
  scope: MemoryScope;
  exportedAt: string;
  traceId?: string;
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
    proposals: LearningProposal[];
    promotions: PromotionRecord[];
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
  traceId?: string;
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
    proposals: number;
    promotions: number;
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

export interface FeedbackProposalReceipt {
  proposalId: string;
  proposalType: LearningProposalType;
  status: LearningProposalStatus;
}

export interface FeedbackPromotionReceipt {
  decision: PromotionDecision;
  promotionId: string;
  proposalId: string;
}

export interface FeedbackResult {
  accepted: boolean;
  evidenceIds?: string[];
  outcome?: "written" | "merged" | "superseded";
  memoryId?: string;
  kind?: FeedbackKind;
  proposalReceipts?: FeedbackProposalReceipt[];
  promotionReceipts?: FeedbackPromotionReceipt[];
  metadata?: {
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    adapterId: string;
    analysisMode: "rules-only";
    traceId?: string;
  };
}

export interface RunMaintenanceInput {
  scope: MemoryScope;
  jobs?: MaintenanceJobName[];
  lastRunAt?: string;
  minHoursBetweenRuns?: number;
  minSessionCount?: number;
  sessionCountSinceLastRun?: number;
}

export interface RunMaintenanceResult {
  compiledCount: number;
  maintenance: MaintenanceRunReport | null;
  promotionDecisionCounts: Partial<Record<PromotionDecision, number>>;
  proposalCount: number;
  ran: boolean;
  reason: "completed" | "cooldown" | "scope_busy" | "threshold";
  traceId?: string;
}

export type MemoryWriteJobOperation = "remember";

export type MemoryWriteJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "canceled";

export type MemoryWriteJobErrorCode =
  | "idempotency_conflict"
  | "job_payload_unavailable"
  | "remember_failed"
  | "write_blocked"
  | (string & {});

export interface MemoryWriteJobLastError {
  code: MemoryWriteJobErrorCode;
  message: string;
}

export interface MemoryWriteJob {
  jobId: string;
  idempotencyKey: string;
  operation: MemoryWriteJobOperation;
  status: MemoryWriteJobStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: MemoryWriteJobLastError;
  linkedTraceIds: string[];
  linkedMemoryIds: string[];
  linkedEvidenceIds: string[];
}

export type MemoryWriteJobReason =
  | "post_response_memory_write"
  | "manual_enqueue"
  | (string & {});

export interface EnqueueRememberJobInput extends RememberInput {
  idempotencyKey: string;
  reason?: MemoryWriteJobReason;
}

export interface GoodMemoryJobsLookupInput {
  jobId: string;
}

export interface GoodMemoryJobsDrainInput {
  maxJobs?: number;
}

export interface GoodMemoryJobsDrainResult {
  processed: number;
  jobs: MemoryWriteJob[];
}

export interface GoodMemoryJobsFacade {
  enqueueRemember(input: EnqueueRememberJobInput): Promise<MemoryWriteJob>;
  getJob(input: GoodMemoryJobsLookupInput): Promise<MemoryWriteJob | null>;
  retryJob(input: GoodMemoryJobsLookupInput): Promise<MemoryWriteJob | null>;
  drain(input?: GoodMemoryJobsDrainInput): Promise<GoodMemoryJobsDrainResult>;
}

export interface GoodMemoryRuntimeStartSessionInput {
  scope: MemoryScope;
}

export interface GoodMemoryRuntimeStateResult {
  state: RuntimeContextState;
  traceId?: string;
}

export interface GoodMemoryRuntimeAppendMessageInput {
  scope: MemoryScope;
  message: SessionMessage;
}

export interface GoodMemoryRuntimeBufferResult {
  buffer: SessionBuffer;
}

export interface GoodMemoryRuntimeSetSessionSummaryInput extends SessionSummaryInput {
  scope: MemoryScope;
}

export interface GoodMemoryRuntimeUpdateWorkingMemoryInput {
  scope: MemoryScope;
  patch: WorkingMemoryPatch;
}

export interface GoodMemoryRuntimeWorkingMemoryResult {
  workingMemory: WorkingMemorySnapshot;
}

export interface GoodMemoryRuntimeUpdateSessionJournalInput {
  scope: MemoryScope;
  patch: SessionJournalPatch;
}

export interface GoodMemoryRuntimeSessionJournalResult {
  journal: SessionJournal;
}

export interface GoodMemoryRuntimeGetRecallSnapshotInput {
  scope: MemoryScope;
  retrievalProfile?: "general_chat" | "coding_agent";
}

export interface GoodMemoryRuntimeRecallSnapshotResult {
  snapshot: RuntimeRecallSnapshot;
}

export interface GoodMemoryRuntimeSummaryOnlyArchiveOptions {
  mode: "summary_only";
  includeNormalizedTranscript?: false;
}

export interface GoodMemoryRuntimeEndSessionInput {
  scope: MemoryScope;
  archive?: "off" | GoodMemoryRuntimeSummaryOnlyArchiveOptions;
}

export interface GoodMemoryRuntimeFacade {
  startSession(input: GoodMemoryRuntimeStartSessionInput): Promise<GoodMemoryRuntimeStateResult>;
  getState(input: GoodMemoryRuntimeStartSessionInput): Promise<GoodMemoryRuntimeStateResult>;
  appendMessage(input: GoodMemoryRuntimeAppendMessageInput): Promise<GoodMemoryRuntimeBufferResult>;
  setSessionSummary(input: GoodMemoryRuntimeSetSessionSummaryInput): Promise<GoodMemoryRuntimeBufferResult>;
  updateWorkingMemory(input: GoodMemoryRuntimeUpdateWorkingMemoryInput): Promise<GoodMemoryRuntimeWorkingMemoryResult>;
  updateSessionJournal(input: GoodMemoryRuntimeUpdateSessionJournalInput): Promise<GoodMemoryRuntimeSessionJournalResult>;
  getRecallSnapshot(input: GoodMemoryRuntimeGetRecallSnapshotInput): Promise<GoodMemoryRuntimeRecallSnapshotResult>;
  endSession(input: GoodMemoryRuntimeEndSessionInput): Promise<GoodMemoryRuntimeStateResult>;
}

export interface GoodMemory {
  jobs: GoodMemoryJobsFacade;
  runtime: GoodMemoryRuntimeFacade;
  recall(input: RecallInput): Promise<RecallResult>;
  buildContext(input: BuildContextInput): Promise<BuildContextResult>;
  remember(input: RememberInput): Promise<RememberResult>;
  reviseMemory(input: ReviseMemoryInput): Promise<ReviseMemoryResult>;
  forget(input: ForgetInput): Promise<ForgetResult>;
  exportMemory(input: ExportMemoryInput): Promise<ExportMemoryResult>;
  deleteAllMemory(input: DeleteAllMemoryInput): Promise<DeleteAllMemoryResult>;
  feedback(input: FeedbackInput): Promise<FeedbackResult>;
  runMaintenance(input: RunMaintenanceInput): Promise<RunMaintenanceResult>;
}
