#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { Phase50InstallerEvalReport } from "./run-phase-50-installer-eval";
import {
  PHASE50_CANONICAL_RUN_ID,
  resolvePhase50InstallerEvalOutputDir,
} from "./run-phase-50-installer-eval";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase50GateOptions {
  evalReportPath?: string;
  outputDir?: string;
  runId?: string;
}

export interface Phase50GateCommand {
  args: string[];
  cwd: string;
  label: string;
}

export interface Phase50GateCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase50GateExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase50GateReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase50GateExecutionResult[];
  evidence: {
    cliContractsCovered: boolean;
    dryRunDoesNotWrite: boolean;
    installerEval: {
      artifactKind: "ignored_generated";
      ignoredReportPath: string;
      reason: string;
      regenerateCommand: string;
      status: "accepted" | "blocked";
    };
    noDefaultWritebackEscalation: boolean;
    packageScriptsRegistered: boolean;
    repairPreservesWriteback: boolean;
    repairRestoresManagedWiring: boolean;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-50-gate.ts";
  phase: "phase-50";
  runDirectory: string;
  runId: string;
}

export interface Phase50GateDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  runCommand?: (command: Phase50GateCommand) => Promise<Phase50GateCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase50GateCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runGate?: (options?: Phase50GateOptions) => Promise<Phase50GateReport>;
}

const GENERATED_BY = "scripts/run-phase-50-gate.ts";
export const PHASE50_CANONICAL_GATE_RUN_ID = "run-20260428224500";

export function resolvePhase50GateOutputDir(root: string): string {
  return join(root, "reports/quality-gates/phase-50");
}

export function resolvePhase50CanonicalEvalReportPath(root: string): string {
  return join(
    resolvePhase50InstallerEvalOutputDir(root),
    PHASE50_CANONICAL_RUN_ID,
    "report.json",
  );
}

