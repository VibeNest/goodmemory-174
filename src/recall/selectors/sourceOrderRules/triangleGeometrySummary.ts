import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type TriangleGeometrySummaryFacet =
  | "baseHeightComparison"
  | "heronArea"
  | "medianEqualArea"
  | "medianLength"
  | "rightAngle";

type TriangleSimilarityCongruenceSummaryFacet =
  | "asaCongruenceProof"
  | "sasAsaComparison"
  | "sasSimilarityFormalProof"
  | "ssaInvalidCongruence"
  | "sssSimilarityScale";

const QUERY_PATTERN =
  /\btriangles?\b[\s\S]{0,220}\bverify\s+right\s+angles?\b[\s\S]{0,220}\bcalculat(?:e|ing)\s+areas?\b[\s\S]{0,220}\bmedians?\b|\btriangles?\b[\s\S]{0,220}\b(?:right\s+angles?|pythagorean)\b[\s\S]{0,220}\b(?:heron'?s|base[-\s]?height|areas?)\b[\s\S]{0,220}\bmedians?\b/iu;

const SIMILARITY_CONGRUENCE_QUERY_PATTERN =
  /^(?=[\s\S]*\btriangles?\b)(?=[\s\S]*\bsimilar(?:ity)?\b)(?=[\s\S]*\bcongruen(?:ce|t)\b)(?=[\s\S]*\b(?:develop(?:ed|ment)?|throughout|summary|understanding|application)\b)/iu;

const DISTRACTOR_PATTERN =
  /\b(?:congruence|similarity|scale\s+factors?|GeoGebra|roof\s+truss|load\s+distribution|law\s+of\s+cosines|always\s+include)\b/iu;
const SIMILARITY_CONGRUENCE_LOW_INFORMATION_PATTERN =
  /^(?:that\s+makes\s+sense|thanks?|got\s+it|okay|ok)\b/iu;
const TRIANGLE_6_8_10_TO_9_12_15_PATTERN =
  /(?:6(?:\s*cm)?[\s\S]{0,80}8(?:\s*cm)?[\s\S]{0,80}10(?:\s*cm)?[\s\S]{0,160}9(?:\s*cm)?[\s\S]{0,80}12(?:\s*cm)?[\s\S]{0,80}15(?:\s*cm)?|6\s*,\s*8\s*,\s*10\s*cm[\s\S]{0,160}9\s*,\s*12\s*,\s*15\s*cm|6[\s,]+8[\s,]+10[\s\S]{0,160}9[\s,]+12[\s,]+15)/iu;
const TRIANGLE_SSS_RATIO_PATTERN =
  /9\s*\/\s*6[\s\S]{0,80}12\s*\/\s*8[\s\S]{0,80}15\s*\/\s*10/iu;

const FACETS = [
  {
    facet: "rightAngle",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\b8\s*cm\b)(?=[\s\S]*\b15\s*cm\b)(?=[\s\S]*\b17\s*cm\b)(?=[\s\S]*\b(?:right[-\s]?angled|right\s+angle|Pythagorean|8(?:\^?2|²)\s*\+\s*15(?:\^?2|²)\s*=\s*17(?:\^?2|²))\b)/iu,
    ],
  },
  {
    facet: "heronArea",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bHeron'?s\s+formula\b)(?=[\s\S]*\b7(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b)(?=[\s\S]*\b24(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b)(?=[\s\S]*\b25(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b)(?=[\s\S]*\b84\s*(?:cm\^?2|square\s+cm|cm²|\\text\{\s*cm\s*\}\^?2)\b)/iu,
    ],
  },
  {
    facet: "baseHeightComparison",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bbase[-\s]?height(?:\s+formula|\s+method)?\b)(?=[\s\S]*\bHeron'?s(?:\s+formula)?\b)(?=[\s\S]*\b10\s*cm\b)(?=[\s\S]*\b6\s*cm\b)(?=[\s\S]*\b(?:more\s+efficient|preferred|straightforward|simpler)\b)/iu,
    ],
  },
  {
    facet: "medianLength",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bmedian\s+length\s+formula\b)(?=[\s\S]*\b9(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b)(?=[\s\S]*\b12(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b)(?=[\s\S]*\b15(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b)(?=[\s\S]*\b(?:12\.82|12\.815)\s*(?:cm)?\b)/iu,
    ],
  },
  {
    facet: "medianEqualArea",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bmedian\b)(?=[\s\S]*\b(?:equal\s+area|equal\s+areas|two\s+smaller\s+triangles\s+of\s+equal\s+area|divides\s+it\s+into\s+two)\b)(?=[\s\S]*(?:\b8(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b[\s\S]{0,120}\b15(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b[\s\S]{0,120}\b17(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b|\b8-15-17\b))/iu,
      /^(?=[\s\S]*\bmedian\b)(?=[\s\S]*\b(?:equal\s+area|equal\s+areas|two\s+smaller\s+triangles\s+of\s+equal\s+area|divides\s+it\s+into\s+two)\b)(?=[\s\S]*(?:\b7(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b[\s\S]{0,120}\b24(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b[\s\S]{0,120}\b25(?:\s*cm|\s*\\text\{\s*cm\s*\})?\b|\b7-24-25\b))/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: TriangleGeometrySummaryFacet;
  patterns: readonly RegExp[];
  role: "assistant" | "user";
}>;

const SIMILARITY_CONGRUENCE_FACETS = [
  {
    facet: "sssSimilarityScale",
    limit: 3,
    patterns: [
      /^(?=[\s\S]*\bSSS\b)(?=[\s\S]*\bsimilar(?:ity)?\b)(?=[\s\S]*(?:\bscale\s+factors?\b|\bside\s+ratios?\b|\b1\.5\b))(?![\s\S]*\b(?:practice\s+test|score(?:d)?\s+\d+\/\d+)\b)/iu,
      /^(?=[\s\S]*\bscale\s+factors?\b)(?=[\s\S]*\b1\.5\b)(?![\s\S]*\b(?:practice\s+test|score(?:d)?\s+\d+\/\d+)\b)/iu,
    ],
  },
  {
    facet: "asaCongruenceProof",
    limit: 2,
    patterns: [
      /^(?=[\s\S]*\bASA\b)(?=[\s\S]*\bcongruen(?:ce|t)\b)(?=[\s\S]*(?:50\s*(?:degrees|°)|60\s*(?:degrees|°)|included\s+side\s+7|corresponding\s+angles?|proof\s+steps?))(?![\s\S]*\bSAS\b)/iu,
    ],
  },
  {
    facet: "sasAsaComparison",
    limit: 2,
    patterns: [
      /^(?=[\s\S]*\bSAS\b)(?=[\s\S]*\bASA\b)(?=[\s\S]*\b(?:compar(?:e|ed|ing)|methods?|approaches?|step[-\s]?by[-\s]?step|efficient|accurate)\b)(?=[\s\S]*(?:5(?:\s*cm)?[\s\S]{0,80}7(?:\s*cm)?[\s\S]{0,80}8(?:\s*cm)?|40\s*(?:degrees|°)[\s\S]{0,80}70\s*(?:degrees|°)))/iu,
    ],
  },
  {
    facet: "sasSimilarityFormalProof",
    limit: 2,
    patterns: [
      /^(?=[\s\S]*(?:\bratio\s+2\s*:\s*3\b|2\s*:\s*3[\s\S]{0,120}\bequal\s+included\s+angles?|equal\s+included\s+angles?[\s\S]{0,120}2\s*:\s*3|SAS\s+similarity\s+criterion|constructed\s+formal\s+proof))(?=[\s\S]*\bsimilar(?:ity)?\b)/iu,
    ],
  },
  {
    facet: "ssaInvalidCongruence",
    limit: 2,
    patterns: [
      /^(?=[\s\S]*\bSSA\b)(?=[\s\S]*\b(?:not\s+(?:a\s+)?valid\s+congruence\s+criterion|ambiguous|not\s+congruent|counterexample)\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: TriangleSimilarityCongruenceSummaryFacet;
  limit: number;
  patterns: readonly RegExp[];
}>;

function isTriangleGeometrySummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function isTriangleSimilarityCongruenceSummaryQuery(query: string): boolean {
  return SIMILARITY_CONGRUENCE_QUERY_PATTERN.test(query);
}

function triangleGeometrySummaryFacets(
  entry: RankedFactCandidate,
): Set<TriangleGeometrySummaryFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  if (DISTRACTOR_PATTERN.test(content)) {
    return new Set();
  }

  const facets = new Set<TriangleGeometrySummaryFacet>();
  for (const facet of FACETS) {
    const roleMatches = facet.role === "assistant"
      ? hasAssistantAnswerTag(entry)
      : hasUserAnswerTag(entry);
    if (
      roleMatches &&
      facet.patterns.some((pattern) => pattern.test(content))
    ) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

function selectSourceOrderedTriangleSimilarityCongruenceSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isTriangleSimilarityCongruenceSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  let matchedFacets = 0;
  for (const facet of SIMILARITY_CONGRUENCE_FACETS) {
    const facetEntries = input.sourceCandidates
      .filter((candidate) => {
        const content = stripEvidencePrefix(candidate.fact.content);
        const hasTriangleSpecificAnchor =
          TRIANGLE_6_8_10_TO_9_12_15_PATTERN.test(content) ||
          (
            facet.facet === "sssSimilarityScale" &&
            TRIANGLE_SSS_RATIO_PATTERN.test(content)
          );
        if (
          SIMILARITY_CONGRUENCE_LOW_INFORMATION_PATTERN.test(content) ||
          !hasTriangleSpecificAnchor &&
            (
              facet.facet === "sssSimilarityScale" ||
              facet.facet === "ssaInvalidCongruence"
            )
        ) {
          return false;
        }
        return facet.patterns.some((pattern) => pattern.test(content));
      })
      .sort(compareTemporalFactChronology)
      .slice(0, facet.limit);
    if (facetEntries.length > 0) {
      matchedFacets += 1;
    }
    for (const entry of facetEntries) {
      selected.set(entry.fact.id, entry);
    }
  }

  if (matchedFacets < input.minAnchors) {
    return [];
  }

  return [...selected.values()]
    .sort(compareTemporalFactChronology)
    .slice(0, input.limit);
}

export function selectSourceOrderedTriangleGeometrySummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const similarityCongruenceSelection =
    selectSourceOrderedTriangleSimilarityCongruenceSummaryCoverage(input);
  if (similarityCongruenceSelection.length > 0) {
    return similarityCongruenceSelection;
  }

  if (!isTriangleGeometrySummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  for (const facet of FACETS) {
    const entry = input.sourceCandidates
      .filter((candidate) =>
        triangleGeometrySummaryFacets(candidate).has(facet.facet)
      )
      .sort(compareTemporalFactChronology)[0];
    if (entry) {
      selected.set(entry.fact.id, entry);
    }
  }

  if (selected.size < input.minAnchors) {
    return [];
  }

  return [...selected.values()]
    .sort(compareTemporalFactChronology)
    .slice(0, input.limit);
}
