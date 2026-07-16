import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  runBoundaryProcess,
} from "./process";
import type {
  BoundaryProcessRequest,
  BoundaryProcessResult,
} from "./process";
import { withLoopbackNetworkProbe } from "./loopback-network-probe";

export interface CodexEvaluatorSandboxEvidence {
  configSha256: string;
  configWriteDenied: true;
  copiedAuthRemovedBeforeEvaluator: true;
  evaluatorRead: true;
  evaluatorWriteDenied: true;
  networkAccess: false;
  networkDenied: true;
  networkPositiveControl: true;
  originalAuthAliasDenied: true;
  originalAuthDenied: true;
  profileName: "c3-evaluator" | "c4-evaluator";
  schemaVersion: 1;
  workspaceRead: true;
  workspaceWrite: true;
}

export type CodexEvaluatorNetworkProbe = (input: {
  bunExecutable: string;
  cwd: string;
  env: Record<string, string>;
  runSandbox: (
    cwd: string,
    command: readonly string[],
    timeoutMs: number,
  ) => Promise<BoundaryProcessResult>;
}) => Promise<{
  networkDenied: boolean;
  networkPositiveControl: boolean;
}>;

export async function prepareCodexEvaluatorSandbox(input: {
  authFile: string;
  baseEnv: Record<string, string>;
  bunExecutable: string;
  codexExecutable: string;
  copiedAuthRemovedBeforeEvaluator: boolean;
  evaluationWorkspace: string;
  evaluatorReadProbePath: string;
  evaluatorRoot: string;
  networkProbe?: CodexEvaluatorNetworkProbe;
  profileName: "c3-evaluator" | "c4-evaluator";
  runBoundary?: (
    request: BoundaryProcessRequest,
  ) => Promise<BoundaryProcessResult>;
  sandboxRoot: string;
}): Promise<{
  evidence: CodexEvaluatorSandboxEvidence;
  evaluatorRoot: string;
  runProcess: (
    request: BoundaryProcessRequest,
  ) => Promise<BoundaryProcessResult>;
}> {
  if (!input.copiedAuthRemovedBeforeEvaluator) {
    throw new Error("evaluator sandbox requires copied auth removal");
  }
  const sandboxRoot = resolve(input.sandboxRoot);
  const evaluationWorkspace = resolve(input.evaluationWorkspace);
  const sourceEvaluatorRoot = resolve(input.evaluatorRoot);
  const sourceEvaluatorReadProbePath = resolve(input.evaluatorReadProbePath);
  const evaluatorRoot = resolve(sandboxRoot, "evaluator");
  const authFile = resolve(input.authFile);
  const bunExecutable = await resolveEvaluatorExecutable(
    input.bunExecutable,
    "evaluator Bun",
  );
  const home = resolve(sandboxRoot, "home");
  const temp = resolve(sandboxRoot, "tmp");
  const codexHome = resolve(sandboxRoot, "codex-home");
  const configPath = resolve(codexHome, "config.toml");
  assertInside(
    sourceEvaluatorRoot,
    sourceEvaluatorReadProbePath,
    "evaluator read probe",
  );
  if (!pathInsideOrEqual(sandboxRoot, evaluationWorkspace)) {
    throw new Error("evaluator workspace must stay inside its sandbox root");
  }
  for (const writableRoot of [evaluationWorkspace, home, temp]) {
    if (pathsOverlap(evaluatorRoot, writableRoot)) {
      throw new Error("evaluator root overlaps an evaluator-writable root");
    }
  }
  for (const allowedRoot of [
    sandboxRoot,
    evaluationWorkspace,
    sourceEvaluatorRoot,
    evaluatorRoot,
    home,
    temp,
  ]) {
    if (pathsOverlap(authFile, allowedRoot)) {
      throw new Error("evaluator sandbox auth source overlaps an allowed root");
    }
  }
  await assertRealFile(authFile, "evaluator sandbox auth source");
  await assertRealDirectory(
    sourceEvaluatorRoot,
    "evaluator sandbox source root",
  );
  await assertRealFile(
    sourceEvaluatorReadProbePath,
    "evaluator sandbox read probe",
  );
  await assertAbsent(evaluationWorkspace, "evaluator workspace");
  await mkdir(sandboxRoot, { recursive: true });
  if (sourceEvaluatorRoot !== evaluatorRoot) {
    await assertAbsent(evaluatorRoot, "canonical evaluator root");
    await copyEvaluatorTree(sourceEvaluatorRoot, evaluatorRoot);
  }
  const evaluatorReadProbePath = join(
    evaluatorRoot,
    relative(sourceEvaluatorRoot, sourceEvaluatorReadProbePath),
  );
  await Promise.all([
    mkdir(codexHome, { recursive: true }),
    mkdir(evaluationWorkspace, { recursive: true }),
    mkdir(home, { recursive: true }),
    mkdir(temp, { recursive: true }),
  ]);
  const config = buildCodexEvaluatorSandboxConfig({
    evaluationWorkspace,
    evaluatorRoot,
    profileName: input.profileName,
    sandboxRoot,
  });
  const configSha256 = sha256(config);
  await writeFile(configPath, config, {
    encoding: "utf8",
    flag: "wx",
  });
  await assertCanonicalConfig(configPath, configSha256);
  const nodeExecutable = Bun.which("node");
  const sandboxPath = mergePathValues(
    dirname(bunExecutable),
    nodeExecutable === null ? undefined : dirname(nodeExecutable),
    "/usr/bin:/bin",
  );
  const sandboxEnv = {
    CI: "1",
    CODEX_HOME: codexHome,
    HOME: home,
    LANG: input.baseEnv.LANG ?? "en_US.UTF-8",
    NO_COLOR: "1",
    PATH: sandboxPath,
    TMPDIR: temp,
  };
  const runBoundary = input.runBoundary ?? runBoundaryProcess;
  const runSandbox = (
    _cwd: string,
    command: readonly string[],
    timeoutMs: number,
    stdin?: string,
  ) =>
    runBoundary({
      args: [
        "sandbox",
        "-P",
        input.profileName,
        "-C",
        sandboxRoot,
        "--",
        ...command,
      ],
      cwd: sandboxRoot,
      env: sandboxEnv,
      executable: input.codexExecutable,
      ...(stdin === undefined ? {} : { stdin }),
      timeoutMs,
    });
  const readProbe = resolve(evaluationWorkspace, ".read-probe");
  const writeProbe = resolve(evaluationWorkspace, ".write-probe");
  const authAliasProbe = resolve(evaluationWorkspace, ".auth-alias-probe");
  const evaluatorWriteProbe = resolve(evaluatorRoot, ".write-probe");
  const sentinel = "goodmemory-evaluator-sandbox\n";
  await assertAbsent(evaluatorWriteProbe, "evaluator write probe");
  await writeFile(readProbe, sentinel, { encoding: "utf8", flag: "wx" });
  await symlink(authFile, authAliasProbe);
  let workspaceRead = false;
  let workspaceWrite = false;
  let evaluatorRead = false;
  let evaluatorWriteDenied = false;
  let configWriteDenied = false;
  let originalAuthDenied = false;
  let originalAuthAliasDenied = false;
  let networkDenied = false;
  let networkPositiveControl = false;
  const diagnostics: Record<string, {
    exitCode: number | null;
    spawnError?: string;
    stderr: string;
    timedOut: boolean;
  }> = {};
  try {
    const workspaceReadResult = await runSandbox(
      evaluationWorkspace,
      ["/bin/cat", readProbe],
      30_000,
    );
    diagnostics.workspaceRead = boundaryDiagnostic(workspaceReadResult);
    workspaceRead = succeeded(workspaceReadResult) &&
      workspaceReadResult.stdout === sentinel;
    const workspaceWriteResult = await runSandbox(
      evaluationWorkspace,
      ["/usr/bin/touch", writeProbe],
      30_000,
    );
    diagnostics.workspaceWrite = boundaryDiagnostic(workspaceWriteResult);
    workspaceWrite = succeeded(workspaceWriteResult) &&
      await pathExists(writeProbe);
    const evaluatorReadResult = await runSandbox(
      evaluationWorkspace,
      ["/bin/cat", evaluatorReadProbePath],
      30_000,
    );
    diagnostics.evaluatorRead = boundaryDiagnostic(evaluatorReadResult);
    evaluatorRead = succeeded(evaluatorReadResult);
    const evaluatorWriteResult = await runSandbox(
      evaluationWorkspace,
      ["/usr/bin/touch", evaluatorWriteProbe],
      30_000,
    );
    diagnostics.evaluatorWrite = boundaryDiagnostic(evaluatorWriteResult);
    evaluatorWriteDenied = denied(evaluatorWriteResult) &&
      !await pathExists(evaluatorWriteProbe);
    const configWriteResult = await runSandbox(
      evaluationWorkspace,
      ["/usr/bin/touch", configPath],
      30_000,
    );
    diagnostics.configWrite = boundaryDiagnostic(configWriteResult);
    configWriteDenied = denied(configWriteResult);
    const authReadResult = await runSandbox(
      evaluationWorkspace,
      ["/bin/cat", authFile],
      30_000,
    );
    diagnostics.originalAuthRead = boundaryDiagnostic(authReadResult);
    originalAuthDenied = denied(authReadResult);
    const authAliasReadResult = await runSandbox(
      evaluationWorkspace,
      ["/bin/cat", authAliasProbe],
      30_000,
    );
    diagnostics.originalAuthAliasRead = boundaryDiagnostic(
      authAliasReadResult,
    );
    originalAuthAliasDenied = denied(authAliasReadResult);
    const network = await (input.networkProbe ?? probeNetworkDenied)({
      bunExecutable,
      cwd: evaluationWorkspace,
      env: sandboxEnv,
      runSandbox,
    });
    networkDenied = network.networkDenied;
    networkPositiveControl = network.networkPositiveControl;
  } finally {
    await Promise.all([
      rm(evaluationWorkspace, { force: true, recursive: true }),
      rm(evaluatorWriteProbe, { force: true }),
    ]);
  }
  await assertCanonicalConfig(configPath, configSha256);
  if (
    !workspaceRead ||
    !workspaceWrite ||
    !evaluatorRead ||
    !evaluatorWriteDenied ||
    !configWriteDenied ||
    !originalAuthDenied ||
    !originalAuthAliasDenied ||
    !networkDenied ||
    !networkPositiveControl
  ) {
    throw new Error(
      "evaluator sandbox permission preflight failed: " +
        JSON.stringify({
          evaluatorRead,
          evaluatorWriteDenied,
          configWriteDenied,
          networkDenied,
          networkPositiveControl,
          originalAuthAliasDenied,
          originalAuthDenied,
          workspaceRead,
          workspaceWrite,
          diagnostics,
        }),
    );
  }
  return {
    evidence: {
      configSha256,
      configWriteDenied: true,
      copiedAuthRemovedBeforeEvaluator: true,
      evaluatorRead: true,
      evaluatorWriteDenied: true,
      networkAccess: false,
      networkDenied: true,
      networkPositiveControl: true,
      originalAuthAliasDenied: true,
      originalAuthDenied: true,
      profileName: input.profileName,
      schemaVersion: 1,
      workspaceRead: true,
      workspaceWrite: true,
    },
    evaluatorRoot,
    runProcess: async (request) => {
      if (!pathInsideOrEqual(evaluationWorkspace, request.cwd)) {
        throw new Error("evaluator process escaped its evaluation workspace");
      }
      const evaluatorExecutable = request.executable === "bun"
        ? bunExecutable
        : resolve(request.executable);
      if (evaluatorExecutable !== bunExecutable) {
        throw new Error("evaluator process must use the pinned Bun executable");
      }
      await assertCanonicalConfig(configPath, configSha256);
      const result = await runBoundary({
        args: [
          "sandbox",
          "-P",
          input.profileName,
          "-C",
          sandboxRoot,
          "--",
          "/bin/sh",
          "-c",
          'cd "$1" && shift && exec "$@"',
          "evaluator-sandbox",
          request.cwd,
          evaluatorExecutable,
          ...request.args,
        ],
        cwd: sandboxRoot,
        env: {
          CI: "1",
          CODEX_HOME: codexHome,
          HOME: home,
          LANG: request.env?.LANG ?? input.baseEnv.LANG ?? "en_US.UTF-8",
          NO_COLOR: "1",
          PATH: sandboxPath,
          TMPDIR: temp,
        },
        executable: input.codexExecutable,
        ...(request.stdin === undefined ? {} : { stdin: request.stdin }),
        timeoutMs: request.timeoutMs,
      });
      await assertCanonicalConfig(configPath, configSha256);
      return result;
    },
  };
}

