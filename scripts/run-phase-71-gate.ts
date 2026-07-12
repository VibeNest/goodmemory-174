import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export const PHASE71_MAX_UNPACKED_BYTES = 4 * 1024 * 1024;

const REQUIRED_BROWSER_CHECKS = [
  "adminApiUsersScopes",
  "auditLog",
  "candidateApproveRejectRelease",
  "cursorPagination",
  "desktopNoOverlap",
  "etagConflict",
  "fragmentTokenCleared",
  "idempotencyReplay",
  "memoryCategorization",
  "memoryDeleteConfirmation",
  "memoryHistorySupersession",
  "mobileNoOverlap",
  "mutationErrorsVisible",
  "normalConsoleClean",
  "queryTokenRemoved",
  "readOnlyMode",
  "recallTrace",
  "revisionFlow",
  "scopeCountsRefresh",
  "scopeDeleteConfirmation",
  "temporaryArtifactsCleaned",
  "tokenOnlyInAuthorization",
] as const;

export interface Phase71BrowserEvidence {
  checks: Record<string, boolean>;
  conflictProbe: {
    dialogStayedOpen: boolean;
    expectedConsoleNetworkErrors: number;
    expectedHttpStatus: number;
    messageVisible: boolean;
  };
  fixture: {
    command: string;
    llmCalls: number;
    providerMode: string;
    storage: string;
  };
  normalFlowConsole: {
    errors: number;
    warnings: number;
  };
  recordedAt: string;
  runId: string;
  runner: {
    browser: string;
    name: string;
    version: string;
  };
  schemaVersion: 1;
  viewports: Array<{
    height: number;
    name: string;
    width: number;
  }>;
}

export interface Phase71StaticEvidence {
  adminApiVersioned: boolean;
  compressedWebAssets: boolean;
  duplicateViewerServerRemoved: boolean;
  privateReactWorkspace: boolean;
  queryPageBuiltIns: boolean;
  reactCursorPagination: boolean;
  runtimeViewerDelegated: boolean;
  scopeCatalogCoverage: boolean;
  tokenSecurity: boolean;
}

export interface Phase71GateEvaluation {
  checks: {
    browser: boolean;
    commands: boolean;
    packageSize: boolean;
    staticArchitecture: boolean;
    zeroLlmCalls: boolean;
  };
  failures: string[];
  status: "failed" | "passed";
}

export interface Phase71GateOptions {
  browserEvidencePath?: string;
  outputDir?: string;
  runId?: string;
  skipCommands?: boolean;
  skipPack?: boolean;
}

interface GateCommand {
  args: string[];
  label: string;
}

interface GateCommandResult extends GateCommand {
  durationMs: number;
  exitCode: number;
  stderrTail: string;
  stdoutTail: string;
}

interface PackageMeasurement {
  tarballName: string;
  unpackedBytes: number;
}

