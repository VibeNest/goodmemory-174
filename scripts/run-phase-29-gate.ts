import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import {
  buildPhase29TarballName,
  resolvePhase29OutputDir,
  resolvePhase29RcDryRunReportPath,
} from "./run-phase-29-rc-dry-run";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase29GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase29GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase29GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase29GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase29GateExecutionResult[];
  generatedAt: string;
  generatedBy: string;
  phase: "phase-29";
  prerequisiteArtifacts: {
    rcDryRunReport: string;
  };
  runDirectory: string;
  runId: string;
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
}

export interface Phase29GateOptions {
  outputDir?: string;
  runId?: string;
  skipPhase28Rerun?: boolean;
}

export interface Phase29GateDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase29GateCommand) => Promise<Phase29GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase29GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase29GateOptions) => Promise<Phase29GateReport>;
}

const GENERATED_BY = "scripts/run-phase-29-gate.ts";
const PHASE29_CANONICAL_RC_DRY_RUN_ID = "run-20260421214500";
const PHASE29_EXPECTED_CLI_PROVIDER = "sqlite";
const PHASE29_EXPECTED_DISTRIBUTION = "tarball-first";
const PHASE29_EXPECTED_MEMORY_ARTIFACT = "MEMORY.md";
const PHASE29_EXPECTED_RUNTIME = "bun-only";
const PHASE29_EXPECTED_RUNTIME_MODE = "rules-only";
const PHASE29_EXPECTED_VERSION = "0.1.0-rc.1";
const PHASE29_REQUIRED_RC_COMMAND_LABELS = [
  "create-workspace-package-json",
  "pack-tarball",
  "install-tarball",
  "write-smoke-script",
  "public-reference-smoke",
  "installed-cli-stats",
] as const;
const PHASE29_IN_SCOPE = [
  "bun-only package metadata and tarball-first release contract for 0.1.0-rc.1",
  "tarball-installed public-reference smoke for goodmemory, goodmemory/ai-sdk, and goodmemory/host",
  "installed CLI verification through the packaged Bun binary path",
  "phase-28 compatibility and supported local sqlite-vss runtime honesty preserved under the release surface",
  "phase-29 gate and archived RC dry-run evidence",
] as const;
const PHASE29_OUT_OF_SCOPE = [
  "new memory capability work",
  "Node runtime compatibility",
  "installer CLI",
  "widening gate-blocking host coverage beyond the accepted Codex path",
] as const;

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

