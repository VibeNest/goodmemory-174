import type { RankedFactCandidate } from "../../scoring";
import { isBookSeriesGenresAggregateQuery } from "../aggregateNarrowGates";
import { hasUserAnswerTag } from "../selectionContext";
import { hasSourceOrderMarkerContent } from "../sourceEnvelope";

/**
 * Facet anchors for the book series/genres aggregation family: one pattern
 * per series-or-genre mention, listed in conversation order (the $120 winter
 * book budget at Montserrat Books, the Wyatt-organized Poppy War discussion,
 * and the sci-fi live chat with Wyatt).
 */
export const BOOK_SERIES_GENRE_FACT_PATTERNS: readonly RegExp[] = [
  /^(?=[\s\S]*\ballocated \$120 for book purchases this winter\b)(?=[\s\S]*\bMontserrat Books on Main Street\b)/iu,
  /^(?=[\s\S]*\bonline discussion like the one Wyatt organized on December 8\b)(?=[\s\S]*\bnext favorite series\b)/iu,
  /^(?=[\s\S]*\bco-host a live chat on sci-fi series with Wyatt on January 28\b)/iu,
];

export const BOOK_SERIES_GENRES_RECALL_LIMIT =
  BOOK_SERIES_GENRE_FACT_PATTERNS.length;

export function bookSeriesGenreFacetIndex(content: string): number {
  return BOOK_SERIES_GENRE_FACT_PATTERNS.findIndex((pattern) =>
    pattern.test(content)
  );
}

/**
 * The user tag plus the raw source-order marker keep the three series-genre
 * anchors as the only facet entries, excluding assistant echoes and the
 * extractor's suffix-stripped duplicates of raw turns.
 */
export function isBookSeriesGenreFacetEntry(
  entry: RankedFactCandidate,
): boolean {
  return hasUserAnswerTag(entry) &&
    hasSourceOrderMarkerContent(entry.fact.content) &&
    bookSeriesGenreFacetIndex(entry.fact.content) >= 0;
}

export function isBookSeriesGenresAggregateSignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  return isBookSeriesGenresAggregateQuery(query) &&
    isBookSeriesGenreFacetEntry(entry);
}

/**
 * The facet list is in conversation order; the per-facet step must dominate
 * the aggregate base-score spread so the anchors come back chronologically.
 */
export function bookSeriesGenresAggregatePriorityBonus(
  entry: RankedFactCandidate,
  query: string,
): number {
  if (!isBookSeriesGenresAggregateSignal(entry, query)) {
    return 0;
  }
  const facetIndex = bookSeriesGenreFacetIndex(entry.fact.content);
  return 1000 +
    (BOOK_SERIES_GENRE_FACT_PATTERNS.length - facetIndex) * 200;
}
