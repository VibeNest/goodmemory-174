import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const sourceSchema = z.object({
  commit: z.string().regex(/^[a-f0-9]{40}$/u),
  dirty: z.boolean(),
  dirtyDiffSha256: sha256Schema,
  dirtyStateSha256: sha256Schema,
  untrackedFiles: z.array(z.object({
    path: z.string().min(1),
    sha256: sha256Schema,
  }).strict()),
}).strict();

const canaryResultSchema = z.object({
  codex: z.object({
    firstThreadId: z.string().min(1),
    model: z.string().min(1),
    reasoningEffort: z.string().min(1).optional(),
    secondThreadId: z.string().min(1),
    version: z.string().min(1),
  }).strict(),
  evidenceClass: z.literal("host-canary"),
  evaluation: z.object({
    firstSessionDigest: z.string().min(1),
    passed: z.boolean(),
    reasons: z.array(z.string()),
    recalledWritebackRecordIds: z.array(z.string().min(1)),
    secondSessionDigest: z.string().min(1),
    writebackRecordIds: z.array(z.string().min(1)),
  }).strict(),
  generatedAt: z.string().min(1),
  manualRolloutSelectionUsed: z.boolean(),
  modelResponseUsedForAcceptance: z.boolean(),
  package: z.object({
    sha256: sha256Schema,
    version: z.string().min(1),
  }).strict(),
  passed: z.boolean(),
  rawRuntimeRetained: z.boolean(),
  rawTranscriptPersistedByGoodMemory: z.boolean(),
  runId: z.string().min(1),
  schemaVersion: z.literal(1),
  transcript: z.object({
    codexVersion: z.string().min(1),
    conversationMessageCount: z.number().int().positive(),
    formatDrift: z.null(),
    lineCount: z.number().int().positive(),
    sanitizedSha256: sha256Schema,
    sessionId: z.string().min(1),
    sourceSha256: sha256Schema,
  }).strict(),
}).strict();

const runIdentitySchema = z.object({
  codex: z.object({
    executableSha256: sha256Schema,
    hooks: z.object({
      enabled: z.boolean(),
      maturity: z.string().min(1),
    }).strict(),
    model: z.string().min(1),
    reasoningEffort: z.string().min(1).optional(),
    version: z.string().min(1),
  }).passthrough(),
  goodmemory: z.object({
    hookConfigSha256: sha256Schema,
    packageSha256: sha256Schema,
    version: z.string().min(1),
  }).passthrough(),
  runId: z.string().min(1),
  schemaVersion: z.literal(1),
  source: sourceSchema,
}).passthrough();

const annotationsSchema = z.object({
  acceptedRunId: z.string().min(1),
  attempts: z.array(z.object({
    failureClass: z.string().min(1).nullable(),
    result: z.string().min(1),
    runId: z.string().min(1),
  }).strict()).min(1),
  calibrationDisclosure: z.string().min(1),
  schemaVersion: z.literal(1),
}).strict();

const failureSchema = z.object({
  runId: z.string().min(1),
  schemaVersion: z.literal(1),
}).passthrough();

const transcriptAuditSchema = canaryResultSchema.shape.transcript;

export const C2_NATIVE_CANARY_ARTIFACTS = [
  "canary-result.json",
  "codex-rollout.audit.json",
  "cursor-state-after-first.json",
  "goodmemory-doctor.stdout.log",
  "goodmemory-seed.stdout.log",
  "goodmemory-status-before.stdout.log",
  "hooks.sanitized.json",
  "injection-state-after-first.json",
  "injection-state-final.json",
  "run-identity.json",
  "source-dirty.diff",
  "writeback-inspect-final.stdout.log",
  "writeback-inspect-first.stdout.log",
] as const;

interface ProjectionInput {
  annotationsPath: string;
  fixtureRoot: string;
  runRoot: string;
}

