import type { MemoryScope } from "../domain/scope";
import type {
  MemoryCandidate,
  MemoryCandidateAnnotationTrace,
  MemoryCandidateExplicitness,
  MemoryCandidateKindHint,
  MemoryCandidateMetadata,
  MemoryExtractionStrategy,
  MessageAnnotationRememberMode,
  ProfileField,
} from "../domain/memoryCandidate";

export type {
  MemoryCandidate,
  MemoryCandidateAnnotationTrace,
  MemoryCandidateExplicitness,
  MemoryCandidateKindHint,
  MemoryCandidateMetadata,
  MemoryExtractionStrategy,
  MessageAnnotationRememberMode,
  ProfileField,
};

export interface MessageAnnotation {
  messageIndex: number;
  remember?: MessageAnnotationRememberMode;
  kindHint?: Exclude<MemoryCandidateKindHint, "episode" | "noise">;
  metadataPatch?: MemoryCandidateMetadata;
  confirmed?: boolean;
  verified?: boolean;
  reason?: string;
}

export interface MemoryExtractionInput {
  scope: MemoryScope;
  messages: Array<{ role: string; content: string }>;
  annotations?: MessageAnnotation[];
  extractionStrategy?: MemoryExtractionStrategy;
  locale?: string;
}

export interface MemoryExtractionContext {
  knownUserName?: string;
}

export interface MemoryExtractionResult {
  candidates: MemoryCandidate[];
  ignoredMessageCount: number;
}

export interface MemoryExtractor {
  extract(
    input: MemoryExtractionInput,
    context?: MemoryExtractionContext,
  ): Promise<MemoryExtractionResult>;
}
