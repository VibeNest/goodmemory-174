import { describe, expect, it } from "bun:test";

import { mergeNarrowGateHitAudits } from "../../scripts/merge-narrow-gate-hit-audits";

describe("narrow-gate hit audit merge", () => {
  it("deduplicates split-qualified cases and classifies every registered gate", () => {
    const merged = mergeNarrowGateHitAudits({
      generatedAt: "2026-07-09T00:00:00.000Z",
      reports: [
        {
          runId: "run-100k",
          scale: "100K",
          verdicts: [
            { caseIds: ["q1"], gateId: "family.single" },
            { caseIds: [], gateId: "family.unobserved" },
          ],
        },
        {
          runId: "run-500k",
          scale: "500K",
          verdicts: [
            { caseIds: ["q2", "q2"], gateId: "family.single" },
            { caseIds: [], gateId: "family.unobserved" },
          ],
        },
      ],
    });

    expect(merged.summary).toEqual({
      caseFitted: 0,
      multiCase: 1,
      totalGates: 2,
      unobserved: 1,
    });
    expect(merged.verdicts).toEqual([
      {
        caseIds: ["100K:q1", "500K:q2"],
        gateId: "family.single",
        hitCount: 2,
        status: "multi_case",
      },
      {
        caseIds: [],
        gateId: "family.unobserved",
        hitCount: 0,
        status: "unobserved",
      },
    ]);
  });

  it("rejects split reports with duplicate or mismatched gate inventories", () => {
    expect(() =>
      mergeNarrowGateHitAudits({
        generatedAt: "2026-07-09T00:00:00.000Z",
        reports: [
          {
            runId: "run-100k",
            scale: "100K",
            verdicts: [
              { caseIds: [], gateId: "family.one" },
              { caseIds: [], gateId: "family.one" },
            ],
          },
        ],
      })
    ).toThrow("duplicate gate id");

    expect(() =>
      mergeNarrowGateHitAudits({
        generatedAt: "2026-07-09T00:00:00.000Z",
        reports: [
          {
            runId: "run-100k",
            scale: "100K",
            verdicts: [{ caseIds: [], gateId: "family.one" }],
          },
          {
            runId: "run-500k",
            scale: "500K",
            verdicts: [{ caseIds: [], gateId: "family.two" }],
          },
        ],
      })
    ).toThrow("same gate inventory");
  });
});
