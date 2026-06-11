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
