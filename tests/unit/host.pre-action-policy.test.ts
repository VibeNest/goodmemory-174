import { describe, expect, it } from "bun:test";
import type { ExportMemoryResult } from "../../src";
import {
  createFeedbackMemory,
  createMemorySource,
  createSessionJournal,
  createWorkingMemorySnapshot,
} from "../../src";
import { createEvidenceRecord } from "../../src/evidence/contracts";
import { attachBehavioralPolicyAttributes } from "../../src/evolution/behavioralPolicy";
import {
  createHostAdapter,
  isHostActionIntent,
  validateHostActionIntent,
} from "../../src/host";

function createExportResult(
  input: Partial<ExportMemoryResult["durable"]> & {
    journal?: NonNullable<ExportMemoryResult["runtime"]>["journal"];
    workingMemory?: NonNullable<ExportMemoryResult["runtime"]>["workingMemory"];
  } = {},
): ExportMemoryResult {
  return {
    artifacts: {
      rootPath: ".goodmemory/users/u-1/workspaces/ws-1/sessions/s-1",
      files: [
        {
          kind: "memory",
          relativePath: "MEMORY.md",
          content: "# MEMORY",
        },
      ],
    },
    scope: {
      userId: "u-1",
      workspaceId: "ws-1",
      sessionId: "s-1",
    },
    exportedAt: "2026-04-22T00:00:00.000Z",
    durable: {
      profile: null,
      preferences: [],
      references: [],
      facts: [],
      feedback: [],
      episodes: [],
      archives: [],
      evidence: [],
      experiences: [],
      proposals: [],
      promotions: [],
      ...input,
    },
    runtime: {
      workingMemory: input.workingMemory ?? null,
      journal: input.journal ?? null,
      spills: [],
    },
  };
}