export function evaluatePhase71Gate(input: {
  browserEvidence: Phase71BrowserEvidence;
  commandExitCodes: readonly number[];
  packageUnpackedBytes: number;
  staticEvidence: Phase71StaticEvidence;
}): Phase71GateEvaluation {
  const failures: string[] = [];
  for (const check of REQUIRED_BROWSER_CHECKS) {
    if (input.browserEvidence.checks[check] !== true) {
      failures.push(`browser check failed: ${check}`);
    }
  }
  if (
    input.browserEvidence.normalFlowConsole.errors !== 0 ||
    input.browserEvidence.normalFlowConsole.warnings !== 0
  ) {
    failures.push("normal browser flow emitted console errors or warnings");
  }
  if (
    input.browserEvidence.conflictProbe.expectedHttpStatus !== 412 ||
    input.browserEvidence.conflictProbe.dialogStayedOpen !== true ||
    input.browserEvidence.conflictProbe.messageVisible !== true
  ) {
    failures.push("ETag conflict probe is incomplete");
  }
  const desktop = input.browserEvidence.viewports.find(({ name }) => name === "desktop");
  const mobile = input.browserEvidence.viewports.find(({ name }) => name === "mobile");
  if (!desktop || desktop.width < 1024 || !mobile || mobile.width > 400) {
    failures.push("desktop and mobile browser viewports are incomplete");
  }

  for (const [check, passed] of Object.entries(input.staticEvidence)) {
    if (!passed) {
      failures.push(`static check failed: ${check}`);
    }
  }
  if (
    !Number.isInteger(input.packageUnpackedBytes) ||
    input.packageUnpackedBytes <= 0 ||
    input.packageUnpackedBytes > PHASE71_MAX_UNPACKED_BYTES
  ) {
    failures.push("packed package exceeds 4 MiB");
  }
  const commandsPassed =
    input.commandExitCodes.length === buildPhase71GateCommands().length &&
    input.commandExitCodes.every((exitCode) => exitCode === 0);
  if (!commandsPassed) {
    failures.push("one or more gate commands failed");
  }
  if (input.browserEvidence.fixture.llmCalls !== 0) {
    failures.push("Phase 71 browser verification made LLM calls");
  }

  const checks = {
    browser: !failures.some((failure) =>
      failure.startsWith("browser") ||
      failure.startsWith("desktop") ||
      failure.startsWith("ETag") ||
      failure.startsWith("normal browser"),
    ),
    commands: commandsPassed,
    packageSize:
      Number.isInteger(input.packageUnpackedBytes) &&
      input.packageUnpackedBytes > 0 &&
      input.packageUnpackedBytes <= PHASE71_MAX_UNPACKED_BYTES,
    staticArchitecture: Object.values(input.staticEvidence).every(Boolean),
    zeroLlmCalls: input.browserEvidence.fixture.llmCalls === 0,
  };
  return {
    checks,
    failures,
    status: failures.length === 0 ? "passed" : "failed",
  };
}

export function parsePhase71GateCliOptions(
  argv: readonly string[],
): Phase71GateOptions {
  return {
    browserEvidencePath: resolveCliFlagValue(argv, "--browser-evidence"),
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
    skipCommands: argv.includes("--skip-commands"),
    skipPack: argv.includes("--skip-pack"),
  };
}

export function buildPhase71GateCommands(): GateCommand[] {
  return [
    {
      args: ["bun", "run", "--cwd", "apps/inspector-web", "typecheck"],
      label: "inspector-web-typecheck",
    },
    {
      args: ["bun", "run", "typecheck"],
      label: "root-typecheck",
    },
    {
      args: ["bun", "test"],
      label: "full-test-suite",
    },
  ];
}

