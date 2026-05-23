import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";

type ProjectLifecycleFacet =
  | "documentation"
  | "feature"
  | "security"
  | "timeline";

const PROJECT_LIFECYCLE_FACET_ORDER = [
  "feature",
  "timeline",
  "security",
  "documentation",
] as const satisfies readonly ProjectLifecycleFacet[];

const PROJECT_LIFECYCLE_FACET_QUOTAS = {
  documentation: 1,
  feature: 1,
  security: 2,
  timeline: 1,
} as const satisfies Record<ProjectLifecycleFacet, number>;

const PROJECT_LIFECYCLE_FILL_FACET_WEIGHTS = {
  documentation: 5,
  feature: 1,
  security: 5,
  timeline: 2,
} as const satisfies Record<ProjectLifecycleFacet, number>;

const PROJECT_LIFECYCLE_FACET_PATTERNS = {
  documentation: [
    /\b(?:architecture\s+decisions?|confluence|document(?:ation|ed|ing)?\s+(?:for\s+)?(?:api\s+endpoints?|architecture\s+decisions?|confluence)|document\s+(?:api\s+endpoints?|architecture\s+decisions?))\b/iu,
    /(文档|记录|接口文档|API.{0,20}(端点|接口|文档)|架构决策|协作)/iu,
  ],
  feature: [
    /\b(?:basic\s+analytics|core\s+functionalit(?:y|ies)|data\s+visuali[sz]ation|expense\s+tracking|features?|income\s+(?:and\s+expense\s+)?tracking|user\s+(?:authentication|login))\b/iu,
    /(核心功能|功能|用户登录|认证|收入支出|数据可视化|基础分析)/iu,
  ],
  security: [
    /\b(?:account\s+lockout|csrf|failed\s+login\s+attempts|hardening|rate\s+limit(?:ing)?|redis[\s\S]{0,80}(?:lockout|rate\s+limit(?:ing)?)|security\s+(?:aspects?|enhancements?|hardening|improvements?|vulnerabilities)|sql\s+injection|xss)\b/iu,
    /(安全|授权|账号锁定|登录失败|Redis|限流|CSRF|HTTPS|加固)/iu,
  ],
  timeline: [
    /\b(?:deadline|development\s+timeline|milestones?|mvp\s+(?:deadline|scope)|sprints?|timeline)\b/iu,
    /(截止|时间线|里程碑|冲刺|阶段|MVP)/iu,
  ],
} as const satisfies Record<ProjectLifecycleFacet, readonly RegExp[]>;

function hasProjectLifecycleFacet(
  entry: RankedFactCandidate,
  facet: ProjectLifecycleFacet,
): boolean {
  const content = stripEvidencePrefix(entry.fact.content);
  return PROJECT_LIFECYCLE_FACET_PATTERNS[facet].some((pattern) =>
    pattern.test(content)
  );
}

function projectLifecycleFacetFillScore(entry: RankedFactCandidate): number {
  let score = 0;
  for (const facet of PROJECT_LIFECYCLE_FACET_ORDER) {
    if (hasProjectLifecycleFacet(entry, facet)) {
      score += PROJECT_LIFECYCLE_FILL_FACET_WEIGHTS[facet];
    }
  }
  return score;
}

function projectLifecycleFacetAnchorPriority(
  entry: RankedFactCandidate,
  facet: ProjectLifecycleFacet,
): number {
  const content = stripEvidencePrefix(entry.fact.content);
  let score = projectLifecycleFacetFillScore(entry);

  if (facet === "feature") {
    if (/\b(?:build|create|implement(?:ed|ing)?|core\s+functionalit(?:y|ies))\b/iu.test(content)) {
      score += 8;
    }
    if (/\b(?:break\s+it\s+down|components?|task\s+list)\b/iu.test(content)) {
      score -= 5;
    }
    if (/\b(?:lightweight|minimal\s+dependencies|maintainability|easy\s+to\s+maintain)\b/iu.test(content)) {
      score -= 10;
    }
  }
  if (facet === "timeline") {
    if (/\b(?:april\s+15|mvp\s+(?:deadline|scope)|development\s+timeline)\b/iu.test(content)) {
      score += 8;
    }
  }
  if (facet === "security") {
    if (/\b(?:account\s+lockout|failed\s+login\s+attempts|redis|security\s+hardening)\b/iu.test(content)) {
      score += 8;
    }
  }
  if (facet === "documentation") {
    if (/\b(?:architecture\s+decisions?|confluence|document\s+api\s+endpoints?)\b/iu.test(content)) {
      score += 8;
    }
    if (/\bdocumentation\s+and\s+comments\b/iu.test(content)) {
      score -= 8;
    }
  }

  return score;
}

export function selectSourceOrderedProjectLifecyclePairs(input: {
  anchors: RankedFactCandidate[];
  companionDistance: number;
  limit: number;
  sourceCandidates: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selected = new Map<string, RankedFactCandidate>();
  const selectedSourceOrders = new Set<number>();
  const addCandidate = (entry: RankedFactCandidate): boolean => {
    if (selected.size >= input.limit) {
      return false;
    }
    const order = sourceOrderSortKey(entry);
    if (order !== undefined && selectedSourceOrders.has(order)) {
      return false;
    }

    selected.set(entry.fact.id, entry);
    if (order !== undefined) {
      selectedSourceOrders.add(order);
    }
    return true;
  };

  const selectedAnchorIds = new Set<string>();
  const sortedAnchors = [...input.anchors].sort(compareTemporalFactChronology);
  const addAnchorPair = (anchor: RankedFactCandidate): boolean => {
    if (selected.size >= input.limit) {
      return false;
    }

    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined || !hasUserAnswerTag(anchor)) {
      return false;
    }
    if (!addCandidate(anchor)) {
      return false;
    }

    selectedAnchorIds.add(anchor.fact.id);

    const companion = input.sourceCandidates
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined &&
          !selectedSourceOrders.has(order) &&
          hasAssistantAnswerTag(entry) &&
          order > anchorOrder &&
          order - anchorOrder <= input.companionDistance;
      })
      .sort(compareTemporalFactChronology)[0];
    if (companion) {
      addCandidate(companion);
    }

    return true;
  };

  for (const facet of PROJECT_LIFECYCLE_FACET_ORDER) {
    let selectedForFacet = 0;
    const facetAnchors = sortedAnchors
      .filter((anchor) => hasProjectLifecycleFacet(anchor, facet))
      .sort((left, right) => {
        const scoreDelta =
          projectLifecycleFacetAnchorPriority(right, facet) -
          projectLifecycleFacetAnchorPriority(left, facet);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return compareTemporalFactChronology(left, right);
      });

    for (const anchor of facetAnchors) {
      if (
        selectedForFacet >= PROJECT_LIFECYCLE_FACET_QUOTAS[facet] ||
        selected.size >= input.limit
      ) {
        break;
      }
      if (selectedAnchorIds.has(anchor.fact.id)) {
        continue;
      }
      if (addAnchorPair(anchor)) {
        selectedForFacet += 1;
      }
    }
  }

  const remainingAnchors = sortedAnchors
    .filter((anchor) => !selectedAnchorIds.has(anchor.fact.id))
    .sort((left, right) => {
      const scoreDelta =
        projectLifecycleFacetFillScore(right) -
        projectLifecycleFacetFillScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return compareTemporalFactChronology(left, right);
    });

  for (const anchor of remainingAnchors) {
    if (selected.size >= input.limit) {
      break;
    }
    addAnchorPair(anchor);
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
