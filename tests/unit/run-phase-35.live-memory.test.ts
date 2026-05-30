import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePhase35LiveMemoryCliOptions,
  resolvePhase35LiveMemoryOutputDir,
  runPhase35LiveMemoryEvaluation,
} from "../../scripts/run-phase-35-live-memory";

describe("run-phase-35 live-memory script", () => {
  it("resolves the phase-35 live-memory output directory", () => {
    expect(resolvePhase35LiveMemoryOutputDir("/tmp/goodmemory")).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-35",
    );
  });

  it("parses phase-35 live-memory cli flags", () => {
    expect(
      parsePhase35LiveMemoryCliOptions([
        "bun",
        "run",
        "scripts/run-phase-35-live-memory.ts",
        "--output-dir",
        "/tmp/phase35-live",
        "--run-id",
        "run-phase35-live-test",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase35-live",
      runId: "run-phase35-live-test",
    });
  });

  it("writes an accepted installed-package Codex middleware live report", async () => {
    const packDir = await mkdtemp(join(tmpdir(), "goodmemory-phase35-live-pack-"));
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase35-live-workspace-"),
    );
    const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-phase35-live-home-"));
    const outputDir = await mkdtemp(join(tmpdir(), "goodmemory-phase35-live-output-"));
    let tempDirCall = 0;

    try {
      const report = await runPhase35LiveMemoryEvaluation(
        {
          outputDir,
          runId: "run-phase35-live-test",
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
          now: () => "2026-04-23T19:00:00.000Z",
          probeMcp: async () => ({
            context: {
              content:
                "Use short next-step bullets in coding summaries. The deploy is blocked on smoke verification.",
            },
            stats: {
              counts: {
                facts: 2,
                feedback: 1,
              },
            },
          }),
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
                join(homeRoot, ".codex/config.toml"),
                [
                  "[mcp_servers.goodmemory]",
                  'command = "goodmemory-mcp"',
                  'args = ["--host", "codex"]',
                  "[mcp_servers.goodmemory.env]",
                  `GOODMEMORY_HOME = ${JSON.stringify(homeRoot)}`,
                  'GOODMEMORY_MANAGED_BY = "goodmemory"',
                  "",
                  "[features]",
                  "hooks = true",
                  "",
                ].join("\n"),
                "utf8",
              );
              await writeFile(
                join(homeRoot, ".codex/hooks.json"),
                JSON.stringify(
                  {
                    hooks: {
                      SessionStart: [
                        {
                          matcher: "startup|resume|clear|compact",
                          hooks: [
                            {
                              command:
                                `GOODMEMORY_HOME='${homeRoot}' GOODMEMORY_MANAGED_BY='goodmemory' goodmemory codex hook session-start`,
                              type: "command",
                            },
                          ],
                        },
                      ],
                      UserPromptSubmit: [
                        {
                          hooks: [
                            {
                              command:
                                `GOODMEMORY_HOME='${homeRoot}' GOODMEMORY_MANAGED_BY='goodmemory' goodmemory codex hook user-prompt-submit`,
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

            if (command.label === "seed-runtime-continuity") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({ ok: true }),
              };
            }

            if (
              command.label === "seed-continuity" ||
              command.label === "seed-summary-rule" ||
              command.label === "seed-deploy-blocker"
            ) {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({ ok: true }),
              };
            }

            if (command.label === "codex-hook-session-start") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({
                  hookSpecificOutput: {
                    additionalContext:
                      "Finish the phase 35 middleware closeout. Archive the canonical phase 35 quality gate.",
                  },
                }),
              };
            }

            if (command.label === "codex-hook-user-prompt-submit") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({
                  hookSpecificOutput: {
                    additionalContext:
                      "Use short next-step bullets in coding summaries. The deploy is blocked on smoke verification.",
                  },
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

      expect(report.phase).toBe("phase-35");
      expect(report.mode).toBe("live-memory");
      expect(report.runId).toBe("run-phase35-live-test");
      expect(report.acceptance.decision).toBe("accepted");
      expect(report.evidence.hooks.installRegistersHooks).toBe(true);
      expect(report.evidence.hooks.sessionStart.matchedExpectedFieldCount).toBe(2);
      expect(
        report.evidence.hooks.sessionStart.registeredCommandMatchesManagedConfig,
      ).toBe(true);
      expect(report.evidence.hooks.userPromptSubmit.matchedExpectedFieldCount).toBe(2);
      expect(
        report.evidence.hooks.userPromptSubmit.registeredCommandMatchesManagedConfig,
      ).toBe(true);
      expect(report.evidence.mcp.installRegistersMcp).toBe(true);
      expect(report.evidence.mcp.registeredCommandMatchesManagedConfig).toBe(true);
      expect(report.evidence.mcp.contextIncludesSummaryRule).toBe(true);
      expect(report.evidence.mcp.contextIncludesBlocker).toBe(true);
      expect(report.evidence.repoOptIn).toEqual({
        enabled: true,
        workspaceId: "consumer-workspace",
      });
      expect(await readFile(join(outputDir, "run-phase35-live-test/report.json"), "utf8")).toContain(
        "\"phase\": \"phase-35\"",
      );
    } finally {
      await rm(packDir, { recursive: true, force: true });
      await rm(homeRoot, { recursive: true, force: true });
      await rm(outputDir, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("blocks when the installed host config registers broken hook and MCP commands", async () => {
    const packDir = await mkdtemp(join(tmpdir(), "goodmemory-phase35-live-pack-"));
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase35-live-workspace-"),
    );
    const homeRoot = await mkdtemp(join(tmpdir(), "goodmemory-phase35-live-home-"));
    const outputDir = await mkdtemp(join(tmpdir(), "goodmemory-phase35-live-output-"));
    let tempDirCall = 0;

    try {
      const report = await runPhase35LiveMemoryEvaluation(
        {
          outputDir,
          runId: "run-phase35-live-broken-config",
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
          now: () => "2026-04-23T19:00:00.000Z",
          probeMcp: async () => ({
            context: {
              content:
                "Use short next-step bullets in coding summaries. The deploy is blocked on smoke verification.",
            },
            stats: {
              counts: {
                facts: 2,
              },
            },
          }),
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
                join(homeRoot, ".codex/config.toml"),
                [
                  "[mcp_servers.goodmemory]",
                  'command = "definitely-wrong-goodmemory-mcp"',
                  'args = ["--host", "codex"]',
                  "[mcp_servers.goodmemory.env]",
                  `GOODMEMORY_HOME = ${JSON.stringify(homeRoot)}`,
                  'GOODMEMORY_MANAGED_BY = "goodmemory"',
                  "",
                  "[features]",
                  "hooks = true",
                  "",
                ].join("\n"),
                "utf8",
              );
              await writeFile(
                join(homeRoot, ".codex/hooks.json"),
                JSON.stringify(
                  {
                    hooks: {
                      SessionStart: [
                        {
                          hooks: [
                            {
                              command:
                                "GOODMEMORY_MANAGED_BY='goodmemory' definitely-wrong-goodmemory codex hook session-start",
                              type: "command",
                            },
                          ],
                        },
                      ],
                      UserPromptSubmit: [
                        {
                          hooks: [
                            {
                              command:
                                "GOODMEMORY_MANAGED_BY='goodmemory' definitely-wrong-goodmemory codex hook user-prompt-submit",
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

            if (
              command.label === "seed-runtime-continuity" ||
              command.label === "seed-continuity" ||
              command.label === "seed-summary-rule" ||
              command.label === "seed-deploy-blocker"
            ) {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({ ok: true }),
              };
            }

            if (
              command.label === "codex-hook-session-start" ||
              command.label === "codex-hook-user-prompt-submit"
            ) {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({
                  hookSpecificOutput: {
                    additionalContext:
                      "Use short next-step bullets in coding summaries. The deploy is blocked on smoke verification. Finish the phase 35 middleware closeout. Archive the canonical phase 35 quality gate.",
                  },
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

      expect(report.acceptance.decision).toBe("blocked");
      expect(report.evidence.hooks.installRegistersHooks).toBe(false);
      expect(report.evidence.mcp.installRegistersMcp).toBe(false);
    } finally {
      await rm(packDir, { recursive: true, force: true });
      await rm(homeRoot, { recursive: true, force: true });
      await rm(outputDir, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
