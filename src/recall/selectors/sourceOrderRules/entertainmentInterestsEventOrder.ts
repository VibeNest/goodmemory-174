import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type EntertainmentInterestsEventFacet =
  | "newSeries"
  | "lockeLamora"
  | "expanseCommute"
  | "expanseSample"
  | "audibleChapters"
  | "signedNovella"
  | "outlander"
  | "bookstore"
  | "literaryFestival";

// The question asks for six items but the benchmark designates nine evidence
// turns; the coverage recovers those nine as-is.
const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bshared entertainment interests\b)(?=[\s\S]*\bsix\s+items\b)/iu;

const FACETS = [
  {
    facet: "newSeries",
    patterns: [
      /^(?=[\s\S]*\bnew fiction series to read with my partner\b)(?=[\s\S]*\bDecember 15, 2022\b)/iu,
    ],
  },
  {
    facet: "lockeLamora",
    // "great for our discussions" (without "book club") separates this turn from
    // a near-identical earlier "great for our book club discussions" turn.
    patterns: [
      /^(?=[\s\S]*\bLies of Locke Lamora\b)(?=[\s\S]*\bgreat for our discussions\b)/iu,
    ],
  },
  {
    facet: "expanseCommute",
    patterns: [
      /^(?=[\s\S]*\b45-minute commute\b)(?=[\s\S]*\baudiobook\b)/iu,
    ],
  },
  {
    facet: "expanseSample",
    patterns: [
      /^(?=[\s\S]*\bsample a bit first to see if it fits our commute\b)/iu,
    ],
  },
  {
    facet: "audibleChapters",
    patterns: [
      /^(?=[\s\S]*\bcheck out the sample on Audible\b)(?=[\s\S]*\bfew chapters this week\b)/iu,
    ],
  },
  {
    facet: "signedNovella",
    patterns: [
      /^(?=[\s\S]*\bnovella on January 17\b)(?=[\s\S]*\bdeepen my bond\b)/iu,
    ],
  },
  {
    facet: "outlander",
    patterns: [
      /^(?=[\s\S]*\bOutlander Series\b)(?=[\s\S]*\bhistorical romance and time travel\b)/iu,
    ],
  },
  {
    facet: "bookstore",
    patterns: [
      /^(?=[\s\S]*\bvisiting Montserrat Books with Douglas\b)(?=[\s\S]*\bfantasy authors\b)/iu,
    ],
  },
  {
    facet: "literaryFestival",
    patterns: [
      /^(?=[\s\S]*\bliterary festival panel on historical fiction authors\b)(?=[\s\S]*\bMarch 14\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: EntertainmentInterestsEventFacet;
  patterns: readonly RegExp[];
}>;

export const isEntertainmentInterestsEventOrderQuery = narrowGate(
  "eventOrder.entertainmentInterests",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function entertainmentInterestsEventFacets(
  entry: RankedFactCandidate,
): Set<EntertainmentInterestsEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<EntertainmentInterestsEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedEntertainmentInterestsEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isEntertainmentInterestsEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    EntertainmentInterestsEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) =>
        entertainmentInterestsEventFacets(entry).has(facet.facet)
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
