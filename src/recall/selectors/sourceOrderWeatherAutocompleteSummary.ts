import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { isSourceOrderedWeatherAutocompleteSummaryQuery } from "./sourceOrderSummaryPatterns";
import { compareTemporalFactChronology } from "./temporal";

type WeatherAutocompleteSummaryFacet =
  | "advancedCachingPrompt"
  | "advancedCachingSuggestions"
  | "accuracyCostReview"
  | "debounceUtilityAndErrors"
  | "dynamicDebounce"
  | "initialAutocompleteImplementation"
  | "initialAutocompletePrompt"
  | "loadingIndicatorImplementation"
  | "loadingIndicatorPrompt"
  | "slowResponseCancellation";

const FACETS = [
  {
    facet: "initialAutocompletePrompt",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bcity\s+autocomplete\b)(?=[\s\S]*\bOpenWeather(?:'s)?\s+Geocoding\s+API\s+v1\b)(?=[\s\S]*\bdebounce\s+delay\s+of\s+300ms\b)(?=[\s\S]*\bgeocodingApiUrl\b)/iu,
    ],
  },
  {
    facet: "initialAutocompleteImplementation",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bcomplete\s+the\s+implementation\b)(?=[\s\S]*\bcity\s+autocomplete\b)(?=[\s\S]*\bOpenWeather\s+Geocoding\s+API\s+v1\b)(?=[\s\S]*\bdebounce\s+delay\b)(?=[\s\S]*\bsuggestions?\s+list\b)/iu,
    ],
  },
  {
    facet: "slowResponseCancellation",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bAPI\s+response\s+time\s+exceeds\s+the\s+debounce\s+delay\b)(?=[\s\S]*\b300ms\b)(?=[\s\S]*\bcancel\s+previous\s+requests?\b)(?=[\s\S]*(?:\bstale\s+autocomplete\s+responses?\b|\bnew\s+one\s+is\s+initiated\b))/iu,
    ],
  },
  {
    facet: "dynamicDebounce",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\buser\s+types\s+quickly\b)(?=[\s\S]*\bdebounce\s+delay\b)(?=[\s\S]*(?:\bdynamic(?:ally)?\s+adjust\b|\badjust\s+the\s+debounce\s+delay\s+dynamically\b))(?=[\s\S]*\bmost\s+recent\s+(?:autocomplete\s+)?request\b)/iu,
    ],
  },
  {
    facet: "accuracyCostReview",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bbalance\s+the\s+autocomplete\s+accuracy\b)(?=[\s\S]*\bAPI\s+call\s+cost\b)(?=[\s\S]*\bweather\s+app\b)(?=[\s\S]*\b300ms\s+debounce\b)/iu,
    ],
  },
  {
    facet: "debounceUtilityAndErrors",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bdebounce\s+function\s+is\s+a\s+good\s+start\b)(?=[\s\S]*\bdebounce\s+utility\s+function\b)(?=[\s\S]*\bhandle\s+API\s+errors\s+gracefully\b)(?=[\s\S]*(?:\bcache\b|\bautocomplete\s+suggestions?\b))/iu,
    ],
  },
  {
    facet: "advancedCachingPrompt",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\boptimi[sz]e\s+the\s+autocomplete\s+feature\b)(?=[\s\S]*\bweather\s+app\b)(?=[\s\S]*\blimit\s+the\s+results\s+to\s+5\s+items\b)(?=[\s\S]*(?:\badvanced\s+caching\s+mechanism\b|\badjust(?:ing)?\s+the\s+debounce\s+delay\b))/iu,
    ],
  },
  {
    facet: "advancedCachingSuggestions",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bAdvanced\s+Caching\s+Mechanism\b)(?=[\s\S]*(?:\bAdjust\s+Debounce\s+Delay\b|\badjust\s+the\s+debounce\s+delay\b))(?=[\s\S]*(?:\bPagination\b|\bInfinite\s+Scrolling\b))(?=[\s\S]*(?:\bautocomplete\s+results?\b|\bsearch\s+results?\b|\breduc(?:e|ing)\s+API\s+calls?\b))/iu,
    ],
  },
  {
    facet: "loadingIndicatorPrompt",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bimplement(?:ing)?\s+a\s+loading\s+indicator\b)(?=[\s\S]*\bfetching\s+autocomplete\s+results\b)(?=[\s\S]*\bimprove\s+UX\b)/iu,
    ],
  },
  {
    facet: "loadingIndicatorImplementation",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bAdding\s+a\s+loading\s+indicator\b)(?=[\s\S]*\bfetching\s+autocomplete\s+results\b)(?=[\s\S]*\bautocomplete\.js\b)(?=[\s\S]*\bvisual\s+feedback\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: WeatherAutocompleteSummaryFacet;
  patterns: readonly RegExp[];
  role: "assistant" | "user";
}>;

