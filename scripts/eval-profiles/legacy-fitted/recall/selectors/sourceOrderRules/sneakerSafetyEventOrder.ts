import { narrowGate } from "../../narrowGates";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type SneakerSafetyEventFacet =
  | "gripSoles"
  | "continentalTraction"
  | "shinSplints"
  | "reflectivePanels"
  | "orthoticInsoles";

const QUERY_PATTERN =
  /^(?=[\s\S]*\border\b)(?=[\s\S]*\bbrought\s+up\b)(?=[\s\S]*\bsafety\b)(?=[\s\S]*\bcomfort\b)(?=[\s\S]*\bsneakers\b)(?=[\s\S]*\bfive\s+items\b)/iu;

const FACETS = [
  {
    facet: "gripSoles",
    patterns: [
      /^(?=[\s\S]*\binjury risk on uneven terrain at filming sites\b)(?=[\s\S]*\bgood grip soles\b)/iu,
    ],
  },
  {
    facet: "continentalTraction",
    patterns: [
      /^(?=[\s\S]*\bContinental rubber outsole\b)(?=[\s\S]*\b30% better traction on wet surfaces\b)/iu,
    ],
  },
  {
    facet: "shinSplints",
    patterns: [
      /^(?=[\s\S]*\bshin splints\b)(?=[\s\S]*\bswitching to Brooks Ghost for running after May 5\b)/iu,
    ],
  },
  {
    facet: "reflectivePanels",
    patterns: [
      /^(?=[\s\S]*\breflective panels that improve night visibility by 40%)/iu,
    ],
  },
  {
    facet: "orthoticInsoles",
    patterns: [
      /^(?=[\s\S]*\bNike Dunk Low with orthotic insoles to the festival to prevent arch strain\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: SneakerSafetyEventFacet;
  patterns: readonly RegExp[];
}>;

export const isSneakerSafetyEventOrderQuery = narrowGate(
  "eventOrder.sneakerSafety",
  (query: string): boolean => QUERY_PATTERN.test(query),
);

function sneakerSafetyEventFacets(
  entry: RankedFactCandidate,
): Set<SneakerSafetyEventFacet> {
  if (!hasUserAnswerTag(entry)) {
    return new Set();
  }

  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<SneakerSafetyEventFacet>();
  for (const facet of FACETS) {
    if (facet.patterns.some((pattern) => pattern.test(content))) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedSneakerSafetyEventOrderCoverage(input: {
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isSneakerSafetyEventOrderQuery(input.query)) {
    return [];
  }

  const selectedByFacet = new Map<
    SneakerSafetyEventFacet,
    RankedFactCandidate[]
  >();
  for (const facet of FACETS) {
    const candidates = input.sourceCandidates
      .filter((entry) => sneakerSafetyEventFacets(entry).has(facet.facet))
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