function assertCanonicalRcDryRunReport(value: string) {
  const expectedTarballName = buildPhase29TarballName(PHASE29_EXPECTED_VERSION);
  const expectedTarballPathSuffix = `/reports/quality-gates/phase-29/${PHASE29_CANONICAL_RC_DRY_RUN_ID}/${expectedTarballName}`;
  const report = JSON.parse(value) as {
    acceptance?: {
      decision?: string;
    };
    artifact?: {
      packageSpec?: string;
      tarballName?: string;
      tarballPath?: string;
    };
    commands?: Array<{
      exitCode?: number;
      label?: string;
      status?: string;
    }>;
    releaseContract?: {
      distribution?: string;
      runtime?: string;
      version?: string;
    };
    runId?: string;
    verification?: {
      artifactPaths?: unknown;
      cliProvider?: string;
      contextIncludesBlocker?: boolean;
      docsInstallCommand?: string;
      recallHitCount?: number;
      runtimeMode?: string;
      smokeOk?: boolean;
    };
  };

  if (report.runId !== PHASE29_CANONICAL_RC_DRY_RUN_ID) {
    throw new Error("Canonical Phase 29 RC dry-run report has the wrong run id.");
  }
  if (report.acceptance?.decision !== "accepted") {
    throw new Error("Canonical Phase 29 RC dry-run report is not accepted.");
  }
  if (report.releaseContract?.distribution !== PHASE29_EXPECTED_DISTRIBUTION) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report does not prove the tarball-first distribution contract.",
    );
  }
  if (report.releaseContract?.runtime !== PHASE29_EXPECTED_RUNTIME) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report does not prove the Bun-only contract.",
    );
  }
  if (report.releaseContract?.version !== PHASE29_EXPECTED_VERSION) {
    throw new Error(
      `Canonical Phase 29 RC dry-run report does not prove ${PHASE29_EXPECTED_VERSION}.`,
    );
  }
  if (report.artifact?.tarballName !== expectedTarballName) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report has the wrong tarball name.",
    );
  }
  if (report.artifact?.packageSpec !== report.artifact?.tarballPath) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report artifact packageSpec and tarballPath diverge.",
    );
  }
  if (!report.artifact?.tarballPath?.endsWith(expectedTarballPathSuffix)) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report has the wrong tarball path.",
    );
  }
  if (!Array.isArray(report.commands)) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report is missing its command ledger.",
    );
  }
  for (const label of PHASE29_REQUIRED_RC_COMMAND_LABELS) {
    const command = report.commands.find((entry) => entry.label === label);
    if (!command || command.status !== "passed" || command.exitCode !== 0) {
      throw new Error(
        `Canonical Phase 29 RC dry-run report did not pass ${label}.`,
      );
    }
  }
  if (
    report.commands.some(
      (command) => command.status !== "passed" || command.exitCode !== 0,
    )
  ) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report includes a failed command.",
    );
  }
  if (
    report.verification?.docsInstallCommand !== `bun add ./${expectedTarballName}`
  ) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report has the wrong docs install command.",
    );
  }
  if (report.verification?.runtimeMode !== PHASE29_EXPECTED_RUNTIME_MODE) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report does not prove rules-only runtime mode.",
    );
  }
  if (report.verification?.cliProvider !== PHASE29_EXPECTED_CLI_PROVIDER) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report does not prove sqlite CLI storage.",
    );
  }
  if (
    typeof report.verification?.recallHitCount !== "number" ||
    report.verification.recallHitCount <= 0
  ) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report does not prove a positive recall hit count.",
    );
  }
  if (report.verification?.smokeOk !== true) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report does not prove the public smoke passed semantically.",
    );
  }
  if (report.verification?.contextIncludesBlocker !== true) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report does not prove recalled context was used.",
    );
  }
  if (
    !Array.isArray(report.verification?.artifactPaths) ||
    !report.verification.artifactPaths.includes(PHASE29_EXPECTED_MEMORY_ARTIFACT)
  ) {
    throw new Error(
      "Canonical Phase 29 RC dry-run report does not prove the memory artifact was exported.",
    );
  }
}

export function resolvePhase29GateOutputDir(root: string): string {
  return resolvePhase29OutputDir(root);
}

export function resolvePhase29CanonicalRcDryRunReportPath(root: string): string {
  return resolvePhase29RcDryRunReportPath(root, PHASE29_CANONICAL_RC_DRY_RUN_ID);
}

export function buildPhase29GateScope(): Phase29GateReport["scope"] {
  return {
    inScope: [...PHASE29_IN_SCOPE],
    outOfScope: [...PHASE29_OUT_OF_SCOPE],
  };
}

export function buildPhase29GateRunId(generatedAt: string): string {
  const compact = generatedAt.replace(/\D/g, "").slice(0, 14);
  return `run-${compact || "phase29"}`;
}

export function buildPhase29GateCommands(root: string): Phase29GateCommand[] {
  return [
    {
      label: "typecheck",
      cwd: root,
      args: ["bun", "run", "typecheck"],
    },
    {
      label: "phase-29-targeted-regressions",
      cwd: root,
      args: [
        "bun",
        "test",
        "tests/unit/run-phase-29.script.test.ts",
        "tests/release/release.test.ts",
      ],
    },
    {
      label: "phase-28-gate",
      cwd: root,
      args: ["bun", "run", "gate:phase-28"],
    },
  ];
}

export function buildPhase29GateCommandsForOptions(
  root: string,
  options?: {
    skipPhase28Rerun?: boolean;
  },
): Phase29GateCommand[] {
  const commands = buildPhase29GateCommands(root);

  if (!options?.skipPhase28Rerun) {
    return commands;
  }

  return commands.filter((command) => command.label !== "phase-28-gate");
}

export function parsePhase29GateCliOptions(
  argv: readonly string[],
): Phase29GateOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipPhase28Rerun: argv.includes("--skip-phase-28-rerun"),
  };
}

