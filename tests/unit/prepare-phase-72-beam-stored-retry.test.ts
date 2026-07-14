import { describe, expect, it } from "bun:test";

import {
  buildPhase72BeamStoredRetryReport,
  selectPhase72BeamReusableJudgeRows,
} from "../../scripts/prepare-phase-72-beam-stored-retry";

const sourceCases = [
  {
    hypothesis: "The release cycle ends on April 14.",
    questionId: "conversation:information_extraction:1",
    questionType: "context_date/time",
  },
  {
    hypothesis: "The current limit is 12.",
    questionId: "conversation:knowledge_update:1",
    questionType: "knowledge_update",
  },
];

describe("Phase 72 BEAM stored-retrieval retry", () => {
  it("replaces only explicitly selected stored answers", () => {
    const report = buildPhase72BeamStoredRetryReport({
      generatedAt: "2026-07-12T00:00:00.000Z",
      replacements: new Map([
        [
          "conversation:information_extraction:1",
          "The release cycle ends on April 12.",
        ],
      ]),
      runId: "beam-retry",
      sourceCases,
      sourceReportPath: "/repo/source-report.json",
    });

    expect(report.cases).toEqual([
      {
        hypothesis: "The release cycle ends on April 12.",
        questionId: "conversation:information_extraction:1",
        questionType: "context_date/time",
      },
      sourceCases[1],
    ]);
    expect(report.retryMerge.replacements).toEqual([
      {
        questionId: "conversation:information_extraction:1",
        retryHypothesis: "The release cycle ends on April 12.",
        sourceHypothesis: "The release cycle ends on April 14.",
      },
    ]);
  });

  it("rejects missing targets and no-op replacements", () => {
    expect(() =>
      buildPhase72BeamStoredRetryReport({
        generatedAt: "2026-07-12T00:00:00.000Z",
        replacements: new Map([["missing", "replacement"]]),
        runId: "beam-retry",
        sourceCases,
        sourceReportPath: "/repo/source-report.json",
      }),
    ).toThrow("missing");
    expect(() =>
      buildPhase72BeamStoredRetryReport({
        generatedAt: "2026-07-12T00:00:00.000Z",
        replacements: new Map([
          [
            "conversation:information_extraction:1",
            "The release cycle ends on April 14.",
          ],
        ]),
        runId: "beam-retry",
        sourceCases,
        sourceReportPath: "/repo/source-report.json",
      }),
    ).toThrow("did not change");
  });

  it("reuses only complete, unchanged non-target rubric rows", () => {
    const retryCases = [
      {
        ...sourceCases[0],
        hypothesis: "The release cycle ends on April 12.",
      },
      sourceCases[1],
    ];
    const rows = selectPhase72BeamReusableJudgeRows({
      retryCases,
      rubrics: {
        "conversation:information_extraction:1": ["April 12"],
        "conversation:knowledge_update:1": ["12", "current"],
      },
      sourceCases,
      sourceRows: [
        {
          key: "conversation:information_extraction:1#0",
          questionId: "conversation:information_extraction:1",
          score: 0,
        },
        {
          key: "conversation:knowledge_update:1#0",
          questionId: "conversation:knowledge_update:1",
          score: 1,
        },
        {
          key: "conversation:knowledge_update:1#1",
          questionId: "conversation:knowledge_update:1",
          score: 1,
        },
      ],
      targetQuestionIds: new Set([
        "conversation:information_extraction:1",
      ]),
    });

    expect(rows.map((row) => row.key)).toEqual([
      "conversation:knowledge_update:1#0",
      "conversation:knowledge_update:1#1",
    ]);
  });

  it("rejects non-target answer drift and incomplete source judge progress", () => {
    expect(() =>
      selectPhase72BeamReusableJudgeRows({
        retryCases: [
          { ...sourceCases[0], hypothesis: "April 12" },
          { ...sourceCases[1], hypothesis: "The current limit is 13." },
        ],
        rubrics: {
          "conversation:information_extraction:1": ["April 12"],
          "conversation:knowledge_update:1": ["12"],
        },
        sourceCases,
        sourceRows: [
          {
            key: "conversation:information_extraction:1#0",
            questionId: "conversation:information_extraction:1",
            score: 0,
          },
          {
            key: "conversation:knowledge_update:1#0",
            questionId: "conversation:knowledge_update:1",
            score: 1,
          },
        ],
        targetQuestionIds: new Set([
          "conversation:information_extraction:1",
        ]),
      }),
    ).toThrow("non-target answer changed");

    expect(() =>
      selectPhase72BeamReusableJudgeRows({
        retryCases: [
          { ...sourceCases[0], hypothesis: "April 12" },
          sourceCases[1],
        ],
        rubrics: {
          "conversation:information_extraction:1": ["April 12"],
          "conversation:knowledge_update:1": ["12"],
        },
        sourceCases,
        sourceRows: [
          {
            key: "conversation:information_extraction:1#0",
            questionId: "conversation:information_extraction:1",
            score: 0,
          },
        ],
        targetQuestionIds: new Set([
          "conversation:information_extraction:1",
        ]),
      }),
    ).toThrow("does not exactly cover");
  });
});
