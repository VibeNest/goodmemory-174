import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  buildC5PilotPlan,
  serializeC5PilotPlan,
} from "../../scripts/codex-coding-effect/c5-pilot-plan";
import {
  buildC4AssetLock,
  loadC4AssetLock,
} from "../../scripts/codex-coding-effect/c4-controlled-dataset";
import {
  createC5NativeLiveAdapter,
} from "../../scripts/codex-coding-effect/c5-native-adapter";
import {
  runC5NativeLongitudinalCanary,
  runC5NativeLongitudinalPilot,
} from "../../scripts/codex-coding-effect/c5-live-pilot";
import type {
  C5LivePilotAdapter,
} from "../../scripts/codex-coding-effect/c5-live-pilot";
import { loadCodexCodingEffectDataset } from "../../scripts/codex-coding-effect/dataset";

const SHA = "a".repeat(64);

describe("Codex coding-effect C5 native live pilot", () => {
  it("fails C4 readiness before creating any mutable run root", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-blocked-"));
    try {
      const roots = runRoots(root);
      const events: string[] = [];
      await expect(runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        dependencies: {
          createAdapter: async () => {
            events.push("adapter");
            throw new Error("must not create adapter");
          },
          loadReadiness: async () => {
            events.push("readiness");
            throw new Error("C4 not accepted");
          },
        },
      })).rejects.toThrow("C4 not accepted");

      expect(events).toEqual(["readiness"]);
      for (const path of Object.values(roots)) {
        expect(await exists(path)).toBe(false);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a mutable root inside frozen inputs before writing output", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-overlap-"));
    const datasetRoot = resolve(
      "fixtures/codex-coding-effect/c4-controlled-pilot",
    );
    const nestedRuntimeRoot = join(
      datasetRoot,
      `.c5-overlap-${sha256(root).slice(0, 12)}`,
    );
    try {
      const roots = {
        ...runRoots(root),
        runtimeRoot: nestedRuntimeRoot,
      };
      const loaded = await loadCodexCodingEffectDataset(datasetRoot);
      const plan = buildC5PilotPlan({
        assetLockSha256: SHA,
        assetRootSha256: SHA,
        baselineCeilingReportSha256: SHA,
        c4ReadinessReportSha256: SHA,
        dataset: loaded.dataset,
        manifestSha256: loaded.manifestSha256,
        materialEffectPercentagePoints: 10,
        orderSeed: 73,
      });
      const planBytes = serializeC5PilotPlan(plan);
      let adapterCreated = false;

      await expect(runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        datasetRoot,
        dependencies: {
          createAdapter: async () => {
            adapterCreated = true;
            throw new Error("adapter must not be created");
          },
          loadDataset: async () => loaded,
          loadReadiness: async () => ({
            plan,
            planBytes,
            planSha256: sha256(planBytes),
            prerequisiteEvidenceBytes: "{}\n",
            prerequisiteEvidenceSha256: sha256("{}\n"),
          }),
        },
      })).rejects.toThrow("must not overlap protected input");

      expect(adapterCreated).toBe(false);
      expect(await exists(roots.outputDirectory)).toBe(false);
      expect(await exists(nestedRuntimeRoot)).toBe(false);
    } finally {
      await rm(nestedRuntimeRoot, { force: true, recursive: true });
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a C4 replay workspace overlapping a C5 run root before readiness", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-c4-overlap-"));
    try {
      const roots = runRoots(root);
      let readinessLoaded = false;
      await expect(runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        c4ReadinessWorkspaceRoot: roots.outputDirectory,
        dependencies: {
          loadReadiness: async () => {
            readinessLoaded = true;
            throw new Error("readiness must not be loaded");
          },
        },
      })).rejects.toThrow("mutable run roots must be disjoint");

      expect(readinessLoaded).toBe(false);
      expect(await exists(roots.outputDirectory)).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("persists one frozen identity, all 72 stages, all 36 pairs, and the internal report", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-complete-"));
    try {
      const roots = runRoots(root);
      const loaded = await loadCodexCodingEffectDataset(
        "fixtures/codex-coding-effect/c4-controlled-pilot",
      );
      const plan = buildC5PilotPlan({
        assetLockSha256: SHA,
        assetRootSha256: SHA,
        baselineCeilingReportSha256: SHA,
        c4ReadinessReportSha256: SHA,
        dataset: loaded.dataset,
        manifestSha256: SHA,
        materialEffectPercentagePoints: 10,
        orderSeed: 73,
      });
      const planBytes = serializeC5PilotPlan(plan);
      const planSha256 = sha256(planBytes);
      const prepared = new Set<string>();
      const adapter: C5LivePilotAdapter = {
        auditLiveLeakage: async () => ({
          auditSha256: SHA,
          status: "accepted",
        }),
        cleanupTrajectory: async ({ run }) => {
          expect(prepared.delete(run.id)).toBe(true);
        },
        evaluatePair: async ({ executions }) => executions.map((execution) => ({
          arm: execution.arm,
          disposition: "finalized" as const,
          evaluationEvidenceSha256: SHA,
          resolved: execution.arm === "goodmemory-installed",
          taskFailureReasons: execution.arm === "goodmemory-installed"
            ? []
            : ["hidden-fail-to-pass-failed"],
        })),
        executeStage: async ({ run, stage }) => ({
          arm: run.arm,
          codexDurationMs: 100,
          codexStatus: "completed",
          codexUsage: {
            cachedInputTokens: 10,
            inputTokens: 20,
            outputTokens: 5,
          },
          infrastructureFailureStage: null,
          memoryObservation: run.arm === "no-memory"
            ? null
            : {
                injectedRecordCount: 1,
                irrelevantInjection: false,
                recalledPriorMemoryCount: 1,
                writebackCommitted: true,
                writtenMemoryCount: 1,
              },
          memoryChannelStatus: run.arm === "no-memory"
            ? "not-applicable" as const
            : "passed" as const,
          stageEvidenceSha256: SHA,
          stageRunId: stage.id,
          threadId: `thread-${stage.stageRunIdentitySha256}`,
        }),
        prepareTrajectory: async ({ run }) => {
          prepared.add(run.id);
          return { runId: run.id };
        },
        restoreCredential: async () => {},
        revokeCredential: async () => {},
      };

      const result = await runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        dependencies: {
          createAdapter: async ({ dataset, frozenPlan }) => {
            expect(dataset.datasetId).toBe(plan.datasetId);
            expect(frozenPlan).toEqual(plan);
            return adapter;
          },
          loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
          loadReadiness: async () => ({
            plan,
            planBytes,
            planSha256,
            prerequisiteEvidenceBytes: "{}\n",
            prerequisiteEvidenceSha256: sha256("{}\n"),
          }),
        },
      });

      expect(prepared.size).toBe(0);
      expect(result.report.attempts.accountedCount).toBe(72);
      expect(result.report.pairs.scheduledCount).toBe(36);
      expect(result.report.publicCodingEffectProof).toBe(false);
      expect(await readFile(join(roots.outputDirectory, "pilot-plan.json"), "utf8"))
        .toBe(planBytes);
      const identity = JSON.parse(await readFile(
        join(roots.outputDirectory, "run-identity.json"),
        "utf8",
      )) as Record<string, unknown> & {
        runnerSourceAggregateSha256: string;
      };
      expect(identity).toMatchObject({
        evidenceClass: "native-longitudinal-pilot",
        phase: "C5",
        planSha256,
        publicClaimEligible: false,
        runId: "c5-live-test",
      });
      expect(identity.runnerSourceAggregateSha256).toMatch(/^[a-f0-9]{64}$/u);
      const runnerSourceBefore = JSON.parse(await readFile(
        join(roots.outputDirectory, "runner-source-state.json"),
        "utf8",
      )) as { aggregateSha256: string; files: Array<{ path: string }> };
      const runnerSourceAfter = JSON.parse(await readFile(
        join(roots.outputDirectory, "runner-source-state-post-run.json"),
        "utf8",
      )) as unknown;
      expect(runnerSourceAfter).toEqual(runnerSourceBefore);
      expect(runnerSourceBefore.aggregateSha256).toBe(
        identity.runnerSourceAggregateSha256,
      );
      expect(runnerSourceBefore.files.some((file) =>
        file.path === "scripts/codex-coding-effect/c5-live-pilot.ts"
      )).toBe(true);
      expect(JSON.stringify(runnerSourceBefore)).not.toContain(process.cwd());
      expect(lines(await readFile(
        join(roots.outputDirectory, "stage-executions.jsonl"),
        "utf8",
      ))).toHaveLength(72);
      expect(lines(await readFile(
        join(roots.outputDirectory, "pairs.jsonl"),
        "utf8",
      ))).toHaveLength(36);
      expect(lines(await readFile(
        join(roots.outputDirectory, "cluster-commits.jsonl"),
        "utf8",
      ))).toHaveLength(12);
      const report = JSON.parse(await readFile(
        join(roots.outputDirectory, "report.json"),
        "utf8",
      )) as unknown;
      expect(report).toEqual(result.report);
      const events = lines(await readFile(
        join(roots.outputDirectory, "events.jsonl"),
        "utf8",
      )).map((line) => JSON.parse(line) as { event: string });
      expect(events.at(-1)?.event).toBe("pilot_completed");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("strictly resumes a process-71 interruption under the same run identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-resume-"));
    try {
      const roots = runRoots(root);
      const loaded = await loadCodexCodingEffectDataset(
        "fixtures/codex-coding-effect/c4-controlled-pilot",
      );
      const plan = buildC5PilotPlan({
        assetLockSha256: SHA,
        assetRootSha256: SHA,
        baselineCeilingReportSha256: SHA,
        c4ReadinessReportSha256: SHA,
        dataset: loaded.dataset,
        manifestSha256: SHA,
        materialEffectPercentagePoints: 10,
        orderSeed: 73,
      });
      const planBytes = serializeC5PilotPlan(plan);
      const readiness = async () => ({
        plan,
        planBytes,
        planSha256: sha256(planBytes),
        prerequisiteEvidenceBytes: "{}\n",
        prerequisiteEvidenceSha256: sha256("{}\n"),
      });
      let firstAttemptExecutions = 0;
      await expect(runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        dependencies: {
          createAdapter: async () => fakeAdapter({
            execute: () => {
              firstAttemptExecutions += 1;
              if (firstAttemptExecutions === 71) {
                throw new Error("simulated process-71 interruption");
              }
            },
          }),
          loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
          loadReadiness: readiness,
        },
      })).rejects.toThrow("simulated process-71 interruption");
      expect(firstAttemptExecutions).toBe(71);

      let resumedExecutions = 0;
      const result = await runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        generatedAt: "2099-01-01T00:00:00.000Z",
        resume: true,
        dependencies: {
          createAdapter: async () => fakeAdapter({
            execute: () => {
              resumedExecutions += 1;
            },
          }),
          loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
          loadReadiness: readiness,
        },
      });

      expect(resumedExecutions).toBe(6);
      expect(result.pilot.stageExecutions).toHaveLength(72);
      expect(result.pilot.pairs).toHaveLength(36);
      expect(result.report.generatedAt).toBe(baseInput(roots).generatedAt);
      expect(lines(await readFile(
        join(roots.outputDirectory, "run-attempts.jsonl"),
        "utf8",
      ))).toHaveLength(1);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects changed mutable roots before resume can delete them", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-root-binding-"));
    try {
      const roots = runRoots(root);
      const loaded = await loadCodexCodingEffectDataset(
        "fixtures/codex-coding-effect/c4-controlled-pilot",
      );
      const plan = buildC5PilotPlan({
        assetLockSha256: SHA,
        assetRootSha256: SHA,
        baselineCeilingReportSha256: SHA,
        c4ReadinessReportSha256: SHA,
        dataset: loaded.dataset,
        manifestSha256: SHA,
        materialEffectPercentagePoints: 10,
        orderSeed: 73,
      });
      const planBytes = serializeC5PilotPlan(plan);
      const readiness = async () => ({
        plan,
        planBytes,
        planSha256: sha256(planBytes),
        prerequisiteEvidenceBytes: "{}\n",
        prerequisiteEvidenceSha256: sha256("{}\n"),
      });
      await expect(runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        dependencies: {
          createAdapter: async () => fakeAdapter({
            execute: () => {
              throw new Error("interrupt before resume");
            },
          }),
          loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
          loadReadiness: readiness,
        },
      })).rejects.toThrow("interrupt before resume");

      const unrelatedRuntimeRoot = join(root, "unrelated-runtime");
      const keepPath = join(unrelatedRuntimeRoot, "KEEP.txt");
      await mkdir(unrelatedRuntimeRoot, { recursive: true });
      await writeFile(keepPath, "keep\n", "utf8");
      await expect(runC5NativeLongitudinalPilot({
        ...baseInput({ ...roots, runtimeRoot: unrelatedRuntimeRoot }),
        resume: true,
        dependencies: {
          createAdapter: async () => {
            throw new Error("adapter must not run for drifted roots");
          },
          loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
          loadReadiness: readiness,
        },
      })).rejects.toThrow("not run-owned: runtime");
      expect(await readFile(keepPath, "utf8")).toBe("keep\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a parent-symlink retarget before touching the new physical root", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-root-symlink-"));
    try {
      const firstParent = join(root, "physical-first");
      const secondParent = join(root, "physical-second");
      const linkedParent = join(root, "active-parent");
      await Promise.all([
        mkdir(firstParent, { recursive: true }),
        mkdir(secondParent, { recursive: true }),
      ]);
      await symlink(firstParent, linkedParent, "dir");
      const roots = {
        ...runRoots(root),
        runtimeRoot: join(linkedParent, "runtime"),
      };
      const loaded = await loadCodexCodingEffectDataset(
        "fixtures/codex-coding-effect/c4-controlled-pilot",
      );
      const plan = buildC5PilotPlan({
        assetLockSha256: SHA,
        assetRootSha256: SHA,
        baselineCeilingReportSha256: SHA,
        c4ReadinessReportSha256: SHA,
        dataset: loaded.dataset,
        manifestSha256: SHA,
        materialEffectPercentagePoints: 10,
        orderSeed: 73,
      });
      const planBytes = serializeC5PilotPlan(plan);
      const readiness = async () => ({
        plan,
        planBytes,
        planSha256: sha256(planBytes),
        prerequisiteEvidenceBytes: "{}\n",
        prerequisiteEvidenceSha256: sha256("{}\n"),
      });
      await expect(runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        dependencies: {
          createAdapter: async () => fakeAdapter({
            execute: () => {
              throw new Error("interrupt before symlink resume");
            },
          }),
          loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
          loadReadiness: readiness,
        },
      })).rejects.toThrow("interrupt before symlink resume");

      await unlink(linkedParent);
      await symlink(secondParent, linkedParent, "dir");
      const unrelatedRuntimeRoot = join(secondParent, "runtime");
      const keepPath = join(unrelatedRuntimeRoot, "KEEP.txt");
      await mkdir(unrelatedRuntimeRoot, { recursive: true });
      await writeFile(keepPath, "keep\n", "utf8");

      await expect(runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        resume: true,
        dependencies: {
          createAdapter: async () => {
            throw new Error("adapter must not run after symlink drift");
          },
          loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
          loadReadiness: readiness,
        },
      })).rejects.toThrow("not run-owned: runtime");
      expect(await readFile(keepPath, "utf8")).toBe("keep\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("retries a fully recorded cluster when cleanup failed before commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-cleanup-resume-"));
    try {
      const roots = runRoots(root);
      const loaded = await loadCodexCodingEffectDataset(
        "fixtures/codex-coding-effect/c4-controlled-pilot",
      );
      const plan = buildC5PilotPlan({
        assetLockSha256: SHA,
        assetRootSha256: SHA,
        baselineCeilingReportSha256: SHA,
        c4ReadinessReportSha256: SHA,
        dataset: loaded.dataset,
        manifestSha256: SHA,
        materialEffectPercentagePoints: 10,
        orderSeed: 73,
      });
      const planBytes = serializeC5PilotPlan(plan);
      const readiness = async () => ({
        plan,
        planBytes,
        planSha256: sha256(planBytes),
        prerequisiteEvidenceBytes: "{}\n",
        prerequisiteEvidenceSha256: sha256("{}\n"),
      });
      const finalClusterId = plan.clusters.at(-1)!.id;
      const firstAdapter = fakeAdapter({ execute: () => {} });
      const cleanup = firstAdapter.cleanupTrajectory;
      let cleanupFailed = false;
      firstAdapter.cleanupTrajectory = async (context) => {
        await cleanup(context);
        if (context.run.clusterId === finalClusterId && !cleanupFailed) {
          cleanupFailed = true;
          throw new Error("simulated final cleanup failure");
        }
      };
      await expect(runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        dependencies: {
          createAdapter: async () => firstAdapter,
          loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
          loadReadiness: readiness,
        },
      })).rejects.toThrow("C5 trajectory cleanup failed");

      let resumedExecutions = 0;
      const result = await runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        resume: true,
        dependencies: {
          createAdapter: async () => fakeAdapter({
            execute: () => {
              resumedExecutions += 1;
            },
          }),
          loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
          loadReadiness: readiness,
        },
      });

      expect(resumedExecutions).toBe(6);
      expect(result.pilot.stageExecutions).toHaveLength(72);
      expect(result.pilot.pairs).toHaveLength(36);
      const attempts = lines(await readFile(
        join(roots.outputDirectory, "run-attempts.jsonl"),
        "utf8",
      ));
      expect(attempts).toHaveLength(1);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies and revalidates the asset-locked dataset before exposing the real adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-snapshot-"));
    try {
      const roots = runRoots(root);
      const datasetRoot = "fixtures/codex-coding-effect/c4-controlled-pilot";
      const [loaded, stored, current] = await Promise.all([
        loadCodexCodingEffectDataset(datasetRoot),
        loadC4AssetLock(datasetRoot),
        buildC4AssetLock(datasetRoot),
      ]);
      const plan = buildC5PilotPlan({
        assetLockSha256: stored.assetLockSha256,
        assetRootSha256: current.assetRootSha256,
        baselineCeilingReportSha256: SHA,
        c4ReadinessReportSha256: SHA,
        dataset: loaded.dataset,
        manifestSha256: loaded.manifestSha256,
        materialEffectPercentagePoints: 10,
        orderSeed: 73,
      });

      const adapter = await createC5NativeLiveAdapter({
        dataset: loaded.dataset as Extract<
          typeof loaded.dataset,
          { schemaVersion: 2 }
        >,
        frozenPlan: plan,
        input: {
          ...baseInput(roots),
          datasetRoot,
        },
      });

      expect(typeof adapter.prepareTrajectory).toBe("function");
      expect(await exists(join(roots.sourceRoot, "dataset", "manifest.json")))
        .toBe(true);
      expect(await exists(join(
        roots.sourceRoot,
        "repositories",
        "policy-utils",
        ".git",
      ))).toBe(true);
      expect(await exists(join(
        roots.sourceRoot,
        "repositories",
        "continuity-utils",
        ".git",
      ))).toBe(true);
      expect(await exists(roots.runtimeRoot)).toBe(false);
      expect(await exists(roots.workspaceRoot)).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("runs exactly one frozen cluster as a six-process native lifecycle canary", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c5-live-canary-"));
    try {
      const roots = runRoots(root);
      const loaded = await loadCodexCodingEffectDataset(
        "fixtures/codex-coding-effect/c4-controlled-pilot",
      );
      const plan = buildC5PilotPlan({
        assetLockSha256: SHA,
        assetRootSha256: SHA,
        baselineCeilingReportSha256: SHA,
        c4ReadinessReportSha256: SHA,
        dataset: loaded.dataset,
        manifestSha256: SHA,
        materialEffectPercentagePoints: 10,
        orderSeed: 20260718,
      });
      const planBytes = serializeC5PilotPlan(plan);
      const prepared = new Set<string>();
      const adapter: C5LivePilotAdapter = {
        auditLiveLeakage: async () => ({
          auditSha256: SHA,
          status: "accepted",
        }),
        cleanupTrajectory: async ({ run }) => {
          prepared.delete(run.id);
        },
        evaluatePair: async ({ executions }) => executions.map((execution) => ({
          arm: execution.arm,
          disposition: "finalized" as const,
          evaluationEvidenceSha256: SHA,
          resolved: false,
          taskFailureReasons: ["hidden-fail-to-pass-failed"],
        })),
        executeStage: async ({ run, stage }) => ({
          arm: run.arm,
          codexDurationMs: 100,
          codexStatus: "completed",
          codexUsage: {
            cachedInputTokens: 10,
            inputTokens: 20,
            outputTokens: 5,
          },
          infrastructureFailureStage: null,
          memoryObservation: run.arm === "no-memory"
            ? null
            : {
                injectedRecordCount: 1,
                irrelevantInjection: false,
                recalledPriorMemoryCount: 1,
                writebackCommitted: true,
                writtenMemoryCount: 1,
              },
          memoryChannelStatus: run.arm === "no-memory"
            ? "not-applicable" as const
            : "passed" as const,
          stageEvidenceSha256: SHA,
          stageRunId: stage.id,
          threadId: `thread-${stage.stageRunIdentitySha256}`,
        }),
        prepareTrajectory: async ({ run }) => {
          prepared.add(run.id);
          return { runId: run.id };
        },
        restoreCredential: async () => {},
        revokeCredential: async () => {},
      };
      const clusterId = plan.clusters[0]!.id;
      expect(plan.episodeArmRuns.find((run) => run.clusterId === clusterId)!
        .stages.some((stage) => stage.memoryExpectation === "required")).toBe(true);
      const dependencies = {
        createAdapter: async () => adapter,
        loadDataset: async () => ({ ...loaded, manifestSha256: SHA }),
        loadReadiness: async () => ({
          plan,
          planBytes,
          planSha256: sha256(planBytes),
          prerequisiteEvidenceBytes: "{}\n",
          prerequisiteEvidenceSha256: sha256("{}\n"),
        }),
      };

      const result = await runC5NativeLongitudinalCanary({
        ...baseInput(roots),
        clusterId,
        dependencies,
        orderSeed: 20260718,
      });

      expect(prepared.size).toBe(0);
      expect(result.report).toMatchObject({
        clusterId,
        decision: "accepted",
        pairCount: 3,
        stageExecutionCount: 6,
        taskOutcomeUsedForAcceptance: false,
      });
      expect(lines(await readFile(
        join(roots.outputDirectory, "stage-executions.jsonl"),
        "utf8",
      ))).toHaveLength(6);
      expect(lines(await readFile(
        join(roots.outputDirectory, "pairs.jsonl"),
        "utf8",
      ))).toHaveLength(3);
      expect(JSON.parse(await readFile(
        join(roots.outputDirectory, "canary-report.json"),
        "utf8",
      ))).toEqual(result.report);

      const resumed = await runC5NativeLongitudinalPilot({
        ...baseInput(roots),
        dependencies,
        orderSeed: 20260718,
        resume: true,
      });
      expect(resumed.pilot.stageExecutions).toHaveLength(72);
      expect(resumed.pilot.pairs).toHaveLength(36);
      expect(lines(await readFile(
        join(roots.outputDirectory, "stage-executions.jsonl"),
        "utf8",
      ))).toHaveLength(72);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function baseInput(roots: ReturnType<typeof runRoots>) {
  return {
    authFile: "/not-used/auth.json",
    baselineReportPath: "/not-used/baseline.json",
    baselineStageEvidenceRoot: "/not-used/baseline-stages",
    bunExecutable: "bun",
    c4ReadinessCorePath: "/not-used/c4-core.json",
    c4ReadinessReportPath: "/not-used/c4.json",
    c4ReviewDispatchPath: "/not-used/review/dispatch.json",
    c4ReviewInputBundlePath: "/not-used/review/input-bundle.json",
    c4ReviewProvenancePath: "/not-used/review/provenance.json",
    c4ReviewRequestPath: "/not-used/review/request.md",
    c4ReviewResponsePath: "/not-used/review/independent-review.json",
    codexExecutable: "codex",
    datasetRoot: "fixtures/codex-coding-effect/c4-controlled-pilot",
    generatedAt: "2026-07-16T00:00:00.000Z",
    materialEffectPercentagePoints: 10,
    model: "test-model",
    npmExecutable: "npm",
    orderSeed: 73,
    packageTarball: "/not-used/goodmemory.tgz",
    reasoningEffort: "high",
    runId: "c5-live-test",
    stageTimeoutMs: 1_000,
    testTimeoutMs: 1_000,
    ...roots,
  } as const;
}

function runRoots(root: string) {
  return {
    c4ReadinessWorkspaceRoot: join(root, "c4-readiness"),
    outputDirectory: join(root, "output"),
    runtimeRoot: join(root, "runtime"),
    sourceRoot: join(root, "source"),
    workspaceRoot: join(root, "workspace"),
  };
}

function fakeAdapter(input: { execute(): void }): C5LivePilotAdapter {
  const prepared = new Set<string>();
  return {
    auditLiveLeakage: async () => ({ auditSha256: SHA, status: "accepted" }),
    cleanupTrajectory: async ({ run }) => {
      prepared.delete(run.id);
    },
    evaluatePair: async ({ executions }) => executions.map((execution) => ({
      arm: execution.arm,
      disposition: "finalized" as const,
      evaluationEvidenceSha256: SHA,
      resolved: execution.arm === "goodmemory-installed",
      taskFailureReasons: execution.arm === "goodmemory-installed"
        ? []
        : ["hidden-fail-to-pass-failed"],
    })),
    executeStage: async ({ run, stage }) => {
      input.execute();
      return {
        arm: run.arm,
        codexDurationMs: 100,
        codexStatus: "completed",
        codexUsage: {
          cachedInputTokens: 10,
          inputTokens: 20,
          outputTokens: 5,
        },
        infrastructureFailureStage: null,
        memoryObservation: run.arm === "no-memory" ? null : {
          injectedRecordCount: 0,
          irrelevantInjection: false,
          recalledPriorMemoryCount: 0,
          writebackCommitted: false,
          writtenMemoryCount: 0,
        },
        memoryChannelStatus: run.arm === "no-memory"
          ? "not-applicable" as const
          : "passed" as const,
        stageEvidenceSha256: SHA,
        stageRunId: stage.id,
        threadId: `thread-${stage.stageRunIdentitySha256}`,
      };
    },
    prepareTrajectory: async ({ run }) => {
      prepared.add(run.id);
      return { runId: run.id };
    },
    restoreCredential: async () => {},
    revokeCredential: async () => {},
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function lines(value: string): string[] {
  return value.trim().split("\n").filter((line) => line.length > 0);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
