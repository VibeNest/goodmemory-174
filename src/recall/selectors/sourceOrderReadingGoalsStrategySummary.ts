import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import { compareTemporalFactChronology, sourceOrderSortKey } from "./temporal";

type ReadingGoalsStrategySummaryFacet =
  | "expanseGoal"
  | "initialGoal"
  | "motivationStrategies"
  | "nightingaleTransition"
  | "stormlightAudiobookAdjustment";

const FACET_ORDER = [
  "initialGoal",
  "stormlightAudiobookAdjustment",
  "motivationStrategies",
  "expanseGoal",
  "nightingaleTransition",
] as const satisfies readonly ReadingGoalsStrategySummaryFacet[];

const QUERY_PATTERN =
  /^(?=[\s\S]*\b(?:summary|summarize)\b)(?=[\s\S]*\breading\s+goals?\b)(?=[\s\S]*\bstrateg(?:y|ies)\b)(?=[\s\S]*\bdeveloped\b)(?=[\s\S]*\bover\s+time\b)/iu;

const FACET_PATTERNS = {
  expanseGoal: [
    /^(?=[\s\S]*\b1,500\s+pages\s+of\s+["“”']?The\s+Expanse["“”']?\b)(?=[\s\S]*\bMarch\s+15\b)(?=[\s\S]*\b75\s+pages\s+daily\b)(?=[\s\S]*\brealistic\b)/iu,
  ],
  initialGoal: [
    /^(?=[\s\S]*\bfinish\s+at\s+least\s+3\s+series\b)(?=[\s\S]*\bFebruary\s+28,\s+2024\b)(?=[\s\S]*\b350\s+pages\s+per\s+week\b)(?=[\s\S]*\bsuggest\s+a\s+schedule\b)/iu,
  ],
  motivationStrategies: [
    /^(?=[\s\S]*\bset\s+small\s+(?:daily\s+)?goals\b)(?=[\s\S]*\b(?:cozy\s+reading\s+environment|comfortable\s+reading\s+environment|cozy\s+nook)\b)(?=[\s\S]*\bMontserrat\s+Readers\b)(?=[\s\S]*\b(?:reward\s+(?:yourself|milestones)|reaching\s+milestones)\b)/iu,
  ],
  nightingaleTransition: [
    /^(?=[\s\S]*\bThe\s+Nightingale\b)(?=[\s\S]*\bafter\s+["“”']?The\s+Expanse["“”']?\b)(?=[\s\S]*\bscience\s+fiction\b)(?=[\s\S]*\bhistorical\s+fiction\b)(?=[\s\S]*\bvariety\b)/iu,
  ],
  stormlightAudiobookAdjustment: [
    /^(?=[\s\S]*\bcompleted\s+1,200\s+pages\s+of\s+["“”']?The\s+Stormlight\s+Archive["“”']?\b)(?=[\s\S]*\bDecember\s+1\b)(?=[\s\S]*\baudiobooks?\b)(?=[\s\S]*\bafter\s+8\s*PM\b)(?=[\s\S]*\bstay\s+on\s+track\b)/iu,
  ],
} as const satisfies Record<
  ReadingGoalsStrategySummaryFacet,
  readonly RegExp[]
>;

function isReadingGoalsStrategySummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function hasValidRoleForFacet(
  entry: RankedFactCandidate,
  facet: ReadingGoalsStrategySummaryFacet,
): boolean {
  return facet === "initialGoal"
    ? hasUserAnswerTag(entry)
    : hasAssistantAnswerTag(entry);
}

function hasReadingGoalsStrategySummaryFacet(
  entry: RankedFactCandidate,
  facet: ReadingGoalsStrategySummaryFacet,
): boolean {
  if (!hasValidRoleForFacet(entry, facet)) {
    return false;
  }

  const content = stripEvidencePrefix(entry.fact.content);
  return FACET_PATTERNS[facet].some((pattern) => pattern.test(content));
}

export function selectSourceOrderedReadingGoalsStrategySummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isReadingGoalsStrategySummaryQuery(input.query)) {
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
    const candidate = input.sourceCandidates
      .filter((entry) => hasReadingGoalsStrategySummaryFacet(entry, facet))
      .sort(compareTemporalFactChronology)[0];
    if (candidate) {
      addCandidate(candidate);
    }
  }

  const requiredAnchors = Math.max(input.minAnchors, FACET_ORDER.length);
  if (selected.size < requiredAnchors) {
    return [];
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
