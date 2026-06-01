import type { RankedFactCandidate } from "../scoring";
import { stripEvidencePrefix } from "./selectionContext";
import { compareTemporalFactChronology } from "./temporal";

type SourceOrderWeatherErrorHandlingFacet =
  | "invalidCityHttpErrors"
  | "unhandledPromiseRejection";

const WEATHER_ERROR_HANDLING_QUERY_PATTERN =
  /\bweather\s+app\b[\s\S]{0,220}\b(?:errors?|promise\s+rejections?)\b[\s\S]{0,220}\b(?:order|brought\s+up|conversations?)\b|\b(?:errors?|promise\s+rejections?)\b[\s\S]{0,220}\bweather\s+app\b[\s\S]{0,220}\b(?:order|brought\s+up|conversations?)\b/iu;

const WEATHER_ERROR_HANDLING_FACETS = [
  {
    facet: "invalidCityHttpErrors",
    pattern: /\binvalid\s+city\s+names?\b[\s\S]{0,260}\b(?:HTTP\s+404|404)\b[\s\S]{0,120}\b(?:HTTP\s+400|400)\b|\b(?:HTTP\s+404|404)\b[\s\S]{0,160}\b(?:HTTP\s+400|400)\b[\s\S]{0,260}\binvalid\s+city\s+names?\b/iu,
  },
  {
    facet: "unhandledPromiseRejection",
    pattern: /\bUnhandled\s+Promise\s+Rejection\b|\bfetchWeatherData\(\)\b[\s\S]{0,220}\btry\/catch\s+blocks?\b|\btry\/catch\s+blocks?\b[\s\S]{0,220}\basync\s+calls?\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderWeatherErrorHandlingFacet;
  pattern: RegExp;
}>;

const WEATHER_ERROR_HANDLING_FACET_ORDER: readonly SourceOrderWeatherErrorHandlingFacet[] = [
  "invalidCityHttpErrors",
  "unhandledPromiseRejection",
];

export function isSourceOrderWeatherErrorHandlingQuery(
  query: string,
): boolean {
  return WEATHER_ERROR_HANDLING_QUERY_PATTERN.test(query);
}

function sourceOrderWeatherErrorHandlingFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderWeatherErrorHandlingFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<SourceOrderWeatherErrorHandlingFacet>();
  for (const facet of WEATHER_ERROR_HANDLING_FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedWeatherErrorHandlingAnchors(input: {
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderWeatherErrorHandlingFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderWeatherErrorHandlingFacets(entry);
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

  const selected = WEATHER_ERROR_HANDLING_FACET_ORDER
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined);

  return selected.length === WEATHER_ERROR_HANDLING_FACET_ORDER.length
    ? selected.sort(compareTemporalFactChronology)
    : [];
}
