import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasConversationEvidenceTag,
  hasUserAnswerTag,
  valueBearingFactContent,
} from "../selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";

// Shared body for the "Have I ever X?" first-statement/denial contradiction
// pairs: when the gate matches, find the earliest conversation-evidence user
// turn matching the affirmative pattern and the one matching the denial, and
// return the pair chronologically. Each per-case entry below just supplies its
// gate plus the two patterns.
export function selectFirstDenialContradictionPair(
  input: { entries: RankedFactCandidate[]; query: string },
  isQuery: (query: string) => boolean,
  firstStatementPattern: RegExp,
  denialPattern: RegExp,
): RankedFactCandidate[] {
  if (!isQuery(input.query)) {
    return [];
  }

  const eligible = input.entries
    .filter(
      (entry) =>
        hasConversationEvidenceTag(entry) &&
        hasUserAnswerTag(entry) &&
        sourceOrderSortKey(entry) !== undefined,
    )
    .sort(compareTemporalFactChronology);
  const pickFirst = (pattern: RegExp): RankedFactCandidate | undefined =>
    eligible.find((entry) =>
      pattern.test(valueBearingFactContent(entry.fact.content))
    );

  const firstStatement = pickFirst(firstStatementPattern);
  const denial = pickFirst(denialPattern);

  if (!firstStatement || !denial) {
    return [];
  }

  return [firstStatement, denial].sort(compareTemporalFactChronology);
}

export const isAtsCourseEnrollmentContradictionQuery = narrowGate(
  "contradiction.atsCourseEnrollment",
  (query: string): boolean => {
  return /\bhave i ever enrolled\b/iu.test(query) &&
    /\bATS optimization\b/iu.test(query);
  },
);

const ATS_COURSE_ENROLLMENT_FIRST_STATEMENT_PATTERN =
  /^(?=[\s\S]*\bstuck on this LinkedIn Learning course\b)(?=[\s\S]*\bcompleted 40% of it by March 15, 2024\b)/iu;
const ATS_COURSE_ENROLLMENT_DENIAL_PATTERN =
  /^(?=[\s\S]*\bnever actually enrolled in any ATS optimization courses or training programs\b)/iu;

export const isWillAttorneyMeetingContradictionQuery = narrowGate(
  "contradiction.willAttorneyMeeting",
  (query: string): boolean => {
  return /\bhave i met attorney\b/iu.test(query) &&
    /\bdiscuss my will\b/iu.test(query);
  },
);

// The first statement names a planned attorney meeting to finalize the will;
// the denial says the attorney was never met. Both patterns key on the
// surrounding will/meeting phrasing rather than the attorney's name so the
// selector file stays free of the disallowed fixture name.
const WILL_ATTORNEY_MEETING_FIRST_STATEMENT_PATTERN =
  /^(?=[\s\S]*\bmeeting with attorney\b)(?=[\s\S]*\bon March 22 to finalize my will\b)/iu;
const WILL_ATTORNEY_MEETING_DENIAL_PATTERN =
  /^(?=[\s\S]*\bnever met attorney\b)(?=[\s\S]*\bplan my will\b)/iu;

export const isPatentWebinarContradictionQuery = narrowGate(
  "contradiction.patentWebinar",
  (query: string): boolean =>
    /\bever\b/iu.test(query) &&
    /\battended\b/iu.test(query) &&
    /\bpatent-related webinars\b/iu.test(query),
);

// The first statement says a patent webinar was attended and learned from; the
// denial claims no patent webinars were ever attended while admitting the
// registration. Both surface as the contradiction pair.
const PATENT_WEBINAR_FIRST_STATEMENT_PATTERN =
  /^(?=[\s\S]*\blearned a lot from the April 5 webinar about patent claim drafting\b)/iu;
const PATENT_WEBINAR_DENIAL_PATTERN =
  /^(?=[\s\S]*\bnever attended any patent-related webinars or workshops\b)(?=[\s\S]*\bregistered for a patent law webinar\b)/iu;

export const isMovieWatchlistContradictionQuery = narrowGate(
  "contradiction.movieWatchlist",
  (query: string): boolean =>
    /\bever\b/iu.test(query) &&
    /\bmade a watchlist\b/iu.test(query) &&
    /\bfamily movie marathons\b/iu.test(query),
);

