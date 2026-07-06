import { describe, expect, it } from "bun:test";
import {
  auditLocomoReanswerReadiness,
  runLocomoReanswerReadinessAudit,
} from "../../scripts/audit-phase-65-locomo-reanswer-readiness";
import type { LocomoSmokeReport } from "../../scripts/run-phase-65-locomo-smoke";

function sourceReport(
  overrides: Partial<LocomoSmokeReport> = {},
): LocomoSmokeReport {
  return {
    allowCommonsenseResolution: false,
    answerContextMode: "evidence-pack",
    answerEvaluation: "scored",
    benchmark: "locomo",
    benchmarkSource: "/tmp/LOCOMO/cases.json",
    bm25Ranking: false,
    caseCount: 1,
    caseIds: ["locomo-conv-test"],
    cases: [
      {
        answerCorrect: false,
        answerTokenF1: 0.2,
        caseId: "locomo-conv-test",
        category: "multi_hop",
        evidenceRecall: 1,
        evidenceTurnIds: ["D1:1"],
        generatedAnswer: "wrong",
        goldEvidenceFullyRetrieved: true,
        missingEvidenceTurnIds: [],
        noiseTurnCount: 1,
        noiseTurnIds: ["D1:2"],
        questionId: "conv-test:q1",
        retrievedTurnIds: ["D1:1", "D1:2"],
      },
    ],
    categories: [],
    executionFailures: 0,
    externalRoot: "/tmp/LOCOMO",
    generatedAt: "2026-07-03T00:00:00.000Z",
    generatedBy: "scripts/run-phase-65-locomo-smoke.ts",
    ingestMode: "raw-turns",
    license: "CC BY-NC 4.0",
    mode: "live-answer",
    phase: "phase-65",
    profilesCompared: ["goodmemory-rules-only"],
    questionCategories: ["multi_hop"],
    questionCount: 1,
    questionIds: ["conv-test:q1"],
    resume: false,
    runDirectory: "/reports/source",
    runId: "source-run",
    semanticCandidateEmbeddingSource: "provider",
    semanticCandidates: {
      enabled: true,
      maxAdditions: 4,
      minRelativeScore: null,
      minSimilarity: null,
      topK: 16,
    },
    strictNoEvidenceAbstention: false,
    upstreamAnswerMetricByCategory: {
      multi_hop: "f1_token_overlap",
    },
    upstreamSource: "https://github.com/snap-research/locomo",
    ...overrides,
  };
}

function manifest(input: {
  sourceReportPath?: string;
  sourceRunId?: string;
} = {}): unknown {
  return {
    benchmark: "locomo",
    reanswerJobs: [
      {
        bucket: "wrongFullRecallNoisy",
        category: "multi_hop",
        questionCount: 1,
        questionIds: ["conv-test:q1"],
        sourceReportPath: input.sourceReportPath,
        sourceRunId: input.sourceRunId,
      },
    ],
  };
}

function readFixture(fixtures: Record<string, unknown>) {
  return async (path: string): Promise<string> => {
    if (!(path in fixtures)) {
      throw new Error(`ENOENT ${path}`);
    }
    return JSON.stringify(fixtures[path]);
  };
}

