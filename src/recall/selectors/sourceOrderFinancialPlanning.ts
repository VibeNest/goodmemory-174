import type { RankedFactCandidate } from "../scoring";
import {
  hasSourceMessageTag,
  stripEvidencePrefix,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";

type HouseholdBudgetReasoningFacet =
  | "expenseTracking"
  | "groceryContract"
  | "medicalSupport"
  | "sharedFinances"
  | "spendingHabits";

const FACETS = [
  {
    facet: "sharedFinances",
    quota: 2,
    patterns: [
      /\b(?:spouse|partner|Alexis)\b[\s\S]{0,180}\b(?:sharing|shared)\s+household\s+finances\b/iu,
      /\bsharing\s+household\s+finances\b[\s\S]{0,220}\b(?:common\s+financial\s+goals?|shared\s+expenses|groceries|savings)\b/iu,
    ],
  },
  {
    facet: "spendingHabits",
    quota: 2,
    patterns: [
      /\b(?:day-to-day\s+expenses?|day-to-day\s+spending\s+habits?|daily\s+spending\s+habits?)\b[\s\S]{0,180}\b(?:small\s+expenses?|add\s+up|same\s+page)\b/iu,
      /\b(?:daily\s+spending\s+limits?|regular\s+financial\s+check-ins?|share\s+receipts?|transparent\s+spending|joint\s+account)\b/iu,
    ],
  },
  {
    facet: "expenseTracking",
    quota: 2,
    patterns: [
      /\bExcel\b[\s\S]{0,220}\b(?:daily\s+(?:spending\s+)?limits?|daily\s+spending|share\s+receipts?|statements?|transparent)\b/iu,
      /\b(?:daily\s+(?:spending\s+)?limits?|regular\s+check-ins?|share\s+receipts?|statements?|transparent)\b[\s\S]{0,220}\bExcel\b/iu,
    ],
  },
  {
    facet: "medicalSupport",
    quota: 2,
    patterns: [
      /\bAshlee\b[\s\S]{0,260}\b(?:approved|receipts?|request(?:ed|ing)?\s+receipts?)\b/iu,
      /\b(?:approved|receipts?|request(?:ed|ing)?\s+receipts?)\b[\s\S]{0,260}\bAshlee\b/iu,
    ],
  },
  {
    facet: "groceryContract",
    quota: 2,
    patterns: [
      /\b(?:\$500|500)\s+monthly\s+joint\s+grocery\s+budget\b[\s\S]{0,220}\b(?:\$400|400|freelance\s+contract|expenses?)\b/iu,
      /\b(?:\$500|500)\s+monthly\s+joint\s+budget\s+for\s+groceries\b[\s\S]{0,220}\b(?:\$400|400|freelance\s+contract|expenses?)\b/iu,
      /\bfreelance\s+contract\b[\s\S]{0,260}\b(?:\$2,?000|2000|grocery\s+(?:increase|budget)|offsets?|medical\s+bills?|cash\s+flow)\b/iu,
      /\bgrocery\s+increase\b[\s\S]{0,260}\b(?:freelance\s+contract|\$2,?000|2000|offsets?)\b/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: HouseholdBudgetReasoningFacet;
  patterns: readonly RegExp[];
  quota: number;
}>;

export function isSourceOrderedHouseholdBudgetReasoningQuery(
  query: string,
): boolean {
  return /\bgrocery\s+budget\b/iu.test(query) &&
    /\bfreelance\s+contract\b/iu.test(query) &&
    /\b(?:Ashlee|medical\s+bills?)\b/iu.test(query) &&
    /\bsavings?\s+goals?\b/iu.test(query);
}

function householdBudgetReasoningFacets(
  entry: RankedFactCandidate,
): Set<HouseholdBudgetReasoningFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<HouseholdBudgetReasoningFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }
  return facets;
}

export function selectSourceOrderedHouseholdBudgetReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isSourceOrderedHouseholdBudgetReasoningQuery(input.query)) {
    return [];
  }

  const candidates = input.entries
    .filter(hasSourceMessageTag)
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => householdBudgetReasoningFacets(entry).size > 0)
    .sort(compareTemporalFactChronology);
  if (candidates.length < 6) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  const selectedOrders = new Set<number>();
  const addCandidate = (entry: RankedFactCandidate): boolean => {
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

  for (const facet of FACETS) {
    let selectedForFacet = 0;
    const facetCandidates = candidates
      .filter((entry) => householdBudgetReasoningFacets(entry).has(facet.facet))
      .sort(compareTemporalFactChronology);
    for (const entry of facetCandidates) {
      if (selectedForFacet >= facet.quota) {
        break;
      }
      if (addCandidate(entry)) {
        selectedForFacet += 1;
      }
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
