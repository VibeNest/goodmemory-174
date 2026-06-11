import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";

function createDeterministicTestingConfig() {
  let tick = 0;
  let idCounter = 0;
  return {
    createId: () => {
      idCounter += 1;
      return `det-id-${String(idCounter).padStart(6, "0")}`;
    },
    now: () => {
      tick += 1;
      return new Date(Date.UTC(2026, 0, 1, 0, 0, tick));
    },
  };
}

const SCOPE = { userId: "user-determinism" };

async function seedAndRecall() {
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    testing: createDeterministicTestingConfig(),
  });
  await memory.remember({
    messages: [
      { role: "user", content: "I met Kelly at the book club event last month." },
      { role: "user", content: "I built three raised garden beds for the redesign." },
      { role: "user", content: "I updated my weekly mileage target to 30 miles." },
    ],
    annotations: [0, 1, 2].map((messageIndex) => ({
      confirmed: true,
      kindHint: "fact" as const,
      messageIndex,
      metadataPatch: {
        category: "external_benchmark",
        tags: ["source_message", "source_order", "user_answer"],
        attributes: { sourceOrder: messageIndex * 2 },
      },
      reason: "determinism test",
      remember: "always" as const,
      verified: true,
    })),
    extractionStrategy: "rules-only",
    scope: SCOPE,
  });
  const recall = await memory.recall({
    query: "What did I bring up about my garden redesign?",
    scope: SCOPE,
    strategy: "rules-only",
  });
  const exported = await memory.exportMemory({ scope: SCOPE });
  return {
    exportedFacts: exported.durable.facts.map((fact) => ({
      createdAt: fact.createdAt,
      id: fact.id,
    })),
    recalledIds: recall.facts.map((fact) => fact.id),
  };
}

describe("deterministic testing seams", () => {
  it("threads testing.createId and testing.now into remembered facts", async () => {
    const first = await seedAndRecall();

    for (const fact of first.exportedFacts) {
      expect(fact.id).toMatch(/^det-id-\d{6}$/);
      expect(fact.createdAt.startsWith("2026-01-01T")).toBe(true);
    }
  });

  it("produces identical memories and recall across separate instances", async () => {
    const first = await seedAndRecall();
    const second = await seedAndRecall();

    expect(second.exportedFacts).toEqual(first.exportedFacts);
    expect(second.recalledIds).toEqual(first.recalledIds);
  });
});
