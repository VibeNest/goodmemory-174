import { describe, expect, it } from "bun:test";
import {
  createDreamMaintenanceGate,
  shouldRunDreamMaintenance,
} from "../../src/maintenance/dream";

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

  it("prevents overlapping dream runs for the same scope until released", () => {
    const gate = createDreamMaintenanceGate();
    const scopeKey = "u-1::workspace-a";

    expect(gate.tryAcquire(scopeKey)).toBe(true);
    expect(gate.tryAcquire(scopeKey)).toBe(false);
    gate.release(scopeKey);
    expect(gate.tryAcquire(scopeKey)).toBe(true);
  });
});
