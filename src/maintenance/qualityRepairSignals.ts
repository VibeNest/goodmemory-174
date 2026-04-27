import type {
  FactMemory,
  MemoryAttributeValue,
} from "../domain/records";

export type MemoryQualityFailureLabel =
  | "stale_recall"
  | "wrong_recall"
  | "missed_recall"
  | "over_remembering"
  | "failed_correction"
  | "noisy_procedural_memory";

export type MemoryQualityReviewOutcome =
  | "accepted_as_useful"
  | "false_write"
  | "rejected_as_unsafe_or_noisy"
  | "uncertain"
  | "valid_write";

export interface MemoryQualityRepairSignalInput {
  failureLabel: MemoryQualityFailureLabel;
  phase?: string;
  replacementMemoryId?: string;
  reviewOutcome?: MemoryQualityReviewOutcome;
  runId?: string;
  sampleId: string;
  source: "quality_failure_sample" | "quality_repair_guardrail";
  sourceScenario: string;
}

export interface MemoryQualityRepairSignal {
  demotionReason:
    | "over_remembering_quality_repair"
    | "wrong_recall_quality_repair"
    | "noisy_procedural_quality_repair";
}

const QUALITY_REPAIR_SOURCE_VALUES = new Set([
  "quality_failure_sample",
  "quality_repair_guardrail",
]);
const QUALITY_DEMOTIVE_FAILURE_LABELS = new Set<MemoryQualityFailureLabel>([
  "over_remembering",
  "wrong_recall",
  "noisy_procedural_memory",
]);
const QUALITY_DEMOTIVE_REVIEW_OUTCOMES = new Set<MemoryQualityReviewOutcome>([
  "false_write",
  "rejected_as_unsafe_or_noisy",
]);

function readStringAttribute(
  attributes: FactMemory["attributes"] | undefined,
  key: string,
): string | undefined {
  const value = attributes?.[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeString(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isDemotiveReviewOutcome(value: string): boolean {
  return QUALITY_DEMOTIVE_REVIEW_OUTCOMES.has(value as MemoryQualityReviewOutcome);
}

export function buildMemoryQualityRepairAttributes(
  input: MemoryQualityRepairSignalInput,
): Record<string, MemoryAttributeValue> {
  return {
    memoryQualityFailureLabel: input.failureLabel,
    ...(input.phase ? { memoryQualityRepairPhase: input.phase } : {}),
    ...(input.replacementMemoryId
      ? { memoryQualityReplacementMemoryId: input.replacementMemoryId }
      : {}),
    ...(input.runId ? { memoryQualityRepairRunId: input.runId } : {}),
    memoryQualityRepairSampleId: input.sampleId,
    memoryQualityRepairSource: input.source,
    memoryQualitySourceScenario: input.sourceScenario,
    ...(input.reviewOutcome
      ? { memoryQualityReviewOutcome: input.reviewOutcome }
      : {}),
  };
}

function readStructuredQualitySignal(fact: FactMemory): MemoryQualityRepairSignal | null {
  const repairSource = normalizeString(
    readStringAttribute(fact.attributes, "memoryQualityRepairSource"),
  );
  if (!QUALITY_REPAIR_SOURCE_VALUES.has(repairSource)) {
    return null;
  }

  const failureLabel = normalizeString(
    readStringAttribute(fact.attributes, "memoryQualityFailureLabel"),
  );
  const reviewOutcome = normalizeString(
    readStringAttribute(fact.attributes, "memoryQualityReviewOutcome"),
  );
  if (!isDemotiveReviewOutcome(reviewOutcome)) {
    return null;
  }

  if (failureLabel === "over_remembering") {
    return {
      demotionReason: "over_remembering_quality_repair",
    };
  }
  if (failureLabel === "wrong_recall") {
    return {
      demotionReason: "wrong_recall_quality_repair",
    };
  }
  if (failureLabel === "noisy_procedural_memory") {
    return {
      demotionReason: "noisy_procedural_quality_repair",
    };
  }

  return null;
}

export function readMemoryQualityRepairSignal(
  fact: FactMemory,
): MemoryQualityRepairSignal | null {
  return readStructuredQualitySignal(fact);
}

export function readMemoryQualityReplacementMemoryId(
  fact: FactMemory,
): string | null {
  const repairSource = normalizeString(
    readStringAttribute(fact.attributes, "memoryQualityRepairSource"),
  );
  if (!QUALITY_REPAIR_SOURCE_VALUES.has(repairSource)) {
    return null;
  }

  const failureLabel = normalizeString(
    readStringAttribute(fact.attributes, "memoryQualityFailureLabel"),
  );
  if (failureLabel !== "stale_recall") {
    return null;
  }

  const replacementId = readStringAttribute(
    fact.attributes,
    "memoryQualityReplacementMemoryId",
  )?.trim();
  return replacementId && replacementId.length > 0 ? replacementId : null;
}

export function isDemotiveMemoryQualityFailureLabel(
  label: MemoryQualityFailureLabel,
): boolean {
  return QUALITY_DEMOTIVE_FAILURE_LABELS.has(label);
}
