import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempWorkspace } from "../../src/testing/utils";
import {
  mergeScenarioIds,
  parseCliOptionsFromArgv,
  resolveDefaultOutputDir,
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
      await writeFile(join(failuresDir, "scenario-medium-01.json"), "{}", "utf8");

      expect(await resolveFailedScenarioIds(runDirectory, "fallback")).toEqual([
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
              prompt: "updated runbook is v2",
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
                  identity_understanding: 0,
                  history_continuation: 0,
                  factual_alignment: 0,
                  relevance: 0,
                },
                goodmemoryAverage: {
                  identity_understanding: 0,
                  history_continuation: 0,
                  factual_alignment: 0,
                  relevance: 0,
                },
                uplift: {
                  identity_understanding: 0,
                  history_continuation: 0,
                  factual_alignment: 0,
                  relevance: 0,
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
      expect(calls[0]?.goodmemory).toContain("updated runbook is v2");
      expect(String(calls[0]?.judge)).toContain("\"winner\":\"goodmemory\"");
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
    process.env.GOODMEMORY_JUDGE_PROVIDER = "anthropic";
    process.env.GOODMEMORY_JUDGE_MODEL = "claude-sonnet";
    process.env.GOODMEMORY_JUDGE_API_KEY = "judge-key";

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
                      identity_understanding: 7,
                      history_continuation: 7,
                      factual_alignment: 7,
                      relevance: 7,
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
                identity_understanding: 0,
                history_continuation: 0,
                factual_alignment: 0,
                relevance: 0,
              },
              goodmemoryAverage: {
                identity_understanding: 0,
                history_continuation: 0,
                factual_alignment: 0,
                relevance: 0,
              },
              uplift: {
                identity_understanding: 0,
                history_continuation: 0,
                factual_alignment: 0,
                relevance: 0,
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
    } finally {
      await workspace.cleanup();
    }
  });
});
