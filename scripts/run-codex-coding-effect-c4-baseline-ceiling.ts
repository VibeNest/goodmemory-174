import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  buildC4BaselineStageEvidenceBindings,
  loadC4BaselineStageEvidenceFiles,
  verifyC4BaselineRawStageEvidenceFiles,
} from "./codex-coding-effect/c4-baseline-ceiling";
import type {
  C4BaselineStageEvidenceFile,
} from "./codex-coding-effect/c4-baseline-ceiling";
import {
  runC4NoMemoryCeilingPilot,
} from "./codex-coding-effect/c4-baseline-live";

const OWNERSHIP_MARKER = ".goodmemory-c4-baseline-owned";

export interface C4BaselineOptions {
  authFile: string;
  bunExecutable: string;
  codexExecutable: string;
  datasetRoot: string;
  model: string;
  outputDirectory: string;
  publicationOutput: string;
  reasoningEffort: string;
  replace: boolean;
  reportOutput: string;
  runId: string;
  stageEvidenceOutput: string;
  stageTimeoutMs: number;
  testTimeoutMs: number;
  workRoot: string;
}

const DEFAULT_DATASET_ROOT = resolve(
  "fixtures/codex-coding-effect/c4-controlled-pilot",
);
const DEFAULT_OUTPUT_ROOT = resolve(
  "reports/eval/research/codex-coding-effect",
);
const DEFAULT_REPORT_OUTPUT = resolve(
  "reports/quality-gates/phase-73/c4-baseline-ceiling-pilot",
);

export async function runC4BaselineCeilingCommand(
  options: C4BaselineOptions,
): Promise<{
  decision: string;
  outputDirectory: string;
  reportOutput: string;
  reportSha256: string;
  stageEvidenceOutput: string;
}> {
  assertC4BaselinePathIsolation(options);
  const result = await runC4NoMemoryCeilingPilot({
    authFile: options.authFile,
    bunExecutable: options.bunExecutable,
    codexExecutable: options.codexExecutable,
    datasetRoot: options.datasetRoot,
    generatedAt: new Date().toISOString(),
    model: options.model,
    onLog: (event) => {
      process.stderr.write(`[c4-baseline] ${JSON.stringify(event)}\n`);
    },
    outputDirectory: options.outputDirectory,
    reasoningEffort: options.reasoningEffort,
    runId: options.runId,
    runtimeRoot: join(options.workRoot, "runtime"),
    sourceRoot: join(options.workRoot, "sources"),
    stageTimeoutMs: options.stageTimeoutMs,
    testTimeoutMs: options.testTimeoutMs,
    workspaceRoot: join(options.workRoot, "workspaces"),
  });
  const rawStageEvidenceFiles = await loadC4BaselineStageEvidenceFiles(
    join(options.outputDirectory, "stages"),
    result.report,
  );
  verifyC4BaselineRawStageEvidenceFiles(
    result.report,
    rawStageEvidenceFiles,
  );
  const stageEvidenceFiles = buildC4BaselineStageEvidenceBindings(
    result.report,
    rawStageEvidenceFiles,
  );
  await persistC4BaselinePublication({
    files: stageEvidenceFiles,
    path: options.publicationOutput,
    reportBytes: result.reportBytes,
    replace: options.replace,
  });
  return {
    decision: result.report.decision,
    outputDirectory: options.outputDirectory,
    reportOutput: options.reportOutput,
    reportSha256: result.reportSha256,
    stageEvidenceOutput: options.stageEvidenceOutput,
  };
}

