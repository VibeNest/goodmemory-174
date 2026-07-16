import { describe, expect, it } from "bun:test";

import type {
  Phase29RcDryRunCommand,
  Phase29RcDryRunCommandResult,
  Phase29RcDryRunDependencies,
} from "../../scripts/run-phase-29-rc-dry-run";

import {
  buildPhase29GateCommands,
  buildPhase29GateCommandsForOptions,
  buildPhase29GateRunId,
  buildPhase29GateScope,
  parsePhase29GateCliOptions,
  resolvePhase29CanonicalRcDryRunReportPath,
  resolvePhase29GateOutputDir,
  runPhase29GateCli,
  runPhase29QualityGate,
} from "../../scripts/run-phase-29-gate";
import {
  buildPhase29RcDryRunId,
  buildPhase29TarballName,
  parsePhase29RcDryRunCliOptions,
  resolvePhase29OutputDir,
  resolvePhase29RcDryRunReportPath,
  runPhase29RcDryRun,
  runPhase29RcDryRunCli,
} from "../../scripts/run-phase-29-rc-dry-run";

const ROOT = "/tmp/goodmemory";
const CANONICAL_RC_DRY_RUN_REPORT_SUFFIX =
  "/reports/quality-gates/phase-29/run-20260421214500/phase-29-rc-dry-run.json";
const PHASE29_RC_COMMAND_LABELS = [
  "create-workspace-package-json",
  "pack-tarball",
  "install-tarball",
  "write-smoke-script",
  "public-reference-smoke",
  "installed-cli-stats",
] as const;

function createRcDryRunHarness(input?: {
  cliStdout?: Record<string, unknown>;
  packStdout?: string;
  smokeStdout?: Record<string, unknown>;
}): {
  commands: string[];
  dependencies: Phase29RcDryRunDependencies;
  directories: string[];
  writes: Array<{ content: string; path: string }>;
} {
  const writes: Array<{ content: string; path: string }> = [];
  const commands: string[] = [];
  const directories: string[] = [];
  const smokeStdout = input?.smokeStdout ?? {
    artifactPaths: ["MEMORY.md"],
    contextIncludesBlocker: true,
    ok: true,
    recallHitCount: 2,
  };
  const cliStdout = input?.cliStdout ?? {
    counts: {
      facts: 2,
    },
    storage: {
      provider: "sqlite",
    },
  };

  return {
    commands,
    dependencies: {
      detectBundledRuntime: () => false,
      ensureDir: async (path) => {
        directories.push(path);
      },
      makeTempDir: async () => "/tmp/goodmemory-phase29-workspace",
      now: () => "2026-04-21T21:45:00.000Z",
      readTextFile: async () => JSON.stringify({ version: "0.1.0-rc.1" }),
      removeDir: async () => {},
      runCommand: async (
        command: Phase29RcDryRunCommand,
      ): Promise<Phase29RcDryRunCommandResult> => {
        commands.push(command.label);

        if (command.label === "pack-tarball") {
          return {
            durationMs: 10,
            exitCode: 0,
            stderr: "",
            stdout:
              input?.packStdout ?? "goodmemory-0.1.0-rc.1.tgz",
          };
        }

        if (command.label === "install-tarball") {
          return {
            durationMs: 20,
            exitCode: 0,
            stderr: "",
            stdout: "installed",
          };
        }

        if (command.label === "public-reference-smoke") {
          return {
            durationMs: 30,
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify(smokeStdout),
          };
        }

        return {
          durationMs: 15,
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify(cliStdout),
        };
      },
      writeTextFile: async (path, content) => {
        writes.push({ path, content });
      },
    },
    directories,
    writes,
  };
}

function createAcceptedCanonicalRcDryRunReport(input?: {
  artifactPaths?: string[];
  cliProvider?: string;
  contextIncludesBlocker?: boolean;
  distribution?: string;
  failedCommandLabel?: string;
  recallHitCount?: number;
  smokeOk?: boolean;
  tarballName?: string;
  version?: string;
}): string {
  const version = input?.version ?? "0.1.0-rc.1";
  const tarballName = input?.tarballName ?? `goodmemory-${version}.tgz`;

  return JSON.stringify({
    acceptance: {
      decision: "accepted",
    },
    artifact: {
      packageSpec: `/tmp/goodmemory/reports/quality-gates/phase-29/run-20260421214500/${tarballName}`,
      tarballName,
      tarballPath: `/tmp/goodmemory/reports/quality-gates/phase-29/run-20260421214500/${tarballName}`,
    },
    commands: PHASE29_RC_COMMAND_LABELS.map((label) => ({
      command: label,
      durationMs: 1,
      exitCode: label === input?.failedCommandLabel ? 1 : 0,
      label,
      status: label === input?.failedCommandLabel ? "failed" : "passed",
      stderrTail: [],
      stdoutTail: [],
    })),
    releaseContract: {
      distribution: input?.distribution ?? "tarball-first",
      runtime: "bun-only",
      version,
    },
    runId: "run-20260421214500",
    verification: {
      artifactPaths: input?.artifactPaths ?? ["MEMORY.md"],
      cliProvider: input?.cliProvider ?? "sqlite",
      contextIncludesBlocker: input?.contextIncludesBlocker ?? true,
      docsInstallCommand: `bun add ./${tarballName}`,
      recallHitCount: input?.recallHitCount ?? 2,
      runtimeMode: "rules-only",
      smokeOk: input?.smokeOk ?? true,
      sqliteRuntimeOutcome: "fallback",
    },
  });
}

