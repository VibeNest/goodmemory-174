import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type CareerRelocationEventFacet =
  | "resumeAtsTool"
  | "keywordMatch"
  | "linkedinHeadline"
  | "panelInterview"
  | "relocationRental";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bcareer\s+development\b)(?=[\s\S]*\brelocation\b)(?=[\s\S]*\bfive\s+items\b)/iu;

const FACETS = [
  {
    facet: "resumeAtsTool",
    patterns: [
      /^(?=[\s\S]*\bCanva Pro subscription\b)(?=[\s\S]*\bresume ATS compatible by March 30, 2024\b)/iu,
    ],
  },
  {
    facet: "keywordMatch",
    patterns: [
      /^(?=[\s\S]*\bJobscan\b)(?=[\s\S]*\bimproved my keyword match by 25%)/iu,
    ],
  },
  {
    facet: "linkedinHeadline",
    patterns: [
      /^(?=[\s\S]*\bupdated my LinkedIn headline\b)(?=[\s\S]*\bJuly 5, 2024\b)/iu,
    ],
  },
  {
    facet: "panelInterview",
    patterns: [
      /^(?=[\s\S]*\bpanel interview for the consulting role on September 20, 2024\b)/iu,
    ],
  },
  {
    facet: "relocationRental",
    patterns: [
      /^(?=[\s\S]*\bresearch and decide on the best short-term rental option\b)(?=[\s\S]*\bensure a smooth relocation\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: CareerRelocationEventFacet;
  patterns: readonly RegExp[];
}>;

export const isCareerRelocationEventOrderQuery = narrowGate(
  "eventOrder.careerRelocation",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function careerRelocationEventFacets(
  entry: RankedFactCandidate,
): Set<CareerRelocationEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<CareerRelocationEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedCareerRelocationEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isCareerRelocationEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    CareerRelocationEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) => careerRelocationEventFacets(entry).has(facet.facet))
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
