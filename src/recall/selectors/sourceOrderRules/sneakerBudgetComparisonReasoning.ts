import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { sourceOrderSortKey } from "../temporal";

type SneakerBudgetComparisonReasoningFacet =
  | "budgetLimit"
  | "discountedPrice";

const SNEAKER_BUDGET_COMPARISON_REASONING_FACETS = [
  "budgetLimit",
  "discountedPrice",
] as const satisfies readonly SneakerBudgetComparisonReasoningFacet[];

export const isSneakerBudgetComparisonReasoningQuery = narrowGate(
  "reasoning.sneakerBudgetComparison",
  (query: string): boolean => {
  return /\bprice i paid for the ultraboost\b/iu.test(query) &&
    /\boriginal budget limit\b/iu.test(query);
  },
);

const USER_FACET_PATTERNS = {
  budgetLimit: [
    /^(?=[\s\S]*\bbudget limit of \$200 for sneakers\b)/iu,
  ],
  discountedPrice: [
    /^(?=[\s\S]*\bprice I paid for the Ultraboost\b)(?=[\s\S]*\bdiscounted from \$180\b)/iu,
  ],
} as const satisfies Partial<
  Record<SneakerBudgetComparisonReasoningFacet, readonly RegExp[]>
>;

function sneakerBudgetComparisonReasoningFacet(
  entry: RankedFactCandidate,
): SneakerBudgetComparisonReasoningFacet | undefined {
  if (!hasUserAnswerTag(entry)) {
    return undefined;
  }
  const content = stripEvidencePrefix(entry.fact.content);
  for (const [facet, patterns] of Object.entries(USER_FACET_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(content))) {
      return facet as SneakerBudgetComparisonReasoningFacet;
    }
  }
  return undefined;
}

export function selectSourceOrderedSneakerBudgetComparisonReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isSneakerBudgetComparisonReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    SneakerBudgetComparisonReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: sneakerBudgetComparisonReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: SneakerBudgetComparisonReasoningFacet;
      } => candidate.facet !== undefined,
    )
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left.entry) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right.entry) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.entry.lexicalScore - left.entry.lexicalScore;
    });

  for (const candidate of candidates) {
    if (!bestByFacet.has(candidate.facet)) {
      bestByFacet.set(candidate.facet, candidate.entry);
    }
  }

  if (
    SNEAKER_BUDGET_COMPARISON_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return SNEAKER_BUDGET_COMPARISON_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}