export async function projectC2NativeCanaryEvidence(
  input: ProjectionInput,
) {
  const annotations = await readJson(input.annotationsPath, annotationsSchema);
  const attempts = await Promise.all(annotations.attempts.map(async (annotation) => {
    const directory = join(input.runRoot, annotation.runId);
    const resultPath = join(directory, "canary-result.json");
    const failurePath = join(directory, "failure.json");
    const result = await readOptionalJson(resultPath, canaryResultSchema);
    const failure = await readOptionalJson(failurePath, failureSchema);
    if (!result && !failure) {
      throw new Error(`C2 attempt ${annotation.runId} has no terminal artifact`);
    }
    if (result?.runId !== undefined && result.runId !== annotation.runId) {
      throw new Error(`C2 attempt ${annotation.runId} result run id mismatch`);
    }
    if (failure?.runId !== undefined && failure.runId !== annotation.runId) {
      throw new Error(`C2 attempt ${annotation.runId} failure run id mismatch`);
    }
    const artifactHashes: Record<string, string> = {};
    for (const name of [
      "canary-result.json",
      "codex-first.events.jsonl",
      "codex-second.events.jsonl",
      "failure.json",
      "run-identity.json",
    ]) {
      const hash = await optionalSha256File(join(directory, name));
      if (hash) {
        artifactHashes[name] = hash;
      }
    }
    return {
      accepted: result?.passed === true,
      artifactHashes,
      failureClass: annotation.failureClass,
      modelTurnCount: await countCompletedTurns(directory),
      result: annotation.result,
      runId: annotation.runId,
    };
  }));
  const selectedAttempt = attempts.find((attempt) =>
    attempt.runId === annotations.acceptedRunId
  );
  if (!selectedAttempt?.accepted) {
    throw new Error("selected C2 run does not contain a passing canary result");
  }

  const selectedDirectory = join(input.runRoot, annotations.acceptedRunId);
  const [canaryResult, runIdentity] = await Promise.all([
    readJson(join(selectedDirectory, "canary-result.json"), canaryResultSchema),
    readJson(join(selectedDirectory, "run-identity.json"), runIdentitySchema),
  ]);
  assertSelectedRunConsistency(canaryResult, runIdentity, annotations.acceptedRunId);

  const artifactHashes: Record<string, string> = {};
  for (const name of C2_NATIVE_CANARY_ARTIFACTS) {
    artifactHashes[name] = await sha256File(join(selectedDirectory, name));
  }
  if (artifactHashes["hooks.sanitized.json"] !== runIdentity.goodmemory.hookConfigSha256) {
    throw new Error("C2 hook artifact does not match run identity");
  }
  if (artifactHashes["source-dirty.diff"] !== runIdentity.source.dirtyDiffSha256) {
    throw new Error("C2 source diff artifact does not match run identity");
  }

  const sanitizedTranscript = await readFile(
    join(selectedDirectory, "codex-rollout.sanitized.jsonl"),
    "utf8",
  );
  if (sha256(sanitizedTranscript) !== canaryResult.transcript.sanitizedSha256) {
    throw new Error("C2 sanitized transcript does not match canary result");
  }
  const transcriptAudit = await readJson(
    join(selectedDirectory, "codex-rollout.audit.json"),
    transcriptAuditSchema,
  );
  if (JSON.stringify(transcriptAudit) !== JSON.stringify(canaryResult.transcript)) {
    throw new Error("C2 transcript audit does not match canary result");
  }

  const seedMemoryId = await readSeedMemoryId(selectedDirectory);
  const freshSessionRecallAuditCount = await readFreshRecallAuditCount(
    selectedDirectory,
    canaryResult.evaluation.secondSessionDigest,
    canaryResult.evaluation.writebackRecordIds,
  );
  if (freshSessionRecallAuditCount < 1) {
    throw new Error("C2 final writeback inspection has no fresh-session recall audit");
  }

  const metadata = {
    capturedAt: canaryResult.generatedAt,
    codexVersion: canaryResult.codex.version,
    conversationMessageCount: canaryResult.transcript.conversationMessageCount,
    fixtureKind: "sanitized-codex-rollout",
    fixtureLineCount: sanitizedTranscript.split("\n").filter(Boolean).length,
    lineCount: canaryResult.transcript.lineCount,
    model: canaryResult.codex.model,
    modelResponseUsedForAcceptance: canaryResult.modelResponseUsedForAcceptance,
    packageSha256: canaryResult.package.sha256,
    rawTranscriptRetained: canaryResult.rawRuntimeRetained,
    ...(canaryResult.codex.reasoningEffort
      ? { reasoningEffort: canaryResult.codex.reasoningEffort }
      : {}),
    runId: canaryResult.runId,
    sanitizedSha256: canaryResult.transcript.sanitizedSha256,
    schemaVersion: 1,
    sessionId: canaryResult.transcript.sessionId,
    sourceSha256: canaryResult.transcript.sourceSha256,
  };
  const projection = {
    accepted: canaryResult.passed,
    acceptedAt: canaryResult.generatedAt,
    acceptedRunId: canaryResult.runId,
    artifactHashes,
    attempts,
    calibrationDisclosure: annotations.calibrationDisclosure,
    checkpoint: "C2",
    claimBoundary: {
      hostCorrectnessOnly: true,
      publicCodingEffectProof: false,
    },
    codex: {
      executableSha256: runIdentity.codex.executableSha256,
      firstSessionDigest: canaryResult.evaluation.firstSessionDigest,
      firstThreadId: canaryResult.codex.firstThreadId,
      hooksEnabled: runIdentity.codex.hooks.enabled,
      hooksMaturity: runIdentity.codex.hooks.maturity,
      model: canaryResult.codex.model,
      ...(canaryResult.codex.reasoningEffort
        ? { reasoningEffort: canaryResult.codex.reasoningEffort }
        : {}),
      secondSessionDigest: canaryResult.evaluation.secondSessionDigest,
      secondThreadId: canaryResult.codex.secondThreadId,
      version: canaryResult.codex.version,
    },
    evidenceClass: "host-canary",
    manualRolloutSelectionUsed: canaryResult.manualRolloutSelectionUsed,
    modelResponseUsedForAcceptance: canaryResult.modelResponseUsedForAcceptance,
    package: canaryResult.package,
    phase: 73,
    projection: {
      generator: "scripts/project-codex-coding-effect-c2-evidence.ts",
      runIdentitySha256: artifactHashes["run-identity.json"],
      sourceResultSha256: artifactHashes["canary-result.json"],
    },
    rawRuntimeRetained: canaryResult.rawRuntimeRetained,
    rawTranscriptPersistedByGoodMemory:
      canaryResult.rawTranscriptPersistedByGoodMemory,
    result: {
      committedWritebackRecordId: canaryResult.evaluation.writebackRecordIds[0],
      cursorAdvancedForFirstSession: true,
      exactTranscriptThreadMatched:
        canaryResult.transcript.sessionId === canaryResult.codex.firstThreadId,
      freshSessionInjectedWritebackRecord:
        canaryResult.evaluation.recalledWritebackRecordIds.length > 0,
      freshSessionRecallAuditCount,
      seedMemoryId,
      seedMemoryInjected: true,
    },
    schemaVersion: 2,
    source: runIdentity.source,
    sourceRunDirectory:
      `reports/eval/research/codex-coding-effect/${canaryResult.runId}`,
    transcript: {
      fixture: "fixtures/codex-coding-effect/codex-rollout-0.144.3.sanitized.jsonl",
      metadata: "fixtures/codex-coding-effect/codex-rollout-0.144.3.metadata.json",
      sanitizedSha256: canaryResult.transcript.sanitizedSha256,
      sourceSha256: canaryResult.transcript.sourceSha256,
    },
  };

  await mkdir(input.fixtureRoot, { recursive: true });
  await Promise.all([
    writeJson(join(input.fixtureRoot, "c2-native-host-canary.evidence.json"), projection),
    writeJson(join(input.fixtureRoot, "codex-rollout-0.144.3.metadata.json"), metadata),
    writeFile(
      join(input.fixtureRoot, "codex-rollout-0.144.3.sanitized.jsonl"),
      sanitizedTranscript,
      "utf8",
    ),
  ]);
  return projection;
}

