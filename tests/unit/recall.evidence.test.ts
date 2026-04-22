import { describe, expect, it } from "bun:test";
import {
  createFeedbackMemory,
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
  collectSessionScopedEvidence,
  selectEvidence,
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
  it("prioritizes correction and verification evidence ahead of generic conversation excerpts", () => {
    const selected = selectEvidence([
      createEvidenceRecord({
        id: "conversation-newest",
        userId: "user-1",
        kind: "conversation_excerpt",
        excerpt: "The user mentioned a generic update.",
        source: {
          method: "explicit",
          extractedAt: "2026-01-10T03:00:00.000Z",
        },
      }),
      createEvidenceRecord({
        id: "tool-middle",
        userId: "user-1",
        kind: "tool_result_excerpt",
        excerpt: "QuickCheck timed out on the first action.",
        source: {
          method: "explicit",
          extractedAt: "2026-01-10T02:00:00.000Z",
        },
      }),
      createEvidenceRecord({
        id: "verification-older",
        userId: "user-1",
        kind: "verification_result",
        excerpt: "Verification showed the playbook branch was incorrect.",
        source: {
          method: "explicit",
          extractedAt: "2026-01-10T01:00:00.000Z",
        },
      }),
      createEvidenceRecord({
        id: "correction-oldest",
        userId: "user-1",
        kind: "correction_context",
        excerpt: "The user corrected the summary style and required bullets.",
        source: {
          method: "explicit",
          extractedAt: "2026-01-10T00:00:00.000Z",
        },
      }),
    ]);

    expect(selected.map((record) => record.id)).toEqual([
      "correction-oldest",
      "verification-older",
      "tool-middle",
    ]);
  });

  it("dedupes repeated evidence excerpts before applying the recall limit", () => {
    const selected = selectEvidence([
      createEvidenceRecord({
        id: "correction-1",
        userId: "user-1",
        kind: "correction_context",
        excerpt: "Use bullet points.",
        source: SOURCE,
      }),
      createEvidenceRecord({
        id: "correction-2",
        userId: "user-1",
        kind: "correction_context",
        excerpt: "Use bullet points.",
        source: {
          method: "explicit",
          extractedAt: "2026-01-11T00:00:00.000Z",
        },
      }),
      createEvidenceRecord({
        id: "verification-1",
        userId: "user-1",
        kind: "verification_result",
        excerpt: "Verification failed.",
        source: SOURCE,
      }),
    ]);

    expect(selected.map((record) => record.id)).toEqual([
      "correction-2",
      "verification-1",
    ]);
  });

  it("collects current-session evidence for coding-agent continuity before durable linkage exists", () => {
    const selected = collectSessionScopedEvidence(
      [
        createEvidenceRecord({
          id: "verification-current-session",
          userId: "user-1",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          kind: "verification_result",
          excerpt: "Verification failed in the active coding session.",
          source: SOURCE,
        }),
        createEvidenceRecord({
          id: "transition-current-session",
          userId: "user-1",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          kind: "conversation_excerpt",
          excerpt: "Task transition: archive the canonical Codex evidence chain next.",
          source: {
            method: "explicit",
            extractedAt: "2026-01-11T00:00:00.000Z",
          },
        }),
        createEvidenceRecord({
          id: "verification-other-session",
          userId: "user-1",
          workspaceId: "workspace-1",
          sessionId: "session-2",
          kind: "verification_result",
          excerpt: "Verification from a different session.",
          source: {
            method: "explicit",
            extractedAt: "2026-01-12T00:00:00.000Z",
          },
        }),
      ],
      {
        userId: "user-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
      },
    );

    expect(selected.map((record) => record.id)).toEqual([
      "verification-current-session",
      "transition-current-session",
    ]);
  });

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

  it("uses feedback lineage evidence when validated patterns no longer have direct record links", () => {
    const hits = buildHits({
      profile: null,
      preferences: [],
      references: [],
      facts: [],
      feedback: [
        createFeedbackMemory({
          id: "feedback-validated",
          userId: "user-1",
          kind: "validated_pattern",
          rule: "Use bullet points in summaries.",
          evidence: ["evidence-correction-1"],
          source: SOURCE,
          lifecycle: "active",
        }),
      ],
      archives: [],
      evidence: [],
      episodes: [],
      workingMemory: null,
      journal: null,
      evidenceIndex: buildEvidenceLinkIndex([]),
      routingDecision: {
        ...buildRoutingDecision(),
        sourcePriorities: ["feedback"],
      },
    });

    expect(hits).toEqual([
      {
        id: "feedback-validated",
        type: "feedback",
        reason: "scope_match",
        sourceMethod: "explicit",
        evidenceIds: ["evidence-correction-1"],
      },
    ]);
  });
});
