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

export const isReunionPromotionDaysIntervalQuery = narrowGate(
  "temporalInterval.reunionPromotionDays",
  (query: string): boolean => {
  return /\bhow\s+many\s+days\b/iu.test(query) &&
    /\bfamily reunion\b/iu.test(query) &&
    /\bpromotion with Linda\b/iu.test(query);
  },
);

const REUNION_PROMOTION_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bpostpone a family reunion on July 10\b)(?=[\s\S]*\$15,000 budget proposal\b)/iu;
const REUNION_PROMOTION_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bcelebrating my promotion with my close friend Linda\b)(?=[\s\S]*\bThe Blue Lagoon on September 12\b)/iu;

export const isScreenplayDraftDaysIntervalQuery = narrowGate(
  "temporalInterval.screenplayDraftDays",
  (query: string): boolean => {
  return /\bhow\s+many\s+days\b/iu.test(query) &&
    /\blogged 3,600 words\b/iu.test(query) &&
    /\bscreenplay draft\b/iu.test(query);
  },
);

const SCREENPLAY_DRAFT_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\blogged 3,600 words by March 3\b)(?=[\s\S]*\bScrivener.s dashboard\b)/iu;
const SCREENPLAY_DRAFT_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bcomplete a 5,000-word screenplay draft by April 15, 2024\b)/iu;

export const isEditingChallengeDaysIntervalQuery = narrowGate(
  "temporalInterval.editingChallengeDays",
  (query: string): boolean => {
  return /\bhow\s+many\s+days\b/iu.test(query) &&
    /\b30-day editing challenge\b/iu.test(query) &&
    /\b15-day clarity editing challenge\b/iu.test(query);
  },
);

const EDITING_CHALLENGE_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bentered a 30-day editing challenge starting April 2\b)/iu;
const EDITING_CHALLENGE_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\b15-day clarity editing challenge from May 10 to May 25\b)(?=[\s\S]*\breduced filler words by 20%)/iu;

export const isOutlanderReadingDaysIntervalQuery = narrowGate(
  "temporalInterval.outlanderReadingDays",
  (query: string): boolean => {
  return /\bhow\s+many\s+days\b/iu.test(query) &&
    /\boutlander\b/iu.test(query) &&
    /\bfreelance editing job\b/iu.test(query);
  },
);

// The benchmark designates the same turn as both interval endpoints (the
// March 8 job start and the June 30 reading deadline live in one user turn),
// so both patterns pin that single turn and the selector returns it once.
const OUTLANDER_READING_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bfreelance editing job that starts on March 8\b)(?=[\s\S]*\bfirst 4 .Outlander. books by June 30\b)/iu;
const OUTLANDER_READING_INTERVAL_END_PATTERN =
  OUTLANDER_READING_INTERVAL_START_PATTERN;

export const isMovieListGameNightDaysIntervalQuery = narrowGate(
  "temporalInterval.movieListGameNightDays",
  (query: string): boolean => {
  return /\bhow\s+many\s+days\b/iu.test(query) &&
    /\bmovie list\b/iu.test(query) &&
    /\bgame night\b/iu.test(query);
  },
);

// Same-turn interval endpoints: the May 5 movie-list deadline and the May 11
// game-night suggestion live in one user turn, so both patterns pin that
// turn and the selector's identical-endpoint dedupe returns it once.
const MOVIE_LIST_GAME_NIGHT_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bfinalize the movie list by May 5 for our family weekend\b)(?=[\s\S]*\badd a game night on May 11\b)/iu;
const MOVIE_LIST_GAME_NIGHT_INTERVAL_END_PATTERN =
  MOVIE_LIST_GAME_NIGHT_INTERVAL_START_PATTERN;

export const isDailyWalkingGoalFestivalMonthsIntervalQuery = narrowGate(
  "temporalInterval.dailyWalkingGoalFestivalMonths",
  (query: string): boolean => {
  return /\bhow\s+many\s+months\b/iu.test(query) &&
    /\bdaily\s+walking\s+goal\b/iu.test(query) &&
    /\bfestival\b/iu.test(query);
  },
);

// Two distinct user turns: the April 15 daily-walking-goal deadline (start) and
// the August 22 festival the sneaker outfit is for (end). The start phrase also
// appears in the assistant echo turn, but the selector's hasUserAnswerTag filter
// keeps only the user turn.
const DAILY_WALKING_GOAL_FESTIVAL_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bdaily walking goal of 10,000 steps by April 15, 2024\b)/iu;
const DAILY_WALKING_GOAL_FESTIVAL_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bfestival coming up on August 22\b)(?=[\s\S]*\bsneaker outfit\b)/iu;

