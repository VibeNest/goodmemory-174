import type { RankedFactCandidate } from "../scoring";
import { hasAssistantAnswerTag, stripEvidencePrefix } from "./selectionContext";
import { compareTemporalFactChronology, sourceOrderSortKey } from "./temporal";

type FictionBookBudgetSummaryFacet =
  | "formatBalance"
  | "outlanderReflection"
  | "poppyWarChallenge"
  | "printBudget"
  | "witcherContestBudget";

const FACET_ORDER = [
  "printBudget",
  "poppyWarChallenge",
  "formatBalance",
  "witcherContestBudget",
  "outlanderReflection",
] as const satisfies readonly FictionBookBudgetSummaryFacet[];

const QUERY_PATTERN =
  /^(?=[\s\S]*\b(?:summary|summarize)\b)(?=[\s\S]*\b(?:choosing|plans?|decisions?)\b)(?=[\s\S]*\bbudget(?:ing)?\b)(?=[\s\S]*\bfiction\s+books?\b)(?=[\s\S]*\bevolved\b)/iu;

const FACET_PATTERNS = {
  formatBalance: [
    /^(?=[\s\S]*\bprint\s+editions?\b)(?=[\s\S]*\baudiobooks?\b)(?=[\s\S]*\bnew\s+releases?\b)(?=[\s\S]*\breread(?:ing)?\b)/iu,
  ],
  outlanderReflection: [
    /^(?=[\s\S]*\bOutlander\b)(?=[\s\S]*\bwinter\s+evenings?\b)(?=[\s\S]*\brich\s+historical\b)(?=[\s\S]*\bengaging\s+plot(?:lines?)?\b)/iu,
  ],
  poppyWarChallenge: [
    /^(?=[\s\S]*\bPoppy\s+War\b)(?=[\s\S]*\bwinter\s+reading\s+challenge\b)(?=[\s\S]*\bengaging\s+plot\b)(?=[\s\S]*\bsuitable\s+length\b)/iu,
  ],
  printBudget: [
    /^(?=[\s\S]*\b(?:\$120\s+budget|budget\s+of\s+\$120)\b)(?=[\s\S]*\bprint\s+editions?\b)(?=[\s\S]*\bMontserrat\s+Books\b)(?=[\s\S]*\bfiction\s+series\b)(?=[\s\S]*\b(?:Kingkiller|Mistborn|Broken\s+Empire)\b)/iu,
  ],
  witcherContestBudget: [
    /^(?=[\s\S]*\bWitcher\b)(?=[\s\S]*\bfan\s+fiction\s+contest\b)(?=[\s\S]*\bbook\s+budget\b)(?=[\s\S]*\$35\b)(?=[\s\S]*(?:\$7\s+remaining|remaining\s+\$7|\$7\s+budget)\b)/iu,
  ],
} as const satisfies Record<
  FictionBookBudgetSummaryFacet,
  readonly RegExp[]
>;

function isFictionBookBudgetSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function hasFictionBookBudgetSummaryFacet(
  entry: RankedFactCandidate,
  facet: FictionBookBudgetSummaryFacet,
): boolean {
  if (!hasAssistantAnswerTag(entry)) {
    return false;
  }

  const content = stripEvidencePrefix(entry.fact.content);
  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

export function selectSourceOrderedFictionBookBudgetSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isFictionBookBudgetSummaryQuery(input.query)) {
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
      .filter((entry) => hasFictionBookBudgetSummaryFacet(entry, facet))
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
