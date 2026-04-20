import type { GoodMemory } from "../api/contracts";
import { createInternalGoodMemory } from "../api/createGoodMemory";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../storage/memory";
import {
  createFakeEmbeddingAdapter,
  createFakeRecallRouter,
} from "../testing/fakes";
import type {
  PersonaSpec,
  ScenarioFixture,
} from "./dataset";

export const PHASE_22_STRESS_SCENARIO_IDS = [
  "scenario-medium-13-reference-next-step",
  "scenario-medium-13-blocker-slot",
  "scenario-medium-13-role-slot",
  "scenario-complex-01",
  "scenario-medium-11-reference-slot-zh",
] as const;

export interface Phase22CreateMemoryInput {
  caseId: string;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  scopeNamespace: string;
}

export type Phase22CreateMemoryResult =
  | GoodMemory
  | {
      cleanup?: () => Promise<void>;
      memory: GoodMemory;
    };

export function createPhase22FallbackCreateMemory(): (
  input: Phase22CreateMemoryInput,
) => Phase22CreateMemoryResult {
  return () => ({
    memory: createInternalGoodMemory(
      {
        storage: { provider: "memory" },
        adapters: {
          documentStore: createInMemoryDocumentStore(),
          embeddingAdapter: createFakeEmbeddingAdapter(),
          sessionStore: createInMemorySessionStore(),
        },
      },
      {
        assistedRecallRouter: createFakeRecallRouter(),
      },
    ),
  });
}
