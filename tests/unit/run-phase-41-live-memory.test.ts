import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPhase41LiveMemoryRunId,
  parsePhase41LiveMemoryCliOptions,
  resolvePhase41LiveMemoryOutputDir,
  runPhase41LiveMemoryEvaluation,
} from "../../scripts/run-phase-41-live-memory";

describe("run-phase-41 live-memory script", () => {
  it("resolves the phase-41 live-memory output directory", () => {
    expect(resolvePhase41LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-41",
    );
  });

  it("builds a deterministic phase-41 live run id", () => {
    expect(buildPhase41LiveMemoryRunId("2026-04-25T20:30:45.000Z")).toBe(
      "run-20260425203045",
    );
  });

  it("parses phase-41 live-memory cli flags", () => {
    expect(
      parsePhase41LiveMemoryCliOptions([
        "bun",
        "run",
        "scripts/run-phase-41-live-memory.ts",
        "--output-dir",
        "/tmp/phase41-live",
        "--run-id",
        "run-phase41-live-test",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase41-live",
      runId: "run-phase41-live-test",
    });
  });

  it("writes an accepted installed-package Codex pre-action live report", async () => {
    const packDir = await mkdtemp(join(tmpdir(), "goodmemory-phase41-live-pack-"));
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase41-live-workspace-"),
    );
    const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-phase41-live-home-"));
    const outputDir = await mkdtemp(join(tmpdir(), "goodmemory-phase41-live-output-"));
    let tempDirCall = 0;

    try {
      const report = await runPhase41LiveMemoryEvaluation(
        {
          outputDir,
          runId: "run-phase41-live-test",
        },
        {
          ensureDir: async (path) => {
            await mkdir(path, { recursive: true });
          },
          makeTempDir: async () => {
            tempDirCall += 1;
            if (tempDirCall === 1) {
              return packDir;
            }
            if (tempDirCall === 2) {
              return workspaceRoot;
            }
            return homeRoot;
          },
          now: () => "2026-04-25T20:30:45.000Z",
          readTextFile: async (path) => readFile(path, "utf8"),
          removeDir: async (path, options) => {
            await rm(path, { force: options?.force, recursive: options?.recursive });
          },
          runCommand: async (command) => {
            if (command.label === "pack-tarball") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: join(packDir, "goodmemory-0.0.0.tgz"),
              };
            }

            if (command.label === "install-tarball") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: "installed",
              };
            }

            if (command.label === "codex-install") {
              await mkdir(join(homeRoot, ".codex"), { recursive: true });
              await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
              await writeFile(
                join(homeRoot, ".goodmemory/codex.json"),
                JSON.stringify(
                  {
                    host: "codex",
                    storage: {
                      path: join(homeRoot, ".goodmemory/memory.sqlite"),
                      provider: "sqlite",
                    },
                    userId: "consumer-user",
                    version: 1,
                  },
                  null,
                  2,
                ) + "\n",
                "utf8",
              );
              await writeFile(
                join(homeRoot, ".codex/hooks.json"),
                JSON.stringify(
                  {
                    hooks: {
                      PreToolUse: [
                        {
                          matcher: "Bash",
                          hooks: [
                            {
                              command:
                                `GOODMEMORY_HOME='${homeRoot}' GOODMEMORY_MANAGED_BY='goodmemory' goodmemory codex hook pre-tool-use`,
                              type: "command",
                            },
                          ],
                        },
                      ],
                    },
                  },
                  null,
                  2,
                ) + "\n",
                "utf8",
              );

              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({ host: "codex" }),
              };
            }

            if (command.label === "codex-enable") {
              await mkdir(join(workspaceRoot, ".goodmemory"), { recursive: true });
              await writeFile(
                join(workspaceRoot, ".goodmemory/codex.json"),
                JSON.stringify(
                  {
                    enabled: true,
                    host: "codex",
                    version: 1,
                    workspaceId: "consumer-workspace",
                  },
                  null,
                  2,
                ) + "\n",
                "utf8",
              );
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({ host: "codex" }),
              };
            }

            if (command.label === "seed-installed-memory") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({ ok: true }),
              };
            }

            if (command.label === "codex-hook-pre-tool-use-deepanalyzer") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason:
                      "Rather than DeepAnalyzer, use QuickCheck first. Run this instead: GOODMEMORY_HOME='"
                      + homeRoot
                      + "' GOODMEMORY_MANAGED_BY='goodmemory' goodmemory codex action --session-id 'consumer-session' --action-id 'goodmemory-installed-pretool-abc123' --turn-id 'goodmemory-installed-pretool-turn' --sequence 0 --command './tools/DeepAnalyzer --detailed'",
                  },
                }),
              };
            }

            if (command.label === "codex-action-deepanalyzer") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({
                  actionId: "goodmemory-installed-pretool-abc123",
                  decision: "review_required",
                  executed: true,
                  executedStep: "./tools/QuickCheck",
                  rewritten: true,
                }),
              };
            }

            if (command.label === "codex-hook-pre-tool-use-destructive") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason:
                      "Never delete AGENTS.md from the host bootstrap surface. Run this instead: GOODMEMORY_HOME='"
                      + homeRoot
                      + "' GOODMEMORY_MANAGED_BY='goodmemory' goodmemory codex action --session-id 'consumer-session' --action-id 'goodmemory-installed-pretool-def456' --turn-id 'goodmemory-installed-pretool-turn' --sequence 0 --command 'rm -rf AGENTS.md'",
                  },
                }),
              };
            }

            if (command.label === "codex-action-destructive") {
              return {
                durationMs: 10,
                exitCode: 2,
                stderr: "",
                stdout: JSON.stringify({
                  actionId: "goodmemory-installed-pretool-def456",
                  decision: "blocked",
                  executed: false,
                  rewritten: false,
                }),
              };
            }

            if (command.label === "codex-hook-pre-tool-use-low-risk") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: "{}",
              };
            }

            if (command.label === "inspect-installed-storage") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({
                  actionTraceRecorded: true,
                  followupTraceRecorded: true,
                  sharedInstalledStorage: true,
                  toolResultEvidenceRecorded: true,
                }),
              };
            }

            throw new Error(`Unexpected command label: ${command.label}`);
          },
          writeTextFile: async (path, content) => {
            await writeFile(path, content, "utf8");
          },
        },
      );

      expect(report.phase).toBe("phase-41");
      expect(report.mode).toBe("live-memory");
      expect(report.runId).toBe("run-phase41-live-test");
      expect(report.acceptance.decision).toBe("accepted");
      expect(report.evidence.install.registeredPreToolUseMatchesManagedConfig).toBe(true);
      expect(report.evidence.install.repoOptInEnabled).toBe(true);
      expect(report.evidence.preAction).toEqual({
        deepAnalyzerDenied: true,
        deepAnalyzerExecutedStep: "./tools/QuickCheck",
        destructiveVetoed: true,
        lowRiskAllowed: true,
        sharedInstalledStorage: true,
      });
      expect(report.evidence.releaseContract.distribution).toBe("tarball-first");
      expect(report.evidenceContract.phase41.runtimePath).toBe(
        "installed_package_pretooluse_and_action_bridge",
      );
      expect(
        report.commands.map((command) => command.label),
      ).toEqual([
        "pack-tarball",
        "install-tarball",
        "codex-install",
        "codex-enable",
        "seed-installed-memory",
        "codex-hook-pre-tool-use-deepanalyzer",
        "codex-action-deepanalyzer",
        "codex-hook-pre-tool-use-destructive",
        "codex-action-destructive",
        "codex-hook-pre-tool-use-low-risk",
        "inspect-installed-storage",
      ]);
      const written = JSON.parse(
        await readFile(
          join(outputDir, "run-phase41-live-test", "report.json"),
          "utf8",
        ),
      );
      expect(written).toEqual(report);
    } finally {
      await rm(packDir, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
      await rm(homeRoot, { force: true, recursive: true });
      await rm(outputDir, { force: true, recursive: true });
    }
  });
});
