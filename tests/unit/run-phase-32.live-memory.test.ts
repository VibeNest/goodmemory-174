import { describe, expect, it } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePhase32LiveMemoryCliOptions,
  resolvePhase32LiveMemoryOutputDir,
  runPhase32LiveMemoryCli,
  runPhase32LiveMemoryEvaluation,
} from "../../scripts/run-phase-32-live-memory";

const ROOT = "/tmp/goodmemory";

function createMeasuredVariant(input: {
  artifactReadCommands: string[];
  hostExitCode?: number;
  matchedExpectedFieldCount: number;
  observedResponse: Record<string, string>;
  traceBacked?: boolean;
  traceEventCount?: number;
}) {
  return {
    artifactReadCommands: input.artifactReadCommands,
    hostExitCode: input.hostExitCode ?? 0,
    matchedExpectedFieldCount: input.matchedExpectedFieldCount,
    observedResponse: input.observedResponse,
    traceBacked: input.traceBacked ?? true,
    traceEventCount: input.traceEventCount ?? 4,
  };
}

describe("run-phase-32 live-memory script", () => {
  it("resolves the phase-32 live-memory output directory", () => {
    expect(resolvePhase32LiveMemoryOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-32",
    );
  });

  it("parses phase-32 live-memory cli flags", () => {
    expect(
      parsePhase32LiveMemoryCliOptions([
        "bun",
        "run",
        "scripts/run-phase-32-live-memory.ts",
        "--output-dir",
        "/tmp/phase32-live",
        "--run-id",
        "run-phase32-live-test",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase32-live",
      runId: "run-phase32-live-test",
    });
  });

  it("writes an accepted report when the installed-package Codex path reads exported guidance", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-workspace-"),
    );
    const packRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-pack-"),
    );
    const outputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-output-"),
    );
    const writes: string[] = [];
    let turnIndex = 0;

    try {
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-bootstrap-package-smoke",
            private: true,
            dependencies: {
              goodmemory: "__GOODMEMORY_PACKAGE_SPEC__",
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await mkdir(join(workspaceRoot, ".goodmemory", "hosts", "codex"), {
        recursive: true,
      });

      const report = await runPhase32LiveMemoryEvaluation(
        {
          outputDir,
          runId: "run-phase32-live-test",
        },
        {
          copyDir: async () => {},
          ensureDir: async (path) => {
            await mkdir(path, { recursive: true });
          },
          makeTempDir: async (prefix) =>
            prefix.includes("pack") ? packRoot : workspaceRoot,
          now: () => "2026-04-22T19:00:00.000Z",
          readTextFile: async (path) => readFile(path, "utf8"),
          removeDir: async () => {},
          runCommand: async (command) => {
            if (command.label === "pack-tarball") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: "/tmp/pack/goodmemory-0.1.0-rc.1.tgz\n",
              };
            }

            if (command.label.startsWith("codex-export")) {
              const manifestPath = join(
                workspaceRoot,
                ".goodmemory/hosts/codex/export-manifest.json",
              );
              await mkdir(join(workspaceRoot, ".goodmemory/hosts/codex/session-memory"), {
                recursive: true,
              });
              await writeFile(
                manifestPath,
                JSON.stringify(
                  {
                    artifacts: [
                      { relativePath: "MEMORY.md" },
                      { relativePath: "session-memory/current.md" },
                    ],
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
                stdout: JSON.stringify({
                  artifactCount: 2,
                }),
              };
            }

            return {
              durationMs: 10,
              exitCode: 0,
              stderr: "",
              stdout: "ok",
            };
          },
          runCodexHostTurn: async () => {
            turnIndex += 1;
            const caseIndex = (turnIndex - 1) % 3;
            const variantIndex = Math.floor((turnIndex - 1) / 3);

            if (caseIndex === 0) {
              return {
                events: [
                  {
                    type: "item.completed",
                    item: {
                      id: "item_1",
                      type: "command_execution",
                      command:
                        "/bin/zsh -lc \"rg -n --hidden --glob 'current.md' --glob 'MEMORY.md' '' ./.goodmemory/hosts/codex\"",
                      exit_code: 0,
                    },
                  },
                  {
                    type: "item.completed",
                    item: {
                      id: "item_2",
                      type: "agent_message",
                      text: JSON.stringify(
                        variantIndex === 2
                          ? {}
                          : {
                              currentGoal: "Finish the bootstrap smoke path",
                              openLoop: "Verify exported session handoff",
                            },
                      ),
                    },
                  },
                ],
                exitCode: 0,
                stderr: "",
                stdout: "{\"type\":\"item.completed\"}\n",
              };
            }

            if (caseIndex === 1) {
              return {
                events: [
                  {
                    type: "item.completed",
                    item: {
                      id: "item_3",
                      type: "command_execution",
                      command:
                        "/bin/zsh -lc \"sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md\"",
                      exit_code: 0,
                    },
                  },
                  {
                    type: "item.completed",
                    item: {
                      id: "item_4",
                      type: "agent_message",
                      text: JSON.stringify(
                        variantIndex === 2
                          ? {}
                          : {
                              summaryRule:
                                "Keep coding summaries short and list explicit next steps.",
                            },
                      ),
                    },
                  },
                ],
                exitCode: 0,
                stderr: "",
                stdout: "{\"type\":\"item.completed\"}\n",
              };
            }

            return {
              events: [
                {
                  type: "item.completed",
                  item: {
                    id: "item_5",
                    type: "command_execution",
                    command:
                      "/bin/zsh -lc \"sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md\"",
                    exit_code: 0,
                  },
                },
                {
                  type: "item.completed",
                  item: {
                    id: "item_6",
                    type: "command_execution",
                    command:
                      "/bin/zsh -lc \"sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md\"",
                    exit_code: 0,
                  },
                },
                {
                  type: "item.completed",
                  item: {
                    id: "item_7",
                    type: "agent_message",
                    text: JSON.stringify(
                      variantIndex === 2
                        ? {}
                        : {
                            blocker: "the deploy is blocked on smoke verification.",
                            bootstrapRule: "Use packaged CLI bootstrap only.",
                          },
                    ),
                  },
                },
              ],
              exitCode: 0,
              stderr: "",
              stdout: "{\"type\":\"item.completed\"}\n",
            };
          },
          writeTextFile: async (path, content) => {
            writes.push(path);
            await writeFile(path, content, "utf8");
          },
        },
      );

      expect(report.acceptance.decision).toBe("accepted");
      expect(report.comparison.cases).toHaveLength(3);
      expect(
        report.comparison.cases.every(
          (caseResult) =>
            caseResult.nonRegressionAgainstTextOnly && caseResult.winOverNoMemory,
        ),
      ).toBe(true);
      expect(report.evidence.host.traceBacked).toBe(true);
      expect(report.evidence.host.manifestPath).toBe(
        ".goodmemory/hosts/codex/export-manifest.json",
      );
      expect(report.evidence.host.exportedArtifactPaths).toEqual(
        [
          ".goodmemory/hosts/codex/MEMORY.md",
          ".goodmemory/hosts/codex/session-memory/current.md",
        ].sort(),
      );
      expect(
        report.comparison.cases.every(
          (caseResult) =>
            caseResult.eventBacked.hostExitCode === 0 &&
            caseResult.textOnly.hostExitCode === 0 &&
            caseResult.noMemory.hostExitCode === 0,
        ),
      ).toBe(true);
      expect(writes.at(-1)).toBe(
        join(outputDir, "run-phase32-live-test", "report.json"),
      );
    } finally {
      await rm(packRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
      await rm(outputDir, { force: true, recursive: true });
    }
  });

  it("blocks when native Codex host events do not prove an exported artifact read", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-blocked-"),
    );
    const packRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-blocked-pack-"),
    );
    const outputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-blocked-output-"),
    );
    let turnIndex = 0;

    try {
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-bootstrap-package-smoke",
            private: true,
            dependencies: {
              goodmemory: "__GOODMEMORY_PACKAGE_SPEC__",
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await mkdir(join(workspaceRoot, ".goodmemory", "hosts", "codex"), {
        recursive: true,
      });

      const report = await runPhase32LiveMemoryEvaluation(
        {
          outputDir,
          runId: "run-phase32-live-test",
        },
        {
          copyDir: async () => {},
          ensureDir: async (path) => {
            await mkdir(path, { recursive: true });
          },
          makeTempDir: async (prefix) =>
            prefix.includes("pack") ? packRoot : workspaceRoot,
          readTextFile: async (path) => readFile(path, "utf8"),
          removeDir: async () => {},
          runCommand: async (command) => {
            if (command.label === "pack-tarball") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: "/tmp/pack/goodmemory-0.1.0-rc.1.tgz\n",
              };
            }

            if (command.label.startsWith("codex-export")) {
              const manifestPath = join(
                workspaceRoot,
                ".goodmemory/hosts/codex/export-manifest.json",
              );
              await mkdir(join(workspaceRoot, ".goodmemory/hosts/codex/session-memory"), {
                recursive: true,
              });
              await writeFile(
                manifestPath,
                JSON.stringify(
                  {
                    artifacts: [
                      { relativePath: "MEMORY.md" },
                      { relativePath: "session-memory/current.md" },
                    ],
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
                stdout: JSON.stringify({
                  artifactCount: 2,
                }),
              };
            }

            return {
              durationMs: 10,
              exitCode: 0,
              stderr: "",
              stdout: "ok",
            };
          },
          runCodexHostTurn: async () => {
            turnIndex += 1;
            const caseIndex = (turnIndex - 1) % 3;

            if (caseIndex === 0) {
              return {
                events: [
                  {
                    type: "item.completed",
                    item: {
                      id: "item_1",
                      type: "command_execution",
                      command: "/bin/zsh -lc \"sed -n '1,220p' ./AGENTS.md\"",
                      exit_code: 0,
                    },
                  },
                  {
                    type: "item.completed",
                    item: {
                      id: "item_2",
                      type: "agent_message",
                      text: JSON.stringify({
                        currentGoal: "Finish the bootstrap smoke path",
                        openLoop: "Verify exported session handoff",
                      }),
                    },
                  },
                ],
                exitCode: 0,
                stderr: "",
                stdout: "{\"type\":\"item.completed\"}\n",
              };
            }

            if (caseIndex === 1) {
              return {
                events: [
                  {
                    type: "item.completed",
                    item: {
                      id: "item_3",
                      type: "command_execution",
                      command: "/bin/zsh -lc \"sed -n '1,220p' ./AGENTS.md\"",
                      exit_code: 0,
                    },
                  },
                  {
                    type: "item.completed",
                    item: {
                      id: "item_4",
                      type: "agent_message",
                      text: JSON.stringify({
                        summaryRule: "Keep coding summaries short and list explicit next steps.",
                      }),
                    },
                  },
                ],
                exitCode: 0,
                stderr: "",
                stdout: "{\"type\":\"item.completed\"}\n",
              };
            }

            return {
              events: [
                {
                  type: "item.completed",
                  item: {
                    id: "item_5",
                    type: "command_execution",
                    command: "/bin/zsh -lc \"sed -n '1,220p' ./AGENTS.md\"",
                    exit_code: 0,
                  },
                },
                {
                  type: "item.completed",
                  item: {
                    id: "item_6",
                    type: "agent_message",
                    text: JSON.stringify({
                      blocker: "the deploy is blocked on smoke verification.",
                      bootstrapRule: "Use packaged CLI bootstrap only.",
                    }),
                  },
                },
              ],
              exitCode: 0,
              stderr: "",
              stdout: "{\"type\":\"item.completed\"}\n",
            };
          },
          writeTextFile: async (path, content) => {
            await writeFile(path, content, "utf8");
          },
        },
      );

      expect(report.acceptance.decision).toBe("blocked");
      expect(report.acceptance.reason).toContain("did not prove a read");
      expect(report.evidence.host.traceBacked).toBe(false);
    } finally {
      await rm(packRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
      await rm(outputDir, { force: true, recursive: true });
    }
  });

  it("measures live text-only and no-memory baselines instead of synthesizing comparison booleans", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-measured-"),
    );
    const packRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-measured-pack-"),
    );
    const outputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-measured-output-"),
    );
    const turnCalls: string[] = [];

    try {
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-bootstrap-package-smoke",
            private: true,
            dependencies: {
              goodmemory: "__GOODMEMORY_PACKAGE_SPEC__",
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await mkdir(join(workspaceRoot, ".goodmemory", "hosts", "codex"), {
        recursive: true,
      });

      const report = await runPhase32LiveMemoryEvaluation(
        {
          outputDir,
          runId: "run-phase32-live-test",
        },
        {
          copyDir: async () => {},
          ensureDir: async (path) => {
            await mkdir(path, { recursive: true });
          },
          makeTempDir: async (prefix) =>
            prefix.includes("pack") ? packRoot : workspaceRoot,
          now: () => "2026-04-22T19:00:00.000Z",
          readTextFile: async (path) => readFile(path, "utf8"),
          removeDir: async () => {},
          runCommand: async (command) => {
            if (command.label === "pack-tarball") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: "/tmp/pack/goodmemory-0.1.0-rc.1.tgz\n",
              };
            }

            if (command.label.startsWith("codex-export")) {
              await mkdir(join(workspaceRoot, ".goodmemory/hosts/codex/session-memory"), {
                recursive: true,
              });
              await writeFile(
                join(workspaceRoot, ".goodmemory/hosts/codex/export-manifest.json"),
                JSON.stringify(
                  {
                    artifacts: [
                      { relativePath: "MEMORY.md" },
                      { relativePath: "session-memory/current.md" },
                    ],
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
                stdout: JSON.stringify({
                  artifactCount: 2,
                }),
              };
            }

            return {
              durationMs: 10,
              exitCode: 0,
              stderr: "",
              stdout: "ok",
            };
          },
          runCodexHostTurn: async () => {
            const turnIndex = turnCalls.length;
            const caseIndex = turnIndex % 3;
            const variantIndex = Math.floor(turnIndex / 3);
            turnCalls.push(`turn-${turnIndex}`);

            if (caseIndex === 0) {
              return {
                events: [
                  {
                    type: "item.completed",
                    item: {
                      id: `item-${turnCalls.length}`,
                      type: "command_execution",
                      command:
                        "/bin/zsh -lc \"sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md\"",
                      exit_code: 0,
                    },
                  },
                  {
                    type: "item.completed",
                    item: {
                      id: `message-${turnCalls.length}`,
                      type: "agent_message",
                      text: JSON.stringify(
                        variantIndex === 0
                          ? {
                              currentGoal: "Finish the bootstrap smoke path",
                              openLoop: "Verify exported session handoff",
                            }
                          : variantIndex === 1
                            ? {
                                currentGoal: "Finish the bootstrap smoke path",
                              }
                            : {},
                      ),
                    },
                  },
                ],
                exitCode: 0,
                stderr: "",
                stdout: "{\"type\":\"item.completed\"}\n",
              };
            }

            if (caseIndex === 1) {
              return {
                events: [
                  {
                    type: "item.completed",
                    item: {
                      id: `item-${turnCalls.length}`,
                      type: "command_execution",
                      command:
                        "/bin/zsh -lc \"sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md\"",
                      exit_code: 0,
                    },
                  },
                  {
                    type: "item.completed",
                    item: {
                      id: `message-${turnCalls.length}`,
                      type: "agent_message",
                      text: JSON.stringify(
                        variantIndex === 2
                          ? {}
                          : {
                              summaryRule:
                                "Keep coding summaries short and list explicit next steps.",
                            },
                      ),
                    },
                  },
                ],
                exitCode: 0,
                stderr: "",
                stdout: "{\"type\":\"item.completed\"}\n",
              };
            }

            return {
              events: [
                {
                  type: "item.completed",
                  item: {
                    id: `item-${turnCalls.length}`,
                    type: "command_execution",
                    command:
                      "/bin/zsh -lc \"sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md\"",
                    exit_code: 0,
                  },
                },
                {
                  type: "item.completed",
                  item: {
                    id: `item-memory-${turnCalls.length}`,
                    type: "command_execution",
                    command:
                      "/bin/zsh -lc \"sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md\"",
                    exit_code: 0,
                  },
                },
                {
                  type: "item.completed",
                  item: {
                    id: `message-${turnCalls.length}`,
                    type: "agent_message",
                    text: JSON.stringify(
                      variantIndex === 0
                        ? {
                            blocker: "the deploy is blocked on smoke verification.",
                            bootstrapRule: "Use packaged CLI bootstrap only.",
                          }
                        : variantIndex === 1
                          ? {
                              bootstrapRule: "Use packaged CLI bootstrap only.",
                            }
                          : {},
                    ),
                  },
                },
              ],
              exitCode: 0,
              stderr: "",
              stdout: "{\"type\":\"item.completed\"}\n",
            };
          },
          writeTextFile: async (path, content) => {
            await writeFile(path, content, "utf8");
          },
        },
      );

      expect(turnCalls).toHaveLength(9);
      expect(report.comparison.cases[0]).toMatchObject({
        caseId: "continuity-open-loop",
        eventBacked: {
          matchedExpectedFieldCount: 2,
        },
        nonRegressionAgainstTextOnly: true,
        noMemory: {
          matchedExpectedFieldCount: 0,
        },
        textOnly: {
          matchedExpectedFieldCount: 1,
        },
        winOverNoMemory: true,
      });
      expect(report.comparison.cases[1]).toMatchObject({
        caseId: "repeated-correction",
        eventBacked: {
          matchedExpectedFieldCount: 1,
        },
        textOnly: {
          matchedExpectedFieldCount: 1,
        },
        noMemory: {
          matchedExpectedFieldCount: 0,
        },
        nonRegressionAgainstTextOnly: true,
        winOverNoMemory: true,
      });
    } finally {
      await rm(packRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
      await rm(outputDir, { force: true, recursive: true });
    }
  });

  it("fails closed when required guidance paths are missing from export-manifest.json", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-manifest-blocked-"),
    );
    const packRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-manifest-blocked-pack-"),
    );
    const outputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-manifest-blocked-output-"),
    );

    try {
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-bootstrap-package-smoke",
            private: true,
            dependencies: {
              goodmemory: "__GOODMEMORY_PACKAGE_SPEC__",
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await mkdir(join(workspaceRoot, ".goodmemory", "hosts", "codex", "session-memory"), {
        recursive: true,
      });
      await writeFile(
        join(workspaceRoot, ".goodmemory/hosts/codex/MEMORY.md"),
        "# MEMORY\n",
        "utf8",
      );
      await writeFile(
        join(workspaceRoot, ".goodmemory/hosts/codex/session-memory/current.md"),
        "# Session Handoff\n",
        "utf8",
      );

      await expect(
        runPhase32LiveMemoryEvaluation(
          {
            outputDir,
            runId: "run-phase32-live-test",
          },
          {
            copyDir: async () => {},
            ensureDir: async (path) => {
              await mkdir(path, { recursive: true });
            },
            makeTempDir: async (prefix) =>
              prefix.includes("pack") ? packRoot : workspaceRoot,
            readTextFile: async (path) => readFile(path, "utf8"),
            removeDir: async () => {},
            runCommand: async (command) => {
              if (command.label === "pack-tarball") {
                return {
                  durationMs: 10,
                  exitCode: 0,
                  stderr: "",
                  stdout: "/tmp/pack/goodmemory-0.1.0-rc.1.tgz\n",
                };
              }

              if (command.label.startsWith("codex-export")) {
                await writeFile(
                  join(workspaceRoot, ".goodmemory/hosts/codex/export-manifest.json"),
                  JSON.stringify(
                    {
                      artifacts: [{ relativePath: "MEMORY.md" }],
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
                  stdout: JSON.stringify({
                    artifactCount: 1,
                  }),
                };
              }

              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: "ok",
              };
            },
            runCodexHostTurn: async () => ({
              events: [],
              exitCode: 0,
              stderr: "",
              stdout: "",
            }),
            writeTextFile: async () => {},
          },
        ),
      ).rejects.toThrow("Exported Codex artifacts did not include the required manifest path");
    } finally {
      await rm(packRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
      await rm(outputDir, { force: true, recursive: true });
    }
  });

  it("blocks when codex exec exits non-zero even if partial events are present", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-exitcode-blocked-"),
    );
    const packRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-exitcode-blocked-pack-"),
    );
    const outputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-phase32-live-exitcode-blocked-output-"),
    );

    try {
      await writeFile(
        join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "goodmemory-bootstrap-package-smoke",
            private: true,
            dependencies: {
              goodmemory: "__GOODMEMORY_PACKAGE_SPEC__",
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await mkdir(join(workspaceRoot, ".goodmemory", "hosts", "codex"), {
        recursive: true,
      });

      const report = await runPhase32LiveMemoryEvaluation(
        {
          outputDir,
          runId: "run-phase32-live-test",
        },
        {
          copyDir: async () => {},
          ensureDir: async (path) => {
            await mkdir(path, { recursive: true });
          },
          makeTempDir: async (prefix) =>
            prefix.includes("pack") ? packRoot : workspaceRoot,
          readTextFile: async (path) => readFile(path, "utf8"),
          removeDir: async () => {},
          runCommand: async (command) => {
            if (command.label === "pack-tarball") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: "/tmp/pack/goodmemory-0.1.0-rc.1.tgz\n",
              };
            }

              if (command.label.startsWith("codex-export")) {
                await mkdir(join(workspaceRoot, ".goodmemory/hosts/codex/session-memory"), {
                  recursive: true,
                });
                await writeFile(
                  join(workspaceRoot, ".goodmemory/hosts/codex/export-manifest.json"),
                JSON.stringify(
                  {
                    artifacts: [
                      { relativePath: "MEMORY.md" },
                      { relativePath: "session-memory/current.md" },
                    ],
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
                stdout: JSON.stringify({
                  artifactCount: 2,
                }),
              };
            }

            return {
              durationMs: 10,
              exitCode: 0,
              stderr: "",
              stdout: "ok",
            };
          },
          runCodexHostTurn: async () => ({
            events: [
              {
                type: "item.completed",
                item: {
                  id: "item_1",
                  type: "command_execution",
                  command:
                    "/bin/zsh -lc \"sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md\"",
                  exit_code: 0,
                },
              },
              {
                type: "item.completed",
                item: {
                  id: "item_2",
                  type: "agent_message",
                  text: JSON.stringify({
                    currentGoal: "Finish the bootstrap smoke path",
                    openLoop: "Verify exported session handoff",
                  }),
                },
              },
            ],
            exitCode: 1,
            stderr: "codex exec failed",
            stdout: "{\"type\":\"item.completed\"}\n",
          }),
          writeTextFile: async (path, content) => {
            await writeFile(path, content, "utf8");
          },
        },
      );

      expect(report.acceptance.decision).toBe("blocked");
      expect(report.acceptance.reason).toContain("exited non-zero");
      expect(report.commands.find((command) => command.label.startsWith("codex-native-host:"))?.exitCode)
        .toBe(1);
      expect(report.commands.find((command) => command.label.startsWith("codex-native-host:"))?.status)
        .toBe("failed");
      expect(report.comparison.cases[0]?.eventBacked.hostExitCode).toBe(1);
    } finally {
      await rm(packRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
      await rm(outputDir, { force: true, recursive: true });
    }
  });

  it("runs the cli wrapper and forwards the exit code", async () => {
    const logged: string[] = [];
    let exitCode = -1;

    await runPhase32LiveMemoryCli({
      argv: [
        "bun",
        "run",
        "scripts/run-phase-32-live-memory.ts",
        "--output-dir",
        "/tmp/phase32-live",
        "--run-id",
        "run-phase32-live-test",
      ],
      exit: (code) => {
        exitCode = code;
      },
      log: (message) => {
        logged.push(message);
      },
      runEval: async () => ({
        acceptance: {
          decision: "accepted",
          reason: "phase-32 live accepted",
        },
        commands: [],
        comparison: {
          baselines: {
            noMemory: "no-memory",
            textOnly: "frozen-pre-phase31-public-text-only",
          },
          cases: [
            {
              caseId: "continuity-open-loop",
              eventBacked: createMeasuredVariant({
                artifactReadCommands: [
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md",
                ],
                matchedExpectedFieldCount: 2,
                observedResponse: {
                  currentGoal: "Finish the bootstrap smoke path",
                  openLoop: "Verify exported session handoff",
                },
              }),
              nonRegressionAgainstTextOnly: true,
              noMemory: createMeasuredVariant({
                artifactReadCommands: [
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md",
                ],
                matchedExpectedFieldCount: 0,
                observedResponse: {},
              }),
              textOnly: createMeasuredVariant({
                artifactReadCommands: [
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md",
                ],
                matchedExpectedFieldCount: 1,
                observedResponse: {
                  currentGoal: "Finish the bootstrap smoke path",
                },
              }),
              winOverNoMemory: true,
            },
            {
              caseId: "repeated-correction",
              eventBacked: createMeasuredVariant({
                artifactReadCommands: [
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md",
                ],
                matchedExpectedFieldCount: 1,
                observedResponse: {
                  summaryRule: "Keep coding summaries short and list explicit next steps.",
                },
              }),
              nonRegressionAgainstTextOnly: true,
              noMemory: createMeasuredVariant({
                artifactReadCommands: [
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md",
                ],
                matchedExpectedFieldCount: 0,
                observedResponse: {},
              }),
              textOnly: createMeasuredVariant({
                artifactReadCommands: [
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md",
                ],
                matchedExpectedFieldCount: 1,
                observedResponse: {
                  summaryRule: "Keep coding summaries short and list explicit next steps.",
                },
              }),
              winOverNoMemory: true,
            },
            {
              caseId: "procedure-adherence",
              eventBacked: createMeasuredVariant({
                artifactReadCommands: [
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md",
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md",
                ],
                matchedExpectedFieldCount: 2,
                observedResponse: {
                  blocker: "the deploy is blocked on smoke verification.",
                  bootstrapRule: "Use packaged CLI bootstrap only.",
                },
              }),
              nonRegressionAgainstTextOnly: true,
              noMemory: createMeasuredVariant({
                artifactReadCommands: [
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md",
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md",
                ],
                matchedExpectedFieldCount: 0,
                observedResponse: {},
              }),
              textOnly: createMeasuredVariant({
                artifactReadCommands: [
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/MEMORY.md",
                  "sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md",
                ],
                matchedExpectedFieldCount: 1,
                observedResponse: {
                  bootstrapRule: "Use packaged CLI bootstrap only.",
                },
              }),
              winOverNoMemory: true,
            },
          ],
        },
        evidence: {
          host: {
            artifactReadCommands: [
              "sed -n '1,220p' ./.goodmemory/hosts/codex/session-memory/current.md",
            ],
            expectedResponse: {
              currentGoal: "Finish the bootstrap smoke path",
              openLoop: "Verify exported session handoff",
            },
            manifestPath: ".goodmemory/hosts/codex/export-manifest.json",
            exportedArtifactPaths: [
              ".goodmemory/hosts/codex/MEMORY.md",
              ".goodmemory/hosts/codex/session-memory/current.md",
            ],
            guidanceReadFromArtifacts: true,
            installedPackageBootstrap: true,
            kind: "codex",
            observedResponse: {
              currentGoal: "Finish the bootstrap smoke path",
              openLoop: "Verify exported session handoff",
            },
            traceBacked: true,
            traceEventCount: 4,
          },
          releaseContract: {
            distribution: "tarball-first",
            runtime: "bun-only",
            tarballName: "goodmemory-0.1.0-rc.1.tgz",
          },
        },
        evidenceContract: {
          phase32: {
            hostEventTransport: "native_host_events",
            packageBoundary: "installed_package_public_imports",
            runner: "scripts/run-phase-32-live-memory.ts",
          },
        },
        generatedAt: "2026-04-22T19:00:00.000Z",
        generatedBy: "scripts/run-phase-32-live-memory.ts",
        mode: "live-external-host",
        outputDir: "/tmp/phase32-live",
        phase: "phase-32",
        runDirectory: "/tmp/phase32-live/run-phase32-live-test",
        runId: "run-phase32-live-test",
      }),
    });

    expect(exitCode).toBe(0);
    expect(logged[0]).toContain("\"phase\": \"phase-32\"");
    expect(logged[0]).toContain("\"mode\": \"live-external-host\"");
  });
});
