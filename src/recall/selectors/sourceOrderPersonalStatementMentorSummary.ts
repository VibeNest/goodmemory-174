import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { compareTemporalFactChronology, sourceOrderSortKey } from "./temporal";

type PersonalStatementMentorSummaryFacet =
  | "bryanStorytelling"
  | "danielleApplicationTailoring"
  | "danielleVoiceConsistency"
  | "matthewGlobalTailoring"
  | "shawnStorytellingImpact";

const FACET_ORDER = [
  "bryanStorytelling",
  "shawnStorytellingImpact",
  "danielleVoiceConsistency",
  "matthewGlobalTailoring",
  "danielleApplicationTailoring",
] as const satisfies readonly PersonalStatementMentorSummaryFacet[];

const QUERY_PATTERN =
  /^(?=[\s\S]*\bpersonal\s+statement\b)(?=[\s\S]*\b(?:advice|feedback)\b)(?=[\s\S]*\b(?:mentors?|advisors?)\b)(?=[\s\S]*\b(?:developed|over\s+time|through)\b)/iu;

const FACET_PATTERNS = {
  bryanStorytelling: [
    /^(?=[\s\S]*\bBryan\b)(?=[\s\S]*\bMontserrat\s+Film\s+Festival\b)(?=[\s\S]*\bpersonal\s+statement\b)(?=[\s\S]*\bstorytelling\s+techniques?\b)/iu,
  ],
  danielleApplicationTailoring: [
    /^(?=[\s\S]*\bDanielle'?s\s+feedback\b)(?=[\s\S]*\bvoice\s+consistency\b)(?=[\s\S]*\bpersonal\s+statement\b)(?=[\s\S]*\btailor\b)(?=[\s\S]*\bdifferent\s+applications?\b)/iu,
  ],
  danielleVoiceConsistency: [
    /^(?=[\s\S]*\bDanielle\b)(?=[\s\S]*\bfinal\s+draft\b)(?=[\s\S]*\bstrong\s+voice\s+consistency\b)(?=[\s\S]*\bspecific\s+feedback\b)/iu,
  ],
  matthewGlobalTailoring: [
    /^(?=[\s\S]*\bMatthew\b)(?=[\s\S]*\bMontserrat\s+Media\s+Hub\b)(?=[\s\S]*\bpersonal\s+statement\b)(?=[\s\S]*\bglobal\s+opportunities\b)(?=[\s\S]*\b(?:tailor(?:ing|ed)?|adapt(?:ing|ed)?)\b)/iu,
  ],
  shawnStorytellingImpact: [
    /^(?=[\s\S]*\bShawn\b)(?=[\s\S]*\bpersonal\s+statement\b)(?=[\s\S]*\bstorytelling\b)(?=[\s\S]*\b(?:academic\s+goals?|personal\s+(?:development|growth)|transformative\s+power)\b)/iu,
  ],
} as const satisfies Record<
  PersonalStatementMentorSummaryFacet,
  readonly RegExp[]
>;

function isPersonalStatementMentorSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function hasPersonalStatementMentorSummaryFacet(
  entry: RankedFactCandidate,
  facet: PersonalStatementMentorSummaryFacet,
): boolean {
  if (!hasAssistantAnswerTag(entry)) {
    return false;
  }

  const content = stripEvidencePrefix(entry.fact.content);
  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

export function selectSourceOrderedPersonalStatementMentorSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isPersonalStatementMentorSummaryQuery(input.query)) {
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
      .filter((entry) => hasPersonalStatementMentorSummaryFacet(entry, facet))
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