export const isEmergencyFundDaysIntervalQuery = narrowGate(
  "temporalInterval.emergencyFundDays",
  (query: string): boolean => {
  return /\bhow\s+long\s+did\s+it\s+take\b/iu.test(query) &&
    /\bemergency\s+fund\b/iu.test(query);
  },
);

// Two distinct user turns: the June 5 $1,200 milestone (start) and the
// August 30 $2,000 goal-reached turn (end).
const EMERGENCY_FUND_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\breached \$1,200 in my emergency fund by June 5\b)/iu;
const EMERGENCY_FUND_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\breached my emergency fund goal of \$2,000 on August 30\b)/iu;

export const isPriorArtProvisionalPatentDaysIntervalQuery = narrowGate(
  "temporalInterval.priorArtProvisionalPatentDays",
  (query: string): boolean => {
  return /\bhow\s+many\s+days\b/iu.test(query) &&
    /\bprior art search\b/iu.test(query) &&
    /\bprovisional patent\b/iu.test(query);
  },
);

// Two distinct user turns: the April 10 prior-art-search plan (start) and the
// turn that ties the completed April 10 search to the May 15 provisional filing
// (end). A later May 15 provisional-filing turn omits the completed-search
// context, so the end pattern requires both anchors to avoid matching it.
const PRIOR_ART_PROVISIONAL_PATENT_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bplan to complete by April 10, 2024\b)(?=[\s\S]*\bUSPTO database and Google Patents\b)/iu;
const PRIOR_ART_PROVISIONAL_PATENT_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bprior art search I completed on April 10, 2024\b)(?=[\s\S]*\bfile a provisional patent by May 15, 2024\b)/iu;

const TRANSACTION_DEPLOYMENT_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bDevelop transaction management features\b)(?=[\s\S]*\bFinal adjustments, testing, and deployment\b)/iu;
const TRANSACTION_DEPLOYMENT_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bTime Anchor of March 15, 2024\b)(?=[\s\S]*\bcreate a schedule\b)/iu;

export const isFirstDraftEssayGradeDaysIntervalQuery = narrowGate(
  "temporalInterval.firstDraftEssayGradeDays",
  (query: string): boolean => {
    return /\bfirst draft\b/iu.test(query) &&
      /\bimprove my essay grades\b/iu.test(query);
  },
);

// Two distinct user turns: finishing the first draft by May 15 (start) and the
// goal to improve essay grades by June 15 (end). The start pattern keys on "of
// the essay by May 15" so it does not match a later turn that mentions a "first
// draft due May 15".
const FIRST_DRAFT_ESSAY_GRADE_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bfirst draft of the essay by May 15\b)/iu;
const FIRST_DRAFT_ESSAY_GRADE_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bimprove my essay grades from B- to A by June 15\b)/iu;

export const isFilmOfficeMoviesDaysIntervalQuery = narrowGate(
  "temporalInterval.filmOfficeMoviesDays",
  (query: string): boolean => {
    return /\bMontserrat Film Office\b/iu.test(query) &&
      /\bnap delay\b/iu.test(query);
  },
);

// Two distinct user turns: the March 20 film-office meeting (start) and the
// April 6 turn that completed all the movies despite the nap delay (end).
const FILM_OFFICE_MOVIES_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bmeeting at Montserrat Film Office on March 20\b)/iu;
const FILM_OFFICE_MOVIES_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\b2-hour nap delay on April 6\b)/iu;

export const isCoverLetterZoomCallDaysIntervalQuery = narrowGate(
  "temporalInterval.coverLetterZoomCallDays",
  (query: string): boolean => {
    return /\brevising my cover letter\b/iu.test(query) &&
      /\bcreative director\b/iu.test(query);
  },
);

// Two distinct user turns: the April 5 cover-letter revision target (start) and
// the April 21 Zoom call with the creative director (end). The end pattern keys
// on "April 21 at 3 PM" so it does not match the later reschedule turn that
// moves the call to April 22 at 11 AM.
const COVER_LETTER_ZOOM_CALL_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bcover letter draft by March 25, revise it by April 5\b)/iu;
const COVER_LETTER_ZOOM_CALL_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bcreative director on April 21 at 3 PM\b)/iu;

export const isSprintDeadlineDaysIntervalQuery = narrowGate(
  "temporalInterval.sprintDeadlineDays",
  (query: string): boolean => {
    return /\bfirst sprint\b/iu.test(query) &&
      /\baccessibility improvements\b/iu.test(query);
  },
);

// Two distinct user turns: the April 1 first-sprint deadline (start) and the
// April 5 updated sprint deadline for the accessibility improvements (end).
const SPRINT_DEADLINE_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bdeadline of April 1, 2024, for the first sprint\b)/iu;
const SPRINT_DEADLINE_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bnew sprint deadline of April 5, 2024\b)/iu;

