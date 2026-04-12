import { describe, expect, it } from "bun:test";
import {
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import { createLanguageService } from "../../src/language";
import type { RoutingDecision } from "../../src/recall/router";
import {
  selectFacts,
  selectReferences,
} from "../../src/recall/selection";

const TIMESTAMP = "2026-01-10T00:00:00.000Z";
const SOURCE = {
  method: "explicit" as const,
  extractedAt: TIMESTAMP,
};

function buildRoutingDecision(
  overrides: Partial<RoutingDecision>,
): RoutingDecision {
  return {
    retrievalProfile: "general_chat",
    intent: "general_assistance",
    strategy: "rules-only",
    strategyExplanation: {
      requestedStrategy: "rules-only",
      resolvedStrategy: "rules-only",
      summary: "rules-only",
      hardFloor: "lexical_runtime_procedural_priors",
      semanticTieBreaking: false,
      llmRefinement: false,
    },
    sourcePriorities: ["profile", "fact", "feedback"],
    requestedSlots: [],
    supportSlots: [],
    actionDriving: false,
    referenceSeeking: false,
    continuation: false,
    ...overrides,
  };
}

describe("recall selection", () => {
  it("selects the blocker fact for blocker slot queries", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-blocker",
        userId: "user-1",
        category: "project",
        content: "The runtime rollout is blocked by legal signoff.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-focus",
        userId: "user-1",
        category: "project",
        content: "Current focus is improving eval traceability.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectFacts(
      facts,
      "What is the blocker right now?",
      language,
      "en",
      "general_chat",
      buildRoutingDecision({
        requestedSlots: ["blocker"],
      }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map((fact) => fact.id)).toEqual(["fact-blocker"]);
    expect(result.traces.find((trace) => trace.memoryId === "fact-blocker")?.returned).toBe(true);
  });

  it("falls back to a unique reference candidate for reference slot queries", () => {
    const language = createLanguageService();
    const references = [
      createReferenceMemory({
        id: "ref-1",
        userId: "user-1",
        title: "Operational Notes",
        pointer: "docs/ops-notes.md",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
    ];

    const result = selectReferences(
      references,
      "Where is the current source of truth?",
      language,
      "en",
      buildRoutingDecision({
        requestedSlots: ["reference"],
        referenceSeeking: true,
      }),
      TIMESTAMP,
    );

    expect(result.references.map((reference) => reference.id)).toEqual(["ref-1"]);
    expect(result.traces[0]?.fallback).toBe("same_slot_unique_candidate");
  });
});
