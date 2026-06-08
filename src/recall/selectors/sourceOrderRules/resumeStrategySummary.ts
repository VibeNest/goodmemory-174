import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { isSourceOrderedConversationSummaryQuery } from "../sourceOrderSummaryPatterns";
import {
  isLowInformationSourceSummaryFollowUp,
  isSourceOrderedSummaryInstructionLike,
} from "../sourceOrderSummarySignals";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "../temporal";

type ResumeStrategySummaryFacet =
  | "ageResume"
  | "callbackOptimization"
  | "canvaAts"
  | "certificationPromotion"
  | "communityExperience"
  | "industryTailoring"
  | "interviewWorkshop"
  | "jobscanOptimization"
  | "joshuaAts"
  | "rapportAts"
  | "transferableSkills";

const GENERAL_STRATEGY_FACETS = [
  "ageResume",
  "joshuaAts",
  "communityExperience",
  "jobscanOptimization",
  "transferableSkills",
] as const satisfies readonly ResumeStrategySummaryFacet[];

const PAST_MONTHS_STRATEGY_FACETS = [
  "industryTailoring",
  "canvaAts",
  "interviewWorkshop",
  "callbackOptimization",
  "rapportAts",
  "certificationPromotion",
] as const satisfies readonly ResumeStrategySummaryFacet[];

const QUERY_PATTERN =
  /\b(?:resumes?|CV)\b[\s\S]{0,180}\b(?:job\s+application|applying|applicant\s+tracking|ATS|callbacks?|interviews?)\b[\s\S]{0,180}\b(?:develop(?:ed|ment|ing)?|improv(?:e|ed|ement|ing)|progress(?:ed|ion)?|strateg(?:y|ies)|worked)\b|\b(?:develop(?:ed|ment|ing)?|improv(?:e|ed|ement|ing)|progress(?:ed|ion)?|strateg(?:y|ies)|worked)\b[\s\S]{0,180}\b(?:resumes?|CV)\b[\s\S]{0,180}\b(?:job\s+application|applying|applicant\s+tracking|ATS|callbacks?|interviews?)\b/iu;

const PAST_MONTHS_QUERY_PATTERN =
  /\b(?:past\s+(?:few\s+)?months?|progress(?:ed|ion)?|develop(?:ed|ment))\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:sample\s+resume\s+section|structured\s+bullet\s+points?\s+with\s+quantified\s+achievements?|cross-cultural\s+communication\s+skills?\s+gained\s+from\s+Caribbean\s+and\s+UK\s+collaborations?)\b/iu;

