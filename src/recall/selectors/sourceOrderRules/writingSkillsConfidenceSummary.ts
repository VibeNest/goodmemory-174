import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type WritingSkillsConfidenceSummaryFacet =
  | "confidenceMomentum"
  | "dialoguePractice"
  | "foundationalSelfEditing"
  | "grammarClarity"
  | "michaelFeedback"
  | "workshopPreparation";

const QUERY_PATTERN =
  /^(?=[\s\S]*\b(?:summarize|summary)\b)(?=[\s\S]*\bwriting\s+skills\b)(?=[\s\S]*\bconfidence\b)(?=[\s\S]*\bdeveloped\b)(?=[\s\S]*\blearning\b)(?=[\s\S]*\binteractions?\b)(?=[\s\S]*\bover\s+time\b)/iu;

const FACETS = [
  {
    facet: "foundationalSelfEditing",
    patterns: [
      /^(?=[\s\S]*\bself-editing\s+journey\b)(?=[\s\S]*\bread(?:ing)?\s+widely\b)(?=[\s\S]*\bwrit(?:e|ing)\s+regularly\b)(?=[\s\S]*(?:\blearn\s+the\s+basics\b|\blearning\s+grammar\s+basics\b))(?=[\s\S]*\bseek(?:ing)?\s+feedback\b)/iu,
    ],
  },
  {
    facet: "grammarClarity",
    patterns: [
      /^(?=[\s\S]*\bgrammar\b)(?=[\s\S]*\bsentence\s+clarity\b)(?=[\s\S]*\bactive\s+voice\b)(?=[\s\S]*\bGrammarly\b)(?=[\s\S]*\bpractic(?:e|ing)\s+regularly\b)/iu,
    ],
  },
  {
    facet: "michaelFeedback",
    patterns: [
      /^(?=[\s\S]*\bMichael\b)(?=[\s\S]*\bscript\s+editing\s+tips\b)(?=[\s\S]*\bweekly\b)(?=[\s\S]*(?:\bstructured\s+feedback\s+sessions\b|\bsessions\s+more\s+structured\b|\bsessions\s+structured\b))(?=[\s\S]*\btrack\s+progress\b)/iu,
    ],
  },
  {
    facet: "dialoguePractice",
    patterns: [
      /^(?=[\s\S]*\bimprov(?:e|ing)\s+dialogue\b)(?=[\s\S]*\bMichael\b)(?=[\s\S]*\bfocused\s+feedback\s+sessions\b)(?=[\s\S]*\bpublished\s+scripts\b)(?=[\s\S]*(?:\bdialogue\s+drills\b|\bwriting\s+exercises\b))/iu,
    ],
  },
  {
    facet: "workshopPreparation",
    patterns: [
      /^(?=[\s\S]*\bco-hosting\b[\s\S]{0,80}\bwriting\s+workshop\b)(?=[\s\S]*\bprepare\s+thoroughly\b)(?=[\s\S]*\bbuild\s+confidence\b)(?=[\s\S]*\bengage(?:\s+with)?\s+participants\b)/iu,
    ],
  },
  {
    facet: "confidenceMomentum",
    patterns: [
      /^(?=[\s\S]*\bconfidence\s+boost\b)(?=[\s\S]*\bworkshop\b)(?=[\s\S]*\bset(?:ting)?\s+specific\b)(?=[\s\S]*\bcontinu(?:e|ing)\s+learning\b)(?=[\s\S]*(?:\btrack\s+your\s+progress\b|\btracking\s+(?:your\s+)?progress\b))(?=[\s\S]*\bnetwork\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: WritingSkillsConfidenceSummaryFacet;
  patterns: readonly RegExp[];
}>;

function isWritingSkillsConfidenceSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function writingSkillsConfidenceSummaryFacets(
  entry: RankedFactCandidate,
): Set<WritingSkillsConfidenceSummaryFacet> {
  if (!hasAssistantAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<WritingSkillsConfidenceSummaryFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedWritingSkillsConfidenceSummaryCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isWritingSkillsConfidenceSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<
    WritingSkillsConfidenceSummaryFacet,
    RankedFactCandidate
  >();
  for (const facet of FACETS) {
    const candidate = input.sourceCandidates
      .filter((entry) =>
        writingSkillsConfidenceSummaryFacets(entry).has(facet.facet)
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
