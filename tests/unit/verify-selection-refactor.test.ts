import { describe, expect, it } from "bun:test";
import type { BeamReport } from "../../src/eval/beam";
import {
  comparePhase63RecallReports,
  parseSelectionRefactorVerifyCliOptions,
} from "../../scripts/verify-selection-refactor";

function buildReport(
  cases: Array<{ questionId: string; retrievedChatIds: number[] }>,
): BeamReport {
  return {
    profiles: {
      "goodmemory-rules-only": {
        cases,
      },
    },
  } as unknown as BeamReport;
}

describe("verify-selection-refactor comparison", () => {
  it("passes when reports are identical including retrieval order", () => {
    const baseline = buildReport([
      { questionId: "1:a:1", retrievedChatIds: [4, 2, 8] },
      { questionId: "1:a:2", retrievedChatIds: [] },
    ]);
    const candidate = buildReport([
      { questionId: "1:a:1", retrievedChatIds: [4, 2, 8] },
      { questionId: "1:a:2", retrievedChatIds: [] },
    ]);

    const comparison = comparePhase63RecallReports({ baseline, candidate });

    expect(comparison.caseCount).toBe(2);
    expect(comparison.mismatches).toEqual([]);
  });

  it("flags reordered retrieved chat ids even when the sets match", () => {
    const baseline = buildReport([
      { questionId: "1:a:1", retrievedChatIds: [4, 2, 8] },
    ]);
    const candidate = buildReport([
      { questionId: "1:a:1", retrievedChatIds: [2, 4, 8] },
    ]);

    const comparison = comparePhase63RecallReports({ baseline, candidate });

    expect(comparison.mismatches).toHaveLength(1);
    expect(comparison.mismatches[0]?.kind).toBe("retrieved_chat_ids");
    expect(comparison.mismatches[0]?.questionId).toBe("1:a:1");
  });

  it("flags changed, missing, and miscounted cases", () => {
    const baseline = buildReport([
      { questionId: "1:a:1", retrievedChatIds: [4] },
      { questionId: "1:a:2", retrievedChatIds: [6] },
    ]);
    const candidate = buildReport([
      { questionId: "1:a:1", retrievedChatIds: [4, 10] },
    ]);

    const comparison = comparePhase63RecallReports({ baseline, candidate });

    const kinds = comparison.mismatches.map((entry) => entry.kind).sort();
    expect(kinds).toEqual(["case_count", "missing_case", "retrieved_chat_ids"]);
  });

  it("flags a missing profile", () => {
    const baseline = buildReport([
      { questionId: "1:a:1", retrievedChatIds: [4] },
    ]);
    const candidate = {
      profiles: {},
    } as unknown as BeamReport;

    const comparison = comparePhase63RecallReports({ baseline, candidate });

    expect(comparison.mismatches).toHaveLength(1);
    expect(comparison.mismatches[0]?.kind).toBe("profile_missing");
  });

  it("parses cli options", () => {
    const options = parseSelectionRefactorVerifyCliOptions([
      "bun",
      "script",
      "--capture-baseline",
      "--baseline-run-id",
      "base-x",
      "--candidate-run-id",
      "cand-y",
      "--skip-run",
    ]);

    expect(options).toEqual({
      baselineRunId: "base-x",
      benchmarkRoot: undefined,
      candidateRunId: "cand-y",
      captureBaseline: true,
      skipRun: true,
    });
  });
});
