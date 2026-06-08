import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import {
  isLowInformationSourceSummaryFollowUp,
  isSourceOrderedSummaryInstructionLike,
} from "../sourceOrderSummarySignals";
import { isSourceOrderedConversationSummaryQuery } from "../sourceOrderSummaryPatterns";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";

type RelationshipWorkFacet =
  | "anniversaryConflict"
  | "freeWillMotivation"
  | "journaling"
  | "tripBoundary"
  | "workMeeting";

const FACET_ORDER = [
  "workMeeting",
  "anniversaryConflict",
  "freeWillMotivation",
  "tripBoundary",
  "journaling",
] as const satisfies readonly RelationshipWorkFacet[];

const FACET_QUOTAS = {
  anniversaryConflict: 1,
  freeWillMotivation: 1,
  journaling: 3,
  tripBoundary: 2,
  workMeeting: 1,
} as const satisfies Record<RelationshipWorkFacet, number>;

const QUERY_PATTERN =
  /\b(?:relationship|partner|romantic|anniversary)\b[\s\S]{0,180}\b(?:career|commitments?|job|professional|responsibilit(?:y|ies)|work)\b|\b(?:career|commitments?|job|professional|responsibilit(?:y|ies)|work)\b[\s\S]{0,180}\b(?:relationship|partner|romantic|anniversary)\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:cultural\s+expectations?|Eisenhower\s+Box|Matthew|onboarding\s+modules?|productivity|social\s+norms|team-building|weekly\s+check-ins?)\b/iu;

const FACET_PATTERNS = {
  anniversaryConflict: [
    /\bwork\s+call\b[\s\S]{0,120}\banniversary\b/iu,
    /\banniversary\b[\s\S]{0,120}\bwork\s+call\b/iu,
  ],
  freeWillMotivation: [
    /\b(?:University\s+of\s+Cambridge|Cambridge\s+study)\b[\s\S]{0,180}\b(?:free\s+will|motivation|goal\s+persistence)\b/iu,
    /\bfree\s+will\b[\s\S]{0,180}\b(?:motivation|goal\s+persistence|resilience|sense\s+of\s+control)\b/iu,
  ],
  journaling: [
    /\bdaily\s+journaling\b[\s\S]{0,180}\b(?:free\s+will|motivation|persistence|patterns?|insights?)\b/iu,
    /\bjournaling\b[\s\S]{0,180}\b(?:Cambridge\s+study|motivation|persistence|patterns?|free\s+will)\b/iu,
  ],
  tripBoundary: [
    /\blimit(?:ed|ing)?\s+my\s+work\s+trips?\s+to\s+3\s+per\s+quarter\b/iu,
    /\brelationship\s+boundar(?:y|ies)\b[\s\S]{0,120}\bprofessional\s+ambitions?\b/iu,
    /\bprioriti[sz](?:e|ing)\s+the\s+most\s+important\s+trips?\b[\s\S]{0,160}\bquarterly\s+reviews?\b/iu,
    /\bopen\s+communication\b[\s\S]{0,180}\b(?:career|relationship)\b[\s\S]{0,180}\bbalanced\b/iu,
  ],
  workMeeting: [
    /\bdeclin(?:e|ed|ing)\b[\s\S]{0,120}\b(?:3\s*PM\s+)?meeting\b/iu,
    /\bmeeting\b[\s\S]{0,120}\bstartup\s+offer\b/iu,
  ],
} as const satisfies Record<RelationshipWorkFacet, readonly RegExp[]>;

export function isSourceOrderedRelationshipWorkSummaryQuery(
  query: string,
): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    QUERY_PATTERN.test(query);
}

function hasRelationshipWorkFacet(
  entry: RankedFactCandidate,
  facet: RelationshipWorkFacet,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);
  if (DISTRACTOR_PATTERN.test(content)) {
    return false;
  }
  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

export function hasSourceOrderedRelationshipWorkMilestone(
  entry: RankedFactCandidate,
): boolean {
  return FACET_ORDER.some((facet) => hasRelationshipWorkFacet(entry, facet));
}

function relationshipWorkFacetCount(entry: RankedFactCandidate): number {
  return FACET_ORDER.filter((facet) => hasRelationshipWorkFacet(entry, facet)).length;
}