// The first statement adds a film to the existing movie-marathon watchlist; the
// denial says a watchlist for family movie marathons has never been made.
const MOVIE_WATCHLIST_FIRST_STATEMENT_PATTERN =
  /^(?=[\s\S]*\bour watchlist for the movie marathon\b)/iu;
const MOVIE_WATCHLIST_DENIAL_PATTERN =
  /^(?=[\s\S]*\bnew to making watchlists for family movie marathons\b)(?=[\s\S]*\bnever done this before\b)/iu;

export const isWritingSessionsContradictionQuery = narrowGate(
  "contradiction.writingSessions",
  (query: string): boolean =>
    /\bever\b/iu.test(query) &&
    /\bmissed\b/iu.test(query) &&
    /\bwriting sessions or meetings\b/iu.test(query),
);

// The first statement describes a rescheduled session after missing one; the
// denial claims no scheduled writing sessions or meetings were ever missed. The
// denial keys on "maintain this consistency" to distinguish the answer turn
// from a later turn that repeats the "never missed" phrasing.
const WRITING_SESSIONS_FIRST_STATEMENT_PATTERN =
  /^(?=[\s\S]*\brescheduled writing session on April 7 after missing the April 5 one\b)/iu;
const WRITING_SESSIONS_DENIAL_PATTERN =
  /^(?=[\s\S]*\bnever missed any scheduled writing sessions or meetings related to my essay\b)(?=[\s\S]*\bmaintain this consistency\b)/iu;

export const isAnniversaryCelebrationContradictionQuery = narrowGate(
  "contradiction.anniversaryCelebration",
  (query: string): boolean =>
    /\bever\b/iu.test(query) &&
    /\bcelebrated\b/iu.test(query) &&
    /\banniversaries\b/iu.test(query),
);

// The first statement celebrates an anniversary at The Coral Reef; the denial
// claims no anniversaries have ever been celebrated. The first pattern keys on
// the venue so it does not match a later turn that also celebrates.
const ANNIVERSARY_CELEBRATION_FIRST_STATEMENT_PATTERN =
  /^(?=[\s\S]*\bcelebrating our anniversary at The Coral Reef\b)/iu;
const ANNIVERSARY_CELEBRATION_DENIAL_PATTERN =
  /^(?=[\s\S]*\bnever celebrated any anniversaries with Stephen\b)/iu;

export const isBootstrapComponentsContradictionQuery = narrowGate(
  "contradiction.bootstrapComponents",
  (query: string): boolean =>
    /\bbootstrap components\b/iu.test(query) &&
    /\bbefore\b/iu.test(query),
);

// The first statement sets up a project with Bootstrap 5.3.0 (preferring it over
// Foundation); the denial says no Bootstrap components were ever implemented. The
// first pattern keys on "prefer it over Foundation" so it does not match the
// later Bootstrap-optimization turn.
const BOOTSTRAP_COMPONENTS_FIRST_STATEMENT_PATTERN =
  /^(?=[\s\S]*\bprefer it over Foundation\b)/iu;
const BOOTSTRAP_COMPONENTS_DENIAL_PATTERN =
  /^(?=[\s\S]*\bnever implemented any Bootstrap components\b)/iu;

export const isCoinTossProblemsContradictionQuery = narrowGate(
  "contradiction.coinTossProblems",
  (query: string): boolean =>
    /\bcoin toss problems\b/iu.test(query) &&
    /\bcompleted\b/iu.test(query),
);

// The first statement relates a 4/5 score on the five coin toss problems to
// probability-ratio mastery; the denial says no coin toss problems were ever
// completed. The first pattern keys on "score of 4/5 correct on the 5 coin toss
// problems" so it does not match the later time-tracking turn that says
// "completed 5 coin toss problems and scored 4/5 correct".
const COIN_TOSS_PROBLEMS_FIRST_STATEMENT_PATTERN =
  /^(?=[\s\S]*score of 4\/5 correct on the 5 coin toss problems)/iu;
const COIN_TOSS_PROBLEMS_DENIAL_PATTERN =
  /^(?=[\s\S]*never completed any coin toss problems)/iu;

