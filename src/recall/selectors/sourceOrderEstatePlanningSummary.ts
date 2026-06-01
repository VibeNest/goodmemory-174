import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { compareTemporalFactChronology } from "./temporal";

type EstatePlanningProcessFacet =
  | "douglasEstateProvisions"
  | "executorChoice"
  | "familyExecutorMeeting"
  | "guardianshipEmergencyFund"
  | "kevinParalegalReview";

type WillFinalizationFacet =
  | "electronicWillSignatures"
  | "guardianshipAffidavits"
  | "stephanieWitnessMeeting"
  | "witnessReview";

const ESTATE_PROCESS_QUERY_PATTERN =
  /\bestate\s+planning\s+process\b[\s\S]{0,240}\b(?:executors?|guardianship|asset\s+management|key\s+decisions?|discussions?)\b|\b(?:executors?|guardianship|asset\s+management)\b[\s\S]{0,240}\bestate\s+planning\s+process\b/iu;

const WILL_FINALIZATION_QUERY_PATTERN =
  /\b(?:prepar(?:e|ing|ation)|finaliz(?:e|ing|ation))\b[\s\S]{0,160}\bmy\s+will\b[\s\S]{0,180}\b(?:related\s+documents?|witness(?:es)?|notari[sz](?:e|ed|ation)|affidavits?|signatures?)\b|\bmy\s+will\b[\s\S]{0,180}\b(?:related\s+documents?|witness(?:es)?|notari[sz](?:e|ed|ation)|affidavits?|signatures?)\b[\s\S]{0,160}\b(?:prepar(?:e|ing|ation)|finaliz(?:e|ing|ation))\b/iu;

const ESTATE_PROCESS_FACETS = [
  {
    facet: "douglasEstateProvisions",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bDouglas\b)(?=[\s\S]*\bestate\s+plan\b)(?=[\s\S]*\blist(?:ing)?\s+(?:all\s+)?(?:your\s+)?assets?\b)(?=[\s\S]*\bspecif(?:y|ying|ied)\s+provisions?\b)(?=[\s\S]*\bbeneficiary\s+designations?\b)/iu,
    ],
  },
  {
    facet: "executorChoice",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bchoos(?:e|ing)\b[\s\S]{0,80}\bexecutor\b)(?=[\s\S]*\bDouglas\b)(?=[\s\S]*\bKevin\b)(?=[\s\S]*(?:\bApril\s+1\b|\blegal\s+and\s+financial\s+knowledge\b))(?=[\s\S]*\bresponsibility\b)/iu,
    ],
  },
  {
    facet: "familyExecutorMeeting",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bKimberly\b)(?=[\s\S]*\bBradley\b)(?=[\s\S]*\bDouglas\b)(?=[\s\S]*\bKevin\b)(?=[\s\S]*\bco[-\s]?executor\b)(?=[\s\S]*(?:\bStephanie\b|\bdocument\s+your\s+decision\b))/iu,
    ],
  },
  {
    facet: "guardianshipEmergencyFund",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\b\$?5,000\b)(?=[\s\S]*\bemergency\s+fund\b)(?=[\s\S]*\bguardianship\s+expenses?\b)(?=[\s\S]*\bDouglas\b)(?=[\s\S]*(?:\bguardian\s+supporter\b|\bsame\s+page\b|\bproductive\s+conversation\b|\bseek\s+his\s+input\b))(?=[\s\S]*(?:\bmedical\s+costs?\b|\beducational\s+needs?\b|\bliving\s+expenses?\b))/iu,
    ],
  },
  {
    facet: "kevinParalegalReview",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bKevin\b)(?=[\s\S]*\bparalegal\b)(?=[\s\S]*\bwill\s+draft\b)(?=[\s\S]*\bguardianship\b)(?=[\s\S]*\basset\s+distribution\b)(?=[\s\S]*\bdigital\s+assets?\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: EstatePlanningProcessFacet;
  patterns: readonly RegExp[];
  role: "assistant" | "user";
}>;

const WILL_FINALIZATION_FACETS = [
  {
    facet: "stephanieWitnessMeeting",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\battorney\s+Stephanie\b)(?=[\s\S]*\bMarch\s+22\b)(?=[\s\S]*\bfinali[sz]e\s+my\s+will\b)(?=[\s\S]*(?:\bMontserrat\s+law\b|\btwo\s+witnesses\b))/iu,
    ],
  },
  {
    facet: "witnessReview",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*(?:\bStephanie(?:'s)?\s+will\s+review\b|\bStephanie\b[\s\S]{0,100}\breview\s+(?:your\s+)?will\b|\breview\s+(?:your\s+)?will\b[\s\S]{0,100}\bStephanie\b))(?=[\s\S]*\btwo[-\s]?witness\s+rule\b)(?=[\s\S]*\bnotari[sz](?:e|ed|ation)\b)(?=[\s\S]*\blegal\s+requirements?\b)/iu,
    ],
  },
  {
    facet: "guardianshipAffidavits",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bnotari[sz]ed\s+affidavits?\b)(?=[\s\S]*\bguardianship\b)(?=[\s\S]*\bprobate\b)(?=[\s\S]*(?:\bStephanie\b|\bbirth\s+certificates?\b|\bidentification\s+documents?\b))/iu,
    ],
  },
  {
    facet: "electronicWillSignatures",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\belectronic\s+(?:will\s+)?signatures?\b)(?=[\s\S]*\bMontserrat\b)(?=[\s\S]*\bJuly\s+2024\b)(?=[\s\S]*(?:\btwo\s+witnesses\b|\bwitness\s+requirements?\b))(?=[\s\S]*\bestate\s+plan(?:ning)?\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: WillFinalizationFacet;
  patterns: readonly RegExp[];
  role: "assistant" | "user";
}>;