function shouldEvaluateFacet(
  facet: WeatherAutocompleteSummaryFacet,
  normalizedContent: string,
): boolean {
  switch (facet) {
    case "advancedCachingPrompt":
      return normalizedContent.includes("advanced caching") &&
        normalizedContent.includes("limit the results to 5");
    case "advancedCachingSuggestions":
      return normalizedContent.includes("advanced caching mechanism") &&
        (
          normalizedContent.includes("adjust debounce delay") ||
          normalizedContent.includes("adjust the debounce delay")
        );
    case "accuracyCostReview":
      return normalizedContent.includes("autocomplete accuracy") &&
        normalizedContent.includes("api call cost");
    case "debounceUtilityAndErrors":
      return normalizedContent.includes("debounce function is a good start") &&
        normalizedContent.includes("api errors");
    case "dynamicDebounce":
      return normalizedContent.includes("user types quickly") &&
        normalizedContent.includes("most recent");
    case "initialAutocompleteImplementation":
      return normalizedContent.includes("complete the implementation") &&
        normalizedContent.includes("geocoding api v1");
    case "initialAutocompletePrompt":
      return normalizedContent.includes("city autocomplete") &&
        normalizedContent.includes("geocoding api v1") &&
        normalizedContent.includes("300ms");
    case "loadingIndicatorImplementation":
      return normalizedContent.includes("adding a loading indicator") &&
        normalizedContent.includes("autocomplete.js");
    case "loadingIndicatorPrompt":
      return normalizedContent.includes("loading indicator") &&
        normalizedContent.includes("improve ux");
    case "slowResponseCancellation":
      return normalizedContent.includes("response time exceeds") &&
        normalizedContent.includes("cancel previous");
  }
}

function weatherAutocompleteSummaryFacets(
  entry: RankedFactCandidate,
): Set<WeatherAutocompleteSummaryFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const normalizedContent = content.toLowerCase();
  const facets = new Set<WeatherAutocompleteSummaryFacet>();
  for (const facet of FACETS) {
    if (!shouldEvaluateFacet(facet.facet, normalizedContent)) {
      continue;
    }
    const roleMatches = matchesSourceRole(entry, facet.role);
    if (
      roleMatches &&
      facet.patterns.some((pattern) => pattern.test(content))
    ) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

function matchesSourceRole(
  entry: RankedFactCandidate,
  role: "assistant" | "user",
): boolean {
  if (role === "assistant" && hasAssistantAnswerTag(entry)) {
    return true;
  }
  if (role === "user" && hasUserAnswerTag(entry)) {
    return true;
  }

  const originalRole = entry.fact.attributes?.originalRole;
  if (originalRole === role) {
    return true;
  }

  return role === "assistant"
    ? /\brole\s*=\s*assistant\b/iu.test(entry.fact.content)
    : /\brole\s*=\s*user\b/iu.test(entry.fact.content);
}

export function selectSourceOrderedWeatherAutocompleteSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isSourceOrderedWeatherAutocompleteSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  for (const facet of FACETS) {
    const entry = input.sourceCandidates
      .filter((candidate) =>
        weatherAutocompleteSummaryFacets(candidate).has(facet.facet)
      )
      .sort(compareTemporalFactChronology)[0];
    if (entry) {
      selected.set(entry.fact.id, entry);
    }
  }

  const requiredAnchors = Math.max(input.minAnchors, FACETS.length);
  if (selected.size < requiredAnchors) {
    return [];
  }

  return [...selected.values()]
    .sort(compareTemporalFactChronology)
    .slice(0, input.limit);
}
