import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { isSourceOrderedConversationSummaryQuery } from "./sourceOrderSummaryPatterns";
import {
  isLowInformationSourceSummaryFollowUp,
  isSourceOrderedSummaryInstructionLike,
} from "./sourceOrderSummarySignals";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";

type ProbabilityConceptFacet =
  | "birthdayApproximation"
  | "conditionalAces"
  | "directComplement"
  | "mutualExclusivity"
  | "permutationBirthday"
  | "ruleComplement";

const FACETS = [
  {
    facet: "permutationBirthday",
    quota: 2,
    patterns: [
      /\b(?:permutations?|combinations?)\b[\s\S]{0,180}\b(?:birthday[-\s]+paradox|P\(4,\s*2\))\b/iu,
      /\b(?:birthday[-\s]+paradox|P\(4,\s*2\))\b[\s\S]{0,180}\b(?:permutations?|combinations?)\b/iu,
    ],
  },
  {
    facet: "birthdayApproximation",
    quota: 1,
    patterns: [
      /\bbirthday[-\s]+paradox\b[\s\S]{0,180}\b(?:23|0\.507|share\s+a\s+birthday|shared\s+birthday)\b/iu,
      /\b(?:23|0\.507|share\s+a\s+birthday|shared\s+birthday)\b[\s\S]{0,180}\bbirthday[-\s]+paradox\b/iu,
    ],
  },
  {
    facet: "conditionalAces",
    quota: 1,
    patterns: [
      /\bconditional\s+probability\b[\s\S]{0,220}\b(?:drawing\s+2\s+aces|drawing\s+two\s+aces|2\s+aces\s+in\s+a\s+row|two\s+aces\s+in\s+a\s+row|P\(A_?2\s*\|\s*A_?1\))\b/iu,
      /\b(?:drawing\s+2\s+aces|drawing\s+two\s+aces|2\s+aces\s+in\s+a\s+row|two\s+aces\s+in\s+a\s+row|P\(A_?2\s*\|\s*A_?1\))\b[\s\S]{0,220}\bconditional\s+probability\b/iu,
    ],
  },
  {
    facet: "ruleComplement",
    quota: 3,
    patterns: [
      /\bcomplement\s+rule\b[\s\S]{0,220}\b(?:at\s+least\s+one|shared\s+birthday|birthdays?\s+are\s+different|dice\s+rolls?|coin\s+tosses?|ace|card\s+draws?)\b/iu,
      /\b(?:at\s+least\s+one|shared\s+birthday|birthdays?\s+are\s+different|dice\s+rolls?|coin\s+tosses?|ace|card\s+draws?)\b[\s\S]{0,220}\bcomplement\s+rule\b/iu,
      /\bat\s+least\s+one\s+ace\b[\s\S]{0,180}\b(?:no\s+aces|subtract(?:ing)?\s+from\s+1|two\s+card\s+draws?|two\s+draws\s+without\s+replacement)\b/iu,
    ],
  },
  {
    facet: "directComplement",
    quota: 1,
    patterns: [
      /\bbirthday[-\s]+paradox\b[\s\S]{0,180}\bdirect\s+counting\b[\s\S]{0,120}\bcomplement\s+method\b/iu,
      /\bdirect\s+counting\b[\s\S]{0,160}\bcomplement\s+method\b[\s\S]{0,160}\bbirthday[-\s]+paradox\b/iu,
    ],
  },
  {
    facet: "mutualExclusivity",
    quota: 2,
    patterns: [
      /\bbirthday[-\s]+paradox\b[\s\S]{0,200}\b(?:not\s+mutually\s+exclusive|mutual\s+exclusivity|overlaps?)\b/iu,
      /\b(?:not\s+mutually\s+exclusive|mutual\s+exclusivity|overlaps?)\b[\s\S]{0,200}\bbirthday[-\s]+paradox\b/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: ProbabilityConceptFacet;
  patterns: readonly RegExp[];
  quota: number;
}>;

const QUERY_PATTERN =
  /\bprobability\s+concepts?\b[\s\S]{0,180}\b(?:understanding|approach|develop(?:ed|ing)?|throughout)\b|\b(?:understanding|approach|develop(?:ed|ing)?|throughout)\b[\s\S]{0,180}\bprobability\s+concepts?\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:colour\s+technologist|color\s+technologist|paint-can|paint\s+can|quality\s+control|probability\s+as\s+a\s+ratio|favo(?:u)?rable\s+outcomes?\s+(?:over|divided\s+by)\s+total\s+outcomes?|heads\s+is\s+one|starting\s+from\s+scratch)\b/iu;

export function isSourceOrderedProbabilityConceptSummaryQuery(
  query: string,
): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    QUERY_PATTERN.test(query);
}

function probabilityConceptFacets(
  entry: RankedFactCandidate,
): Set<ProbabilityConceptFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (
    DISTRACTOR_PATTERN.test(content) ||
    isSourceOrderedSummaryInstructionLike(content) ||
    isLowInformationSourceSummaryFollowUp(content)
  ) {
    return new Set();
  }

  const facets = new Set<ProbabilityConceptFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

function isValidFacetRole(
  entry: RankedFactCandidate,
  facet: ProbabilityConceptFacet,
): boolean {
  if (facet === "birthdayApproximation" || facet === "directComplement") {
    return hasUserAnswerTag(entry);
  }
  if (facet === "conditionalAces" || facet === "ruleComplement") {
    return hasAssistantAnswerTag(entry);
  }
  return hasUserAnswerTag(entry) || hasAssistantAnswerTag(entry);
}

export function selectSourceOrderedProbabilityConceptSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isSourceOrderedProbabilityConceptSummaryQuery(input.query)) {
    return [];
  }

  const candidates = input.sourceCandidates.filter((entry) =>
    probabilityConceptFacets(entry).size > 0
  );
  if (candidates.length < input.minAnchors) {
    return [];
  }
  const progressionStartOrders = candidates
    .filter((entry) => probabilityConceptFacets(entry).has("permutationBirthday"))
    .map(sourceOrderSortKey)
    .filter((order): order is number => order !== undefined);
  const progressionStartOrder = Math.min(...progressionStartOrders);
  if (!Number.isFinite(progressionStartOrder)) {
    return [];
  }
  const progressionCandidates = candidates.filter((entry) => {
    const order = sourceOrderSortKey(entry);
    return order === undefined || order >= progressionStartOrder;
  });
  if (progressionCandidates.length < input.minAnchors) {
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

  for (const facet of FACETS) {
    let selectedForFacet = 0;
    const facetCandidates = progressionCandidates
      .filter((entry) =>
        probabilityConceptFacets(entry).has(facet.facet) &&
        isValidFacetRole(entry, facet.facet)
      )
      .sort(compareTemporalFactChronology);
    for (const entry of facetCandidates) {
      if (selectedForFacet >= facet.quota || selected.size >= input.limit) {
        break;
      }
      if (addCandidate(entry)) {
        selectedForFacet += 1;
      }
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
