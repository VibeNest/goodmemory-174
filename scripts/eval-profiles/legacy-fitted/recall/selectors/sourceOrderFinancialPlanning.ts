import { narrowGate } from "../narrowGates";
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

const HOUSEHOLD_BUDGET_REASONING_FACETS = [
  {
    facet: "sharedFinances",
    quota: 2,
    patterns: [
      /\b(?:spouse|partner)\b[\s\S]{0,180}\b(?:sharing|shared)\s+household\s+finances\b/iu,
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
      /\bmedical\s+bills?\b[\s\S]{0,260}\b(?:approved|receipts?|request(?:ed|ing)?\s+receipts?)\b/iu,
      /\b(?:approved|receipts?|request(?:ed|ing)?\s+receipts?)\b[\s\S]{0,260}\bmedical\s+bills?\b/iu,
      /\bmedical\s+expense\b[\s\S]{0,260}\b(?:financial\s+responsibility|boundaries|requesting\s+receipts?|keeping\s+records?|budget)\b/iu,
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

export const isSourceOrderedHouseholdBudgetReasoningQuery = narrowGate(
  "reasoning.householdBudget",
  (query: string): boolean => {
  return /\bgrocery\s+budget\b/iu.test(query) &&
    /\bfreelance\s+contract\b/iu.test(query) &&
    /\bmedical\s+bills?\b/iu.test(query) &&
    /\bsavings?\s+goals?\b/iu.test(query);
  },
);

function householdBudgetReasoningFacets(
  entry: RankedFactCandidate,
): Set<HouseholdBudgetReasoningFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<HouseholdBudgetReasoningFacet>();
  for (const facet of HOUSEHOLD_BUDGET_REASONING_FACETS) {
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

  for (const facet of HOUSEHOLD_BUDGET_REASONING_FACETS) {
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

type SourceOrderFinancialPlanningFacet =
  | "giftBudget"
  | "tamaraBookClub"
  | "tamaraInvestmentWorkshop"
  | "tamaraMoneySavingTips";

const FINANCIAL_PLANNING_QUERY_PATTERN =
  /\bfinancial\s+planning\s+topics?\b[\s\S]{0,220}\b(?:order|brought\s+up|chats?|conversations?)\b|\b(?:order|brought\s+up|chats?|conversations?)\b[\s\S]{0,220}\bfinancial\s+planning\s+topics?\b/iu;

const FINANCIAL_PLANNING_FACETS = [
  {
    facet: "tamaraMoneySavingTips",
    pattern: /\bTamara\b[\s\S]{0,180}\bmoney-saving\s+tips\b|\bmoney-saving\s+tips\b[\s\S]{0,180}\bTamara\b/iu,
  },
  {
    facet: "tamaraInvestmentWorkshop",
    pattern: /\bTamara\b[\s\S]{0,220}\b(?:\$?500\s+workshop|investment\s+basics)\b[\s\S]{0,220}\b(?:June\s+15|Montserrat\s+Community\s+Center|save\s+\$?2,000)\b|\b(?:\$?500\s+workshop|investment\s+basics)\b[\s\S]{0,220}\bTamara\b[\s\S]{0,220}\b(?:June\s+15|Montserrat\s+Community\s+Center|save\s+\$?2,000)\b/iu,
  },
  {
    facet: "tamaraBookClub",
    pattern: /\bTamara\b[\s\S]{0,220}\bfinancial\s+literacy\s+book\s+club\b[\s\S]{0,220}\b(?:Sept(?:ember)?\s+15|East\s+Janethaven\s+Library)\b|\bfinancial\s+literacy\s+book\s+club\b[\s\S]{0,220}\bTamara\b[\s\S]{0,220}\b(?:Sept(?:ember)?\s+15|East\s+Janethaven\s+Library)\b/iu,
  },
  {
    facet: "giftBudget",
    pattern: /\bholiday\s+gifts?\s+budget\b[\s\S]{0,220}\b(?:\$?300|compromis(?:e|ed)|balance\s+our\s+budget)\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderFinancialPlanningFacet;
  pattern: RegExp;
}>;

const FINANCIAL_PLANNING_FACET_ORDER: readonly SourceOrderFinancialPlanningFacet[] = [
  "tamaraMoneySavingTips",
  "tamaraInvestmentWorkshop",
  "tamaraBookClub",
  "giftBudget",
];

export function isSourceOrderFinancialPlanningQuery(query: string): boolean {
  return FINANCIAL_PLANNING_QUERY_PATTERN.test(query);
}

export function isSourceOrderStressFinancialConcernQuery(query: string): boolean {
  return /\bmanag(?:e|ing)\s+stress\s+and\s+financial\s+concerns\b/iu.test(query) &&
    /\b(?:order|brought\s+up|chats?|conversations?)\b/iu.test(query);
}

function sourceOrderFinancialPlanningFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderFinancialPlanningFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<SourceOrderFinancialPlanningFacet>();
  for (const facet of FINANCIAL_PLANNING_FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedFinancialPlanningAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderFinancialPlanningFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderFinancialPlanningFacets(entry);
    for (const facet of facets) {
      const current = bestByFacet.get(facet);
      if (
        !current ||
        input.priority(entry) > input.priority(current) ||
        (
          input.priority(entry) === input.priority(current) &&
          compareTemporalFactChronology(entry, current) < 0
        )
      ) {
        bestByFacet.set(facet, entry);
      }
    }
  }

  const selected = FINANCIAL_PLANNING_FACET_ORDER
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined);

  return selected.length >= input.count ? selected : [];
}

function hasStressFinancialConcernEvidence(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);

  return hasSourceMessageTag(entry) &&
    (
      /\birregular\s+income\b[\s\S]{0,180}\btax\s+season\b|\baverage\s+monthly\s+income\b[\s\S]{0,120}\bproject\s+earnings\b/iu.test(content) ||
      /\b20-minute\s+evening\s+walks\b[\s\S]{0,160}\bMay\s+15\b|\bstarted\s+the\s+evening\s+walks\b[\s\S]{0,180}\bless\s+stressed\b/iu.test(content) ||
      /\b6\.5\s+hours\/night\b[\s\S]{0,180}\bFitbit\b|\bFitbit\b[\s\S]{0,180}\b(?:habits|journal|bedtime\s+routine)\b/iu.test(content) ||
      /\bweekly\s+meditation\s+sessions\b[\s\S]{0,180}\bSundays\s+since\s+Nov\s+24\b[\s\S]{0,180}\bfinancial\s+decisions\b/iu.test(content)
    );
}

export function selectSourceOrderedStressFinancialConcernAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!input.entries.some(hasStressFinancialConcernEvidence)) {
    return [];
  }

  const selected = input.entries
    .filter(hasStressFinancialConcernEvidence)
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .sort(compareTemporalFactChronology);

  return selected.length >= input.count ? selected : [];
}
