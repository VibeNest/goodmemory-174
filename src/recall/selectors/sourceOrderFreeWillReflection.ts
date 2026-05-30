import type { RankedFactCandidate } from "../scoring";
import { stripEvidencePrefix } from "./selectionContext";
import { compareTemporalFactChronology } from "./temporal";

type SourceOrderFreeWillReflectionFacet =
  | "accountabilityShelly"
  | "dennettBook"
  | "experienceMachine"
  | "shipTheseus"
  | "softDeterminismJournaling"
  | "trolleyDebate";

const QUERY_PATTERN =
  /\bfree\s+will\b[\s\S]{0,180}\bpersonal\s+reflection\b[\s\S]{0,180}\b(?:ideas?|order|conversations?)\b|\bpersonal\s+reflection\b[\s\S]{0,180}\bfree\s+will\b[\s\S]{0,180}\b(?:ideas?|order|conversations?)\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:divine\s+intervention|emotional\s+tone|logical\s+reasoning|moral\s+dilemmas?|weekly\s+check-ins?|writing\s+fiction)\b/iu;

const FACETS = [
  {
    facet: "dennettBook",
    pattern: /\bDaniel\s+Dennett\b[\s\S]{0,180}\bFreedom\s+Evolves\b|\bFreedom\s+Evolves\b[\s\S]{0,180}\bDaniel\s+Dennett\b/iu,
  },
  {
    facet: "trolleyDebate",
    pattern: /\bTrolley\s+Problem\b[\s\S]{0,220}\b(?:Blue\s+Lagoon|free\s+will)\b|\b(?:Blue\s+Lagoon|free\s+will)\b[\s\S]{0,220}\bTrolley\s+Problem\b/iu,
  },
  {
    facet: "softDeterminismJournaling",
    pattern: /\bsoft\s+determinism\b[\s\S]{0,220}\bdaily\s+journaling\b|\bdaily\s+journaling\b[\s\S]{0,220}\bsoft\s+determinism\b/iu,
  },
  {
    facet: "experienceMachine",
    pattern: /\bExperience\s+Machine\b[\s\S]{0,220}\b(?:simulated\s+happiness|authentic\s+free\s+will)\b|\b(?:simulated\s+happiness|authentic\s+free\s+will)\b[\s\S]{0,220}\bExperience\s+Machine\b/iu,
  },
  {
    facet: "accountabilityShelly",
    pattern: /\bShelly\b[\s\S]{0,240}\bincompatibilism\b[\s\S]{0,240}\b(?:accountable|past\s+mistakes|declining\s+that\s+bonus)\b|\b(?:accountable|past\s+mistakes|declining\s+that\s+bonus)\b[\s\S]{0,240}\bShelly\b[\s\S]{0,240}\bincompatibilism\b/iu,
  },
  {
    facet: "shipTheseus",
    pattern: /\bShip\s+of\s+Theseus\b[\s\S]{0,220}\b(?:identity|change|career|life\s+choices)\b|\b(?:identity|change|career|life\s+choices)\b[\s\S]{0,220}\bShip\s+of\s+Theseus\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderFreeWillReflectionFacet;
  pattern: RegExp;
}>;

const FACET_ORDER: readonly SourceOrderFreeWillReflectionFacet[] = [
  "dennettBook",
  "trolleyDebate",
  "softDeterminismJournaling",
  "experienceMachine",
  "accountabilityShelly",
  "shipTheseus",
];

export function isSourceOrderFreeWillReflectionQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function sourceOrderFreeWillReflectionFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderFreeWillReflectionFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (DISTRACTOR_PATTERN.test(content)) {
    return new Set();
  }

  const facets = new Set<SourceOrderFreeWillReflectionFacet>();
  for (const facet of FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedFreeWillReflectionAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderFreeWillReflectionFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderFreeWillReflectionFacets(entry);
    for (const facet of facets) {
      const current = bestByFacet.get(facet);
      if (
        !current ||
        compareTemporalFactChronology(entry, current) < 0 ||
        (
          compareTemporalFactChronology(entry, current) === 0 &&
          input.priority(entry) > input.priority(current)
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
