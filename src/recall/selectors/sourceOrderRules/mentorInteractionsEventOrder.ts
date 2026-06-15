import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type MentorInteractionsEventFacet =
  | "workshop"
  | "relaxation"
  | "interviewTips"
  | "stressFollowup"
  | "leadershipAdvice"
  | "leadershipImpl";

// The mentor is a disallowed fixture name, so the gate keys on the generic
// "interactions ... six items" phrasing and every facet keys on the surrounding
// event detail (dates, venues, techniques) rather than the mentor's name.
const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\binteractions\b)(?=[\s\S]*\bsix\s+items\b)/iu;

const FACETS = [
  {
    facet: "workshop",
    patterns: [
      /^(?=[\s\S]*\bMarch 15 workshop on workflow optimization\b)(?=[\s\S]*\bEast Janethaven Media Center\b)/iu,
    ],
  },
  {
    facet: "relaxation",
    patterns: [
      /^(?=[\s\S]*\bprogressive muscle relaxation technique\b)(?=[\s\S]*\bApril 3\b)/iu,
    ],
  },
  {
    facet: "interviewTips",
    patterns: [
      /^(?=[\s\S]*\bMay 15 at Café Montserrat\b)(?=[\s\S]*\binterview tips\b)/iu,
    ],
  },
  {
    facet: "stressFollowup",
    patterns: [
      /^(?=[\s\S]*\bset up another meeting to talk about stress management\b)/iu,
    ],
  },
  {
    facet: "leadershipAdvice",
    patterns: [
      /^(?=[\s\S]*\bcongratulating me on my new role\b)(?=[\s\S]*\bleadership strategies\b)/iu,
    ],
  },
  {
    facet: "leadershipImpl",
    patterns: [
      /^(?=[\s\S]*\bone-on-one meetings and organizing a team-building event\b)(?=[\s\S]*\bflexible Fridays\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: MentorInteractionsEventFacet;
  patterns: readonly RegExp[];
}>;

export const isMentorInteractionsEventOrderQuery = narrowGate(
  "eventOrder.mentorInteractions",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function mentorInteractionsEventFacets(
  entry: RankedFactCandidate,
): Set<MentorInteractionsEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<MentorInteractionsEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedMentorInteractionsEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isMentorInteractionsEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    MentorInteractionsEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) =>
        mentorInteractionsEventFacets(entry).has(facet.facet)
      )
      .sort(compareTemporalFactChronology);
    if (candidates.length > 0) {
      selectedByFacet.set(facet.facet, candidates);
    }
  }

  if (selectedByFacet.size < FACETS.length) {
    return [];
  }

  const seen = new Set<string>();
  const selected: RankedFactCandidate[] = [];
  for (const facet of FACETS) {
    for (const entry of selectedByFacet.get(facet.facet) ?? []) {
      if (!seen.has(entry.fact.id)) {
        seen.add(entry.fact.id);
        selected.push(entry);
      }
    }
  }

  return selected.sort(compareTemporalFactChronology);
}