export function parseC4BaselineOptions(
  args: readonly string[],
): C4BaselineOptions {
  const values = new Map<string, string>();
  let replace = false;
  for (const argument of args) {
    if (argument === "--replace") {
      if (replace) {
        throw new Error("duplicate C4 baseline option --replace");
      }
      replace = true;
      continue;
    }
    const separator = argument.indexOf("=");
    if (!argument.startsWith("--") || separator === -1) {
      throw new Error(`invalid C4 baseline argument ${argument}`);
    }
    const name = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (values.has(name)) {
      throw new Error(`duplicate C4 baseline option --${name}`);
    }
    if (value.length === 0) {
      throw new Error(`C4 baseline option --${name} cannot be empty`);
    }
    values.set(name, value);
  }
  const runId = required(values, "run-id");
  if (
    runId === "." ||
    runId === ".." ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(runId)
  ) {
    throw new Error("--run-id must be one safe path segment");
  }
  const outputRoot = resolve(values.get("output-root") ?? DEFAULT_OUTPUT_ROOT);
  const workRoot = resolve(
    values.get("work-root") ??
      join(tmpdir(), "goodmemory-c4-baseline", runId),
  );
  const known = new Set([
    "auth-file",
    "bun-binary",
    "codex-binary",
    "dataset-root",
    "model",
    "output-root",
    "publication-output",
    "reasoning-effort",
    "run-id",
    "stage-timeout-ms",
    "test-timeout-ms",
    "work-root",
  ]);
  for (const name of values.keys()) {
    if (!known.has(name)) {
      throw new Error(`unknown C4 baseline option --${name}`);
    }
  }
  const publicationOutput = resolve(
    values.get("publication-output") ?? DEFAULT_REPORT_OUTPUT,
  );
  return {
    authFile: resolve(values.get("auth-file") ?? join(homedir(), ".codex", "auth.json")),
    bunExecutable: executable(values.get("bun-binary") ?? process.execPath),
    codexExecutable: executable(values.get("codex-binary") ?? "codex"),
    datasetRoot: resolve(values.get("dataset-root") ?? DEFAULT_DATASET_ROOT),
    model: values.get("model") ?? "gpt-5.6-sol",
    outputDirectory: join(outputRoot, runId),
    publicationOutput,
    reasoningEffort: values.get("reasoning-effort") ?? "xhigh",
    replace,
    reportOutput: join(publicationOutput, "report.json"),
    runId,
    stageEvidenceOutput: join(publicationOutput, "stages"),
    stageTimeoutMs: positiveInteger(
      values.get("stage-timeout-ms") ?? "900000",
      "stage-timeout-ms",
    ),
    testTimeoutMs: positiveInteger(
      values.get("test-timeout-ms") ?? "300000",
      "test-timeout-ms",
    ),
    workRoot,
  };
}

export function assertC4BaselinePathIsolation(
  options: Pick<
    C4BaselineOptions,
    | "authFile"
    | "datasetRoot"
    | "outputDirectory"
    | "publicationOutput"
    | "reportOutput"
    | "stageEvidenceOutput"
    | "workRoot"
  >,
): void {
  const datasetRoot = resolvePhysicalPath(options.datasetRoot);
  const outputDirectory = resolvePhysicalPath(options.outputDirectory);
  const publicationOutput = resolvePhysicalPath(options.publicationOutput);
  const reportOutput = resolvePhysicalPath(options.reportOutput);
  const stageEvidenceOutput = resolvePhysicalPath(options.stageEvidenceOutput);
  const workRoot = resolvePhysicalPath(options.workRoot);
  const authFile = resolvePhysicalPath(options.authFile);
  if (pathsOverlap(datasetRoot, publicationOutput)) {
    throw new Error("C4 baseline publication overlaps the frozen dataset");
  }
  if (
    reportOutput !== join(publicationOutput, "report.json") ||
    stageEvidenceOutput !== join(publicationOutput, "stages")
  ) {
    throw new Error("C4 baseline publication paths are inconsistent");
  }
  const roots = [
    ["frozen dataset", datasetRoot],
    ["raw output", outputDirectory],
    ["disposable work root", workRoot],
  ] as const;
  for (const [index, [firstLabel, firstPath]] of roots.entries()) {
    for (const [secondLabel, secondPath] of roots.slice(index + 1)) {
      if (pathsOverlap(firstPath, secondPath)) {
        throw new Error(
          `C4 baseline ${firstLabel} overlaps ${secondLabel}`,
        );
      }
    }
  }
  if (
    pathsOverlap(outputDirectory, publicationOutput) ||
    pathsOverlap(workRoot, publicationOutput)
  ) {
    throw new Error("C4 baseline canonical output overlaps disposable output");
  }
  if (
    pathInsideOrEqual(outputDirectory, authFile) ||
    pathInsideOrEqual(workRoot, authFile) ||
    pathsOverlap(publicationOutput, authFile)
  ) {
    throw new Error("C4 baseline output overlaps the Codex auth input");
  }
}