export function parsePhase50GateCliOptions(
  argv: readonly string[],
): Phase50GateOptions {
  return {
    evalReportPath: resolveCliFlagValue(argv, "--eval-report"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value.trimEnd().split(/\r?\n/).slice(-count);
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);
  return relativePath.length > 0 ? relativePath : ".";
}

async function defaultRunCommand(
  command: Phase50GateCommand,
): Promise<Phase50GateCommandResult> {
  const startedAt = Date.now();
  const process = Bun.spawn(command.args, {
    cwd: command.cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  return {
    durationMs: Date.now() - startedAt,
    exitCode,
    stderr,
    stdout,
  };
}

function buildPhase50GateCommands(root: string): Phase50GateCommand[] {
  return [
    {
      args: ["bun", "run", "typecheck"],
      cwd: root,
      label: "typecheck",
    },
    {
      args: [
        "bun",
        "test",
        "tests/cli/cli.test.ts",
        "tests/unit/run-phase-50-installer-eval.test.ts",
        "tests/unit/run-phase-50-gate.test.ts",
      ],
      cwd: root,
      label: "phase-50-targeted-regressions",
    },
    {
      args: [
        "bun",
        "run",
        "eval:phase-50",
        "--",
        "--run-id",
        PHASE50_CANONICAL_RUN_ID,
      ],
      cwd: root,
      label: "phase-50-installer-eval",
    },
  ];
}

function parseEvalReport(parsed: unknown): Phase50InstallerEvalReport | string {
  if (typeof parsed !== "object" || parsed === null) {
    return "Phase 50 eval report must be a JSON object.";
  }
  const report = parsed as Partial<Phase50InstallerEvalReport>;
  if (report.phase !== "phase-50") {
    return "Phase 50 eval report has the wrong phase.";
  }
  if (report.generatedBy !== "scripts/run-phase-50-installer-eval.ts") {
    return "Phase 50 eval report has the wrong generator.";
  }
  if (report.acceptance?.decision !== "accepted") {
    return "Phase 50 eval report is not accepted.";
  }
  if (!Array.isArray(report.scenarios) || report.scenarios.length < 4) {
    return "Phase 50 eval report must include dry-run, doctor, default writeback, and repair scenarios.";
  }

  return report as Phase50InstallerEvalReport;
}

async function readPackageScripts(root: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, unknown>;
  };
  return parsed.scripts ?? {};
}

export async function runPhase50Gate(
  input?: Phase50GateOptions,
  dependencies?: Phase50GateDependencies,
): Promise<Phase50GateReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = resolve(input?.outputDir ?? resolvePhase50GateOutputDir(root));
  const runId = input?.runId ?? PHASE50_CANONICAL_GATE_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies?.ensureDir ?? mkdir;
  const readTextFile = dependencies?.readTextFile ?? ((path) => readFile(path, "utf8"));
  const writeTextFile =
    dependencies?.writeTextFile ?? ((path, content) => writeFile(path, content, "utf8"));
  const runCommand = dependencies?.runCommand ?? defaultRunCommand;
  const now = dependencies?.now ?? (() => new Date().toISOString());

  await ensureDir(runDirectory, { recursive: true });

  const commandResults: Phase50GateExecutionResult[] = [];
  for (const command of buildPhase50GateCommands(root)) {
    const result = await runCommand(command);
    commandResults.push({
      command: formatCommand(command.args),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      label: command.label,
      status: result.exitCode === 0 ? "passed" : "failed",
      stderrTail: tailLines(result.stderr),
      stdoutTail: tailLines(result.stdout),
    });

    if (result.exitCode !== 0) {
      const report = buildPhase50GateReport({
        commandResults,
        decision: "blocked",
        evidence: buildBlockedEvidence(root, input?.evalReportPath),
        now: now(),
        reason: `Command failed: ${command.label}`,
        runDirectory,
        runId,
      });
      await writeTextFile(
        join(runDirectory, "phase-50-quality-gate.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      return report;
    }
  }

  const evalReportPath = resolve(
    input?.evalReportPath ?? resolvePhase50CanonicalEvalReportPath(root),
  );
  const parsedReport = parseEvalReport(
    JSON.parse(await readTextFile(evalReportPath)) as unknown,
  );
  const scripts = await readPackageScripts(root);
  const packageScriptsRegistered =
    scripts["eval:phase-50"] === "bun run scripts/run-phase-50-installer-eval.ts" &&
    scripts["gate:phase-50"] === "bun run scripts/run-phase-50-gate.ts";

  let decision: "accepted" | "blocked" = "accepted";
  let reason = "Phase 50 installer CLI hardening is regression-covered.";
  const evidence =
    typeof parsedReport === "string"
      ? buildBlockedEvidence(root, evalReportPath)
      : {
          cliContractsCovered: parsedReport.scenarios.length >= 3,
          dryRunDoesNotWrite: parsedReport.summary.dryRunDoesNotWrite,
          installerEval: buildInstallerEvalEvidence({
            accepted: true,
            evalReportPath,
            root,
          }),
          noDefaultWritebackEscalation: !parsedReport.summary.writebackDefaultEscalated,
          packageScriptsRegistered,
          repairPreservesWriteback: parsedReport.summary.repairPreservesWriteback,
          repairRestoresManagedWiring: parsedReport.summary.repairRestoresManagedWiring,
        };

  if (typeof parsedReport === "string") {
    decision = "blocked";
    reason = parsedReport;
  } else if (!packageScriptsRegistered) {
    decision = "blocked";
    reason = "Phase 50 package scripts are not registered.";
  } else if (
    !evidence.cliContractsCovered ||
    !evidence.dryRunDoesNotWrite ||
    !evidence.noDefaultWritebackEscalation ||
    !evidence.repairPreservesWriteback ||
    !evidence.repairRestoresManagedWiring
  ) {
    decision = "blocked";
    reason = "Phase 50 installer evidence does not satisfy the accepted boundary.";
  }

  const report = buildPhase50GateReport({
    commandResults,
    decision,
    evidence,
    now: now(),
    reason,
    runDirectory,
    runId,
  });
  await writeTextFile(
    join(runDirectory, "phase-50-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

function buildBlockedEvidence(
  root: string,
  evalReportPath: string | undefined,
): Phase50GateReport["evidence"] {
  return {
    cliContractsCovered: false,
    dryRunDoesNotWrite: false,
    installerEval: buildInstallerEvalEvidence({
      accepted: false,
      evalReportPath: resolve(evalReportPath ?? resolvePhase50CanonicalEvalReportPath(root)),
      root,
    }),
    noDefaultWritebackEscalation: false,
    packageScriptsRegistered: false,
    repairPreservesWriteback: false,
    repairRestoresManagedWiring: false,
  };
}

function buildInstallerEvalEvidence(input: {
  accepted: boolean;
  evalReportPath: string;
  root: string;
}): Phase50GateReport["evidence"]["installerEval"] {
  return {
    artifactKind: "ignored_generated",
    ignoredReportPath: toRepoRelativePath(input.root, input.evalReportPath),
    reason: input.accepted
      ? "Phase 50 installer eval is accepted."
      : "Phase 50 installer eval is missing or blocked.",
    regenerateCommand:
      `bun run eval:phase-50 -- --run-id ${PHASE50_CANONICAL_RUN_ID}`,
    status: input.accepted ? "accepted" : "blocked",
  };
}

function buildPhase50GateReport(input: {
  commandResults: Phase50GateExecutionResult[];
  decision: "accepted" | "blocked";
  evidence: Phase50GateReport["evidence"];
  now: string;
  reason: string;
  runDirectory: string;
  runId: string;
}): Phase50GateReport {
  return {
    acceptance: {
      decision: input.decision,
      reason: input.reason,
    },
    commands: input.commandResults,
    evidence: input.evidence,
    generatedAt: input.now,
    generatedBy: GENERATED_BY,
    phase: "phase-50",
    runDirectory: input.runDirectory,
    runId: input.runId,
  };
}

export async function runPhase50GateCli(
  dependencies?: Phase50GateCliDependencies,
): Promise<void> {
  const argv = dependencies?.argv ?? process.argv;
  const log = dependencies?.log ?? console.log;
  const exit = dependencies?.exit ?? process.exit;
  const runGate = dependencies?.runGate ?? runPhase50Gate;
  const report = await runGate(parsePhase50GateCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await runPhase50GateCli();
}
