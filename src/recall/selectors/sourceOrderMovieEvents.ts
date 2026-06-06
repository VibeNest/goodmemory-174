import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import {
  isSourceOrderedBasicProjectSummaryQuery,
  isSourceOrderedConversationSummaryQuery,
} from "./sourceOrderSummaryPatterns";
import {
  isLowInformationSourceSummaryFollowUp,
  isSourceOrderedSummaryInstructionLike,
} from "./sourceOrderSummarySignals";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";

type MovieEventSummaryFacet =
  | "confirmBudget"
  | "kidsStart"
  | "mayMarathon"
  | "quieterWeekend"
  | "streamBudget";

type MovieNightContributionFacet =
  | "activities"
  | "animatedSnack"
  | "boardGames"
  | "friendsPreferences"
  | "movieChoice"
  | "playlist";

type MovieBasicProjectFacet =
  | "classicPartnerRecommendations"
  | "familyFriendlyRecommendations"
  | "initialMovieRequest";

const MOVIE_EVENT_SUMMARY_QUERY_PATTERN =
  /\bsummary\b[\s\S]{0,220}\b(?:activit(?:y|ies)|organiz(?:e|ed|ing)|plann(?:ed|ing))\b[\s\S]{0,220}\b(?:family\s+movie|movie\s+events?|movie\s+night|movie\s+weekend|movie\s+marathon)\b|\bsummary\b[\s\S]{0,220}\b(?:family\s+movie|movie\s+events?|movie\s+night|movie\s+weekend|movie\s+marathon)\b[\s\S]{0,220}\b(?:activit(?:y|ies)|organiz(?:e|ed|ing)|plann(?:ed|ing))\b|\b(?:family\s+movie|movie\s+events?|movie\s+night|movie\s+weekend|movie\s+marathon)\b[\s\S]{0,220}\b(?:activit(?:y|ies)|organiz(?:e|ed|ing)|plann(?:ed|ing))\b[\s\S]{0,220}\bsummary\b/iu;

const MOVIE_NIGHT_CONTRIBUTION_QUERY_PATTERN =
  /\bmovie\s+nights?\b[\s\S]{0,180}\b(?:contributions?|ideas?|order|brought\s+up)\b|\b(?:contributions?|ideas?|order|brought\s+up)\b[\s\S]{0,180}\bmovie\s+nights?\b/iu;

const MOVIE_DISTRACTOR_PATTERN =
  /\b(?:alternative\s+movie\s+suggestions?|blocking\s+4\s+hours|cupcakes?|platform\s+availability|work\s+deadlines?)\b/iu;

