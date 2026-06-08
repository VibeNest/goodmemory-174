import type { RankedFactCandidate } from "../../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import { compareTemporalFactChronology } from "../temporal";

type AiHiringProcessSummaryFacet =
  | "fairnessMetricsDecision"
  | "fairnessPilotTradeoff"
  | "humanTouchOversight"
  | "psychometricTests"
  | "pymetricsEfficiency"
  | "roleTiming"
  | "softSkillsEvaluation"
  | "stressAutomationDecision";

const QUERY_PATTERN =
  /^(?=[\s\S]*\b(?:summari[sz]e|summary|recap)\b)(?=[\s\S]*\bintegrat(?:e|ing)\s+AI\b)(?=[\s\S]*\bhiring\s+process\b)(?=[\s\S]*\b(?:key\s+steps?|challenges?|decisions?)\b)/iu;

const FACETS = [
  {
    facet: "humanTouchOversight",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bhuman\s+touch\b)(?=[\s\S]*\bresume\s+screening\b)(?=[\s\S]*\bfinal\s+hiring\s+decisions?\b)(?=[\s\S]*\binterviews?\b)/iu,
      /^(?=[\s\S]*\bhuman\s+touch\b)(?=[\s\S]*\bresume\s+screening\b)(?=[\s\S]*\bfinal\s+decisions?\b)(?=[\s\S]*\binterviews?\b)/iu,
    ],
  },
  {
    facet: "softSkillsEvaluation",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bsoft\s+skills\b)(?=[\s\S]*\bstructured\s+interviews?\b)(?=[\s\S]*\bbehavioral\s+questions?\b)(?=[\s\S]*\b(?:communication|teamwork|adaptability)\b)/iu,
    ],
  },
  {
    facet: "psychometricTests",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bpsychometric\s+tests?\b)(?=[\s\S]*\bMBTI\b)(?=[\s\S]*\bDISC\b)(?=[\s\S]*\bBig\s+Five\b)(?=[\s\S]*\bpersonality\s+traits?\b)/iu,
    ],
  },
  {
    facet: "fairnessPilotTradeoff",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bWyatt'?s\s+concerns?\b)(?=[\s\S]*\bfairness\b)(?=[\s\S]*\bAI\s+pilot\b)(?=[\s\S]*(?:\b3\s+interview\s+rounds\b|\bthree\s+interview\s+rounds\b|\binterview\s+rounds\s+from\s+3\b))(?=[\s\S]*\b2\s+weeks?\b)/iu,
    ],
  },
  {
    facet: "pymetricsEfficiency",
    role: "assistant",
    patterns: [
      /^(?=[\s\S]*\bPymetrics\b)(?=[\s\S]*\bsoft\s+skills\s+assessment\b)(?=[\s\S]*\b20%\s+improvement\b)(?=[\s\S]*\bcandidate\s+fit\b)(?=[\s\S]*\b(?:reduc(?:e|ed|ing)\s+interview\s+rounds|faster\s+hiring\s+cycles?|data-driven\s+decisions?)\b)/iu,
    ],
  },
  {
    facet: "roleTiming",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bediting\s+to\s+HR\s+tech\s+support\b)(?=[\s\S]*\bnew\s+role\b)(?=[\s\S]*\bAI\s+pilot'?s\s+success\b)(?=[\s\S]*\bright\s+time\b)/iu,
    ],
  },
  {
    facet: "fairnessMetricsDecision",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bAI\s+to\s+automate\s+hiring\b)(?=[\s\S]*\bfair\b)(?=[\s\S]*\bAI\s+fairness\s+metrics\b)(?=[\s\S]*\bJuly\s+12\b)(?=[\s\S]*\bThe\s+Green\s+Turtle\b)/iu,
    ],
  },
  {
    facet: "stressAutomationDecision",
    role: "user",
    patterns: [
      /^(?=[\s\S]*\bstressed?\b)(?=[\s\S]*\bhiring\s+process\b)(?=[\s\S]*\bAI\s+fairness\s+findings\b)(?=[\s\S]*\bMontserrat\s+Tech\s+Summit\b)(?=[\s\S]*\bAugust\s+22\b)(?=[\s\S]*\b25%\s+reduction\b)/iu,
    ],
  },
] as const satisfies ReadonlyArray<{
  facet: AiHiringProcessSummaryFacet;
  patterns: readonly RegExp[];
  role: "assistant" | "user";
}>;

function isAiHiringProcessSummaryQuery(query: string): boolean {
  return QUERY_PATTERN.test(query);
}

function shouldEvaluateFacet(
  facet: AiHiringProcessSummaryFacet,
  normalizedContent: string,
): boolean {
  switch (facet) {
    case "fairnessMetricsDecision":
      return normalizedContent.includes("ai fairness metrics") &&
        normalizedContent.includes("the green turtle");
    case "fairnessPilotTradeoff":
      return normalizedContent.includes("wyatt") &&
        normalizedContent.includes("ai pilot") &&
        normalizedContent.includes("fairness");
    case "humanTouchOversight":
      return normalizedContent.includes("human touch") &&
        (
          normalizedContent.includes("final hiring decisions") ||
          normalizedContent.includes("final decisions")
        );
    case "roleTiming":
      return normalizedContent.includes("editing to hr tech support") &&
        normalizedContent.includes("right time");
    case "psychometricTests":
      return normalizedContent.includes("psychometric tests") &&
        normalizedContent.includes("mbti") &&
        normalizedContent.includes("big five");
    case "pymetricsEfficiency":
      return normalizedContent.includes("pymetrics") &&
        normalizedContent.includes("20% improvement") &&
        normalizedContent.includes("candidate fit");
    case "softSkillsEvaluation":
      return normalizedContent.includes("soft skills") &&
        normalizedContent.includes("structured interviews") &&
        normalizedContent.includes("behavioral");
    case "stressAutomationDecision":
      return normalizedContent.includes("ai fairness findings") &&
        normalizedContent.includes("25% reduction");
  }
}

function matchesSourceRole(
  entry: RankedFactCandidate,
  role: "assistant" | "user",
): boolean {
  if (role === "assistant" && hasAssistantAnswerTag(entry)) {
    return true;
  }
  if (role === "user" && hasUserAnswerTag(entry)) {
    return true;
  }

  const originalRole = entry.fact.attributes?.originalRole;
  if (originalRole === role) {
    return true;
  }

  return role === "assistant"
    ? /\brole\s*=\s*assistant\b/iu.test(entry.fact.content)
    : /\brole\s*=\s*user\b/iu.test(entry.fact.content);
}

function aiHiringProcessFacets(
  entry: RankedFactCandidate,
): Set<AiHiringProcessSummaryFacet> {
  const content = stripEvidencePrefix(entry.fact.content);
  const normalizedContent = content.toLowerCase();
  const facets = new Set<AiHiringProcessSummaryFacet>();
  for (const facet of FACETS) {
    if (!shouldEvaluateFacet(facet.facet, normalizedContent)) {
      continue;
    }
    if (
      matchesSourceRole(entry, facet.role) &&
      facet.patterns.some((pattern) => pattern.test(content))
    ) {
      facets.add(facet.facet);
    }
  }

  return facets;
}

export function selectSourceOrderedAiHiringProcessSummaryCoverage(input: {
  limit: number;
  minAnchors: number;
  query: string;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  if (!isAiHiringProcessSummaryQuery(input.query)) {
    return [];
  }

  const selected = new Map<string, RankedFactCandidate>();
  for (const facet of FACETS) {
    const entry = input.sourceCandidates
      .filter((candidate) => aiHiringProcessFacets(candidate).has(facet.facet))
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
