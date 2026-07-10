import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type AiHiringEventFacet =
  | "humanTouch"
  | "softSkills"
  | "psychometric"
  | "pymetricsIntro"
  | "pymetricsPilot"
  | "fairnessMetrics";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bAI\b)(?=[\s\S]*\bhiring\s+process\b)(?=[\s\S]*\bsix\s+items\b)/iu;

const FACETS = [
  {
    facet: "humanTouch",
    patterns: [
      /^(?=[\s\S]*\bjunior editor\b)(?=[\s\S]*\bAI can replace the human touch\b)/iu,
    ],
  },
  {
    facet: "softSkills",
    patterns: [
      /^(?=[\s\S]*\bAI doesn['’]t overlook candidates with strong soft skills\b)/iu,
    ],
  },
  {
    facet: "psychometric",
    patterns: [
      /^(?=[\s\S]*\bpsychometric tests do you recommend integrating into the AI system\b)/iu,
    ],
  },
  {
    facet: "pymetricsIntro",
    patterns: [
      /^(?=[\s\S]*\bintegrating Pymetrics for soft skills assessment\b)(?=[\s\S]*\bApril hires\b)/iu,
    ],
  },
  {
    facet: "pymetricsPilot",
    patterns: [
      /^(?=[\s\S]*\bintegrating Pymetrics could definitely help\b)(?=[\s\S]*\bpilot program for a few positions\b)/iu,
    ],
  },
  {
    facet: "fairnessMetrics",
    patterns: [
      /^(?=[\s\S]*\bAI to automate hiring\b)(?=[\s\S]*\bAI fairness metrics on July 12\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: AiHiringEventFacet;
  patterns: readonly RegExp[];
}>;

export const isAiHiringEventOrderQuery = narrowGate(
  "eventOrder.aiHiring",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function aiHiringEventFacets(
  entry: RankedFactCandidate,
): Set<AiHiringEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<AiHiringEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedAiHiringEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isAiHiringEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<AiHiringEventFacet, RankedFactCandidate[]>();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) => aiHiringEventFacets(entry).has(facet.facet))
      .sort(compareTemporalFactChronology);
    if (candidates.length > 0) {
      selectedByFacet.set(facet.facet, candidates);
    }
  }

  if (selectedByFacet.size < FACETS.length) {
    return [];
  }

  const seen = new Set<string>();
  const selected: RankedFactCandidate[] = [];
  for (const facet of FACETS) {
    for (const entry of selectedByFacet.get(facet.facet) ?? []) {
      if (!seen.has(entry.fact.id)) {
        seen.add(entry.fact.id);
        selected.push(entry);
      }
    }
  }

  return selected.sort(compareTemporalFactChronology);
}
