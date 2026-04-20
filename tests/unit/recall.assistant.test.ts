import { describe, expect, it } from "bun:test";
import {
  createEpisodeMemory,
  createFactMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import { createSessionArchive } from "../../src/evolution/contracts";
import {
  applyRecallAssistantPlan,
  applyRecallAssistantRerank,
  buildRecallAssistantCandidates,
} from "../../src/recall/assistant";
import type { RoutingDecision } from "../../src/recall/router";

function buildRoutingDecision(): RoutingDecision {
  return {
    retrievalProfile: "general_chat",
    intent: "general_assistance",
    strategy: "llm-assisted",
    strategyExplanation: {
      requestedStrategy: "llm-assisted",
      resolvedStrategy: "llm-assisted",
      summary: "llm-assisted routing enabled refinement.",
      hardFloor: "lexical_runtime_procedural_priors",
      semanticTieBreaking: false,
      llmRefinement: true,
    },
    sourcePriorities: [
      "profile",
      "feedback",
      "fact",
      "episode",
      "working_memory",
      "session_journal",
    ],
    requestedSlots: ["role"],
    supportSlots: [],
    actionDriving: false,
    referenceSeeking: false,
    continuation: false,
  };
}

describe("recall assistant helpers", () => {
  it("merges safe plan hints without removing deterministic slots", () => {
    const result = applyRecallAssistantPlan({
      influence: {
        addedRequestedSlots: [],
        addedSupportSlots: [],
        decisions: [],
        planApplied: false,
        rerankApplied: false,
        rerankedCandidateIds: [],
        suppressedCandidateIds: [],
      },
      plan: {
        querySummary: "source of truth for the migration",
        rationale: "reference lookup needs project-state support",
        requestedSlotAdditions: ["reference"],
        sourcePriorityOrder: [
          "fact",
          "profile",
          "feedback",
          "episode",
          "working_memory",
          "session_journal",
        ],
        supportSlotAdditions: ["project_state_support"],
      },
      routingDecision: buildRoutingDecision(),
    });

    expect(result.routingDecision.requestedSlots).toEqual(["role", "reference"]);
    expect(result.routingDecision.supportSlots).toEqual(["project_state_support"]);
    expect(result.routingDecision.sourcePriorities[0]).toBe("fact");
    expect(result.influence.planApplied).toBe(true);
    expect(result.influence.querySummary).toContain("source of truth");
  });

  it("falls back when a plan proposes unknown sources", () => {
    const result = applyRecallAssistantPlan({
      influence: {
        addedRequestedSlots: [],
        addedSupportSlots: [],
        decisions: [],
        planApplied: false,
        rerankApplied: false,
        rerankedCandidateIds: [],
        suppressedCandidateIds: [],
      },
      plan: {
        querySummary: "bad plan",
        rationale: "bad source",
        sourcePriorityOrder: ["fact", "profile", "evidence"],
      },
      routingDecision: buildRoutingDecision(),
    });

    expect(result.routingDecision.sourcePriorities).toEqual(
      buildRoutingDecision().sourcePriorities,
    );
    expect(result.influence.fallbackReason).toBe("invalid_plan_sources");
  });

  it("applies bounded rerank within the provided durable candidate pool", () => {
    const fact = createFactMemory({
      id: "fact-1",
      userId: "u-1",
      content: "Current blocker is service account rotation.",
      category: "project",
      factKind: "blocker",
      source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
    });
    const reference = createReferenceMemory({
      id: "ref-1",
      userId: "u-1",
      title: "Migration runbook",
      pointer: "docs/migration-runbook.md",
      referenceKind: "source_of_truth",
      source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
    });
    const archive = createSessionArchive({
      id: "archive-1",
      userId: "u-1",
      sessionId: "s-1",
      summary: "Paused while waiting for the runbook confirmation.",
      archivedAt: "2026-01-01T00:00:00.000Z",
    });
    const episode = createEpisodeMemory({
      id: "episode-1",
      userId: "u-1",
      summary: "Investigated the migration blocker and updated the runbook pointer.",
      topics: ["migration"],
    });

    const selection = {
      facts: [fact],
      references: [reference],
      archives: [archive],
      episodes: [episode],
    };
    const candidates = buildRecallAssistantCandidates(selection);

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "fact-1",
      "ref-1",
      "archive-1",
      "episode-1",
    ]);
    expect(candidates.map((candidate) => candidate.protected)).toEqual([
      true,
      true,
      false,
      false,
    ]);

    const reranked = applyRecallAssistantRerank({
      influence: {
        addedRequestedSlots: [],
        addedSupportSlots: [],
        decisions: [],
        planApplied: true,
        querySummary: "runbook source of truth",
        rerankApplied: false,
        rerankedCandidateIds: [],
        suppressedCandidateIds: [],
      },
      rerank: {
        orderedCandidateIds: ["ref-1", "fact-1", "archive-1", "episode-1"],
        rationale: "runbook should lead before blocker detail",
        suppressCandidateIds: ["archive-1"],
        decisions: [
          {
            candidateId: "ref-1",
            decision: "promote",
            reason: "source_of_truth",
          },
          {
            candidateId: "archive-1",
            decision: "suppress",
            reason: "query_alignment",
          },
        ],
      },
      selection,
    });

    expect(reranked.selection.references.map((item) => item.id)).toEqual(["ref-1"]);
    expect(reranked.selection.facts.map((item) => item.id)).toEqual(["fact-1"]);
    expect(reranked.selection.archives).toEqual([]);
    expect(reranked.influence.rerankApplied).toBe(true);
    expect(reranked.influence.suppressedCandidateIds).toEqual(["archive-1"]);
  });

  it("rejects assistant suppression of deterministic hard-floor candidates", () => {
    const fact = createFactMemory({
      id: "fact-1",
      userId: "u-1",
      content: "Current blocker is service account rotation.",
      category: "project",
      factKind: "blocker",
      source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
    });
    const reference = createReferenceMemory({
      id: "ref-1",
      userId: "u-1",
      title: "Migration runbook",
      pointer: "docs/migration-runbook.md",
      referenceKind: "source_of_truth",
      source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
    });
    const selection = {
      facts: [fact],
      references: [reference],
      archives: [],
      episodes: [],
    };

    const reranked = applyRecallAssistantRerank({
      influence: {
        addedRequestedSlots: [],
        addedSupportSlots: [],
        decisions: [],
        planApplied: true,
        rerankApplied: false,
        rerankedCandidateIds: [],
        suppressedCandidateIds: [],
      },
      rerank: {
        orderedCandidateIds: ["ref-1", "fact-1"],
        rationale: "drop blocker detail",
        suppressCandidateIds: ["fact-1"],
      },
      selection,
    });

    expect(reranked.selection.facts.map((item) => item.id)).toEqual(["fact-1"]);
    expect(reranked.selection.references.map((item) => item.id)).toEqual(["ref-1"]);
    expect(reranked.influence.fallbackReason).toBe("unsafe_suppress");
    expect(reranked.influence.rerankApplied).toBe(false);
  });

  it("falls back when rerank injects unknown candidate ids", () => {
    const fact = createFactMemory({
      id: "fact-1",
      userId: "u-1",
      content: "Current blocker is service account rotation.",
      category: "project",
      source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
    });

    const reranked = applyRecallAssistantRerank({
      influence: {
        addedRequestedSlots: [],
        addedSupportSlots: [],
        decisions: [],
        planApplied: true,
        rerankApplied: false,
        rerankedCandidateIds: [],
        suppressedCandidateIds: [],
      },
      rerank: {
        orderedCandidateIds: ["fact-1", "unknown-id"],
        rationale: "bad candidate injection",
      },
      selection: {
        facts: [fact],
        references: [],
        archives: [],
        episodes: [],
      },
    });

    expect(reranked.selection.facts.map((item) => item.id)).toEqual(["fact-1"]);
    expect(reranked.influence.fallbackReason).toBe("invalid_rerank_candidates");
  });
});