describe("phase-65 LoCoMo reanswer readiness audit", () => {
  it("marks manifest jobs ready when their source report satisfies reanswer source guards", async () => {
    const audit = await auditLocomoReanswerReadiness(
      {
        manifestPath: "/reports/manifest.json",
        runId: "readiness-current",
      },
      {
        env: {
          GOODMEMORY_EMBEDDING_API_KEY: "test-key",
          GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
          GOODMEMORY_EMBEDDING_PROVIDER: "openai",
          GOODMEMORY_EVAL_API_KEY: "test-key",
          GOODMEMORY_EVAL_MODEL: "gpt-test",
          GOODMEMORY_EVAL_PROVIDER: "openai",
        },
        now: () => new Date("2026-07-06T00:00:00.000Z"),
        readFile: readFixture({
          "/reports/manifest.json": manifest({
            sourceReportPath: "/reports/source.json",
            sourceRunId: "source-run",
          }),
          "/reports/source.json": sourceReport(),
        }),
      },
    );

    expect(audit.summary).toEqual({
      blockedJobCount: 0,
      jobCount: 1,
      readyJobCount: 1,
      sourceReportCount: 1,
    });
    expect(audit.readyJobs[0]?.sourceReportPath).toBe("/reports/source.json");
    expect(audit.sourceReports[0]?.ready).toBe(true);
    expect(audit.replayPlan.commands).toHaveLength(1);
    expect(audit.replayPlan.commands[0]?.command).toContain(
      "bun run eval:phase-65-reanswer-report -- --source-report /reports/source.json",
    );
    expect(audit.replayPlan.commands[0]?.command).toContain(
      "--question-id conv-test:q1",
    );
    expect(audit.replayPlan.commands[0]?.command).not.toContain(
      "--question-id-file",
    );
    expect(audit.replayPlan.environment.ready).toBe(true);
    expect(audit.refreshPlan.environment.ready).toBe(true);
  });

  it("blocks jobs whose source report is stale, reanswer-generated, or missing", async () => {
    const audit = await auditLocomoReanswerReadiness(
      {
        manifestPath: "/reports/manifest.json",
        runId: "readiness-current",
      },
      {
        env: {},
        readFile: readFixture({
          "/reports/manifest.json": {
            benchmark: "locomo",
            reanswerJobs: [
              {
                bucket: "wrongFullRecallNoisy",
                category: "multi_hop",
                questionCount: 1,
                questionIds: ["conv-test:q1"],
                sourceReportPath: "/reports/stale.json",
                sourceRunId: "stale-run",
              },
              {
                bucket: "wrongFullRecallNoisy",
                category: "multi_hop",
                questionCount: 1,
                questionIds: ["conv-test:q2"],
                sourceReportPath: "/reports/reanswer.json",
                sourceRunId: "reanswer-run",
              },
              {
                bucket: "wrongFullRecallNoisy",
                category: "multi_hop",
                questionCount: 1,
                questionIds: ["conv-test:q3"],
                sourceReportPath: "/reports/missing.json",
                sourceRunId: "missing-run",
              },
              {
                bucket: "wrongFullRecallNoisy",
                category: "multi_hop",
                questionCount: 1,
                questionIds: ["conv-test:q4"],
              },
            ],
          },
          "/reports/stale.json": sourceReport({
            answerContextMode: undefined,
            runId: "stale-run",
            semanticCandidates: {
              enabled: true,
              maxAdditions: 4,
              topK: 16,
            } as LocomoSmokeReport["semanticCandidates"],
          }),
          "/reports/reanswer.json": sourceReport({
            generatedBy: "scripts/reanswer-phase-65-locomo-report.ts",
            runId: "reanswer-run",
          }),
        }),
      },
    );

    expect(audit.summary).toEqual({
      blockedJobCount: 4,
      jobCount: 4,
      readyJobCount: 0,
      sourceReportCount: 3,
    });
    expect(audit.blockedJobs[0]?.blockers).toContain(
      "source report is missing answerContextMode",
    );
    expect(audit.blockedJobs[1]?.blockers).toContain(
      "source report was generated by the reanswer runner",
    );
    expect(audit.blockedJobs[2]?.blockers[0]).toContain(
      "source report cannot be read or parsed",
    );
    expect(audit.blockedJobs[3]?.blockers).toContain(
      "reanswer job is missing sourceReportPath",
    );
    expect(audit.refreshPlan.sourceReports).toHaveLength(3);
    expect(audit.refreshPlan.sourceReports[0]?.command).toContain(
      "bun run eval:phase-65-smoke -- --benchmark-root /tmp/LOCOMO",
    );
    expect(audit.refreshPlan.sourceReports[0]?.command).toContain(
      "--live --evidence-pack",
    );
    expect(audit.refreshPlan.sourceReports[0]?.command).not.toContain(
      "undefined",
    );
    expect(audit.refreshPlan.manifest?.command).toContain(
      "bun run analyze:phase-65-locomo-answer-policy-slice --",
    );
    expect(audit.refreshPlan.manifest?.sourceReportPaths).toContain(
      "reports/eval/research/phase-65/locomo/stale-run-lineage-refresh-current/smoke-report.json",
    );
    expect(audit.refreshPlan.manifest?.sourceReportPaths).not.toContain(
      "reports/eval/research/phase-65/locomo/missing-run-lineage-refresh-current/smoke-report.json",
    );
    expect(audit.refreshPlan.environment).toMatchObject({
      ready: false,
      requiredGroups: ["live-answer", "provider-embedding"],
    });
    expect(audit.refreshPlan.environment.missingVars).toEqual([
      "GOODMEMORY_EVAL_PROVIDER",
      "GOODMEMORY_EVAL_MODEL",
      "GOODMEMORY_EVAL_API_KEY",
      "GOODMEMORY_EMBEDDING_PROVIDER",
      "GOODMEMORY_EMBEDDING_MODEL",
      "GOODMEMORY_EMBEDDING_API_KEY",
    ]);
    expect(audit.replayPlan.environment).toMatchObject({
      ready: false,
      requiredGroups: ["live-answer"],
    });
  });

  it("keeps ready replay commands scoped away from blocked same-category jobs", async () => {
    const audit = await auditLocomoReanswerReadiness(
      {
        manifestPath: "/reports/manifest.json",
        runId: "readiness-current",
      },
      {
        env: {
          GOODMEMORY_EVAL_API_KEY: "test-key",
          GOODMEMORY_EVAL_MODEL: "gpt-test",
          GOODMEMORY_EVAL_PROVIDER: "openai",
        },
        readFile: readFixture({
          "/reports/manifest.json": {
            benchmark: "locomo",
            reanswerJobs: [
              {
                bucket: "wrongFullRecallNoisy",
                category: "multi_hop",
                questionCount: 1,
                questionIds: ["conv-test:q1"],
                sourceReportPath: "/reports/source.json",
                sourceRunId: "source-run",
              },
              {
                bucket: "wrongFullRecallNoisy",
                category: "multi_hop",
                questionCount: 1,
                questionIds: ["conv-test:q2"],
                sourceReportPath: "/reports/source.json",
                sourceRunId: "other-source-run",
              },
            ],
          },
          "/reports/source.json": sourceReport({
            allowCommonsenseResolution: true,
            cases: [
              ...sourceReport().cases,
              {
                ...sourceReport().cases[0],
                questionId: "conv-test:q2",
              },
            ],
            questionCount: 2,
            questionIds: ["conv-test:q1", "conv-test:q2"],
            strictNoEvidenceAbstention: true,
          }),
        }),
      },
    );

    expect(audit.summary).toEqual({
      blockedJobCount: 1,
      jobCount: 2,
      readyJobCount: 1,
      sourceReportCount: 1,
    });
    expect(audit.replayPlan.commands).toHaveLength(1);
    expect(audit.replayPlan.commands[0]?.command).toContain(
      "--question-id conv-test:q1",
    );
    expect(audit.replayPlan.commands[0]?.command).toContain(
      "--allow-commonsense-resolution",
    );
    expect(audit.replayPlan.commands[0]?.command).toContain(
      "--strict-no-evidence-abstention",
    );
    expect(audit.replayPlan.commands[0]?.command).not.toContain("conv-test:q2");
    expect(audit.replayPlan.commands[0]?.manifestPath).toBe("/reports/manifest.json");
    expect(audit.replayPlan.environment.ready).toBe(true);
    expect(audit.refreshPlan.environment.ready).toBe(true);
    expect(audit.blockedJobs[0]?.blockers).toContain(
      "reanswer job sourceRunId other-source-run does not match source report runId source-run",
    );
  });

  it("rejects manifests for the wrong benchmark and malformed source provenance", async () => {
    await expect(
      auditLocomoReanswerReadiness(
        {
          manifestPath: "/reports/wrong-benchmark.json",
          runId: "readiness-current",
        },
        {
          env: {},
          readFile: readFixture({
            "/reports/wrong-benchmark.json": {
              benchmark: "beam",
              reanswerJobs: [],
            },
          }),
        },
      ),
    ).rejects.toThrow("manifest benchmark must be locomo");

    await expect(
      auditLocomoReanswerReadiness(
        {
          manifestPath: "/reports/bad-provenance.json",
          runId: "readiness-current",
        },
        {
          env: {},
          readFile: readFixture({
            "/reports/bad-provenance.json": {
              benchmark: "locomo",
              reanswerJobs: [
                {
                  bucket: "wrongFullRecallNoisy",
                  category: "multi_hop",
                  questionCount: 1,
                  questionIds: ["conv-test:q1"],
                  sourceReportPath: " /reports/source.json",
                  sourceRunId: "source-run",
                },
              ],
            },
          }),
        },
      ),
    ).rejects.toThrow(
      "reanswerJobs[0].sourceReportPath must not have leading or trailing whitespace",
    );
  });

  it("writes the audit artifact through the CLI wrapper", async () => {
    const writes: Record<string, string> = {};
    const result = await runLocomoReanswerReadinessAudit(
      [
        "bun",
        "script",
        "--manifest",
        "/reports/manifest.json",
        "--output-path",
        "/reports/out/readiness.json",
        "--run-id",
        "readiness-current",
      ],
      {
        env: {
          GOODMEMORY_EMBEDDING_API_KEY: "test-key",
          GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
          GOODMEMORY_EMBEDDING_PROVIDER: "openai",
          GOODMEMORY_EVAL_API_KEY: "test-key",
          GOODMEMORY_EVAL_MODEL: "gpt-test",
          GOODMEMORY_EVAL_PROVIDER: "openai",
        },
        mkdir: async () => undefined,
        now: () => new Date("2026-07-06T00:00:00.000Z"),
        readFile: readFixture({
          "/reports/manifest.json": manifest({
            sourceReportPath: "/reports/source.json",
            sourceRunId: "source-run",
          }),
          "/reports/source.json": sourceReport(),
        }),
        writeFile: async (path, data) => {
          writes[path] = data;
        },
      },
    );

    expect(result.outputPath).toBe("/reports/out/readiness.json");
    expect(JSON.parse(writes["/reports/out/readiness.json"] ?? "{}")).toMatchObject({
      runId: "readiness-current",
      summary: {
        blockedJobCount: 0,
        readyJobCount: 1,
      },
    });
  });
});
