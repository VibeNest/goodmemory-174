import type { FeedbackKind } from "../domain/records";
import type { MemoryScope } from "../domain/scope";

export type MemoryCandidateKindHint =
  | "profile"
  | "preference"
  | "reference"
  | "fact"
  | "feedback"
  | "episode"
  | "noise";

export type MemoryCandidateExplicitness = "explicit" | "inferred";

export interface MemoryCandidate {
  id: string;
  kindHint: MemoryCandidateKindHint;
  explicitness: MemoryCandidateExplicitness;
  content: string;
  sourceMessageIndex: number;
  sourceRole: string;
  metadata?: {
    category?: "project" | "technical" | "personal" | "relationship" | "event";
    feedbackKind?: FeedbackKind;
    appliesTo?: string;
    profileField?: "name";
    preferenceCategory?: string;
    preferenceValue?: string;
    referenceTitle?: string;
    referencePointer?: string;
    supersedesPointer?: string;
  };
}

export interface MemoryExtractionInput {
  scope: MemoryScope;
  messages: Array<{ role: string; content: string }>;
}

export interface MemoryExtractionResult {
  candidates: MemoryCandidate[];
  ignoredMessageCount: number;
}

export interface MemoryExtractor {
  extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult>;
}
