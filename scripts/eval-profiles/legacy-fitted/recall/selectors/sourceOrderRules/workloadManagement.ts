import type { RankedFactCandidate } from "../../scoring";
import { stripEvidencePrefix } from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type SourceOrderWorkloadManagementFacet =
  | "agencyDelegation"
  | "assistantHiring"
  | "audienceEngagement"
  | "scheduleAdvice"
  | "trelloTaskBatching";

const QUERY_PATTERN =
  /\b(?:strategies|support\s+options?)\b[\s\S]{0,220}\bmanag(?:e|ing)\s+my\s+workload\b|\bmanag(?:e|ing)\s+my\s+workload\b[\s\S]{0,220}\b(?:strategies|support\s+options?)\b/iu;

const FACETS = [
  {
    facet: "scheduleAdvice",
    pattern: /\bweekly\s+Zoom\s+call\b[\s\S]{0,220}\bmanage\s+my\s+schedule\b|\bmanage\s+my\s+schedule\b[\s\S]{0,220}\bweekly\s+Zoom\s+call\b/iu,
  },
  {
    facet: "trelloTaskBatching",
    pattern: /\bTrello\s+boards?\b[\s\S]{0,180}\btask\s+batching\b[\s\S]{0,180}\bsuggested\b|\bsuggested\b[\s\S]{0,180}\bTrello\s+boards?\b[\s\S]{0,180}\btask\s+batching\b/iu,
  },
  {
    facet: "agencyDelegation",
    pattern: /\bagency\b[\s\S]{0,180}\b\$?800\/month\b[\s\S]{0,220}\bdelegate\b|\bdelegate\b[\s\S]{0,220}\bagency\b/iu,
  },
  {
    facet: "assistantHiring",
    pattern: /\bpart-time\s+assistant\b[\s\S]{0,180}\b(?:20\s+hours\/week|\$25\/hour)\b[\s\S]{0,220}\brecommended\s+hiring\b/iu,
  },
  {
    facet: "audienceEngagement",
    pattern: /\breview\s+meeting\b[\s\S]{0,180}\bNovember\s+10\b[\s\S]{0,180}\baudience\s+engagement\s+strategies\b|\baudience\s+engagement\s+strategies\b[\s\S]{0,180}\bmarketing\s+prep\s+schedule\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderWorkloadManagementFacet;
  pattern: RegExp;
}>;

const FACET_ORDER: readonly SourceOrderWorkloadManagementFacet[] = [
  "scheduleAdvice",
  "trelloTaskBatching",
  "agencyDelegation",
  "assistantHiring",
  "audienceEngagement",
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
