import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type ProbabilityConceptsEventFacet =
  | "ratioFoundation"
  | "independentVsExclusive"
  | "startingPointChoice"
  | "coinTossPractice"
  | "exclusiveAdditionRule"
  | "conditionalProbability";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bfoundational\s+concepts\b)(?=[\s\S]*\bprobability\b)(?=[\s\S]*\bsix\s+items\b)/iu;

const FACETS = [
  {
    facet: "ratioFoundation",
    patterns: [
      /^(?=[\s\S]*\bprobability as a ratio\b)(?=[\s\S]*\bstart with simple events\b)(?=[\s\S]*\bcoin tosses and dice rolls\b)/iu,
      /^(?=[\s\S]*\bratio of favorable outcomes to total outcomes\b)(?=[\s\S]*\bwrapping my head around it\b)/iu,
    ],
  },
  {
    facet: "independentVsExclusive",
    patterns: [
      /^(?=[\s\S]*\bdifference between independent and mutually exclusive events\b)(?=[\s\S]*\bexample of each\b)/iu,
      /^(?=[\s\S]*\bmutually exclusive and independent events\b)(?=[\s\S]*\brolling dice\b)/iu,
    ],
  },
  {
    facet: "startingPointChoice",
    patterns: [
      /^(?=[\s\S]*\bdecide where to start with probability\b)(?=[\s\S]*\btwo options\b)/iu,
      /^(?=[\s\S]*\bstart with coin toss problems\b)(?=[\s\S]*\bcoin toss exercises\b)/iu,
    ],
  },
  {
    facet: "coinTossPractice",
    patterns: [
      /^(?=[\s\S]*\bprobability of getting heads in a single coin toss is 1\/2\b)(?=[\s\S]*\bexercises are really helpful\b)/iu,
      /^(?=[\s\S]*\btossing two coins is considered independent\b)/iu,
    ],
  },
  {
    facet: "exclusiveAdditionRule",
    patterns: [
      /^(?=[\s\S]*\bwhy P\(A or B\) = P\(A\) \+ P\(B\) only holds for mutually exclusive events\b)(?=[\s\S]*\btwo events A and B\b)/iu,
      /^(?=[\s\S]*\brolling a 3 or 4 on a fair six-sided die\b)/iu,
    ],
  },
  {
    facet: "conditionalProbability",
    patterns: [
      /^(?=[\s\S]*\bconditional probability concept\b)(?=[\s\S]*\bintroduced to it briefly\b)/iu,
      /^(?=[\s\S]*face card or a spade)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: ProbabilityConceptsEventFacet;
  patterns: readonly RegExp[];
}>;

export const isProbabilityConceptsEventOrderQuery = narrowGate(
  "eventOrder.probabilityConcepts",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function probabilityConceptsEventFacets(
  entry: RankedFactCandidate,
): Set<ProbabilityConceptsEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<ProbabilityConceptsEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedProbabilityConceptsEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isProbabilityConceptsEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    ProbabilityConceptsEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) => probabilityConceptsEventFacets(entry).has(facet.facet))
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
