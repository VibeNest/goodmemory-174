import { describe, expect, it } from "bun:test";
import type {
  FeedbackResult,
  RecallResult,
  RememberResult,
} from "../../src/api/contracts";
import {
  createEpisodeMemory,
  createFactMemory,
  createFeedbackMemory,
  createPreferenceMemory,
  createReferenceMemory,
} from "../../src/domain/records";
import { createEvidenceRecord } from "../../src/evidence/contracts";
import { createSessionArchive } from "../../src/evolution/contracts";
import {
  buildFeedbackExperienceRecord,
  buildRecallExperienceRecords,
  buildRememberExperienceRecord,
} from "../../src/evolution/observations";

const scope = {
  userId: "u-1",
  workspaceId: "workspace-a",
  sessionId: "s-1",
} as const;

describe("evolution observation normalization", () => {
  it("normalizes remember results into append-only experience telemetry", () => {
    const result: RememberResult = {
      accepted: 2,
      rejected: 1,
      events: [
        {
          candidateId: "candidate-1",
          outcome: "written",
          memoryType: "fact",
          memoryId: "fact-1",
          evidenceIds: ["evidence-1"],
        },
        {
          candidateId: "candidate-2",
          outcome: "rejected",
          memoryType: "episode",
          reason: "policy_blocked",
        },
      ],
      metadata: {
        locale: "en-US",
        localeSource: "explicit",
        adapterId: "language-rules",
        analysisMode: "rules-only",
        requestedExtractionStrategy: "auto",
        resolvedExtractionStrategy: "llm-assisted",
      },
    };

    const record = buildRememberExperienceRecord({
      scope,
      result,
      traceId: "trace-remember-1",
      createdAt: "2026-04-13T00:00:00.000Z",
      createId: () => "xp-remember-1",
    });

    expect(record.id).toBe("xp-remember-1");
    expect(record.kind).toBe("remember");
    expect(record.outcome).toBe("mixed");
    expect(record.modelInfluence).toBe("llm-assisted");
    expect(record.policyApplied).toEqual(["policy_blocked"]);
    expect(record.metrics).toEqual({
      accepted: 2,
      rejected: 1,
    });
    expect(record.linkedMemoryIds).toEqual(["fact-1"]);
    expect(record.linkedEvidenceIds).toEqual(["evidence-1"]);
  });

  it("normalizes recall and verify telemetry from a single recall result", () => {
    const result: RecallResult = {
      profile: null,
      preferences: [
        createPreferenceMemory({
          id: "pref-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          category: "response_style",
          value: "bullet points",
          source: { method: "explicit", extractedAt: "2026-04-13T00:00:00.000Z" },
        }),
      ],
      references: [
        createReferenceMemory({
          id: "ref-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          title: "Runbook",
          pointer: "docs/runbook.md",
          source: { method: "explicit", extractedAt: "2026-04-13T00:00:00.000Z" },
        }),
      ],
      facts: [
        createFactMemory({
          id: "fact-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          category: "project",
          content: "The rollout is blocked on verification.",
          source: { method: "explicit", extractedAt: "2026-04-13T00:00:00.000Z" },
        }),
      ],
      feedback: [
        createFeedbackMemory({
          id: "feedback-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          rule: "Use bullet points.",
          kind: "do",
          source: { method: "explicit", extractedAt: "2026-04-13T00:00:00.000Z" },
        }),
      ],
      archives: [
        createSessionArchive({
          id: "archive-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-9",
          summary: "The previous session ended with one verification blocker.",
        }),
      ],
      evidence: [
        createEvidenceRecord({
          id: "evidence-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-1",
          kind: "conversation_excerpt",
          excerpt: "Need verification before the rollout can resume.",
          source: { method: "explicit", extractedAt: "2026-04-13T00:00:00.000Z" },
        }),
      ],
      episodes: [
        createEpisodeMemory({
          id: "episode-1",
          userId: "u-1",
          workspaceId: "workspace-a",
          sessionId: "s-9",
          summary: "The team paused rollout pending verification.",
          keyDecisions: ["Pause rollout"],
          unresolvedItems: ["Verify the checklist"],
          topics: ["rollout"],
        }),
      ],
      workingMemory: null,
      journal: null,
      packet: {
        debug: {
          omittedSections: [],
          estimatedTokens: 64,
        },
      },
      metadata: {
        routingDecision: {
          retrievalProfile: "coding_agent",
          intent: "task_continuation",
          strategy: "hybrid",
          strategyExplanation: {
            requestedStrategy: "hybrid",
            resolvedStrategy: "hybrid",
            summary: "hybrid",
            hardFloor: "lexical_runtime_procedural_priors",
            semanticTieBreaking: true,
            llmRefinement: false,
          },
          sourcePriorities: ["feedback", "fact", "session_archive", "episode"],
          requestedSlots: ["blocker", "open_loop"],
          supportSlots: ["project_state_support"],
          actionDriving: true,
          referenceSeeking: false,
          continuation: true,
        },
        tokenCount: 64,
        latencyMs: 12,
        hits: [
          {
            id: "fact-1",
            type: "fact",
            evidenceIds: ["evidence-1"],
          },
          {
            id: "archive-1",
            type: "session_archive",
          },
        ],
        candidateTraces: [],
        verificationHints: [
          {
            memoryId: "fact-1",
            memoryType: "fact",
            reason: "stale fact should be verified before action",
            evidenceIds: ["evidence-1"],
          },
        ],
        policyApplied: ["default_scope_guard"],
        locale: "en-US",
        localeSource: "explicit",
        adapterId: "language-rules",
        analysisMode: "rules-only",
      },
    };

    const [recallRecord, verifyRecord] = buildRecallExperienceRecords({
      scope,
      result,
      traceId: "trace-recall-1",
      createdAt: "2026-04-13T00:00:00.000Z",
      createId: (() => {
        const ids = ["xp-recall-1", "xp-verify-1"];

        return () => ids.shift() ?? "xp-fallback";
      })(),
    });

    expect(recallRecord.kind).toBe("recall");
    expect(recallRecord.modelInfluence).toBe("rules-only");
    expect(recallRecord.metrics).toEqual({
      hitCount: 2,
      verificationHintCount: 1,
      latencyMs: 12,
      tokenCount: 64,
    });
    expect(recallRecord.linkedMemoryIds).toEqual([
      "pref-1",
      "ref-1",
      "fact-1",
      "feedback-1",
      "episode-1",
    ]);
    expect(recallRecord.linkedArchiveIds).toEqual(["archive-1"]);
    expect(recallRecord.linkedEvidenceIds).toEqual(["evidence-1"]);
    expect(verifyRecord?.kind).toBe("verify");
    expect(verifyRecord?.linkedMemoryIds).toEqual(["fact-1"]);
    expect(verifyRecord?.linkedEvidenceIds).toEqual(["evidence-1"]);
  });

  it("marks empty-hit recalls as failure instead of conflating them with skips", () => {
    const [recallRecord] = buildRecallExperienceRecords({
      scope,
      traceId: "trace-recall-empty",
      createdAt: "2026-04-13T00:00:00.000Z",
      createId: () => "xp-recall-empty",
      result: {
        profile: null,
        preferences: [],
        references: [],
        facts: [],
        feedback: [],
        archives: [],
        evidence: [],
        episodes: [],
        workingMemory: null,
        journal: null,
        packet: {
          debug: {
            omittedSections: [],
            estimatedTokens: 0,
          },
        },
        metadata: {
          routingDecision: {
            retrievalProfile: "coding_agent",
            intent: "task_continuation",
            strategy: "hybrid",
            strategyExplanation: {
              requestedStrategy: "hybrid",
              resolvedStrategy: "hybrid",
              summary: "hybrid",
              hardFloor: "lexical_runtime_procedural_priors",
              semanticTieBreaking: true,
              llmRefinement: false,
            },
            sourcePriorities: ["feedback", "fact", "session_archive", "episode"],
            requestedSlots: ["blocker"],
            supportSlots: [],
            actionDriving: true,
            referenceSeeking: false,
            continuation: true,
          },
          tokenCount: 0,
          latencyMs: 8,
          hits: [],
          candidateTraces: [],
          verificationHints: [],
          policyApplied: ["default_scope_guard"],
          locale: "en-US",
          localeSource: "explicit",
          adapterId: "language-rules",
          analysisMode: "rules-only",
        },
      },
    });

    expect(recallRecord.kind).toBe("recall");
    expect(recallRecord.outcome).toBe("failure");
    expect(recallRecord.metrics).toEqual({
      hitCount: 0,
      verificationHintCount: 0,
      latencyMs: 8,
      tokenCount: 0,
    });
  });

  it("keeps ignore-memory recalls as skipped", () => {
    const [recallRecord] = buildRecallExperienceRecords({
      scope,
      traceId: "trace-recall-skip",
      createdAt: "2026-04-13T00:00:00.000Z",
      createId: () => "xp-recall-skip",
      result: {
        profile: null,
        preferences: [],
        references: [],
        facts: [],
        feedback: [],
        archives: [],
        evidence: [],
        episodes: [],
        workingMemory: null,
        journal: null,
        packet: {
          debug: {
            omittedSections: [],
            estimatedTokens: 0,
          },
        },
        metadata: {
          routingDecision: {
            retrievalProfile: "coding_agent",
            intent: "task_continuation",
            strategy: "hybrid",
            strategyExplanation: {
              requestedStrategy: "hybrid",
              resolvedStrategy: "hybrid",
              summary: "hybrid",
              hardFloor: "lexical_runtime_procedural_priors",
              semanticTieBreaking: true,
              llmRefinement: false,
            },
            sourcePriorities: ["feedback", "fact", "session_archive", "episode"],
            requestedSlots: ["blocker"],
            supportSlots: [],
            actionDriving: true,
            referenceSeeking: false,
            continuation: true,
          },
          tokenCount: 0,
          latencyMs: 6,
          hits: [],
          candidateTraces: [],
          verificationHints: [],
          policyApplied: ["ignore_memory"],
          locale: "en-US",
          localeSource: "explicit",
          adapterId: "language-rules",
          analysisMode: "rules-only",
        },
      },
    });

    expect(recallRecord.kind).toBe("recall");
    expect(recallRecord.outcome).toBe("skipped");
  });

  it("normalizes feedback results into experience telemetry", () => {
    const result: FeedbackResult = {
      accepted: true,
      outcome: "written",
      memoryId: "feedback-1",
      kind: "do",
      metadata: {
        locale: "en-US",
        localeSource: "explicit",
        adapterId: "language-rules",
        analysisMode: "rules-only",
      },
    };

    const record = buildFeedbackExperienceRecord({
      scope,
      result,
      traceId: "trace-feedback-1",
      createdAt: "2026-04-13T00:00:00.000Z",
      createId: () => "xp-feedback-1",
    });

    expect(record.kind).toBe("feedback");
    expect(record.summary).toContain("Feedback written");
    expect(record.linkedMemoryIds).toEqual(["feedback-1"]);
    expect(record.metrics).toEqual({
      accepted: 1,
      rejected: 0,
    });
  });
});
