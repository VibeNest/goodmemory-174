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

  it("can force ignore-memory during eval replay and still produce a valid answer package", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      ignoreMemory: true,
      answerGenerator: async () => ({
        content: "answer-without-memory",
      }),
    });

    expect(result.answer).toBe("answer-without-memory");
    expect(result.retrieved?.facts).toHaveLength(0);
    expect(result.retrieved?.policyApplied).toContain("ignore_memory");
  });

  it("replays complex profile context so role and location survive into retrieved memory", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/complex-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-complex-01.json"),
    );
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createInMemoryDocumentStore(),
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    expect(result.retrieved?.profile?.identity.name).toBe("Felix");
    expect(result.retrieved?.profile?.identity.role).toBe("climate policy advisor");
    expect(result.retrieved?.profile?.identity.location).toBe("Austin, USA");
    expect(result.retrieved?.profile?.activeContext.currentProjects).toContain(
      "incident playbook refresh",
    );
    expect(result.retrieved?.renderedMemoryContext).toContain(
      "Felix - climate policy advisor - Austin, USA",
    );
    expect(result.retrieved?.renderedMemoryContext).toContain("## Active Context");
    expect(result.retrieved?.renderedMemoryContext).toContain(
      "Current projects: incident playbook refresh",
    );
    expect(
      result.trace.rememberEvents
        .flatMap((session) => session.events)
        .some((event) => event.reason === "explicit_profile_role"),
    ).toBe(true);
    expect(
      result.trace.rememberEvents
        .flatMap((session) => session.events)
        .some((event) => event.reason === "explicit_profile_location"),
    ).toBe(true);
    expect(
      result.trace.rememberEvents
        .flatMap((session) => session.events)
        .some((event) => event.reason === "explicit_profile_current_project"),
    ).toBe(true);
  });
});
