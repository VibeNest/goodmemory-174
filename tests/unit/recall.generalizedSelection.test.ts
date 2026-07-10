import { describe, expect, it } from "bun:test";

import { createFactMemory } from "../../src/domain/records";
import { createLanguageService } from "../../src/language";
import type { RoutingDecision } from "../../src/recall/router";
import { selectGeneralizedFactsForInternalUse } from "../../src/recall/selection";

const TIMESTAMP = "2026-01-10T00:00:00.000Z";

function routingDecision(
  overrides: Partial<RoutingDecision> = {},
): RoutingDecision {
  return {
    actionDriving: false,
    continuation: false,
    intent: "general_assistance",
    referenceSeeking: false,
    requestedSlots: [],
    retrievalProfile: "general_chat",
    sourcePriorities: ["profile", "fact", "feedback"],
    strategy: "rules-only",
    strategyExplanation: {
      hardFloor: "lexical_runtime_procedural_priors",
      llmRefinement: false,
      requestedStrategy: "rules-only",
      resolvedStrategy: "rules-only",
      semanticTieBreaking: false,
      summary: "rules-only",
    },
    supportSlots: [],
    ...overrides,
  };
}

describe("generalized production selection", () => {
  it("selects relevant facts without loading the fitted selector graph", () => {
    const facts = [
      createFactMemory({
        category: "project",
        content: "The release is blocked by legal signoff.",
        id: "blocker",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
      createFactMemory({
        category: "personal",
        content: "The user enjoys landscape photography.",
        id: "photography",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "What is blocking the release?",
      createLanguageService(),
      "en",
      "general_chat",
      routingDecision(),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id)).toEqual(["blocker"]);
    expect(result.traces.find(({ memoryId }) => memoryId === "blocker")?.returned)
      .toBe(true);
  });

  it("keeps related facts available for queries that also seek a reference", () => {
    const facts = [
      createFactMemory({
        category: "project",
        content: "Vendor approval is blocking the release quality program.",
        id: "vendor-approval",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "Check the release quality runbook and vendor approval.",
      createLanguageService(),
      "en",
      "coding_agent",
      routingDecision({ referenceSeeking: true }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id)).toEqual(["vendor-approval"]);
  });

  it("includes relevant blocking context when a reference is checked before action", () => {
    const facts = [
      createFactMemory({
        category: "project",
        content: "Vendor approval is blocking the release quality program.",
        id: "pre-action-blocker",
        source: { extractedAt: TIMESTAMP, method: "explicit" },
        updatedAt: TIMESTAMP,
        userId: "user-1",
      }),
    ];

    const result = selectGeneralizedFactsForInternalUse(
      facts,
      "Check the release runbook before editing files.",
      createLanguageService(),
      "en",
      "coding_agent",
      routingDecision({ referenceSeeking: true, requestedSlots: ["reference"] }),
      null,
      TIMESTAMP,
    );

    expect(result.facts.map(({ id }) => id)).toEqual(["pre-action-blocker"]);
  });

});
