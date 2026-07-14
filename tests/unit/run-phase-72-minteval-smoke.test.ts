import { describe, expect, it } from "bun:test";

import {
  buildMINTEvalContextMessage,
  parsePhase72MINTEvalOptions,
  selectMINTEvalSmokeRow,
} from "../../scripts/run-phase-72-minteval-smoke";

describe("Phase 72 MINTEval smoke runner", () => {
  it("parses only smoke paths and a pinned dataset revision", () => {
    expect(parsePhase72MINTEvalOptions([
      "bun",
      "run-phase-72-minteval-smoke.ts",
      "--dataset-file",
      "/bench/state_tracking_first.json",
      "--upstream-root",
      "/bench/MINTEval",
      "--output-dir",
      "/reports/minteval",
      "--run-id",
      "run-test",
    ])).toMatchObject({
      datasetFile: "/bench/state_tracking_first.json",
      outputDir: "/reports/minteval",
      runId: "run-test",
      upstreamRoot: "/bench/MINTEval",
    });
  });

  it("selects one question without exposing its answer to the adapter", () => {
    const selected = selectMINTEvalSmokeRow({
      contexts: [
        { content: "The office is green.", timestamp: "t1" },
        { content: "The office is blue.", timestamp: "t2" },
      ],
      id: "row-1",
      metadata: {},
      questions: [{ answer: "blue", question: "What color is the office?" }],
    });

    expect(selected).toEqual({
      contexts: [
        { content: "The office is green.", timestamp: "t1" },
        { content: "The office is blue.", timestamp: "t2" },
      ],
      id: "row-1",
      question: "What color is the office?",
      questionCount: 1,
    });
    expect(selected).not.toHaveProperty("answer");
  });

  it("preserves context timestamps for temporal recall", () => {
    expect(buildMINTEvalContextMessage({
      content: "The office is blue.",
      timestamp: "2026-01-02",
    })).toBe("[2026-01-02]\nThe office is blue.");
  });
});
