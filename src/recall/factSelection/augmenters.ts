import { rankFactCandidates } from "../scoring";
import {
  selectCouponStoreContextCompanions,
  selectDirectFactualCompanions,
} from "../selectors/conversationEvidence";
import {
  ASSISTANT_COUNT_HEADING_FACT_PATTERN,
  ASSISTANT_EVIDENCE_RECALL_LIMIT,
  ASSISTANT_EVIDENCE_TAG,
  DIRECT_FACTUAL_RECALL_LIMIT,
  stripEvidencePrefix,
} from "../selectors/selectionContext";
import { pruneSourceInstructionNoiseSelections } from "../selectors/sourceOrderInstructionPruning";
import type {
  AugmenterStageRecord,
  FactSelectionAugmenterStage,
  SelectionDraft,
} from "./contracts";

function appendedSince(
  draft: SelectionDraft,
  startIndex: number,
): string[] {
  return draft.selected.slice(startIndex).map((entry) => entry.fact.id);
}

/**
 * Legacy post-loop block 1: prune source-instruction noise out of the primary
 * selections, then append instruction and source-preference candidates. The
 * legacy gate `!sourcePreferenceOverrideByContradiction &&
 * !contradictionPairSelected` maps to the declarative yield on the
 * contradiction route plus the gate below. Do NOT add temporal_order to
 * yieldsToWinners: its yield mechanism lives upstream (the run context empties
 * instruction candidates for brought-up event-order queries), and widening the
 * yield here would change behavior for non-brought-up temporal winners.
 */
const instructionAndSourcePreferenceStage: FactSelectionAugmenterStage = {
  id: "instruction_and_source_preference",
  canPrune: true,
  yieldsToWinners: ["contradiction_evidence_pair"],
  gate({ ctx }) {
    return !ctx.sourcePreferenceOverrideByContradiction;
  },
  apply({ ctx, draft }): AugmenterStageRecord {
    const beforePrune = draft.selected.map((entry) => entry.fact.id);
    pruneSourceInstructionNoiseSelections({
      instructionEvidenceCandidates: ctx.instructionEvidenceCandidates,
      selected: draft.selected,
      selectedIds: draft.selectedIds,
      traces: draft.traces,
    });
    const afterPrune = new Set(draft.selected.map((entry) => entry.fact.id));
    const removedFactIds = beforePrune.filter((id) => !afterPrune.has(id));
    const appendStart = draft.selected.length;

    for (const entry of ctx.instructionEvidenceCandidates) {
      if (draft.selectedIds.has(entry.fact.id)) {
        continue;
      }

      draft.select(entry);
    }

    for (const entry of ctx.sourcePreferenceCandidates) {
      if (draft.selectedIds.has(entry.fact.id)) {
        continue;
      }

      draft.select(entry);
    }

    return {
      appendedFactIds: appendedSince(draft, appendStart),
      id: "instruction_and_source_preference",
      removedFactIds,
    };
  },
};

/** Legacy post-loop block 2: assistant count-heading evidence append. */
const assistantCountHeadingsStage: FactSelectionAugmenterStage = {
  id: "assistant_count_headings",
  canPrune: false,
  yieldsToWinners: [],
  gate({ ctx, draft, runtime }) {
    return (
      ctx.assistantEvidenceRecallQuery &&
      /\bhow many\b/iu.test(runtime.query) &&
      draft.selected.length < ASSISTANT_EVIDENCE_RECALL_LIMIT
    );
  },
  apply({ draft, runtime }): AugmenterStageRecord {
    const appendStart = draft.selected.length;
    const assistantCountHeadings = rankFactCandidates(
      runtime.compatible.filter(
        (entry) =>
          !draft.selectedIds.has(entry.fact.id) &&
          entry.fact.tags?.includes(ASSISTANT_EVIDENCE_TAG) === true &&
          ASSISTANT_COUNT_HEADING_FACT_PATTERN.test(
            stripEvidencePrefix(entry.fact.content),
          ),
      ),
      runtime.strategy,
    ).slice(0, ASSISTANT_EVIDENCE_RECALL_LIMIT - draft.selected.length);

    for (const entry of assistantCountHeadings) {
      draft.select(entry);
    }

    return {
      appendedFactIds: appendedSince(draft, appendStart),
      id: "assistant_count_headings",
      removedFactIds: [],
    };
  },
};

/** Legacy post-loop block 3: direct factual companion append. */
const directFactualCompanionsStage: FactSelectionAugmenterStage = {
  id: "direct_factual_companions",
  canPrune: false,
  yieldsToWinners: [],
  gate({ ctx, draft }) {
    return (
      !ctx.exactSourceOrderedReasoningQuery &&
      !ctx.sourcePreferenceExclusiveQuery &&
      ctx.directFactualLookupQuery &&
      !ctx.weatherFeatureConcernCountQuery &&
      ctx.informationExtractionCandidates.length === 0 &&
      ctx.sourceOrderedValueUpdateCandidates.length === 0 &&
      ctx.sourceOrderedTemporalIntervalCandidates.length === 0 &&
      draft.selected.length < DIRECT_FACTUAL_RECALL_LIMIT
    );
  },
  apply({ draft, runtime }): AugmenterStageRecord {
    const appendStart = draft.selected.length;
    for (const entry of selectDirectFactualCompanions({
      entries: runtime.compatible,
      limit: DIRECT_FACTUAL_RECALL_LIMIT - draft.selected.length,
      selectedEntries: draft.selected,
      selectedIds: draft.selectedIds,
      strategy: runtime.strategy,
    })) {
      draft.select(entry);
    }

    return {
      appendedFactIds: appendedSince(draft, appendStart),
      id: "direct_factual_companions",
      removedFactIds: [],
    };
  },
};

/** Legacy post-loop block 4: coupon store context companion append. */
const couponStoreCompanionsStage: FactSelectionAugmenterStage = {
  id: "coupon_store_companions",
  canPrune: false,
  yieldsToWinners: [],
  gate({ ctx }) {
    return ctx.couponRedemptionLocationQuery;
  },
  apply({ draft, runtime }): AugmenterStageRecord {
    const appendStart = draft.selected.length;
    for (const entry of selectCouponStoreContextCompanions({
      entries: runtime.compatible,
      selectedEntries: draft.selected,
      selectedIds: draft.selectedIds,
      strategy: runtime.strategy,
    })) {
      draft.select(entry);
    }

    return {
      appendedFactIds: appendedSince(draft, appendStart),
      id: "coupon_store_companions",
      removedFactIds: [],
    };
  },
};

export const FACT_SELECTION_AUGMENTER_STAGES = {
  assistantCountHeadings: assistantCountHeadingsStage,
  couponStoreCompanions: couponStoreCompanionsStage,
  directFactualCompanions: directFactualCompanionsStage,
  instructionAndSourcePreference: instructionAndSourcePreferenceStage,
} as const;