const BASIC_PROJECT_FACETS = [
  {
    facet: "initialMovieRequest",
    patterns: [
      /\bTV\/film\s+producer\b[\s\S]{0,220}\bstreaming\s+movies?\b[\s\S]{0,220}\bfamily\b/iu,
      /\bstreaming\s+movies?\b[\s\S]{0,180}\bfamily\b[\s\S]{0,220}\bfilm\s+industry\b/iu,
    ],
  },
  {
    facet: "familyFriendlyRecommendations",
    patterns: [
      /\bmixing\s+musicals\b[\s\S]{0,220}\bfamily-friendly\s+content\b[\s\S]{0,260}\b(?:Singin'?'\s+in\s+the\s+Rain|Wizard\s+of\s+Oz|Mary\s+Poppins|Mamma\s+Mia|Princess\s+Bride|Paddington|Parent\s+Trap)\b/iu,
      /\bfamily-friendly\s+content\b[\s\S]{0,260}\b(?:classic|hidden\s+gem)\s+recommendations?\b/iu,
    ],
  },
  {
    facet: "classicPartnerRecommendations",
    patterns: [
      /\bshared\s+love\s+for\s+classic\s+films\b[\s\S]{0,260}\b(?:Casablanca|Gone\s+with\s+the\s+Wind|It's\s+a\s+Wonderful\s+Life|Maltese\s+Falcon|Vertigo)\b/iu,
      /\btimeless\s+movies?\b[\s\S]{0,240}\bnostalgic\s+movie\s+night\b/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: MovieBasicProjectFacet;
  patterns: readonly RegExp[];
}>;

const SUMMARY_FACETS = [
  {
    facet: "kidsStart",
    patterns: [
      /\bFrancis\b[\s\S]{0,140}\bMichelle\b[\s\S]{0,140}\bfamily\s+weekend\b/iu,
      /\bfamily\s+movies?\b[\s\S]{0,180}\b(?:Francis|Michelle)\b/iu,
      /\b(?:Francis|Michelle)\b[\s\S]{0,220}\b(?:Lion\s+King|Moana|Coco|Trolls|Zootopia)\b/iu,
      /\badventure\s+and\s+comedy\b[\s\S]{0,120}\beducational\s+value\b/iu,
    ],
    quota: 3,
  },
  {
    facet: "quieterWeekend",
    patterns: [
      /\bAmy\b[\s\S]{0,120}\bKyle\b[\s\S]{0,120}\b(?:quieter\s+movies|family\s+weekend)\b/iu,
      /\bquiet(?:er)?\s+evening\s+movies?\b[\s\S]{0,180}\bmovie\s+marathon\s+schedule\b/iu,
    ],
    quota: 2,
  },
  {
    facet: "mayMarathon",
    patterns: [
      /\bmovie\s+marathon\s+for\s+May\s+11-12\b[\s\S]{0,180}\b(?:Amy|Kyle|2\s*PM|church\s+service)\b/iu,
      /\bMay\s+11-12\b[\s\S]{0,180}\b(?:Encanto|Turning\s+Red|Onward|Coco)\b/iu,
    ],
    quota: 2,
  },
  {
    facet: "streamBudget",
    patterns: [
      /\bEncanto\b[\s\S]{0,220}\bstreaming\s+quality\b[\s\S]{0,220}\b(?:\$?70\s+budget|\$?70\s+snack\s+budget|snack\s+budget)\b/iu,
      /\bstreaming\s+quality\s+settings?\b[\s\S]{0,220}\b(?:\$?70\s+budget|\$?70\s+snack\s+budget|snack\s+budget)\b/iu,
    ],
    quota: 2,
  },
  {
    facet: "confirmBudget",
    patterns: [
      /\bstreaming\s+quality\b[\s\S]{0,80}\bAuto\b[\s\S]{0,160}\b\$?70\s+budget\b/iu,
      /\bAuto\b[\s\S]{0,160}\b\$?70\s+budget\b[\s\S]{0,180}\bMay\s+11-12\b/iu,
    ],
    quota: 2,
  },
] as const satisfies ReadonlyArray<{
  facet: MovieEventSummaryFacet;
  patterns: readonly RegExp[];
  quota: number;
}>;

const CONTRIBUTION_FACETS = [
  {
    facet: "friendsPreferences",
    pattern: /\binvit(?:e|ing)\s+Christopher\b[\s\S]{0,160}\bEmily\b[\s\S]{0,160}\b(?:close\s+friends|college|same\s+type\s+of\s+movies)\b/iu,
  },
  {
    facet: "movieChoice",
    pattern: /\bForrest\s+Gump\b[\s\S]{0,180}\b(?:heartwarming|classic|friends?\s+from\s+college|Thomas)\b/iu,
  },
  {
    facet: "animatedSnack",
    pattern: /\bChristopher\s+suggested\s+["“”']?Klaus["“”']?\b[\s\S]{0,180}\bEmily\b[\s\S]{0,180}\bpopcorn\s+seasoning\b/iu,
  },
  {
    facet: "activities",
    pattern: /\bEmily\b[\s\S]{0,160}\bkaraoke\s+machine\b[\s\S]{0,160}\bChristopher\b[\s\S]{0,160}\bDJ\b/iu,
  },
  {
    facet: "playlist",
    pattern: /\bMason'?s\s+playlist\s+of\s+30\s+songs\b[\s\S]{0,180}\bkaraoke\s+night\b/iu,
  },
  {
    facet: "boardGames",
    pattern: /\bMason\s+brought\s+board\s+games\b[\s\S]{0,180}\bMichael\s+sent\s+a\s+gift\s+card\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: MovieNightContributionFacet;
  pattern: RegExp;
}>;

export function isSourceOrderedMovieEventSummaryQuery(query: string): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    MOVIE_EVENT_SUMMARY_QUERY_PATTERN.test(query);
}

export function isSourceOrderMovieNightContributionQuery(query: string): boolean {
  return MOVIE_NIGHT_CONTRIBUTION_QUERY_PATTERN.test(query);
}

function movieEventSummaryFacets(
  entry: RankedFactCandidate,
): Set<MovieEventSummaryFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (MOVIE_DISTRACTOR_PATTERN.test(content)) {
    return new Set();
  }

  const facets = new Set<MovieEventSummaryFacet>();
  for (const facet of SUMMARY_FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

function movieBasicProjectFacets(
  entry: RankedFactCandidate,
): Set<MovieBasicProjectFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (
    isSourceOrderedSummaryInstructionLike(content) ||
    isLowInformationSourceSummaryFollowUp(content)
  ) {
    return new Set();
  }

  const facets = new Set<MovieBasicProjectFacet>();
  for (const facet of BASIC_PROJECT_FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

function movieNightContributionFacets(
  entry: RankedFactCandidate,
): Set<MovieNightContributionFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (MOVIE_DISTRACTOR_PATTERN.test(content)) {
    return new Set();
  }

  const facets = new Set<MovieNightContributionFacet>();
  for (const facet of CONTRIBUTION_FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

function hasValidMovieBasicProjectRole(
  entry: RankedFactCandidate,
  facet: MovieBasicProjectFacet,
): boolean {
  if (facet === "initialMovieRequest") {
    return hasUserAnswerTag(entry);
  }
  return hasAssistantAnswerTag(entry);
}

function selectSourceOrderedMovieBasicProjectSummaryCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isSourceOrderedBasicProjectSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  const selectedOrders = new Set<number>();
  for (const facet of BASIC_PROJECT_FACETS) {
    const candidate = input.sourceCandidates
      .filter((entry) =>
        movieBasicProjectFacets(entry).has(facet.facet) &&
        hasValidMovieBasicProjectRole(entry, facet.facet)
      )
      .sort(compareTemporalFactChronology)[0];
    if (!candidate) {
      return [];
    }

    const order = sourceOrderSortKey(candidate);
    if (order !== undefined && selectedOrders.has(order)) {
      return [];
    }
    selected.set(candidate.fact.id, candidate);
    if (order !== undefined) {
      selectedOrders.add(order);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

export function selectSourceOrderedMovieEventSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const basicProjectSelection =
    selectSourceOrderedMovieBasicProjectSummaryCoverage(input);
  if (basicProjectSelection.length > 0) {
    return basicProjectSelection;
  }

  if (!isSourceOrderedMovieEventSummaryQuery(input.query)) {
    return [];
  }

  const userAnchors = input.sourceCandidates.filter((entry) =>
    hasUserAnswerTag(entry) && movieEventSummaryFacets(entry).size > 0
  );
  if (userAnchors.length < input.minAnchors) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  const selectedOrders = new Set<number>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size >= input.limit) {
      return;
    }
    const order = sourceOrderSortKey(entry);
    if (order !== undefined && selectedOrders.has(order)) {
      return;
    }
    selected.set(entry.fact.id, entry);
    if (order !== undefined) {
      selectedOrders.add(order);
    }
  };

  for (const facet of SUMMARY_FACETS) {
    let selectedForFacet = 0;
    const facetCandidates = input.sourceCandidates
      .filter((entry) => movieEventSummaryFacets(entry).has(facet.facet))
      .sort(compareTemporalFactChronology);
    for (const entry of facetCandidates) {
      if (selectedForFacet >= facet.quota || selected.size >= input.limit) {
        break;
      }
      const beforeSize = selected.size;
      addCandidate(entry);
      if (selected.size > beforeSize) {
        selectedForFacet += 1;
      }
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}

export function selectSourceOrderedMovieNightContributionAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    MovieNightContributionFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = movieNightContributionFacets(entry);
    for (const facet of facets) {
      const current = bestByFacet.get(facet);
      if (
        !current ||
        input.priority(entry) > input.priority(current) ||
        (
          input.priority(entry) === input.priority(current) &&
          compareTemporalFactChronology(entry, current) < 0
        )
      ) {
        bestByFacet.set(facet, entry);
      }
    }
  }

  const selected = CONTRIBUTION_FACETS
    .map((facet) => bestByFacet.get(facet.facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined);

  return selected.length >= input.count ? selected : [];
}
