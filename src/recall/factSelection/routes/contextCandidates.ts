import {
  ASSISTANT_EVIDENCE_RECALL_LIMIT,
  DIRECT_FACTUAL_RECALL_LIMIT,
  PREFERENCE_EVIDENCE_RECALL_LIMIT,
  TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT,
  diversifyRankedFactCandidatesBySession,
} from "../../selectors/selectionContext";
import type { FactSelectionRoute } from "../contracts";

export const sourceOrderedInformationExtractionRoute: FactSelectionRoute = {
  id: "source_ordered_information_extraction",
  isEligible({ ctx }) {
    return ctx.informationExtractionCandidates.length > 0;
  },
  select({ ctx }) {
    return { entries: ctx.informationExtractionCandidates };
  },
};

export const sourceOrderedPersonalWorkChallengeRoute: FactSelectionRoute = {
  id: "source_ordered_personal_work_challenge",
  isEligible({ ctx }) {
    return ctx.personalWorkChallengeCandidates.length > 0;
  },
  select({ ctx }) {
    return { entries: ctx.personalWorkChallengeCandidates };
  },
};

export const sourceOrderedTemporalIntervalRoute: FactSelectionRoute = {
  id: "source_ordered_temporal_interval",
  isEligible({ ctx }) {
    return ctx.sourceOrderedTemporalIntervalCandidates.length > 0;
  },
  select({ ctx }) {
    return { entries: ctx.sourceOrderedTemporalIntervalCandidates };
  },
};

export const sourceOrderedSummaryRoute: FactSelectionRoute = {
  id: "source_ordered_summary",
  isEligible({ ctx }) {
    return (
      ctx.sourceOrderedValueUpdateCandidates.length === 0 &&
      ctx.summaryCoverageCandidates.length > 0
    );
  },
  select({ ctx }) {
    return { entries: ctx.summaryCoverageCandidates };
  },
};

export const sourceOrderedTimelineRoute: FactSelectionRoute = {
  id: "source_ordered_timeline",
  isEligible({ ctx }) {
    return ctx.timelineIntegrationCandidates.length > 0;
  },
  select({ ctx }) {
    return { entries: ctx.timelineIntegrationCandidates };
  },
};

export const sourceOrderedReasoningBridgeRoute: FactSelectionRoute = {
  id: "source_ordered_reasoning_bridge",
  isEligible({ ctx }) {
    return ctx.reasoningBridgeCandidates.length > 0;
  },
  select({ ctx }) {
    return { entries: ctx.reasoningBridgeCandidates };
  },
};

export const conversationEvidenceRoute: FactSelectionRoute = {
  id: "conversation_evidence",
  isEligible({ ctx }) {
    return (
      !ctx.sourceOrderedNamedEntityEventPlanActive &&
      ctx.sourceOrderedValueUpdateCandidates.length === 0 &&
      ctx.conversationEvidenceCandidates.length > 0
    );
  },
  select({ ctx }) {
    return {
      entries: ctx.conversationEvidenceCandidates.slice(
        0,
        ASSISTANT_EVIDENCE_RECALL_LIMIT,
      ),
    };
  },
};

export const preferenceEvidenceRoute: FactSelectionRoute = {
  id: "preference_evidence",
  isEligible({ ctx }) {
    return (
      !ctx.sourceOrderedNamedEntityEventPlanActive &&
      ctx.preferenceEvidenceCandidates.length > 0
    );
  },
  select({ ctx }) {
    return {
      entries: ctx.preferenceEvidenceCandidates.slice(
        0,
        PREFERENCE_EVIDENCE_RECALL_LIMIT,
      ),
    };
  },
};

export const temporalBridgeRoute: FactSelectionRoute = {
  id: "temporal_bridge",
  isEligible({ ctx }) {
    return (
      !ctx.sourceOrderedNamedEntityEventPlanActive &&
      ctx.temporalBridgeEvidenceCandidates.length > 0
    );
  },
  select({ ctx }) {
    return {
      entries: diversifyRankedFactCandidatesBySession(
        ctx.temporalBridgeEvidenceCandidates,
        TEMPORAL_BRIDGE_EVIDENCE_RECALL_LIMIT,
      ),
    };
  },
};

export const directFactualBridgeRoute: FactSelectionRoute = {
  id: "direct_factual_bridge",
  isEligible({ ctx }) {
    return (
      !ctx.sourceOrderedNamedEntityEventPlanActive &&
      ctx.directFactualEvidenceBridgeCandidates.length > 0
    );
  },
  select({ ctx }) {
    return {
      entries: diversifyRankedFactCandidatesBySession(
        ctx.directFactualEvidenceBridgeCandidates,
        DIRECT_FACTUAL_RECALL_LIMIT,
      ),
    };
  },
};
