import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createGoodMemory } from "../../src";
import {
  listPersonaSpecs,
  listScenarioFixtures,
  validateScenarioDatasetLinks,
} from "../../src/eval/dataset";
import { runGoodMemoryScenario } from "../../src/eval/runners";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("scenario dataset smoke", () => {
  it("replays every eval scenario deterministically", async () => {
    const personaDir = join(import.meta.dir, "../../fixtures/personas/eval");
    const scenarioDir = join(import.meta.dir, "../../fixtures/scenarios/eval");
    const personas = await listPersonaSpecs(personaDir);
    const scenarios = await listScenarioFixtures(scenarioDir);
    validateScenarioDatasetLinks(personas, scenarios);
    const personasById = new Map(personas.map((persona) => [persona.persona_id, persona]));

    for (const scenario of scenarios) {
      const persona = personasById.get(scenario.persona_id);
      expect(persona).toBeDefined();

      const memory = createGoodMemory({
        storage: { provider: "memory" },
        adapters: {
          documentStore: createInMemoryDocumentStore(),
          sessionStore: createInMemorySessionStore(),
        },
      });
      const result = await runGoodMemoryScenario({
        memory,
        persona: persona!,
        scenario,
        answerGenerator: async (input) => ({
          content: input.memoryContext ?? "missing-memory-context",
        }),
      });

      expect(result.trace.sessionsReplayed).toBeGreaterThan(0);
      expect(result.trace.rememberEvents.length).toBeGreaterThan(0);
      expect(result.memoryContext).toBeTruthy();
    }
  });
});
