import { describe, expect, it } from "bun:test";
import type { ExportMemoryResult } from "../../src";
import {
  createFeedbackMemory,
  createMemorySource,
  createSessionJournal,
  createWorkingMemorySnapshot,
} from "../../src";
import { createEvidenceRecord } from "../../src/evidence/contracts";
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
