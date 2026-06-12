import { rankFactCandidates } from "../../scoring";
import {
  aggregateEvidencePriority,
  aggregateFactCountRecallLimit,
  hasAggregateFactCountSignal,
} from "../../selectors/aggregate";
import { diversifyRankedFactCandidatesBySession } from "../../selectors/selectionContext";
import { collapseLatestUpdateSeries } from "../../selectors/updateSeries";
import type { FactSelectionRoute } from "../contracts";

export const aggregateEvidenceRoute: FactSelectionRoute = {
  id: "aggregate_evidence",
  isEligible({ ctx }) {
    if (
      ctx.sourceOrderedValueUpdateCandidates.length > 0 ||
      ctx.sourceOrderedTemporalIntervalCandidates.length > 0
    ) {
      return false;
    }

    return ctx.aggregateEvidenceQuery;
  },
  select({ ctx, runtime }) {
    const aggregateCandidates = rankFactCandidates(
      collapseLatestUpdateSeries(
        runtime.compatible.filter((item) =>
          hasAggregateFactCountSignal(
            item,
            runtime.query,
            runtime.language,
            runtime.queryLocale,
          )
        ),
        ctx.updateSeriesOptions,
      ),
      runtime.strategy,
    ).sort(
      (left, right) =>
        aggregateEvidencePriority(
          right,
          runtime.query,
          runtime.language,
          runtime.queryLocale,
        ) -
        aggregateEvidencePriority(
          left,
          runtime.query,
          runtime.language,
          runtime.queryLocale,
        ),
    );

    return {
      entries: diversifyRankedFactCandidatesBySession(
        aggregateCandidates,
        aggregateFactCountRecallLimit(runtime.query),
      ),
    };
  },
};
