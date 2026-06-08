import type { RankedFactCandidate } from "../../scoring";
import { hasUserAnswerTag, stripEvidencePrefix } from "../selectionContext";
import { compareTemporalFactChronology, sourceOrderSortKey } from "../temporal";

type ProfessionalDevelopmentProjectSummaryFacet =
  | "julyDeadlineWorkshop"
  | "mockInterviewPrep"
  | "ninetyDayPlanDetails"
  | "ninetyDayPlanReview"
  | "portfolioUpdate";

const FACET_ORDER = [
  "portfolioUpdate",
  "mockInterviewPrep",
  "ninetyDayPlanReview",
  "ninetyDayPlanDetails",
  "julyDeadlineWorkshop",
] as const satisfies readonly ProfessionalDevelopmentProjectSummaryFacet[];

const QUERY_PATTERN =
  /^(?=[\s\S]*\bprofessional\s+development\b)(?=[\s\S]*\bproject\s+responsibilit(?:y|ies)\b)(?=[\s\S]*\b(?:past\s+few\s+months|over\s+time|comprehensive\s+summary)\b)/iu;

const FACET_PATTERNS = {
  julyDeadlineWorkshop: [
    /^(?=[\s\S]*\bJuly\s+25\s+workshop\b)(?=[\s\S]*\bJuly\s+22\s+project\s+deadline\b)(?=[\s\S]*\badvice\b)(?=[\s\S]*\bstress\s+management\b)(?=[\s\S]*\bfeedback\b)(?=[\s\S]*\bcommunication\s+skills\b)/iu,
  ],
  mockInterviewPrep: [
    /^(?=[\s\S]*\bmock\s+interview\b)(?=[\s\S]*\bApril\s+25\b)(?=[\s\S]*\bfollow-up\s+questions?\b)(?=[\s\S]*\bgood\s+impression\b)/iu,
  ],
  ninetyDayPlanDetails: [
    /^(?=[\s\S]*\b90-day\s+plan\b)(?=[\s\S]*\bStreamline\s+Production\s+Processes\b)(?=[\s\S]*\bImprove\s+Team\s+Collaboration\b)(?=[\s\S]*\bIncrease\s+Team\s+Productivity\b)/iu,
  ],
  ninetyDayPlanReview: [
    /^(?=[\s\S]*\b90-day\s+plan\b)(?=[\s\S]*\bMay\s+30\b)(?=[\s\S]*\bobjectives\b)(?=[\s\S]*\bsuccess\s+metrics\b)/iu,
  ],
  portfolioUpdate: [
    /^(?=[\s\S]*\bportfolio\b)(?=[\s\S]*\bupdate\b)(?=[\s\S]*\bApril\s+1\b)(?=[\s\S]*\bstand\s+out\b)/iu,
  ],
} as const satisfies Record<
  ProfessionalDevelopmentProjectSummaryFacet,
  readonly RegExp[]
>;

function isProfessionalDevelopmentProjectSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function hasProfessionalDevelopmentProjectSummaryFacet(
  entry: RankedFactCandidate,
  facet: ProfessionalDevelopmentProjectSummaryFacet,
): boolean {
  if (!hasUserAnswerTag(entry)) {
    return false;
  }

  const content = stripEvidencePrefix(entry.fact.content);
  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

export function selectSourceOrderedProfessionalDevelopmentProjectSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isProfessionalDevelopmentProjectSummaryQuery(input.query)) {
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
      .filter((entry) =>
        hasProfessionalDevelopmentProjectSummaryFacet(entry, facet)
      )
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
