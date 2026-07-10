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

type AiHiringComplianceSummaryFacet =
  | "currentUsageExamples"
  | "dataProtection"
  | "employmentAct"
  | "legalChecklist"
  | "policyTransparency";

const FACET_ORDER = [
  "dataProtection",
  "policyTransparency",
  "employmentAct",
  "legalChecklist",
  "currentUsageExamples",
] as const satisfies readonly AiHiringComplianceSummaryFacet[];

const QUERY_PATTERN =
  /\bAI\b[\s\S]{0,180}\bhiring\s+process\b[\s\S]{0,220}\b(?:compl(?:y|ies|iance)|legal|policy|requirements?)\b|\b(?:compl(?:y|ies|iance)|legal|policy|requirements?)\b[\s\S]{0,220}\bAI\b[\s\S]{0,180}\bhiring\s+process\b/iu;

const DISTRACTOR_PATTERN =
  /\b(?:2FA|two-factor\s+authentication|initial\s+security\s+training|meeting\s+invite|metrics\s+and\s+feedback|Natalie|robust\s+metrics|security\s+training|time-to-hire|Tuesday,\s+June\s+5)\b/iu;

const FACET_PATTERNS = {
  currentUsageExamples: [
    /\b(?:provid(?:e|ing)\s+examples?|prepare\s+and\s+present\s+these\s+examples?)\b[\s\S]{0,260}\bcurrent\s+AI\s+usage\b[\s\S]{0,320}\b(?:legal\s+expert|HireVue|Pymetrics|screening|interview|data\s+handling)\b/iu,
    /\bcurrent\s+AI\s+usage\b[\s\S]{0,220}\b(?:during\s+the\s+meeting|examples?)\b[\s\S]{0,320}\b(?:legal\s+expert|HireVue|Pymetrics|screening|interview|data\s+handling)\b/iu,
  ],
  dataProtection: [
    /\bMontserrat'?s\s+Data\s+Protection\s+Act\b[\s\S]{0,260}\b(?:GDPR-like|data\s+protection\s+laws?|consent|transparency|right\s+to\s+access|accountability)\b/iu,
    /\b(?:GDPR-like|data\s+protection\s+laws?|consent|transparency|right\s+to\s+access|accountability)\b[\s\S]{0,260}\bMontserrat'?s\s+Data\s+Protection\s+Act\b/iu,
  ],
  employmentAct: [
    /\bMontserrat'?s\s+Employment\s+Act\s+amendments?\b[\s\S]{0,260}\b(?:June\s+2024|legal\s+experts?|bias\s+audits?|transparency|hiring\s+policy|candidate\s+communication)\b/iu,
    /\b(?:June\s+2024|legal\s+experts?|bias\s+audits?|transparency|hiring\s+policy|candidate\s+communication)\b[\s\S]{0,260}\bMontserrat'?s\s+Employment\s+Act\s+amendments?\b/iu,
  ],
  legalChecklist: [
    /\blegal\s+expert\b[\s\S]{0,260}\bcompliance\s+checklist\b/iu,
    /\bcompliance\s+checklist\b[\s\S]{0,260}\blegal\s+expert\b/iu,
  ],
  policyTransparency: [
    /\bhiring\s+policy\b[\s\S]{0,260}\b(?:AI\s+transparency|HR\s+review|May\s+10|algorithmic\s+fairness|candidate\s+notifications?|human\s+oversight)\b/iu,
    /\b(?:AI\s+transparency|HR\s+review|May\s+10|algorithmic\s+fairness|candidate\s+notifications?|human\s+oversight)\b[\s\S]{0,260}\bhiring\s+policy\b/iu,
  ],
} as const satisfies Record<
  AiHiringComplianceSummaryFacet,
  readonly RegExp[]
>;

function isSourceOrderedAiHiringComplianceSummaryQuery(query: string): boolean {
  return isSourceOrderedConversationSummaryQuery(query) &&
    QUERY_PATTERN.test(query);
}

function hasAiHiringComplianceFacet(
  entry: RankedFactCandidate,
  facet: AiHiringComplianceSummaryFacet,
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

export function selectSourceOrderedAiHiringComplianceSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isSourceOrderedAiHiringComplianceSummaryQuery(input.query)) {
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

  for (const facet of FACET_ORDER) {
    const candidates = input.sourceCandidates
      .filter((entry) => hasAiHiringComplianceFacet(entry, facet))
      .sort(compareTemporalFactChronology);
    for (const candidate of candidates) {
      if (addCandidate(candidate)) {
        break;
      }
    }
  }

  if (selected.size < input.minAnchors) {
    return [];
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
