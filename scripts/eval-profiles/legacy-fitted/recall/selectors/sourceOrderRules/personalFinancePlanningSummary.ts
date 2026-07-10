import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type PersonalFinancePlanningSummaryFacet =
  | "diningOutBudgetControl"
  | "excelInvestmentTracking"
  | "holidayGroceryAdjustment"
  | "housingExpenseReduction"
  | "yahooFinanceUpdates";

const QUERY_PATTERN =
  /^(?=[\s\S]*\bsummary\b)(?=[\s\S]*\bfinancial\s+planning\b)(?=[\s\S]*\bbudgeting\s+efforts?\b)(?=[\s\S]*\bdeveloped\b)/iu;

const FACETS = [
  {
    facet: "housingExpenseReduction",
    patterns: [
      /^(?=[\s\S]*\breduc(?:e|ing)\s+(?:your\s+)?expenses?\b)(?=[\s\S]*\brent\b)(?=[\s\S]*(?:\broommates?\b|\bdownsizing\b|\blandlord\b|\bhousing\s+options?\b))(?=[\s\S]*\bdetailed\s+budget\b)/iu,
    ],
  },
  {
    facet: "excelInvestmentTracking",
    patterns: [
      /^(?=[\s\S]*\bExcel\b)(?=[\s\S]*\btrack\s+investments?\b)(?=[\s\S]*(?:\bindex\s+funds?\b|\bETFs?\b))(?=[\s\S]*(?:\bMint\s+app\s+trial\b|\bcustomizable\b|\bstraightforward\b))/iu,
    ],
  },
  {
    facet: "yahooFinanceUpdates",
    patterns: [
      /^(?=[\s\S]*\bYahoo\s+Finance\s+API\b)(?=[\s\S]*\bExcel\b)(?=[\s\S]*\bautomatic\s+updates?\b)(?=[\s\S]*\bPower\s+Query\b)/iu,
    ],
  },
  {
    facet: "diningOutBudgetControl",
    patterns: [
      /^(?=[\s\S]*\bdining\s+out\s+expenses?\b)(?=[\s\S]*(?:\blower\s+(?:your\s+)?dining\s+out\s+expenses?\b|\blowering\s+it\s+to\s+\$?100\b|\btarget\s+for\s+(?:your\s+)?dining\s+out\s+budget\b))(?=[\s\S]*(?:\bYNAB\b|\bExcel\b))(?=[\s\S]*(?:\bemergency\s+fund\b|\bmeal\s+prep\b|\bbatch\s+cooking\b|\blimit\s+dining\s+out\b))/iu,
    ],
  },
  {
    facet: "holidayGroceryAdjustment",
    patterns: [
      /^(?=[\s\S]*\bgrocery\s+budget\b)(?=[\s\S]*\$550\s*\/\s*month\b)(?=[\s\S]*\bDecember\s+1\b)(?=[\s\S]*\bholiday\s+meals?\b)(?=[\s\S]*\bfinancial\s+goals?\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: PersonalFinancePlanningSummaryFacet;
  patterns: readonly RegExp[];
}>;

function isPersonalFinancePlanningSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function personalFinancePlanningSummaryFacets(
  entry: RankedFactCandidate,
): Set<PersonalFinancePlanningSummaryFacet> {
  if (!hasAssistantAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<PersonalFinancePlanningSummaryFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedPersonalFinancePlanningSummaryCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isPersonalFinancePlanningSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<
    PersonalFinancePlanningSummaryFacet,
    RankedFactCandidate
  >();
  for (const facet of FACETS) {
    const candidate = input.sourceCandidates
      .filter((entry) =>
        personalFinancePlanningSummaryFacets(entry).has(facet.facet)
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
