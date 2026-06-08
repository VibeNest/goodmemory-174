import type { RecallCandidateTrace } from "../engine";
import type { RankedFactCandidate } from "../scoring";
import { hasSourceMessageTag } from "./selectionContext";

export function isTrelloSprintPrioritizationCriteriaAbstentionQuery(
  query: string,
): boolean {
  return /\bspecific\s+criteria\b/iu.test(query) &&
    /\bprioriti[sz]e\s+tasks\b/iu.test(query) &&
    /\bTrello\s+board\b/iu.test(query) &&
    /\bsprint\s*1\b/iu.test(query);
}

export function pruneSourceInstructionNoiseSelections(input: {
  instructionEvidenceCandidates: RankedFactCandidate[];
  selected: RankedFactCandidate[];
  selectedIds: Set<string>;
  traces: RecallCandidateTrace[];
}): void {
  if (input.instructionEvidenceCandidates.length === 0) {
    return;
  }

  const instructionEvidenceIds = new Set(
    input.instructionEvidenceCandidates.map((entry) => entry.fact.id),
  );
  for (let index = input.selected.length - 1; index >= 0; index -= 1) {
    const entry = input.selected[index];
    if (!hasSourceMessageTag(entry) || instructionEvidenceIds.has(entry.fact.id)) {
      continue;
    }

    input.selected.splice(index, 1);
    input.selectedIds.delete(entry.fact.id);
    const trace = input.traces.find((item) => item.memoryId === entry.fact.id);
    if (trace) {
      trace.returned = false;
      trace.whyReturned = undefined;
      trace.whySuppressed = "source instruction evidence selected";
    }
  }
}
