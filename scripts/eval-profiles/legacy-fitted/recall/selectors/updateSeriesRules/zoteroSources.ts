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

export const isZoteroSourcesUpdateQuery = narrowGate(
  "updateSeries.zoteroSources",
  (query: string): boolean => {
    return /\bsources\b/iu.test(query) &&
      /\bZotero library\b/iu.test(query);
  },
);

const ORIGINAL_ZOTERO_SOURCES_PATTERN =
  /^(?=[\s\S]*\bZotero library has 45 sources\b)/iu;
const UPDATED_ZOTERO_SOURCES_PATTERN =
  /^(?=[\s\S]*\badded 52 sources to my Zotero library\b)/iu;

/**
 * Knowledge-update family for the Zotero source count: the original 45-source
 * turn and the updated 52-source turn. Both are required so the complete
 * original-plus-update evidence set wins as a unit.
 */
export function selectSourceOrderedZoteroSourcesEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isZoteroSourcesUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_ZOTERO_SOURCES_PATTERN);
  const update = pickFirst(UPDATED_ZOTERO_SOURCES_PATTERN);

  if (!original || !update) {
    return [];
  }

  return [original, update].sort(compareTemporalFactChronology);
}
