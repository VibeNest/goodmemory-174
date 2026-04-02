import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  DEFAULT_PERSONA_DATASET_RULES,
  listPersonaSpecs,
  loadPersonaSpec,
  summarizePersonaDataset,
  validatePersonaDatasetCoverage,
} from "../../src/eval/dataset";

describe("persona dataset", () => {
  it("loads and validates a persona spec fixture", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );

    expect(persona.persona_id).toBe("medium-01");
    expect(persona.scenario_ids).toEqual(["scenario-medium-01"]);
  });

  it("fails fast on invalid persona schema", async () => {
    await expect(
      loadPersonaSpec(
        join(import.meta.dir, "../../fixtures/personas/invalid-schema.json"),
      ),
    ).rejects.toThrow("Invalid persona fixture");
  });

  it("enumerates the persona dataset and enforces lifecycle coverage", async () => {
    const personas = await listPersonaSpecs(
      join(import.meta.dir, "../../fixtures/personas/eval"),
    );

    const summary = summarizePersonaDataset(personas);

    expect(personas).toHaveLength(40);
    expect(summary.lifecycleBuckets).toEqual({
      medium: 28,
      complex: 8,
      long: 4,
    });

    expect(() =>
      validatePersonaDatasetCoverage(personas, DEFAULT_PERSONA_DATASET_RULES),
    ).not.toThrow();
  });
});
