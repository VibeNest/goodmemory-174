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
