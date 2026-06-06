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

type BasicProbabilityUnderstandingFacet =
  | "conditionalProbabilityFormula"
  | "evenDieRatio"
  | "independentMutuallyExclusive"
  | "mutuallyExclusiveDie"
  | "probabilityRatio"
  | "twoCoinIndependence";

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

const BASIC_UNDERSTANDING_FACETS = [
  {
    facet: "probabilityRatio",
    quota: 3,
    patterns: [
      /\bprobability\s+as\s+a\s+ratio\b[\s\S]{0,220}\b(?:coin\s+toss(?:es)?|dice\s+rolls?|heads|favo(?:u)?rable\s+outcomes?|total\s+outcomes?)\b/iu,
      /\b(?:coin\s+toss(?:es)?|dice\s+rolls?|heads|favo(?:u)?rable\s+outcomes?|total\s+outcomes?)\b[\s\S]{0,220}\bprobability\s+as\s+a\s+ratio\b/iu,
      /\bfavo(?:u)?rable\s+outcomes?\b[\s\S]{0,120}\btotal\s+outcomes?\b[\s\S]{0,160}\b(?:heads|coin\s+toss(?:es)?|dice\s+rolls?|rolling\s+a\s+4)\b/iu,
    ],
  },
  {
    facet: "evenDieRatio",
    quota: 1,
    patterns: [
      /\brolling\s+an\s+even\s+number\b[\s\S]{0,520}\b(?:six-sided|6-sided|die|dice)\b[\s\S]{0,520}\b(?:3\/6|1\/2|three\s+favo(?:u)?rable)\b/iu,
      /\b(?:3\/6|1\/2|three\s+favo(?:u)?rable)\b[\s\S]{0,180}\brolling\s+an\s+even\s+number\b/iu,
      /\brolling\s+an\s+even\s+number\b[\s\S]{0,640}\bthree\s+favo(?:u)?rable\s+outcomes?\b[\s\S]{0,220}\b(?:1\/2|one[-\s]?half)\b/iu,
      /\brolling\s+an\s+even\s+number\b[\s\S]{0,720}\b(?:3\s+favo(?:u)?rable\s+outcomes?|\\frac\{3\}\{6\}|\\frac\{1\}\{2\})\b/iu,
    ],
  },
  {
    facet: "independentMutuallyExclusive",
    quota: 1,
    patterns: [
      /\bindependent\b[\s\S]{0,120}\bmutually\s+exclusive\b[\s\S]{0,220}\b(?:coin\s+toss(?:es)?|dice\s+rolls?|probability\s+calculations?)\b/iu,
      /\b(?:coin\s+toss(?:es)?|dice\s+rolls?)\b[\s\S]{0,180}\bindependent\b[\s\S]{0,120}\bmutually\s+exclusive\b/iu,
    ],
  },
  {
    facet: "twoCoinIndependence",
    quota: 1,
    patterns: [
      /\btossing\s+two\s+coins?\b[\s\S]{0,520}\bindependent\b[\s\S]{0,520}\b(?:both\s+heads|1\/2\s*x\s*1\/2|1\/4)\b/iu,
      /\b(?:both\s+heads|1\/2\s*x\s*1\/2|1\/4)\b[\s\S]{0,180}\btossing\s+two\s+coins?\b[\s\S]{0,120}\bindependent\b/iu,
      /\b(?:both\s+heads|1\/2\s*x\s*1\/2|1\/4)\b[\s\S]{0,180}\btwo\s+independent\s+coin\s+tosses?\b/iu,
    ],
  },
  {
    facet: "mutuallyExclusiveDie",
    quota: 1,
    patterns: [
      /\brolling\s+a\s+2\b[\s\S]{0,160}\brolling\s+a\s+5\b[\s\S]{0,180}\bmutually\s+exclusive\b/iu,
      /\bmutually\s+exclusive\b[\s\S]{0,220}\brolling\s+a\s+2\b[\s\S]{0,160}\brolling\s+a\s+5\b/iu,
    ],
  },
  {
    facet: "conditionalProbabilityFormula",
    quota: 2,
    patterns: [
      /\bconditional\s+probability\b[\s\S]{0,120}\bP\(A\|B\)[\s\S]{0,260}\b(?:coin\s+toss(?:es)?|dice\s+rolls?|cards?|spade|face\s+card)\b/iu,
      /\bP\(A\|B\)[\s\S]{0,180}\bconditional\s+probability\b[\s\S]{0,220}\b(?:coin\s+toss(?:es)?|dice\s+rolls?|cards?|spade|face\s+card)\b/iu,
      /\bface\s+card\b[\s\S]{0,120}\bspade\b[\s\S]{0,220}\b(?:conditional\s+probability|P\(A\|B\)|3\/13)\b/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: BasicProbabilityUnderstandingFacet;
  patterns: readonly RegExp[];
  quota: number;
}>;

const QUERY_PATTERN =
  /\bprobability\s+concepts?\b[\s\S]{0,180}\b(?:understanding|approach|develop(?:ed|ing)?|throughout)\b|\b(?:understanding|approach|develop(?:ed|ing)?|throughout)\b[\s\S]{0,180}\bprobability\s+concepts?\b/iu;

const BASIC_UNDERSTANDING_QUERY_PATTERN =
  /^(?=[\s\S]*\bsummary|[\s\S]*\bsummarize)(?=[\s\S]*\bunderstanding\b)(?=[\s\S]*\bprobability\b)(?=[\s\S]*\bdevelop(?:ed|ing)?\b)(?![\s\S]*\bprobability\s+concepts?\b)/iu;

const DISTRACTOR_PATTERN =
  /\b(?:colour\s+technologist|color\s+technologist|paint-can|paint\s+can|quality\s+control|probability\s+as\s+a\s+ratio|favo(?:u)?rable\s+outcomes?\s+(?:over|divided\s+by)\s+total\s+outcomes?|heads\s+is\s+one|starting\s+from\s+scratch)\b/iu;

export function isSourceOrderedProbabilityConceptSummaryQuery(
  query: string,
): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    (QUERY_PATTERN.test(query) || BASIC_UNDERSTANDING_QUERY_PATTERN.test(query));
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

function basicProbabilityUnderstandingFacets(
  entry: RankedFactCandidate,
): Set<BasicProbabilityUnderstandingFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (
    isSourceOrderedSummaryInstructionLike(content) ||
    isLowInformationSourceSummaryFollowUp(content)
  ) {
    return new Set();
  }

  const facets = new Set<BasicProbabilityUnderstandingFacet>();
  for (const facet of BASIC_UNDERSTANDING_FACETS) {
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

function isValidBasicProbabilityUnderstandingRole(
  entry: RankedFactCandidate,
  facet: BasicProbabilityUnderstandingFacet,
): boolean {
  if (facet === "probabilityRatio") {
    return hasUserAnswerTag(entry) || hasAssistantAnswerTag(entry);
  }
  return hasAssistantAnswerTag(entry);
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

  if (BASIC_UNDERSTANDING_QUERY_PATTERN.test(input.query)) {
    const basicSelection = selectBasicProbabilityUnderstandingCoverage(input);
    if (basicSelection.length > 0) {
      return basicSelection;
    }
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

function selectBasicProbabilityUnderstandingCoverage(input: {
  limit: number;
  minAnchors: number;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const candidates = input.sourceCandidates.filter((entry) =>
    basicProbabilityUnderstandingFacets(entry).size > 0
  );
  if (candidates.length < input.minAnchors) {
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

  for (const facet of BASIC_UNDERSTANDING_FACETS) {
    let selectedForFacet = 0;
    let selectedUserForFacet = 0;
    const facetCandidates = candidates
      .filter((entry) =>
        basicProbabilityUnderstandingFacets(entry).has(facet.facet) &&
        isValidBasicProbabilityUnderstandingRole(entry, facet.facet)
      )
      .sort(compareTemporalFactChronology);
    for (const entry of facetCandidates) {
      if (selectedForFacet >= facet.quota || selected.size >= input.limit) {
        break;
      }
      if (
        facet.facet === "probabilityRatio" &&
        hasUserAnswerTag(entry) &&
        selectedUserForFacet >= 1
      ) {
        continue;
      }
      if (addCandidate(entry)) {
        selectedForFacet += 1;
        if (hasUserAnswerTag(entry)) {
          selectedUserForFacet += 1;
        }
      }
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
