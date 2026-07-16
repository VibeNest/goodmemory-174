import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const projectionFileSchema = z.object({
  bytes: z.number().int().nonnegative(),
  path: z.string().min(1),
  sha256: sha256Schema,
}).strict();

const projectionManifestSchema = z.object({
  evidenceClass: z.literal("frozen-prehistory-pilot"),
  files: z.array(projectionFileSchema).min(1),
  pathTokenCount: z.number().int().nonnegative(),
  projectionRunIdentitySha256: sha256Schema,
  runId: z.string().min(1),
  schemaVersion: z.literal(1),
  sourceRunIdentitySha256: sha256Schema,
}).strict();

export type C3ProjectionManifest = z.infer<typeof projectionManifestSchema>;

const REQUIRED_RAW_FILES = [
  "audit-evidence.sanitized.json",
  "base-health.json",
  "cases.jsonl",
  "evaluator-security.sanitized.json",
  "frozen-prehistory-seed-receipt.json",
  "goodmemory-source-state-post-run.json",
  "goodmemory-source-state.json",
  "host-configurations.sanitized.json",
  "host-preflight.sanitized.json",
  "prehistory-leakage-audit.json",
  "prompt-leakage-audit.json",
  "run-identity.json",
  "runner-source-state-post-run.json",
  "runner-source-state.json",
  "summary.json",
] as const;

export async function projectC3RunEvidence(input: {
  outputDirectory: string;
  rawRunDirectory: string;
}): Promise<C3ProjectionManifest> {
  const rawRunDirectory = resolve(input.rawRunDirectory);
  const outputDirectory = resolve(input.outputDirectory);
  await assertRealDirectory(rawRunDirectory, "C3 raw run directory");
  const [physicalRawRunDirectory, physicalOutputDirectory] = await Promise.all([
    realpath(rawRunDirectory),
    resolvePhysicalPath(outputDirectory),
  ]);
  if (pathsOverlap(physicalRawRunDirectory, physicalOutputDirectory)) {
    throw new Error(
      "C3 projection directory must not overlap the raw run directory",
    );
  }
  await assertAbsent(outputDirectory, "C3 projection directory");

  const rawFiles = await collectRawFiles(rawRunDirectory);
  const identityBytes = requiredRawFile(rawFiles, "run-identity.json");
  const identity = parseJson(identityBytes, "run-identity.json") as {
    evidenceClass?: unknown;
    runId?: unknown;
  };
  if (
    identity.evidenceClass !== "frozen-prehistory-pilot" ||
    typeof identity.runId !== "string" ||
    identity.runId.length === 0
  ) {
    throw new Error("invalid C3 run identity for projection");
  }

  const pathTokens = buildPathTokens([
    rawRunDirectory,
    ...rawFiles.values(),
  ]);
  const projected = new Map(
    [...rawFiles.entries()].map(([path, bytes]) => [
      path,
      projectFile(path, bytes, pathTokens),
    ]),
  );
  rebindProjectedHashes(projected);
  await mkdir(outputDirectory, { recursive: true });
  const projectedFiles: Array<{
    bytes: number;
    path: string;
    sha256: string;
  }> = [];
  for (const [path, bytes] of [...projected.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const destination = join(outputDirectory, ...path.split("/"));
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, bytes, {
      encoding: "utf8",
      flag: "wx",
    });
    projectedFiles.push({
      bytes: Buffer.byteLength(bytes),
      path,
      sha256: sha256(bytes),
    });
  }

  const projectedIdentity = requiredRawFile(projected, "run-identity.json");
  const manifest = parseC3ProjectionManifest({
    evidenceClass: "frozen-prehistory-pilot",
    files: projectedFiles,
    pathTokenCount: pathTokens.length,
    projectionRunIdentitySha256: sha256(projectedIdentity),
    runId: identity.runId,
    schemaVersion: 1,
    sourceRunIdentitySha256: sha256(identityBytes),
  });
  await writeFile(
    join(outputDirectory, "projection-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  return manifest;
}

export function parseC3ProjectionManifest(
  value: unknown,
): C3ProjectionManifest {
  const result = projectionManifestSchema.safeParse(value);
  if (!result.success) {
    throw new Error("invalid C3 projection manifest");
  }
  const paths = result.data.files.map((file) => file.path);
  if (
    new Set(paths).size !== paths.length ||
    paths.some((path) => !isSafeRelativePath(path)) ||
    !paths.includes("run-identity.json")
  ) {
    throw new Error("invalid C3 projection file manifest");
  }
  return result.data;
}

async function collectRawFiles(
  rawRunDirectory: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const path of REQUIRED_RAW_FILES) {
    files.set(path, await readRequiredRegularFile(
      rawRunDirectory,
      path,
    ));
  }
  const stageDirectory = join(rawRunDirectory, "stage-evidence");
  await assertRealDirectory(stageDirectory, "C3 stage evidence directory");
  const stageEntries = await readdir(stageDirectory, { withFileTypes: true });
  for (const entry of stageEntries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      !entry.name.endsWith(".json")
    ) {
      throw new Error("C3 stage evidence contains an unsupported entry");
    }
    const path = `stage-evidence/${entry.name}`;
    files.set(path, await readRequiredRegularFile(rawRunDirectory, path));
  }
  if (
    [...files.keys()].filter((path) => path.startsWith("stage-evidence/"))
      .length !== 2
  ) {
    throw new Error("C3 projection requires exactly two stage evidence files");
  }
  return files;
}

