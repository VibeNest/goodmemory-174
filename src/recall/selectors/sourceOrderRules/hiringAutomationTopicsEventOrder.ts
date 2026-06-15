import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type HiringAutomationEventFacet =
  | "costComparison"
  | "pilotResults"
  | "longTermSavings"
  | "trainingInvolvement"
  | "expansionInvolvement";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bhiring\s+automation\b)(?=[\s\S]*\bfive\s+items\b)/iu;

const FACETS = [
  {
    facet: "costComparison",
    patterns: [
      /^(?=[\s\S]*\$5,000 and \$12,000 annually\b)(?=[\s\S]*\bmanual hiring costs of \$15,000 per hire\b)/iu,
    ],
  },
  {
    facet: "pilotResults",
    patterns: [
      /^(?=[\s\S]*\bsaving around \$4,000 in recruiter hours over 6 weeks\b)(?=[\s\S]*\binitial pilot cost of \$6,500\b)/iu,
    ],
  },
  {
    facet: "longTermSavings",
    patterns: [
      /^(?=[\s\S]*\bsaved \$9,000 in recruitment costs over 4 months\b)(?=[\s\S]*\bexceeding initial projections by 18%)/iu,
    ],
  },
  {
    facet: "trainingInvolvement",
    patterns: [
      /^(?=[\s\S]*\binvolved in the training sessions\b)(?=[\s\S]*\bAI tool\b)/iu,
    ],
  },
  {
    facet: "expansionInvolvement",
    patterns: [
      /^(?=[\s\S]*\binvolve\b)(?=[\s\S]*\bevery stage of the automation expansion\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: HiringAutomationEventFacet;
  patterns: readonly RegExp[];
}>;

export const isHiringAutomationTopicsEventOrderQuery = narrowGate(
  "eventOrder.hiringAutomationTopics",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function hiringAutomationEventFacets(
  entry: RankedFactCandidate,
): Set<HiringAutomationEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<HiringAutomationEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedHiringAutomationTopicsEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isHiringAutomationTopicsEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    HiringAutomationEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) =>
        hiringAutomationEventFacets(entry).has(facet.facet)
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
