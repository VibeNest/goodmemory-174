import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempWorkspace } from "../../src/testing/utils";
import {
  mergeScenarioIds,
  parseCliOptionsFromArgv,
  resolveDefaultOutputDir,
  resolveEvalMaxConcurrency,
  resolveFailedScenarioIds,
  resolveFlagValue,
  resolveLiveModelConfig,
  resolveRepeatedFlagValues,
  runFallbackEval,
  runLiveEval,
  runSmokeEval,
} from "../../scripts/run-eval";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("run-eval script", () => {
  it("requires an explicit mode in argv", () => {
    const argv = [
      "bun",
      "scripts/run-eval.ts",
      "--limit=3",
      "--scenario-id=scenario-medium-01",
      "--scenario-id",
      "scenario-medium-02",
      "--output-dir",
      "custom-output",
      "--failures-from=reports/eval/fallback/run-001",
      "--mode=fallback",
    ];

    expect(resolveFlagValue(argv, "--limit")).toBe("3");
    expect(resolveRepeatedFlagValues(argv, "--scenario-id")).toEqual([
      "scenario-medium-01",
      "scenario-medium-02",
    ]);
    expect(parseCliOptionsFromArgv(argv)).toEqual({
      mode: "fallback",
      limit: 3,
      scenarioIds: ["scenario-medium-01", "scenario-medium-02"],
      outputDir: "custom-output",
      failuresFrom: "reports/eval/fallback/run-001",
    });

    expect(() => parseCliOptionsFromArgv(["bun", "scripts/run-eval.ts"])).toThrow(
      "Missing or invalid required flag --mode=smoke|fallback|live",
    );
  });

  it("collects repeated positional scenario-id flags without dropping later values", () => {
    const argv = [
      "bun",
      "scripts/run-eval.ts",
      "--mode=fallback",
      "--scenario-id",
      "scenario-a",
      "--scenario-id",
      "scenario-b",
      "--scenario-id=scenario-c",
    ];

    expect(resolveRepeatedFlagValues(argv, "--scenario-id")).toEqual([
      "scenario-a",
      "scenario-b",
      "scenario-c",
    ]);
    expect(parseCliOptionsFromArgv(argv).scenarioIds).toEqual([
      "scenario-a",
      "scenario-b",
      "scenario-c",
    ]);
  });

  it("resolves mode-specific default output directories", () => {
    expect(resolveDefaultOutputDir("/tmp/goodmemory", "fallback")).toBe(
      "/tmp/goodmemory/reports/eval/fallback",
    );
    expect(resolveDefaultOutputDir("/tmp/goodmemory", "live")).toBe(
      "/tmp/goodmemory/reports/eval/live",
    );
  });

  it("parses live eval max concurrency from environment", () => {
    process.env.GOODMEMORY_EVAL_MAX_CONCURRENCY = "6";
    expect(resolveEvalMaxConcurrency()).toBe(6);

    process.env.GOODMEMORY_EVAL_MAX_CONCURRENCY = "0";
    expect(() => resolveEvalMaxConcurrency()).toThrow(
      "GOODMEMORY_EVAL_MAX_CONCURRENCY must be a positive integer",
    );
  });

  it("merges explicit and failed scenario ids deterministically", () => {
    expect(mergeScenarioIds(undefined, [])).toBeUndefined();
    expect(
      mergeScenarioIds(["scenario-medium-01"], [
        "scenario-medium-02",
        "scenario-medium-01",
      ]),
    ).toEqual(["scenario-medium-01", "scenario-medium-02"]);
  });

  it("resolves failed scenario ids from summary artifacts and enforces mode", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-summary");

    try {
      const runDirectory = join(workspace.root, "reports/eval/fallback/run-001");
      const failuresDir = join(runDirectory, "failures");
      await mkdir(failuresDir, { recursive: true });
      await writeFile(
        join(runDirectory, "report.json"),
        JSON.stringify({
          mode: "fallback",
          runId: "run-001",
        }),
        "utf8",
      );
      await writeFile(
        join(failuresDir, "summary.json"),
        JSON.stringify({
          failedCases: [
            { caseId: "scenario-medium-01" },
            { caseId: "scenario-long-01" },
          ],
        }),
        "utf8",
      );

      expect(await resolveFailedScenarioIds(runDirectory, "fallback")).toEqual([
        "scenario-medium-01",
        "scenario-long-01",
      ]);
      await expect(resolveFailedScenarioIds(runDirectory, "live")).rejects.toThrow(
        "Eval rerun mode mismatch",
      );
    } finally {
      await workspace.cleanup();
    }
  });

  it("falls back to failure filenames when summary is missing", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-fallback");

    try {
      const runDirectory = join(workspace.root, "reports/eval/fallback/run-002");
      const failuresDir = join(runDirectory, "failures");
      await mkdir(failuresDir, { recursive: true });
      await writeFile(
        join(runDirectory, "report.json"),
        JSON.stringify({
          mode: "fallback",
          runId: "run-002",
        }),
        "utf8",
      );
      await writeFile(join(failuresDir, "scenario-medium-02.json"), "{}", "utf8");
      await writeFile(
        join(failuresDir, "scenario-long-03.execution.json"),
        "{}",
        "utf8",
      );
      await writeFile(join(failuresDir, "scenario-medium-01.json"), "{}", "utf8");

      expect(await resolveFailedScenarioIds(runDirectory, "fallback")).toEqual([
        "scenario-long-03",
        "scenario-medium-01",
        "scenario-medium-02",
      ]);
    } finally {
      await workspace.cleanup();
    }
  });

  it("reports smoke mode explicitly", async () => {
    const report = await runSmokeEval();

    expect(report.mode).toBe("smoke");
    expect(report.summary.totalCases).toBe(1);
  });

  it("builds fallback generators, judge, and runtime metadata without reading live env", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-suite");
    const calls: Array<Record<string, unknown>> = [];
    process.env.GOODMEMORY_EVAL_PROVIDER = "openai";

    try {
      const result = await runFallbackEval(
        {
          limit: 2,
          outputDir: join(workspace.root, "reports"),
        },
        {
          runSuite: async (input) => {
            const baseline = await input.baselineGenerator({
              persona: {} as never,
              scenario: {} as never,
              prompt: "prompt",
              transcript: "transcript",
            });
            const goodmemory = await input.goodmemoryGenerator({
              persona: {} as never,
              scenario: {} as never,
              prompt: "prompt",
              transcript: "transcript",
              memoryContext: "docs/runbook-v2.md",
            });
            const judge = await input.judge.complete({
              purpose: "eval_judge",
              prompt: [
                "evaluation setting: single_domain",
                "expected identity signals: robotics engineer",
                "expected history signals: docs/runbook-v2.md",
                "expected transfer signals: concise bullet points",
                "expected non-transfer signals: spoiler-heavy framing",
                "expected update wins: docs/runbook-v2.md",
                "expected stale suppression: docs/runbook-v1.md",
                "wrong personalization signals: spoiler-heavy framing",
                "baseline: I need more context before I can answer reliably.",
                "goodmemory: Confirmed from memory:\n\nconcise bullet points\n\ndocs/runbook-v2.md",
              ].join("\n"),
            });
            calls.push({
              outputDir: input.outputDir,
              limit: input.limit,
              mode: input.mode,
              runtime: input.runtime,
              baseline: baseline.content,
              goodmemory: goodmemory.content,
              judge: judge.content,
            });

            return {
              mode: input.mode,
              runId: "run-fallback",
              runDirectory: join(workspace.root, "reports/run-fallback"),
              summary: {
                totalCases: 0,
                winnerCounts: {
                  baseline: 0,
                  goodmemory: 0,
                  tie: 0,
                },
                baselineAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                goodmemoryAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                uplift: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                layers: {
                  baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                },
                assertions: {
                  totalCases: 0,
                  passingCases: 0,
                  passRate: 0,
                  totalChecks: 0,
                  passingChecks: 0,
                  checkPassRate: 0,
                  contaminationFailures: 0,
                  updateFailures: 0,
                },
              },
              runtime: input.runtime!,
              cases: [],
            };
          },
        },
      );

      expect(result.mode).toBe("fallback");
      expect(result.runtime.generationMode).toBe("fallback");
      expect(result.runtime.judgeMode).toBe("fallback");
      expect(calls[0]?.mode).toBe("fallback");
      expect(calls[0]?.baseline).toBe("I need more context before I can answer reliably.");
      expect(calls[0]?.goodmemory).toContain("Confirmed from memory:");
      expect(calls[0]?.goodmemory).toContain("docs/runbook-v2.md");
      expect(String(calls[0]?.judge)).toContain("\"winner\":\"goodmemory\"");
      expect(String(calls[0]?.judge)).toContain("\"failure_tags\":[]");
    } finally {
      await workspace.cleanup();
    }
  });

  it("fallback judge prefixes GoodMemory defects consistently", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-fallback-tags");
    const calls: Array<Record<string, unknown>> = [];

    try {
      await runFallbackEval(
        {
          limit: 1,
          outputDir: join(workspace.root, "reports"),
        },
        {
          runSuite: async (input) => {
            const judge = await input.judge.complete({
              purpose: "eval_judge",
              prompt: [
                "evaluation setting: single_domain",
                "expected identity signals: robotics engineer",
                "expected history signals: docs/runbook-v2.md",
                "expected transfer signals: concise bullet points",
                "expected non-transfer signals: spoiler-heavy framing",
                "expected update wins: docs/runbook-v2.md",
                "expected stale suppression: docs/runbook-v1.md",
                "wrong personalization signals: spoiler-heavy framing",
                "baseline: I need more context before I can answer reliably.",
                "goodmemory: Use docs/runbook-v1.md now.",
              ].join("\n"),
            });
            calls.push({
              judge: judge.content,
            });

            return {
              mode: input.mode,
              runId: "run-fallback-tags",
              runDirectory: join(workspace.root, "reports/run-fallback-tags"),
              summary: {
                totalCases: 0,
                winnerCounts: {
                  baseline: 0,
                  goodmemory: 0,
                  tie: 0,
                },
                baselineAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                goodmemoryAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                uplift: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                layers: {
                  baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                },
                assertions: {
                  totalCases: 0,
                  passingCases: 0,
                  passRate: 0,
                  totalChecks: 0,
                  passingChecks: 0,
                  checkPassRate: 0,
                  contaminationFailures: 0,
                  updateFailures: 0,
                },
              },
              runtime: input.runtime!,
              cases: [],
            };
          },
        },
      );

      expect(String(calls[0]?.judge)).toContain("goodmemory_stale_memory_leak");
      expect(String(calls[0]?.judge)).not.toContain("\"stale_memory_leak\"");
    } finally {
      await workspace.cleanup();
    }
  });

  it("fallback judge does not count negated required signals as matches", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-fallback-negated");
    const calls: Array<Record<string, unknown>> = [];

    try {
      await runFallbackEval(
        {
          limit: 1,
          outputDir: join(workspace.root, "reports"),
        },
        {
          runSuite: async (input) => {
            const judge = await input.judge.complete({
              purpose: "eval_judge",
              prompt: [
                "evaluation setting: single_domain",
                "expected identity signals: robotics engineer",
                "expected history signals: docs/runbook-v2.md",
                "expected transfer signals: concise bullet points",
                "expected non-transfer signals: spoiler-heavy framing",
                "expected update wins: docs/runbook-v2.md | vendor approval",
                "expected stale suppression: docs/runbook-v1.md",
                "wrong personalization signals: spoiler-heavy framing",
                "baseline: I need more context before I can answer reliably.",
                "goodmemory: I will not use concise bullet points. Do not use docs/runbook-v2.md. Vendor approval is still the blocker.",
              ].join("\n"),
            });
            calls.push({
              judge: JSON.parse(String(judge.content)),
            });

            return {
              mode: input.mode,
              runId: "run-fallback-negated",
              runDirectory: join(workspace.root, "reports/run-fallback-negated"),
              summary: {
                totalCases: 0,
                winnerCounts: {
                  baseline: 0,
                  goodmemory: 0,
                  tie: 0,
                },
                baselineAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                goodmemoryAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                uplift: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                layers: {
                  baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                },
                assertions: {
                  totalCases: 0,
                  passingCases: 0,
                  passRate: 0,
                  totalChecks: 0,
                  passingChecks: 0,
                  checkPassRate: 0,
                  contaminationFailures: 0,
                  updateFailures: 0,
                },
              },
              runtime: input.runtime!,
              cases: [],
            };
          },
        },
      );

      expect(calls[0]?.judge).toMatchObject({
        winner: "baseline",
      });
      expect(calls[0]?.judge).toMatchObject({
        failure_tags: expect.arrayContaining([
          "goodmemory_missed_preference_signal",
          "goodmemory_missed_update_signal",
        ]),
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("fallback judge lowers single-domain transfer score for contradictory preference signals", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-fallback-contradiction");
    const calls: Array<Record<string, unknown>> = [];

    try {
      await runFallbackEval(
        {
          limit: 1,
          outputDir: join(workspace.root, "reports"),
        },
        {
          runSuite: async (input) => {
            const judge = await input.judge.complete({
              purpose: "eval_judge",
              prompt: [
                "evaluation setting: single_domain",
                "expected identity signals: robotics engineer",
                "expected history signals: docs/runbook-v2.md",
                "expected transfer signals: concise bullet points",
                "expected non-transfer signals: spoiler-heavy framing",
                "expected update wins: docs/runbook-v2.md",
                "expected stale suppression: docs/runbook-v1.md",
                "wrong personalization signals: spoiler-heavy framing",
                "baseline: I need more context before I can answer reliably.",
                "goodmemory: Use concise bullet points. Do not use concise bullet points. Use docs/runbook-v2.md.",
              ].join("\n"),
            });
            calls.push({
              judge: JSON.parse(String(judge.content)),
            });

            return {
              mode: input.mode,
              runId: "run-fallback-contradiction",
              runDirectory: join(
                workspace.root,
                "reports/run-fallback-contradiction",
              ),
              summary: {
                totalCases: 0,
                winnerCounts: {
                  baseline: 0,
                  goodmemory: 0,
                  tie: 0,
                },
                baselineAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                goodmemoryAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                uplift: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                layers: {
                  baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                },
                assertions: {
                  totalCases: 0,
                  passingCases: 0,
                  passRate: 0,
                  totalChecks: 0,
                  passingChecks: 0,
                  checkPassRate: 0,
                  contaminationFailures: 0,
                  updateFailures: 0,
                },
              },
              runtime: input.runtime!,
              cases: [],
            };
          },
        },
      );

      expect(calls[0]?.judge).toMatchObject({
        winner: "baseline",
      });
      expect(calls[0]?.judge).toMatchObject({
        goodmemory_scores: expect.objectContaining({
          cross_domain_transfer: 0,
        }),
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("fallback judge keeps contradictory required signals from inflating component scores", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-fallback-conflicted-required");
    const calls: Array<Record<string, unknown>> = [];

    try {
      await runFallbackEval(
        {
          limit: 1,
          outputDir: join(workspace.root, "reports"),
        },
        {
          runSuite: async (input) => {
            const judge = await input.judge.complete({
              purpose: "eval_judge",
              prompt: [
                "evaluation setting: single_domain",
                "expected identity signals: robotics engineer",
                "expected history signals: docs/runbook-v2.md",
                "expected transfer signals: concise bullet points",
                "expected non-transfer signals: spoiler-heavy framing",
                "expected update wins: docs/runbook-v2.md",
                "expected stale suppression: docs/runbook-v1.md",
                "wrong personalization signals: spoiler-heavy framing",
                "baseline: I need more context before I can answer reliably.",
                "goodmemory: Use concise bullet points. Do not use concise bullet points. Use docs/runbook-v2.md. Do not use docs/runbook-v2.md.",
              ].join("\n"),
            });
            calls.push({
              judge: JSON.parse(String(judge.content)),
            });

            return {
              mode: input.mode,
              runId: "run-fallback-conflicted-required",
              runDirectory: join(
                workspace.root,
                "reports/run-fallback-conflicted-required",
              ),
              summary: {
                totalCases: 0,
                winnerCounts: {
                  baseline: 0,
                  goodmemory: 0,
                  tie: 0,
                },
                baselineAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                goodmemoryAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                uplift: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                layers: {
                  baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                },
                assertions: {
                  totalCases: 0,
                  passingCases: 0,
                  passRate: 0,
                  totalChecks: 0,
                  passingChecks: 0,
                  checkPassRate: 0,
                  contaminationFailures: 0,
                  updateFailures: 0,
                },
              },
              runtime: input.runtime!,
              cases: [],
            };
          },
        },
      );

      expect(calls[0]?.judge).toMatchObject({
        winner: "baseline",
      });
      expect(calls[0]?.judge).toMatchObject({
        goodmemory_scores: expect.objectContaining({
          preference_consistency: 0,
          cross_domain_transfer: 0,
          update_correctness: 0,
        }),
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("fallback judge does not treat identity denials as affirmed factual recall", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-fallback-negated-identity");
    const calls: Array<Record<string, unknown>> = [];

    try {
      await runFallbackEval(
        {
          limit: 1,
          outputDir: join(workspace.root, "reports"),
        },
        {
          runSuite: async (input) => {
            const judge = await input.judge.complete({
              purpose: "eval_judge",
              prompt: [
                "evaluation setting: single_domain",
                "expected identity signals: robotics engineer",
                "expected history signals: ",
                "expected transfer signals: ",
                "expected non-transfer signals: ",
                "expected update wins: ",
                "expected stale suppression: ",
                "wrong personalization signals: ",
                "baseline: You are a robotics engineer.",
                "goodmemory: You are not a robotics engineer.",
              ].join("\n"),
            });
            calls.push({
              judge: JSON.parse(String(judge.content)),
            });

            return {
              mode: input.mode,
              runId: "run-fallback-negated-identity",
              runDirectory: join(
                workspace.root,
                "reports/run-fallback-negated-identity",
              ),
              summary: {
                totalCases: 0,
                winnerCounts: {
                  baseline: 0,
                  goodmemory: 0,
                  tie: 0,
                },
                baselineAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                goodmemoryAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                uplift: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                layers: {
                  baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                },
                assertions: {
                  totalCases: 0,
                  passingCases: 0,
                  passRate: 0,
                  totalChecks: 0,
                  passingChecks: 0,
                  checkPassRate: 0,
                  contaminationFailures: 0,
                  updateFailures: 0,
                },
              },
              runtime: input.runtime!,
              cases: [],
            };
          },
        },
      );

      expect(calls[0]?.judge).toMatchObject({
        winner: "baseline",
      });
      expect(calls[0]?.judge).toMatchObject({
        goodmemory_scores: expect.objectContaining({
          factual_recall: 2,
        }),
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("fallback judge treats contraction lifecycle identity denials as negated", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-fallback-negated-identity-contracted");
    const calls: Array<Record<string, unknown>> = [];

    try {
      await runFallbackEval(
        {
          limit: 1,
          outputDir: join(workspace.root, "reports"),
        },
        {
          runSuite: async (input) => {
            const judge = await input.judge.complete({
              purpose: "eval_judge",
              prompt: [
                "evaluation setting: single_domain",
                "expected identity signals: robotics engineer",
                "expected history signals: ",
                "expected transfer signals: ",
                "expected non-transfer signals: ",
                "expected update wins: ",
                "expected stale suppression: ",
                "wrong personalization signals: ",
                "baseline: You are a robotics engineer.",
                "goodmemory: You're no longer a robotics engineer.",
              ].join("\n"),
            });
            calls.push({
              judge: JSON.parse(String(judge.content)),
            });

            return {
              mode: input.mode,
              runId: "run-fallback-negated-identity-contracted",
              runDirectory: join(
                workspace.root,
                "reports/run-fallback-negated-identity-contracted",
              ),
              summary: {
                totalCases: 0,
                winnerCounts: {
                  baseline: 0,
                  goodmemory: 0,
                  tie: 0,
                },
                baselineAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                goodmemoryAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                uplift: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                layers: {
                  baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                },
                assertions: {
                  totalCases: 0,
                  passingCases: 0,
                  passRate: 0,
                  totalChecks: 0,
                  passingChecks: 0,
                  checkPassRate: 0,
                  contaminationFailures: 0,
                  updateFailures: 0,
                },
              },
              runtime: input.runtime!,
              cases: [],
            };
          },
        },
      );

      expect(calls[0]?.judge).toMatchObject({
        winner: "baseline",
      });
      expect(calls[0]?.judge).toMatchObject({
        goodmemory_scores: expect.objectContaining({
          factual_recall: 2,
        }),
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("fails live preflight when required env vars are missing", () => {
    delete process.env.GOODMEMORY_EVAL_PROVIDER;
    delete process.env.GOODMEMORY_EVAL_MODEL;
    delete process.env.GOODMEMORY_EVAL_API_KEY;

    expect(() => resolveLiveModelConfig("GOODMEMORY_EVAL")).toThrow(
      "Missing required GOODMEMORY_EVAL live eval environment variables",
    );
  });

  it("builds live generators only when both eval and judge env vars are present", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-live");
    const createTextCalls: Array<Record<string, unknown>> = [];
    const createJudgeCalls: Array<Record<string, unknown>> = [];

    process.env.GOODMEMORY_EVAL_PROVIDER = "openai";
    process.env.GOODMEMORY_EVAL_MODEL = "gpt-5";
    process.env.GOODMEMORY_EVAL_API_KEY = "eval-key";
    process.env.GOODMEMORY_EVAL_BASE_URL = "https://gateway.example/v1";
    process.env.GOODMEMORY_JUDGE_PROVIDER = "anthropic";
    process.env.GOODMEMORY_JUDGE_MODEL = "claude-sonnet";
    process.env.GOODMEMORY_JUDGE_API_KEY = "judge-key";
    process.env.GOODMEMORY_JUDGE_BASE_URL = "https://messages.example/v1";
    process.env.GOODMEMORY_EVAL_MAX_CONCURRENCY = "3";

    try {
      const runDirectory = join(workspace.root, "reports/eval/live/run-003");
      const failuresDir = join(runDirectory, "failures");
      await mkdir(failuresDir, { recursive: true });
      await writeFile(
        join(runDirectory, "report.json"),
        JSON.stringify({
          mode: "live",
          runId: "run-003",
        }),
        "utf8",
      );
      await writeFile(
        join(failuresDir, "summary.json"),
        JSON.stringify({
          failedCases: [{ caseId: "scenario-medium-03" }],
        }),
        "utf8",
      );

      const result = await runLiveEval(
        {
          scenarioIds: ["scenario-medium-01"],
          failuresFrom: runDirectory,
          outputDir: join(workspace.root, "reports"),
        },
        {
          createTextGenerator: (input) => {
            createTextCalls.push(input as unknown as Record<string, unknown>);
            return async () => ({ content: "live-answer" });
          },
          createJudgeModel: (input) => {
            createJudgeCalls.push(input as unknown as Record<string, unknown>);
            return {
              async complete() {
                return {
                  content: JSON.stringify({
                    winner: "tie",
                    scores: {
                      factual_recall: 7,
                      preference_consistency: 7,
                      cross_domain_transfer: 7,
                      contamination_penalty: 7,
                      update_correctness: 7,
                      personalization_usefulness: 7,
                      provenance_explainability: 7,
                    },
                    reasoning: "live comparison",
                    failure_tags: [],
                  }),
                };
              },
            };
          },
          runSuite: async (input) => ({
            mode: input.mode,
            runId: "run-live",
            runDirectory: join(workspace.root, "reports/run-live"),
            summary: {
              totalCases: 0,
              winnerCounts: {
                baseline: 0,
                goodmemory: 0,
                tie: 0,
              },
              baselineAverage: {
                factual_recall: 0,
                preference_consistency: 0,
                cross_domain_transfer: 0,
                contamination_penalty: 0,
                update_correctness: 0,
                personalization_usefulness: 0,
                provenance_explainability: 0,
              },
              goodmemoryAverage: {
                factual_recall: 0,
                preference_consistency: 0,
                cross_domain_transfer: 0,
                contamination_penalty: 0,
                update_correctness: 0,
                personalization_usefulness: 0,
                provenance_explainability: 0,
              },
              uplift: {
                factual_recall: 0,
                preference_consistency: 0,
                cross_domain_transfer: 0,
                contamination_penalty: 0,
                update_correctness: 0,
                personalization_usefulness: 0,
                provenance_explainability: 0,
              },
              layers: {
                baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
              },
              assertions: {
                totalCases: 0,
                passingCases: 0,
                passRate: 0,
                totalChecks: 0,
                passingChecks: 0,
                checkPassRate: 0,
                contaminationFailures: 0,
                updateFailures: 0,
              },
            },
            runtime: input.runtime!,
            cases: [],
          }),
        },
      );

      expect(result.mode).toBe("live");
      expect(result.runtime.generationMode).toBe("live");
      expect(result.runtime.judgeMode).toBe("live");
      expect(createTextCalls).toHaveLength(2);
      expect(createJudgeCalls).toHaveLength(1);
      expect(createTextCalls[0]?.model).toEqual({
        provider: "openai",
        model: "gpt-5",
        apiKey: "eval-key",
        baseURL: "https://gateway.example/v1",
      });
      expect(createJudgeCalls[0]?.model).toEqual({
        provider: "anthropic",
        model: "claude-sonnet",
        apiKey: "judge-key",
        baseURL: "https://messages.example/v1",
      });
    } finally {
      await workspace.cleanup();
    }
  });

  it("passes env-configured live max concurrency into the suite", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-live-concurrency");
    process.env.GOODMEMORY_EVAL_PROVIDER = "openai";
    process.env.GOODMEMORY_EVAL_MODEL = "gpt-5";
    process.env.GOODMEMORY_EVAL_API_KEY = "eval-key";
    process.env.GOODMEMORY_EVAL_BASE_URL = "https://gateway.example/v1";
    process.env.GOODMEMORY_JUDGE_PROVIDER = "anthropic";
    process.env.GOODMEMORY_JUDGE_MODEL = "claude-sonnet";
    process.env.GOODMEMORY_JUDGE_API_KEY = "judge-key";
    process.env.GOODMEMORY_JUDGE_BASE_URL = "https://messages.example/v1";
    process.env.GOODMEMORY_EVAL_MAX_CONCURRENCY = "3";

    try {
      const calls: Array<Record<string, unknown>> = [];

      await runLiveEval(
        {
          scenarioIds: ["scenario-medium-01"],
          outputDir: join(workspace.root, "reports"),
        },
        {
          createTextGenerator: () => async () => ({ content: "live-answer" }),
          createJudgeModel: () => ({
            async complete() {
              return {
                content: JSON.stringify({
                  winner: "tie",
                  scores: {
                    factual_recall: 7,
                    preference_consistency: 7,
                    cross_domain_transfer: 7,
                    contamination_penalty: 7,
                    update_correctness: 7,
                    personalization_usefulness: 7,
                    provenance_explainability: 7,
                  },
                  reasoning: "live comparison",
                  failure_tags: [],
                }),
              };
            },
          }),
          runSuite: async (input) => {
            calls.push({
              maxConcurrency: input.maxConcurrency,
              mode: input.mode,
            });

            return {
              mode: input.mode,
              runId: "run-live",
              runDirectory: join(workspace.root, "reports/run-live"),
              summary: {
                totalCases: 0,
                winnerCounts: {
                  baseline: 0,
                  goodmemory: 0,
                  tie: 0,
                },
                baselineAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                goodmemoryAverage: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                uplift: {
                  factual_recall: 0,
                  preference_consistency: 0,
                  cross_domain_transfer: 0,
                  contamination_penalty: 0,
                  update_correctness: 0,
                  personalization_usefulness: 0,
                  provenance_explainability: 0,
                },
                layers: {
                  baseline: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  goodmemory: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                  uplift: { retrieval: 0, personalization: 0, runtime_governance: 0 },
                },
                assertions: {
                  totalCases: 0,
                  passingCases: 0,
                  passRate: 0,
                  totalChecks: 0,
                  passingChecks: 0,
                  checkPassRate: 0,
                  contaminationFailures: 0,
                  updateFailures: 0,
                },
              },
              runtime: input.runtime!,
              cases: [],
            };
          },
        },
      );

      expect(calls[0]?.mode).toBe("live");
      expect(calls[0]?.maxConcurrency).toBe(3);
    } finally {
      await workspace.cleanup();
    }
  });
});