function projectFile(
  path: string,
  bytes: string,
  pathTokens: ReadonlyArray<readonly [string, string]>,
): string {
  if (path.endsWith(".jsonl")) {
    const rows = bytes.split("\n").filter((line) => line.length > 0);
    const projectedRows = rows.map((line, index) =>
      JSON.stringify(sanitizeValue(
        parseJson(line, `${path}:${index + 1}`),
        pathTokens,
      ))
    );
    return projectedRows.length === 0 ? "" : `${projectedRows.join("\n")}\n`;
  }
  const parsed = parseJson(bytes, path);
  const projected = sanitizeValue(parsed, pathTokens);
  if (
    path.startsWith("stage-evidence/") &&
    typeof parsed === "object" &&
    parsed !== null &&
    typeof projected === "object" &&
    projected !== null &&
    "patchDiff" in parsed &&
    "patchDiff" in projected
  ) {
    if (typeof parsed.patchDiff !== "string") {
      throw new Error("invalid C3 stage patch projection");
    }
    assertNoHostPaths(parsed.patchDiff);
    projected.patchDiff = parsed.patchDiff;
  }
  const serialized = `${JSON.stringify(projected, null, 2)}\n`;
  assertNoHostPaths(serialized);
  return serialized;
}

function rebindProjectedHashes(files: Map<string, string>): void {
  for (const [path, bytes] of files) {
    if (!path.startsWith("stage-evidence/")) {
      continue;
    }
    const stage = asRecord(parseJson(bytes, path));
    const armEvidence = asRecord(stage.armEvidence);
    rebindPermissionIsolation(armEvidence);
    files.set(path, `${JSON.stringify(stage, null, 2)}\n`);
  }

  const baseHealthBytes = requiredRawFile(files, "base-health.json");
  const evaluatorSecurity = asRecord(parseJson(
    requiredRawFile(files, "evaluator-security.sanitized.json"),
    "evaluator-security.sanitized.json",
  ));
  rebindEvaluatorSecurityEvidence(evaluatorSecurity);
  const evaluatorSecurityBytes =
    `${JSON.stringify(evaluatorSecurity, null, 2)}\n`;
  const evaluatorSecuritySha256 = sha256(evaluatorSecurityBytes);
  files.set(
    "evaluator-security.sanitized.json",
    evaluatorSecurityBytes,
  );
  const hostConfigurationsBytes = requiredRawFile(
    files,
    "host-configurations.sanitized.json",
  );
  const hostConfigurations = asRecord(parseJson(
    hostConfigurationsBytes,
    "host-configurations.sanitized.json",
  ));
  if (!Array.isArray(hostConfigurations.normalizedDiff)) {
    throw new Error("invalid projected C3 host configuration diff");
  }
  const hostConfigurationsSha256 = sha256(hostConfigurationsBytes);
  const hostConfigurationDiffSha256 = sha256(
    JSON.stringify(hostConfigurations.normalizedDiff),
  );

  const hostPreflight = asRecord(parseJson(
    requiredRawFile(files, "host-preflight.sanitized.json"),
    "host-preflight.sanitized.json",
  ));
  hostPreflight.hostConfigurationsSha256 = hostConfigurationsSha256;
  const hostPreflightBytes = `${JSON.stringify(hostPreflight, null, 2)}\n`;
  files.set("host-preflight.sanitized.json", hostPreflightBytes);

  const identity = asRecord(parseJson(
    requiredRawFile(files, "run-identity.json"),
    "run-identity.json",
  ));
  const arms = asRecord(identity.arms);
  rebindArmIdentity(asRecord(arms.goodmemoryInstalled));
  rebindArmIdentity(asRecord(arms.noMemory));
  rebindEvaluatorSecurityContract(
    asRecord(asRecord(identity.evaluator).security),
  );
  identity.baseHealthSha256 = sha256(baseHealthBytes);
  identity.hostConfigurationDiffSha256 = hostConfigurationDiffSha256;
  identity.hostConfigurationsSha256 = hostConfigurationsSha256;
  identity.hostPreflightSha256 = sha256(hostPreflightBytes);
  const identityBytes = `${JSON.stringify(identity, null, 2)}\n`;
  files.set("run-identity.json", identityBytes);

  for (const [path, bytes] of files) {
    if (!path.startsWith("stage-evidence/")) {
      continue;
    }
    const stage = asRecord(parseJson(bytes, path));
    asRecord(stage.armEvidence).evaluatorSecuritySha256 =
      evaluatorSecuritySha256;
    files.set(path, `${JSON.stringify(stage, null, 2)}\n`);
  }

  const summaryBytes = requiredRawFile(files, "summary.json");
  const audit = asRecord(parseJson(
    requiredRawFile(files, "audit-evidence.sanitized.json"),
    "audit-evidence.sanitized.json",
  ));
  audit.baseHealthSha256 = identity.baseHealthSha256;
  audit.evaluatorSecuritySha256 = evaluatorSecuritySha256;
  audit.hostConfigurationDiffSha256 = hostConfigurationDiffSha256;
  audit.hostConfigurationsSha256 = hostConfigurationsSha256;
  audit.hostPreflightSha256 = identity.hostPreflightSha256;
  audit.summarySha256 = sha256(summaryBytes);
  files.set(
    "audit-evidence.sanitized.json",
    `${JSON.stringify(audit, null, 2)}\n`,
  );
}

