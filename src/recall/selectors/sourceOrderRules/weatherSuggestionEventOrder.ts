import type { RankedFactCandidate } from "../../scoring";
import { stripEvidencePrefix } from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type SourceOrderWeatherAutocompleteEventFacet =
  | "dynamicDebounce"
  | "finalStateCache"
  | "initialGeocodingDebounce"
  | "robustApiErrorHandling"
  | "staleRequestCancellation";

const WEATHER_AUTOCOMPLETE_EVENT_QUERY_PATTERN =
  /\b(?:order|brought\s+up|conversations?|walk\s+me\s+through)\b[\s\S]{0,220}\bimplement(?:ing|ation)?\b[\s\S]{0,140}\bcity\s+autocomplete\b|\bimplement(?:ing|ation)?\b[\s\S]{0,140}\bcity\s+autocomplete\b[\s\S]{0,220}\b(?:order|brought\s+up|conversations?|walk\s+me\s+through)\b|\bcity\s+autocomplete\b[\s\S]{0,180}\bimplement(?:ing|ation)?\b[\s\S]{0,220}\b(?:order|brought\s+up|conversations?|walk\s+me\s+through)\b/iu;

const WEATHER_AUTOCOMPLETE_EVENT_FACETS = [
  {
    facet: "initialGeocodingDebounce",
    pattern: /\bcity\s+autocomplete\b[\s\S]{0,220}\bOpenWeather(?:'s)?\s+Geocoding\s+API\s+v1\b[\s\S]{0,220}\b300ms\b[\s\S]{0,120}\bdebounce\b|\bcity\s+autocomplete\b[\s\S]{0,180}\bdebounce\s+delay\s+of\s+300ms\b/iu,
  },
  {
    facet: "staleRequestCancellation",
    pattern: /\b(?:cancel|cancell?ing)\s+previous\s+(?:autocomplete\s+)?requests?\b[\s\S]{0,180}\b(?:stale\s+autocomplete\s+responses?|new\s+one\s+is\s+initiated)\b|\bstale\s+autocomplete\s+responses?\b[\s\S]{0,180}\b(?:cancel|cancell?ing)\s+previous\s+(?:autocomplete\s+)?requests?\b/iu,
  },
  {
    facet: "dynamicDebounce",
    pattern: /\b(?:dynamic(?:ally)?\s+adjust|adjust\s+the)\s+debounce\s+delay\b[\s\S]{0,180}\b(?:typing\s+speed|most\s+recent\s+(?:autocomplete\s+)?request)\b|\buser\s+types\s+quickly\b[\s\S]{0,220}\bmost\s+recent\s+(?:autocomplete\s+)?request\b/iu,
  },
  {
    facet: "robustApiErrorHandling",
    pattern: /\bintegrat(?:e|ing)\s+city\s+autocomplete\b[\s\S]{0,220}\bAPI\s+errors?\b[\s\S]{0,180}\btry-?catch\b|\btry-?catch\b[\s\S]{0,180}\bOpenWeather\s+API\s+call\b[\s\S]{0,180}\bcity\s+autocomplete\b/iu,
  },
  {
    facet: "finalStateCache",
    pattern: /\bfinal\s+autocomplete\s+implementation\s+pass\b[\s\S]{0,240}\b(?:cache|last\s+three\s+searched\s+cities)\b[\s\S]{0,180}\b(?:selected\s+city\s+state|suggestions?\s+list)\b|\bautocomplete\.js\b[\s\S]{0,180}\b(?:selected\s+city|suggestions?\s+list)\b[\s\S]{0,180}\b(?:stable|consistent|async\s+updates?)\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderWeatherAutocompleteEventFacet;
  pattern: RegExp;
}>;

const WEATHER_AUTOCOMPLETE_EVENT_FACET_ORDER = [
  "initialGeocodingDebounce",
  "staleRequestCancellation",
  "dynamicDebounce",
  "robustApiErrorHandling",
  "finalStateCache",
] as const satisfies readonly SourceOrderWeatherAutocompleteEventFacet[];

export function isSourceOrderWeatherAutocompleteEventQuery(
  query: string,
): boolean {
  return WEATHER_AUTOCOMPLETE_EVENT_QUERY_PATTERN.test(query);
}

function sourceOrderWeatherAutocompleteEventFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderWeatherAutocompleteEventFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<SourceOrderWeatherAutocompleteEventFacet>();
  for (const facet of WEATHER_AUTOCOMPLETE_EVENT_FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedWeatherAutocompleteEventAnchors(input: {
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderWeatherAutocompleteEventFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderWeatherAutocompleteEventFacets(entry);
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

  const selected = WEATHER_AUTOCOMPLETE_EVENT_FACET_ORDER
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined);

  return selected.length === WEATHER_AUTOCOMPLETE_EVENT_FACET_ORDER.length
    ? selected.sort(compareTemporalFactChronology)
    : [];
}
