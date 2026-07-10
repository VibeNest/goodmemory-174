import { FACT_SELECTION_AUGMENTER_STAGES } from "./augmenters";
import type { FactSelectionAugmenterStage } from "./contracts";

/**
 * The post-primary augmentation pipeline, in legacy block order. Order is
 * load-bearing: the instruction/source-preference stage may prune primary
 * selections and must run before the append-only stages, and trace
 * finalization (finalizeSuppressionReasons) always runs after the table.
 */
export const FACT_SELECTION_AUGMENTER_TABLE: readonly FactSelectionAugmenterStage[] = [
  FACT_SELECTION_AUGMENTER_STAGES.instructionAndSourcePreference,
  FACT_SELECTION_AUGMENTER_STAGES.assistantCountHeadings,
  FACT_SELECTION_AUGMENTER_STAGES.directFactualCompanions,
  FACT_SELECTION_AUGMENTER_STAGES.couponStoreCompanions,
];
