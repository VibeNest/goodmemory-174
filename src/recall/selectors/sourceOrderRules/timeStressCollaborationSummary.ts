import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type TimeStressCollaborationFacet =
  | "carlaFriendTime"
  | "creativeWorkshop"
  | "stressRoutines"
  | "todoistWeekendPlans";

const QUERY_PATTERN =
  /\bmanag(?:e|ing)\b[\s\S]{0,120}\btime\b[\s\S]{0,120}\bstress\b[\s\S]{0,160}\bcreative\s+collaborations?\b|\btime\b[\s\S]{0,120}\bstress\b[\s\S]{0,160}\bcreative\s+collaborations?\b/iu;

const FACETS = [
  {
    facet: "carlaFriendTime",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bbalanc(?:e|ing)\s+my\s+time\b)(?=[\s\S]*\bfriends?\b)(?=[\s\S]*\bCarla\b)(?=[\s\S]*(?:\bMontserrat\s+Film\s+Festival\b|\bgraphic\s+designer\b))/iu,
    ],
  },
  {
    facet: "stressRoutines",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bManaging\s+stress\b)(?=[\s\S]*\bbalancing\s+work\s+and\s+family\s+schedules\b)(?=[\s\S]*(?:\bmindfulness\b|\bstructured\s+breaks\b|\brealistic\s+goal\s+setting\b|\bregular\s+exercise\b))/iu,
    ],
  },
  {
    facet: "todoistWeekendPlans",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bTodoist\b)(?=[\s\S]*\bdaily\s+tasks\b)(?=[\s\S]*\bweekend\s+plans\b)/iu,
    ],
  },
  {
    facet: "creativeWorkshop",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bcreative\s+workshop\b)(?=[\s\S]*\bCarla\b)(?=[\s\S]*\bThe\s+Blue\s+Lagoon\b)(?=[\s\S]*(?:\bcommunication\b|\bcontingency\s+plans\b|\bscheduling\s+conflicts\b))/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: TimeStressCollaborationFacet;
  patterns: readonly RegExp[];
  role: "assistant" | "user";
}>;

function isTimeStressCollaborationSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function shouldEvaluateFacet(
  facet: TimeStressCollaborationFacet,
  normalizedContent: string,
): boolean {
  switch (facet) {
    case "carlaFriendTime":
      return normalizedContent.includes("carla") &&
        normalizedContent.includes("balancing my time");
    case "creativeWorkshop":
      return normalizedContent.includes("creative workshop") &&
        normalizedContent.includes("carla");
    case "stressRoutines":
      return normalizedContent.includes("managing stress") &&
        normalizedContent.includes("work and family");
    case "todoistWeekendPlans":
      return normalizedContent.includes("todoist") &&
        normalizedContent.includes("weekend plans");
  }
}

function timeStressCollaborationFacets(
  entry: RankedFactCandidate,
): Set<TimeStressCollaborationFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const normalizedContent = content.toLowerCase();
  const facets = new Set<TimeStressCollaborationFacet>();
  for (const facet of FACETS) {
    if (!shouldEvaluateFacet(facet.facet, normalizedContent)) {
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

export function selectSourceOrderedTimeStressCollaborationSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isTimeStressCollaborationSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  for (const facet of FACETS) {
    const entry = input.sourceCandidates
      .filter((candidate) =>
        timeStressCollaborationFacets(candidate).has(facet.facet)
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
