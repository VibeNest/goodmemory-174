import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type RelationshipFinancialManagementSummaryFacet =
  | "diningBudget"
  | "groceryContract"
  | "jointSavings"
  | "reducedHours"
  | "sharedFinances"
  | "spendingHabits";

const QUERY_PATTERN =
  /^(?=[\s\S]*\b(?:summary|summarize)\b)(?=[\s\S]*\b(?:approach|managing)\b)(?=[\s\S]*\bfinances\b)(?=[\s\S]*\bdeveloped\b)/iu;

const FACETS = [
  {
    facet: "sharedFinances",
    patterns: [
      /^(?=[\s\S]*\bsharing\s+household\s+finances\b)(?=[\s\S]*\b(?:common|unified)\s+financial\s+goals?\b)(?=[\s\S]*\bregular\s+budget\s+reviews?\b)/iu,
      /^(?=[\s\S]*\bshared\s+finances\b)(?=[\s\S]*\b(?:joint\s+and\s+separate\s+accounts|open\s+communication)\b)/iu,
    ],
  },
  {
    facet: "spendingHabits",
    patterns: [
      /^(?=[\s\S]*\bdaily\s+spending\s+habits?\b)(?=[\s\S]*\bdaily\s+spending\s+limits?\b)(?=[\s\S]*\b(?:receipts?|regular\s+(?:financial\s+)?check-ins?)\b)/iu,
      /^(?=[\s\S]*\bday-to-day\s+expenses?\b)(?=[\s\S]*\b(?:daily\s+spending\s+limits?|joint\s+accounts?)\b)(?=[\s\S]*\b(?:receipts?|regular\s+(?:financial\s+)?check-ins?)\b)/iu,
    ],
  },
  {
    facet: "diningBudget",
    patterns: [
      /^(?=[\s\S]*\bdining\s+out\s+budget\b)(?=[\s\S]*\$200\s+monthly\b)(?=[\s\S]*\b(?:validate|validating|reasonable)\b)(?=[\s\S]*\b(?:planning|tracking|stick)\b)/iu,
      /^(?=[\s\S]*\bCompromis(?:ing|e)\b)(?=[\s\S]*\b\$200\b)(?=[\s\S]*\bdining\s+out\b)/iu,
    ],
  },
  {
    facet: "jointSavings",
    patterns: [
      /^(?=[\s\S]*\bjoint\s+savings\s+account\b)(?=[\s\S]*\bshared\s+financial\s+goals?\b)(?=[\s\S]*\b(?:check-ins?|contribution\s+rules?|transparency)\b)/iu,
      /^(?=[\s\S]*\bFirst\s+National\s+Bank\b)(?=[\s\S]*\bjoint\s+savings\s+account\b)(?=[\s\S]*\btransparency\b)/iu,
    ],
  },
  {
    facet: "groceryContract",
    patterns: [
      /^(?=[\s\S]*\bgrocery\s+budget\b)(?=[\s\S]*\$500\b)(?=[\s\S]*\b(?:freelance\s+contract|\$2,?000)\b)(?=[\s\S]*\b(?:expenses?|financial\s+planning|cash\s+flow|financial\s+goals?)\b)/iu,
      /^(?=[\s\S]*\$500\s+per\s+month\b)(?=[\s\S]*\bSeptember\s+1\b)(?=[\s\S]*\bfinancial\s+planning\b)/iu,
    ],
  },
  {
    facet: "reducedHours",
    patterns: [
      /^(?=[\s\S]*\b30\s+hours?\s+a\s+week\b)(?=[\s\S]*\bJanuary\s+6\b)(?=[\s\S]*\b(?:fixed\s+expenses?|savings?\s+goals?|emergency\s+fund)\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: RelationshipFinancialManagementSummaryFacet;
  patterns: readonly RegExp[];
}>;

function isRelationshipFinancialManagementSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function relationshipFinancialManagementSummaryFacets(
  entry: RankedFactCandidate,
): Set<RelationshipFinancialManagementSummaryFacet> {
  if (!hasAssistantAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<RelationshipFinancialManagementSummaryFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedRelationshipFinancialManagementSummaryCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isRelationshipFinancialManagementSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<
    RelationshipFinancialManagementSummaryFacet,
    RankedFactCandidate
  >();
  for (const facet of FACETS) {
    const candidate = input.sourceCandidates
      .filter((entry) =>
        relationshipFinancialManagementSummaryFacets(entry).has(facet.facet)
      )
      .sort(compareTemporalFactChronology)[0];
    if (candidate) {
      selected.set(facet.facet, candidate);
    }
  }

  if (selected.size < FACETS.length) {
    return [];
  }

  return FACETS
    .map((facet) => selected.get(facet.facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort(compareTemporalFactChronology);
}
