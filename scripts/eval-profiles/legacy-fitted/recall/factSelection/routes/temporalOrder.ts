import { rankFactCandidates } from "../../scoring";
import { diversifyRankedFactCandidatesBySession, hasUserAnswerTag } from "../../selectors/selectionContext";
import { isSourceEnvelopeCandidate } from "../../selectors/sourceEnvelope";
import {
  SOURCE_ORDER_EVENT_RECALL_LIMIT,
  fillSourceOrderedTemporalCompanions,
  fillSourceOrderedTemporalGaps,
  fillSourceOrderedTemporalMilestones,
} from "../../selectors/sourceOrderTemporal";
import {
  compareTemporalFactChronology,
  hasTemporalEventOrderSignal,
  isSourceOrderedFact as isImportedSourceFact,
  temporalOrderEvidencePriority,
} from "../../selectors/temporal";
import type { FactSelectionRoute } from "../contracts";

export const temporalOrderRoute: FactSelectionRoute = {
  id: "temporal_order",
  isEligible({ ctx }) {
    return (
      ctx.temporalEventOrderQuery ||
      ctx.temporalMostRecentQuery ||
      ctx.temporalRelativeEventQuery ||
      ctx.broadAspectEventOrderCandidates.length > 0 ||
      ctx.sourceOrderedNamedEntityEventPlanActive
    );
  },
  select({ ctx, runtime }) {
    if (ctx.broadAspectEventOrderCandidates.length > 0) {
      return { entries: ctx.broadAspectEventOrderCandidates };
    }

    if (ctx.sourceOrderedNamedEntityEventPlanActive) {
      return { entries: ctx.sourceOrderedEventOrderCandidates };
    }

    const rankedTemporalCandidatePool = rankFactCandidates(
      runtime.compatible.filter((entry) =>
        hasTemporalEventOrderSignal(entry, runtime.query)
      ),
      runtime.strategy,
    ).sort(
      (left, right) =>
        temporalOrderEvidencePriority(right, runtime.query) -
        temporalOrderEvidencePriority(left, runtime.query),
    );
    const userAnsweredTemporalCandidates =
      rankedTemporalCandidatePool.filter(hasUserAnswerTag);
    const rankedTemporalCandidates =
      ctx.userBroughtUpEventOrderQuery &&
        userAnsweredTemporalCandidates.length > 0
        ? userAnsweredTemporalCandidates
        : rankedTemporalCandidatePool;
    const fallbackTemporalCandidates = diversifyRankedFactCandidatesBySession(
      rankedTemporalCandidates,
      runtime.compatible.some(isImportedSourceFact)
        ? SOURCE_ORDER_EVENT_RECALL_LIMIT
        : ctx.limit,
    );
    const temporalCandidates = ctx.sourceOrderedEventOrderCandidates.length > 0
      ? [
        ...ctx.sourceOrderedEventOrderCandidates,
        ...fallbackTemporalCandidates.filter(
          (entry) =>
            !ctx.sourceOrderedEventOrderCandidates.some(
              (candidate) => candidate.fact.id === entry.fact.id,
            ),
        ),
      ]
      : fallbackTemporalCandidates;
    const gapFilledTemporalCandidates = ctx.temporalEventOrderQuery &&
      temporalCandidates.some(isImportedSourceFact)
      ? fillSourceOrderedTemporalGaps({
        language: runtime.language,
        pool: rankedTemporalCandidates.filter(isImportedSourceFact),
        query: runtime.query,
        queryLocale: runtime.queryLocale,
        selected: temporalCandidates,
      })
      : temporalCandidates;
    const companionFilledTemporalCandidates = ctx.temporalEventOrderQuery &&
      gapFilledTemporalCandidates.some(isImportedSourceFact)
      ? fillSourceOrderedTemporalCompanions({
        pool: rankedTemporalCandidates.filter(isImportedSourceFact),
        query: runtime.query,
        selected: gapFilledTemporalCandidates,
      })
      : gapFilledTemporalCandidates;
    const milestoneFilledTemporalCandidates = ctx.temporalEventOrderQuery &&
      companionFilledTemporalCandidates.some(isImportedSourceFact)
      ? fillSourceOrderedTemporalMilestones({
        language: runtime.language,
        pool: rankedTemporalCandidates.filter(isImportedSourceFact),
        query: runtime.query,
        queryLocale: runtime.queryLocale,
        selected: companionFilledTemporalCandidates,
      })
      : companionFilledTemporalCandidates;
    const orderedTemporalCandidates = ctx.temporalEventOrderQuery &&
      milestoneFilledTemporalCandidates.every(isSourceEnvelopeCandidate)
      ? [...milestoneFilledTemporalCandidates].sort(compareTemporalFactChronology)
      : milestoneFilledTemporalCandidates;

    return { entries: orderedTemporalCandidates };
  },
};
