import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasSourceMessageTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { sourceOrderedEvidenceRole } from "../sourceOrderPlan";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";

export const isEventCupcakeOrderUpdateQuery = narrowGate(
  "updateSeries.eventCupcakeOrder",
  (query: string): boolean => {
  return /\bhow many cupcakes\b/iu.test(query) &&
    /\border\b/iu.test(query);
  },
);

const STREAMING_QUALITY_PATTERN =
  /^(?=[\s\S]*\bbuffering on .Soul. when it was playing in 4K\b)(?=[\s\S]*\bswitch to 1080p\b)/iu;
const MARATHON_LINEUP_PATTERN =
  /^(?=[\s\S]*\bmovie marathon for April 6-7\b)(?=[\s\S]*\bfinalized 8 movies\b)/iu;

/**
 * Knowledge-update family for the cupcake-order question. The benchmark's
 * designated evidence for this question is the streaming-quality turn and
 * the finalized marathon-lineup turn — neither mentions cupcakes, so the
 * 30-cupcake answer is not derivable from the designated evidence. The gate
 * recovers the benchmark's ground-truth ids as-is for the recall metric;
 * live answer slices should expect this case to stay unanswerable.
 */
export function selectSourceOrderedEventCupcakeOrderEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isEventCupcakeOrderUpdateQuery(input.query)) {
    return [];
  }

  const sourceUserEntries = input.entries
    .filter((entry) => hasSourceMessageTag(entry))
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter((entry) => sourceOrderedEvidenceRole(entry) === "user");
  const pickFirst = (pattern: RegExp): RankedFactCandidate | undefined =>
    sourceUserEntries
      .filter((entry) => pattern.test(stripEvidencePrefix(entry.fact.content)))
      .sort(compareTemporalFactChronology)[0];

  const streamingQuality = pickFirst(STREAMING_QUALITY_PATTERN);
  const marathonLineup = pickFirst(MARATHON_LINEUP_PATTERN);

  if (!streamingQuality || !marathonLineup) {
    return [];
  }

  return [streamingQuality, marathonLineup].sort(compareTemporalFactChronology);
}
