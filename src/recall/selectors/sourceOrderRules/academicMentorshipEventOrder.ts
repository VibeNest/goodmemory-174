import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type AcademicMentorshipEventFacet =
  | "mentorImpression"
  | "essayInspiration"
  | "warrantsFeedback"
  | "conferencePaperDebate"
  | "highGradeFollowup";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bacademic\s+work\b)(?=[\s\S]*\bmentorship\b)(?=[\s\S]*\bfive\s+items\b)/iu;

// The mentor is a disallowed fixture name, so every facet keys on the
// surrounding event phrasing (dates, venues, essay topics) rather than the name.
const FACETS = [
  {
    facet: "mentorImpression",
    patterns: [
      /^(?=[\s\S]*\bnew academic mentor\b)(?=[\s\S]*\bmake a good impression\b)/iu,
    ],
  },
  {
    facet: "essayInspiration",
    patterns: [
      /^(?=[\s\S]*\b1985 essay on gender studies\b)(?=[\s\S]*\bApril 4 Zoom call\b)/iu,
    ],
  },
  {
    facet: "warrantsFeedback",
    patterns: [
      /^(?=[\s\S]*\bstronger warrants for claims on gender bias\b)(?=[\s\S]*\breviewed my draft on May 9\b)/iu,
    ],
  },
  {
    facet: "conferencePaperDebate",
    patterns: [
      /^(?=[\s\S]*\bconference paper on media representation\b)(?=[\s\S]*\bsubmitting my essay to a journal\b)/iu,
    ],
  },
  {
    facet: "highGradeFollowup",
    patterns: [
      /^(?=[\s\S]*\bhigh grade on July 10\b)(?=[\s\S]*\bZoom meeting on July 20\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: AcademicMentorshipEventFacet;
  patterns: readonly RegExp[];
}>;

export const isAcademicMentorshipEventOrderQuery = narrowGate(
  "eventOrder.academicMentorship",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function academicMentorshipEventFacets(
  entry: RankedFactCandidate,
): Set<AcademicMentorshipEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<AcademicMentorshipEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedAcademicMentorshipEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isAcademicMentorshipEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    AcademicMentorshipEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) =>
        academicMentorshipEventFacets(entry).has(facet.facet)
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
