import type { RankedFactCandidate } from "../scoring";
import {
  hasAssistantAnswerTag,
  hasUserAnswerTag,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";

export const DEFAULT_SOURCE_ORDER_PLAN_RECALL_LIMIT = 16;
export const DEFAULT_SOURCE_ORDER_PLAN_ANCHOR_LIMIT = 8;

export type SourceOrderedEvidenceRole = "assistant" | "unknown" | "user";

export function sourceOrderedEvidenceRole(
  entry: RankedFactCandidate,
): SourceOrderedEvidenceRole {
  if (hasUserAnswerTag(entry)) {
    return "user";
  }
  if (hasAssistantAnswerTag(entry)) {
    return "assistant";
  }
  return "unknown";
}

function sourceOrderedEvidenceRepresentativeScore(input: {
  entry: RankedFactCandidate;
  priority: (entry: RankedFactCandidate) => number;
}): number {
  const content = input.entry.fact.content;
  const sourceEnvelopeBonus =
    /\b(?:chat[_-]?id|source[_-]?order|sourceOrder)\s*[:=]\s*\d+\b/iu.test(
      content,
    ) || /\brole\s*=\s*(?:assistant|user)\b/iu.test(content)
      ? 1000
      : 0;

  return input.priority(input.entry) +
    sourceEnvelopeBonus +
    Math.min(content.length, 2000) / 100 +
    input.entry.lexicalScore * 20 +
    input.entry.subjectScore * 12 +
    input.entry.intentScore * 8;
}

export function dedupeSourceOrderedEvidenceByOrder(input: {
  entries: RankedFactCandidate[];
  priority: (entry: RankedFactCandidate) => number;
}): RankedFactCandidate[] {
  const bestByOrder = new Map<number, RankedFactCandidate>();
  for (const entry of input.entries) {
    const order = sourceOrderSortKey(entry);
    if (order === undefined) {
      continue;
    }

    const current = bestByOrder.get(order);
    if (!current) {
      bestByOrder.set(order, entry);
      continue;
    }

    const priorityDelta =
      sourceOrderedEvidenceRepresentativeScore({
        entry,
        priority: input.priority,
      }) -
      sourceOrderedEvidenceRepresentativeScore({
        entry: current,
        priority: input.priority,
      });
    if (
      priorityDelta > 0 ||
      (
        priorityDelta === 0 &&
        compareTemporalFactChronology(entry, current) < 0
      )
    ) {
      bestByOrder.set(order, entry);
    }
  }

  return [...bestByOrder.values()].sort(compareTemporalFactChronology);
}

function defaultSourceOrderedEvidenceSlotSignature(
  entry: RankedFactCandidate,
): Set<string> {
  const order = sourceOrderSortKey(entry);
  return new Set([`source:${order ?? entry.fact.id}`]);
}

function sourceOrderedEvidenceSignatureKey(
  signature: ReadonlySet<string>,
  entry: RankedFactCandidate,
): string {
  if (signature.size === 0) {
    return `source:${sourceOrderSortKey(entry) ?? entry.fact.id}`;
  }

  return [...signature].sort().join("|");
}

export function selectSourceOrderedEvidencePlan(input: {
  anchorLimit?: number;
  anchors: RankedFactCandidate[];
  companionDistance?: number;
  companionPool?: RankedFactCandidate[];
  companionsPerAnchor?: number;
  limit?: number;
  priority: (entry: RankedFactCandidate) => number;
  slotSignature?: (entry: RankedFactCandidate) => Set<string>;
}): RankedFactCandidate[] {
  const limit = input.limit ?? DEFAULT_SOURCE_ORDER_PLAN_RECALL_LIMIT;
  const anchorLimit = Math.min(
    input.anchorLimit ?? DEFAULT_SOURCE_ORDER_PLAN_ANCHOR_LIMIT,
    limit,
  );
  const companionDistance = input.companionDistance ?? 1;
  const companionsPerAnchor = input.companionsPerAnchor ?? 1;
  const slotSignature = input.slotSignature ??
    defaultSourceOrderedEvidenceSlotSignature;
  const selected = new Map<string, RankedFactCandidate>();
  const selectedSourceOrders = new Set<number>();
  const addCandidate = (entry: RankedFactCandidate): void => {
    if (selected.size >= limit) {
      return;
    }

    const order = sourceOrderSortKey(entry);
    if (order !== undefined && selectedSourceOrders.has(order)) {
      return;
    }

    selected.set(entry.fact.id, entry);
    if (order !== undefined) {
      selectedSourceOrders.add(order);
    }
  };

  const bestBySlot = new Map<string, RankedFactCandidate>();
  for (const anchor of input.anchors) {
    const key = sourceOrderedEvidenceSignatureKey(slotSignature(anchor), anchor);
    const current = bestBySlot.get(key);
    if (
      !current ||
      input.priority(anchor) > input.priority(current) ||
      (
        input.priority(anchor) === input.priority(current) &&
        compareTemporalFactChronology(anchor, current) < 0
      )
    ) {
      bestBySlot.set(key, anchor);
    }
  }

  const anchorCoverage = [...bestBySlot.values()]
    .sort((left, right) => {
      const priorityDelta = input.priority(right) - input.priority(left);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return compareTemporalFactChronology(left, right);
    })
    .slice(0, anchorLimit)
    .sort(compareTemporalFactChronology);

  for (const anchor of anchorCoverage) {
    addCandidate(anchor);
    const anchorOrder = sourceOrderSortKey(anchor);
    if (anchorOrder === undefined || companionsPerAnchor <= 0) {
      continue;
    }

    const anchorRole = sourceOrderedEvidenceRole(anchor);
    const companions = (input.companionPool ?? input.anchors)
      .filter((entry) => !selected.has(entry.fact.id))
      .map((entry) => {
        const order = sourceOrderSortKey(entry);
        if (order === undefined) {
          return null;
        }

        const role = sourceOrderedEvidenceRole(entry);
        const directional =
          (anchorRole === "user" && role === "assistant" && order > anchorOrder) ||
          (anchorRole === "assistant" && role === "user" && order < anchorOrder);
        if (!directional || Math.abs(order - anchorOrder) > companionDistance) {
          return null;
        }

        return {
          distance: Math.abs(order - anchorOrder),
          entry,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          distance: number;
          entry: RankedFactCandidate;
        } => candidate !== null,
      )
      .sort((left, right) => {
        const priorityDelta =
          input.priority(right.entry) - input.priority(left.entry);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        if (left.distance !== right.distance) {
          return left.distance - right.distance;
        }
        return compareTemporalFactChronology(left.entry, right.entry);
      })
      .slice(0, companionsPerAnchor);

    for (const companion of companions) {
      addCandidate(companion.entry);
    }
  }

  return [...selected.values()].sort(compareTemporalFactChronology);
}
