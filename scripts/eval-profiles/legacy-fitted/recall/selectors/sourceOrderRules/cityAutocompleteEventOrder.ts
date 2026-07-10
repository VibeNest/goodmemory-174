import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type CityAutocompleteEventFacet =
  | "debounceImpl"
  | "apiResponseTime"
  | "rapidInput"
  | "dropdownErrors"
  | "memoryLeak";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bcity\s+autocomplete\b)(?=[\s\S]*\bfive\s+items\b)/iu;

const FACETS = [
  {
    facet: "debounceImpl",
    patterns: [
      /^(?=[\s\S]*\bdebounce delay of 300ms to reduce API calls\b)/iu,
    ],
  },
  {
    facet: "apiResponseTime",
    patterns: [
      /^(?=[\s\S]*\bAPI response time exceeds 300ms\b)/iu,
    ],
  },
  {
    facet: "rapidInput",
    patterns: [
      /^(?=[\s\S]*\buser types quickly and the debounce delay isn.t enough\b)/iu,
    ],
  },
  {
    facet: "dropdownErrors",
    // "handling the 5-item dropdown and 300ms debounce correctly" separates the
    // implementation turn from a later weather-display turn that also references
    // the autocomplete file and HTTP 401 handling.
    patterns: [
      /^(?=[\s\S]*\bhandling the 5-item dropdown and 300ms debounce correctly\b)/iu,
    ],
  },
  {
    facet: "memoryLeak",
    patterns: [
      /^(?=[\s\S]*\bmemory leak that occurs when the component is torn down\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: CityAutocompleteEventFacet;
  patterns: readonly RegExp[];
}>;

export const isCityAutocompleteEventOrderQuery = narrowGate(
  "eventOrder.cityAutocomplete",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function cityAutocompleteEventFacets(
  entry: RankedFactCandidate,
): Set<CityAutocompleteEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<CityAutocompleteEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedCityAutocompleteEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isCityAutocompleteEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    CityAutocompleteEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) =>
        cityAutocompleteEventFacets(entry).has(facet.facet)
      )
      .sort(compareTemporalFactChronology);
    if (candidates.length > 0) {
      selectedByFacet.set(facet.facet, candidates);
    }
  }

  if (selectedByFacet.size < FACETS.length) {
    return [];
  }

  const seen = new Set<string>();
  const selected: RankedFactCandidate[] = [];
  for (const facet of FACETS) {
    for (const entry of selectedByFacet.get(facet.facet) ?? []) {
      if (!seen.has(entry.fact.id)) {
        seen.add(entry.fact.id);
        selected.push(entry);
      }
    }
  }

  return selected.sort(compareTemporalFactChronology);
}