function executable(value: string): string {
  return value.includes("/") ? resolve(value) : value;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

export async function persistC4BaselinePublication(input: {
  files: readonly C4BaselineStageEvidenceFile[];
  path: string;
  reportBytes: string;
  replace: boolean;
}): Promise<void> {
  const temporaryPath = `${input.path}.tmp-${process.pid}-${Date.now()}`;
  const backupPath = `${input.path}.old-${process.pid}-${Date.now()}`;
  let movedExisting = false;
  try {
    await mkdir(dirname(input.path), { recursive: true });
    await mkdir(join(temporaryPath, "stages"), { recursive: true });
    await writeFile(join(temporaryPath, "report.json"), input.reportBytes, {
      encoding: "utf8",
      flag: "wx",
    });
    for (const file of input.files) {
      if (
        isAbsolute(file.path) ||
        file.path.includes("\\") ||
        file.path.split("/").some((segment) =>
          segment.length === 0 || segment === "." || segment === ".."
        )
      ) {
        throw new Error("C4 baseline stage evidence path must be relative");
      }
      const destination = join(temporaryPath, "stages", file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.bytes, {
        encoding: "utf8",
        flag: "wx",
      });
    }
    if (input.replace) {
      try {
        await rename(input.path, backupPath);
        movedExisting = true;
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "ENOENT"
        ) {
          throw error;
        }
      }
    }
    await rename(temporaryPath, input.path);
    if (movedExisting) {
      await rm(backupPath, { force: true, recursive: true });
      movedExisting = false;
    }
  } catch (error) {
    if (movedExisting) {
      await rename(backupPath, input.path);
      movedExisting = false;
    }
    throw error;
  } finally {
    await Promise.all([
      rm(temporaryPath, { force: true, recursive: true }),
      movedExisting
        ? Promise.resolve()
        : rm(backupPath, { force: true, recursive: true }),
    ]);
  }
}

async function createOwnedWorkRoot(path: string): Promise<void> {
  await assertAbsent(path, "C4 baseline work root");
  await mkdir(path, { recursive: true });
  await writeFile(join(path, OWNERSHIP_MARKER), "c4-baseline\n", {
    encoding: "utf8",
    flag: "wx",
  });
}

async function removeOwnedWorkRoot(path: string): Promise<void> {
  if (await readFile(join(path, OWNERSHIP_MARKER), "utf8") !== "c4-baseline\n") {
    throw new Error("refusing to remove unowned C4 baseline work root");
  }
  await rm(path, { force: true, recursive: true });
}

export async function runC4BaselineCli(
  args: readonly string[],
): Promise<Awaited<ReturnType<typeof runC4BaselineCeilingCommand>>> {
  const options = parseC4BaselineOptions(args);
  assertC4BaselinePathIsolation(options);
  await createOwnedWorkRoot(options.workRoot);
  try {
    return await runC4BaselineCeilingCommand(options);
  } finally {
    await removeOwnedWorkRoot(options.workRoot);
  }
}

async function assertAbsent(path: string, label: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
  throw new Error(`${label} already exists`);
}

function pathsOverlap(firstPath: string, secondPath: string): boolean {
  return pathInsideOrEqual(firstPath, secondPath) ||
    pathInsideOrEqual(secondPath, firstPath);
}

function pathInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const child = relative(resolve(parentPath), resolve(candidatePath));
  return child.length === 0 ||
    (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function resolvePhysicalPath(path: string): string {
  let current = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(realpathSync(current), ...missingSegments.reverse());
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
      const parent = dirname(current);
      if (parent === current) {
        return resolve(path);
      }
      missingSegments.push(basename(current));
      current = parent;
    }
  }
}

if (import.meta.main) {
  const result = await runC4BaselineCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
}
