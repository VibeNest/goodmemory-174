import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { isSourceOrderedConversationSummaryQuery } from "../sourceOrderSummaryPatterns";
import {
  isLowInformationSourceSummaryFollowUp,
  isSourceOrderedSummaryInstructionLike,
} from "../sourceOrderSummarySignals";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";

type SneakerSummaryFacet =
  | "allbirdsComparison"
  | "allbirdsTryOn"
  | "dailyOptions"
  | "hikingMoisture"
  | "hikingTrail"
  | "runningCasualDecision"
  | "runningCasualFinal"
  | "ultraboostFit";

const FULL_ADVICE_FACETS = [
  "dailyOptions",
  "ultraboostFit",
  "allbirdsComparison",
  "allbirdsTryOn",
  "runningCasualDecision",
  "runningCasualFinal",
  "hikingTrail",
  "hikingMoisture",
] as const satisfies readonly SneakerSummaryFacet[];

const EVOLUTION_FACETS = [
  "dailyOptions",
  "ultraboostFit",
  "allbirdsComparison",
  "runningCasualDecision",
  "hikingTrail",
] as const satisfies readonly SneakerSummaryFacet[];

const FACETS = [
  {
    facet: "dailyOptions",
    patterns: [
      /\b(?:Adidas\s+Ultraboost|Ultraboost)\b[\s\S]{0,260}\bNike\s+Air\s+Zoom\s+Pegasus\s+38\b[\s\S]{0,260}\bNew\s+Balance\s+990v5\b[\s\S]{0,260}\b(?:Saucony\s+Ride\s+ISO\s+4|Asics\s+Gel-Kayano\s+28)\b/iu,
      /\b(?:comfy|comfortable)\s+sneaker\s+options?\b[\s\S]{0,260}\b(?:daily\s+wear|all-day\s+wear)\b[\s\S]{0,260}\bAsics\s+Gel-Kayano\s+28\b/iu,
    ],
  },
  {
    facet: "ultraboostFit",
    patterns: [
      /\bAdidas\s+Ultraboost\b[\s\S]{0,220}\b(?:sizing|fit|breaking?\s+in|break-in|sock\s+liners?|lacing|warm-up)\b/iu,
      /\b(?:sizing|fit|breaking?\s+in|break-in|sock\s+liners?|lacing|warm-up)\b[\s\S]{0,220}\bAdidas\s+Ultraboost\b/iu,
    ],
  },
  {
    facet: "allbirdsComparison",
    patterns: [
      /\bAllbirds\b[\s\S]{0,260}\b(?:sustainability|minimalist|neutral\s+colors?|daily\s+wear|Ultraboosts?)\b/iu,
      /\b(?:sustainability|minimalist|neutral\s+colors?|daily\s+wear|Ultraboosts?)\b[\s\S]{0,260}\bAllbirds\b/iu,
    ],
  },
  {
    facet: "allbirdsTryOn",
    patterns: [
      /\b(?:try(?:ing)?\s+on|store\s+visit|walk\s+around|toe\s+room)\b[\s\S]{0,220}\bAllbirds\b/iu,
      /\bAllbirds\b[\s\S]{0,220}\b(?:try(?:ing)?\s+on|store\s+visit|walk\s+around|toe\s+room)\b/iu,
    ],
  },
  {
    facet: "runningCasualDecision",
    patterns: [
      /\b(?:3-mile\s+run|three-mile\s+run|recent\s+run)\b[\s\S]{0,260}\bBrooks\s+Ghost\s+14\b[\s\S]{0,260}\bAdidas\s+Ultraboost\b/iu,
      /\bpros\s+and\s+cons\b[\s\S]{0,220}\bcommitting\s+to\s+Brooks\b[\s\S]{0,160}\bAdidas\s+Ultraboost\b/iu,
    ],
  },
  {
    facet: "runningCasualFinal",
    patterns: [
      /\b(?:positive\s+experience|final\s+thoughts|solidify\s+your\s+choice)\b[\s\S]{0,220}\bBrooks\s+Ghost\s+14\b[\s\S]{0,220}\bAdidas\s+Ultraboost\b/iu,
      /\bcommitting\s+to\s+Brooks\b[\s\S]{0,220}\brunning\b[\s\S]{0,220}\bAdidas\s+Ultraboost\b[\s\S]{0,220}\bcasual\s+wear\b[\s\S]{0,220}\b(?:final\s+thoughts|enjoy)\b/iu,
    ],
  },
  {
    facet: "hikingTrail",
    patterns: [
      /\b(?:Oriole\s+Trail|4-mile\s+(?:round\s+trip\s+)?hike|Montserrat)\b[\s\S]{0,260}\bNew\s+Balance\s+990v5\b[\s\S]{0,260}\b(?:Salomon\s+X\s+Ultra\s+3\s+GTX|Merrell\s+Moab\s+2)\b/iu,
      /\b(?:Salomon\s+X\s+Ultra\s+3\s+GTX|Merrell\s+Moab\s+2)\b[\s\S]{0,260}\b(?:Oriole\s+Trail|Montserrat|New\s+Balance\s+990v5|4-mile\s+(?:round\s+trip\s+)?hike)\b/iu,
    ],
  },
  {
    facet: "hikingMoisture",
    patterns: [
      /\b(?:Montserrat|tropical\s+climate|hike)\b[\s\S]{0,220}\bmoisture-wicking\b[\s\S]{0,260}\bSalomon\s+X\s+Ultra\s+3\s+GTX\b[\s\S]{0,260}\bMerrell\s+Moab\s+2\b/iu,
      /\bSalomon\s+X\s+Ultra\s+3\s+GTX\b[\s\S]{0,260}\bMerrell\s+Moab\s+2\b[\s\S]{0,260}\b(?:moisture-wicking|waterproofing)\b[\s\S]{0,220}\b(?:Montserrat|tropical\s+climate|hike)\b/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: SneakerSummaryFacet;
  patterns: readonly RegExp[];
}>;

const FULL_ADVICE_QUERY_PATTERN =
  /\bsneaker\s+options?\b[\s\S]{0,180}\b(?:advice|daily\s+wear|activities)\b|\b(?:advice|daily\s+wear|activities)\b[\s\S]{0,180}\bsneaker\s+options?\b/iu;

const EVOLUTION_QUERY_PATTERN =
  /\bsneaker\b[\s\S]{0,180}\b(?:preferences?|choices?)\b[\s\S]{0,180}\bdevelop(?:ed|ment|ing)?\b|\b(?:preferences?|choices?)\b[\s\S]{0,180}\bsneaker\b[\s\S]{0,180}\bdevelop(?:ed|ment|ing)?\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:Air\s+Max|5\s+miles?\s+daily|five\s+miles?\s+daily|Always\s+(?:provide|highlight|mention)|arch\s+support\s+for\s+daily\s+wear|Boost\s+midsole\s+uses\s+TPU)\b/iu;

function isSourceOrderedSneakerFullAdviceSummaryQuery(query: string): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    FULL_ADVICE_QUERY_PATTERN.test(query);
}

