import type { RecallCandidateTrace } from "../engine";
import type { RecallSlot } from "../router";
import type { RankedFactCandidate } from "../scoring";

export interface AugmenterStageRecord<Id extends string = string> {
  appendedFactIds: string[];
  id: Id;
  removedFactIds: string[];
}

export interface FactSelectionSummary<
  RouteId extends string = string,
  AugmenterId extends string = string,
  EarlyExit extends string = string,
> {
  augmenterStages: Array<AugmenterStageRecord<AugmenterId>>;
  earlyExit?: EarlyExit;
  winner?: {
    claimsContradictionPair: boolean;
    routeId: RouteId;
  };
}

export interface SelectionDraft<
  RouteId extends string = string,
  AugmenterId extends string = string,
  EarlyExit extends string = string,
> {
  readonly selected: RankedFactCandidate[];
  readonly selectedIds: Set<string>;
  readonly summary: FactSelectionSummary<RouteId, AugmenterId, EarlyExit>;
  readonly traces: RecallCandidateTrace[];
  select(
    entry: RankedFactCandidate,
    slot?: RecallSlot | "generic",
    fallback?: RecallCandidateTrace["fallback"],
  ): void;
}
