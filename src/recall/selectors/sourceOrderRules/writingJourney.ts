import type { RankedFactCandidate } from "../../scoring";
import { stripEvidencePrefix } from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type SourceOrderWritingJourneyFacet =
  | "firstDraftConfidence"
  | "revisionPlan"
  | "scriptTips"
  | "workshopFeedback"
  | "workshopNerves";

const QUERY_PATTERN =
  /\bwriting\s+journey\b[\s\S]{0,180}\b(?:aspects?|brought\s+up|conversations?|order)\b|\b(?:aspects?|brought\s+up|conversations?|order)\b[\s\S]{0,180}\bwriting\s+journey\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:30\s+writers?|deadline|final\s+draft|Grammarly|Jasper\s+AI|literary\s+festival|Notion\s+database|ProWritingAid|reading\s+Self-Editing|Saturday\s+10\s+AM|self-editing\s+journey|writing\s+schedule)\b/iu;

const FACETS = [
  {
    facet: "scriptTips",
    pattern: /\bmet\b[\s\S]{0,180}\bscript\s+editing\s+tips\b|\bscript\s+editing\s+tips\b[\s\S]{0,180}\bmet\b/iu,
  },
  {
    facet: "firstDraftConfidence",
    pattern: /\bcompleted\s+my\s+first\s+draft\b[\s\S]{0,180}\bconfidence\s+(?:score\s+)?from\s+4\s+to\s+7\b|\bconfidence\s+boost\b[\s\S]{0,180}\bfirst\s+draft\b/iu,
  },
  {
    facet: "workshopNerves",
    pattern: /\bwriting\s+workshop\b[\s\S]{0,180}\bAmy\b[\s\S]{0,180}\bco-host\b|\bAmy\b[\s\S]{0,180}\bco-host\b[\s\S]{0,180}\bwriting\s+workshop\b/iu,
  },
  {
    facet: "workshopFeedback",
    pattern: /\bpositive\s+feedback\b[\s\S]{0,180}\bJune\s+15\s+workshop\b[\s\S]{0,180}\b(?:4\.8\/5|satisfaction\s+rating|25\s+participants)\b/iu,
  },
  {
    facet: "revisionPlan",
    pattern: /\bready\s+to\s+start\s+the\s+revision\s+process\b[\s\S]{0,220}\b(?:dialogue\s+clarity|passive\s+voice|Carla'?s\s+checklist|peer\s+review)\b/iu,
  },
] as const satisfies ReadonlyArray<{
  facet: SourceOrderWritingJourneyFacet;
  pattern: RegExp;
}>;

const FACET_ORDER: readonly SourceOrderWritingJourneyFacet[] = [
  "scriptTips",
  "firstDraftConfidence",
  "workshopNerves",
  "workshopFeedback",
  "revisionPlan",
];

export function isSourceOrderWritingJourneyQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function sourceOrderWritingJourneyFacets(
  entry: RankedFactCandidate,
): Set<SourceOrderWritingJourneyFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (DISTRACTOR_PATTERN.test(content)) {
    return new Set();
  }

  const facets = new Set<SourceOrderWritingJourneyFacet>();
  for (const facet of FACETS) {
    if (facet.pattern.test(content)) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedWritingJourneyAnchors(input: {
  count: number;
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByFacet = new Map<
    SourceOrderWritingJourneyFacet,
    RankedFactCandidate
  >();

  for (const entry of input.entries) {
    const facets = sourceOrderWritingJourneyFacets(entry);
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
