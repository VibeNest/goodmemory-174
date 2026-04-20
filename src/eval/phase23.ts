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
import {
  PHASE_22_STRESS_SCENARIO_IDS,
} from "./phase22";
import type {
  RetrievalStrategyRolloutConfig,
  StrategyRolloutConfig,
} from "./strategy-rollout";

export const PHASE_23_PROMOTION_SCENARIO_IDS = [
  ...PHASE_22_STRESS_SCENARIO_IDS,
] as const;

export interface Phase23CreateMemoryInput {
  caseId: string;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  scopeNamespace: string;
  strategyRollout?: StrategyRolloutConfig;
}

export type Phase23CreateMemoryResult =
  | GoodMemory
  | {
      cleanup?: () => Promise<void>;
      memory: GoodMemory;
    };

export function createPhase23FallbackCreateMemory(): (
  input: Phase23CreateMemoryInput,
) => Phase23CreateMemoryResult {
  return (input) => ({
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
        ...(input.strategyRollout &&
        (input.strategyRollout.family ?? "retrieval") === "retrieval"
          ? {
              retrievalStrategyRollout:
                input.strategyRollout as RetrievalStrategyRolloutConfig,
            }
          : {}),
      },
    ),
  });
}
