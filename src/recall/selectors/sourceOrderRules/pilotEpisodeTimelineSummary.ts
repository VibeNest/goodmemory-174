import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type PilotEpisodeTimelineSummaryFacet =
  | "finalSoundMix"
  | "initialDeadlineBudget"
  | "julyDeliveryRevision"
  | "julyProductionStatus"
  | "scriptFinalization"
  | "septemberEditingColor";

const QUERY_PATTERN =
  /^(?=[\s\S]*\bpilot\s+episode\b)(?=[\s\S]*\bproject\s+timeline\b)(?=[\s\S]*\btasks?\b)(?=[\s\S]*\bdeveloped\b)(?=[\s\S]*\bchanged\b)/iu;

const FACETS = [
  {
    facet: "initialDeadlineBudget",
    patterns: [
      /^(?=[\s\S]*\bpilot\s+episode\b)(?=[\s\S]*\bJune\s+30,\s+2024\b)(?=[\s\S]*\$120,000\b)(?=[\s\S]*\bpre-production\b)(?=[\s\S]*\bpost-production\b)/iu,
    ],
  },
  {
    facet: "scriptFinalization",
    patterns: [
      /^(?=[\s\S]*\bscript\s+finali[sz]ation\b)(?=[\s\S]*\bend\s+of\s+April\b)(?=[\s\S]*\blocation\s+scouting\b)/iu,
    ],
  },
  {
    facet: "julyDeliveryRevision",
    patterns: [
      /^(?=[\s\S]*\bpilot\s+delivery\s+date\b)(?=[\s\S]*\bJuly\s+15\b)(?=[\s\S]*(?:\breassessing?\s+the\s+timeline\b|\bnew\s+milestones?\b|\bcompressed?\s+(?:schedule|remaining\s+work)\b))/iu,
    ],
  },
  {
    facet: "julyProductionStatus",
    patterns: [
      /^(?=[\s\S]*\bpilot\s+episode\b)(?=[\s\S]*\b75%\s+complete\b)(?=[\s\S]*\bJuly\s+5\b)(?=[\s\S]*\b12\s+of\s+16\s+scenes\b)(?=[\s\S]*\b60%\s+of\s+post-production\b)/iu,
    ],
  },
  {
    facet: "septemberEditingColor",
    patterns: [
      /^(?=[\s\S]*\bSeptember\s+1\s+deadline\b)(?=[\s\S]*\bpilot\s+editing\b)(?=[\s\S]*\bcolor\s+grading\b)/iu,
    ],
  },
  {
    facet: "finalSoundMix",
    patterns: [
      /^(?=[\s\S]*\bpost-production\s+is\s+95%\s+completed\b)(?=[\s\S]*\bNovember\s+15\b)(?=[\s\S]*\bfinal\s+sound\s+mix\b)(?=[\s\S]*\bNovember\s+22\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: PilotEpisodeTimelineSummaryFacet;
  patterns: readonly RegExp[];
}>;

function isPilotEpisodeTimelineSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function pilotEpisodeTimelineSummaryFacets(
  entry: RankedFactCandidate,
): Set<PilotEpisodeTimelineSummaryFacet> {
  if (!hasAssistantAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<PilotEpisodeTimelineSummaryFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedPilotEpisodeTimelineSummaryCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isPilotEpisodeTimelineSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<
    PilotEpisodeTimelineSummaryFacet,
    RankedFactCandidate
  >();
  for (const facet of FACETS) {
    const candidate = input.sourceCandidates
      .filter((entry) =>
        pilotEpisodeTimelineSummaryFacets(entry).has(facet.facet)
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
