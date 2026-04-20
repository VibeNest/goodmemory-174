import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createPhase22FallbackCreateMemory } from "../../src/eval/phase22";
import {
  buildPhase22GateCommands,
  buildPhase22GateRunId,
  resolvePhase22GateOutputDir,
  runPhase22QualityGate,
} from "../../scripts/run-phase-22-gate";
import {
  resolvePhase22FallbackOutputDir,
  resolvePhase22StressScenarioIds,
  runPhase22FallbackEval,
} from "../../scripts/run-phase-22-eval";
import {
  resolvePhase22LiveMemoryOutputDir,
  runPhase22LiveMemoryEval,
} from "../../scripts/run-phase-22-live-memory";

function buildEmptySuiteSummary() {
  return {
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
      applicableStaleSuppressionCases: 0,
      applicableUpdateCases: 0,
      contaminationFailures: 0,
      staleMisuseCases: 0,
      staleMisuseRate: 0,
      staleSuppressionCases: 0,
      staleSuppressionRate: 0,
      updateWinCases: 0,
      updateWinRate: 0,
      updateFailures: 0,
    },
    strategySummary: {
      byStrategy: {},
      embeddingImpact: null,
      routerImpact: null,
    },
  };
}

describe("run-phase-22 scripts", () => {
  it("resolves phase-22 fallback output and stress scenarios", () => {
    expect(resolvePhase22FallbackOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/fallback/phase-22",
    );
    expect(resolvePhase22StressScenarioIds()).toEqual([
      "scenario-medium-13-reference-next-step",
      "scenario-medium-13-blocker-slot",
      "scenario-medium-13-role-slot",
      "scenario-complex-01",
      "scenario-medium-11-reference-slot-zh",
    ]);
  });

  it("runs phase-22 fallback eval in observe mode with llm-assisted as the candidate strategy", async () => {
    const calls: Array<Record<string, unknown>> = [];

    const report = await runPhase22FallbackEval(
      {
        runId: "run-phase22",
      },
      {
        runSuite: async (input) => {
          calls.push(input as unknown as Record<string, unknown>);
          return {
            mode: "fallback",
            runId: "run-phase22",
            runDirectory: "/tmp/goodmemory/reports/eval/fallback/phase-22/run-phase22",
            summary: buildEmptySuiteSummary(),
            runtime: input.runtime!,
            cases: [],
          };
        },
      },
    );

    expect(report.mode).toBe("fallback");
    expect(calls[0]?.strategies).toEqual(["llm-assisted"]);
    expect(calls[0]?.runtime).toMatchObject({
      memoryBackend: "in-memory",
      embeddingEnabled: true,
      assistedRecallRouterEnabled: true,
    });
    expect(calls[0]?.strategyRollout).toEqual({
      family: "retrieval",
      mode: "observe",
      promotedStrategy: "rules-only",
    });
  });

  it("runs phase-22 live-memory observe and assist with provider-backed recall router metadata", async () => {
    const originalEnv = { ...process.env };
    process.env.GOODMEMORY_TEST_POSTGRES_URL = "postgres://example/test";
    process.env.GOODMEMORY_EVAL_PROVIDER = "openai";
    process.env.GOODMEMORY_EVAL_MODEL = "gpt-5.4";
    process.env.GOODMEMORY_JUDGE_PROVIDER = "openai";
    process.env.GOODMEMORY_JUDGE_MODEL = "gpt-5.4";
    process.env.GOODMEMORY_EMBEDDING_PROVIDER = "openai";
    process.env.GOODMEMORY_EMBEDDING_MODEL = "text-embedding-3-small";
    process.env.GOODMEMORY_EMBEDDING_API_KEY = "key";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER = "openai";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_MODEL = "gpt-4o-mini";
    process.env.GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY = "key";
    process.env.GOODMEMORY_RECALL_ROUTER_PROVIDER = "openai";
    process.env.GOODMEMORY_RECALL_ROUTER_MODEL = "gpt-5.4";
    process.env.GOODMEMORY_RECALL_ROUTER_API_KEY = "key";

    const runSuiteCalls: Array<Record<string, unknown>> = [];

    try {
      const report = await runPhase22LiveMemoryEval(
        {
          runId: "run-phase22-live",
        },
        {
          createTextGenerator: () => async () => ({ content: "answer" }),
          createJudgeModel: () => ({
            async complete() {
              return { content: "{}" };
            },
          }),
          createEmbeddingAdapter: () => ({
            async embed(texts) {
              return texts.map(() => [1, 0, 0]);
            },
          }),
          createMemoryExtractor: () => ({
            async extract() {
              return { candidates: [], ignoredMessageCount: 0 };
            },
          }),
          createRecallRouter: () => ({
            async plan() {
              return {
                querySummary: "refined query",
                rationale: "router plan",
              };
            },
            async rerank() {
              return {
                orderedCandidateIds: ["fact-1"],
                rationale: "router rerank",
              };
            },
          }),
          createMemory: () => ({
            async buildContext() {
              throw new Error("unused");
            },
            async deleteAllMemory() {
              return {
                deleted: {
                  profiles: 0,
                  preferences: 0,
                  references: 0,
                  facts: 0,
                  feedback: 0,
                  episodes: 0,
                  archives: 0,
                  evidence: 0,
                  experiences: 0,
                  proposals: 0,
                  promotions: 0,
                  workingMemory: 0,
                  journal: 0,
                  artifactSpills: 0,
                },
                scope: {
                  userId: "u-1",
                },
              };
            },
            async exportMemory() {
              throw new Error("unused");
            },
            async feedback() {
              throw new Error("unused");
            },
            async forget() {
              throw new Error("unused");
            },
            async recall() {
              throw new Error("unused");
            },
            async remember() {
              throw new Error("unused");
            },
            async runMaintenance() {
              throw new Error("unused");
            },
          }),
          runSuite: async (input) => {
            runSuiteCalls.push(input as unknown as Record<string, unknown>);

            return {
              mode: "live",
              runId: String(input.runId),
              runDirectory: join(
                "/tmp/goodmemory/reports/eval/live-memory/phase-22",
                String(input.runId),
              ),
              summary: buildEmptySuiteSummary(),
              runtime: input.runtime!,
              cases: [],
            };
          },
        },
      );

      expect(report.observe.runId).toBe("run-phase22-live-observe");
      expect(report.assist.runId).toBe("run-phase22-live-assist");
      expect(runSuiteCalls.map((call) => call.strategyRollout)).toEqual([
        {
          family: "retrieval",
          mode: "observe",
          promotedStrategy: "rules-only",
        },
        {
          family: "retrieval",
          mode: "assist",
          promotedStrategy: "rules-only",
        },
      ]);
      expect(runSuiteCalls[0]?.scenarioIds).toEqual(resolvePhase22StressScenarioIds());
      expect(runSuiteCalls[0]?.runtime).toMatchObject({
        memoryBackend: "provider-backed",
        embeddingEnabled: true,
        assistedExtractionEnabled: true,
        assistedRecallRouterEnabled: true,
        recallRouterModelId: "gpt-5.4",
        recallRouterProviderId: "openai",
      });
      expect(resolvePhase22LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
        "/tmp/goodmemory/reports/eval/live-memory/phase-22",
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it("creates a phase-22 fallback memory factory with fake embeddings and recall router support", async () => {
    const createMemory = createPhase22FallbackCreateMemory();
    const created = createMemory({
      caseId: "case-1",
      persona: {} as never,
      scenario: {} as never,
      scopeNamespace: "phase22",
    });
    const memory = "memory" in created ? created.memory : created;

    const recall = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a" },
      query: "what is the current blocker",
      retrievalProfile: "general_chat",
      strategy: "llm-assisted",
    });

    expect(recall.metadata.routingDecision.strategy).toBe("llm-assisted");
    expect(recall.metadata.routingDecision.strategyExplanation.llmRefinement).toBe(true);
  });

  it("builds the phase-22 gate command list and accepted report", async () => {
    expect(resolvePhase22GateOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-22",
    );
    expect(buildPhase22GateRunId("2026-04-20T10:00:00.000Z")).toBe(
      "run-20260420100000",
    );
    expect(buildPhase22GateCommands("/tmp/goodmemory").map((item) => item.label)).toEqual([
      "typecheck",
      "phase-22-targeted-regressions",
      "phase-22-fallback-eval",
    ]);

    const written: Array<{ path: string; content: string }> = [];
    const report = await runPhase22QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-22",
        runId: "run-phase22",
      },
      {
        now: () => "2026-04-20T10:00:00.000Z",
        ensureDir: async () => {},
        writeTextFile: async (path, content) => {
          written.push({ path, content });
        },
        runCommand: async () => ({
          exitCode: 0,
          durationMs: 10,
          stdout: "ok\n",
          stderr: "",
        }),
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(written[0]?.path).toBe(
      join(
        "/tmp/goodmemory/reports/quality-gates/phase-22/run-phase22",
        "phase-22-quality-gate.json",
      ),
    );
  });
});
