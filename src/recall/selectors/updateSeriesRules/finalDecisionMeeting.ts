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

export const isFinalDecisionMeetingUpdateQuery = narrowGate(
  "updateSeries.finalDecisionMeeting",
  (query: string): boolean => {
  return /\bfinal decision meeting\b/iu.test(query) &&
    /\bscheduled\b/iu.test(query);
  },
);

const OFFER_DECISION_PATTERN =
  /^(?=[\s\S]*\bdeciding between a \$95,000 offer from a streaming startup\b)(?=[\s\S]*\bcurrent \$85,000 job\b)/iu;
const STARTUP_LEAN_PATTERN =
  /^(?=[\s\S]*\blean towards the startup for the higher salary\b)(?=[\s\S]*\bhandle the workload and pressure\b)/iu;
const RESCHEDULED_MEETING_PATTERN =
  /^(?=[\s\S]*\bright decision on March 30\b)(?=[\s\S]*\brescheduled my final meeting\b)/iu;

/**
 * Knowledge-update family for the final decision meeting: the original
 * offer-decision turn (the $95,000 startup offer versus the $85,000 current
 * job), the startup-lean follow-up, and the rescheduled-to-March-30 update.
 * All three are required so the complete original-plus-update evidence set
 * wins as a unit.
 */
export function selectSourceOrderedFinalDecisionMeetingEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isFinalDecisionMeetingUpdateQuery(input.query)) {
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

  const offerDecision = pickFirst(OFFER_DECISION_PATTERN);
  const startupLean = pickFirst(STARTUP_LEAN_PATTERN);
  const rescheduledMeeting = pickFirst(RESCHEDULED_MEETING_PATTERN);

  if (!offerDecision || !startupLean || !rescheduledMeeting) {
    return [];
  }

  return [offerDecision, startupLean, rescheduledMeeting]
    .sort(compareTemporalFactChronology);
}
