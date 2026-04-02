import { describe, expect, it } from "bun:test";
import {
  computeDecayedPriority,
} from "../../src/maintenance/decay";

describe("maintenance decay model", () => {
  it("reduces priority for older memories", () => {
    const fresh = computeDecayedPriority({
      basePriority: 1,
      importance: 0.6,
      updatedAt: "2026-03-31T00:00:00.000Z",
      referenceTime: "2026-04-02T00:00:00.000Z",
      sourceMethod: "explicit",
    });
    const stale = computeDecayedPriority({
      basePriority: 1,
      importance: 0.6,
      updatedAt: "2025-10-01T00:00:00.000Z",
      referenceTime: "2026-04-02T00:00:00.000Z",
      sourceMethod: "explicit",
    });

    expect(stale).toBeLessThan(fresh);
  });

  it("makes high-importance memories more resilient to decay", () => {
    const lowImportance = computeDecayedPriority({
      basePriority: 1,
      importance: 0.2,
      updatedAt: "2025-12-01T00:00:00.000Z",
      referenceTime: "2026-04-02T00:00:00.000Z",
      sourceMethod: "explicit",
    });
    const highImportance = computeDecayedPriority({
      basePriority: 1,
      importance: 0.9,
      updatedAt: "2025-12-01T00:00:00.000Z",
      referenceTime: "2026-04-02T00:00:00.000Z",
      sourceMethod: "explicit",
    });

    expect(highImportance).toBeGreaterThan(lowImportance);
  });

  it("decays inferred memory faster than explicit memory", () => {
    const explicit = computeDecayedPriority({
      basePriority: 1,
      importance: 0.5,
      updatedAt: "2026-02-15T00:00:00.000Z",
      referenceTime: "2026-04-02T00:00:00.000Z",
      sourceMethod: "explicit",
    });
    const inferred = computeDecayedPriority({
      basePriority: 1,
      importance: 0.5,
      updatedAt: "2026-02-15T00:00:00.000Z",
      referenceTime: "2026-04-02T00:00:00.000Z",
      sourceMethod: "inferred",
    });

    expect(inferred).toBeLessThan(explicit);
  });
});
