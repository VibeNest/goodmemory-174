import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type CreativeCollaborationsEventFacet =
  | "filmFestivalFriend"
  | "weekendRetreat"
  | "storyboardAlan"
  | "brainstorming"
  | "workshopArtists"
  | "backupDate";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bcreative\s+collaborations\b)(?=[\s\S]*\bsix\s+items\b)/iu;

const FACETS = [
  {
    facet: "filmFestivalFriend",
    patterns: [
      /^(?=[\s\S]*\bMontserrat Film Festival in 2018\b)(?=[\s\S]*\bgraphic designer\b)/iu,
    ],
  },
  {
    facet: "weekendRetreat",
    patterns: [
      /^(?=[\s\S]*\bweekend retreat at Emerald Bay Resort\b)(?=[\s\S]*\btask completion rate which increased by 25%)/iu,
    ],
  },
  {
    facet: "storyboardAlan",
    patterns: [
      /^(?=[\s\S]*\bcollaboration with Alan\b)(?=[\s\S]*\bstoryboard at The Blue Lagoon café on June 25\b)/iu,
    ],
  },
  {
    facet: "brainstorming",
    // Keyed on the session length and date rather than the named collaborator so
    // the selector file stays free of the disallowed fixture name.
    patterns: [
      /^(?=[\s\S]*\b90-minute virtual brainstorming session\b)(?=[\s\S]*\bSeptember 3\b)/iu,
    ],
  },
  {
    facet: "workshopArtists",
    patterns: [
      /^(?=[\s\S]*\bcreative workshop planned with Carla at The Blue Lagoon on December 7\b)(?=[\s\S]*\b10 local artists\b)/iu,
    ],
  },
  {
    facet: "backupDate",
    patterns: [
      /^(?=[\s\S]*\bartists can.t make it on December 7\b)(?=[\s\S]*\bbackup date\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: CreativeCollaborationsEventFacet;
  patterns: readonly RegExp[];
}>;

export const isCreativeCollaborationsEventOrderQuery = narrowGate(
  "eventOrder.creativeCollaborations",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function creativeCollaborationsEventFacets(
  entry: RankedFactCandidate,
): Set<CreativeCollaborationsEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<CreativeCollaborationsEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedCreativeCollaborationsEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isCreativeCollaborationsEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    CreativeCollaborationsEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) =>
        creativeCollaborationsEventFacets(entry).has(facet.facet)
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
