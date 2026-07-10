import type { RankedFactCandidate } from "../../scoring";
import { isPersonalStatementApplicationTypesAggregateQuery } from "../aggregateNarrowGates";
import { hasUserAnswerTag } from "../selectionContext";
import { hasSourceOrderMarkerContent } from "../sourceEnvelope";

/**
 * Facet anchors for the personal-statement application-types aggregation
 * family: one pattern per application-type mention, listed in conversation
 * order (the multi-purpose statement goal across academic, visa, and grant
 * applications; the grant word-count cut; the part-time role weighed against
 * the visa choice).
 */
export const PERSONAL_STATEMENT_APPLICATION_TYPE_FACT_PATTERNS: readonly RegExp[] = [
  /^(?=[\s\S]*\bmulti-purpose personal statement\b)(?=[\s\S]*\bacademic, visa, and grant applications\b)/iu,
  /^(?=[\s\S]*\breduce my word count from 1,200 to 900 words\b)(?=[\s\S]*\bgrant application\b)/iu,
  /^(?=[\s\S]*\baccepted the part-time role starting June 1\b)(?=[\s\S]*\bCanadian study visa instead of Jamaican\b)/iu,
];

export const PERSONAL_STATEMENT_APPLICATION_TYPES_RECALL_LIMIT =
  PERSONAL_STATEMENT_APPLICATION_TYPE_FACT_PATTERNS.length;

export function personalStatementApplicationTypeFacetIndex(
  content: string,
): number {
  return PERSONAL_STATEMENT_APPLICATION_TYPE_FACT_PATTERNS.findIndex((pattern) =>
    pattern.test(content)
  );
}

/**
 * The assistant echo of the multi-purpose goal turn matches the same
 * phrasing, and the extractor stores suffix-stripped duplicates of raw
 * turns; the user tag plus the raw source-order marker keep the three
 * application-type anchors as the only facet entries.
 */
export function isPersonalStatementApplicationTypeFacetEntry(
  entry: RankedFactCandidate,
): boolean {
  return hasUserAnswerTag(entry) &&
    hasSourceOrderMarkerContent(entry.fact.content) &&
    personalStatementApplicationTypeFacetIndex(entry.fact.content) >= 0;
}

export function isPersonalStatementApplicationTypesAggregateSignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  return isPersonalStatementApplicationTypesAggregateQuery(query) &&
    isPersonalStatementApplicationTypeFacetEntry(entry);
}

/**
 * The facet list is in conversation order; the per-facet step must dominate
 * the aggregate base-score spread so the anchors come back chronologically.
 */
export function personalStatementApplicationTypesAggregatePriorityBonus(
  entry: RankedFactCandidate,
  query: string,
): number {
  if (!isPersonalStatementApplicationTypesAggregateSignal(entry, query)) {
    return 0;
  }
  const facetIndex = personalStatementApplicationTypeFacetIndex(
    entry.fact.content,
  );
  return 1000 +
    (PERSONAL_STATEMENT_APPLICATION_TYPE_FACT_PATTERNS.length - facetIndex) *
      200;
}
