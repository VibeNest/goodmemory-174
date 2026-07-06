import { describe, expect, it } from "bun:test";
import type { RecallResult } from "../../src/api/contracts";
import { shouldInjectPromptContext } from "../../src/install/hostInjectionGate";

// The relevance gate decides whether a user-prompt-submit recall carries any
// query-specific signal worth injecting. Continuity-only recalls (working
// memory, journal — already delivered by the session-start brief) skip.

function buildRecall(overrides: {
  candidateTraces?: Array<Record<string, unknown>>;
  feedback?: unknown[];
  preferences?: unknown[];
  requestedSlots?: string[];
}): RecallResult {
  return {
    archives: [],
    episodes: [],
    evidence: [],
    facts: [],
    feedback: (overrides.feedback ?? []) as RecallResult["feedback"],
    journal: null,
    packet: {
      debug: { estimatedTokens: 0, omittedSections: [] },
      renderingProfile: "coding_agent",
    },
    preferences: (overrides.preferences ?? []) as RecallResult["preferences"],
    profile: null,
    references: [],
    workingMemory: null,
    metadata: {
      adapterId: "rules",
      analysisMode: "rules-only",
      candidateTraces: (overrides.candidateTraces ??
        []) as unknown as RecallResult["metadata"]["candidateTraces"],
      hits: [],
      latencyMs: 1,
      policyApplied: [],
      routingDecision: {
        actionDriving: false,
        continuation: true,
        intent: "general_assistance",
        referenceSeeking: false,
        requestedSlots: (overrides.requestedSlots ?? []) as never[],
        retrievalProfile: "coding_agent",
        sourcePriorities: [],
        strategy: "rules-only",
        strategyExplanation: {
          hardFloor: "lexical_runtime_procedural_priors",
          llmRefinement: false,
          requestedStrategy: "rules-only",
          resolvedStrategy: "rules-only",
          semanticTieBreaking: false,
          summary: "test",
        },
        supportSlots: [],
      },
      tokenCount: 1,
      verificationHints: [],
    },
  } as unknown as RecallResult;
}

function trace(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    fallback: false,
    intentScore: 0,
    lexicalScore: 0,
    memoryId: "fact-1",
    memoryType: "fact",
    returned: true,
    slot: null,
    ...overrides,
  };
}

describe("shouldInjectPromptContext", () => {
  it("skips continuity-only recalls", () => {
    const decision = shouldInjectPromptContext(buildRecall({}));
    expect(decision).toEqual({ inject: false, reason: "continuity_only" });
  });

  it("injects on returned lexical hits", () => {
    const decision = shouldInjectPromptContext(
      buildRecall({ candidateTraces: [trace({ lexicalScore: 0.4 })] }),
    );
    expect(decision).toEqual({ inject: true, reason: "lexical_hit" });
  });

  it("ignores lexical scores on candidates that were not returned", () => {
    const decision = shouldInjectPromptContext(
      buildRecall({
        candidateTraces: [trace({ lexicalScore: 0.9, returned: false })],
      }),
    );
    expect(decision).toEqual({ inject: false, reason: "continuity_only" });
  });

  it("injects on semantic-only hits", () => {
    const decision = shouldInjectPromptContext(
      buildRecall({
        candidateTraces: [trace({ semanticScore: 0.31 })],
      }),
    );
    expect(decision).toEqual({ inject: true, reason: "semantic_hit" });
  });

  it("injects when query-selected guidance lanes are non-empty", () => {
    expect(
      shouldInjectPromptContext(buildRecall({ feedback: [{ id: "fb-1" }] })),
    ).toEqual({ inject: true, reason: "guidance_match" });
    expect(
      shouldInjectPromptContext(buildRecall({ preferences: [{ id: "pref-1" }] })),
    ).toEqual({ inject: true, reason: "guidance_match" });
  });

  it("injects when the router requested slots for the prompt", () => {
    const decision = shouldInjectPromptContext(
      buildRecall({ requestedSlots: ["project_state_support"] }),
    );
    expect(decision).toEqual({ inject: true, reason: "slot_match" });
  });
});
