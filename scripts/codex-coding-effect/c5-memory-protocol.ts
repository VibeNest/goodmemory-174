import type { C5PilotStageRun } from "./c5-pilot-plan";

type C5MemoryProtocolStage = Pick<
  C5PilotStageRun,
  "id" | "memoryExpectation"
>;

export const C5_PRIOR_EXPORT_LINEAGE_REASON =
  "pre-stage memory export omits prior native Stop lineage";

export function isC5StageWritebackRequired(input: {
  priorWritebackCommitted: boolean;
  run: { stages: readonly C5MemoryProtocolStage[] };
  stage: Pick<C5PilotStageRun, "id">;
}): boolean {
  if (input.priorWritebackCommitted) return false;
  const stageIndex = input.run.stages.findIndex(({ id }) => id === input.stage.id);
  return input.run.stages.slice(stageIndex + 1).some(
    ({ memoryExpectation }) => memoryExpectation === "required",
  );
}

export function resolveC5PriorMemoryLineage(input: {
  exportedMemoryIds: readonly string[];
  injectedMemoryIds: readonly string[];
  priorWritebackMemoryIds: readonly string[];
}): {
  containsPriorWritebackLineage: boolean;
  expectedPriorMemoryIds: string[];
  expectedRecalledMemoryIds: string[];
} {
  const exportedMemoryIds = uniqueSorted(input.exportedMemoryIds);
  const injectedMemoryIds = uniqueSorted(input.injectedMemoryIds);
  const priorWritebackMemoryIds = uniqueSorted(input.priorWritebackMemoryIds);
  return {
    containsPriorWritebackLineage: priorWritebackMemoryIds.every((id) =>
      exportedMemoryIds.includes(id)
    ),
    expectedPriorMemoryIds: exportedMemoryIds,
    expectedRecalledMemoryIds: exportedMemoryIds.filter((id) =>
      injectedMemoryIds.includes(id)
    ),
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
