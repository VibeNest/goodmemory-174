import { rankFactCandidates } from "../../scoring";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasResearchRecommendationSignal,
  userGroundedEvidencePriority,
} from "../../selectors/conversationEvidence";
import {
  RESEARCH_RECOMMENDATION_LIMIT,
  diversifyRankedFactCandidatesBySession,
  hasConversationEvidenceTag,
} from "../../selectors/selectionContext";
import type { SelectionRunContext } from "../../selectionRunContext";
import type { FactSelectionRoute } from "../contracts";

function pickGenericCandidates(
  entries: RankedFactCandidate[],
  ctx: SelectionRunContext,
): RankedFactCandidate[] {
  if (!ctx.directFactualLookupQuery) {
    return entries.slice(0, ctx.limit);
  }

  const explicitEvidenceEntries = entries.filter(hasConversationEvidenceTag);
  const candidatePool =
    explicitEvidenceEntries.length > 0 ? explicitEvidenceEntries : entries;
  const orderedCandidatePool = ctx.userGroundedRecallQuery
    ? [...candidatePool].sort(
      (left, right) =>
        userGroundedEvidencePriority(right) -
        userGroundedEvidencePriority(left),
    )
    : candidatePool;

  return diversifyRankedFactCandidatesBySession(
    orderedCandidatePool,
    ctx.limit,
  );
}

export const intentSignalRoute: FactSelectionRoute = {
  id: "intent_signal",
  isEligible({ ctx }) {
    // The exclusivity check is unreachable today (the engine-level
    // exclusivity gate already skips the loop) but is kept verbatim from the
    // legacy switch; its removal belongs to an evidence-backed sunset pass.
    return !ctx.sourcePreferenceExclusiveQuery && ctx.withIntentSignal.length > 0;
  },
  select({ ctx }) {
    return { entries: pickGenericCandidates(ctx.withIntentSignal, ctx) };
  },
};

export const lexicalOrSubjectSignalRoute: FactSelectionRoute = {
  id: "lexical_or_subject_signal",
  isEligible({ ctx }) {
    return (
      !ctx.sourcePreferenceExclusiveQuery &&
      ctx.withLexicalOrSubjectSignal.length > 0
    );
  },
  select({ ctx }) {
    return {
      entries: pickGenericCandidates(ctx.withLexicalOrSubjectSignal, ctx),
    };
  },
};

export const researchRecommendationRoute: FactSelectionRoute = {
  id: "research_recommendation",
  isEligible({ ctx }) {
    return ctx.researchRecommendationQuery;
  },
  select({ runtime }) {
    return {
      entries: rankFactCandidates(
        runtime.compatible.filter(hasResearchRecommendationSignal),
        runtime.strategy,
      ).slice(0, RESEARCH_RECOMMENDATION_LIMIT),
    };
  },
};

export const answerOrConfirmationRoute: FactSelectionRoute = {
  id: "answer_or_confirmation",
  isEligible({ ctx }) {
    return ctx.answerCompositionQuery || ctx.factConfirmationQuery;
  },
  select({ ctx, runtime }) {
    return {
      entries: rankFactCandidates(
        runtime.compatible.filter(
          (item) =>
            item.fact.category === "project" ||
            item.fact.category === "technical",
        ),
        runtime.strategy,
      ).slice(0, ctx.limit),
    };
  },
};

export const codingAgentFallbackRoute: FactSelectionRoute = {
  id: "coding_agent_fallback",
  isEligible({ runtime }) {
    return runtime.retrievalProfile === "coding_agent";
  },
  select({ runtime }) {
    const fallback = rankFactCandidates(
      runtime.compatible.filter(
        (entry) =>
          entry.fact.category !== "personal" &&
          entry.fact.category !== "relationship" &&
          entry.fact.category !== "event",
      ),
      runtime.strategy,
    )[0];

    return { entries: fallback ? [fallback] : [] };
  },
};