function rebindArmIdentity(arm: Record<string, unknown>): void {
  rebindPermissionIsolation(arm);
  if (
    !Array.isArray(arm.normalizedArgv) ||
    arm.normalizedArgv.some((value) => typeof value !== "string")
  ) {
    throw new Error("invalid projected C3 normalized argv");
  }
  arm.normalizedArgvSha256 = sha256(JSON.stringify(arm.normalizedArgv));
}

function rebindPermissionIsolation(
  container: Record<string, unknown>,
): void {
  const permissionIsolation = asRecord(container.permissionIsolation);
  const audit = asRecord(permissionIsolation.audit);
  if (!Array.isArray(audit.deniedReads)) {
    throw new Error("invalid projected C3 permission denied reads");
  }
  for (const value of audit.deniedReads) {
    const deniedRead = asRecord(value);
    if (typeof deniedRead.path !== "string") {
      throw new Error("invalid projected C3 permission path");
    }
    deniedRead.pathSha256 = sha256(deniedRead.path);
  }
  permissionIsolation.evidenceSha256 = sha256(
    `${JSON.stringify(audit, null, 2)}\n`,
  );
}

function rebindEvaluatorSecurityEvidence(
  evidence: Record<string, unknown>,
): void {
  const contract = asRecord(evidence.contract);
  rebindEvaluatorSecurityContract(contract);
  const contractArms = asRecord(contract.arms);
  const credentialRevocations = asRecord(evidence.credentialRevocations);
  rebindPathCommitment(
    asRecord(asRecord(credentialRevocations.goodmemoryInstalled).auth),
  );
  rebindPathCommitment(
    asRecord(asRecord(credentialRevocations.noMemory).auth),
  );
  const sandboxes = asRecord(evidence.sandboxes);
  const installedSandbox = asRecord(sandboxes.goodmemoryInstalled);
  const noMemorySandbox = asRecord(sandboxes.noMemory);
  const installedContract = asRecord(contractArms.goodmemoryInstalled);
  const noMemoryContract = asRecord(contractArms.noMemory);
  installedSandbox.configSha256 = installedContract.expectedConfigSha256;
  installedSandbox.evaluatorRoot = installedContract.evaluatorRoot;
  noMemorySandbox.configSha256 = noMemoryContract.expectedConfigSha256;
  noMemorySandbox.evaluatorRoot = noMemoryContract.evaluatorRoot;
}

function rebindEvaluatorSecurityContract(
  contract: Record<string, unknown>,
): void {
  rebindPathCommitment(asRecord(contract.sourceEvaluatorRoot));
  if (!Array.isArray(contract.deniedPaths)) {
    throw new Error("invalid projected C3 evaluator denied paths");
  }
  for (const path of contract.deniedPaths) {
    rebindPathCommitment(asRecord(path));
  }
  const arms = asRecord(contract.arms);
  rebindEvaluatorSecurityArm(asRecord(arms.goodmemoryInstalled));
  rebindEvaluatorSecurityArm(asRecord(arms.noMemory));
}

