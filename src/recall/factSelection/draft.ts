import type { RecallCandidateTrace } from "../engine";
import type { RecallSlot } from "../router";
import type { RankedFactCandidate } from "../scoring";
import { markSelectedTrace } from "../selectors/selectionContext";
import type { FactSelectionSummary, SelectionDraft } from "./contracts";

export function createSelectionDraft(input: {
  traces: RecallCandidateTrace[];
}): SelectionDraft {
  const selected: RankedFactCandidate[] = [];
  const selectedIds = new Set<string>();
  const summary: FactSelectionSummary = { augmenterStages: [] };
  const select = (
    entry: RankedFactCandidate,
    slot: RecallSlot | "generic" = "generic",
    fallback: RecallCandidateTrace["fallback"] = "none",
  ): void => {
    selected.push(entry);
    selectedIds.add(entry.fact.id);
    markSelectedTrace(
      input.traces,
      entry.fact.id,
      slot,
      entry.intentScore,
      entry.lexicalScore,
      entry.freshnessScore,
      entry.explicitnessScore,
      entry.usageScore,
      entry.evidenceScore,
      entry.outcomeScore,
      entry.verificationPenaltyScore,
      fallback,
    );
  };

  return {
    select,
    selected,
    selectedIds,
    summary,
    traces: input.traces,
  };
}

/**
 * Legacy final post-loop block: relabel still-unselected compatible
 * candidates from "not selected" to "below generic threshold". Must run after
 * every selection and augmentation step; it only rewrites "not selected", so
 * it can never clobber a more specific suppression reason.
 */
export function finalizeSuppressionReasons(input: {
  compatible: RankedFactCandidate[];
  traces: RecallCandidateTrace[];
}): void {
  for (const entry of input.compatible) {
    const trace = input.traces.find((item) => item.memoryId === entry.fact.id);
    if (trace && !trace.returned && trace.whySuppressed === "not selected") {
      trace.whySuppressed = "below generic threshold";
    }
  }
}
