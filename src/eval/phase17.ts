import type { GoodMemory } from "../api/contracts";
import { createGoodMemory } from "../api/createGoodMemory";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../storage/memory";
import { createFakeEmbeddingAdapter } from "../testing/fakes";
import type {
  PersonaSpec,
  ScenarioFixture,
} from "./dataset";

export const PHASE_17_FALLBACK_SCENARIO_IDS = [
  "scenario-complex-01",
  "scenario-medium-11-blocker-slot-zh",
  "scenario-medium-11-reference-slot-zh",
  "scenario-medium-13-blocker-slot",
  "scenario-medium-13-reference-next-step",
  "scenario-medium-13-reference-slot",
  "scenario-medium-13-role-slot",
] as const;

export interface Phase17CreateMemoryInput {
  caseId: string;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  scopeNamespace: string;
}

export type Phase17CreateMemoryResult =
  | GoodMemory
  | {
      cleanup?: () => Promise<void>;
      memory: GoodMemory;
    };

export function createPhase17FallbackCreateMemory(): (
  input: Phase17CreateMemoryInput,
) => Phase17CreateMemoryResult {
  return () => ({
    memory: createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createInMemoryDocumentStore(),
        embeddingAdapter: createFakeEmbeddingAdapter(),
        sessionStore: createInMemorySessionStore(),
      },
    }),
  });
}