export async function defaultRunPhase29GateCommand(
  command: Phase29GateCommand,
): Promise<Phase29GateCommandResult> {
  const startedAtMs = Date.now();
  const spawnedProcess = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(spawnedProcess.stdout).text();
  const stderrPromise = new Response(spawnedProcess.stderr).text();
  const [exitCode, stdout, stderr] = await Promise.all([
    spawnedProcess.exited,
    stdoutPromise,
    stderrPromise,
  ]);
  const finishedAtMs = Date.now();

  return {
    durationMs: finishedAtMs - startedAtMs,
    exitCode,
    stderr,
    stdout,
  };
}

export async function runPhase29QualityGate(
  input?: Phase29GateOptions,
  dependencies?: Phase29GateDependencies,
): Promise<Phase29GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const now = dependencies?.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies?.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const runCommand =
    dependencies?.runCommand ?? defaultRunPhase29GateCommand;
  const writeTextFile = dependencies?.writeTextFile ?? writeFile;
  const generatedAt = now();
  const runId = input?.runId ?? buildPhase29GateRunId(generatedAt);
  const outputDir = input?.outputDir ?? resolvePhase29GateOutputDir(root);
  const runDirectory = join(outputDir, runId);
  const commands: Phase29GateExecutionResult[] = [];
  const rcDryRunReportPath = resolvePhase29CanonicalRcDryRunReportPath(root);

  try {
    assertCanonicalRcDryRunReport(await readTextFile(rcDryRunReportPath));
  } catch (error) {
    const blocked: Phase29GateReport = {
      acceptance: {
        decision: "blocked",
        reason:
          error instanceof Error
            ? `Canonical Phase 29 RC dry-run report is missing or invalid: ${error.message}`
            : "Canonical Phase 29 RC dry-run report is missing or invalid.",
      },
      commands,
      generatedAt,
      generatedBy: GENERATED_BY,
      phase: "phase-29",
      prerequisiteArtifacts: {
        rcDryRunReport: rcDryRunReportPath,
      },
      runDirectory,
      runId,
      scope: buildPhase29GateScope(),
    };

    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, "phase-29-quality-gate.json"),
      `${JSON.stringify(blocked, null, 2)}\n`,
    );

    return blocked;
  }

  for (const command of buildPhase29GateCommandsForOptions(root, input)) {
    const result = await runCommand(command);
    commands.push({
      label: command.label,
      command: formatCommand(command.args),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      status: result.exitCode === 0 ? "passed" : "failed",
      stdoutTail: tailLines(result.stdout),
      stderrTail: tailLines(result.stderr),
    });

    if (result.exitCode !== 0) {
      break;
    }
  }

  const failedCommand = commands.find((command) => command.status === "failed");
  const report: Phase29GateReport = {
    acceptance: failedCommand
      ? {
          decision: "blocked",
          reason: `Required regression command failed: ${failedCommand.label}`,
        }
      : {
          decision: "accepted",
          reason:
            "Phase 29 Bun-only release hardening is regression-covered, the canonical tarball-installed RC dry run is accepted, and the release artifact is ready to cut as 0.1.0-rc.1.",
        },
    commands,
    generatedAt,
    generatedBy: GENERATED_BY,
    phase: "phase-29",
    prerequisiteArtifacts: {
      rcDryRunReport: rcDryRunReportPath,
    },
    runDirectory,
    runId,
    scope: buildPhase29GateScope(),
  };

  await ensureDir(runDirectory, { recursive: true });
  await writeTextFile(
    join(runDirectory, "phase-29-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase29GateCli(
  dependencies?: Phase29GateCliDependencies,
): Promise<Phase29GateReport> {
  const argv = dependencies?.argv ?? process.argv;
  const exit = dependencies?.exit ?? process.exit;
  const log = dependencies?.log ?? console.log;
  const runGate = dependencies?.runGate ?? runPhase29QualityGate;
  const options = parsePhase29GateCliOptions(argv);
  const report = await runGate(options);

  log(`Phase 29 quality gate: ${report.acceptance.decision} (${report.acceptance.reason})`);

  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }

  return report;
}

if (import.meta.main) {
  await runPhase29GateCli();
}
