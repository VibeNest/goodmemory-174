import type { MemoryScope } from "../domain/scope";
import type {
  ArtifactSpillRecord,
  EpisodeMemory,
  FactMemory,
  FeedbackKind,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemorySourceMethod } from "../domain/provenance";
import type { EmbeddingAdapter } from "../embedding/contracts";
import type { EvidenceRecord } from "../evidence/contracts";
import type {
  ExperienceRecord,
  LearningProposal,
  PromotionDecision,
  PromotionRecord,
  SessionArchive,
} from "../evolution/contracts";
import type { MarkdownArtifactBundle } from "../governance/markdownArtifacts";
import type { LanguageConfig } from "../language";
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
  MemoryExtractionStrategy,
  MemoryExtractor,
} from "../remember/candidates";
import type { RememberResult as RememberPipelineResult } from "../remember/contracts";
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

export interface GoodMemoryConfig {
  storage?: StorageConfig;
  policy?: GoodMemoryPolicyHooks;
  language?: LanguageConfig;
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
}

export interface GoodMemory {
  recall(input: RecallInput): Promise<RecallResult>;
  buildContext(input: BuildContextInput): Promise<BuildContextResult>;
  remember(input: RememberInput): Promise<RememberResult>;
  forget(input: ForgetInput): Promise<ForgetResult>;
  exportMemory(input: ExportMemoryInput): Promise<ExportMemoryResult>;
  deleteAllMemory(input: DeleteAllMemoryInput): Promise<DeleteAllMemoryResult>;
  feedback(input: FeedbackInput): Promise<FeedbackResult>;
  runMaintenance(input: RunMaintenanceInput): Promise<RunMaintenanceResult>;
}
