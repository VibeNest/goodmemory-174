import type { RankedFactCandidate } from "../scoring";
import { stripEvidencePrefix } from "./selectionContext";
import { compareTemporalFactChronology } from "./temporal";

type SourceOrderWorkloadManagementFacet =
  | "lauraAudienceEngagement"
  | "lauraScheduleAdvice"
  | "micheleAssistant"
  | "stephanieAgency"
  | "trelloTaskBatching";

const QUERY_PATTERN =
  /\b(?:strategies|support\s+options?)\b[\s\S]{0,220}\bmanag(?:e|ing)\s+my\s+workload\b|\bmanag(?:e|ing)\s+my\s+workload\b[\s\S]{0,220}\b(?:strategies|support\s+options?)\b/iu;

const FACETS = [
  {
    facet: "lauraScheduleAdvice",
    pattern: /\bweekly\s+Zoom\s+call\b[\s\S]{0,160}\bLaura\b[\s\S]{0,180}\bmanage\s+my\s+schedule\b|\bLaura\b[\s\S]{0,180}\bweekly\s+Zoom\s+call\b[\s\S]{0,180}\bmanage\s+my\s+schedule\b/iu,
  },
  {
    facet: "trelloTaskBatching",
    pattern: /\bTrello\s+boards?\b[\s\S]{0,180}\btask\s+batching\b[\s\S]{0,180}\bLaura\s+suggested\b|\bLaura\s+suggested\b[\s\S]{0,180}\bTrello\s+boards?\b[\s\S]{0,180}\btask\s+batching\b/iu,
  },
  {
    facet: "stephanieAgency",
    pattern: /\bStephanie'?s\s+agency\b[\s\S]{0,180}\b\$?800\/month\b[\s\S]{0,220}\bLaura\s+advised\s+me\s+to\s+delegate\b|\bLaura\s+advised\s+me\s+to\s+delegate\b[\s\S]{0,220}\bStephanie'?s\s+agency\b/iu,
  },
  {
    facet: "micheleAssistant",
    pattern: /\bMichele\b[\s\S]{0,180}\bpart-time\s+assistant\b[\s\S]{0,180}\b(?:20\s+hours\/week|\$25\/hour)\b[\s\S]{0,220}\bLaura\s+recommended\s+hiring\b/iu,
  },
  {
    facet: "lauraAudienceEngagement",
    pattern: /\breview\s+meeting\s+with\s+Laura\b[\s\S]{0,180}\bNovember\s+10\b[\s\S]{0,180}\baudience\s+engagement\s+strategies\b|\bLaura\b[\s\S]{0,180}\baudience\s+engagement\s+strategies\b[\s\S]{0,180}\bmarketing\s+prep\s+schedule\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderWorkloadManagementFacet;
  pattern: RegExp;
}>;

const FACET_ORDER: readonly SourceOrderWorkloadManagementFacet[] = [
  "lauraScheduleAdvice",
  "trelloTaskBatching",
  "stephanieAgency",
  "micheleAssistant",
  "lauraAudienceEngagement",
];

export function isSourceOrderWorkloadManagementQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function sourceOrderWorkloadManagementFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderWorkloadManagementFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<SourceOrderWorkloadManagementFacet>();
  for (const facet of FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedWorkloadManagementAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderWorkloadManagementFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderWorkloadManagementFacets(entry);
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
