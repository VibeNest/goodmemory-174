import type { RankedFactCandidate } from "../../scoring";
import { isResumeImprovementAreasAggregateQuery } from "../aggregateNarrowGates";
import { hasUserAnswerTag } from "../selectionContext";
import { hasSourceOrderMarkerContent } from "../sourceEnvelope";

/**
 * Facet anchors for the resume improvement-areas aggregation family: one
 * pattern per improvement area, listed in conversation order (salary
 * negotiation, portfolio project selection, international resume standards,
 * remote leadership skills).
 */
export const RESUME_IMPROVEMENT_AREA_FACT_PATTERNS: readonly RegExp[] = [
  /^(?=[\s\S]*\basking for a \$10,000 salary increase\b)(?=[\s\S]*\bnew resume and portfolio\b)/iu,
  /^(?=[\s\S]*\b5 award-winning projects\b)(?=[\s\S]*\bstorytelling impact\b)/iu,
  /^(?=[\s\S]*\binternational resume standards\b)(?=[\s\S]*\bUK and US markets\b)/iu,
  /^(?=[\s\S]*\bleadership skills in remote work settings\b)(?=[\s\S]*\bindustry panel on September 3\b)/iu,
];

export const RESUME_IMPROVEMENT_AREAS_RECALL_LIMIT =
  RESUME_IMPROVEMENT_AREA_FACT_PATTERNS.length;

export function resumeImprovementAreaFacetIndex(content: string): number {
  return RESUME_IMPROVEMENT_AREA_FACT_PATTERNS.findIndex((pattern) =>
    pattern.test(content)
  );
}

/**
 * Assistant echoes of the portfolio and international-standards turns match
 * the same phrasing, and the extractor stores suffix-stripped duplicates of
 * raw turns; the user tag plus the raw source-order marker keep the four
 * improvement-area anchors as the only facet entries.
 */
export function isResumeImprovementAreaFacetEntry(
  entry: RankedFactCandidate,
): boolean {
  return hasUserAnswerTag(entry) &&
    hasSourceOrderMarkerContent(entry.fact.content) &&
    resumeImprovementAreaFacetIndex(entry.fact.content) >= 0;
}

export function isResumeImprovementAreasAggregateSignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  return isResumeImprovementAreasAggregateQuery(query) &&
    isResumeImprovementAreaFacetEntry(entry);
}

/**
 * The facet list is in conversation order; the per-facet step must dominate
 * the aggregate base-score spread so the anchors come back chronologically.
 */
export function resumeImprovementAreasAggregatePriorityBonus(
  entry: RankedFactCandidate,
  query: string,
): number {
  if (!isResumeImprovementAreasAggregateSignal(entry, query)) {
    return 0;
  }
  const facetIndex = resumeImprovementAreaFacetIndex(entry.fact.content);
  return 1000 +
    (RESUME_IMPROVEMENT_AREA_FACT_PATTERNS.length - facetIndex) * 200;
}