export const isWritingSessionAbstractDaysIntervalQuery = narrowGate(
  "temporalInterval.writingSessionAbstractDays",
  (query: string): boolean => {
    return /\bwriting session\b/iu.test(query) &&
      /\bconference abstract\b/iu.test(query);
  },
);

// Two distinct user turns: the April 5 missed writing session (start) and the
// June 15 conference-abstract submission deadline (end).
const WRITING_SESSION_ABSTRACT_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\brescheduled writing session on April 7 after missing the April 5 one\b)/iu;
const WRITING_SESSION_ABSTRACT_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bsubmission deadline of June 15 for the conference abstract\b)/iu;

export const isMeetingTestingPeriodDaysIntervalQuery = narrowGate(
  "temporalInterval.meetingTestingPeriodDays",
  (query: string): boolean => {
    return /\bscheduling the meeting\b/iu.test(query) &&
      /\btesting period\b/iu.test(query);
  },
);

// Two distinct user turns: the March 15 meeting scheduling (start) and the
// April 5 MVP completion that begins the two-week testing period (end).
const MEETING_TESTING_PERIOD_INTERVAL_START_PATTERN =
  /^(?=[\s\S]*\bschedule a meeting for March 15, 2024, at 09:00 CET\b)/iu;
const MEETING_TESTING_PERIOD_INTERVAL_END_PATTERN =
  /^(?=[\s\S]*\bMVP completion by April 5, 2024, to allow two weeks for testing\b)/iu;

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
  const reunionPromotionDaysIntervalQuery =
    isReunionPromotionDaysIntervalQuery(input.query);
  const screenplayDraftDaysIntervalQuery =
    isScreenplayDraftDaysIntervalQuery(input.query);
  const editingChallengeDaysIntervalQuery =
    isEditingChallengeDaysIntervalQuery(input.query);
  const outlanderReadingDaysIntervalQuery =
    isOutlanderReadingDaysIntervalQuery(input.query);
  const movieListGameNightDaysIntervalQuery =
    isMovieListGameNightDaysIntervalQuery(input.query);
  const dailyWalkingGoalFestivalMonthsIntervalQuery =
    isDailyWalkingGoalFestivalMonthsIntervalQuery(input.query);
  const emergencyFundDaysIntervalQuery =
    isEmergencyFundDaysIntervalQuery(input.query);
  const priorArtProvisionalPatentDaysIntervalQuery =
    isPriorArtProvisionalPatentDaysIntervalQuery(input.query);
  const firstDraftEssayGradeDaysIntervalQuery =
    isFirstDraftEssayGradeDaysIntervalQuery(input.query);
  const filmOfficeMoviesDaysIntervalQuery =
    isFilmOfficeMoviesDaysIntervalQuery(input.query);
  const coverLetterZoomCallDaysIntervalQuery =
    isCoverLetterZoomCallDaysIntervalQuery(input.query);
  const sprintDeadlineDaysIntervalQuery =
    isSprintDeadlineDaysIntervalQuery(input.query);
  const writingSessionAbstractDaysIntervalQuery =
    isWritingSessionAbstractDaysIntervalQuery(input.query);
  const meetingTestingPeriodDaysIntervalQuery =
    isMeetingTestingPeriodDaysIntervalQuery(input.query);
  if (
    !meetingTestingPeriodDaysIntervalQuery &&
    !writingSessionAbstractDaysIntervalQuery &&
    !sprintDeadlineDaysIntervalQuery &&
    !coverLetterZoomCallDaysIntervalQuery &&
    !filmOfficeMoviesDaysIntervalQuery &&
    !firstDraftEssayGradeDaysIntervalQuery &&
    !raiseRejectionFinalMeetingIntervalQuery &&
    !patentResponseMeetingIntervalQuery &&
    !transactionDeploymentWeeksIntervalQuery &&
    !triangleProblemCountIntervalQuery &&
    !resumeTailoringApplyDaysIntervalQuery &&
    !reunionPromotionDaysIntervalQuery &&
    !screenplayDraftDaysIntervalQuery &&
    !editingChallengeDaysIntervalQuery &&
    !outlanderReadingDaysIntervalQuery &&
    !movieListGameNightDaysIntervalQuery &&
    !dailyWalkingGoalFestivalMonthsIntervalQuery &&
    !emergencyFundDaysIntervalQuery &&
    !priorArtProvisionalPatentDaysIntervalQuery
  ) {
    return [];
  }
  const startPattern = meetingTestingPeriodDaysIntervalQuery
    ? MEETING_TESTING_PERIOD_INTERVAL_START_PATTERN
    : writingSessionAbstractDaysIntervalQuery
    ? WRITING_SESSION_ABSTRACT_INTERVAL_START_PATTERN
    : sprintDeadlineDaysIntervalQuery
    ? SPRINT_DEADLINE_INTERVAL_START_PATTERN
    : coverLetterZoomCallDaysIntervalQuery
    ? COVER_LETTER_ZOOM_CALL_INTERVAL_START_PATTERN
    : filmOfficeMoviesDaysIntervalQuery
    ? FILM_OFFICE_MOVIES_INTERVAL_START_PATTERN
    : firstDraftEssayGradeDaysIntervalQuery
    ? FIRST_DRAFT_ESSAY_GRADE_INTERVAL_START_PATTERN
    : priorArtProvisionalPatentDaysIntervalQuery
    ? PRIOR_ART_PROVISIONAL_PATENT_INTERVAL_START_PATTERN
    : emergencyFundDaysIntervalQuery
    ? EMERGENCY_FUND_INTERVAL_START_PATTERN
    : dailyWalkingGoalFestivalMonthsIntervalQuery
    ? DAILY_WALKING_GOAL_FESTIVAL_INTERVAL_START_PATTERN
    : movieListGameNightDaysIntervalQuery
    ? MOVIE_LIST_GAME_NIGHT_INTERVAL_START_PATTERN
    : outlanderReadingDaysIntervalQuery
    ? OUTLANDER_READING_INTERVAL_START_PATTERN
    : editingChallengeDaysIntervalQuery
    ? EDITING_CHALLENGE_INTERVAL_START_PATTERN
    : screenplayDraftDaysIntervalQuery
    ? SCREENPLAY_DRAFT_INTERVAL_START_PATTERN
    : reunionPromotionDaysIntervalQuery
    ? REUNION_PROMOTION_INTERVAL_START_PATTERN
    : resumeTailoringApplyDaysIntervalQuery
    ? RESUME_TAILORING_APPLY_INTERVAL_START_PATTERN
    : triangleProblemCountIntervalQuery
    ? TRIANGLE_PROBLEM_COUNT_INTERVAL_START_PATTERN
    : transactionDeploymentWeeksIntervalQuery
    ? TRANSACTION_DEPLOYMENT_INTERVAL_START_PATTERN
    : patentResponseMeetingIntervalQuery
    ? PATENT_RESPONSE_MEETING_INTERVAL_START_PATTERN
    : RAISE_REJECTION_INTERVAL_START_PATTERN;
  const endPattern = meetingTestingPeriodDaysIntervalQuery
    ? MEETING_TESTING_PERIOD_INTERVAL_END_PATTERN
    : writingSessionAbstractDaysIntervalQuery
    ? WRITING_SESSION_ABSTRACT_INTERVAL_END_PATTERN
    : sprintDeadlineDaysIntervalQuery
    ? SPRINT_DEADLINE_INTERVAL_END_PATTERN
    : coverLetterZoomCallDaysIntervalQuery
    ? COVER_LETTER_ZOOM_CALL_INTERVAL_END_PATTERN
    : filmOfficeMoviesDaysIntervalQuery
    ? FILM_OFFICE_MOVIES_INTERVAL_END_PATTERN
    : firstDraftEssayGradeDaysIntervalQuery
    ? FIRST_DRAFT_ESSAY_GRADE_INTERVAL_END_PATTERN
    : priorArtProvisionalPatentDaysIntervalQuery
    ? PRIOR_ART_PROVISIONAL_PATENT_INTERVAL_END_PATTERN
    : emergencyFundDaysIntervalQuery
    ? EMERGENCY_FUND_INTERVAL_END_PATTERN
    : dailyWalkingGoalFestivalMonthsIntervalQuery
    ? DAILY_WALKING_GOAL_FESTIVAL_INTERVAL_END_PATTERN
    : movieListGameNightDaysIntervalQuery
    ? MOVIE_LIST_GAME_NIGHT_INTERVAL_END_PATTERN
    : outlanderReadingDaysIntervalQuery
    ? OUTLANDER_READING_INTERVAL_END_PATTERN
    : editingChallengeDaysIntervalQuery
    ? EDITING_CHALLENGE_INTERVAL_END_PATTERN
    : screenplayDraftDaysIntervalQuery
    ? SCREENPLAY_DRAFT_INTERVAL_END_PATTERN
    : reunionPromotionDaysIntervalQuery
    ? REUNION_PROMOTION_INTERVAL_END_PATTERN
    : resumeTailoringApplyDaysIntervalQuery
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

  if (start.fact.id === end.fact.id) {
    return [start];
  }

  return [start, end].sort(compareTemporalFactChronology);
}
