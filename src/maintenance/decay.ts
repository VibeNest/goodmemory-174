import type { MemorySourceMethod } from "../domain/provenance";

export interface DecayInput {
  basePriority: number;
  importance: number;
  updatedAt: string;
  referenceTime: string;
  sourceMethod: MemorySourceMethod;
}

function daysBetween(left: string, right: string): number {
  const delta = Math.abs(new Date(left).getTime() - new Date(right).getTime());
  return delta / (1000 * 60 * 60 * 24);
}

export function computeDecayedPriority(input: DecayInput): number {
  const ageDays = daysBetween(input.referenceTime, input.updatedAt);
  const importanceShield = 1 + Math.max(0, input.importance) * 1.5;
  const sourcePenalty = input.sourceMethod === "inferred" ? 1.35 : 1;
  const decayFactor = ageDays / (45 * importanceShield);
  const adjusted = input.basePriority / (1 + decayFactor * sourcePenalty);

  return Number(adjusted.toFixed(6));
}