export async function runPhase71QualityGate(
  options: Phase71GateOptions = {},
): Promise<Record<string, unknown>> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const runId = options.runId ?? buildRunId(new Date().toISOString());
  const outputDir = options.outputDir ?? join(root, "reports/quality-gates/phase-71");
  const runDirectory = join(outputDir, runId);
  const browserEvidencePath = options.browserEvidencePath ?? join(
    root,
    "reports/quality-gates/phase-71/run-20260711-admin-inspector/phase-71-browser-evidence.json",
  );
  const commands = options.skipCommands
    ? []
    : await runGateCommands(root, buildPhase71GateCommands());
  const packageMeasurement = options.skipPack
    ? { tarballName: "skipped", unpackedBytes: 0 }
    : await measurePackedPackage(root);
  const browserEvidence = JSON.parse(
    await readFile(browserEvidencePath, "utf8"),
  ) as Phase71BrowserEvidence;
  const staticEvidence = await collectStaticEvidence(root);
  const evaluation = evaluatePhase71Gate({
    browserEvidence,
    commandExitCodes: commands.map(({ exitCode }) => exitCode),
    packageUnpackedBytes: packageMeasurement.unpackedBytes,
    staticEvidence,
  });
  const report = {
    acceptance: {
      decision: evaluation.status === "passed" ? "accepted" : "blocked",
      reason: evaluation.status === "passed"
        ? "Phase 71 closed with the versioned Admin API, private React Inspector, read-only runtime-viewer delegation, complete real-browser workflows, and a package below 4 MiB."
        : "Phase 71 is blocked by browser, architecture, command, or package evidence.",
    },
    browserEvidence: relative(root, browserEvidencePath),
    commands,
    evaluation,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/run-phase-71-gate.ts",
    package: {
      maxUnpackedBytes: PHASE71_MAX_UNPACKED_BYTES,
      ...packageMeasurement,
    },
    phase: "phase-71",
    runDirectory,
    runId,
    staticEvidence,
  };
  await mkdir(runDirectory, { recursive: true });
  await writeFile(
    join(runDirectory, "phase-71-quality-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function collectStaticEvidence(root: string): Promise<Phase71StaticEvidence> {
  const [
    adminApi,
    adminMemory,
    appApi,
    appAuth,
    appShell,
    auditView,
    candidatesView,
    appPackageRaw,
    contract,
    inspectorPublic,
    memoryStore,
    memoriesView,
    packageRaw,
    postgresStore,
    projectionStore,
    runtimeViewer,
    sqliteStore,
    webAssets,
  ] = await Promise.all([
    readFile(join(root, "src/inspector/adminApi.ts"), "utf8"),
    readFile(join(root, "src/inspector/adminMemory.ts"), "utf8"),
    readFile(join(root, "apps/inspector-web/src/api.ts"), "utf8"),
    readFile(join(root, "apps/inspector-web/src/auth.ts"), "utf8"),
    readFile(join(root, "apps/inspector-web/src/App.tsx"), "utf8"),
    readFile(join(root, "apps/inspector-web/src/views/AuditView.tsx"), "utf8"),
    readFile(join(root, "apps/inspector-web/src/views/CandidatesView.tsx"), "utf8"),
    readFile(join(root, "apps/inspector-web/package.json"), "utf8"),
    readFile(join(root, "src/storage/contracts.ts"), "utf8"),
    readFile(join(root, "src/inspector/public.ts"), "utf8"),
    readFile(join(root, "src/storage/memory.ts"), "utf8"),
    readFile(join(root, "apps/inspector-web/src/views/MemoriesView.tsx"), "utf8"),
    readFile(join(root, "package.json"), "utf8"),
    readFile(join(root, "src/storage/postgres.ts"), "utf8"),
    readFile(join(root, "src/recall/projections/storeDecorator.ts"), "utf8"),
    readFile(join(root, "src/runtime-viewer/public.ts"), "utf8"),
    readFile(join(root, "src/storage/sqlite.ts"), "utf8"),
    readFile(join(root, "src/inspector/webAssets.ts"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageRaw) as {
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    workspaces?: string[];
  };
  const appPackage = JSON.parse(appPackageRaw) as {
    dependencies?: Record<string, string>;
    private?: boolean;
  };
  const assetNames = await readdir(join(root, "dist/inspector-web/assets"));

  return {
    adminApiVersioned:
      adminApi.includes('const ADMIN_API_PREFIX = "/admin/v1"') &&
      ["/scopes", "/candidates", "/recall-traces", "/audit-events"].every(
        (route) => adminApi.includes(route),
      ) &&
      adminApi.includes("DEFAULT_PAGE_LIMIT = 50") &&
      adminApi.includes("MAX_PAGE_LIMIT = 200") &&
      adminApi.includes('"idempotency-key"') &&
      adminApi.includes('"if-match"'),
    compressedWebAssets:
      assetNames.some((name) => name.endsWith(".js.br")) &&
      assetNames.some((name) => name.endsWith(".css.br")) &&
      !assetNames.some((name) => name.endsWith(".js") || name.endsWith(".css")) &&
      webAssets.includes("brotliDecompress") &&
      webAssets.includes('"content-encoding"'),
    duplicateViewerServerRemoved:
      !runtimeViewer.includes("Bun.serve") &&
      !runtimeViewer.includes('"/api/') &&
      !runtimeViewer.includes("`/api/") &&
      inspectorPublic.includes("Bun.serve"),
    privateReactWorkspace:
      appPackage.private === true &&
      ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "lucide-react"].every(
        (dependency) => appPackage.dependencies?.[dependency] !== undefined,
      ) &&
      packageJson.workspaces?.includes("apps/inspector-web") === true &&
      ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "lucide-react"].every(
        (dependency) => packageJson.dependencies?.[dependency] === undefined,
      ) &&
      packageJson.scripts?.["build:inspector-web"] !== undefined,
    queryPageBuiltIns:
      contract.includes("queryPage?") &&
      [memoryStore, sqliteStore, postgresStore].every((source) =>
        source.includes("queryPage"),
      ),
    reactCursorPagination:
      appApi.includes("withQuery") &&
      appApi.includes("cursor") &&
      [appShell, auditView, candidatesView, memoriesView].every((source) =>
        source.includes("useInfiniteQuery") && source.includes("fetchNextPage"),
      ),
    runtimeViewerDelegated:
      runtimeViewer.includes("createInspectorApp") &&
      runtimeViewer.includes("serveInspector") &&
      runtimeViewer.includes("allowedScopeKey") &&
      runtimeViewer.includes("readOnly: true"),
    scopeCatalogCoverage:
      projectionStore.includes("operations.registerScope") &&
      adminMemory.includes('coverage: "partial"') &&
      adminMemory.includes("ensureHistoricalScopeCatalog"),
    tokenSecurity:
      inspectorPublic.includes("/#token=") &&
      appAuth.includes("window.location.hash") &&
      appAuth.includes("window.sessionStorage") &&
      appAuth.includes("window.history.replaceState") &&
      appAuth.includes('query.delete("token")') &&
      appApi.includes("authorization") &&
      appApi.includes("Bearer ${token}") &&
      !adminApi.includes('searchParams.get("token")'),
  };
}

async function runGateCommands(
  root: string,
  commands: readonly GateCommand[],
): Promise<GateCommandResult[]> {
  const results: GateCommandResult[] = [];
  for (const command of commands) {
    const startedAt = Date.now();
    const child = Bun.spawn({
      cmd: command.args,
      cwd: root,
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stderr, stdout] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
      new Response(child.stdout).text(),
    ]);
    const result = {
      ...command,
      durationMs: Date.now() - startedAt,
      exitCode,
      stderrTail: tail(stderr),
      stdoutTail: tail(stdout),
    };
    results.push(result);
    console.log(`[phase-71] ${command.label}: exit ${exitCode}`);
    if (exitCode !== 0) {
      break;
    }
  }
  return results;
}

async function measurePackedPackage(root: string): Promise<PackageMeasurement> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "goodmemory-phase71-pack-"));
  try {
    const pack = await runProcess(
      ["bun", "pm", "pack", "--destination", temporaryRoot, "--quiet"],
      root,
    );
    if (pack.exitCode !== 0) {
      throw new Error(
        `Phase 71 package build failed:\nstdout:\n${pack.stdout}\nstderr:\n${pack.stderr}`,
      );
    }
    const tarballOutput = pack.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.endsWith(".tgz"))
      .at(-1);
    if (!tarballOutput) {
      throw new Error("Phase 71 package build did not report a tarball path.");
    }
    const tarballPath = tarballOutput.includes("/")
      ? tarballOutput
      : join(temporaryRoot, tarballOutput);
    const unpackedRoot = join(temporaryRoot, "unpacked");
    await mkdir(unpackedRoot);
    const unpack = await runProcess(
      ["tar", "-xzf", tarballPath, "-C", unpackedRoot],
      root,
    );
    if (unpack.exitCode !== 0) {
      throw new Error(
        `Phase 71 package extraction failed:\nstdout:\n${unpack.stdout}\nstderr:\n${unpack.stderr}`,
      );
    }
    return {
      tarballName: basename(tarballPath),
      unpackedBytes: await directoryByteSize(join(unpackedRoot, "package")),
    };
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

async function directoryByteSize(path: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    total += entry.isDirectory()
      ? await directoryByteSize(child)
      : (await stat(child)).size;
  }
  return total;
}

async function runProcess(
  cmd: string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const child = Bun.spawn({ cmd, cwd, stderr: "pipe", stdout: "pipe" });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

function tail(value: string): string {
  return value.length <= 4_000 ? value : value.slice(-4_000);
}

function buildRunId(nowIso: string): string {
  return `run-${nowIso.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "")}`;
}

if (import.meta.main) {
  const report = await runPhase71QualityGate(
    parsePhase71GateCliOptions(Bun.argv),
  );
  console.log(JSON.stringify(report, null, 2));
  if ((report.acceptance as { decision: string }).decision !== "accepted") {
    process.exitCode = 1;
  }
}
