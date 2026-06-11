import { UPDATE_EVIDENCE_RECALL_LIMIT } from "../../selectors/selectionContext";
import { selectUpdateHistoryCompanions } from "../../selectors/updateSeries";
import type { FactSelectionRoute } from "../contracts";

export const updateEvidenceRoute: FactSelectionRoute = {
  id: "update_evidence",
  isEligible({ ctx }) {
    return (
      ctx.sourceOrderedValueUpdateCandidates.length > 0 ||
      ctx.updateEvidenceCandidates.length > 0
    );
  },
  select({ ctx, runtime }) {
    if (ctx.sourceOrderedValueUpdateCandidates.length > 0) {
      return { entries: ctx.sourceOrderedValueUpdateCandidates };
    }

    const primaryUpdateSelections = ctx.updateEvidenceCandidates.slice(
      0,
      UPDATE_EVIDENCE_RECALL_LIMIT,
    );
    // The legacy companion limit read `selected.length` mid-case; the draft is
    // provably empty when the primary loop starts, so the primary selection
    // count is arithmetically identical.
    const selectedIds = new Set(
      primaryUpdateSelections.map((entry) => entry.fact.id),
    );
    const companionSelections = selectUpdateHistoryCompanions({
      entries: ctx.updateEvidencePool,
      limit: UPDATE_EVIDENCE_RECALL_LIMIT - primaryUpdateSelections.length,
      options: ctx.updateEvidenceSeriesOptions,
      query: runtime.query,
      selectedEntries: primaryUpdateSelections,
      selectedIds,
    });

    return { entries: [...primaryUpdateSelections, ...companionSelections] };
  },
};
