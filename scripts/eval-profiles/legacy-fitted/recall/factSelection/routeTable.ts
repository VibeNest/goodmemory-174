import type { FactSelectionRoute } from "./contracts";
import {
  conversationEvidenceRoute,
  directFactualBridgeRoute,
  preferenceEvidenceRoute,
  sourceOrderedInformationExtractionRoute,
  sourceOrderedPersonalWorkChallengeRoute,
  sourceOrderedReasoningBridgeRoute,
  sourceOrderedSummaryRoute,
  sourceOrderedTemporalIntervalRoute,
  sourceOrderedTimelineRoute,
  temporalBridgeRoute,
} from "./routes/contextCandidates";
import { aggregateEvidenceRoute } from "./routes/aggregateEvidence";
import { contradictionPairRoute } from "./routes/contradictionPair";
import {
  answerOrConfirmationRoute,
  codingAgentFallbackRoute,
  intentSignalRoute,
  lexicalOrSubjectSignalRoute,
  researchRecommendationRoute,
} from "./routes/genericSignals";
import { temporalOrderRoute } from "./routes/temporalOrder";
import { updateEvidenceRoute } from "./routes/updateEvidence";

export const PRIMARY_FACT_SELECTION_ORDER = [
  "contradiction_evidence_pair",
  "source_ordered_information_extraction",
  "aggregate_evidence",
  "source_ordered_personal_work_challenge",
  "source_ordered_temporal_interval",
  "source_ordered_summary",
  "source_ordered_timeline",
  "source_ordered_reasoning_bridge",
  "conversation_evidence",
  "preference_evidence",
  "update_evidence",
  "temporal_bridge",
  "direct_factual_bridge",
  "temporal_order",
  "intent_signal",
  "lexical_or_subject_signal",
  "research_recommendation",
  "answer_or_confirmation",
  "coding_agent_fallback",
] as const;

export type PrimaryFactSelectionId =
  (typeof PRIMARY_FACT_SELECTION_ORDER)[number];

export const FACT_SELECTION_ROUTES_BY_ID: Record<
  PrimaryFactSelectionId,
  FactSelectionRoute
> = {
  aggregate_evidence: aggregateEvidenceRoute,
  answer_or_confirmation: answerOrConfirmationRoute,
  coding_agent_fallback: codingAgentFallbackRoute,
  contradiction_evidence_pair: contradictionPairRoute,
  conversation_evidence: conversationEvidenceRoute,
  intent_signal: intentSignalRoute,
  lexical_or_subject_signal: lexicalOrSubjectSignalRoute,
  research_recommendation: researchRecommendationRoute,
  direct_factual_bridge: directFactualBridgeRoute,
  preference_evidence: preferenceEvidenceRoute,
  source_ordered_information_extraction: sourceOrderedInformationExtractionRoute,
  source_ordered_personal_work_challenge: sourceOrderedPersonalWorkChallengeRoute,
  source_ordered_reasoning_bridge: sourceOrderedReasoningBridgeRoute,
  source_ordered_summary: sourceOrderedSummaryRoute,
  source_ordered_temporal_interval: sourceOrderedTemporalIntervalRoute,
  source_ordered_timeline: sourceOrderedTimelineRoute,
  temporal_bridge: temporalBridgeRoute,
  temporal_order: temporalOrderRoute,
  update_evidence: updateEvidenceRoute,
};

/** The primary chain as route objects, in priority order. */
export const FACT_SELECTION_ROUTE_TABLE: readonly FactSelectionRoute[] =
  PRIMARY_FACT_SELECTION_ORDER.map((id) => FACT_SELECTION_ROUTES_BY_ID[id]);
