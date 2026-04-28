#!/usr/bin/env bun
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCLI } from "../src/cli";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase50InstallerEvalOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase50InstallerEvalScenario {
  checks: Record<string, boolean>;
  name:
    | "default-writeback-off"
    | "doctor-missing"
    | "dry-run-no-mutation"
    | "repair-managed-wiring";
  status: "passed" | "failed";
}

export interface Phase50InstallerEvalReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-50-installer-eval.ts";
  mode: "installer-cli-runtime-shell-hardening";
  outputDir: string;
  phase: "phase-50";
  runDirectory: string;
  runId: string;
  scenarios: Phase50InstallerEvalScenario[];
  summary: {
    dryRunDoesNotWrite: boolean;
    repairPreservesWriteback: boolean;
    repairRestoresManagedWiring: boolean;
    scenarioCount: number;
    writebackDefaultEscalated: boolean;
  };
}

export interface Phase50InstallerEvalDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase50InstallerEvalCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (
    options?: Phase50InstallerEvalOptions,
  ) => Promise<Phase50InstallerEvalReport>;
}

const GENERATED_BY = "scripts/run-phase-50-installer-eval.ts";
export const PHASE50_CANONICAL_RUN_ID = "run-20260428223000-installer-eval";

export function resolvePhase50InstallerEvalOutputDir(root: string): string {
  return join(root, "reports/eval/fallback/phase-50");
}

export function parsePhase50InstallerEvalCliOptions(
  argv: readonly string[],
): Phase50InstallerEvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function withEnv<T>(
  env: Record<string, string | undefined>,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withCwd<T>(cwd: string, callback: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return await callback();
  } finally {
    process.chdir(previous);
  }
}

function scenario(
  name: Phase50InstallerEvalScenario["name"],
  checks: Record<string, boolean>,
): Phase50InstallerEvalScenario {
  return {
    checks,
    name,
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
  };
}

