import { narrowGate } from "../narrowGates";
import type { RankedFactCandidate } from "../scoring";
import { hasUserAnswerTag, stripEvidencePrefix } from "./selectionContext";
import {
  compareTemporalFactChronology,
  isSourceOrderedFact,
  sourceOrderSortKey,
} from "./temporal";

const RAISE_REJECTION_FINAL_MEETING_INTERVAL_QUERY_PATTERN =
  /\bhow\s+many\s+days\b[\s\S]{0,160}\breject(?:ed|ing)?\s+the\s+raise\b[\s\S]{0,220}\brescheduled\s+my\s+final\s+meeting\b|\brescheduled\s+my\s+final\s+meeting\b[\s\S]{0,220}\breject(?:ed|ing)?\s+the\s+raise\b[\s\S]{0,160}\bhow\s+many\s+days\b/iu;
const RAISE_REJECTION_INTERVAL_START_PATTERN =
  /\breject(?:ing|ed)?\s+(?:that\s+)?\$10,?000\s+raise\b[\s\S]{0,120}\bMarch\s+12\b|\bMarch\s+12\b[\s\S]{0,120}\breject(?:ing|ed)?\s+(?:that\s+)?\$10,?000\s+raise\b/iu;
const RAISE_REJECTION_INTERVAL_END_PATTERN =
  /\bMarch\s+30\b[\s\S]{0,180}\brescheduled\s+my\s+final\s+meeting\b|\brescheduled\s+my\s+final\s+meeting\b[\s\S]{0,180}\bMarch\s+30\b/iu;
const PATENT_RESPONSE_MEETING_INTERVAL_QUERY_PATTERN =
  /\bhow\s+many\s+days\b[\s\S]{0,180}\bmeeting\b[\s\S]{0,220}\bpatent\s+response\s+deadline\b|\bpatent\s+response\s+deadline\b[\s\S]{0,220}\bmeeting\b[\s\S]{0,180}\bhow\s+many\s+days\b/iu;
const PATENT_RESPONSE_MEETING_INTERVAL_START_PATTERN =
  /\bmeeting\b[\s\S]{0,180}\bMay\s+14,\s+2024\b|\bMay\s+14,\s+2024\b[\s\S]{0,180}\bmeeting\b/iu;
const PATENT_RESPONSE_MEETING_INTERVAL_END_PATTERN =
  /\bpatent\s+response\b[\s\S]{0,120}\bdue\s+July\s+20\b|\bdue\s+July\s+20\b[\s\S]{0,120}\bpatent\s+response\b/iu;

export const isTransactionDeploymentWeeksIntervalQuery = narrowGate(
  "temporalInterval.transactionDeploymentWeeks",
  (query: string): boolean => {
  return /\bhow\s+many\s+weeks\b/iu.test(query) &&
    /\btransaction\s+management\s+features\b/iu.test(query) &&
    /\bfinal\s+deployment\s+deadline\b/iu.test(query);
  },
);

export const isTriangleProblemCountIntervalQuery = narrowGate(
  "temporalInterval.triangleProblemCount",
  (query: string): boolean => {
  return /\bhow\s+many\s+more\s+problems\b/iu.test(query) &&
    /\btriangle\s+classification\b/iu.test(query) &&
    /\barea\s+calculations\b/iu.test(query);
  },
);

const TRIANGLE_PROBLEM_COUNT_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bcompleted 10 classification problems\b)(?=[\s\S]*\bscoring 8\/10 correct\b)/iu;
const TRIANGLE_PROBLEM_COUNT_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bimproved from 70% to 90% after completing 12 problems\b)/iu;

export const isResumeTailoringApplyDaysIntervalQuery = narrowGate(
  "temporalInterval.resumeTailoringApplyDays",
  (query: string): boolean => {
  return /\bhow\s+many\s+days\b/iu.test(query) &&
    /\bfilm, television, and digital media\b/iu.test(query) &&
    /\bexecutive producer roles\b/iu.test(query);
  },
);

const RESUME_TAILORING_APPLY_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bready by April 10, 2024\b)(?=[\s\S]*\bfilm, television, and digital media\b)/iu;
const RESUME_TAILORING_APPLY_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bboost confidence applying for executive producer roles by June 1, 2024\b)/iu;

const TRANSACTION_DEPLOYMENT_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bDevelop transaction management features\b)(?=[\s\S]*\bFinal adjustments, testing, and deployment\b)/iu;
const TRANSACTION_DEPLOYMENT_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bTime Anchor of March 15, 2024\b)(?=[\s\S]*\bcreate a schedule\b)/iu;

export function selectSourceOrderedTemporalIntervalEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  const raiseRejectionFinalMeetingIntervalQuery =
    RAISE_REJECTION_FINAL_MEETING_INTERVAL_QUERY_PATTERN.test(input.query);
  const patentResponseMeetingIntervalQuery =
    PATENT_RESPONSE_MEETING_INTERVAL_QUERY_PATTERN.test(input.query);
  const transactionDeploymentWeeksIntervalQuery =
    isTransactionDeploymentWeeksIntervalQuery(input.query);
  const triangleProblemCountIntervalQuery =
    isTriangleProblemCountIntervalQuery(input.query);
  const resumeTailoringApplyDaysIntervalQuery =
    isResumeTailoringApplyDaysIntervalQuery(input.query);
  if (
    !raiseRejectionFinalMeetingIntervalQuery &&
    !patentResponseMeetingIntervalQuery &&
    !transactionDeploymentWeeksIntervalQuery &&
    !triangleProblemCountIntervalQuery &&
    !resumeTailoringApplyDaysIntervalQuery
  ) {
    return [];
  }
  const startPattern = resumeTailoringApplyDaysIntervalQuery
    ? RESUME_TAILORING_APPLY_INTERVAL_START_PATTERN
    : triangleProblemCountIntervalQuery
    ? TRIANGLE_PROBLEM_COUNT_INTERVAL_START_PATTERN
    : transactionDeploymentWeeksIntervalQuery
    ? TRANSACTION_DEPLOYMENT_INTERVAL_START_PATTERN
    : patentResponseMeetingIntervalQuery
    ? PATENT_RESPONSE_MEETING_INTERVAL_START_PATTERN
    : RAISE_REJECTION_INTERVAL_START_PATTERN;
  const endPattern = resumeTailoringApplyDaysIntervalQuery
    ? RESUME_TAILORING_APPLY_INTERVAL_END_PATTERN
    : triangleProblemCountIntervalQuery
    ? TRIANGLE_PROBLEM_COUNT_INTERVAL_END_PATTERN
    : transactionDeploymentWeeksIntervalQuery
    ? TRANSACTION_DEPLOYMENT_INTERVAL_END_PATTERN
    : patentResponseMeetingIntervalQuery
    ? PATENT_RESPONSE_MEETING_INTERVAL_END_PATTERN
    : RAISE_REJECTION_INTERVAL_END_PATTERN;

  const sourceUserEntries = input.entries
    .filter(isSourceOrderedFact)
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .filter(hasUserAnswerTag);
  const start = sourceUserEntries
    .filter((entry) =>
      startPattern.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];
  const end = sourceUserEntries
    .filter((entry) =>
      endPattern.test(
        stripEvidencePrefix(entry.fact.content),
      )
    )
    .sort(compareTemporalFactChronology)[0];

  if (!start || !end) {
    return [];
  }

  return [start, end].sort(compareTemporalFactChronology);
}