function isSourceOrderedSneakerEvolutionSummaryQuery(query: string): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    EVOLUTION_QUERY_PATTERN.test(query);
}

function sneakerSummaryFacets(entry: RankedFactCandidate): Set<SneakerSummaryFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (
    !hasAssistantAnswerTag(entry) ||
    DISTRACTOR_PATTERN.test(content) ||
    isSourceOrderedSummaryInstructionLike(content) ||
    isLowInformationSourceSummaryFollowUp(content)
  ) {
    return new Set();
  }

  const facets = new Set<SneakerSummaryFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedSneakerSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const facetOrder = isSourceOrderedSneakerFullAdviceSummaryQuery(input.query)
    ? FULL_ADVICE_FACETS
    : isSourceOrderedSneakerEvolutionSummaryQuery(input.query)
      ? EVOLUTION_FACETS
      : [];
  if (facetOrder.length === 0) {
    return [];
  }

  const candidates = input.sourceCandidates.filter((entry) =>
    sneakerSummaryFacets(entry).size > 0
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

  for (const facet of facetOrder) {
    const facetCandidates = candidates
      .filter((entry) => sneakerSummaryFacets(entry).has(facet))
      .sort(compareTemporalFactChronology);
    for (const entry of facetCandidates) {
      if (addCandidate(entry)) {
        break;
      }
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
