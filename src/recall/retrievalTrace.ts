export type RecallRetrievalChannel = "dense" | "entity" | "lexical";
export type RecallRetrievalSourceCollection =
  | "episodes"
  | "facts"
  | "feedback"
  | "preferences"
  | "profiles"
  | "references"
  | "session_archives";

export interface RecallRetrievalChannelTrace {
  evidenceDocumentIds: string[];
  rank: number;
  rawScore: number;
  rrfScore: number;
}

export interface RecallFusionCandidateTrace {
  channels: Partial<Record<RecallRetrievalChannel, RecallRetrievalChannelTrace>>;
  evidenceTypes: RecallRetrievalChannel[];
  evidenceStrength: number;
  fusionScore: number;
  selected: boolean;
  sourceCollection: RecallRetrievalSourceCollection;
  sourceMemoryId: string;
}

export interface RecallFusionRunTrace {
  budget: number;
  candidateCount: number;
  candidates: RecallFusionCandidateTrace[];
  fallbackReason?: "projection_error" | "projection_unavailable";
  projectionCoverage?: "complete" | "partial";
  status: "applied" | "fallback";
}

export interface RecallRerankerScoreTrace {
  evidenceType: "reranker";
  memoryId: string;
  rankAfter: number;
  rankBefore: number;
  score: number;
}

export interface RecallRerankerTrace {
  adapter: "custom" | "provider";
  candidateLimit?: number;
  candidateCount: number;
  fallbackReason?:
    | "adapter_error"
    | "disabled"
    | "insufficient_candidates"
    | "provider_error";
  gateway?: string;
  latencyMs: number;
  model?: string;
  provider?: string;
  role: "reranker";
  scores: RecallRerankerScoreTrace[];
  status: "applied" | "fallback" | "skipped";
  strategy?: "listwise" | "pointwise";
}

export interface RecallRetrievalTrace {
  fusionRuns?: RecallFusionRunTrace[];
  reranker?: RecallRerankerTrace;
  schemaVersion: 1;
}
