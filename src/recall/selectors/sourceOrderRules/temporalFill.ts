import type { LanguageService } from "../../../language";
import type { RankedFactCandidate } from "../../scoring";
import {
  hasUserAnswerTag,
  stripEvidencePrefix,
} from "../selectionContext";
import {
  SOURCE_ORDER_ASPECT_CUE_PATTERN,
} from "../sourceOrderTemporalSignals";
import {
  SOURCE_ORDER_COMPANION_LIMIT,
  SOURCE_ORDER_COMPANION_MAX_DISTANCE,
  SOURCE_ORDER_GAP_FILL_LIMIT,
  SOURCE_ORDER_MILESTONE_FILL_LIMIT,
  sourceOrderAspectTopics,
  sourceOrderGapCandidatePriority,
} from "./temporalShared";
import {
  compareTemporalFactChronology,
  hasPersonalWorkChallengeEventSignal,
  isPersonalWorkChallengeEventOrderQuery,
  isSourceOrderedFact,
  sourceOrderSortKey,
  temporalOrderEvidencePriority,
} from "../temporal";

export function fillSourceOrderedTemporalGaps(input: {
  language: LanguageService;
  pool: RankedFactCandidate[];
  query: string;
  queryLocale: string;
  selected: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selectedIds = new Set(input.selected.map((entry) => entry.fact.id));
  const selectedWithOrder = input.selected
    .filter(isSourceOrderedFact)
    .filter((entry) => sourceOrderSortKey(entry) !== undefined)
    .sort(compareTemporalFactChronology);
  const gapCandidates = new Map<string, RankedFactCandidate>();
  const selectedAspectTopics = new Set(
    input.selected.flatMap((entry) => [
      ...sourceOrderAspectTopics(entry, input.language),
    ]),
  );
  const earliestAspectSourceOrder = new Map<string, number>();
  for (const entry of input.pool) {
    const order = sourceOrderSortKey(entry);
    if (order === undefined) {
      continue;
    }
    for (const topic of sourceOrderAspectTopics(entry, input.language)) {
      const current = earliestAspectSourceOrder.get(topic);
      if (current === undefined || order < current) {
        earliestAspectSourceOrder.set(topic, order);
      }
    }
  }

  for (let index = 0; index < selectedWithOrder.length - 1; index += 1) {
    const leftOrder = sourceOrderSortKey(selectedWithOrder[index]!);
    const rightOrder = sourceOrderSortKey(selectedWithOrder[index + 1]!);
    if (leftOrder === undefined || rightOrder === undefined) {
      continue;
    }

    const candidatesInGap = input.pool
      .filter((entry) => !selectedIds.has(entry.fact.id))
      .filter((entry) => {
        const order = sourceOrderSortKey(entry);
        return order !== undefined && order > leftOrder && order < rightOrder;
      })
      .sort((left, right) => {
        const priorityDelta =
          sourceOrderGapCandidatePriority(
            right,
            input.query,
            input.language,
            input.queryLocale,
          ) -
          sourceOrderGapCandidatePriority(
            left,
            input.query,
            input.language,
            input.queryLocale,
          );
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return compareTemporalFactChronology(left, right);
      });

    for (const candidate of candidatesInGap) {
      gapCandidates.set(candidate.fact.id, candidate);
    }
  }

  const candidatePool = [...gapCandidates.values()];
  const additions: RankedFactCandidate[] = [];
  while (
    additions.length < SOURCE_ORDER_GAP_FILL_LIMIT &&
    candidatePool.length > 0
  ) {
    candidatePool.sort((left, right) => {
      const leftNovelAspectCount = [...sourceOrderAspectTopics(left, input.language)]
        .filter((topic) => !selectedAspectTopics.has(topic)).length;
      const rightNovelAspectCount = [...sourceOrderAspectTopics(right, input.language)]
        .filter((topic) => !selectedAspectTopics.has(topic)).length;
      const leftOrder = sourceOrderSortKey(left);
      const rightOrder = sourceOrderSortKey(right);
      const leftAspectIntroductionCount = [
        ...sourceOrderAspectTopics(left, input.language),
      ].filter(
        (topic) =>
          leftOrder !== undefined &&
          earliestAspectSourceOrder.get(topic) === leftOrder,
      ).length;
      const rightAspectIntroductionCount = [
        ...sourceOrderAspectTopics(right, input.language),
      ].filter(
        (topic) =>
          rightOrder !== undefined &&
          earliestAspectSourceOrder.get(topic) === rightOrder,
      ).length;
      const priorityDelta =
        (
          sourceOrderGapCandidatePriority(
            right,
            input.query,
            input.language,
            input.queryLocale,
          ) +
          rightNovelAspectCount * 60 +
          rightAspectIntroductionCount * 160
        ) -
        (
          sourceOrderGapCandidatePriority(
            left,
            input.query,
            input.language,
            input.queryLocale,
          ) +
          leftNovelAspectCount * 60 +
          leftAspectIntroductionCount * 160
        );
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    });

    const next = candidatePool.shift();
    if (!next) {
      break;
    }
    additions.push(next);
    for (const topic of sourceOrderAspectTopics(next, input.language)) {
      selectedAspectTopics.add(topic);
    }
  }

  if (additions.length === 0) {
    return input.selected;
  }

  return [...input.selected, ...additions].sort(compareTemporalFactChronology);
}

export function fillSourceOrderedTemporalCompanions(input: {
  pool: RankedFactCandidate[];
  query: string;
  selected: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selectedIds = new Set(input.selected.map((entry) => entry.fact.id));
  const selectedOrders = input.selected
    .map(sourceOrderSortKey)
    .filter((order): order is number => order !== undefined);
  if (selectedOrders.length === 0) {
    return input.selected;
  }

  const additions = input.pool
    .filter((entry) => !selectedIds.has(entry.fact.id))
    .filter(hasUserAnswerTag)
    .map((entry) => {
      const order = sourceOrderSortKey(entry);
      if (order === undefined) {
        return null;
      }
      const nearestDistance = Math.min(
        ...selectedOrders.map((selectedOrder) => Math.abs(selectedOrder - order)),
      );
      if (nearestDistance > SOURCE_ORDER_COMPANION_MAX_DISTANCE) {
        return null;
      }
      const previousSelectedOrder = selectedOrders
        .filter((selectedOrder) => selectedOrder < order)
        .sort((left, right) => right - left)[0];
      const nextSelectedOrder = selectedOrders
        .filter((selectedOrder) => selectedOrder > order)
        .sort((left, right) => left - right)[0];
      const surroundingGap =
        previousSelectedOrder !== undefined && nextSelectedOrder !== undefined
          ? nextSelectedOrder - previousSelectedOrder
          : SOURCE_ORDER_COMPANION_MAX_DISTANCE;
      const priority =
        (SOURCE_ORDER_COMPANION_MAX_DISTANCE - nearestDistance + 1) * 100 +
        surroundingGap * 10 +
        temporalOrderEvidencePriority(entry, input.query) +
        (SOURCE_ORDER_ASPECT_CUE_PATTERN.test(stripEvidencePrefix(entry.fact.content))
          ? 100
          : 0);
      return {
        entry,
        nearestDistance,
        priority,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        nearestDistance: number;
        priority: number;
      } => candidate !== null,
    )
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      if (left.nearestDistance !== right.nearestDistance) {
        return left.nearestDistance - right.nearestDistance;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    })
    .slice(0, SOURCE_ORDER_COMPANION_LIMIT)
    .map((candidate) => candidate.entry);

  if (additions.length === 0) {
    return input.selected;
  }

  return [...input.selected, ...additions].sort(compareTemporalFactChronology);
}

export function fillSourceOrderedTemporalMilestones(input: {
  language: LanguageService;
  pool: RankedFactCandidate[];
  query: string;
  queryLocale: string;
  selected: RankedFactCandidate[];
}): RankedFactCandidate[] {
  const selectedIds = new Set(input.selected.map((entry) => entry.fact.id));
  const selectedOrders = input.selected
    .map(sourceOrderSortKey)
    .filter((order): order is number => order !== undefined);
  if (selectedOrders.length === 0) {
    return input.selected;
  }

  const maxSelectedOrder = Math.max(...selectedOrders);
  const selectedAspectTopics = new Set(
    input.selected.flatMap((entry) => [
      ...sourceOrderAspectTopics(entry, input.language),
    ]),
  );
  const earliestAspectSourceOrder = new Map<string, number>();
  for (const entry of input.pool) {
    const order = sourceOrderSortKey(entry);
    if (order === undefined) {
      continue;
    }
    for (const topic of sourceOrderAspectTopics(entry, input.language)) {
      const current = earliestAspectSourceOrder.get(topic);
      if (current === undefined || order < current) {
        earliestAspectSourceOrder.set(topic, order);
      }
    }
  }

  const candidatePool = input.pool
    .filter((entry) => !selectedIds.has(entry.fact.id))
    .filter(hasUserAnswerTag)
    .map((entry) => {
      const order = sourceOrderSortKey(entry);
      if (order === undefined) {
        return null;
      }
      const content = stripEvidencePrefix(entry.fact.content);
      const aspectTopics = sourceOrderAspectTopics(entry, input.language);
      const querySpecificMilestone =
        isPersonalWorkChallengeEventOrderQuery(input.query) &&
        hasPersonalWorkChallengeEventSignal(entry);
      if (
        aspectTopics.size === 0 &&
        !SOURCE_ORDER_ASPECT_CUE_PATTERN.test(content) &&
        !querySpecificMilestone
      ) {
        return null;
      }
      const novelAspectCount = [...aspectTopics].filter(
        (topic) => !selectedAspectTopics.has(topic),
      ).length;
      const aspectIntroductionCount = [...aspectTopics].filter(
        (topic) => earliestAspectSourceOrder.get(topic) === order,
      ).length;
      const nearestDistance = Math.min(
        ...selectedOrders.map((selectedOrder) => Math.abs(selectedOrder - order)),
      );
      const tailMilestoneBonus = order > maxSelectedOrder ? 120 : 0;
      const isolatedMilestoneBonus =
        nearestDistance > SOURCE_ORDER_COMPANION_MAX_DISTANCE ? 45 : 0;
      const priority =
        sourceOrderGapCandidatePriority(
          entry,
          input.query,
          input.language,
          input.queryLocale,
        ) +
        novelAspectCount * 140 +
        aspectIntroductionCount * 90 +
        (querySpecificMilestone ? 220 : 0) +
        tailMilestoneBonus +
        isolatedMilestoneBonus;

      return {
        aspectTopics,
        entry,
        novelAspectCount,
        order,
        priority,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        aspectTopics: Set<string>;
        entry: RankedFactCandidate;
        novelAspectCount: number;
        order: number;
        priority: number;
      } => candidate !== null,
    );

  const additions: RankedFactCandidate[] = [];
  while (
    additions.length < SOURCE_ORDER_MILESTONE_FILL_LIMIT &&
    candidatePool.length > 0
  ) {
    candidatePool.sort((left, right) => {
      const priorityDelta = right.priority - left.priority;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return left.order - right.order;
    });

    const next = candidatePool.shift();
    if (!next) {
      break;
    }
    const stillNovelAspectCount = [...next.aspectTopics].filter(
      (topic) => !selectedAspectTopics.has(topic),
    ).length;
    if (
      stillNovelAspectCount === 0 &&
      next.order <= maxSelectedOrder &&
      additions.length > 0
    ) {
      continue;
    }

    additions.push(next.entry);
    for (const topic of next.aspectTopics) {
      selectedAspectTopics.add(topic);
    }
  }

  if (additions.length === 0) {
    return input.selected;
  }

  return [...input.selected, ...additions].sort(compareTemporalFactChronology);
}
