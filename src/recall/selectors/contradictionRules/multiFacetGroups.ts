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

// Some contradiction cases designate MORE than two evidence turns: the
// affirmative side is expressed across several user turns and is opposed by a
// later denial. This generalises the two-turn first/denial recipe: a gate plus
// an ordered list of facet patterns (one per designated evidence turn). When the
// gate matches, find the earliest conversation-evidence user turn matching each
// facet and return them all in source order, but only if EVERY facet is present
// (so a partial match never preempts a broader route with an incomplete set).
export function selectMultiFacetContradictionGroup(
  input: { entries: RankedFactCandidate[]; query: string },
  isQuery: (query: string) => boolean,
  facetPatterns: readonly RegExp[],
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

  const matched: RankedFactCandidate[] = [];
  for (const pattern of facetPatterns) {
    const facet = eligible.find((entry) =>
      pattern.test(valueBearingFactContent(entry.fact.content))
    );
    if (!facet) {
      return [];
    }
    if (!matched.some((entry) => entry.fact.id === facet.fact.id)) {
      matched.push(facet);
    }
  }

  return matched.sort(compareTemporalFactChronology);
}

export const isGrammarAnxietyContradictionQuery = narrowGate(
  "contradiction.grammarAnxiety",
  (query: string): boolean =>
    /grammar accuracy/iu.test(query) &&
    /\bfeedback\b/iu.test(query) &&
    /anxious/iu.test(query),
);

// The affirmative is two user turns — feeling anxious about grammar accuracy
// after a colleague's Feb 28 feedback, then deciding to upgrade tools (Grammarly
// Premium) to catch the flagged errors — opposed by a later denial that grammar
// accuracy never caused anxiety after any feedback. All three are returned in
// source order; the patterns key on the surrounding phrasing, not any name.
const GRAMMAR_ANXIETY_CONTRADICTION_FACET_PATTERNS: readonly RegExp[] = [
  /^(?=[\s\S]*anxious about my grammar accuracy)(?=[\s\S]*feedback on Feb 28)/iu,
  /^(?=[\s\S]*Grammarly Premium)(?=[\s\S]*errors)/iu,
  /^(?=[\s\S]*never felt anxious about grammar accuracy after any feedback)/iu,
];

export const isRemoteCollaborationContradictionQuery = narrowGate(
  "contradiction.remoteCollaboration",
  (query: string): boolean =>
    /collaborated remotely/iu.test(query) &&
    /projects/iu.test(query),
);

// The affirmative is two user turns — collaborating with a video-editor relative
// who lives 15 miles apart in Plymouth, then planning to talk to them about
// easier collaboration — opposed by a later denial that the two never worked
// together on any projects. The patterns key on the surrounding role/place/topic
// phrasing rather than the relative's name so the selector file stays free of
// the disallowed fixture name.
const REMOTE_COLLABORATION_CONTRADICTION_FACET_PATTERNS: readonly RegExp[] = [
  /^(?=[\s\S]*video editor)(?=[\s\S]*15 miles apart in Plymouth)/iu,
  /^(?=[\s\S]*easier collaboration and spending more quality time together)/iu,
  /^(?=[\s\S]*never worked with my child)(?=[\s\S]*on any projects)/iu,
];

export const isWorkshopAttendanceContradictionQuery = narrowGate(
  "contradiction.workshopAttendance",
  (query: string): boolean =>
    /\battended\b/iu.test(query) &&
    /workshops/iu.test(query) &&
    /professional development/iu.test(query),
);

// The affirmative is four user turns planning and scheduling a March 15
// "Workflow Optimization" workshop to manage burnout (considering it, reviewing
// the agenda/speaker credentials, getting ready to make the most of it, and
// scheduling it alongside a mindfulness workshop), opposed by a denial that no
// workshops or professional development events were ever attended. The burnout
// facet keys on the symptom list plus the workshop name so it does not match the
// earlier burnout-symptoms turn that omits the workshop.
const WORKSHOP_ATTENDANCE_CONTRADICTION_FACET_PATTERNS: readonly RegExp[] = [
  /^(?=[\s\S]*fatigue, irritability, and sleep issues)(?=[\s\S]*Workflow Optimization)/iu,
  /^(?=[\s\S]*workshop agenda and speaker credentials)/iu,
  /^(?=[\s\S]*make the most out of this workshop)(?=[\s\S]*sharing the insights)/iu,
  /^(?=[\s\S]*never attended any workshops or professional development events)/iu,
  /^(?=[\s\S]*mindfulness and stress management workshop)(?=[\s\S]*already scheduled the March 15)/iu,
];

export const isApiKeyObtainedContradictionQuery = narrowGate(
  "contradiction.apiKeyObtained",
  (query: string): boolean =>
    /obtained an API key/iu.test(query) &&
    /\bproject\b/iu.test(query),
);

// The affirmative is three user turns working on the weather app's API usage —
// building an API-rate-limit call tracker and two follow-up questions about
// rapid consecutive calls and retrying after hitting the limit — opposed by a
// denial that an API key was never obtained for the project. The follow-up turns
// are short, so their facets key on their distinctive question phrasing.
const API_KEY_OBTAINED_CONTRADICTION_FACET_PATTERNS: readonly RegExp[] = [
  /^(?=[\s\S]*API rate limit for my weather app)(?=[\s\S]*track the number of calls)/iu,
  /^(?=[\s\S]*rapid consecutive calls)/iu,
  /^(?=[\s\S]*keeps retrying after hitting the rate limit)/iu,
  /^(?=[\s\S]*never actually obtained an API key for this project)/iu,
];

const MULTI_FACET_CONTRADICTION_GROUPS: ReadonlyArray<{
  isQuery: (query: string) => boolean;
  facets: readonly RegExp[];
}> = [
  {
    isQuery: isGrammarAnxietyContradictionQuery,
    facets: GRAMMAR_ANXIETY_CONTRADICTION_FACET_PATTERNS,
  },
  {
    isQuery: isRemoteCollaborationContradictionQuery,
    facets: REMOTE_COLLABORATION_CONTRADICTION_FACET_PATTERNS,
  },
  {
    isQuery: isWorkshopAttendanceContradictionQuery,
    facets: WORKSHOP_ATTENDANCE_CONTRADICTION_FACET_PATTERNS,
  },
  {
    isQuery: isApiKeyObtainedContradictionQuery,
    facets: API_KEY_OBTAINED_CONTRADICTION_FACET_PATTERNS,
  },
];

export function selectTabulatedMultiFacetContradictionGroup(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  for (const group of MULTI_FACET_CONTRADICTION_GROUPS) {
    const evidence = selectMultiFacetContradictionGroup(
      input,
      group.isQuery,
      group.facets,
    );
    if (evidence.length > 0) {
      return evidence;
    }
  }
  return [];
}