function assertSelectedRunConsistency(
  result: z.infer<typeof canaryResultSchema>,
  identity: z.infer<typeof runIdentitySchema>,
  acceptedRunId: string,
): void {
  if (
    result.runId !== acceptedRunId ||
    identity.runId !== acceptedRunId ||
    !result.passed ||
    !result.evaluation.passed ||
    result.evaluation.reasons.length > 0 ||
    result.manualRolloutSelectionUsed ||
    result.modelResponseUsedForAcceptance ||
    result.rawRuntimeRetained ||
    result.rawTranscriptPersistedByGoodMemory
  ) {
    throw new Error("selected C2 run violates the host-canary acceptance boundary");
  }
  if (
    identity.goodmemory.packageSha256 !== result.package.sha256 ||
    identity.goodmemory.version !== result.package.version ||
    identity.codex.model !== result.codex.model ||
    identity.codex.version !== result.codex.version
  ) {
    throw new Error("selected C2 result does not match run identity");
  }
}

async function readSeedMemoryId(directory: string): Promise<string> {
  const value = await readJson(
    join(directory, "goodmemory-seed.stdout.log"),
    z.object({
      events: z.array(z.object({
        memoryId: z.string().min(1).optional(),
        outcome: z.string(),
      }).passthrough()),
    }).passthrough(),
  );
  const written = value.events.find((event) =>
    event.outcome === "written" && event.memoryId
  );
  if (!written?.memoryId) {
    throw new Error("C2 seed artifact has no written memory id");
  }
  return written.memoryId;
}

