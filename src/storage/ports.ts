import type {
  EpisodeMemory,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  SessionJournal,
  UserProfile,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import type { EvidenceRecord } from "../evidence/contracts";
import type {
  ExperienceRecord,
  LearningProposal,
  PromotionRecord,
  SessionArchive,
} from "../evolution/contracts";
import type { VectorRecord } from "./contracts";

interface ProfileRepositoryPort {
  profiles: {
    get(userId: string): Promise<UserProfile | null>;
    upsert(profile: UserProfile): Promise<void>;
  };
}

interface PreferenceRepositoryPort {
  preferences: {
    listByScope(scope: MemoryScope): Promise<PreferenceMemory[]>;
    upsert(preference: PreferenceMemory): Promise<void>;
  };
}

interface ReferenceRepositoryPort {
  references: {
    add(reference: ReferenceMemory): Promise<void>;
    listByScope(scope: MemoryScope): Promise<ReferenceMemory[]>;
  };
}

interface FactRepositoryPort {
  facts: {
    add(fact: FactMemory): Promise<void>;
    listByScope(scope: MemoryScope): Promise<FactMemory[]>;
  };
}

interface FeedbackRepositoryPort {
  feedback: {
    listByScope(scope: MemoryScope): Promise<FeedbackMemory[]>;
    upsert(feedback: FeedbackMemory): Promise<void>;
  };
}

interface EpisodeRepositoryPort {
  episodes: {
    add(episode: EpisodeMemory): Promise<void>;
    listByScope(scope: MemoryScope): Promise<EpisodeMemory[]>;
  };
}

interface ArchiveRepositoryPort {
  archives: {
    add(archive: SessionArchive): Promise<void>;
    listByScope(scope: MemoryScope): Promise<SessionArchive[]>;
  };
}

interface EvidenceRepositoryPort {
  evidence: {
    add(evidence: EvidenceRecord): Promise<void>;
    listByScope(scope: MemoryScope): Promise<EvidenceRecord[]>;
  };
}

interface ExperienceRepositoryPort {
  experiences: {
    add(experience: ExperienceRecord): Promise<void>;
    listByScope(scope: MemoryScope): Promise<ExperienceRecord[]>;
  };
}

interface ProposalRepositoryPort {
  proposals: {
    add(proposal: LearningProposal): Promise<void>;
    delete(id: string): Promise<void>;
    get(id: string): Promise<LearningProposal | null>;
    listByScope(scope: MemoryScope): Promise<LearningProposal[]>;
  };
}

interface PromotionRepositoryPort {
  promotions: {
    add(promotion: PromotionRecord): Promise<void>;
    delete(id: string): Promise<void>;
    get(id: string): Promise<PromotionRecord | null>;
    listByScope(scope: MemoryScope): Promise<PromotionRecord[]>;
  };
}

export interface RecallRepositoryPort extends
  ProfileRepositoryPort,
  PreferenceRepositoryPort,
  ReferenceRepositoryPort,
  FactRepositoryPort,
  FeedbackRepositoryPort,
  ArchiveRepositoryPort,
  EvidenceRepositoryPort,
  EpisodeRepositoryPort {}

export interface RememberRepositoryPort extends
  ProfileRepositoryPort,
  PreferenceRepositoryPort,
  ReferenceRepositoryPort,
  FactRepositoryPort,
  FeedbackRepositoryPort,
  EpisodeRepositoryPort {}

export interface EvolutionRepositoryPort extends
  FactRepositoryPort,
  FeedbackRepositoryPort,
  ArchiveRepositoryPort,
  ExperienceRepositoryPort,
  ProposalRepositoryPort,
  PromotionRepositoryPort {}

export interface MaintenanceRepositoryPort extends
  FactRepositoryPort,
  ReferenceRepositoryPort,
  ArchiveRepositoryPort,
  EpisodeRepositoryPort,
  ExperienceRepositoryPort {}

export interface FactVectorSearchPort {
  searchFactEmbedding(
    queryEmbedding: number[],
    input: { topK: number; filter?: Record<string, unknown> },
  ): Promise<VectorSearchRecord[]>;
}

export interface ReferenceVectorSearchPort {
  searchReferenceEmbedding(
    queryEmbedding: number[],
    input: { topK: number; filter?: Record<string, unknown> },
  ): Promise<VectorSearchRecord[]>;
}

export interface EpisodeVectorSearchPort {
  searchEpisodeEmbedding(
    queryEmbedding: number[],
    input: { topK: number; filter?: Record<string, unknown> },
  ): Promise<VectorSearchRecord[]>;
}

interface FactVectorMutationPort {
  deleteFactEmbedding(id: string): Promise<void>;
  getFactEmbedding(id: string): Promise<VectorRecord | null>;
  upsertFactEmbedding(records: VectorMutationRecord[]): Promise<void>;
}

interface ReferenceVectorMutationPort {
  deleteReferenceEmbedding(id: string): Promise<void>;
  getReferenceEmbedding(id: string): Promise<VectorRecord | null>;
  upsertReferenceEmbedding(records: VectorMutationRecord[]): Promise<void>;
}

interface EpisodeVectorMutationPort {
  deleteEpisodeEmbedding(id: string): Promise<void>;
  getEpisodeEmbedding(id: string): Promise<VectorRecord | null>;
  upsertEpisodeEmbedding(records: VectorMutationRecord[]): Promise<void>;
}

export interface RecallVectorSearchPort extends
  FactVectorSearchPort,
  ReferenceVectorSearchPort,
  EpisodeVectorSearchPort {}

export interface RememberVectorPort extends
  FactVectorMutationPort,
  ReferenceVectorMutationPort,
  EpisodeVectorMutationPort {}

export interface MaintenanceVectorPort extends
  FactVectorMutationPort,
  ReferenceVectorMutationPort,
  EpisodeVectorMutationPort {}

export interface VectorMutationRecord {
  content: string;
  embedding: number[];
  id: string;
  metadata: Record<string, unknown>;
}

export interface VectorSearchRecord {
  content: string;
  embedding: number[];
  id: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface RecallRuntimePort {
  getJournal(scope: MemoryScope): Promise<SessionJournal | null>;
  getWorkingMemory(scope: MemoryScope): Promise<WorkingMemorySnapshot | null>;
}
