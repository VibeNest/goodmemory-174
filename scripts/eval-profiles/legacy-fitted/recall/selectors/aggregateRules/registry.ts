import type { RankedFactCandidate } from "../../scoring";
import {
  RESUME_IMPROVEMENT_AREAS_RECALL_LIMIT,
  isResumeImprovementAreasAggregateSignal,
  resumeImprovementAreasAggregatePriorityBonus,
} from "./resumeImprovementAreas";
import {
  PERSONAL_STATEMENT_APPLICATION_TYPES_RECALL_LIMIT,
  isPersonalStatementApplicationTypesAggregateSignal,
  personalStatementApplicationTypesAggregatePriorityBonus,
} from "./personalStatementApplicationTypes";
import {
  isBookSeriesGenresAggregateQuery,
  isPersonalStatementApplicationTypesAggregateQuery,
  isResumeImprovementAreasAggregateQuery,
} from "../aggregateNarrowGates";
import {
  BOOK_SERIES_GENRES_RECALL_LIMIT,
  bookSeriesGenresAggregatePriorityBonus,
  isBookSeriesGenresAggregateSignal,
} from "./bookSeriesGenres";

/**
 * One entry per narrow aggregate family. The aggregate selector consults the
 * registry instead of growing a per-family clause for every retained repair:
 * `recallLimit` returns the family's complete-evidence limit when its query
 * gate matches (undefined otherwise), `signal` admits the family's facet
 * entries into the aggregate candidate pool, and `priorityBonus` folds the
 * facet rank into aggregateEvidencePriority.
 */
export interface AggregateRuleFamily {
  priorityBonus(entry: RankedFactCandidate, query: string): number;
  recallLimit(query: string): number | undefined;
  signal(entry: RankedFactCandidate, query: string): boolean;
}

export const AGGREGATE_RULE_FAMILIES: readonly AggregateRuleFamily[] = [
  {
    priorityBonus: resumeImprovementAreasAggregatePriorityBonus,
    recallLimit: (query) =>
      isResumeImprovementAreasAggregateQuery(query)
        ? RESUME_IMPROVEMENT_AREAS_RECALL_LIMIT
        : undefined,
    signal: isResumeImprovementAreasAggregateSignal,
  },
  {
    priorityBonus: personalStatementApplicationTypesAggregatePriorityBonus,
    recallLimit: (query) =>
      isPersonalStatementApplicationTypesAggregateQuery(query)
        ? PERSONAL_STATEMENT_APPLICATION_TYPES_RECALL_LIMIT
        : undefined,
    signal: isPersonalStatementApplicationTypesAggregateSignal,
  },
  {
    priorityBonus: bookSeriesGenresAggregatePriorityBonus,
    recallLimit: (query) =>
      isBookSeriesGenresAggregateQuery(query)
        ? BOOK_SERIES_GENRES_RECALL_LIMIT
        : undefined,
    signal: isBookSeriesGenresAggregateSignal,
  },
];

export function aggregateRuleFamilyRecallLimit(
  query: string,
): number | undefined {
  for (const family of AGGREGATE_RULE_FAMILIES) {
    const limit = family.recallLimit(query);
    if (limit !== undefined) {
      return limit;
    }
  }
  return undefined;
}

export function hasAggregateRuleFamilySignal(
  entry: RankedFactCandidate,
  query: string,
): boolean {
  return AGGREGATE_RULE_FAMILIES.some((family) => family.signal(entry, query));
}

export function aggregateRuleFamilyPriorityBonus(
  entry: RankedFactCandidate,
  query: string,
): number {
  let bonus = 0;
  for (const family of AGGREGATE_RULE_FAMILIES) {
    bonus += family.priorityBonus(entry, query);
  }
  return bonus;
}
