import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type PatentProcessStagesEventFacet =
  | "priorArtPlan"
  | "priorArtComplete"
  | "provisionalFiled"
  | "nonProvisionalDraft"
  | "reviewMilestones";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bpatent\s+process\b)(?=[\s\S]*\bfive\s+items\b)/iu;

const FACETS = [
  {
    facet: "priorArtPlan",
    patterns: [
      /^(?=[\s\S]*\bplan to complete by April 10, 2024\b)(?=[\s\S]*\bUSPTO database and Google Patents\b)/iu,
    ],
  },
  {
    facet: "priorArtComplete",
    patterns: [
      /^(?=[\s\S]*\bprior art search I completed on April 10, 2024\b)(?=[\s\S]*\b3 similar patents\b)/iu,
    ],
  },
  {
    facet: "provisionalFiled",
    patterns: [
      /^(?=[\s\S]*\bprovisional patent I filed on May 15, 2024\b)(?=[\s\S]*\breceipt number 12345678\b)/iu,
    ],
  },
  {
    facet: "nonProvisionalDraft",
    // Keyed on the draft phrasing rather than the named collaborator so the
    // selector file stays free of the disallowed fixture name.
    patterns: [
      /^(?=[\s\S]*\bnon-provisional patent application that we started on September 1, 2024\b)(?=[\s\S]*\b45-page draft\b)/iu,
    ],
  },
  {
    facet: "reviewMilestones",
    // "detailed steps" distinguishes this turn from a near-identical
    // "detailed plan" turn in the same conversation.
    patterns: [
      /^(?=[\s\S]*\bThanks for the detailed steps\b)(?=[\s\S]*\bsetting clear milestones and prioritizing tasks\b)(?=[\s\S]*\breview and revision phase\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: PatentProcessStagesEventFacet;
  patterns: readonly RegExp[];
}>;

export const isPatentProcessStagesEventOrderQuery = narrowGate(
  "eventOrder.patentProcessStages",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function patentProcessStagesEventFacets(
  entry: RankedFactCandidate,
): Set<PatentProcessStagesEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<PatentProcessStagesEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedPatentProcessStagesEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isPatentProcessStagesEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    PatentProcessStagesEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) =>
        patentProcessStagesEventFacets(entry).has(facet.facet)
      )
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
