import { describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  parsePhase34LiveMemoryCliOptions,
  resolvePhase34LiveMemoryOutputDir,
  runPhase34LiveMemoryEvaluation,
} from "../../scripts/run-phase-34-live-memory";
import {
  buildPackageTarballName,
  loadPackageMetadataSync,
} from "../../scripts/package-metadata";

const ROOT = "/tmp/goodmemory";
const CURRENT_TARBALL_NAME = buildPackageTarballName(
  loadPackageMetadataSync(join(import.meta.dir, "../../")),
);

function buildActionPayload(input: {
  actionId: string;
  decision: "allow" | "allow_with_guidance" | "review_required" | "blocked";
  executed: boolean;
  executedStep?: string;
  originalActionDeferred?: boolean;
  rewritten: boolean;
}) {
  return {
    actionId: input.actionId,
    decision: input.decision,
    executed: input.executed,
    ...(input.executedStep ? { executedStep: input.executedStep } : {}),
    originalActionDeferred: input.originalActionDeferred ?? false,
    realizedEventParentId: input.actionId,
    rewritten: input.rewritten,
  };
}

function buildInspectPayload(input: {
  actionTraceRecorded?: boolean;
  followupTraceRecorded?: boolean;
  toolResultEvidenceRecorded?: boolean;
}) {
  return {
    actionTraceRecorded: input.actionTraceRecorded ?? true,
    followupTraceRecorded: input.followupTraceRecorded ?? true,
    toolResultEvidenceRecorded: input.toolResultEvidenceRecorded ?? true,
  };
}

