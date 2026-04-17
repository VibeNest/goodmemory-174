import { describe, expect, it } from "bun:test";
import {
  createDreamMaintenanceGate,
  createDreamMaintenanceOrchestrator,
  shouldRunDreamMaintenance,
} from "../../src/maintenance/dream";
import type { LearningProposal } from "../../src/evolution/contracts";
import type { MaintenanceRunReport } from "../../src/maintenance/runner";

describe("dream maintenance gating", () => {
  it("requires both session-count threshold and cooldown to pass", () => {
    expect(
      shouldRunDreamMaintenance({
        sessionCountSinceLastRun: 2,
        minSessionCount: 3,
        lastRunAt: "2026-04-01T00:00:00.000Z",
        now: "2026-04-02T00:00:00.000Z",
        minHoursBetweenRuns: 12,
      }),
    ).toBe(false);

    expect(
      shouldRunDreamMaintenance({
        sessionCountSinceLastRun: 4,
        minSessionCount: 3,
        lastRunAt: "2026-04-01T20:00:00.000Z",
        now: "2026-04-02T00:00:00.000Z",
        minHoursBetweenRuns: 12,
      }),
    ).toBe(false);

    expect(
      shouldRunDreamMaintenance({
        sessionCountSinceLastRun: 4,
        minSessionCount: 3,
        lastRunAt: "2026-04-01T00:00:00.000Z",
        now: "2026-04-02T00:00:00.000Z",
        minHoursBetweenRuns: 12,
      }),
    ).toBe(true);
  });

  it("does not treat a future last-run timestamp as eligible cooldown debt", () => {
    expect(
      shouldRunDreamMaintenance({
        sessionCountSinceLastRun: 4,
        minSessionCount: 3,
        lastRunAt: "2026-04-02T12:00:00.000Z",
        now: "2026-04-02T00:00:00.000Z",
        minHoursBetweenRuns: 12,
      }),
    ).toBe(false);
  });

  it("prevents overlapping dream runs for the same scope until released", () => {
    const gate = createDreamMaintenanceGate();
    const scopeKey = "u-1::workspace-a";

    expect(gate.tryAcquire(scopeKey)).toBe(true);
    expect(gate.tryAcquire(scopeKey)).toBe(false);
    gate.release(scopeKey);
    expect(gate.tryAcquire(scopeKey)).toBe(true);
  });

  it("orchestrates maintenance, proposal gating, and compiler passes under one governed run", async () => {
    const calls: string[] = [];
    const maintenance: MaintenanceRunReport = {
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      ranAt: "2026-04-17T00:00:00.000Z",
      jobs: [
        { name: "dedupe", applied: 1 },
        { name: "contradiction", applied: 1 },
      ],
    };
    const proposals: LearningProposal[] = [
      {
        id: "proposal-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        proposalType: "maintenance_action",
        status: "pending",
        traceId: "trace-1",
        summary: "Re-check stale blocker memory.",
        rationale: "Verification pressure suggests bounded follow-up.",
        sourceExperienceIds: ["xp-1"],
        linkedMemoryIds: ["fact-1"],
        linkedArchiveIds: [],
        linkedEvidenceIds: ["evidence-1"],
        modelInfluence: "rules-only",
        createdAt: "2026-04-17T00:00:00.000Z",
        updatedAt: "2026-04-17T00:00:00.000Z",
      },
      {
        id: "proposal-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        proposalType: "procedural_pattern",
        status: "pending",
        traceId: "trace-2",
        summary: "Promote stable bullet-list guidance.",
        rationale: "Repeated feedback suggests a reusable pattern.",
        sourceExperienceIds: ["xp-2", "xp-3"],
        linkedMemoryIds: ["feedback-1"],
        linkedArchiveIds: [],
        linkedEvidenceIds: [],
        modelInfluence: "rules-only",
        createdAt: "2026-04-17T00:00:00.000Z",
        updatedAt: "2026-04-17T00:00:00.000Z",
      },
    ];
    const orchestrator = createDreamMaintenanceOrchestrator({
      maintenanceRunner: {
        async run() {
          calls.push("maintenance");
          return maintenance;
        },
      },
      reviewer: {
        async review() {
          calls.push("review");
          return proposals;
        },
      },
      proposalGate: {
        async process() {
          calls.push("gate");
          return [
            { decision: "accepted" as const },
            { decision: "delayed" as const },
          ];
        },
      },
      compiler: {
        async compile() {
          calls.push("compile");
          return { compiledCount: 1 };
        },
      },
    });

    const result = await orchestrator.run({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      scopeKey: "u-1::workspace-a",
      sessionCountSinceLastRun: 4,
      minSessionCount: 3,
      lastRunAt: "2026-04-16T00:00:00.000Z",
      now: "2026-04-17T00:00:00.000Z",
      minHoursBetweenRuns: 12,
      maintenanceJobs: ["dedupe", "contradiction"],
    });

    expect(result.ran).toBe(true);
    expect(result.reason).toBe("completed");
    expect(result.maintenance).toEqual(maintenance);
    expect(result.proposalCount).toBe(2);
    expect(result.promotionDecisionCounts).toEqual({
      accepted: 1,
      delayed: 1,
    });
    expect(result.compiledCount).toBe(1);
    expect(calls).toEqual(["maintenance", "review", "gate", "compile"]);
  });

  it("skips dream runs cleanly when the scope is already busy", async () => {
    const gate = createDreamMaintenanceGate();
    const scopeKey = "u-1::workspace-a";
    gate.tryAcquire(scopeKey);

    const orchestrator = createDreamMaintenanceOrchestrator({
      gate,
      maintenanceRunner: {
        async run() {
          throw new Error("should not run");
        },
      },
      reviewer: {
        async review() {
          throw new Error("should not run");
        },
      },
      proposalGate: {
        async process() {
          throw new Error("should not run");
        },
      },
      compiler: {
        async compile() {
          throw new Error("should not run");
        },
      },
    });

    const result = await orchestrator.run({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      scopeKey,
      sessionCountSinceLastRun: 4,
      minSessionCount: 3,
      lastRunAt: "2026-04-16T00:00:00.000Z",
      now: "2026-04-17T00:00:00.000Z",
      minHoursBetweenRuns: 12,
    });

    expect(result.ran).toBe(false);
    expect(result.reason).toBe("scope_busy");
    expect(result.maintenance).toBeNull();
    expect(result.proposalCount).toBe(0);
    expect(result.compiledCount).toBe(0);
  });

  it("shares overlap protection when separately created orchestrators reuse the same gate", async () => {
    const scope = { userId: "u-1", workspaceId: "workspace-a" } as const;
    const scopeKey = "u-1::workspace-a";
    const maintenance: MaintenanceRunReport = {
      scope,
      ranAt: "2026-04-17T00:00:00.000Z",
      jobs: [{ name: "dedupe", applied: 0 }],
    };
    const gate = createDreamMaintenanceGate();
    let unblockFirstRun: (() => void) | undefined;
    let firstRunEntered: (() => void) | undefined;
    const firstRunBlocked = new Promise<void>((resolve) => {
      unblockFirstRun = resolve;
    });
    const firstRunStarted = new Promise<void>((resolve) => {
      firstRunEntered = resolve;
    });

    const first = createDreamMaintenanceOrchestrator({
      gate,
      maintenanceRunner: {
        async run() {
          firstRunEntered?.();
          await firstRunBlocked;
          return maintenance;
        },
      },
      reviewer: {
        async review() {
          return [];
        },
      },
      proposalGate: {
        async process() {
          return [];
        },
      },
      compiler: {
        async compile() {
          return { compiledCount: 0 };
        },
      },
    });
    const second = createDreamMaintenanceOrchestrator({
      gate,
      maintenanceRunner: {
        async run() {
          throw new Error("orchestrators that reuse one gate should observe the shared scope lock");
        },
      },
      reviewer: {
        async review() {
          throw new Error("orchestrators that reuse one gate should observe the shared scope lock");
        },
      },
      proposalGate: {
        async process() {
          throw new Error("orchestrators that reuse one gate should observe the shared scope lock");
        },
      },
      compiler: {
        async compile() {
          throw new Error("orchestrators that reuse one gate should observe the shared scope lock");
        },
      },
    });

    const firstRun = first.run({
      scope,
      scopeKey,
      sessionCountSinceLastRun: 4,
      minSessionCount: 3,
      lastRunAt: "2026-04-16T00:00:00.000Z",
      now: "2026-04-17T00:00:00.000Z",
      minHoursBetweenRuns: 12,
    });
    await firstRunStarted;

    const secondResult = await second.run({
      scope,
      scopeKey,
      sessionCountSinceLastRun: 4,
      minSessionCount: 3,
      lastRunAt: "2026-04-16T00:00:00.000Z",
      now: "2026-04-17T00:00:00.000Z",
      minHoursBetweenRuns: 12,
    });

    expect(secondResult.ran).toBe(false);
    expect(secondResult.reason).toBe("scope_busy");

    unblockFirstRun?.();
    const firstResult = await firstRun;
    expect(firstResult.ran).toBe(true);
    expect(firstResult.reason).toBe("completed");
  });
});