async function readFreshRecallAuditCount(
  directory: string,
  secondSessionDigest: string,
  writebackRecordIds: string[],
): Promise<number> {
  const value = await readJson(
    join(directory, "writeback-inspect-final.stdout.log"),
    z.object({
      events: z.array(z.object({
        linkedRecordIds: z.array(z.object({ id: z.string(), type: z.string() })),
        recalledBy: z.array(z.object({ sessionDigest: z.string() }).passthrough()),
      }).passthrough()),
    }).passthrough(),
  );
  return value.events
    .filter((event) => event.linkedRecordIds.some((record) =>
      record.type === "memory" && writebackRecordIds.includes(record.id)
    ))
    .flatMap((event) => event.recalledBy)
    .filter((recall) => recall.sessionDigest === secondSessionDigest)
    .length;
}

async function countCompletedTurns(directory: string): Promise<number> {
  let count = 0;
  for (const name of ["codex-first.events.jsonl", "codex-second.events.jsonl"]) {
    const path = join(directory, name);
    if (!await pathExists(path)) {
      continue;
    }
    for (const line of (await readFile(path, "utf8")).split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const value = JSON.parse(line) as { type?: unknown };
      if (value.type === "turn.completed") {
        count += 1;
      }
    }
  }
  return count;
}

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`unable to read C2 evidence artifact ${path}`, { cause: error });
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`invalid C2 evidence artifact ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function readOptionalJson<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  return await pathExists(path) ? readJson(path, schema) : null;
}

async function sha256File(path: string): Promise<string> {
  return sha256(await readFile(path));
}

async function optionalSha256File(path: string): Promise<string | null> {
  return await pathExists(path) ? sha256File(path) : null;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

if (import.meta.main) {
  try {
    const cwd = process.cwd();
    const fixtureRoot = resolve(
      cwd,
      readFlag(process.argv.slice(2), "--fixture-root") ??
        "fixtures/codex-coding-effect",
    );
    const result = await projectC2NativeCanaryEvidence({
      annotationsPath: resolve(
        cwd,
        readFlag(process.argv.slice(2), "--annotations") ??
          join(fixtureRoot, "c2-native-host-canary.annotations.json"),
      ),
      fixtureRoot,
      runRoot: resolve(
        cwd,
        readFlag(process.argv.slice(2), "--run-root") ??
          "reports/eval/research/codex-coding-effect",
      ),
    });
    process.stdout.write(`${JSON.stringify({
      acceptedRunId: result.acceptedRunId,
      evidencePath: join(fixtureRoot, "c2-native-host-canary.evidence.json"),
    }, null, 2)}\n`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
