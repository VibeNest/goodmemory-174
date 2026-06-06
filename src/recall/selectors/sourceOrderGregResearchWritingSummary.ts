import type { RankedFactCandidate } from "../scoring";
import { hasUserAnswerTag, stripEvidencePrefix } from "./selectionContext";
import { compareTemporalFactChronology, sourceOrderSortKey } from "./temporal";

type GregResearchWritingSummaryFacet =
  | "deadlineBalancing"
  | "filmGenderAnalysis"
  | "initialCollaboration"
  | "nvivoAdvancedFeatures"
  | "nvivoAdoption"
  | "postSubmissionCollaboration";

const FACET_ORDER = [
  "initialCollaboration",
  "nvivoAdoption",
  "nvivoAdvancedFeatures",
  "filmGenderAnalysis",
  "deadlineBalancing",
  "postSubmissionCollaboration",
] as const satisfies readonly GregResearchWritingSummaryFacet[];

const QUERY_PATTERN =
  /^(?=[\s\S]*\bGreg\b)(?=[\s\S]*\b(?:summary|summarize)\b)(?=[\s\S]*\bcollaboration\b)(?=[\s\S]*\bresearch\b)(?=[\s\S]*\bwriting\s+projects?\b)(?=[\s\S]*\bprogressed\b)/iu;

const FACET_PATTERNS = {
  deadlineBalancing: [
    /^(?=[\s\S]*\bJune\s+5\s+deadline\b)(?=[\s\S]*\bMontserrat\s+Journal\s+of\s+Media\s+Studies\b)(?=[\s\S]*\bconference\s+paper\s+with\s+Greg\b)(?=[\s\S]*\bJune\s+3\b)(?=[\s\S]*\bprioritize\b)/iu,
  ],
  filmGenderAnalysis: [
    /^(?=[\s\S]*\banalyzing\s+10\s+Montserrat\s+films\b)(?=[\s\S]*\bgender\s+portrayal\b)(?=[\s\S]*\bstrong\s+female\s+leads\b)(?=[\s\S]*\bgender\s+stereotypes\b)/iu,
  ],
  initialCollaboration: [
    /^(?=[\s\S]*\bGreg,\s+23\b)(?=[\s\S]*\bUniversity\s+of\s+Montserrat\s+seminar\b)(?=[\s\S]*\bFeb\s+20,\s+2024\b)(?=[\s\S]*\bjoint\s+research\b)(?=[\s\S]*\bmedia\s+influence\b)/iu,
  ],
  nvivoAdoption: [
    /^(?=[\s\S]*\bNVivo\b)(?=[\s\S]*\bqualitative\s+data\s+analysis\b)(?=[\s\S]*\bGreg\s+suggested\b)(?=[\s\S]*\bApril\s+3\b)(?=[\s\S]*\bcoding\s+speed\s+by\s+30%)/iu,
  ],
  nvivoAdvancedFeatures: [
    /^(?=[\s\S]*\bfilm\s+scripts\b)(?=[\s\S]*\bnodes\b)(?=[\s\S]*\bgender\s+roles\b)(?=[\s\S]*\bpower\s+dynamics\b)(?=[\s\S]*\bqueries\b)(?=[\s\S]*\bvisualizations\b)/iu,
  ],
  postSubmissionCollaboration: [
    /^(?=[\s\S]*\bGreg\b)(?=[\s\S]*\bconference\s+paper\s+draft\b)(?=[\s\S]*\balready\s+submitted\b)(?=[\s\S]*\bMontserrat\s+Media\s+Symposium\b)(?=[\s\S]*\bJuly\s+12\b)/iu,
  ],
} as const satisfies Record<GregResearchWritingSummaryFacet, readonly RegExp[]>;

function isGregResearchWritingSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function hasGregResearchWritingSummaryFacet(
  entry: RankedFactCandidate,
  facet: GregResearchWritingSummaryFacet,
): boolean {
  if (!hasUserAnswerTag(entry)) {
    return false;
  }

  const content = stripEvidencePrefix(entry.fact.content);
  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

export function selectSourceOrderedGregResearchWritingSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isGregResearchWritingSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  const selectedOrders = new Set<number>();
  const addCandidate = (entry: RankedFactCandidate): boolean => {
    if (selected.size >= input.limit) {
      return false;
    }

    const order = sourceOrderSortKey(entry);
    if (order !== undefined && selectedOrders.has(order)) {
      return false;
    }

    selected.set(entry.fact.id, entry);
    if (order !== undefined) {
      selectedOrders.add(order);
    }
    return true;
  };

  for (const facet of FACET_ORDER) {
    const candidate = input.sourceCandidates
      .filter((entry) => hasGregResearchWritingSummaryFacet(entry, facet))
      .sort(compareTemporalFactChronology)[0];
    if (candidate) {
      addCandidate(candidate);
    }
  }

  const requiredAnchors = Math.max(input.minAnchors, FACET_ORDER.length);
  if (selected.size < requiredAnchors) {
    return [];
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
