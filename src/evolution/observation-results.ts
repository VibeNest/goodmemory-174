import type { ExperienceModelInfluence } from "./contracts";

export interface ObservationLinkedRecord {
  id: string;
}

export interface RememberObservationEvent {
  evidenceIds?: string[];
  memoryId?: string;
  reason?: string;
}

export interface RememberObservationResult {
  accepted: number;
  events: RememberObservationEvent[];
  modelInfluence: ExperienceModelInfluence;
  rejected: number;
}

export interface RecallObservationHit {
  evidenceIds?: string[];
}

export interface RecallObservationVerificationHint {
  evidenceIds?: string[];
  memoryId: string;
}

export interface RecallObservationResult {
  archives: ObservationLinkedRecord[];
  episodes: ObservationLinkedRecord[];
  evidence: ObservationLinkedRecord[];
  facts: ObservationLinkedRecord[];
  feedback: ObservationLinkedRecord[];
  hitCount: number;
  hits: RecallObservationHit[];
  latencyMs: number;
  modelInfluence: ExperienceModelInfluence;
  policyApplied: string[];
  preferences: ObservationLinkedRecord[];
  references: ObservationLinkedRecord[];
  strategy: "auto" | "hybrid" | "llm-assisted" | "rules-only";
  tokenCount: number;
  verificationHints: RecallObservationVerificationHint[];
}

export interface FeedbackObservationResult {
  accepted: boolean;
  kind?: string;
  memoryId?: string;
  modelInfluence: ExperienceModelInfluence;
  outcome?: string;
}
