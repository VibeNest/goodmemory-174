import { describe, expect, it } from "bun:test";
import {
  createPreferenceMemory,
  createReferenceMemory,
  createUserProfile,
} from "../../src/domain/records";
import { createEvidenceRecord } from "../../src/evidence/contracts";
import { createSessionArchive } from "../../src/evolution/contracts";
import {
  attachEvidenceIdsToCandidateTraces,
  buildEvidenceLinkIndex,
  buildHits,
} from "../../src/recall/evidence";
import type { RoutingDecision } from "../../src/recall/router";

const TIMESTAMP = "2026-01-10T00:00:00.000Z";
const SOURCE = {
  method: "explicit" as const,
  extractedAt: TIMESTAMP,
};

function buildRoutingDecision(): RoutingDecision {
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
    sourcePriorities: ["profile", "session_archive", "evidence"],
    requestedSlots: [],
    supportSlots: [],
    actionDriving: false,
    referenceSeeking: false,
    continuation: true,
  };
}

describe("recall evidence helpers", () => {
  it("attaches linked evidence ids to memory and archive traces", () => {
    const evidenceIndex = buildEvidenceLinkIndex([
      createEvidenceRecord({
        id: "evidence-ref-1",
        userId: "user-1",
        kind: "document_excerpt",
        excerpt: "runbook excerpt",
        source: SOURCE,
        linkedMemoryIds: ["ref-1"],
      }),
      createEvidenceRecord({
        id: "evidence-archive-1",
        userId: "user-1",
        kind: "conversation_excerpt",
        excerpt: "archive excerpt",
        source: SOURCE,
        linkedArchiveIds: ["archive-1"],
      }),
    ]);

    const traces = attachEvidenceIdsToCandidateTraces([
      {
        memoryId: "ref-1",
        memoryType: "reference",
        slot: "reference",
        returned: true,
        intentScore: 1,
        lexicalScore: 0.8,
        freshnessScore: 0.25,
        explicitnessScore: 0.15,
        fallback: "none",
      },
      {
        memoryId: "archive-1",
        memoryType: "archive",
        slot: "generic",
        returned: true,
        intentScore: 0.7,
        lexicalScore: 0.3,
        freshnessScore: 0.25,
        explicitnessScore: 0,
        fallback: "none",
      },
    ], evidenceIndex);

    expect(traces.find((trace) => trace.memoryId === "ref-1")?.evidenceIds).toEqual([
      "evidence-ref-1",
    ]);
    expect(traces.find((trace) => trace.memoryId === "archive-1")?.evidenceIds).toEqual([
      "evidence-archive-1",
    ]);
  });

  it("includes linked evidence ids in generated hits", () => {
    const evidenceIndex = buildEvidenceLinkIndex([
      createEvidenceRecord({
        id: "evidence-ref-1",
        userId: "user-1",
        kind: "document_excerpt",
        excerpt: "runbook excerpt",
        source: SOURCE,
        linkedMemoryIds: ["ref-1"],
      }),
      createEvidenceRecord({
        id: "evidence-archive-1",
        userId: "user-1",
        kind: "conversation_excerpt",
        excerpt: "archive excerpt",
        source: SOURCE,
        linkedArchiveIds: ["archive-1"],
      }),
    ]);

    const hits = buildHits({
      profile: createUserProfile({
        userId: "user-1",
        identity: { role: "Staff Engineer" },
      }),
      preferences: [
        createPreferenceMemory({
          id: "pref-1",
          userId: "user-1",
          category: "tone",
          value: "concise",
          source: SOURCE,
        }),
      ],
      references: [
        createReferenceMemory({
          id: "ref-1",
          userId: "user-1",
          title: "Runtime Runbook",
          pointer: "docs/runtime-runbook.md",
          source: SOURCE,
        }),
      ],
      facts: [],
      feedback: [],
      archives: [
        createSessionArchive({
          id: "archive-1",
          userId: "user-1",
          sessionId: "s-1",
          summary: "Runtime refactor",
          archivedAt: TIMESTAMP,
        }),
      ],
      evidence: [],
      episodes: [],
      workingMemory: null,
      journal: null,
      evidenceIndex,
      routingDecision: buildRoutingDecision(),
    });

    expect(hits.find((hit) => hit.id === "ref-1")?.evidenceIds).toEqual([
      "evidence-ref-1",
    ]);
    expect(hits.find((hit) => hit.id === "archive-1")?.evidenceIds).toEqual([
      "evidence-archive-1",
    ]);
  });
});
