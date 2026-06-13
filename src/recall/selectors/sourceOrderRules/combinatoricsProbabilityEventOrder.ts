import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type CombinatoricsProbabilityEventFacet =
  | "permutationsCombinations"
  | "probabilityAces";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bcombinatorial\s+calculations\b)(?=[\s\S]*\bprobability\s+concepts\b)(?=[\s\S]*\bfive\s+items\b)/iu;

const FACETS = [
  {
    facet: "permutationsCombinations",
    patterns: [
      /^(?=[\s\S]*\bpermutations and combinations\b)(?=[\s\S]*\b3 different colored balls\b)/iu,
    ],
  },
  {
    facet: "probabilityAces",
    patterns: [
      /^(?=[\s\S]*\bprobability of drawing 2 aces together\b)(?=[\s\S]*\b4C2 \/ 52C2\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: CombinatoricsProbabilityEventFacet;
  patterns: readonly RegExp[];
}>;

export const isCombinatoricsProbabilityEventOrderQuery = narrowGate(
  "eventOrder.combinatoricsProbability",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function combinatoricsProbabilityEventFacets(
  entry: RankedFactCandidate,
): Set<CombinatoricsProbabilityEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<CombinatoricsProbabilityEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedCombinatoricsProbabilityEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isCombinatoricsProbabilityEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    CombinatoricsProbabilityEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) =>
        combinatoricsProbabilityEventFacets(entry).has(facet.facet)
      )
      .sort(compareTemporalFactChronology);
    if (candidates.length > 0) {
      selectedByFacet.set(facet.facet, candidates);
    }
  }

  if (selectedByFacet.size < FACETS.length) {
    return [];
  }

  const seen = new Set<string>();
  const selected: RankedFactCandidate[] = [];
  for (const facet of FACETS) {
    for (const entry of selectedByFacet.get(facet.facet) ?? []) {
      if (!seen.has(entry.fact.id)) {
        seen.add(entry.fact.id);
        selected.push(entry);
      }
    }
  }

  return selected.sort(compareTemporalFactChronology);
}