export function buildCodexEvaluatorSandboxConfig(input: {
  evaluationWorkspace: string;
  evaluatorRoot: string;
  profileName: "c3-evaluator" | "c4-evaluator";
  sandboxRoot: string;
}): string {
  const sandboxRoot = resolve(input.sandboxRoot);
  const evaluationWorkspace = sandboxRelativePath(
    sandboxRoot,
    input.evaluationWorkspace,
  );
  const evaluatorRoot = sandboxRelativePath(
    sandboxRoot,
    input.evaluatorRoot,
  );
  const home = sandboxRelativePath(sandboxRoot, resolve(sandboxRoot, "home"));
  const temp = sandboxRelativePath(sandboxRoot, resolve(sandboxRoot, "tmp"));
  return [
    `default_permissions = ${JSON.stringify(input.profileName)}`,
    'web_search = "disabled"',
    "",
    `[permissions.${input.profileName}.filesystem]`,
    '":root" = "deny"',
    '":minimal" = "read"',
    "",
    `[permissions.${input.profileName}.filesystem.":workspace_roots"]`,
    '"." = "read"',
    `${JSON.stringify(evaluatorRoot)} = "read"`,
    `${JSON.stringify(evaluationWorkspace)} = "write"`,
    `${JSON.stringify(home)} = "write"`,
    `${JSON.stringify(temp)} = "write"`,
    "",
    `[permissions.${input.profileName}.network]`,
    "enabled = false",
    "",
  ].join("\n");
}

