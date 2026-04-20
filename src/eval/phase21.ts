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

export const PHASE_21_FALLBACK_SCENARIO_IDS = [
  "scenario-complex-01",
  "scenario-medium-11-blocker-slot-zh",
  "scenario-medium-13-reference-next-step",
  "scenario-medium-13-reference-slot",
  "scenario-medium-13-role-slot",
] as const;

export interface Phase21CreateMemoryInput {
  caseId: string;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  scopeNamespace: string;
}

export type Phase21CreateMemoryResult =
  | GoodMemory
  | {
      cleanup?: () => Promise<void>;
      memory: GoodMemory;
    };

export function createPhase21FallbackCreateMemory(): (
  input: Phase21CreateMemoryInput,
) => Phase21CreateMemoryResult {
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
