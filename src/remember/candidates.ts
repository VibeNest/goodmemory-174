import type {
  FactKind,
  FeedbackKind,
  MemoryScopeKind,
  ReferenceKind,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";

export type ProfileField =
  | "name"
  | "role"
  | "organization"
  | "location"
  | "timezone"
  | "languagePreference"
  | "currentProject";

export type MemoryCandidateKindHint =
  | "profile"
  | "preference"
  | "reference"
  | "fact"
  | "feedback"
  | "episode"
  | "noise";

export type MemoryCandidateExplicitness = "explicit" | "inferred";

export interface MemoryCandidateMetadata {
  category?: "project" | "technical" | "personal" | "relationship" | "event";
  factKind?: FactKind;
  scopeKind?: MemoryScopeKind;
  subject?: string;
  feedbackKind?: FeedbackKind;
  appliesTo?: string;
  profileField?: ProfileField;
  preferenceCategory?: string;
  preferenceValue?: string;
  referenceKind?: ReferenceKind;
  referenceTitle?: string;
  referencePointer?: string;
  supersedesPointer?: string;
}

export interface MemoryCandidate {
  id: string;
  kindHint: MemoryCandidateKindHint;
  explicitness: MemoryCandidateExplicitness;
  content: string;
  sourceMessageIndex: number;
  sourceRole: string;
  metadata?: MemoryCandidateMetadata;
}

export interface MemoryExtractionInput {
  scope: MemoryScope;
  messages: Array<{ role: string; content: string }>;
  locale?: string;
}

export interface MemoryExtractionResult {
  candidates: MemoryCandidate[];
  ignoredMessageCount: number;
}

export interface MemoryExtractor {
  extract(input: MemoryExtractionInput): Promise<MemoryExtractionResult>;
}
