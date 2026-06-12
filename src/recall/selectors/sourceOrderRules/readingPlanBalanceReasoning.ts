import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { sourceOrderSortKey } from "../temporal";

type ReadingPlanBalanceReasoningFacet =
  | "sagaLengthConstraint"
  | "poppyWarChoice"
  | "poppyWarComparisonGuidance"
  | "poppyWarCommitment"
  | "poppyWarCommitmentGuidance"
  | "expanseConcern"
  | "expanseCommitmentGuidance"
  | "expanseFormatPlan"
  | "expanseFormatGuidance";

const READING_PLAN_BALANCE_REASONING_FACETS = [
  "sagaLengthConstraint",
  "poppyWarChoice",
  "poppyWarComparisonGuidance",
  "poppyWarCommitment",
  "poppyWarCommitmentGuidance",
  "expanseConcern",
  "expanseCommitmentGuidance",
  "expanseFormatPlan",
  "expanseFormatGuidance",
] as const satisfies readonly ReadingPlanBalanceReasoningFacet[];

export const isReadingPlanBalanceReasoningQuery = narrowGate(
  "reasoning.readingPlanBalance",
  (query: string): boolean => {
  return /\breading plan\b/iu.test(query) &&
    /\bshorter series\b/iu.test(query) &&
    /\blonger commitments\b/iu.test(query) &&
    /\btime constraints\b/iu.test(query) &&
    /\benjoyment goals\b/iu.test(query);
  },
);

const USER_FACET_PATTERNS = {
  sagaLengthConstraint: [
    /^(?=[\s\S]*\blong sagas\b)(?=[\s\S]*\bover 5 books\b)(?=[\s\S]*\btime constraints from my producer job\b)/iu,
  ],
  poppyWarChoice: [
    /^(?=[\s\S]*\bchose "The Poppy War" trilogy over "The Broken Earth")/iu,
  ],
  poppyWarCommitment: [
    /^(?=[\s\S]*\bstick with "The Poppy War" trilogy for now\b)(?=[\s\S]*\bcommunity feedback\b)/iu,
  ],
  expanseConcern: [
    /^(?=[\s\S]*\bstart "The Expanse" series\b)(?=[\s\S]*\bcommitting to 9 books\b)/iu,
  ],
  expanseFormatPlan: [
    /^(?=[\s\S]*\bdive into "The Expanse)(?=[\s\S]*\baudiobooks during my commutes with Douglas\b)/iu,
  ],
} as const satisfies Partial<
  Record<ReadingPlanBalanceReasoningFacet, readonly RegExp[]>
>;

const ASSISTANT_FACET_PATTERNS = {
  poppyWarComparisonGuidance: [
    /^(?=[\s\S]*\bDeciding between "The Poppy War" trilogy and "The Broken Earth" series\b)/iu,
  ],
  poppyWarCommitmentGuidance: [
    /^(?=[\s\S]*\bSticking with "The Poppy War" trilogy for now is a wise choice\b)/iu,
  ],
  expanseCommitmentGuidance: [
    /^(?=[\s\S]*\bsubstantial commitment with nine books\b)/iu,
  ],
  expanseFormatGuidance: [
    /^(?=[\s\S]*\bMixing print reading in the mornings with audiobooks during your commutes\b)/iu,
  ],
} as const satisfies Partial<
  Record<ReadingPlanBalanceReasoningFacet, readonly RegExp[]>
>;

function readingPlanBalanceReasoningFacet(
  entry: RankedFactCandidate,
): ReadingPlanBalanceReasoningFacet | undefined {
  const content = stripEvidencePrefix(entry.fact.content);

  if (hasUserAnswerTag(entry)) {
    for (const [facet, patterns] of Object.entries(USER_FACET_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(content))) {
        return facet as ReadingPlanBalanceReasoningFacet;
      }
    }
    return undefined;
  }

  if (!hasAssistantAnswerTag(entry)) {
    return undefined;
  }
  for (const [facet, patterns] of Object.entries(ASSISTANT_FACET_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(content))) {
      return facet as ReadingPlanBalanceReasoningFacet;
    }
  }
  return undefined;
}

export function selectSourceOrderedReadingPlanBalanceReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isReadingPlanBalanceReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    ReadingPlanBalanceReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: readingPlanBalanceReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: ReadingPlanBalanceReasoningFacet;
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
    READING_PLAN_BALANCE_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return READING_PLAN_BALANCE_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}
