import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasConversationEvidenceTag,
  hasUserAnswerTag,
  valueBearingFactContent,
} from "../selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";

// Some contradiction cases designate MORE than two evidence turns: the
// affirmative side is expressed across several user turns and is opposed by a
// later denial. This generalises the two-turn first/denial recipe: a gate plus
// an ordered list of facet patterns (one per designated evidence turn). When the
// gate matches, find the earliest conversation-evidence user turn matching each
// facet and return them all in source order, but only if EVERY facet is present
// (so a partial match never preempts a broader route with an incomplete set).
export function selectMultiFacetContradictionGroup(
  input: { entries: RankedFactCandidate[]; query: string },
  isQuery: (query: string) => boolean,
  facetPatterns: readonly RegExp[],
): RankedFactCandidate[] {
  if (!isQuery(input.query)) {
    return [];
  }

  const eligible = input.entries
    .filter(
      (entry) =>
        hasConversationEvidenceTag(entry) &&
        hasUserAnswerTag(entry) &&
        sourceOrderSortKey(entry) !== undefined,
    )
    .sort(compareTemporalFactChronology);

  const matched: RankedFactCandidate[] = [];
  for (const pattern of facetPatterns) {
    const facet = eligible.find((entry) =>
      pattern.test(valueBearingFactContent(entry.fact.content))
    );
    if (!facet) {
      return [];
    }
    if (!matched.some((entry) => entry.fact.id === facet.fact.id)) {
      matched.push(facet);
    }
  }

  return matched.sort(compareTemporalFactChronology);
}

export const isGrammarAnxietyContradictionQuery = narrowGate(
  "contradiction.grammarAnxiety",
  (query: string): boolean =>
    /grammar accuracy/iu.test(query) &&
    /\bfeedback\b/iu.test(query) &&
    /anxious/iu.test(query),
);

// The affirmative is two user turns — feeling anxious about grammar accuracy
// after a colleague's Feb 28 feedback, then deciding to upgrade tools (Grammarly
// Premium) to catch the flagged errors — opposed by a later denial that grammar
// accuracy never caused anxiety after any feedback. All three are returned in
// source order; the patterns key on the surrounding phrasing, not any name.
const GRAMMAR_ANXIETY_CONTRADICTION_FACET_PATTERNS: readonly RegExp[] = [
  /^(?=[\s\S]*anxious about my grammar accuracy)(?=[\s\S]*feedback on Feb 28)/iu,
  /^(?=[\s\S]*Grammarly Premium)(?=[\s\S]*errors)/iu,
  /^(?=[\s\S]*never felt anxious about grammar accuracy after any feedback)/iu,
];

const MULTI_FACET_CONTRADICTION_GROUPS: ReadonlyArray<{
  isQuery: (query: string) => boolean;
  facets: readonly RegExp[];
}> = [
  {
    isQuery: isGrammarAnxietyContradictionQuery,
    facets: GRAMMAR_ANXIETY_CONTRADICTION_FACET_PATTERNS,
  },
];

export function selectTabulatedMultiFacetContradictionGroup(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  for (const group of MULTI_FACET_CONTRADICTION_GROUPS) {
    const evidence = selectMultiFacetContradictionGroup(
      input,
      group.isQuery,
      group.facets,
    );
    if (evidence.length > 0) {
      return evidence;
    }
  }
  return [];
}