export function buildCodexEvaluatorSandboxConfigSha256(input: {
  evaluationWorkspace: string;
  evaluatorRoot: string;
  profileName: "c3-evaluator" | "c4-evaluator";
  sandboxRoot: string;
}): string {
  return sha256(buildCodexEvaluatorSandboxConfig(input));
}

async function probeNetworkDenied(input: {
  bunExecutable: string;
  cwd: string;
  env: Record<string, string>;
  runSandbox: (
    cwd: string,
    command: readonly string[],
    timeoutMs: number,
  ) => Promise<BoundaryProcessResult>;
}): Promise<{
  networkDenied: boolean;
  networkPositiveControl: boolean;
}> {
  return withLoopbackNetworkProbe(async (url) => {
    const source = [
      `const response = await fetch(${JSON.stringify(url)});`,
      "console.log(await response.text());",
    ].join("\n");
    const positiveControl = await runBoundaryProcess({
      args: ["-e", source],
      cwd: input.cwd,
      env: input.env,
      executable: input.bunExecutable,
      timeoutMs: 10_000,
    });
    const networkPositiveControl = succeeded(positiveControl) &&
      positiveControl.stdout.trim() === "reachable";
    const result = await input.runSandbox(input.cwd, [
      input.bunExecutable,
      "-e",
      source,
    ], 10_000);
    return {
      networkDenied: denied(result),
      networkPositiveControl,
    };
  });
}

