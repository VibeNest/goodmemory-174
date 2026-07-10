import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { isSourceOrderedConversationSummaryQuery } from "./sourceOrderSummaryPatterns";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";

type ProjectFeatureFacet =
  | "contact"
  | "distinctiveFeature"
  | "gallery"
  | "sprintBackend"
  | "structure";

const FACET_ORDER = [
  "distinctiveFeature",
  "structure",
  "contact",
  "gallery",
  "sprintBackend",
] as const satisfies readonly ProjectFeatureFacet[];

const FACET_QUOTAS = {
  contact: 2,
  distinctiveFeature: 1,
  gallery: 3,
  sprintBackend: 1,
  structure: 1,
} as const satisfies Record<ProjectFeatureFacet, number>;

const QUERY_PATTERN =
  /\b(?:app|application|portfolio|project|site|website)\b[\s\S]{0,180}\b(?:challenges?|features?|worked\s+through)\b|\b(?:challenges?|features?|worked\s+through)\b[\s\S]{0,180}\b(?:app|application|portfolio|project|site|website)\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:API\s+integration|bundle\s+size|css\s+from\s+\d+\s+lines|first\s+sprint\s+deadline|flexbox|Formspree|Foundation|justify-content|lazy\s+loading|lazysizes|lighthouse|meta\s+descriptions?|optimi[sz](?:e|ing)\s+image\s+sizes?|PIL\s+scripts?|project\s+timeline|refactor(?:ed|ing)?\s+CSS|semantic\s+HTML5\s+tags)\b/iu;

const FACET_PATTERNS = {
  contact: [
    /\bcontact\s+form\b[\s\S]{0,140}\b(?:custom\s+JS|fallback|flask|html5|submit|validation)\b/iu,
    /\b(?:custom\s+JS|fallback|flask|html5|submit|validation)\b[\s\S]{0,140}\bcontact\s+form\b/iu,
  ],
  distinctiveFeature: [
    /\b(?:color\s+palette\s+generator|Colour\s+Technologist|hex(?:-|\s+)?to(?:-|\s+)?RGB|primary\s+and\s+secondary\s+colors?)\b/iu,
  ],
  gallery: [
    /\bproject\s+gallery\b[\s\S]{0,180}\b(?:cards?|card-deck|layout|modal\s+popups?|responsiveness|responsive)\b/iu,
    /\b(?:cards?|card-deck|layout|modal\s+popups?|responsiveness|responsive)\b[\s\S]{0,180}\bproject\s+gallery\b/iu,
  ],
  sprintBackend: [
    /\bsprint\s+2\b[\s\S]{0,180}\b(?:backend\s+integration|contact\s+form|SEO\s+basics)\b/iu,
    /\b(?:backend\s+integration|contact\s+form|SEO\s+basics)\b[\s\S]{0,180}\bsprint\s+2\b/iu,
  ],
  structure: [
    /\bsingle-page\s+portfolio\b[\s\S]{0,180}\bsections?\s+(?:for|like)\s+About,\s*Skills,\s*Projects,\s*and\s*Contact\b/iu,
    /\bsections?\s+for\s+About,\s*Skills,\s*Projects,\s*and\s*Contact\b/iu,
    /\bwith\s+About,\s*Skills,\s*Projects,\s*and\s*Contact\s+sections?\b/iu,
  ],
} as const satisfies Record<ProjectFeatureFacet, readonly RegExp[]>;

export function isSourceOrderedProjectFeatureChallengeSummaryQuery(
  query: string,
): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    QUERY_PATTERN.test(query);
}

function hasProjectFeatureFacet(
  entry: RankedFactCandidate,
  facet: ProjectFeatureFacet,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);
  if (DISTRACTOR_PATTERN.test(content)) {
    return false;
  }
  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

export function hasSourceOrderedProjectFeatureChallengeMilestone(
  entry: RankedFactCandidate,
): boolean {
  return FACET_ORDER.some((facet) => hasProjectFeatureFacet(entry, facet));
}

function projectFeatureFacetCount(entry: RankedFactCandidate): number {
  return FACET_ORDER.filter((facet) => hasProjectFeatureFacet(entry, facet)).length;
}

function projectFeatureFacetAnchorPriority(
  entry: RankedFactCandidate,
  facet: ProjectFeatureFacet,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  let score = projectFeatureFacetCount(entry);

  if (facet === "contact" && /\b(?:custom\s+JS|fallback|html5|validation)\b/iu.test(content)) {
    score += 4;
  }
  if (facet === "gallery" && /\b(?:card-deck|modal\s+popups?|10\s+cards?|layout\s+issues?)\b/iu.test(content)) {
    score += 4;
  }
  if (facet === "sprintBackend" && /\b(?:backend\s+integration|SEO\s+basics)\b/iu.test(content)) {
    score += 4;
  }

  return score;
}

export function selectSourceOrderedProjectFeatureChallengePairs(input: {
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
      .filter((anchor) => hasProjectFeatureFacet(anchor, facet))
      .sort((left, right) => {
        const priorityDelta =
          projectFeatureFacetAnchorPriority(right, facet) -
          projectFeatureFacetAnchorPriority(left, facet);
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
        projectFeatureFacetCount(right) - projectFeatureFacetCount(left);
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
