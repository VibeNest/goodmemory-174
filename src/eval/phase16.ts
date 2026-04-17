import type { GoodMemory } from "../api/contracts";
import { createGoodMemory } from "../api/createGoodMemory";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../storage/memory";
import type {
  PersonaSpec,
  ScenarioFixture,
} from "./dataset";

export const PHASE_16_SCENARIO_IDS = [
  "scenario-medium-01",
  "scenario-medium-03",
  "scenario-medium-17",
  "scenario-complex-01",
  "scenario-complex-05",
] as const;

export interface Phase16CreateMemoryInput {
  caseId: string;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  scopeNamespace: string;
}

export type Phase16CreateMemoryResult =
  | GoodMemory
  | {
      cleanup?: () => Promise<void>;
      memory: GoodMemory;
    };

export function createPhase16FallbackCreateMemory(): (
  input: Phase16CreateMemoryInput,
) => Phase16CreateMemoryResult {
  return () => ({
    memory: createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createInMemoryDocumentStore(),
        sessionStore: createInMemorySessionStore(),
      },
    }),
  });
}