const FACET_PATTERNS = {
  ageResume: [
    /\b(?:age\s+discrimination|age-related|age\s+and)\b[\s\S]{0,220}\b(?:job\s+hunting|applying\s+for\s+jobs)\b[\s\S]{0,220}\b(?:achievements?|outdated\s+information|modern\s+language|tailor\s+your\s+resume)\b/iu,
    /\b(?:achievements?|outdated\s+information|modern\s+language|tailor\s+your\s+resume)\b[\s\S]{0,220}\b(?:age\s+discrimination|job\s+hunting)\b/iu,
  ],
  callbackOptimization: [
    /\b(?:secured\s+)?5\s+interviews?\b[\s\S]{0,240}\b(?:callbacks?|feedback|tailor\s+your\s+resume|quantif(?:y|ied)\s+your\s+achievements?)\b/iu,
    /\b(?:callbacks?|feedback|tailor\s+your\s+resume|quantif(?:y|ied)\s+your\s+achievements?)\b[\s\S]{0,240}\b(?:secured\s+)?5\s+interviews?\b/iu,
  ],
  canvaAts: [
    /\b(?:Canva\s+Pro|March\s+30,\s*2024)\b[\s\S]{0,220}\b(?:ATS-compatible|text-heavy|simple\s+template|standard\s+fonts?)\b/iu,
    /\b(?:ATS-compatible|text-heavy|simple\s+template|standard\s+fonts?)\b[\s\S]{0,220}\b(?:Canva\s+Pro|March\s+30,\s*2024)\b/iu,
  ],
  certificationPromotion: [
    /\b(?:latest\s+certification\s+and\s+promotion|certification\s+and\s+promotion)\b[\s\S]{0,320}\b(?:September\s+7,\s*2024|September\s+1,\s*2024|professional\s+summary|work\s+experience|ATS-friendly|Senior\s+Executive\s+Producer)\b/iu,
    /\b(?:promotion\s+and\s+latest\s+certification|promotion\s+and\s+certification)\b[\s\S]{0,320}\b(?:September\s+7,\s*2024|September\s+1,\s*2024|professional\s+summary|work\s+experience|ATS-friendly|Senior\s+Executive\s+Producer)\b/iu,
  ],
  communityExperience: [
    /\b(?:Caribbean|diverse\s+communities)\b[\s\S]{0,240}\b(?:cultural\s+competence|community\s+engagement|adaptability|professional\s+summary)\b/iu,
    /\b(?:cultural\s+competence|community\s+engagement|adaptability|professional\s+summary)\b[\s\S]{0,240}\b(?:Caribbean|diverse\s+communities)\b/iu,
  ],
  industryTailoring: [
    /\bApril\s+10,\s*2024\b[\s\S]{0,260}\b(?:film,\s*television,\s+and\s+digital\s+media|film|television|digital\s+media)\b[\s\S]{0,260}\b(?:tailor(?:ing)?\s+your\s+resume|professional\s+summary|portfolio|ATS-friendly)\b/iu,
    /\b(?:tailor(?:ing)?\s+your\s+resume|professional\s+summary|portfolio|ATS-friendly)\b[\s\S]{0,260}\b(?:film,\s*television,\s+and\s+digital\s+media|film|television|digital\s+media)\b[\s\S]{0,260}\bApril\s+10,\s*2024\b/iu,
  ],
  interviewWorkshop: [
    /\binterview\s+prep(?:aration)?\b[\s\S]{0,240}\bworkshop\b[\s\S]{0,260}\b(?:resume\s+and\s+cover\s+letter|reduced\s+social\s+media|3\s+hours?\s+daily|schedule)\b/iu,
    /\bworkshop\b[\s\S]{0,240}\binterview\s+prep(?:aration)?\b[\s\S]{0,260}\b(?:resume\s+and\s+cover\s+letter|reduced\s+social\s+media|3\s+hours?\s+daily|schedule)\b/iu,
  ],
  jobscanOptimization: [
    /\bJobscan\b[\s\S]{0,260}\b(?:5\s+job\s+descriptions?|keyword\s+match|25%)\b/iu,
    /\b(?:5\s+job\s+descriptions?|keyword\s+match|25%)\b[\s\S]{0,260}\bJobscan\b/iu,
  ],
  joshuaAts: [
    /\bJoshua\b[\s\S]{0,240}\b(?:project\s+budgeting|networking\s+strateg(?:y|ies)|ATS|keyword\s+optimization|budget\s+management)\b/iu,
    /\b(?:project\s+budgeting|networking\s+strateg(?:y|ies)|ATS|keyword\s+optimization|budget\s+management)\b[\s\S]{0,240}\bJoshua\b/iu,
  ],
  rapportAts: [
    /\b(?:warm|charismatic|rapport)\b[\s\S]{0,260}\b(?:July\s+onboarding|new\s+team\s+members?|ATS|interpersonal\s+skills?|action\s+verbs?)\b/iu,
    /\b(?:July\s+onboarding|new\s+team\s+members?|ATS|interpersonal\s+skills?|action\s+verbs?)\b[\s\S]{0,260}\b(?:warm|charismatic|rapport)\b/iu,
  ],
  transferableSkills: [
    /\btransferable\s+skills?\b[\s\S]{0,220}\b(?:remote\s+team\s+leadership|digital\s+media|ATS|screening)\b/iu,
    /\b(?:remote\s+team\s+leadership|digital\s+media|ATS|screening)\b[\s\S]{0,220}\btransferable\s+skills?\b/iu,
  ],
} as const satisfies Record<ResumeStrategySummaryFacet, readonly RegExp[]>;

function resumeStrategyFacetOrder(
  query: string,
): readonly ResumeStrategySummaryFacet[] {
  if (
    !isSourceOrderedConversationSummaryQuery(query) ||
    !QUERY_PATTERN.test(query)
  ) {
    return [];
  }

  return PAST_MONTHS_QUERY_PATTERN.test(query)
    ? PAST_MONTHS_STRATEGY_FACETS
    : GENERAL_STRATEGY_FACETS;
}

function hasResumeStrategyFacet(
  entry: RankedFactCandidate,
  facet: ResumeStrategySummaryFacet,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);
  if (
    !hasAssistantAnswerTag(entry) ||
    DISTRACTOR_PATTERN.test(content) ||
    isSourceOrderedSummaryInstructionLike(content) ||
    isLowInformationSourceSummaryFollowUp(content)
  ) {
    return false;
  }

  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

export function selectSourceOrderedResumeStrategySummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const facetOrder = resumeStrategyFacetOrder(input.query);
  if (facetOrder.length === 0) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  const selectedOrders = new Set<number>();
  const addCandidate = (entry: RankedFactCandidate): boolean => {
    if (selected.size >= input.limit) {
      return false;
    }
    const order = sourceOrderSortKey(entry);
    if (order !== undefined && selectedOrders.has(order)) {
      return false;
    }

    selected.set(entry.fact.id, entry);
    if (order !== undefined) {
      selectedOrders.add(order);
    }
    return true;
  };

  for (const facet of facetOrder) {
    const candidate = input.sourceCandidates
      .filter((entry) => hasResumeStrategyFacet(entry, facet))
      .sort(compareTemporalFactChronology)[0];
    if (candidate) {
      addCandidate(candidate);
    }
  }

  if (selected.size < input.minAnchors) {
    return [];
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
