import type { LanguageService } from "../../language";
import type { RecallCandidateTrace } from "../engine";
import type { RecallSlot, RetrievalProfile, RoutingDecision } from "../router";
import type { RankedFactCandidate } from "../scoring";
import type { SelectionRunContext } from "../selectionRunContext";
import type { PrimaryFactSelectionId } from "./routeTable";

/**
 * Inputs the legacy selection switch closed over that are not part of the
 * SelectionRunContext.
 */
export interface FactSelectionRuntime {
  compatible: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
  retrievalProfile: RetrievalProfile;
  strategy: RoutingDecision["strategy"];
}

export interface RouteSelection {
  /** Entries the engine selects in order before stopping the chain. */
  entries: RankedFactCandidate[];
  /** Replaces the legacy contradictionPairSelected closure flag. */
  claimsContradictionPair?: boolean;
}

export interface FactSelectionRoute {
  id: PrimaryFactSelectionId;
  /** Mirrors every `return false` of the legacy switch case. */
  isEligible(input: {
    ctx: SelectionRunContext;
    runtime: FactSelectionRuntime;
  }): boolean;
  /** Pure with respect to the draft; may legitimately return zero entries. */
  select(input: {
    ctx: SelectionRunContext;
    runtime: FactSelectionRuntime;
  }): RouteSelection;
}

export interface FactSelectionWinner {
  claimsContradictionPair: boolean;
  routeId: PrimaryFactSelectionId;
}

export type FactSelectionAugmenterStageId =
  | "instruction_and_source_preference"
  | "assistant_count_headings"
  | "direct_factual_companions"
  | "coupon_store_companions";

export interface AugmenterStageRecord {
  appendedFactIds: string[];
  id: FactSelectionAugmenterStageId;
  removedFactIds: string[];
}

export interface FactSelectionSummary {
  augmenterStages: AugmenterStageRecord[];
  earlyExit?: FactSelectionEarlyExit;
  winner?: FactSelectionWinner;
}

export type FactSelectionEarlyExit =
  | "trello_abstention"
  | "reference_only"
  | "slot_specific"
  | "resume_design_instruction";

export interface FactSelectionAugmenterStage {
  id: FactSelectionAugmenterStageId;
  /** True only for stages allowed to remove prior selections. */
  canPrune: boolean;
  /** Primary winners this stage must never override. */
  yieldsToWinners: readonly PrimaryFactSelectionId[];
  gate(input: {
    ctx: SelectionRunContext;
    draft: SelectionDraft;
    runtime: FactSelectionRuntime;
    winner?: FactSelectionWinner;
  }): boolean;
  apply(input: {
    ctx: SelectionRunContext;
    draft: SelectionDraft;
    runtime: FactSelectionRuntime;
  }): AugmenterStageRecord;
}

export interface SelectionDraft {
  readonly selected: RankedFactCandidate[];
  readonly selectedIds: Set<string>;
  readonly summary: FactSelectionSummary;
  readonly traces: RecallCandidateTrace[];
  /**
   * Exact legacy selectAndTrace semantics: unconditional push, no dedupe,
   * defaults slot "generic" and fallback "none". Callers guard duplicates
   * with selectedIds at the call site, as the legacy blocks did.
   */
  select(
    entry: RankedFactCandidate,
    slot?: RecallSlot | "generic",
    fallback?: RecallCandidateTrace["fallback"],
  ): void;
}
