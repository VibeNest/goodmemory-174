import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BuildContextResult,
  DeleteAllMemoryResult,
  ExportMemoryResult,
  FeedbackResult,
  ForgetResult,
  GoodMemory,
  RecallResult,
  RememberResult,
  ReviseMemoryResult,
  RunMaintenanceResult,
} from "../../src/api/contracts";
import type { MemoryScope } from "../../src/domain/scope";
import {
  createImplicitMemBenchSmokeDependencies,
  listImplicitMemBenchResearchCases,
  runImplicitMemBenchBaselineEval,
  runImplicitMemBenchComparisonEval,
  runImplicitMemBenchGoodMemoryEval,
  validateImplicitMemBenchAdapterManifest,
} from "../../src/eval/implicitmembench-research";

const FIXTURE_ROOT =
  "/Users/hjqcan/Documents/GoodMomery/fixtures/implicitmembench-research";
const MANIFEST_PATH = `${FIXTURE_ROOT}/adapter-manifest.json`;

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

function createDeleteAllMemoryResult(scope: MemoryScope): DeleteAllMemoryResult {
  return {
    deleted: {
      archives: 0,
      artifactSpills: 0,
      episodes: 0,
      evidence: 0,
      experiences: 0,
      facts: 0,
      feedback: 0,
      journal: 0,
      preferences: 0,
      profiles: 0,
      promotions: 0,
      proposals: 0,
      references: 0,
      workingMemory: 0,
    },
    scope,
  };
}

function createTrackingMemory(deletedScopes: MemoryScope[]): GoodMemory {
  return {
    buildContext: async (): Promise<BuildContextResult> => ({
      content: "tracked memory context",
      estimatedTokens: 3,
      omittedSections: [],
      output: "developer_prompt_fragment",
    }),
    deleteAllMemory: async (input): Promise<DeleteAllMemoryResult> => {
      deletedScopes.push(input.scope);
      return createDeleteAllMemoryResult(input.scope);
    },
    exportMemory: async (input): Promise<ExportMemoryResult> =>
      ({
        scope: input.scope,
      }) as ExportMemoryResult,
    feedback: async (): Promise<FeedbackResult> =>
      ({
        accepted: true,
      }) as FeedbackResult,
    forget: async (): Promise<ForgetResult> => ({
      forgotten: true,
    }),
    jobs: {
      drain: async () => ({
        jobs: [],
        processed: 0,
      }),
      enqueueRemember: async (input) =>
        ({
          attempts: 0,
          createdAt: "2026-04-28T00:00:00.000Z",
          idempotencyKey: input.idempotencyKey,
          jobId: "test-job",
          linkedEvidenceIds: [],
          linkedMemoryIds: [],
          linkedTraceIds: [],
          operation: "remember",
          status: "succeeded",
          updatedAt: "2026-04-28T00:00:00.000Z",
        }),
      getJob: async () => null,
      retryJob: async () => null,
    },
    recall: async (): Promise<RecallResult> =>
      ({
        metadata: {
          candidateTraces: [],
          hits: [],
          latencyMs: 0,
          policyApplied: [],
          routingDecision: {
            reasons: [],
            strategy: "direct",
          },
          tokenCount: 0,
          verificationHints: [],
        },
        packet: {
          sections: [],
        },
      }) as unknown as RecallResult,
    remember: async (): Promise<RememberResult> =>
      ({
        accepted: 0,
        events: [],
        rejected: 0,
      }),
    reviseMemory: async (): Promise<ReviseMemoryResult> => ({
      accepted: true,
      idempotencyKey: "test",
      outcome: "superseded",
      policyApplied: [],
    } as ReviseMemoryResult),
    runMaintenance: async (): Promise<RunMaintenanceResult> =>
      ({
        compiledCount: 0,
        maintenance: null,
        promotionDecisionCounts: {},
        proposalCount: 0,
        ran: true,
        reason: "completed",
      }),
    runtime: {
      appendMessage: async () =>
        ({
          buffer: {
            messages: [],
          },
        }) as never,
      endSession: async () =>
        ({
          state: {},
        }) as never,
      getRecallSnapshot: async () =>
        ({
          snapshot: {},
        }) as never,
      getState: async () =>
        ({
          state: {},
        }) as never,
      setSessionSummary: async () =>
        ({
          buffer: {
            messages: [],
          },
        }) as never,
      startSession: async () =>
        ({
          state: {},
        }) as never,
      updateSessionJournal: async () =>
        ({
          journal: {},
        }) as never,
      updateWorkingMemory: async () =>
        ({
          workingMemory: {},
        }) as never,
    },
  };
}

