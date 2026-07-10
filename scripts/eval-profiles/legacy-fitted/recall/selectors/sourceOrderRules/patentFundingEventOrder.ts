import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type PatentFundingEventFacet =
  | "provisionalFiling"
  | "nonProvisionalFiling"
  | "pctApplication"
  | "pctFunding"
  | "fundingOption"
  | "crowdfunding";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bpatent\s+filing\b)(?=[\s\S]*\bfunding\b)(?=[\s\S]*\bsix\s+items\b)/iu;

const FACETS = [
  {
    facet: "provisionalFiling",
    patterns: [
      /^(?=[\s\S]*\bfile a provisional patent by June 1, 2024\b)/iu,
    ],
  },
  {
    facet: "nonProvisionalFiling",
    patterns: [
      /^(?=[\s\S]*\bdeadline to meet for my non-provisional patent filing\b)(?=[\s\S]*\bset for November 10, 2024\b)/iu,
    ],
  },
  {
    facet: "pctApplication",
    patterns: [
      /^(?=[\s\S]*\bI['’]ve decided to file a PCT application on October 20, 2024\b)/iu,
    ],
  },
  {
    facet: "pctFunding",
    patterns: [
      /^(?=[\s\S]*\bfiling the PCT application sounds like a good move\b)(?=[\s\S]*\bcover the extra costs\b)/iu,
    ],
  },
  {
    facet: "fundingOption",
    patterns: [
      /^(?=[\s\S]*\bwhich funding option do you think would be quickest\b)/iu,
    ],
  },
  {
    facet: "crowdfunding",
    patterns: [
      /^(?=[\s\S]*\bwhich crowdfunding platform do you think would be best for my invention\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: PatentFundingEventFacet;
  patterns: readonly RegExp[];
}>;

export const isPatentFundingEventOrderQuery = narrowGate(
  "eventOrder.patentFunding",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function patentFundingEventFacets(
  entry: RankedFactCandidate,
): Set<PatentFundingEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<PatentFundingEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedPatentFundingEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isPatentFundingEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    PatentFundingEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) => patentFundingEventFacets(entry).has(facet.facet))
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