function succeeded(result: BoundaryProcessResult): boolean {
  return result.spawnError === undefined &&
    !result.timedOut &&
    result.exitCode === 0;
}

function denied(result: BoundaryProcessResult): boolean {
  return result.spawnError === undefined &&
    !result.timedOut &&
    result.exitCode !== null &&
    result.exitCode !== 0;
}

function boundaryDiagnostic(
  result: BoundaryProcessResult,
): {
  exitCode: number | null;
  spawnError?: string;
  stderr: string;
  timedOut: boolean;
} {
  return {
    exitCode: result.exitCode,
    ...(result.spawnError === undefined
      ? {}
      : { spawnError: result.spawnError }),
    stderr: result.stderr.slice(0, 500),
    timedOut: result.timedOut,
  };
}

function mergePathValues(...values: Array<string | undefined>): string {
  return [...new Set(
    values
      .filter((value): value is string => value !== undefined)
      .flatMap((value) => value.split(":"))
      .filter((value) => value.length > 0),
  )].join(":");
}

async function assertRealFile(path: string, label: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file`);
  }
}

async function resolveEvaluatorExecutable(
  value: string,
  label: string,
): Promise<string> {
  const candidate = value.includes("/") || value.includes("\\")
    ? resolve(value)
    : Bun.which(value);
  if (candidate === null || candidate === undefined) {
    throw new Error(`${label} executable is unavailable`);
  }
  const path = await realpath(candidate);
  await assertRealFile(path, label);
  return path;
}

async function assertRealDirectory(path: string, label: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
}

async function copyEvaluatorTree(
  sourceRoot: string,
  destinationRoot: string,
): Promise<void> {
  await mkdir(destinationRoot, { recursive: true });
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    const source = join(sourceRoot, entry.name);
    const destination = join(destinationRoot, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("evaluator sandbox source rejects symbolic links");
    }
    if (entry.isDirectory()) {
      await copyEvaluatorTree(source, destination);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error("evaluator sandbox source rejects non-files");
    }
    await copyFile(source, destination);
  }
}

async function assertCanonicalConfig(
  path: string,
  expectedSha256: string,
): Promise<void> {
  await assertRealFile(path, "evaluator sandbox config");
  if (sha256(await readFile(path)) !== expectedSha256) {
    throw new Error("evaluator sandbox config changed");
  }
}

async function assertAbsent(path: string, label: string): Promise<void> {
  if (await pathExists(path)) {
    throw new Error(`${label} already exists`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function assertInside(parent: string, child: string, label: string): void {
  if (!pathInsideOrEqual(parent, child)) {
    throw new Error(`${label} must stay inside evaluator root`);
  }
}

function sandboxRelativePath(root: string, path: string): string {
  const value = relative(resolve(root), resolve(path))
    .split(sep)
    .join("/");
  if (
    value.length === 0 ||
    value === ".." ||
    value.startsWith("../") ||
    isAbsolute(value)
  ) {
    throw new Error("evaluator sandbox path escapes its root");
  }
  return value;
}

function pathsOverlap(first: string, second: string): boolean {
  return pathInsideOrEqual(first, second) ||
    pathInsideOrEqual(second, first);
}

function pathInsideOrEqual(parent: string, child: string): boolean {
  const value = relative(resolve(parent), resolve(child));
  return value.length === 0 ||
    (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
