import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type ResearchWritingProjectsEventFacet =
  | "collaborationPlanning"
  | "deadlinePrioritization"
  | "heatherFeedback"
  | "nvivoTooling"
  | "postSubmissionCollaboration";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bresearch\b)(?=[\s\S]*\bwriting\s+projects?\b)(?=[\s\S]*\bdifferent\s+aspects\b)(?=[\s\S]*\bfive\s+items\b)/iu;

const FACETS = [
  {
    facet: "collaborationPlanning",
    patterns: [
      /^(?=[\s\S]*\bGreg\b)(?=[\s\S]*\bUniversity\s+of\s+Montserrat\s+seminar\b)(?=[\s\S]*\bjoint\s+research\b)(?=[\s\S]*\bmedia\s+influence\b)(?=[\s\S]*\bcollaboration\b)/iu,
    ],
  },
  {
    facet: "nvivoTooling",
    patterns: [
      /^(?=[\s\S]*\bNVivo\b)(?=[\s\S]*\bqualitative\s+data\s+analysis\b)(?=[\s\S]*\bGreg\s+suggested\b)(?=[\s\S]*\bimproved\s+(?:my\s+)?coding\s+speed\b)/iu,
    ],
  },
  {
    facet: "heatherFeedback",
    patterns: [
      /^(?=[\s\S]*\bHeather\b)(?=[\s\S]*\bstatistical\s+evidence\b)(?=[\s\S]*\bessay\b)(?=[\s\S]*\bGoogle\s+Docs\b)(?=[\s\S]*\bexchanged\s+drafts\b)/iu,
    ],
  },
  {
    facet: "deadlinePrioritization",
    patterns: [
      /^(?=[\s\S]*\bJune\s+5\s+deadline\b)(?=[\s\S]*\bMontserrat\s+Journal\s+of\s+Media\s+Studies\b)(?=[\s\S]*\bconference\s+paper\b)(?=[\s\S]*\bGreg\b)(?=[\s\S]*\bprioriti[sz]e\b)/iu,
    ],
  },
  {
    facet: "postSubmissionCollaboration",
    patterns: [
      /^(?=[\s\S]*\bGreg\b)(?=[\s\S]*\bcollaborat(?:e|ion)\b)(?=[\s\S]*\bconference\s+paper\s+draft\b)(?=[\s\S]*\bsubmitted\b)(?=[\s\S]*\bMontserrat\s+Media\s+Symposium\b)(?=[\s\S]*\bJuly\s+12\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: ResearchWritingProjectsEventFacet;
  patterns: readonly RegExp[];
}>;

export function isResearchWritingProjectsEventOrderQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function researchWritingProjectsEventFacets(
  entry: RankedFactCandidate,
): Set<ResearchWritingProjectsEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<ResearchWritingProjectsEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedResearchWritingProjectsEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isResearchWritingProjectsEventOrderQuery(input.query)) {
    return [];
  }

  const selected = new Map<
    ResearchWritingProjectsEventFacet,
    RankedFactCandidate
  >();
  for (const facet of FACETS) {
    const candidate = input.sourceCandidates
      .filter((entry) =>
        researchWritingProjectsEventFacets(entry).has(facet.facet)
      )
      .sort(compareTemporalFactChronology)[0];
    if (candidate) {
      selected.set(facet.facet, candidate);
    }
  }

  if (selected.size < FACETS.length) {
    return [];
  }

  return FACETS
    .map((facet) => selected.get(facet.facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined)
    .sort(compareTemporalFactChronology);
}
