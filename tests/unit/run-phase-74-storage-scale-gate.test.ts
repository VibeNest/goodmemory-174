import { describe, expect, it } from "bun:test";

import { runPhase74StorageScaleGate } from "../../scripts/run-phase-74-storage-scale-gate";

describe("phase 74 storage scale gate", () => {
  it("uses bounded claim and entity projection search without full-collection deserialization", async () => {
    const report = await runPhase74StorageScaleGate({
      measuredQueryCount: 8,
      syntheticDocumentCount: 1_000,
      warmupQueryCount: 2,
    });

    expect(report.passed).toBe(true);
    expect(report.gate).toBe("claim-entity-projection-query");
    expect(report.syntheticDocumentCount).toBe(1_000);
    expect(report.audit.projectionCounts).toEqual({
      claims: 500,
      entities: 500,
      statuses: 500,
    });
    expect(report.latencyMs.p95).toBeLessThanOrEqual(500);
    expect(report.audit.methodCalls.query).toBe(0);
    expect(report.audit.methodCalls.queryPage).toBe(0);
    expect(report.audit.methodCalls.searchText).toBe(20);
    expect(report.audit.methodCalls.get).toBeGreaterThan(0);
    expect(report.audit.methodCalls.get).toBeLessThanOrEqual(
      10 * report.selectedLimit,
    );
    expect(report.audit.usesFtsVirtualTableIndex).toBe(true);
    expect(report.audit.nonMatchingInvalidJsonSentinelDidNotBreakSearch).toBe(true);
    expect(report.audit.maxMaterializedDocumentsPerQuery).toBeLessThanOrEqual(
      report.selectedLimit,
    );
  });
});
