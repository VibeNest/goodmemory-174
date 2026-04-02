import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { loadJsonFixture } from "../../src/testing/fixtures";

describe("fixture loaders", () => {
  it("loads a valid persona fixture", async () => {
    const fixture = await loadJsonFixture<{ persona_id: string }>(
      join(import.meta.dir, "../../fixtures/personas/smoke-persona.json"),
    );

    expect(fixture.persona_id).toBe("smoke-persona");
  });

  it("throws a useful error for invalid json", async () => {
    await expect(
      loadJsonFixture(join(import.meta.dir, "../../fixtures/personas/invalid.json")),
    ).rejects.toThrow("Invalid JSON fixture");
  });
});
