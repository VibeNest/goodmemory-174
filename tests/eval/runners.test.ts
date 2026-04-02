import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createGoodMemory } from "../../src";
import { createInMemoryDocumentStore, createInMemorySessionStore } from "../../src/storage/memory";
import {
  loadPersonaSpec,
  loadScenarioFixture,
} from "../../src/eval/dataset";
import {
  runBaselineScenario,
  runGoodMemoryScenario,
} from "../../src/eval/runners";

describe("eval runners", () => {
  it("builds a baseline answer package without memory context", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );

    const result = await runBaselineScenario({
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext ? "unexpected" : "baseline-answer",
      }),
    });

    expect(result.mode).toBe("baseline");
    expect(result.memoryContext).toBeUndefined();
    expect(result.answer).toBe("baseline-answer");
    expect(result.trace.sessionsReplayed).toBe(0);
  });

  it("replays scenario history through GoodMemory and builds a memory-backed answer package", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext?.includes("runbook")
          ? "goodmemory-answer"
          : "missing-context",
      }),
    });

    expect(result.mode).toBe("goodmemory");
    expect(result.memoryContext).toContain("runbook");
    expect(result.answer).toBe("goodmemory-answer");
    expect(result.trace.sessionsReplayed).toBeGreaterThan(0);
    expect(result.trace.rememberEvents.length).toBeGreaterThan(0);
    expect(result.trace.recallHitCount).toBeGreaterThan(0);
    expect(
      result.trace.rememberEvents.some((session) => session.events.length > 0),
    ).toBe(true);
    expect(
      result.trace.rememberEvents
        .flatMap((session) => session.events)
        .some((event) => event.memoryType === "reference"),
    ).toBe(true);
    expect(result.retrieved?.references.length).toBeGreaterThan(0);
    expect(result.retrieved?.hits.some((hit) => hit.type === "reference")).toBe(true);
    expect(result.retrieved?.renderedMemoryContext).toContain("runbook");
    expect(
      result.retrieved?.feedback.some((feedback) =>
        feedback.rule.includes("Please confirm the updated runbook"),
      ) ?? false,
    ).toBe(false);
    expect(result.transcript).not.toContain("I can do that once I have the full remembered context.");
  });
});
