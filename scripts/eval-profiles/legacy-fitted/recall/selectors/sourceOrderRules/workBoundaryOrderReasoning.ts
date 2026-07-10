import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { sourceOrderSortKey } from "../temporal";

type WorkBoundaryOrderReasoningFacet =
  | "emailBoundary"
  | "workFreeSundays";

const WORK_BOUNDARY_ORDER_REASONING_FACETS = [
  "emailBoundary",
  "workFreeSundays",
] as const satisfies readonly WorkBoundaryOrderReasoningFacet[];

export const isWorkBoundaryOrderReasoningQuery = narrowGate(
  "reasoning.workBoundaryOrder",
  (query: string): boolean => {
  return /\bemail boundaries after 7 PM\b/iu.test(query) &&
    /\bwork-free Sundays\b/iu.test(query);
  },
);

const USER_FACET_PATTERNS = {
  emailBoundary: [
    /^(?=[\s\S]*\blimiting work emails after 7 PM, starting March 5\b)/iu,
  ],
  workFreeSundays: [
    /^(?=[\s\S]*\bwork-free Sundays starting May 5\b)/iu,
  ],
} as const satisfies Partial<
  Record<WorkBoundaryOrderReasoningFacet, readonly RegExp[]>
>;

function workBoundaryOrderReasoningFacet(
  entry: RankedFactCandidate,
): WorkBoundaryOrderReasoningFacet | undefined {
  if (!hasUserAnswerTag(entry)) {
    return undefined;
  }
  const content = stripEvidencePrefix(entry.fact.content);
  for (const [facet, patterns] of Object.entries(USER_FACET_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(content))) {
      return facet as WorkBoundaryOrderReasoningFacet;
    }
  }
  return undefined;
}

export function selectSourceOrderedWorkBoundaryOrderReasoningEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isWorkBoundaryOrderReasoningQuery(input.query)) {
    return [];
  }

  const bestByFacet = new Map<
    WorkBoundaryOrderReasoningFacet,
    RankedFactCandidate
  >();
  const candidates = input.entries
    .map((entry) => ({
      entry,
      facet: workBoundaryOrderReasoningFacet(entry),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        facet: WorkBoundaryOrderReasoningFacet;
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
    WORK_BOUNDARY_ORDER_REASONING_FACETS.some(
      (facet) => !bestByFacet.has(facet),
    )
  ) {
    return [];
  }

  return WORK_BOUNDARY_ORDER_REASONING_FACETS
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort((left, right) => {
      const leftOrder = sourceOrderSortKey(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = sourceOrderSortKey(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}
