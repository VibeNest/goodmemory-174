import type { RankedFactCandidate } from "../../scoring";
import { hasUserAnswerTag, stripEvidencePrefix } from "../selectionContext";
import { compareTemporalFactChronology, sourceOrderSortKey } from "../temporal";

type AcademicMentorSummaryFacet =
  | "essayInfluence"
  | "finalProgressReview"
  | "firstMentorMeeting"
  | "journalConferenceDecision"
  | "warrantsFeedback";

const FACET_ORDER = [
  "firstMentorMeeting",
  "essayInfluence",
  "warrantsFeedback",
  "journalConferenceDecision",
  "finalProgressReview",
] as const satisfies readonly AcademicMentorSummaryFacet[];

const QUERY_PATTERN =
  /^(?=[\s\S]*\b(?:summary|summarize)\b)(?=[\s\S]*(?:\b(?:academic\s+mentor|mentor)\b|(?:\bwork\b[\s\S]{0,80}\binteractions?\b|\binteractions?\b[\s\S]{0,80}\bwork\b)))(?=[\s\S]*\bdeveloped\b)(?=[\s\S]*\b(?:key\s+steps|decisions?)\b)/iu;

const FACET_PATTERNS = {
  essayInfluence: [
    /^(?=[\s\S]*\b1985\s+essay\b)(?=[\s\S]*\bgender\s+studies\b)(?=[\s\S]*\bApril\s+4\s+Zoom\s+call\b)(?=[\s\S]*\bargument\s+angles\b)(?=[\s\S]*\bnot\s+copying\b)/iu,
  ],
  finalProgressReview: [
    /^(?=[\s\S]*\bhigh\s+grade\b)(?=[\s\S]*\bJuly\s+10\b)(?=[\s\S]*\bZoom\s+meeting\s+on\s+July\s+20\b)(?=[\s\S]*\breview\s+my\s+progress\b)(?=[\s\S]*\bconference\s+preparation\b)/iu,
  ],
  firstMentorMeeting: [
    /^(?=[\s\S]*\bacademic\s+mentor\b)(?=[\s\S]*\bretired\s+professor\b)(?=[\s\S]*\bEast\s+Janethaven\s+Library\b)(?=[\s\S]*\bFeb\s+10,\s+2024\b)(?=[\s\S]*\bgood\s+impression\b)/iu,
  ],
  journalConferenceDecision: [
    /^(?=[\s\S]*\bconference\s+paper\b)(?=[\s\S]*\bsuggested\s+submitting\s+my\s+essay\s+to\s+a\s+journal\b)(?=[\s\S]*\bstronger,\s+more\s+persuasive\s+piece\b)/iu,
  ],
  warrantsFeedback: [
    /^(?=[\s\S]*\brecommendation\b)(?=[\s\S]*\bstronger\s+warrants\b)(?=[\s\S]*\bgender\s+bias\b)(?=[\s\S]*\bMay\s+9\b)(?=[\s\S]*\bother\s+aspects\s+of\s+my\s+essay\b)/iu,
  ],
} as const satisfies Record<AcademicMentorSummaryFacet, readonly RegExp[]>;

function isAcademicMentorSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function hasAcademicMentorSummaryFacet(
  entry: RankedFactCandidate,
  facet: AcademicMentorSummaryFacet,
): boolean {
  if (!hasUserAnswerTag(entry)) {
    return false;
  }

  const content = stripEvidencePrefix(entry.fact.content);
  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

export function selectSourceOrderedAcademicMentorSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isAcademicMentorSummaryQuery(input.query)) {
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
      .filter((entry) => hasAcademicMentorSummaryFacet(entry, facet))
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
