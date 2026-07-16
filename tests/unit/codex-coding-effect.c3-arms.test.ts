import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  assertPairedArmIsolation,
  auditNoMemoryRuntime,
  buildC3CodexArgs,
  buildFrozenPrehistoryArmPlans,
  buildInstalledGoodMemorySetupArgs,
  evaluateInstalledArmCanary,
  normalizeC3CodexTreatmentArgs,
} from "../../scripts/codex-coding-effect/c3-arms";

describe("Codex coding-effect C3 arm protocol", () => {
  it("allocates unique homes, scopes, workspaces, results, and temp roots", () => {
    const plans = buildFrozenPrehistoryArmPlans({
      episodeId: "episode-001",
      repetition: 1,
      resultRoot: "/tmp/c3/results",
      runId: "c3-run-001",
      runtimeRoot: "/tmp/c3/runtime",
      seed: 7,
      stageId: "stage-2",
      workspaceRoot: "/tmp/c3/workspaces",
    });

    expect(plans.map((plan) => plan.arm)).toEqual([
      "no-memory",
      "goodmemory-installed",
    ]);
    expect(() => assertPairedArmIsolation(plans)).not.toThrow();
    const paths = plans.flatMap((plan) => Object.values(plan.paths));
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(plans.map((plan) => plan.scopes.sessionId)).size).toBe(2);
    expect(new Set(plans.map((plan) => plan.scopes.workspaceId)).size).toBe(2);
    expect(new Set(plans.map((plan) => plan.scopes.userId)).size).toBe(2);
    expect(plans.every((plan) =>
      !basename(plan.paths.workspace).includes(plan.arm)
    )).toBe(true);
  });

  it("rejects path and durable-scope collisions before setup", () => {
    const plans = buildFrozenPrehistoryArmPlans({
      episodeId: "episode-001",
      repetition: 1,
      resultRoot: "/tmp/c3/results",
      runId: "c3-run-001",
      runtimeRoot: "/tmp/c3/runtime",
      seed: 7,
      stageId: "stage-2",
      workspaceRoot: "/tmp/c3/workspaces",
    });
    const collision = [
      plans[0]!,
      {
        ...plans[1]!,
        paths: {
          ...plans[1]!.paths,
          codexHome: plans[0]!.paths.codexHome,
        },
        scopes: {
          ...plans[1]!.scopes,
          workspaceId: plans[0]!.scopes.workspaceId,
        },
      },
    ] as const;

    expect(() => assertPairedArmIsolation(collision)).toThrow(
      "arm paths must be unique",
    );
  });

  it("keeps model, prompt, permissions, and current snapshot args identical", () => {
    const common = {
      model: "gpt-5.6-sol",
      prompt: "Fix the current transport-mode regression.",
      reasoningEffort: "xhigh",
      workspaceRoot: "/tmp/c3/workspaces/episode/stage",
    };
    const noMemory = buildC3CodexArgs({ ...common, arm: "no-memory" });
    const goodMemory = buildC3CodexArgs({
      ...common,
      arm: "goodmemory-installed",
    });

    expect(noMemory).not.toContain("resume");
    expect(goodMemory).not.toContain("resume");
    expect(noMemory).toContain("--disable");
    expect(goodMemory).toContain("--enable");
    expect(goodMemory).toContain("--dangerously-bypass-hook-trust");
    expect(noMemory).not.toContain("--sandbox");
    expect(goodMemory).not.toContain("--sandbox");
    expect(noMemory).not.toContain("-P");
    expect(normalizeC3CodexTreatmentArgs(noMemory)).toEqual(
      normalizeC3CodexTreatmentArgs(goodMemory),
    );
  });

  it("uses isolated global activation without mutating workspace instructions", () => {
    const args = buildInstalledGoodMemorySetupArgs({ userId: "c3-user-001" });

    expect(args).toEqual([
      "setup",
      "--recommended",
      "--host",
      "codex",
      "--user-id",
      "c3-user-001",
      "--yes",
      "--json",
    ]);
    expect(args).not.toContain("enable");
    expect(args).not.toContain("workspace_opt_in");
  });

  it("proves no-memory starts with no hooks, MCP, GoodMemory files, or sessions", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-c3-no-memory-"));
    try {
      const home = join(root, "home");
      const codexHome = join(home, ".codex");
      await mkdir(codexHome, { recursive: true });
      await writeFile(join(codexHome, "auth.json"), "{}\n", "utf8");

      const audit = await auditNoMemoryRuntime({ codexHome, home });
      expect(audit).toEqual({
        codexHomeEntryNames: ["auth.json"],
        goodMemoryFileCount: 0,
        hookConfigPresent: false,
        mcpConfigPresent: false,
        passed: true,
        preexistingSessionCount: 0,
        reasons: [],
      });

      await writeFile(join(codexHome, "hooks.json"), "{}\n", "utf8");
      const failed = await auditNoMemoryRuntime({ codexHome, home });
      expect(failed.passed).toBe(false);
      expect(failed.reasons).toContain("Codex hooks.json is present");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails the installed arm canary instead of treating missing memory as no-memory", () => {
    const base = {
      expectedMemoryIds: ["memory-001"],
      hostStatus: {
        activationMode: "global",
        hookRegistered: true,
        mcpRegistered: true,
        persistRawTranscript: false,
        workspaceStatus: "ok",
        writebackMode: "selective",
      },
      injectionEvents: [{
        command: "user-prompt-submit" as const,
        decision: "injected" as const,
        recordIds: ["memory-001"],
        sessionDigest: "session:current",
      }],
      preexistingSessionCount: 0,
      sessionDigest: "session:current",
      stopCursorSessionDigests: ["session:current"],
      threadId: "thread-current",
      writebackEvents: [{
        command: "turn-end",
        contentPreview: "Next step is to add transport metrics.",
        linkedRecordIds: [{ id: "memory-next", type: "memory" }],
        recallHitCount: 0,
        recalledBy: [],
        sessionDigest: "session:current",
        status: "committed",
      }],
    };

    expect(evaluateInstalledArmCanary(base)).toEqual({
      failureStage: null,
      injectedExpectedMemoryIds: ["memory-001"],
      passed: true,
      reasons: [],
      stopCursorAdvanced: true,
      terminalWritebackStatuses: ["committed"],
    });
    expect(evaluateInstalledArmCanary({
      ...base,
      injectionEvents: [],
    })).toEqual({
      failureStage: "goodmemory-injection",
      injectedExpectedMemoryIds: [],
      passed: false,
      reasons: ["expected frozen-prehistory memory was not injected"],
      stopCursorAdvanced: true,
      terminalWritebackStatuses: ["committed"],
    });
    expect(evaluateInstalledArmCanary({
      ...base,
      writebackEvents: [],
    })).toMatchObject({
      failureStage: "goodmemory-stop",
      passed: false,
      reasons: ["native Stop has no terminal writeback audit event"],
      terminalWritebackStatuses: [],
    });
    expect(evaluateInstalledArmCanary({
      ...base,
      writebackEvents: [{
        ...base.writebackEvents[0]!,
        command: "session-end",
      }],
    })).toMatchObject({
      failureStage: "goodmemory-stop",
      passed: false,
      terminalWritebackStatuses: [],
    });
  });
});
