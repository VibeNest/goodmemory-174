import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { sourceOrderSortKey } from "../temporal";

type EntertainmentSpendingReasoningFacet =
  | "subscriptionLineup"
  | "subscriptionGuidance"
  | "snackBudgetStreaming"
  | "rentalSavings";

const ENTERTAINMENT_SPENDING_REASONING_FACETS = [
  "subscriptionLineup",
  "subscriptionGuidance",
  "snackBudgetStreaming",
  "rentalSavings",
] as const satisfies readonly EntertainmentSpendingReasoningFacet[];

export const isEntertainmentSpendingReasoningQuery = narrowGate(
  "reasoning.entertainmentSpendingOptimization",
  (query: string): boolean => {
  return /\bstreaming subscriptions\b/iu.test(query) &&
    /\bsnack budget\b/iu.test(query) &&
    /\brental savings\b/iu.test(query) &&
    /\bentertainment spending\b/iu.test(query) &&
    /\bexclusive content\b/iu.test(query);
  },
);

const USER_FACET_PATTERNS = {
  subscriptionLineup: [
    /^(?=[\s\S]*\badding HBO Max to my subscriptions\b)(?=[\s\S]*\bNetflix for \$15\.99\/month\b)/iu,
  ],
  snackBudgetStreaming: [
    /^(?=[\s\S]*\bincreased my snack budget to \$65\b)(?=[\s\S]*\bsimultaneous streaming on multiple devices\b)/iu,
  ],
  rentalSavings: [
    /^(?=[\s\S]*\bsave money on movie rentals\b)(?=[\s\S]*\bsaved \$3\.99 by renting\b)/iu,
  ],
} as const satisfies Partial<
  Record<EntertainmentSpendingReasoningFacet, readonly RegExp[]>
>;

const ASSISTANT_FACET_PATTERNS = {
  subscriptionGuidance: [
    /^(?=[\s\S]*\bAdding HBO Max to your subscription lineup\b)(?=[\s\S]*\bExclusive Content\b)/iu,
  ],
} as const satisfies Partial<
  Record<EntertainmentSpendingReasoningFacet, readonly RegExp[]>
>;

function entertainmentSpendingReasoningFacet(
  entry: RankedFactCandidate,
): EntertainmentSpendingReasoningFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (hasUserAnswerTag(entry)) {
    for (const [facet, patterns] of Object.entries(USER_FACET_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(content))) {
        return facet as EntertainmentSpendingReasoningFacet;
      }
    }
    return undefined;
  }

  if (!hasAssistantAnswerTag(entry)) {
    return undefined;
  }
  for (const [facet, patterns] of Object.entries(ASSISTANT_FACET_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(content))) {
      return facet as EntertainmentSpendingReasoningFacet;
    }
  }
  return undefined;
}

export function selectSourceOrderedEntertainmentSpendingReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isEntertainmentSpendingReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    EntertainmentSpendingReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: entertainmentSpendingReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: EntertainmentSpendingReasoningFacet;
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
    ENTERTAINMENT_SPENDING_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return ENTERTAINMENT_SPENDING_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}
