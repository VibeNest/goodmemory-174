import { describe, expect, it } from "bun:test";
import { resolveHostActionExecutionPlan } from "../../src/host/actionExecution";

describe("host action execution planning", () => {
  it("executes the original action immediately when assessment allows it", () => {
    const plan = resolveHostActionExecutionPlan({
      intent: {
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
          kind: "command",
          command: "npm test",
        },
      },
      assessment: {
        actionId: "action-1",
        auditRecorded: false,
        decision: "allow",
        guidance: [],
        matchedEvidenceIds: [],
        matchedMemoryIds: [],
        policyApplied: ["host_pre_action_policy"],
        reason: "No matched memory-backed pre-action policy applied to this action.",
        requiredPreconditions: [],
      },
    });

    expect(plan.executeOriginalActionNow).toBe(true);
    expect(plan.effectiveFirstStep).toEqual({
      kind: "command",
      command: "npm test",
    });
    expect(plan.intercepted).toBe(false);
    expect(plan.rewritten).toBe(false);
    expect(plan.realizedEventParentId).toBe("action-1");
  });

  it("rewrites the first step when review is required", () => {
    const plan = resolveHostActionExecutionPlan({
      intent: {
        actionId: "action-2",
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
      },
      assessment: {
        actionId: "action-2",
        auditRecorded: false,
        decision: "review_required",
        guidance: ["Before deploy, run smoke verification."],
        matchedEvidenceIds: ["evidence-1"],
        matchedMemoryIds: ["feedback-1"],
        policyApplied: ["host_pre_action_policy"],
        reason: "Matched memory-backed policy requires preconditions before command deploy production.",
        recommendedFirstStep: {
          kind: "warning",
          message: "run smoke verification",
        },
        requiredPreconditions: ["run smoke verification"],
      },
    });

    expect(plan.executeOriginalActionNow).toBe(false);
    expect(plan.blocked).toBe(false);
    expect(plan.intercepted).toBe(true);
    expect(plan.rewritten).toBe(true);
    expect(plan.effectiveFirstStep).toEqual({
      kind: "warning",
      message: "run smoke verification",
    });
    expect(plan.realizedEventParentId).toBe("action-2");
  });

  it("blocks destructive actions without an immediate replacement step", () => {
    const plan = resolveHostActionExecutionPlan({
      intent: {
        actionId: "action-3",
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
          operation: "delete",
          relativePath: "AGENTS.md",
        },
      },
      assessment: {
        actionId: "action-3",
        auditRecorded: false,
        decision: "blocked",
        guidance: ["Never delete AGENTS.md from the host bootstrap surface."],
        matchedEvidenceIds: ["evidence-2"],
        matchedMemoryIds: ["feedback-2"],
        policyApplied: ["host_pre_action_policy"],
        reason: "Matched memory-backed veto blocks this destructive action before execution.",
        requiredPreconditions: [],
      },
    });

    expect(plan.executeOriginalActionNow).toBe(false);
    expect(plan.blocked).toBe(true);
    expect(plan.intercepted).toBe(true);
    expect(plan.rewritten).toBe(false);
    expect(plan.effectiveFirstStep).toBeUndefined();
    expect(plan.realizedEventParentId).toBe("action-3");
  });

  it("fails closed when a review_required assessment omits the rewritten first step", () => {
    expect(() =>
      resolveHostActionExecutionPlan({
        intent: {
          actionId: "action-4",
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
        },
        assessment: {
          actionId: "action-4",
          auditRecorded: false,
          decision: "review_required",
          guidance: [],
          matchedEvidenceIds: [],
          matchedMemoryIds: [],
          policyApplied: ["host_pre_action_policy"],
          reason: "missing recommended step",
          requiredPreconditions: [],
        },
      })
    ).toThrow(
      "review_required host action assessments must provide a recommendedFirstStep",
    );
  });
});
