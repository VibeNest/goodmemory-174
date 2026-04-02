import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempWorkspace } from "../../src/testing/utils";
import {
  mergeScenarioIds,
  parseCliOptionsFromArgv,
  resolveFailedScenarioIds,
  resolveFlagValue,
  resolveRepeatedFlagValues,
  runFixtureEval,
} from "../../scripts/run-eval";

describe("run-eval script", () => {
  it("parses cli flags from argv", () => {
    const argv = [
      "bun",
      "scripts/run-eval.ts",
      "--limit=3",
      "--scenario-id=scenario-medium-01",
      "--scenario-id",
      "scenario-medium-02",
      "--output-dir",
      "custom-output",
      "--failures-from=reports/eval/run-001",
      "--smoke",
    ];

    expect(resolveFlagValue(argv, "--limit")).toBe("3");
    expect(resolveRepeatedFlagValues(argv, "--scenario-id")).toEqual([
      "scenario-medium-01",
      "scenario-medium-02",
    ]);
    expect(parseCliOptionsFromArgv(argv)).toEqual({
      smoke: true,
      limit: 3,
      scenarioIds: ["scenario-medium-01", "scenario-medium-02"],
      outputDir: "custom-output",
      failuresFrom: "reports/eval/run-001",
    });
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

  it("resolves failed scenario ids from summary artifacts", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-summary");

    try {
      const runDirectory = join(workspace.root, "reports/eval/run-001");
      const failuresDir = join(runDirectory, "failures");
      await mkdir(failuresDir, { recursive: true });
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

      expect(await resolveFailedScenarioIds(runDirectory)).toEqual([
        "scenario-medium-01",
        "scenario-long-01",
      ]);
    } finally {
      await workspace.cleanup();
    }
  });

  it("falls back to failure filenames when summary is missing", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-fallback");

    try {
      const runDirectory = join(workspace.root, "reports/eval/run-002");
      const failuresDir = join(runDirectory, "failures");
      await mkdir(failuresDir, { recursive: true });
      await writeFile(join(failuresDir, "scenario-medium-02.json"), "{}", "utf8");
      await writeFile(join(failuresDir, "scenario-medium-01.json"), "{}", "utf8");

      expect(await resolveFailedScenarioIds(runDirectory)).toEqual([
        "scenario-medium-01",
        "scenario-medium-02",
      ]);
    } finally {
      await workspace.cleanup();
    }
  });

  it("builds fallback generators, judge, and runtime metadata", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-suite");
    const calls: Array<Record<string, unknown>> = [];

    try {
      const result = await runFixtureEval(
        {
          limit: 2,
          outputDir: join(workspace.root, "reports"),
        },
        {
          parseModelConfigFromEnv: () => null,
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
              runtime: input.runtime,
              baseline: baseline.content,
              goodmemory: goodmemory.content,
              judge: judge.content,
            });

            return {
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

      expect(result.runtime.generationMode).toBe("fallback");
      expect(result.runtime.judgeMode).toBe("fallback");
      expect(calls[0]?.outputDir).toContain("reports");
      expect(calls[0]?.limit).toBe(2);
      expect(calls[0]?.baseline).toBe("I need more context before I can answer reliably.");
      expect(calls[0]?.goodmemory).toContain("updated runbook is v2");
      expect(String(calls[0]?.judge)).toContain("\"winner\":\"goodmemory\"");
    } finally {
      await workspace.cleanup();
    }
  });

  it("builds live generators and merges failed-subset reruns", async () => {
    const workspace = await createTempWorkspace("goodmemory-run-eval-live");
    const createTextCalls: Array<Record<string, unknown>> = [];
    const createJudgeCalls: Array<Record<string, unknown>> = [];

    try {
      const runDirectory = join(workspace.root, "reports/eval/run-003");
      const failuresDir = join(runDirectory, "failures");
      await mkdir(failuresDir, { recursive: true });
      await writeFile(
        join(failuresDir, "summary.json"),
        JSON.stringify({
          failedCases: [{ caseId: "scenario-medium-03" }],
        }),
        "utf8",
      );

      const result = await runFixtureEval(
        {
          scenarioIds: ["scenario-medium-01"],
          failuresFrom: runDirectory,
          outputDir: join(workspace.root, "reports"),
        },
        {
          parseModelConfigFromEnv: (prefix) => ({
            provider: "openai",
            model: `${prefix.toLowerCase()}-model`,
          }),
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

      expect(result.runtime.generationMode).toBe("live");
      expect(result.runtime.judgeMode).toBe("live");
      expect(createTextCalls).toHaveLength(2);
      expect(createJudgeCalls).toHaveLength(1);
    } finally {
      await workspace.cleanup();
    }
  });
});