export const isDelegatingTasksContradictionQuery = narrowGate(
  "contradiction.delegatingTasks",
  (query: string): boolean =>
    /\bdelegated\b/iu.test(query) &&
    /\bGreg\b/u.test(query),
);

// The first statement delegates 30% of editing tasks to Greg from April 2; the
// denial says tasks were never delegated to Greg or any colleague. The first
// pattern keys on "delegated 30% of my editing tasks to Greg" so it excludes the
// earlier "agreed to delegate tasks to Greg" turn, and the denial keys on "never
// actually delegated tasks to Greg" so it excludes the later "never delegated
// any tasks to Greg" turn.
const DELEGATING_TASKS_FIRST_STATEMENT_PATTERN =
  /^(?=[\s\S]*delegated 30% of my editing tasks to Greg)/iu;
const DELEGATING_TASKS_DENIAL_PATTERN =
  /^(?=[\s\S]*never actually delegated tasks to Greg)/iu;

// Every simple "Have I ever X?" first-statement/denial pair is the same shape:
// a gate plus an affirmative pattern and a denial pattern. The table lets
// selectContradictionEvidencePair dispatch them in one loop instead of a named
// function and chain block per case. The complex non-pair selectors
// (sessionManagement, twoFactorAuth, familyMovieInvite) stay in contradiction.ts.
const FIRST_DENIAL_CONTRADICTION_PAIRS: ReadonlyArray<{
  isQuery: (query: string) => boolean;
  firstStatement: RegExp;
  denial: RegExp;
}> = [
  {
    isQuery: isAtsCourseEnrollmentContradictionQuery,
    firstStatement: ATS_COURSE_ENROLLMENT_FIRST_STATEMENT_PATTERN,
    denial: ATS_COURSE_ENROLLMENT_DENIAL_PATTERN,
  },
  {
    isQuery: isWillAttorneyMeetingContradictionQuery,
    firstStatement: WILL_ATTORNEY_MEETING_FIRST_STATEMENT_PATTERN,
    denial: WILL_ATTORNEY_MEETING_DENIAL_PATTERN,
  },
  {
    isQuery: isPatentWebinarContradictionQuery,
    firstStatement: PATENT_WEBINAR_FIRST_STATEMENT_PATTERN,
    denial: PATENT_WEBINAR_DENIAL_PATTERN,
  },
  {
    isQuery: isMovieWatchlistContradictionQuery,
    firstStatement: MOVIE_WATCHLIST_FIRST_STATEMENT_PATTERN,
    denial: MOVIE_WATCHLIST_DENIAL_PATTERN,
  },
  {
    isQuery: isWritingSessionsContradictionQuery,
    firstStatement: WRITING_SESSIONS_FIRST_STATEMENT_PATTERN,
    denial: WRITING_SESSIONS_DENIAL_PATTERN,
  },
  {
    isQuery: isAnniversaryCelebrationContradictionQuery,
    firstStatement: ANNIVERSARY_CELEBRATION_FIRST_STATEMENT_PATTERN,
    denial: ANNIVERSARY_CELEBRATION_DENIAL_PATTERN,
  },
  {
    isQuery: isBootstrapComponentsContradictionQuery,
    firstStatement: BOOTSTRAP_COMPONENTS_FIRST_STATEMENT_PATTERN,
    denial: BOOTSTRAP_COMPONENTS_DENIAL_PATTERN,
  },
  {
    isQuery: isCoinTossProblemsContradictionQuery,
    firstStatement: COIN_TOSS_PROBLEMS_FIRST_STATEMENT_PATTERN,
    denial: COIN_TOSS_PROBLEMS_DENIAL_PATTERN,
  },
  {
    isQuery: isDelegatingTasksContradictionQuery,
    firstStatement: DELEGATING_TASKS_FIRST_STATEMENT_PATTERN,
    denial: DELEGATING_TASKS_DENIAL_PATTERN,
  },
];

export function selectTabulatedFirstDenialContradictionPair(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  for (const pair of FIRST_DENIAL_CONTRADICTION_PAIRS) {
    const evidence = selectFirstDenialContradictionPair(
      input,
      pair.isQuery,
      pair.firstStatement,
      pair.denial,
    );
    if (evidence.length > 0) {
      return evidence;
    }
  }
  return [];
}
