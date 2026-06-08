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
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";

type ProfessionalPreparationSummaryFacet =
  | "coverLetterFormat"
  | "employeeHandbook"
  | "mentorNetworking"
  | "storytellingInterview"
  | "workshopPresentation";

const FACET_ORDER = [
  "mentorNetworking",
  "coverLetterFormat",
  "storytellingInterview",
  "employeeHandbook",
  "workshopPresentation",
] as const satisfies readonly ProfessionalPreparationSummaryFacet[];

const QUERY_PATTERN =
  /\b(?:preparations?|prepared|plans?)\b[\s\S]{0,180}\b(?:opportunities|challenges|developed|upcoming)\b|\b(?:opportunities|challenges|developed|upcoming)\b[\s\S]{0,180}\b(?:preparations?|prepared|plans?)\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:call-to-action|calendar|cover\s+letter\s+draft|follow-up\s+questions?|mindfulness\s+routine|mock\s+sessions?|next\s+steps?|senior\s+producer|travel\s+logistics|Zoom\s+call)\b/iu;

const FACET_PATTERNS = {
  coverLetterFormat: [
    /\bsingle-column\s+format\b[\s\S]{0,180}\b(?:bold\s+headers?|mobile\s+reading)\b/iu,
    /\b(?:bold\s+headers?|mobile\s+reading)\b[\s\S]{0,180}\bsingle-column\s+format\b/iu,
  ],
  employeeHandbook: [
    /\bemployee\s+handbook\b[\s\S]{0,220}\b(?:May\s+25|email|review(?:ing)?|accept(?:ing)?\s+(?:the\s+)?(?:job\s+)?offer)\b/iu,
    /\b(?:May\s+25|email|review(?:ing)?|accept(?:ing)?\s+(?:the\s+)?(?:job\s+)?offer)\b[\s\S]{0,220}\bemployee\s+handbook\b/iu,
  ],
  mentorNetworking: [
    /\b(?:Leslie|mentor)\b[\s\S]{0,180}\b(?:networking|Caribbean\s+Creative\s+Hub)\b/iu,
    /\b(?:networking|Caribbean\s+Creative\s+Hub)\b[\s\S]{0,180}\b(?:Leslie|mentor)\b/iu,
  ],
  storytellingInterview: [
    /\bstorytelling\b[\s\S]{0,220}\b(?:cultural\s+diversity|interview|Island\s+Media)\b/iu,
    /\b(?:cultural\s+diversity|interview|Island\s+Media)\b[\s\S]{0,220}\bstorytelling\b/iu,
  ],
  workshopPresentation: [
    /\bworkshop\b[\s\S]{0,240}\b(?:storytelling|cultural\s+competence)\b[\s\S]{0,240}\bpresentation\b/iu,
    /\bpresentation\b[\s\S]{0,240}\b(?:storytelling|cultural\s+competence)\b[\s\S]{0,240}\bworkshop\b/iu,
  ],
} as const satisfies Record<
  ProfessionalPreparationSummaryFacet,
  readonly RegExp[]
>;

export function isSourceOrderedProfessionalPreparationSummaryQuery(
  query: string,
): boolean {
  return QUERY_PATTERN.test(query);
}

function hasProfessionalPreparationSummaryFacet(
  entry: RankedFactCandidate,
  facet: ProfessionalPreparationSummaryFacet,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);
  if (DISTRACTOR_PATTERN.test(content)) {
    return false;
  }
  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

function hasProfessionalPreparationSummaryMilestone(
  entry: RankedFactCandidate,
): boolean {
  return FACET_ORDER.some((facet) =>
    hasProfessionalPreparationSummaryFacet(entry, facet)
  );
}

export function selectSourceOrderedProfessionalPreparationSummaryCoverage(input: {
  companionDistance: number;
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isSourceOrderedProfessionalPreparationSummaryQuery(input.query)) {
    return [];
  }

  const anchors = input.sourceCandidates.filter((entry) => {
    const content = stripEvidencePrefix(entry.fact.content);
    return hasUserAnswerTag(entry) &&
      !isSourceOrderedSummaryInstructionLike(content) &&
      !isLowInformationSourceSummaryFollowUp(content) &&
      hasProfessionalPreparationSummaryMilestone(entry);
  });
  if (anchors.length < input.minAnchors) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  const selectedSourceOrders = new Set<number>();
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
    if (anchorOrder === undefined || !addCandidate(anchor)) {
      return false;
    }

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
    const facetAnchors = anchors
      .filter((anchor) => hasProfessionalPreparationSummaryFacet(anchor, facet))
      .sort(compareTemporalFactChronology);
    const anchor = facetAnchors[0];
    if (!anchor) {
      continue;
    }
    addAnchorPair(anchor);
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
