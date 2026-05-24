import type { RankedFactCandidate } from "../scoring";
import { stripEvidencePrefix } from "./selectionContext";
import { compareTemporalFactChronology } from "./temporal";

type SourceOrderFrameworkCustomizationFacet = "setup" | "styling" | "modal";

const QUERY_PATTERN =
  /\bframework\b[\s\S]{0,120}\b(?:customi[sz](?:e|ed|ing|ation)|integrat(?:e|ed|ing|ion))\b|\b(?:customi[sz](?:e|ed|ing|ation)|integrat(?:e|ed|ing|ion))\b[\s\S]{0,120}\bframework\b/iu;

const POSITIVE_PATTERN =
  /\b(?:bootstrap\s+5\.3\.0\s+CDN|btn-primary|custom\s+CSS|form-control|hover effects?|modal\s+accessibility|upgrade(?:d|s|ing)?\s+from\s+v?5\.3\.0\s+to\s+v?5\.3\.1)\b|\bresponsive\s+grid\b[\s\S]{0,120}\b(?:cards?|navbar)\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:API\s+integration|bundle\s+size|CSS\s+from\s+\d+\s+lines|deferr(?:ing|ed)?\s+unused|image\s+sizes?|ImageOptim|peer\s+review|refactor(?:ed|ing)?\s+CSS|redundant\s+selectors)\b/iu;

const FACETS = [
  {
    facet: "setup",
    pattern: /\bbootstrap\s+5\.3\.0\s+CDN\b|\bresponsive\s+grid\b[\s\S]{0,120}\b(?:cards?|navbar)\b/iu,
  },
  {
    facet: "styling",
    pattern: /\b(?:btn-primary|custom\s+CSS|form-control|hover effects?)\b/iu,
  },
  {
    facet: "modal",
    pattern: /\b(?:modal\s+accessibility|upgrade(?:d|s|ing)?\s+from\s+v?5\.3\.0\s+to\s+v?5\.3\.1)\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderFrameworkCustomizationFacet;
  pattern: RegExp;
}>;

const FACET_ORDER: readonly SourceOrderFrameworkCustomizationFacet[] = [
  "setup",
  "styling",
  "modal",
];

export function isSourceOrderFrameworkCustomizationQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

export function sourceOrderFrameworkCustomizationPriorityBonus(
  content: string,
): number {
  let priority = 0;
  if (POSITIVE_PATTERN.test(content)) {
    priority += 520;
  }
  if (DISTRACTOR_PATTERN.test(content)) {
    priority -= 520;
  }

  return priority;
}

function sourceOrderFrameworkCustomizationFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderFrameworkCustomizationFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (DISTRACTOR_PATTERN.test(content)) {
    return new Set();
  }

  const facets = new Set<SourceOrderFrameworkCustomizationFacet>();
  for (const facet of FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedFrameworkCustomizationAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderFrameworkCustomizationFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderFrameworkCustomizationFacets(entry);
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
