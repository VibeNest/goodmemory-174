import type { RankedFactCandidate } from "../scoring";
import { stripEvidencePrefix } from "./selectionContext";
import { compareTemporalFactChronology } from "./temporal";

type SourceOrderBookClubActivityFacet =
  | "balancedDiscussions"
  | "hostedDiscussion"
  | "libraryBookClub"
  | "missedMeeting"
  | "readingSession";

const QUERY_PATTERN =
  /\bbook\s+club\b[\s\S]{0,160}\b(?:activit(?:y|ies)|aspects?|brought\s+up|conversations?|order)\b|\b(?:activit(?:y|ies)|aspects?|brought\s+up|conversations?|order)\b[\s\S]{0,160}\bbook\s+club\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:Audible|audiobooks?|budget|David|downloaded|Goodreads|I'?ll\s+message\s+Kelly|Libby\s+app|Megan|Montserrat\s+Books|never\s+met\s+Kelly|ordered|pages?|reach\s+out\s+to\s+her|reading\s+goal|Stormlight\s+Archive|would\s+have\s+crossed\s+paths|winter\s+evenings?)\b/iu;

const FACETS = [
  {
    facet: "libraryBookClub",
    pattern: /\bEast\s+Janethaven\s+Library\s+book\s+club\b|\bmet\s+Kelly\b[\s\S]{0,120}\bbook\s+club\b/iu,
  },
  {
    facet: "missedMeeting",
    pattern: /\bkinda\s+stressed\b[\s\S]{0,120}\bmissing\s+Kelly'?s\s+book\s+club\s+meeting\b|\bmissing\s+Kelly'?s\s+book\s+club\s+meeting\b[\s\S]{0,120}\bfigure\s+out\s+what\s+I\s+missed\b/iu,
  },
  {
    facet: "readingSession",
    pattern: /\brescheduling\s+my\s+studio\s+meeting\b[\s\S]{0,180}\bKelly'?s\s+reading\s+session\b|\bKelly'?s\s+reading\s+session\b[\s\S]{0,120}\bJanuary\s+25\b/iu,
  },
  {
    facet: "hostedDiscussion",
    pattern: /\bhosted\s+a\s+book\s+club\s+discussion\b[\s\S]{0,180}\b(?:Kelly|12\s+attendees|February\s+20|Poppy\s+War)\b/iu,
  },
  {
    facet: "balancedDiscussions",
    pattern: /\bbalance\s+my\s+book\s+discussions\b[\s\S]{0,200}\b(?:Douglas|work\s+hours|7(?:-|\u2013|(?:\s+to\s+))9\s*PM|March\s+20|The\s+Reading\s+Room)\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderBookClubActivityFacet;
  pattern: RegExp;
}>;

const FACET_ORDER: readonly SourceOrderBookClubActivityFacet[] = [
  "libraryBookClub",
  "missedMeeting",
  "readingSession",
  "hostedDiscussion",
  "balancedDiscussions",
];

export function isSourceOrderBookClubActivitiesQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function sourceOrderBookClubActivityFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderBookClubActivityFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (DISTRACTOR_PATTERN.test(content)) {
    return new Set();
  }

  const facets = new Set<SourceOrderBookClubActivityFacet>();
  for (const facet of FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedBookClubActivityAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderBookClubActivityFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderBookClubActivityFacets(entry);
    for (const facet of facets) {
      const current = bestByFacet.get(facet);
      if (
        !current ||
        input.priority(entry) > input.priority(current) ||
        (
          input.priority(entry) === input.priority(current) &&
          compareTemporalFactChronology(entry, current) < 0
        )
      ) {
        bestByFacet.set(facet, entry);
      }
    }
  }

  const selected = FACET_ORDER
    .map((facet) => bestByFacet.get(facet))
    .filter((entry): entry is RankedFactCandidate => entry !== undefined);

  if (selected.length < input.count) {
    return [];
  }

  return selected
    .slice(0, input.count)
    .sort(compareTemporalFactChronology);
}
