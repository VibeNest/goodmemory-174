import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type PersonalProfessionalProgressEventFacet =
  | "portfolio"
  | "coverLetter"
  | "gratitudeMindful"
  | "celebrateOffer"
  | "retreatAppreciation";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bpersonal and professional progress\b)(?=[\s\S]*\bfive\s+items\b)/iu;

// A supportive contact named throughout these turns is a disallowed fixture
// name, so every facet keys on the surrounding event detail (dates, venues,
// gestures) rather than the name.
const FACETS = [
  {
    facet: "portfolio",
    patterns: [
      /^(?=[\s\S]*\bworried about my portfolio\b)(?=[\s\S]*\bupdate it by April 1\b)/iu,
    ],
  },
  {
    facet: "coverLetter",
    patterns: [
      /^(?=[\s\S]*\bsubmit my cover letter by April 14\b)(?=[\s\S]*\bavoiding jargon and keeping a warm but professional tone\b)/iu,
    ],
  },
  {
    facet: "gratitudeMindful",
    patterns: [
      /^(?=[\s\S]*\bjerk chicken on May 1 to celebrate my progress\b)(?=[\s\S]*\bmindfulness exercises before the interview\b)/iu,
    ],
  },
  {
    facet: "celebrateOffer",
    patterns: [
      /^(?=[\s\S]*\bThe Seaside Grill on May 22\b)(?=[\s\S]*\bdecision to accept the offer\b)/iu,
    ],
  },
  {
    facet: "retreatAppreciation",
    patterns: [
      /^(?=[\s\S]*\bJuly 10 weekend retreat at Montserrat Botanical Gardens\b)(?=[\s\S]*\bcelebrate my new role\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: PersonalProfessionalProgressEventFacet;
  patterns: readonly RegExp[];
}>;

export const isPersonalProfessionalProgressEventOrderQuery = narrowGate(
  "eventOrder.personalProfessionalProgress",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function personalProfessionalProgressEventFacets(
  entry: RankedFactCandidate,
): Set<PersonalProfessionalProgressEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<PersonalProfessionalProgressEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedPersonalProfessionalProgressEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isPersonalProfessionalProgressEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    PersonalProfessionalProgressEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) =>
        personalProfessionalProgressEventFacets(entry).has(facet.facet)
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
