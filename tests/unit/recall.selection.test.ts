import { describe, expect, it } from "bun:test";
import {
  createFeedbackMemory,
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import { createLanguageService } from "../../src/language";
import type { RoutingDecision } from "../../src/recall/router";
import {
  selectFeedbackForProfile,
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

  it("prefers better-supported fact candidates when slot signals tie", () => {
    const language = createLanguageService();
    const facts = [
      createFactMemory({
        id: "fact-weak",
        userId: "user-1",
        category: "project",
        content: "The runtime rollout is blocked by legal signoff.",
        source: SOURCE,
        updatedAt: TIMESTAMP,
      }),
      createFactMemory({
        id: "fact-strong",
        userId: "user-1",
        category: "project",
        content: "The runtime rollout is blocked by legal signoff.",
        source: SOURCE,
        accessCount: 5,
        lastAccessedAt: TIMESTAMP,
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
      undefined,
      new Map([["fact-strong", 3]]),
    );

    expect(result.facts.map((fact) => fact.id)).toEqual(["fact-strong"]);
    expect(result.traces.find((trace) => trace.memoryId === "fact-strong")?.outcomeScore).toBeGreaterThan(0);
    expect(result.traces.find((trace) => trace.memoryId === "fact-strong")?.whyReturned).toContain("outcomeScore=");
  });

  it("keeps appliesTo-distinct feedback variants separate and prioritizes coding-agent guidance", () => {
    const feedback = [
      createFeedbackMemory({
        id: "feedback-general",
        userId: "user-1",
        rule: "Use bullet points.",
        kind: "validated_pattern",
        appliesTo: "general_response",
        source: SOURCE,
        updatedAt: "2026-01-11T00:00:00.000Z",
      }),
      createFeedbackMemory({
        id: "feedback-coding",
        userId: "user-1",
        rule: "Use bullet points.",
        kind: "validated_pattern",
        appliesTo: "coding_agent",
        source: SOURCE,
        updatedAt: "2026-01-10T00:00:00.000Z",
      }),
    ];

    const selected = selectFeedbackForProfile(feedback, "coding_agent");

    expect(selected.map((record) => record.id)).toEqual([
      "feedback-coding",
      "feedback-general",
    ]);
  });
});
