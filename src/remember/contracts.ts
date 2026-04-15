import type { EmbeddingAdapter } from "../embedding/contracts";
import type {
  MemoryEmbeddingWrite,
  PreparedMemoryEmbeddingRecord,
} from "../embedding/vectorWrites";
import type { LanguageService, ResolvedLanguageContext } from "../language";
import type { GoodMemoryPolicyHooks, PolicyContext } from "../policy/hooks";
import type { DocumentStore } from "../storage/contracts";
import type {
  RememberRepositoryPort,
  RememberVectorPort,
} from "../storage/ports";
import type {
  MemoryCandidate,
  MemoryCandidateKindHint,
  MemoryExtractionInput,
  MemoryExtractionStrategy,
  MemoryExtractor,
} from "./candidates";
import type { MemorySourceMethod } from "../domain/provenance";

export type ScopedIdentity = {
  userId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  sessionId?: string;
};

export interface ClassifiedCandidate extends MemoryCandidate {
  memoryType: Exclude<MemoryCandidateKindHint, "episode" | "noise"> | "reject";
  decision: "write" | "reject";
  score: number;
  reason?: string;
}

export interface RememberEvent {
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
  extractionSources?: MemoryExtractionStrategy[];
  evidenceIds?: string[];
}

export interface RememberResult {
  accepted: number;
  rejected: number;
  events: RememberEvent[];
  metadata?: {
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    adapterId: string;
    analysisMode: "rules-only";
    requestedExtractionStrategy: MemoryExtractionStrategy;
    resolvedExtractionStrategy: MemoryExtractionStrategy;
  };
}

export interface RememberEngineConfig {
  assistedExtractor?: MemoryExtractor;
  documentStore: DocumentStore;
  embedding?: EmbeddingAdapter;
  extractor?: MemoryExtractor;
  language?: LanguageService;
  repositories: RememberRepositoryPort & { vectorIndex?: RememberVectorPort | null };
  vectorIndex?: RememberVectorPort | null;
  shouldWrite?: (candidate: ClassifiedCandidate) => boolean;
  createId?: () => string;
  now?: () => string;
  policy?: Pick<
    GoodMemoryPolicyHooks,
    "shouldRemember" | "redact" | "resolveConflict"
  >;
}

export type RollbackAction = () => Promise<void>;

export interface PendingVectorDelete {
  id: string;
  memoryType: PreparedMemoryEmbeddingRecord["memoryType"];
  restoreRecord: PreparedMemoryEmbeddingRecord | null;
}

export interface RememberWriteState {
  accepted: number;
  rejected: number;
  events: RememberEvent[];
  pendingEmbeddingWrites: MemoryEmbeddingWrite[];
  pendingVectorDeletes: PendingVectorDelete[];
}

export interface RememberWriteContext {
  input: MemoryExtractionInput;
  resolvedLanguage: ResolvedLanguageContext;
  language: LanguageService;
  policyContext: PolicyContext;
  repositories: RememberRepositoryPort;
  vectorIndex: RememberVectorPort | null;
  createId: () => string;
  now: () => string;
  policy?: Pick<GoodMemoryPolicyHooks, "resolveConflict">;
  setDocumentWithRollback: <TDocument extends object>(
    collection: string,
    id: string,
    document: TDocument,
  ) => Promise<void>;
  deleteDocumentWithRollback: (
    collection: string,
    id: string,
  ) => Promise<void>;
}