describe("host pre-action policy", () => {
  it("validates host action intents with structured tool payloads", () => {
    const intent = validateHostActionIntent({
      actionId: "action-1",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      action: {
        kind: "tool_call",
        toolName: "QuickCheck",
        payload: {
          checks: ["network"],
          dryRun: true,
        },
      },
    });

    expect(intent.action.kind).toBe("tool_call");
    if (intent.action.kind !== "tool_call") {
      throw new Error("expected tool_call action");
    }
    expect(intent.action.payload).toEqual({
      checks: ["network"],
      dryRun: true,
    });
    expect(isHostActionIntent(intent)).toBe(true);
    expect(isHostActionIntent({ actionId: "missing-action" })).toBe(false);
  });

  it("rejects file-edit intents whose paths are not normalized relative paths", () => {
    for (const relativePath of [
      "./playbooks/checklist.md",
      "playbooks/./checklist.md",
    ]) {
      expect(() =>
        validateHostActionIntent({
          actionId: "action-file-1",
          runId: "run-1",
          turnId: "turn-1",
          sequence: 0,
          occurredAt: "2026-04-22T00:00:00.000Z",
          hostKind: "codex",
          scope: {
            userId: "u-1",
            workspaceId: "ws-1",
            sessionId: "s-1",
          },
          action: {
            kind: "file_edit",
            operation: "update",
            relativePath,
          },
        })
      ).toThrow(
        "actionIntent.action.relativePath must be a normalized relative path without traversal or absolute segments",
      );
    }
  });

  it("rewrites high-risk deploy actions to review_required when matched memory demands a precondition", async () => {
    const source = createMemorySource({
      method: "explicit",
      extractedAt: "2026-04-22T00:00:00.000Z",
      sessionId: "s-1",
    });
    const adapter = createHostAdapter({
      id: "codex-review",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult({
            feedback: [
              createFeedbackMemory({
                id: "feedback-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "validated_pattern",
                appliesTo: "coding_agent",
                rule: "Before deploy, run smoke verification.",
                evidence: ["evidence-1"],
                source,
              }),
            ],
            evidence: [
              createEvidenceRecord({
                id: "evidence-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "verification_result",
                excerpt: "Production deploy was blocked because smoke verification was skipped.",
                source,
                sourceMessageIds: ["verify-1"],
              }),
            ],
          });
        },
      },
    });

    const result = await adapter.assessAction({
      actionId: "action-deploy-1",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      action: {
        kind: "command",
        command: "deploy production",
      },
    });

    expect(result.decision).toBe("review_required");
    expect(result.auditRecorded).toBe(false);
    expect(result.matchedMemoryIds).toEqual(["feedback-1"]);
    expect(result.matchedEvidenceIds).toContain("evidence-1");
    expect(result.requiredPreconditions).toEqual(["run smoke verification"]);
    expect(result.recommendedFirstStep).toEqual({
      kind: "warning",
      message: "run smoke verification",
    });
  });

  it("rewrites to an executable QuickCheck path when the original command resolves a sibling executable", async () => {
    const source = createMemorySource({
      method: "explicit",
      extractedAt: "2026-04-22T00:00:00.000Z",
      sessionId: "s-1",
    });
    const adapter = createHostAdapter({
      id: "codex-deepanalyzer",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult({
            feedback: [
              createFeedbackMemory({
                id: "feedback-deepanalyzer-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "validated_pattern",
                appliesTo: "coding_agent",
                rule: "Rather than DeepAnalyzer, use QuickCheck first.",
                evidence: ["evidence-deepanalyzer-1"],
                source,
              }),
            ],
            evidence: [
              createEvidenceRecord({
                id: "evidence-deepanalyzer-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "correction_context",
                excerpt: "DeepAnalyzer detailed scan failed because QuickCheck had not run first.",
                source,
                sourceMessageIds: ["deepanalyzer-1"],
              }),
            ],
          });
        },
      },
    });

    const result = await adapter.assessAction({
      actionId: "action-deepanalyzer-1",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      action: {
        kind: "command",
        command: "./tools/DeepAnalyzer --detailed",
      },
    });

    expect(result.decision).toBe("review_required");
    expect(result.requiredPreconditions).toEqual(["run QuickCheck first"]);
    expect(result.recommendedFirstStep).toEqual({
      kind: "tool_call",
      toolName: "QuickCheck",
      raw: "./tools/QuickCheck",
      summary: "Run QuickCheck before the original action.",
    });
  });

  it("fails closed to a warning when QuickCheck is only referenced by bare command name", async () => {
    const source = createMemorySource({
      method: "explicit",
      extractedAt: "2026-04-22T00:00:00.000Z",
      sessionId: "s-1",
    });
    const adapter = createHostAdapter({
      id: "codex-deepanalyzer-bare",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult({
            feedback: [
              createFeedbackMemory({
                id: "feedback-deepanalyzer-bare-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "validated_pattern",
                appliesTo: "coding_agent",
                rule: "Rather than DeepAnalyzer, use QuickCheck first.",
                evidence: ["evidence-deepanalyzer-bare-1"],
                source,
              }),
            ],
            evidence: [
              createEvidenceRecord({
                id: "evidence-deepanalyzer-bare-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "correction_context",
                excerpt: "DeepAnalyzer detailed scan failed because QuickCheck had not run first.",
                source,
                sourceMessageIds: ["deepanalyzer-bare-1"],
              }),
            ],
          });
        },
      },
    });

    const result = await adapter.assessAction({
      actionId: "action-deepanalyzer-bare-1",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-22T00:00:00.000Z",
      hostKind: "codex",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      action: {
        kind: "command",
        command: "DeepAnalyzer --detailed",
      },
    });

    expect(result.decision).toBe("review_required");
    expect(result.requiredPreconditions).toEqual(["run QuickCheck first"]);
    expect(result.recommendedFirstStep).toEqual({
      kind: "warning",
      message: "run QuickCheck first",
    });
  });

  it("prioritizes typed first-action policy over generic host guidance and preserves exact first action", async () => {
    const source = createMemorySource({
      method: "confirmed",
      extractedAt: "2026-04-30T00:00:00.000Z",
      sessionId: "s-1",
    });
    const adapter = createHostAdapter({
      id: "codex-typed-first-action",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult({
            feedback: [
              createFeedbackMemory({
                id: "feedback-typed-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "validated_pattern",
                appliesTo: "coding_agent",
                rule:
                  "If the prompt mentions detailed analysis, use QuickCheck --network before DeepAnalyzer.",
                attributes: attachBehavioralPolicyAttributes(undefined, {
                  behavioralKind: "first_action",
                  enactmentSurface: "host_action",
                  applicability: {
                    actionSummaryContains: ["detailed analysis"],
                    appliesTo: "coding_agent",
                    canonicalFirstAction: {
                      kind: "tool_call",
                      name: "QuickCheck",
                      raw: "QuickCheck --network",
                    },
                    queryContains: ["detailed analysis"],
                  },
                  transferMode: "pattern_bounded",
                }),
                evidence: ["evidence-typed-1"],
                source,
              }),
            ],
            evidence: [
              createEvidenceRecord({
                id: "evidence-typed-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "correction_context",
                excerpt:
                  "Detailed analysis should start with QuickCheck --network before any deeper inspection.",
                source,
                sourceMessageIds: ["typed-1"],
              }),
            ],
          });
        },
      },
    });

    const result = await adapter.assessAction({
      actionId: "action-typed-1",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-30T00:00:00.000Z",
      hostKind: "codex",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      action: {
        kind: "tool_call",
        toolName: "DeepAnalyzer",
        raw: "DeepAnalyzer --detailed",
        summary: "Run detailed analysis on the network path.",
      },
    });

    expect(result.decision).toBe("review_required");
    expect(result.matchedMemoryIds).toContain("feedback-typed-1");
    expect(result.recommendedFirstStep).toEqual({
      kind: "tool_call",
      raw: "QuickCheck --network",
      summary: "Use the canonical first action from validated behavioral policy.",
      toolName: "QuickCheck",
    });
  });

  it("does not block a typed canonical first action when the host action only adds dynamic instance args", async () => {
    const source = createMemorySource({
      method: "confirmed",
      extractedAt: "2026-04-30T00:00:00.000Z",
      sessionId: "s-1",
    });
    const adapter = createHostAdapter({
      id: "codex-typed-first-action-satisfied",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult({
            feedback: [
              createFeedbackMemory({
                id: "feedback-typed-satisfied-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "validated_pattern",
                appliesTo: "coding_agent",
                rule:
                  "If the prompt mentions detailed analysis, use QuickCheck --network before DeepAnalyzer.",
                attributes: attachBehavioralPolicyAttributes(undefined, {
                  behavioralKind: "first_action",
                  enactmentSurface: "host_action",
                  applicability: {
                    actionSummaryContains: ["detailed analysis"],
                    appliesTo: "coding_agent",
                    canonicalFirstAction: {
                      args: ["--network"],
                      kind: "tool_call",
                      name: "QuickCheck",
                      raw: "QuickCheck --network",
                    },
                    queryContains: ["detailed analysis"],
                  },
                  transferMode: "pattern_bounded",
                }),
                evidence: ["evidence-typed-satisfied-1"],
                source,
              }),
            ],
            evidence: [
              createEvidenceRecord({
                id: "evidence-typed-satisfied-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "correction_context",
                excerpt:
                  "Detailed analysis should start with QuickCheck --network before any deeper inspection.",
                source,
                sourceMessageIds: ["typed-satisfied-1"],
              }),
            ],
          });
        },
      },
    });

    const result = await adapter.assessAction({
      actionId: "action-typed-satisfied-1",
      runId: "run-1",
      turnId: "turn-1",
      sequence: 0,
      occurredAt: "2026-04-30T00:00:00.000Z",
      hostKind: "codex",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      action: {
        kind: "tool_call",
        toolName: "QuickCheck",
        raw: "QuickCheck --network /tmp/worktree-a",
        summary: "Run detailed analysis on the network path.",
      },
    });

    expect(result.decision).toBe("allow_with_guidance");
    expect(result.matchedMemoryIds).toContain("feedback-typed-satisfied-1");
    expect(result.recommendedFirstStep).toBeUndefined();
  });

  it("blocks destructive file deletes when a matched validated pattern vetoes the action", async () => {
    const source = createMemorySource({
      method: "explicit",
      extractedAt: "2026-04-22T00:00:00.000Z",
      sessionId: "s-1",
    });
    const adapter = createHostAdapter({
      id: "codex-block",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult({
            feedback: [
              createFeedbackMemory({
                id: "feedback-delete-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "validated_pattern",
                appliesTo: "coding_agent",
                rule: "Never delete AGENTS.md from the host bootstrap surface.",
                why: "It breaks repo-local host wiring and package bootstrap continuity.",
                evidence: ["evidence-delete-1"],
                source,
              }),
            ],
            evidence: [
              createEvidenceRecord({
                id: "evidence-delete-1",
                userId: "u-1",
                workspaceId: "ws-1",
                sessionId: "s-1",
                kind: "correction_context",
                excerpt: "Deleting AGENTS.md removed the Codex bootstrap instructions.",
                source,
                sourceMessageIds: ["correction-1"],
              }),
            ],
          });
        },
      },
    });

    const result = await adapter.assessAction({
      actionId: "action-delete-1",
      attemptId: "attempt-1",
      turnId: "turn-2",
      sequence: 1,
      occurredAt: "2026-04-22T00:00:01.000Z",
      hostKind: "codex",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      action: {
        kind: "file_edit",
        operation: "delete",
        relativePath: "AGENTS.md",
      },
    });

    expect(result.decision).toBe("blocked");
    expect(result.matchedMemoryIds).toEqual(["feedback-delete-1"]);
    expect(result.recommendedFirstStep).toBeUndefined();
  });

  it("keeps runtime continuity guidance non-blocking when no memory-backed veto is matched", async () => {
    const adapter = createHostAdapter({
      id: "codex-guidance",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult({
            workingMemory: createWorkingMemorySnapshot({
              sessionId: "s-1",
              userId: "u-1",
              currentGoal: "Close the external host rollout",
              openLoops: ["archive the canonical Codex evidence chain"],
              temporaryDecisions: ["Use the current runbook before deploy."],
              updatedAt: "2026-04-22T00:00:00.000Z",
            }),
            journal: createSessionJournal({
              sessionId: "s-1",
              userId: "u-1",
              workflow: ["Review the exported session handoff"],
              updatedAt: "2026-04-22T00:00:00.000Z",
            }),
          });
        },
      },
    });

    const result = await adapter.assessAction({
      actionId: "action-guidance-1",
      runId: "run-1",
      turnId: "turn-3",
      sequence: 2,
      occurredAt: "2026-04-22T00:00:02.000Z",
      hostKind: "codex",
      scope: {
        userId: "u-1",
        workspaceId: "ws-1",
        sessionId: "s-1",
      },
      action: {
        kind: "command",
        command: "deploy preview",
      },
    });

    expect(result.decision).toBe("allow_with_guidance");
    expect(result.matchedMemoryIds).toEqual([]);
    expect(result.guidance).toContain("Use the current runbook before deploy.");
    expect(result.guidance.some((line) => line.includes("Review the exported session handoff"))).toBe(
      true,
    );
  });

  it("rejects assessments whose declared host kind does not match the adapter host kind", async () => {
    const adapter = createHostAdapter({
      id: "codex-review",
      hostKind: "codex",
      memory: {
        async exportMemory() {
          return createExportResult();
        },
      },
    });

    await expect(
      adapter.assessAction({
        actionId: "action-mismatch-1",
        runId: "run-1",
        turnId: "turn-1",
        sequence: 0,
        occurredAt: "2026-04-22T00:00:00.000Z",
        hostKind: "claude",
        scope: {
          userId: "u-1",
          workspaceId: "ws-1",
          sessionId: "s-1",
        },
        action: {
          kind: "command",
          command: "deploy production",
        },
      })
    ).rejects.toThrow(
      "host action intent hostKind claude does not match adapter hostKind codex",
    );
  });
});
