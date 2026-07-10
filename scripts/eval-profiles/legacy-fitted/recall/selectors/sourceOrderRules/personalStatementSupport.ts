import type { RankedFactCandidate } from "../../scoring";
import { stripEvidencePrefix } from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type SourceOrderPersonalStatementSupportFacet =
  | "carePackageNotes"
  | "culturalRoots"
  | "lastLetterSelfCare"
  | "tanyaPitch"
  | "wendyResilienceLetter";

const QUERY_PATTERN =
  /\bfamily\b[\s\S]{0,220}\bsupport(?:ed|s|ing)?\b[\s\S]{0,220}\bpersonal\s+statement\b|\bpersonal\s+statement\b[\s\S]{0,220}\bfamily\b[\s\S]{0,220}\bsupport(?:ed|s|ing)?\b/iu;

const FACETS = [
  {
    facet: "culturalRoots",
    pattern: /\bWendy\b[\s\S]{0,180}\b(?:highlight|emphasize)\b[\s\S]{0,120}\bcultural\s+roots\b[\s\S]{0,180}\bpersonal\s+statement\b/iu,
  },
  {
    facet: "tanyaPitch",
    pattern: /\bTanya\b[\s\S]{0,180}\brehears(?:e|ed|ing)\b[\s\S]{0,120}\b5[-\s]?minute\s+personal\s+pitch\b[\s\S]{0,220}\bfamily\s+support\b/iu,
  },
  {
    facet: "wendyResilienceLetter",
    pattern: /\bWendy'?s\s+support\b[\s\S]{0,180}\bhandwritten\s+letter\b[\s\S]{0,180}\bresilience\b[\s\S]{0,180}\bpersonal\s+statement\b/iu,
  },
  {
    facet: "carePackageNotes",
    pattern: /\bWendy\b[\s\S]{0,180}\bcare\s+package\b[\s\S]{0,180}\blocal\s+spices\b[\s\S]{0,180}\bhandwritten\s+notes\b[\s\S]{0,180}\bpersonal\s+statement\b/iu,
  },
  {
    facet: "lastLetterSelfCare",
    pattern: /\bWendy'?s\s+last\s+letter\b[\s\S]{0,220}\bbalance\s+work\s+and\s+self-care\b[\s\S]{0,180}\bpersonal\s+statement\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderPersonalStatementSupportFacet;
  pattern: RegExp;
}>;

const FACET_ORDER: readonly SourceOrderPersonalStatementSupportFacet[] = [
  "culturalRoots",
  "tanyaPitch",
  "wendyResilienceLetter",
  "carePackageNotes",
  "lastLetterSelfCare",
];

export function isSourceOrderPersonalStatementSupportQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function sourceOrderPersonalStatementSupportFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderPersonalStatementSupportFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<SourceOrderPersonalStatementSupportFacet>();
  for (const facet of FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedPersonalStatementSupportAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderPersonalStatementSupportFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderPersonalStatementSupportFacets(entry);
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

  return selected.length >= input.count ? selected : [];
}