async function runInstallerScenarios(): Promise<Phase50InstallerEvalScenario[]> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-phase50-"));
  const home = join(root, "home");
  const defaultInstallHome = join(root, "default-install-home");
  const defaultSetupHome = join(root, "default-setup-home");
  const defaultInstallWorkspace = join(root, "default-install-workspace");
  const defaultSetupWorkspace = join(root, "default-setup-workspace");
  const workspace = join(root, "workspace");

  try {
    await writeFile(join(root, ".keep"), "", "utf8");
    await mkdir(home, { recursive: true });
    await mkdir(defaultInstallHome, { recursive: true });
    await mkdir(defaultSetupHome, { recursive: true });
    await mkdir(defaultInstallWorkspace, { recursive: true });
    await mkdir(defaultSetupWorkspace, { recursive: true });
    await mkdir(workspace, { recursive: true });

    return await withEnv({ GOODMEMORY_HOME: home }, async () => {
      const dryRun = await withCwd(workspace, async () =>
        runCLI([
          "install",
          "codex",
          "--activation-mode",
          "global",
          "--writeback",
          "off",
          "--dry-run",
          "--json",
        ]),
      );
      const dryRunPayload = JSON.parse(dryRun.stdout || "{}") as {
        dryRun?: boolean;
        hosts?: Array<{ plannedChanges?: unknown[] }>;
      };
      const dryRunScenario = scenario("dry-run-no-mutation", {
        commandSucceeded: dryRun.exitCode === 0,
        payloadIsDryRun: dryRunPayload.dryRun === true,
        plannedChangesPresent:
          (dryRunPayload.hosts?.[0]?.plannedChanges?.length ?? 0) > 0,
        noConfigWritten: !(await pathExists(join(home, ".goodmemory/codex.json"))),
        noHooksWritten: !(await pathExists(join(home, ".codex/hooks.json"))),
      });

      const doctorMissing = await withCwd(workspace, async () =>
        runCLI([
          "doctor",
          "codex",
          "--workspace-root",
          workspace,
          "--json",
        ]),
      );
      const doctorPayload = JSON.parse(doctorMissing.stdout || "{}") as {
        hosts?: Array<{ config?: unknown; nextCommands?: unknown[]; repairable?: unknown }>;
      };
      const doctorScenario = scenario("doctor-missing", {
        commandSucceeded: doctorMissing.exitCode === 0,
        reportsMissingConfig: doctorPayload.hosts?.[0]?.config === "missing",
        doesNotClaimRepairable: doctorPayload.hosts?.[0]?.repairable === false,
        suggestsSetup:
          doctorPayload.hosts?.[0]?.nextCommands?.includes("goodmemory setup --host codex") ===
          true,
        noConfigWritten: !(await pathExists(join(home, ".goodmemory/codex.json"))),
      });

      const defaultInstall = await withEnv(
        { GOODMEMORY_HOME: defaultInstallHome },
        async () =>
          withCwd(defaultInstallWorkspace, async () =>
            runCLI([
              "install",
              "codex",
              "--activation-mode",
              "global",
              "--no-interactive",
              "--json",
            ]),
          ),
      );
      const defaultInstallPayload = JSON.parse(defaultInstall.stdout || "{}") as {
        writeback?: { mode?: string };
      };
      const defaultSetup = await withEnv(
        { GOODMEMORY_HOME: defaultSetupHome },
        async () =>
          withCwd(defaultSetupWorkspace, async () =>
            runCLI([
              "setup",
              "--host",
              "both",
              "--activation-mode",
              "global",
              "--no-interactive",
              "--json",
            ]),
          ),
      );
      const defaultSetupPayload = JSON.parse(defaultSetup.stdout || "{}") as {
        hosts?: Array<{ host?: string; writeback?: { mode?: string } }>;
      };
      const defaultSetupWritebackModes = new Map(
        (defaultSetupPayload.hosts ?? []).map((host) => [
          host.host,
          host.writeback?.mode,
        ]),
      );
      const defaultWritebackScenario = scenario("default-writeback-off", {
        installSucceeded: defaultInstall.exitCode === 0,
        installDefaultWritebackOff: defaultInstallPayload.writeback?.mode === "off",
        setupSucceeded: defaultSetup.exitCode === 0,
        setupCodexDefaultWritebackOff:
          defaultSetupWritebackModes.get("codex") === "off",
        setupClaudeDefaultWritebackOff:
          defaultSetupWritebackModes.get("claude") === "off",
      });

      const install = await runCLI([
        "install",
        "codex",
        "--activation-mode",
        "global",
        "--writeback",
        "off",
        "--user-id",
        "phase50-user",
        "--json",
      ]);
      await rm(join(home, ".codex/hooks.json"), { force: true });
      await rm(join(home, ".codex/config.toml"), { force: true });
      const repair = await withCwd(workspace, async () =>
        runCLI([
          "repair",
          "codex",
          "--workspace-root",
          workspace,
          "--json",
        ]),
      );
      const status = await withCwd(workspace, async () =>
        runCLI([
          "status",
          "codex",
          "--workspace-root",
          workspace,
          "--json",
        ]),
      );
      const statusPayload = JSON.parse(status.stdout || "{}") as {
        hosts?: Array<{
          hookRegistered?: boolean;
          mcpRegistered?: boolean;
          preActionRegistered?: boolean;
          writeback?: { mode?: string };
        }>;
      };
      const repairScenario = scenario("repair-managed-wiring", {
        installSucceeded: install.exitCode === 0,
        repairSucceeded: repair.exitCode === 0,
        hookRestored: statusPayload.hosts?.[0]?.hookRegistered === true,
        mcpRestored: statusPayload.hosts?.[0]?.mcpRegistered === true,
        preActionRestored: statusPayload.hosts?.[0]?.preActionRegistered === true,
        writebackPreserved: statusPayload.hosts?.[0]?.writeback?.mode === "off",
      });

      return [
        dryRunScenario,
        doctorScenario,
        defaultWritebackScenario,
        repairScenario,
      ];
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

export async function runPhase50InstallerEval(
  input?: Phase50InstallerEvalOptions,
  dependencies?: Phase50InstallerEvalDependencies,
): Promise<Phase50InstallerEvalReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = resolve(
    input?.outputDir ?? resolvePhase50InstallerEvalOutputDir(root),
  );
  const runId = input?.runId ?? PHASE50_CANONICAL_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const writeTextFile =
    dependencies?.writeTextFile ?? ((path, content) => writeFile(path, content, "utf8"));
  const now = dependencies?.now ?? (() => new Date().toISOString());

  await (dependencies?.ensureDir ?? mkdir)(runDirectory, { recursive: true });

  const scenarios = await runInstallerScenarios();
  const dryRunScenario = scenarios.find((item) => item.name === "dry-run-no-mutation");
  const defaultWritebackScenario = scenarios.find(
    (item) => item.name === "default-writeback-off",
  );
  const repairScenario = scenarios.find((item) => item.name === "repair-managed-wiring");
  const dryRunDoesNotWrite =
    dryRunScenario?.checks.noConfigWritten === true &&
    dryRunScenario.checks.noHooksWritten === true;
  const repairPreservesWriteback =
    repairScenario?.checks.writebackPreserved === true;
  const repairRestoresManagedWiring =
    repairScenario?.checks.hookRestored === true &&
    repairScenario.checks.mcpRestored === true &&
    repairScenario.checks.preActionRestored === true;
  const writebackDefaultEscalated =
    defaultWritebackScenario?.checks.installDefaultWritebackOff !== true ||
    defaultWritebackScenario.checks.setupCodexDefaultWritebackOff !== true ||
    defaultWritebackScenario.checks.setupClaudeDefaultWritebackOff !== true;
  const accepted = scenarios.every((item) => item.status === "passed");

  const report: Phase50InstallerEvalReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 50 installer dry-run, doctor, and repair scenarios passed."
        : "One or more Phase 50 installer scenarios failed.",
    },
    generatedAt: now(),
    generatedBy: GENERATED_BY,
    mode: "installer-cli-runtime-shell-hardening",
    outputDir,
    phase: "phase-50",
    runDirectory,
    runId,
    scenarios,
    summary: {
      dryRunDoesNotWrite,
      repairPreservesWriteback,
      repairRestoresManagedWiring,
      scenarioCount: scenarios.length,
      writebackDefaultEscalated,
    },
  };

  await writeTextFile(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  return report;
}

export async function runPhase50InstallerEvalCli(
  dependencies?: Phase50InstallerEvalCliDependencies,
): Promise<void> {
  const argv = dependencies?.argv ?? process.argv;
  const log = dependencies?.log ?? console.log;
  const exit = dependencies?.exit ?? process.exit;
  const runEval = dependencies?.runEval ?? runPhase50InstallerEval;
  const report = await runEval(parsePhase50InstallerEvalCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await runPhase50InstallerEvalCli();
}