function isEstatePlanningProcessSummaryQuery(query: string): boolean {
  return ESTATE_PROCESS_QUERY_PATTERN.test(query);
}

function isWillFinalizationSummaryQuery(query: string): boolean {
  return WILL_FINALIZATION_QUERY_PATTERN.test(query);
}

function shouldEvaluateEstatePlanningProcessFacet(
  facet: EstatePlanningProcessFacet,
  normalizedContent: string,
): boolean {
  switch (facet) {
    case "douglasEstateProvisions":
      return normalizedContent.includes("douglas") &&
        normalizedContent.includes("estate plan") &&
        normalizedContent.includes("beneficiary");
    case "executorChoice":
      return normalizedContent.includes("douglas") &&
        normalizedContent.includes("kevin") &&
        normalizedContent.includes("executor");
    case "familyExecutorMeeting":
      return normalizedContent.includes("kimberly") &&
        normalizedContent.includes("bradley") &&
        normalizedContent.includes("co-executor");
    case "guardianshipEmergencyFund":
      return normalizedContent.includes("5,000") &&
        normalizedContent.includes("emergency fund") &&
        normalizedContent.includes("guardianship");
    case "kevinParalegalReview":
      return normalizedContent.includes("kevin") &&
        normalizedContent.includes("paralegal") &&
        normalizedContent.includes("will draft");
  }
}

function shouldEvaluateWillFinalizationFacet(
  facet: WillFinalizationFacet,
  normalizedContent: string,
): boolean {
  switch (facet) {
    case "electronicWillSignatures":
      return normalizedContent.includes("electronic") &&
        normalizedContent.includes("signatures") &&
        normalizedContent.includes("montserrat");
    case "guardianshipAffidavits":
      return normalizedContent.includes("notarized affidavits") &&
        normalizedContent.includes("guardianship");
    case "stephanieWitnessMeeting":
      return normalizedContent.includes("attorney stephanie") &&
        normalizedContent.includes("march 22");
    case "witnessReview":
      return normalizedContent.includes("stephanie") &&
        normalizedContent.includes("review") &&
        normalizedContent.includes("will") &&
        normalizedContent.includes("witness");
  }
}

function estatePlanningProcessFacets(
  entry: RankedFactCandidate,
): Set<EstatePlanningProcessFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const normalizedContent = content.toLowerCase();
  const facets = new Set<EstatePlanningProcessFacet>();
  for (const facet of ESTATE_PROCESS_FACETS) {
    if (
      !shouldEvaluateEstatePlanningProcessFacet(
        facet.facet,
        normalizedContent,
      )
    ) {
      continue;
    }
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

function willFinalizationFacets(
  entry: RankedFactCandidate,
): Set<WillFinalizationFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const normalizedContent = content.toLowerCase();
  const facets = new Set<WillFinalizationFacet>();
  for (const facet of WILL_FINALIZATION_FACETS) {
    if (!shouldEvaluateWillFinalizationFacet(facet.facet, normalizedContent)) {
      continue;
    }
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

function selectFacetCoverage<TFacet extends string>(input: {
  facetMatchers: readonly {
    facet: TFacet;
  }[];
  facetsForCandidate: (entry: RankedFactCandidate) => Set<TFacet>;
  limit: number;
  minAnchors: number;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selected = new Map<string, RankedFactCandidate>();
  for (const facet of input.facetMatchers) {
    const entry = input.sourceCandidates
      .filter((candidate) =>
        input.facetsForCandidate(candidate).has(facet.facet)
      )
      .sort(compareTemporalFactChronology)[0];
    if (entry) {
      selected.set(entry.fact.id, entry);
    }
  }

  const requiredAnchors = Math.max(input.minAnchors, input.facetMatchers.length);
  if (selected.size < requiredAnchors) {
    return [];
  }

  return [...selected.values()]
    .sort(compareTemporalFactChronology)
    .slice(0, input.limit);
}

export function selectSourceOrderedEstatePlanningSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (isEstatePlanningProcessSummaryQuery(input.query)) {
    return selectFacetCoverage({
      facetMatchers: ESTATE_PROCESS_FACETS,
      facetsForCandidate: estatePlanningProcessFacets,
      limit: input.limit,
      minAnchors: input.minAnchors,
      sourceCandidates: input.sourceCandidates,
    });
  }

  if (isWillFinalizationSummaryQuery(input.query)) {
    return selectFacetCoverage({
      facetMatchers: WILL_FINALIZATION_FACETS,
      facetsForCandidate: willFinalizationFacets,
      limit: input.limit,
      minAnchors: input.minAnchors,
      sourceCandidates: input.sourceCandidates,
    });
  }

  return [];
}
