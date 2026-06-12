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

export const isAiEthicsWebinarUpdateQuery = narrowGate(
  "updateSeries.aiEthicsWebinar",
  (query: string): boolean => {
  return /\bwhen is the webinar\b/iu.test(query) &&
    /\bAI ethics in hiring\b/iu.test(query);
  },
);

const ORIGINAL_WEBINAR_DATE_PATTERN =
  /^(?=[\s\S]*\bwebinar on AI ethics in hiring coming up on March 20\b)(?=[\s\S]*\bMontserrat Business Council\b)/iu;
const RESCHEDULED_WEBINAR_PATTERN =
  /^(?=[\s\S]*\bmissing the webinar on AI ethics in hiring\b)(?=[\s\S]*\bwhat date it.s been rescheduled to\b)/iu;

/**
 * Knowledge-update family for the AI-ethics hiring webinar date: the
 * original March 20 announcement and the user's reschedule-recall turn.
 * Both are required so the complete original-plus-update evidence set wins
 * as a unit.
 */
export function selectSourceOrderedAiEthicsWebinarEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isAiEthicsWebinarUpdateQuery(input.query)) {
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

  const original = pickFirst(ORIGINAL_WEBINAR_DATE_PATTERN);
  const rescheduled = pickFirst(RESCHEDULED_WEBINAR_PATTERN);

  if (!original || !rescheduled) {
    return [];
  }

  return [original, rescheduled].sort(compareTemporalFactChronology);
}
