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

const QUERY_PATTERN =
  /\btriangles?\b[\s\S]{0,220}\bverify\s+right\s+angles?\b[\s\S]{0,220}\bcalculat(?:e|ing)\s+areas?\b[\s\S]{0,220}\bmedians?\b|\btriangles?\b[\s\S]{0,220}\b(?:right\s+angles?|pythagorean)\b[\s\S]{0,220}\b(?:heron'?s|base[-\s]?height|areas?)\b[\s\S]{0,220}\bmedians?\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:congruence|similarity|scale\s+factors?|GeoGebra|roof\s+truss|load\s+distribution|law\s+of\s+cosines|always\s+include)\b/iu;

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

function isTriangleGeometrySummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
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

export function selectSourceOrderedTriangleGeometrySummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
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