describe("run-phase-29 release scripts", () => {
  it("resolves the phase-29 report output directory", () => {
    expect(resolvePhase29OutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-29",
    );
    expect(resolvePhase29GateOutputDir(ROOT)).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-29",
    );
  });

  it("creates deterministic run ids and tarball names", () => {
    expect(buildPhase29RcDryRunId("2026-04-21T21:45:00.000Z")).toBe(
      "run-20260421214500",
    );
    expect(buildPhase29GateRunId("2026-04-21T21:30:00.000Z")).toBe(
      "run-20260421213000",
    );
    expect(buildPhase29TarballName("0.1.0-rc.1")).toBe(
      "goodmemory-0.1.0-rc.1.tgz",
    );
  });

  it("parses CLI options for the RC dry run and gate", () => {
    expect(
      parsePhase29RcDryRunCliOptions([
        "bun",
        "run",
        "scripts/run-phase-29-rc-dry-run.ts",
        "--output-dir",
        "/tmp/phase29",
        "--run-id",
        "run-custom-rc",
        "--tarball-name",
        "goodmemory-custom.tgz",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase29",
      runId: "run-custom-rc",
      tarballName: "goodmemory-custom.tgz",
    });

    expect(
      parsePhase29GateCliOptions([
        "bun",
        "run",
        "scripts/run-phase-29-gate.ts",
        "--output-dir",
        "/tmp/phase29",
        "--run-id",
        "run-custom-gate",
        "--skip-phase-28-rerun",
      ]),
    ).toEqual({
      outputDir: "/tmp/phase29",
      runId: "run-custom-gate",
      skipPhase28Rerun: true,
    });
  });

  it("writes an accepted RC dry-run report when tarball install, smoke, and CLI succeed", async () => {
    const { commands, dependencies, directories, writes } = createRcDryRunHarness();

    const report = await runPhase29RcDryRun(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-29",
        runId: "run-phase29-rc",
      },
      dependencies,
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.releaseContract.runtime).toBe("bun-only");
    expect(report.artifact.tarballName).toBe("goodmemory-0.1.0-rc.1.tgz");
    expect(report.verification.artifactPaths).toEqual(["MEMORY.md"]);
    expect(report.verification.cliProvider).toBe("sqlite");
    expect(report.verification.contextIncludesBlocker).toBe(true);
    expect(report.verification.recallHitCount).toBe(2);
    expect(report.verification.runtimeMode).toBe("rules-only");
    expect(report.verification.smokeOk).toBe(true);
    expect(report.verification.sqliteRuntimeOutcome).toContain("fallback");
    expect(commands).toEqual([
      "pack-tarball",
      "install-tarball",
      "public-reference-smoke",
      "installed-cli-stats",
    ]);
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-29/run-phase29-rc",
    ]);
    expect(writes.some((entry) => entry.path.endsWith("package.json"))).toBe(true);
    expect(
      writes.some((entry) => entry.path.endsWith("smoke.mjs")),
    ).toBe(true);
    expect(
      writes.some((entry) =>
        entry.path.endsWith("phase-29-rc-dry-run.json"),
      ),
    ).toBe(true);
  });

  it("uses the final non-empty pack output line as the tarball path", async () => {
    const tarballPath =
      "/tmp/goodmemory/reports/quality-gates/phase-29/run-phase29-rc/goodmemory-0.1.0-rc.1.tgz";
    const { dependencies } = createRcDryRunHarness({
      packStdout: [
        "vite v8.1.4 building client environment for production...",
        "",
        tarballPath,
        "",
      ].join("\n"),
    });

    const report = await runPhase29RcDryRun(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-29",
        runId: "run-phase29-rc",
      },
      dependencies,
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.artifact.tarballName).toBe("goodmemory-0.1.0-rc.1.tgz");
    expect(report.artifact.tarballPath).toBe(tarballPath);
  });

  it("blocks an RC dry run when the public smoke exits 0 without proving recall", async () => {
    const { dependencies } = createRcDryRunHarness({
      smokeStdout: {
        artifactPaths: [],
        contextIncludesBlocker: false,
        ok: false,
        recallHitCount: 0,
      },
    });

    const report = await runPhase29RcDryRun(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-29",
        runId: "run-phase29-rc",
      },
      dependencies,
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("public reference smoke");
  });

  it("blocks an RC dry run when the installed CLI does not use sqlite", async () => {
    const { dependencies } = createRcDryRunHarness({
      cliStdout: {
        storage: {
          provider: "memory",
        },
      },
    });

    const report = await runPhase29RcDryRun(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-29",
        runId: "run-phase29-rc",
      },
      dependencies,
    );

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("sqlite");
  });

  it("prints the acceptance line in the RC dry-run CLI wrapper", async () => {
    const logs: string[] = [];
    const exits: number[] = [];

    const report = await runPhase29RcDryRunCli({
      argv: ["bun", "run", "scripts/run-phase-29-rc-dry-run.ts"],
      exit: (code) => {
        exits.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      runDryRun: async () => ({
        acceptance: {
          decision: "accepted",
          reason: "ok",
        },
        artifact: {
          packageSpec: "/tmp/goodmemory/goodmemory-0.1.0-rc.1.tgz",
          tarballName: "goodmemory-0.1.0-rc.1.tgz",
          tarballPath: "/tmp/goodmemory/goodmemory-0.1.0-rc.1.tgz",
        },
        commands: [],
        elapsedMs: 100,
        generatedAt: "2026-04-21T21:45:00.000Z",
        generatedBy: "tests",
        phase: "phase-29",
        releaseContract: {
          distribution: "tarball-first",
          runtime: "bun-only",
          version: "0.1.0-rc.1",
        },
        runDirectory: "/tmp/goodmemory/reports/quality-gates/phase-29/run-phase29-rc",
        runId: "run-phase29-rc",
        verification: {
          artifactPaths: ["MEMORY.md"],
          cliCommand: "bun run goodmemory -- stats",
          docsInstallCommand: "bun add ./goodmemory-0.1.0-rc.1.tgz",
          contextIncludesBlocker: true,
          recallHitCount: 2,
          runtimeMode: "rules-only",
          smokeOk: true,
          sqliteRuntimeOutcome: "fallback",
        },
      }),
    });

    expect(report.phase).toBe("phase-29");
    expect(logs.some((line) => line.includes("Phase 29 RC dry run: accepted"))).toBe(
      true,
    );
    expect(exits).toEqual([]);
  });

  it("builds the canonical phase-29 gate command list", () => {
    expect(buildPhase29GateCommands(ROOT)).toEqual([
      {
        label: "typecheck",
        cwd: ROOT,
        args: ["bun", "run", "typecheck"],
      },
      {
        label: "phase-29-targeted-regressions",
        cwd: ROOT,
        args: [
          "bun",
          "test",
          "tests/unit/run-phase-29.script.test.ts",
          "tests/release/release.test.ts",
        ],
      },
      {
        label: "phase-28-gate",
        cwd: ROOT,
        args: ["bun", "run", "gate:phase-28"],
      },
    ]);
  });

  it("can skip the environment-sensitive phase-28 rerun for remote release workflow execution", () => {
    expect(
      buildPhase29GateCommandsForOptions(ROOT, {
        skipPhase28Rerun: true,
      }).map((command) => command.label),
    ).toEqual(["typecheck", "phase-29-targeted-regressions"]);
  });

  it("describes the accepted phase-29 scope", () => {
    expect(buildPhase29GateScope().inScope).toContain(
      "bun-only package metadata and tarball-first release contract for 0.1.0-rc.1",
    );
    expect(buildPhase29GateScope().outOfScope).toContain(
      "Node runtime compatibility",
    );
  });

  it("blocks when the canonical RC dry-run report is missing", async () => {
    const report = await runPhase29QualityGate(undefined, {
      now: () => "2026-04-21T21:30:00.000Z",
      readTextFile: async () => {
        throw new Error("ENOENT");
      },
      runCommand: async () => ({
        durationMs: 10,
        exitCode: 0,
        stderr: "",
        stdout: "ok",
      }),
      writeTextFile: async () => {},
    });

    expect(report.acceptance.decision).toBe("blocked");
    expect(report.acceptance.reason).toContain("RC dry-run report is missing or invalid");
    expect(report.prerequisiteArtifacts.rcDryRunReport.endsWith(CANONICAL_RC_DRY_RUN_REPORT_SUFFIX)).toBe(
      true,
    );
  });

  it("writes an accepted gate report when the canonical dry run validates and all commands pass", async () => {
    const writes: Array<{ content: string; path: string }> = [];
    const directories: string[] = [];
    const report = await runPhase29QualityGate(
      {
        outputDir: "/tmp/goodmemory/reports/quality-gates/phase-29",
        runId: "run-phase29-gate",
      },
      {
        ensureDir: async (path) => {
          directories.push(path);
        },
        now: () => "2026-04-21T21:30:00.000Z",
        readTextFile: async (path) => {
          if (path.endsWith(CANONICAL_RC_DRY_RUN_REPORT_SUFFIX)) {
            return createAcceptedCanonicalRcDryRunReport();
          }

          throw new Error(`Unexpected read: ${path}`);
        },
        runCommand: async (command) => ({
          durationMs: 10,
          exitCode: 0,
          stderr: "",
          stdout: `${command.label} ok`,
        }),
        writeTextFile: async (path, content) => {
          writes.push({ path, content });
        },
      },
    );

    expect(report.acceptance.decision).toBe("accepted");
    expect(report.scope).toEqual(buildPhase29GateScope());
    expect(directories).toEqual([
      "/tmp/goodmemory/reports/quality-gates/phase-29/run-phase29-gate",
    ]);
    expect(writes[0]?.path).toBe(
      "/tmp/goodmemory/reports/quality-gates/phase-29/run-phase29-gate/phase-29-quality-gate.json",
    );
  });

  for (const invalidReport of [
    {
      name: "wrong version",
      report: createAcceptedCanonicalRcDryRunReport({ version: "0.0.0" }),
    },
    {
      name: "wrong distribution",
      report: createAcceptedCanonicalRcDryRunReport({
        distribution: "workspace",
      }),
    },
    {
      name: "failed command ledger",
      report: createAcceptedCanonicalRcDryRunReport({
        failedCommandLabel: "public-reference-smoke",
      }),
    },
    {
      name: "wrong CLI provider",
      report: createAcceptedCanonicalRcDryRunReport({ cliProvider: "memory" }),
    },
    {
      name: "empty recall proof",
      report: createAcceptedCanonicalRcDryRunReport({ recallHitCount: 0 }),
    },
    {
      name: "missing artifact proof",
      report: createAcceptedCanonicalRcDryRunReport({ artifactPaths: [] }),
    },
    {
      name: "wrong tarball identity",
      report: createAcceptedCanonicalRcDryRunReport({
        tarballName: "goodmemory-0.0.0.tgz",
      }),
    },
  ] as const) {
    it(`blocks when the canonical RC dry-run report has ${invalidReport.name}`, async () => {
      const report = await runPhase29QualityGate(
        {
          outputDir: "/tmp/goodmemory/reports/quality-gates/phase-29",
          runId: "run-phase29-gate",
        },
        {
          now: () => "2026-04-21T21:30:00.000Z",
          readTextFile: async (path) => {
            if (path.endsWith(CANONICAL_RC_DRY_RUN_REPORT_SUFFIX)) {
              return invalidReport.report;
            }

            throw new Error(`Unexpected read: ${path}`);
          },
          runCommand: async () => ({
            durationMs: 10,
            exitCode: 0,
            stderr: "",
            stdout: "ok",
          }),
          writeTextFile: async () => {},
        },
      );

      expect(report.acceptance.decision).toBe("blocked");
      expect(report.acceptance.reason).toContain("RC dry-run report");
    });
  }

  it("prints the acceptance line in the gate CLI wrapper", async () => {
    const logs: string[] = [];
    const exits: number[] = [];

    const report = await runPhase29GateCli({
      argv: ["bun", "run", "scripts/run-phase-29-gate.ts"],
      exit: (code) => {
        exits.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      runGate: async () => ({
        acceptance: {
          decision: "accepted",
          reason: "ok",
        },
        commands: [],
        generatedAt: "2026-04-21T21:30:00.000Z",
        generatedBy: "tests",
        phase: "phase-29",
        prerequisiteArtifacts: {
          rcDryRunReport: `/tmp/goodmemory${CANONICAL_RC_DRY_RUN_REPORT_SUFFIX}`,
        },
        runDirectory: "/tmp/goodmemory/reports/quality-gates/phase-29/run-phase29-gate",
        runId: "run-phase29-gate",
        scope: buildPhase29GateScope(),
      }),
    });

    expect(report.phase).toBe("phase-29");
    expect(logs.some((line) => line.includes("Phase 29 quality gate: accepted"))).toBe(
      true,
    );
    expect(exits).toEqual([]);
  });
});