describe("run-phase-34 live-memory script", () => {
  it("resolves the phase-34 live-memory output directory", () => {
    expect(resolvePhase34LiveMemoryOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/eval/live-memory/phase-34",
    );
  });

  it("parses phase-34 live-memory cli flags", () => {
    expect(
      parsePhase34LiveMemoryCliOptions([
        "bun",
        "run",
        "scripts/run-phase-34-live-memory.ts",
        "--output-dir",
        "/tmp/phase34-live",
        "--run-id",
        "run-phase34-live-test",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase34-live",
      runId: "run-phase34-live-test",
    });
  });

  it("writes an accepted installed-package Codex action-gate live report", async () => {
    const packDir = await mkdtemp(join(tmpdir(), "goodmemory-phase34-live-pack-"));
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "goodmemory-phase34-live-workspace-"),
    );
    const outputDir = await mkdtemp(
      join(tmpdir(), "goodmemory-phase34-live-output-"),
    );
    let tempDirCall = 0;
    const actionCommands: Array<{
      args: string[];
      env?: Record<string, string>;
      label: string;
    }> = [];

    try {
      const report = await runPhase34LiveMemoryEvaluation(
        {
          outputDir,
          runId: "run-phase34-live-test",
        },
        {
          ensureDir: async (path) => {
            await mkdir(path, { recursive: true });
          },
          makeTempDir: async () => {
            tempDirCall += 1;
            return tempDirCall === 1 ? packDir : workspaceRoot;
          },
          now: () => "2026-04-22T23:40:00.000Z",
          readTextFile: async (path) => readFile(path, "utf8"),
          removeDir: async (path, options) => {
            await rm(path, { force: options?.force, recursive: options?.recursive });
          },
          runCommand: async (command) => {
            const [label, caseId, variant] = command.label.split(":");
            if (label === "codex-action") {
              actionCommands.push({
                args: [...command.args],
                env: command.env,
                label: command.label,
              });
            }

            if (command.label === "pack-tarball") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: join(packDir, CURRENT_TARBALL_NAME),
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

            if (label === "seed-memory") {
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({ caseId, ok: true, variant }),
              };
            }

            if (label === "codex-bootstrap") {
              await mkdir(join(workspaceRoot, ".goodmemory/bootstrap"), {
                recursive: true,
              });
              await mkdir(join(workspaceRoot, ".codex"), { recursive: true });
              await mkdir(join(workspaceRoot, "codex/rules"), { recursive: true });
              await writeFile(join(workspaceRoot, "AGENTS.md"), "bootstrapped\n", "utf8");
              await writeFile(
                join(workspaceRoot, ".goodmemory/bootstrap/codex-action.mjs"),
                "action gate\n",
                "utf8",
              );
              await writeFile(
                join(workspaceRoot, ".codex/hooks.json"),
                "{\n  \"hooks\": {}\n}\n",
                "utf8",
              );
              await writeFile(
                join(workspaceRoot, ".codex/config.toml"),
                "[features]\nhooks = true\n",
                "utf8",
              );
              await writeFile(
                join(workspaceRoot, "codex/rules/goodmemory.rules"),
                "# rules\n",
                "utf8",
              );

              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify({ host: "codex", ok: true }),
              };
            }

            if (label === "codex-action") {
              if (caseId === "command-rewrite" && variant === "policy-backed") {
                await writeFile(join(workspaceRoot, "quickcheck.log"), "QuickCheck\n", "utf8");
                return {
                  durationMs: 10,
                  exitCode: 0,
                  stderr: "",
                  stdout: JSON.stringify(
                    buildActionPayload({
                      actionId: "action-rewrite-policy",
                      decision: "review_required",
                      executed: true,
                      executedStep: "./tools/QuickCheck",
                      originalActionDeferred: true,
                      rewritten: true,
                    }),
                  ),
                };
              }

              if (caseId === "command-rewrite" && variant === "no-memory") {
                await writeFile(
                  join(workspaceRoot, "deepanalyzer.log"),
                  "DeepAnalyzer\n",
                  "utf8",
                );
                return {
                  durationMs: 10,
                  exitCode: 0,
                  stderr: "",
                  stdout: JSON.stringify(
                    buildActionPayload({
                      actionId: "action-rewrite-nomemory",
                      decision: "allow",
                      executed: true,
                      executedStep: "./tools/DeepAnalyzer --detailed",
                      rewritten: false,
                    }),
                  ),
                };
              }

              if (caseId === "command-blocked-veto" && variant === "policy-backed") {
                return {
                  durationMs: 10,
                  exitCode: 2,
                  stderr: "",
                  stdout: JSON.stringify(
                    buildActionPayload({
                      actionId: "action-veto-policy",
                      decision: "blocked",
                      executed: false,
                      rewritten: false,
                    }),
                  ),
                };
              }

              if (caseId === "command-blocked-veto" && variant === "no-memory") {
                await rm(join(workspaceRoot, "AGENTS.md"), { force: true });
                return {
                  durationMs: 10,
                  exitCode: 0,
                  stderr: "",
                  stdout: JSON.stringify(
                    buildActionPayload({
                      actionId: "action-veto-nomemory",
                      decision: "allow",
                      executed: true,
                      executedStep: "rm -rf AGENTS.md",
                      rewritten: false,
                    }),
                  ),
                };
              }

              if (caseId === "low-risk-guidance" && variant === "policy-backed") {
                await writeFile(join(workspaceRoot, "quickcheck.log"), "QuickCheck\n", "utf8");
                return {
                  durationMs: 10,
                  exitCode: 0,
                  stderr: "",
                  stdout: JSON.stringify(
                    buildActionPayload({
                      actionId: "action-guidance-policy",
                      decision: "allow_with_guidance",
                      executed: true,
                      executedStep: "./tools/QuickCheck --network",
                      rewritten: false,
                    }),
                  ),
                };
              }

              await writeFile(join(workspaceRoot, "quickcheck.log"), "QuickCheck\n", "utf8");
              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify(
                  buildActionPayload({
                    actionId: "action-guidance-nomemory",
                    decision: "allow",
                    executed: true,
                    executedStep: "./tools/QuickCheck --network",
                    rewritten: false,
                  }),
                ),
              };
            }

            if (label === "inspect-memory") {
              if (caseId === "command-blocked-veto" && variant === "policy-backed") {
                return {
                  durationMs: 10,
                  exitCode: 0,
                  stderr: "",
                  stdout: JSON.stringify(
                    buildInspectPayload({
                      followupTraceRecorded: false,
                      toolResultEvidenceRecorded: false,
                    }),
                  ),
                };
              }

              return {
                durationMs: 10,
                exitCode: 0,
                stderr: "",
                stdout: JSON.stringify(buildInspectPayload({})),
              };
            }

            throw new Error(`Unexpected command label: ${command.label}`);
          },
          writeTextFile: async (path, content) => {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, content, "utf8");
          },
        },
      );

      expect(report.phase).toBe("phase-34");
      expect(report.mode).toBe("live-memory");
      expect(report.runId).toBe("run-phase34-live-test");
      expect(report.acceptance.decision).toBe("accepted");
      expect(report.summary.totalCases).toBe(3);
      expect(report.summary.highRiskCaseCount).toBe(2);
      expect(report.summary.lowRiskCaseCount).toBe(1);
      expect(report.summary.firstActionInterceptionCount).toBe(2);
      expect(report.summary.correctedFirstStepCount).toBe(2);
      expect(report.summary.executableRewriteCount).toBe(1);
      expect(report.summary.falseBlockCount).toBe(0);
      expect(report.summary.completionNonRegressionPassCount).toBe(3);
      expect(
        actionCommands.some(
          (command) =>
            command.label === "codex-action:command-rewrite:policy-backed"
            && command.args.includes("./tools/DeepAnalyzer --detailed")
            && !command.env?.PATH,
        ),
      ).toBe(true);
      expect(report.evidence.host.liveEnforcementPath).toBe(
        "installed_package_action_gate_wrapper",
      );
      expect(report.evidence.host.hookParityScaffoldOnly).toBe(true);
      expect(report.evidence.host.bootstrapArtifactsPresent).toEqual({
        actionGateScript: true,
        agents: true,
        hooksConfig: true,
        hooksToml: true,
        rulesFile: true,
      });
      expect(
        report.comparison.cases.find(
          (caseResult: (typeof report.comparison.cases)[number]) =>
            caseResult.caseId === "command-rewrite",
        )
          ?.policyBacked.executedStep,
      ).toBe("./tools/QuickCheck");
      expect(
        report.comparison.cases.find(
          (caseResult: (typeof report.comparison.cases)[number]) =>
            caseResult.caseId === "command-blocked-veto",
        )?.policyBacked.blocked,
      ).toBe(true);
      expect(
        report.comparison.cases.find(
          (caseResult: (typeof report.comparison.cases)[number]) =>
            caseResult.caseId === "low-risk-guidance",
        )
          ?.policyBacked.decision,
      ).toBe("allow_with_guidance");

      const persisted = JSON.parse(
        await readFile(join(outputDir, "run-phase34-live-test/report.json"), "utf8"),
      );
      expect(persisted).toEqual(report);
    } finally {
      await rm(packDir, { recursive: true, force: true });
      await rm(workspaceRoot, { recursive: true, force: true });
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