function rebindEvaluatorSecurityArm(
  arm: Record<string, unknown>,
): void {
  const copiedAuth = asRecord(arm.copiedAuth);
  const evaluationWorkspace = asRecord(arm.evaluationWorkspace);
  const evaluatorRoot = asRecord(arm.evaluatorRoot);
  const sandboxRoot = asRecord(arm.sandboxRoot);
  for (const commitment of [
    copiedAuth,
    evaluationWorkspace,
    evaluatorRoot,
    sandboxRoot,
  ]) {
    rebindPathCommitment(commitment);
  }
}

function rebindPathCommitment(
  commitment: Record<string, unknown>,
): void {
  if (
    typeof commitment.label !== "string" ||
    commitment.label.length === 0 ||
    typeof commitment.path !== "string" ||
    commitment.path.length === 0
  ) {
    throw new Error("invalid projected C3 evaluator path commitment");
  }
  commitment.pathSha256 = sha256(commitment.path);
}

function sanitizeValue(
  value: unknown,
  pathTokens: ReadonlyArray<readonly [string, string]>,
): unknown {
  if (typeof value === "string") {
    return pathTokens.reduce(
      (sanitized, [path, token]) => sanitized.replaceAll(path, token),
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, pathTokens));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      sanitizeValue(child, pathTokens),
    ]));
  }
  return value;
}

function buildPathTokens(
  values: readonly string[],
): Array<readonly [string, string]> {
  const paths = new Set<string>();
  for (const value of values) {
    collectPathCandidates(value, paths);
  }
  return [...paths]
    .filter((path) => path !== "/dev/null")
    .sort((left, right) =>
      right.length - left.length || left.localeCompare(right)
    )
    .map((path, index) => [
      path,
      `<host-path-${String(index + 1).padStart(3, "0")}>`,
    ] as const);
}

function collectPathCandidates(value: string, output: Set<string>): void {
  if (isAbsolute(value) && value !== "/dev/null") {
    output.add(value);
  }
  for (const match of value.matchAll(
    /\/(?:Users|home|private|tmp|var\/folders)\/[^\s"'`,;()]+/gu,
  )) {
    const path = match[0].replace(/[.:]+$/u, "");
    if (path !== "/dev/null") {
      output.add(path);
    }
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    collectPathsFromValue(parsed, output);
  } catch {
    // Non-JSON evidence bytes are handled by the direct string scan above.
  }
}

function collectPathsFromValue(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    collectPathCandidates(value, output);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathsFromValue(entry, output);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      collectPathsFromValue(child, output);
    }
  }
}

async function readRequiredRegularFile(
  root: string,
  relativePath: string,
): Promise<string> {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`invalid C3 projection source path: ${relativePath}`);
  }
  const path = join(root, ...relativePath.split("/"));
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`C3 projection source is not a regular file: ${relativePath}`);
  }
  return readFile(path, "utf8");
}

function requiredRawFile(files: Map<string, string>, path: string): string {
  const bytes = files.get(path);
  if (bytes === undefined) {
    throw new Error(`missing C3 projection source file: ${path}`);
  }
  return bytes;
}

function parseJson(bytes: string, label: string): unknown {
  try {
    return JSON.parse(bytes);
  } catch {
    throw new Error(`invalid JSON in C3 projection source: ${label}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("invalid C3 projection object");
  }
  return value as Record<string, unknown>;
}

function assertNoHostPaths(bytes: string): void {
  if (
    /\/(?:Users|home|private|tmp|var\/folders)\//u.test(bytes)
  ) {
    throw new Error("C3 projection still contains a host absolute path");
  }
}

async function assertRealDirectory(path: string, label: string): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
}

async function assertAbsent(path: string, label: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return;
    }
    throw error;
  }
  throw new Error(`${label} already exists`);
}

async function resolvePhysicalPath(path: string): Promise<string> {
  const missingSegments: string[] = [];
  let current = path;
  while (true) {
    try {
      return resolve(
        await realpath(current),
        ...missingSegments.reverse(),
      );
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) {
        throw error;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`cannot resolve C3 projection path: ${path}`);
    }
    missingSegments.push(basename(current));
    current = parent;
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return pathInsideOrEqual(left, right) || pathInsideOrEqual(right, left);
}

function pathInsideOrEqual(parent: string, child: string): boolean {
  const childPath = relative(parent, child);
  return childPath === "" ||
    (childPath !== ".." &&
      !childPath.startsWith(`..${sep}`) &&
      !isAbsolute(childPath));
}

function isSafeRelativePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (
    path !== normalized ||
    path.length === 0 ||
    isAbsolute(path) ||
    path.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    return false;
  }
  const child = relative(".", path);
  return child !== ".." &&
    !child.startsWith(`..${sep}`) &&
    !isAbsolute(child);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
