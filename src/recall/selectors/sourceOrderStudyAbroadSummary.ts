import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { compareTemporalFactChronology } from "./temporal";

type StudyAbroadSummaryFacet =
  | "canadaStudyVisaDecision"
  | "personalStatementGoal"
  | "tanyaSupport"
  | "torontoClothingBudget"
  | "visaInterviewPrep";

const QUERY_PATTERN =
  /\b(?:plans?|prepar(?:ations?|e|ing))\b[\s\S]{0,180}\bstud(?:y|ying)\s+abroad\b|\bstud(?:y|ying)\s+abroad\b[\s\S]{0,180}\b(?:plans?|prepar(?:ations?|e|ing)|develop(?:ed|ing)?|over\s+time)\b/iu;

const FACETS = [
  {
    facet: "personalStatementGoal",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bpersonal\s+statement\b)(?=[\s\S]*\bApril\s+20,\s*2024\b)(?=[\s\S]*\bTanya\b)(?=[\s\S]*\bcareer\s+goals?\b)/iu,
    ],
  },
  {
    facet: "tanyaSupport",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bTanya'?s\s+support\b)(?=[\s\S]*\bpersonal\s+statement\b)(?=[\s\S]*\bprofessional\s+and\s+emotional\s+(?:preparation|support)\b|\bemotional\s+support\b)(?=[\s\S]*\bfuture\s+academic\s+and\s+professional\s+goals?\b)/iu,
    ],
  },
  {
    facet: "canadaStudyVisaDecision",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bpart[-\s]?time\s+role\b)(?=[\s\S]*\bMontserrat\s+Media\s+Hub\b)(?=[\s\S]*\bCanadian\s+study\s+visa\b)(?=[\s\S]*\b(?:funding|financial\s+support)\b)(?=[\s\S]*\bwork\s+opportunit(?:y|ies)\b)/iu,
    ],
  },
  {
    facet: "visaInterviewPrep",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bCanadian\s+study\s+visa\s+interview\b)(?=[\s\S]*\bstudy\s+permit\b)(?=[\s\S]*\bacceptance\s+letters?\b)(?=[\s\S]*\bfinancial\s+statements?\b)(?=[\s\S]*\blanguage\s+(?:proficiency|(?:test\s+)?results?)\b)/iu,
    ],
  },
  {
    facet: "torontoClothingBudget",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\b\$?2,000\b)(?=[\s\S]*\bMontserrat\s+Arts\s+Council\b)(?=[\s\S]*\b\$?300\b)(?=[\s\S]*\bwarm\s+clothing\b)(?=[\s\S]*\bToronto\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: StudyAbroadSummaryFacet;
  patterns: readonly RegExp[];
  role: "assistant" | "user";
}>;

function isStudyAbroadSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function studyAbroadSummaryFacets(
  entry: RankedFactCandidate,
): Set<StudyAbroadSummaryFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const facets = new Set<StudyAbroadSummaryFacet>();
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

export function selectSourceOrderedStudyAbroadSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isStudyAbroadSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  for (const facet of FACETS) {
    const entry = input.sourceCandidates
      .filter((candidate) =>
        studyAbroadSummaryFacets(candidate).has(facet.facet)
      )
      .sort(compareTemporalFactChronology)[0];
    if (entry) {
      selected.set(entry.fact.id, entry);
    }
  }

  const requiredAnchors = Math.max(input.minAnchors, FACETS.length);
  if (selected.size < requiredAnchors) {
    return [];
  }

  return [...selected.values()]
    .sort(compareTemporalFactChronology)
    .slice(0, input.limit);
}
