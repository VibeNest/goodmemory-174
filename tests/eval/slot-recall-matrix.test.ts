import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createGoodMemory } from "../../src";
import {
  loadPersonaSpec,
  loadScenarioFixture,
} from "../../src/eval/dataset";
import { runGoodMemoryScenario } from "../../src/eval/runners";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

async function runFixtureScenario(personaId: string, scenarioId: string) {
  const persona = await loadPersonaSpec(
    join(import.meta.dir, `../../fixtures/personas/eval/${personaId}.json`),
  );
  const scenario = await loadScenarioFixture(
    join(import.meta.dir, `../../fixtures/scenarios/eval/${scenarioId}.json`),
  );
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore: createInMemoryDocumentStore(),
      sessionStore: createInMemorySessionStore(),
    },
  });

  return runGoodMemoryScenario({
    memory,
    persona,
    scenario,
    answerGenerator: async (input) => ({
      content: input.memoryContext ?? "missing-memory-context",
    }),
  });
}

describe("eval slot recall matrix", () => {
  it("keeps role-only fixture recall inside profile evidence without spilling fact lanes", async () => {
    const result = await runFixtureScenario(
      "medium-13",
      "scenario-medium-13-role-slot",
    );

    expect(result.retrieved?.profile?.identity.role).toBe("data scientist");
    expect(result.retrieved?.facts).toHaveLength(0);
    expect(result.retrieved?.references).toHaveLength(0);
    expect(result.retrieved?.episodes).toHaveLength(0);
    expect(result.retrieved?.candidateTraces.length).toBeGreaterThan(0);
  });

  it("keeps blocker-only fixture recall inside blocker facts", async () => {
    const result = await runFixtureScenario(
      "medium-13",
      "scenario-medium-13-blocker-slot",
    );

    expect(result.retrieved?.facts.map((fact) => fact.content)).toEqual([
      "the current blocker is vendor approval for workflow reliability dashboard.",
    ]);
    expect(result.retrieved?.references).toHaveLength(0);
    expect(result.retrieved?.episodes).toHaveLength(0);
    expect(result.retrieved?.candidateTraces.length).toBeGreaterThan(0);
  });

  it("keeps reference-only fixture recall inside reference evidence", async () => {
    const result = await runFixtureScenario(
      "medium-13",
      "scenario-medium-13-reference-slot",
    );

    expect(result.retrieved?.references.map((reference) => reference.pointer)).toEqual([
      "docs/workflow-reliability-dashboard-runbook-v2.md",
    ]);
    expect(result.retrieved?.facts).toHaveLength(0);
    expect(result.retrieved?.episodes).toHaveLength(0);
    expect(result.retrieved?.candidateTraces.length).toBeGreaterThan(0);
  });

  it("frames reference plus next-step fixture support as immediate versus deferred state", async () => {
    const result = await runFixtureScenario(
      "medium-13",
      "scenario-medium-13-reference-next-step",
    );

    expect(result.retrieved?.references.map((reference) => reference.pointer)).toEqual([
      "docs/workflow-reliability-dashboard-runbook-v2.md",
    ]);
    expect(result.retrieved?.facts[0]?.content).toBe(
      "the current blocker is vendor approval for workflow reliability dashboard.",
    );
    expect(
      result.retrieved?.facts.some((fact) => fact.content.includes("data scientist")),
    ).toBe(false);
    const memoryContext = result.memoryContext ?? "";

    expect(memoryContext).toContain("Immediate next-step support:");
    expect(memoryContext).toContain(
      "the current blocker is vendor approval for workflow reliability dashboard.",
    );
    expect(memoryContext).toContain("Deferred follow-up context:");
    expect(memoryContext).toContain(
      "the open loop is final signoff for workflow reliability dashboard.",
    );
    expect(memoryContext.indexOf("Immediate next-step support:")).toBeLessThan(
      memoryContext.indexOf("Deferred follow-up context:"),
    );
    expect(result.retrieved?.episodes).toHaveLength(0);
    expect(result.retrieved?.candidateTraces.length).toBeGreaterThan(0);
  });

  it("keeps Chinese blocker-only fixture recall inside blocker facts", async () => {
    const result = await runFixtureScenario(
      "medium-11",
      "scenario-medium-11-blocker-slot-zh",
    );

    expect(result.retrieved?.facts.map((fact) => fact.content)).toEqual([
      "当前阻塞是 migration rollout 的供应商审批",
    ]);
    expect(result.retrieved?.references).toHaveLength(0);
    expect(result.retrieved?.episodes).toHaveLength(0);
    expect(result.retrieved?.candidateTraces.length).toBeGreaterThan(0);
  });

  it("keeps Chinese reference-only fixture recall inside reference evidence", async () => {
    const result = await runFixtureScenario(
      "medium-11",
      "scenario-medium-11-reference-slot-zh",
    );

    expect(result.retrieved?.references.map((reference) => reference.pointer)).toEqual([
      "docs/migration-rollout-runbook-v2.md",
    ]);
    expect(result.retrieved?.facts).toHaveLength(0);
    expect(result.retrieved?.episodes).toHaveLength(0);
    expect(result.retrieved?.candidateTraces.length).toBeGreaterThan(0);
  });
});