describe("implicitmembench research eval", () => {
  it("loads mirrored smoke cases with explicit scorer routing", async () => {
    const cases = await listImplicitMemBenchResearchCases({
      benchmarkRoot: FIXTURE_ROOT,
      manifestPath: MANIFEST_PATH,
    });

    expect(cases).toHaveLength(4);
    expect(cases.map((caseDefinition) => caseDefinition.taskFile)).toEqual([
      "conditioned_brevity.json",
      "volcanic_eruption.json",
      "character_voice_consistency.json",
      "reversed_parameter_protocol.json",
    ]);
    expect(
      cases.map((caseDefinition) => caseDefinition.scorerFamily),
    ).toEqual([
      "text_behavior_judge",
      "priming_pair_judge",
      "text_behavior_judge",
      "structured_first_action",
    ]);
  });

  it("requires explicit adapter-manifest coverage for the full upstream task-file set", async () => {
    const manifest = validateImplicitMemBenchAdapterManifest(
      JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as unknown,
      MANIFEST_PATH,
    );

    expect(Object.keys(manifest.datasets.procedural_memory)).toHaveLength(15);
    expect(Object.keys(manifest.datasets.classical_conditioning)).toHaveLength(10);
    expect(Object.keys(manifest.datasets.priming)).toHaveLength(10);
  });

  it("fails closed when the benchmark root is missing the dataset tree", async () => {
    const outputDir = await createTempDir("phase49-missing-root");

    await expect(
      runImplicitMemBenchBaselineEval({
        benchmarkRoot: outputDir,
        dependencies: createImplicitMemBenchSmokeDependencies(),
        generatedBy: "tests",
        manifestPath: MANIFEST_PATH,
        mode: "smoke",
        outputDir,
        runId: "run-phase49-missing-root",
      }),
    ).rejects.toThrow("ENOENT");
  });

  it("keeps GoodMemory generation prompts limited to memory context plus probe", async () => {
    const outputDir = await createTempDir("phase49-goodmemory");
    const prompts: string[] = [];

    await runImplicitMemBenchGoodMemoryEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: {
        ...createImplicitMemBenchSmokeDependencies(),
        generateTextAnswer: async (input) => {
          prompts.push(input.prompt);
          const answer =
            input.profile === "goodmemory-raw-experience"
              ? "81"
              : "81";
          return answer;
        },
      },
      generatedBy: "tests",
      limit: 1,
      manifestPath: MANIFEST_PATH,
      mode: "live",
      outputDir,
      runId: "run-phase49-goodmemory-test",
    });

    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt).toContain("Memory context:");
      expect(prompt).toContain("Probe:");
      expect(prompt).not.toContain("How do I download a file from a URL?");
      expect(prompt).not.toContain("Use: wget https://example.com/file");
    }
  });

  it("writes baseline, raw, and distilled reports with priming omitted from distilled", async () => {
    const baselineDir = await createTempDir("phase49-baseline");
    const goodmemoryDir = await createTempDir("phase49-goodmemory");

    const baseline = await runImplicitMemBenchBaselineEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: createImplicitMemBenchSmokeDependencies(),
      generatedBy: "tests",
      manifestPath: MANIFEST_PATH,
      mode: "smoke",
      outputDir: baselineDir,
      runId: "run-phase49-baseline-test",
    });
    const goodmemory = await runImplicitMemBenchGoodMemoryEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: createImplicitMemBenchSmokeDependencies(),
      generatedBy: "tests",
      manifestPath: MANIFEST_PATH,
      mode: "smoke",
      outputDir: goodmemoryDir,
      runId: "run-phase49-goodmemory-test",
    });

    expect(baseline.profiles["baseline-upstream-chat"]?.totalCases).toBe(4);
    expect(
      goodmemory.profiles["goodmemory-raw-experience"]?.caseCountsByDataset.priming,
    ).toBe(1);
    expect(
      goodmemory.profiles["goodmemory-distilled-feedback"]?.caseCountsByDataset
        .priming,
    ).toBe(0);
    expect(
      JSON.parse(
        await readFile(
          `${goodmemoryDir}/run-phase49-goodmemory-test/report.json`,
          "utf8",
        ),
      ).profiles["goodmemory-distilled-feedback"].caseCountsByDataset.priming,
    ).toBe(0);
  });

  it("cleans every GoodMemory priming scope used by experimental and control branches", async () => {
    const outputDir = await createTempDir("phase49-priming-cleanup");
    const deletedScopes: MemoryScope[] = [];

    await runImplicitMemBenchGoodMemoryEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: {
        ...createImplicitMemBenchSmokeDependencies(),
        createMemory: () => createTrackingMemory(deletedScopes),
      },
      generatedBy: "tests",
      limit: 2,
      manifestPath: MANIFEST_PATH,
      mode: "smoke",
      outputDir,
      runId: "run-phase49-priming-cleanup-test",
    });

    const primingRawWorkspace =
      "implicitmembench-volcanic_eruption.json-goodmemory-raw-experience";
    expect(
      deletedScopes
        .map((scope) => scope.workspaceId)
        .filter((workspaceId) => workspaceId?.startsWith(primingRawWorkspace))
        .sort(),
    ).toEqual([
      primingRawWorkspace,
      `${primingRawWorkspace}-control`,
      `${primingRawWorkspace}-experimental`,
    ]);
  });

  it("preserves GoodMemory executionFailure details and every cleanup scope failure", async () => {
    const outputDir = await createTempDir("phase49-cleanup-aggregate");
    const cleanMemory = createTrackingMemory([]);
    const cleanupFailingWorkspace =
      "implicitmembench-volcanic_eruption.json-goodmemory-raw-experience";

    let caught: unknown;
    try {
      await runImplicitMemBenchGoodMemoryEval({
        benchmarkRoot: FIXTURE_ROOT,
        dependencies: {
          ...createImplicitMemBenchSmokeDependencies(),
          createMemory: (input) => {
            const memory = createTrackingMemory([]);
            if (
              input.profile !== "goodmemory-raw-experience" ||
              input.scope.workspaceId !== cleanupFailingWorkspace
            ) {
              return cleanMemory;
            }

            return {
              ...memory,
              deleteAllMemory: async (deleteInput) => {
                throw new Error(`cleanup-${deleteInput.scope.workspaceId}`);
              },
            };
          },
          generateTextAnswer: async (input) => {
            if (
              input.profile === "goodmemory-raw-experience" &&
              input.caseDefinition.taskFile === "volcanic_eruption.json"
            ) {
              throw new Error("phase49-primary-generation-error");
            }

            const generated = createImplicitMemBenchSmokeDependencies()
              .generateTextAnswer;
            if (!generated) {
              throw new Error("missing smoke generator");
            }
            return generated(input);
          },
        },
        generatedBy: "tests",
        limit: 2,
        manifestPath: MANIFEST_PATH,
        mode: "live",
        outputDir,
        runId: "run-phase49-cleanup-aggregate-test",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    const errorText = [
      aggregate.message,
      ...aggregate.errors.map((error) =>
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      ),
    ].join("\n");

    expect(errorText).toContain("phase49-primary-generation-error");
    expect(errorText).toContain(`cleanup-${cleanupFailingWorkspace}`);
    expect(errorText).toContain(`cleanup-${cleanupFailingWorkspace}-experimental`);
    expect(errorText).toContain(`cleanup-${cleanupFailingWorkspace}-control`);
    expect(errorText.indexOf("phase49-primary-generation-error")).toBeLessThan(
      errorText.indexOf(`cleanup-${cleanupFailingWorkspace}`),
    );
  });

  it("builds a comparison report with all scorer families", async () => {
    const outputDir = await createTempDir("phase49-comparison");

    const { comparisonReport } = await runImplicitMemBenchComparisonEval({
      benchmarkRoot: FIXTURE_ROOT,
      dependencies: createImplicitMemBenchSmokeDependencies(),
      generatedBy: "tests",
      manifestPath: MANIFEST_PATH,
      mode: "smoke",
      outputDir,
      runId: "run-phase49-comparison-test",
    });

    expect(comparisonReport.summary.caseCount).toBe(4);
    expect(comparisonReport.comparison.byScorer.structured_first_action.caseCount).toBe(
      1,
    );
    expect(comparisonReport.comparison.byScorer.text_behavior_judge.caseCount).toBe(
      2,
    );
    expect(comparisonReport.comparison.byScorer.priming_pair_judge.caseCount).toBe(
      1,
    );
  });
});