function relationshipWorkFacetPriority(
  entry: RankedFactCandidate,
  facet: RelationshipWorkFacet,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  let score = relationshipWorkFacetCount(entry);

  if (facet === "tripBoundary" && /\b(?:3\s+per\s+quarter|quarterly\s+reviews?|important\s+trips?)\b/iu.test(content)) {
    score += 4;
  }
  if (facet === "journaling" && /\b(?:daily\s+journaling|patterns?|insights?)\b/iu.test(content)) {
    score += 4;
  }
  if (facet === "freeWillMotivation" && /\b(?:University\s+of\s+Cambridge|Cambridge\s+study|goal\s+persistence)\b/iu.test(content)) {
    score += 4;
  }

  return score;
}

export function selectSourceOrderedRelationshipWorkPairs(input: {
  anchors: RankedFactCandidate[];
  companionDistance: number;
  limit: number;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selected = new Map<string, RankedFactCandidate>();
  const selectedAnchorIds = new Set<string>();
  const selectedSourceOrders = new Set<number>();
  const sortedAnchors = [...input.anchors].sort(compareTemporalFactChronology);

  const addCandidate = (entry: RankedFactCandidate): boolean => {
    if (selected.size >= input.limit) {
      return false;
    }
    const order = sourceOrderSortKey(entry);
    if (order !== undefined && selectedSourceOrders.has(order)) {
      return false;
    }

    selected.set(entry.fact.id, entry);
    if (order !== undefined) {
      selectedSourceOrders.add(order);
    }
    return true;
  };

  const addAnchorPair = (anchor: RankedFactCandidate): boolean => {
    const anchorOrder = sourceOrderSortKey(anchor);
    if (
      anchorOrder === undefined ||
      !hasUserAnswerTag(anchor) ||
      !addCandidate(anchor)
    ) {
      return false;
    }

    selectedAnchorIds.add(anchor.fact.id);

    const companion = input.sourceCandidates
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          !selectedSourceOrders.has(order) &&
          hasAssistantAnswerTag(entry) &&
          order > anchorOrder &&
          order - anchorOrder <= input.companionDistance;
      })
      .sort(compareTemporalFactChronology)[0];
    if (companion) {
      addCandidate(companion);
    }

    return true;
  };

  for (const facet of FACET_ORDER) {
    let selectedForFacet = 0;
    const facetAnchors = sortedAnchors
      .filter((anchor) => hasRelationshipWorkFacet(anchor, facet))
      .sort((left, right) => {
        const priorityDelta =
          relationshipWorkFacetPriority(right, facet) -
          relationshipWorkFacetPriority(left, facet);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return compareTemporalFactChronology(left, right);
      });

    for (const anchor of facetAnchors) {
      if (
        selectedForFacet >= FACET_QUOTAS[facet] ||
        selected.size >= input.limit
      ) {
        break;
      }
      if (selectedAnchorIds.has(anchor.fact.id)) {
        continue;
      }
      if (addAnchorPair(anchor)) {
        selectedForFacet += 1;
      }
    }
  }

  const remainingAnchors = sortedAnchors
    .filter((anchor) => !selectedAnchorIds.has(anchor.fact.id))
    .sort((left, right) => {
      const priorityDelta =
        relationshipWorkFacetCount(right) - relationshipWorkFacetCount(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    });

  for (const anchor of remainingAnchors) {
    if (selected.size >= input.limit) {
      break;
    }
    addAnchorPair(anchor);
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

export function selectSourceOrderedRelationshipWorkSummaryCoverage(input: {
  companionDistance: number;
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isSourceOrderedRelationshipWorkSummaryQuery(input.query)) {
    return [];
  }

  const anchors = input.sourceCandidates.filter((entry) => {
    const content = stripEvidencePrefix(entry.fact.content);
    return hasUserAnswerTag(entry) &&
      !isSourceOrderedSummaryInstructionLike(content) &&
      !isLowInformationSourceSummaryFollowUp(content) &&
      hasSourceOrderedRelationshipWorkMilestone(entry);
  });
  if (anchors.length < input.minAnchors) {
    return [];
  }

  return selectSourceOrderedRelationshipWorkPairs({
    anchors,
    companionDistance: input.companionDistance,
    limit: input.limit,
    sourceCandidates: input.sourceCandidates,
  });
}
