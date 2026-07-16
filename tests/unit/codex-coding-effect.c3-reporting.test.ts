import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  buildC3FrozenPrehistoryPilotSummary,
  serializeC3FrozenPrehistoryPilotSummary,
} from "../../scripts/codex-coding-effect/c3-reporting";
import type { CodexCodingEffectAttemptRow } from "../../scripts/codex-coding-effect/attempts";
import {
  serializeCodexCodingEffectCases,
} from "../../scripts/codex-coding-effect/reporting";
import type { CodexCodingEffectCaseResult } from "../../scripts/codex-coding-effect/reporting";

describe("Codex coding-effect C3 reporting", () => {
  it.each([
    [false, true, "rescue"],
    [true, false, "regression"],
    [true, true, "tie-both-pass"],
    [false, false, "tie-both-fail"],
  ] as const)(
    "classifies no-memory=%s and GoodMemory=%s as %s",
    (noMemoryResolved, goodMemoryResolved, outcome) => {
      const cases = [
        caseResult("no-memory", noMemoryResolved),
        caseResult("goodmemory-installed", goodMemoryResolved),
      ];
      const summary = buildC3FrozenPrehistoryPilotSummary({
        attempts: cases.map(attemptForCase),
        cases,
        generatedAt: "2026-07-15T12:00:00.000Z",
        runId: "c3-pilot-001",
      });

      expect(summary).toMatchObject({
        attemptedCount: 2,
        comparablePairs: 1,
        evidenceClass: "frozen-prehistory-pilot",
        finalizedCount: 2,
        infrastructureFailureCount: 0,
        memoryDiagnosticsUsedForTaskScore: false,
        outcome,
        publicClaimEligible: false,
        resolvedCount: Number(noMemoryResolved) + Number(goodMemoryResolved),
        schemaVersion: 1,
        taskScoringSource: "deterministic-hidden-tests",
      });
    },
  );

  it("marks a pair incomparable unless both arms finalized", () => {
    const noMemory = caseResult("no-memory", false);
    const installed = caseResult(
      "goodmemory-installed",
      false,
      "infrastructure-failure",
    );
    const summary = buildC3FrozenPrehistoryPilotSummary({
      attempts: [attemptForCase(noMemory), attemptForCase(installed)],
      cases: [noMemory, installed],
      generatedAt: "2026-07-15T12:00:00.000Z",
      runId: "c3-pilot-incomparable",
    });

    expect(summary).toMatchObject({
      comparablePairs: 0,
      finalizedCount: 1,
      infrastructureFailureCount: 1,
      outcome: "incomparable",
      resolvedCount: 0,
    });
  });

  it("hashes the existing canonical C1 case serialization without reordering", () => {
    const cases = [
      caseResult("goodmemory-installed", true),
      caseResult("no-memory", false),
    ];
    const summary = buildC3FrozenPrehistoryPilotSummary({
      attempts: cases.map(attemptForCase),
      cases,
      generatedAt: "2026-07-15T12:00:00.000Z",
      runId: "c3-pilot-hash",
    });
    const expectedSha256 = createHash("sha256")
      .update(serializeCodexCodingEffectCases(cases))
      .digest("hex");

    expect(summary.sourceCasesSha256).toBe(expectedSha256);
    expect(serializeC3FrozenPrehistoryPilotSummary(summary)).toBe(
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    expect(() => serializeC3FrozenPrehistoryPilotSummary({
      ...summary,
      unexpected: true,
    } as typeof summary)).toThrow("invalid C3 frozen-prehistory summary");
  });

  it("rejects duplicate arms and attempt/case linkage drift", () => {
    const noMemory = caseResult("no-memory", false);
    const installed = caseResult("goodmemory-installed", true);
    expect(() => buildC3FrozenPrehistoryPilotSummary({
      attempts: [
        attemptForCase(noMemory),
        attemptForCase(installed),
        { ...attemptForCase(noMemory), attemptId: `${noMemory.attemptId}-2` },
      ],
      cases: [noMemory, installed, {
        ...noMemory,
        attemptId: `${noMemory.attemptId}-2`,
      }],
      generatedAt: "2026-07-15T12:00:00.000Z",
      runId: "c3-pilot-duplicate",
    })).toThrow("exactly one case per arm");

    expect(() => buildC3FrozenPrehistoryPilotSummary({
      attempts: [
        attemptForCase(noMemory),
        { ...attemptForCase(installed), result: {
          ...attemptForCase(installed).result,
          resolved: false,
        } },
      ],
      cases: [noMemory, installed],
      generatedAt: "2026-07-15T12:00:00.000Z",
      runId: "c3-pilot-linkage-drift",
    })).toThrow("attempt/case linkage");
  });
});

function caseResult(
  arm: "goodmemory-installed" | "no-memory",
  resolved: boolean,
  disposition: "finalized" | "infrastructure-failure" = "finalized",
): CodexCodingEffectCaseResult {
  const workKey = `episode-001/stage-2/${arm}/1/1`;
  return {
    arm,
    attemptId: `${workKey}#attempt-1`,
    changedFiles: ["src/result.ts"],
    codexStatus: "completed",
    disposition,
    episodeId: "episode-001",
    executionFailureStage: disposition === "infrastructure-failure"
      ? "goodmemory-injection"
      : null,
    failToPassStatus: resolved ? "passed" : "failed",
    forbiddenFiles: [],
    pairKey: "episode-001/stage-2/1/1",
    passToPassStatus: "passed",
    patchSha256: "a".repeat(64),
    repetition: 1,
    resolved,
    schemaVersion: 1,
    seed: 1,
    stageId: "stage-2",
    taskFailureReasons: disposition === "finalized" && !resolved
      ? ["hidden-fail-to-pass-failed"]
      : [],
    workKey,
  };
}

function attemptForCase(
  row: CodexCodingEffectCaseResult,
): CodexCodingEffectAttemptRow {
  return {
    attemptId: row.attemptId,
    disposition: row.disposition,
    result: {
      executionFailureStage: row.executionFailureStage,
      resolved: row.resolved,
      taskFailureReasons: row.taskFailureReasons,
    },
    schemaVersion: 1,
    workKey: row.workKey,
  };
}
