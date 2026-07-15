import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { CodexCodingEffectLogger } from "./logging";

const trimmedStringSchema = z.string().min(1).refine(
  (value) => value.trim() === value,
  "value cannot be whitespace-padded",
);

const stageResultSchema = z.object({
  executionFailureStage: z.string().min(1).nullable(),
  resolved: z.boolean(),
  taskFailureReasons: z.array(trimmedStringSchema),
}).strict();

const attemptRowSchema = z.object({
  attemptId: trimmedStringSchema,
  disposition: z.enum(["finalized", "infrastructure-failure"]),
  result: stageResultSchema,
  schemaVersion: z.literal(1),
  workKey: trimmedStringSchema,
}).strict();

const progressRowSchema = z.object({
  attemptId: trimmedStringSchema,
  resolved: z.boolean(),
  schemaVersion: z.literal(1),
  workKey: trimmedStringSchema,
}).strict();

export type CodexCodingEffectAttemptRow = z.infer<typeof attemptRowSchema>;
export type CodexCodingEffectProgressRow = z.infer<typeof progressRowSchema>;

export interface CodexCodingEffectAttemptLedger {
  appendAttempt(row: CodexCodingEffectAttemptRow): Promise<void>;
  attempts: CodexCodingEffectAttemptRow[];
  completed: Map<string, CodexCodingEffectProgressRow>;
  nextAttemptId(workKey: string): string;
  shouldRun(workKey: string): boolean;
}

export async function openCodexCodingEffectAttemptLedger(input: {
  directory: string;
  identity: Record<string, unknown>;
  logger?: CodexCodingEffectLogger;
  resume: boolean;
  selectedWorkKeys: readonly string[];
}): Promise<CodexCodingEffectAttemptLedger> {
  const identityPath = join(input.directory, "run-identity.json");
  const attemptsPath = join(input.directory, "attempts.jsonl");
  const progressPath = join(input.directory, "progress.jsonl");
  const identityBytes = `${JSON.stringify(input.identity, null, 2)}\n`;
  const selectedWorkKeys = new Set(input.selectedWorkKeys);
  if (selectedWorkKeys.size !== input.selectedWorkKeys.length) {
    throw new Error("selected work keys must be unique");
  }

  try {
    if (input.resume) {
      const existingIdentity = await readRequiredIdentity(identityPath);
      if (existingIdentity !== identityBytes) {
        throw new Error("run identity bytes do not match");
      }
    } else {
      if (
        await pathExists(identityPath) ||
        await pathExists(attemptsPath) ||
        await pathExists(progressPath)
      ) {
        throw new Error("fresh run output already contains identity or progress");
      }
      await mkdir(input.directory, { recursive: true });
      await writeFile(identityPath, identityBytes, { encoding: "utf8", flag: "wx" });
    }

    const attemptsRaw = input.resume
      ? await readOptionalFile(attemptsPath) ?? ""
      : "";
    let progressRaw = input.resume
      ? await readOptionalFile(progressPath) ?? ""
      : "";
    const attempts = parseAttemptRows(
      attemptsRaw,
      "attempts.jsonl",
      selectedWorkKeys,
    );

    const trimmedProgress = trimTornProgressTail(progressRaw);
    if (trimmedProgress !== progressRaw) {
      await writeFile(progressPath, trimmedProgress, "utf8");
      progressRaw = trimmedProgress;
    }
    const completed = parseProgressRows(
      progressRaw,
      "progress.jsonl",
      selectedWorkKeys,
      attempts,
    );
    if (progressRaw.length > 0 && !progressRaw.endsWith("\n")) {
      progressRaw = `${progressRaw}\n`;
      await writeFile(progressPath, progressRaw, "utf8");
    }

    for (const attempt of attempts) {
      if (
        attempt.disposition !== "finalized" ||
        completed.has(attempt.workKey)
      ) {
        continue;
      }
      const recovered = progressFromAttempt(attempt);
      await appendFile(
        progressPath,
        `${serializeProgressRow(recovered)}\n`,
        "utf8",
      );
      completed.set(recovered.workKey, recovered);
    }

    for (const row of completed.values()) {
      input.logger?.("resume_row_loaded", {
        attemptId: row.attemptId,
        resolved: row.resolved,
        workKey: row.workKey,
      });
    }

    return createLedger({
      attempts,
      attemptsPath,
      completed,
      logger: input.logger,
      progressPath,
      selectedWorkKeys,
    });
  } catch (error) {
    input.logger?.("resume_row_rejected", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function serializeAttemptRow(row: CodexCodingEffectAttemptRow): string {
  assertAttemptSemantics(attemptRowSchema.parse(row));
  return JSON.stringify(row);
}

export function parseCodexCodingEffectAttemptRow(
  value: unknown,
): CodexCodingEffectAttemptRow {
  const result = attemptRowSchema.safeParse(value);
  if (!result.success) {
    throw new Error("invalid Codex coding-effect attempt row");
  }
  assertAttemptSemantics(result.data);
  return result.data;
}

export function serializeProgressRow(row: CodexCodingEffectProgressRow): string {
  return JSON.stringify(progressRowSchema.parse(row));
}

function createLedger(input: {
  attempts: CodexCodingEffectAttemptRow[];
  attemptsPath: string;
  completed: Map<string, CodexCodingEffectProgressRow>;
  logger?: CodexCodingEffectLogger;
  progressPath: string;
  selectedWorkKeys: ReadonlySet<string>;
}): CodexCodingEffectAttemptLedger {
  const attemptIds = new Set(input.attempts.map((row) => row.attemptId));
  const finalizedWorkKeys = new Set(
    input.attempts
      .filter((row) => row.disposition === "finalized")
      .map((row) => row.workKey),
  );
  let appendTail = Promise.resolve();

  const appendAttempt = (
    row: CodexCodingEffectAttemptRow,
  ): Promise<void> => {
    const previous = appendTail;
    const operation = (async () => {
      await previous;
      const parsed = attemptRowSchema.parse(row);
      assertAttemptSemantics(parsed);
      if (!input.selectedWorkKeys.has(parsed.workKey)) {
        throw new Error(
          `attempt work key is outside selected scope: ${parsed.workKey}`,
        );
      }
      if (attemptIds.has(parsed.attemptId)) {
        throw new Error(`duplicate attempt id ${parsed.attemptId}`);
      }
      if (
        parsed.disposition === "finalized" &&
        finalizedWorkKeys.has(parsed.workKey)
      ) {
        throw new Error(`duplicate finalized attempt for ${parsed.workKey}`);
      }

      await appendFile(
        input.attemptsPath,
        `${serializeAttemptRow(parsed)}\n`,
        "utf8",
      );
      input.attempts.push(parsed);
      attemptIds.add(parsed.attemptId);

      if (parsed.disposition === "infrastructure-failure") {
        input.logger?.("attempt_failed", {
          attemptId: parsed.attemptId,
          executionFailureStage: parsed.result.executionFailureStage,
          workKey: parsed.workKey,
        });
        return;
      }

      const progress = progressFromAttempt(parsed);
      await appendFile(
        input.progressPath,
        `${serializeProgressRow(progress)}\n`,
        "utf8",
      );
      finalizedWorkKeys.add(parsed.workKey);
      input.completed.set(parsed.workKey, progress);
      input.logger?.("stage_finalized", {
        attemptId: parsed.attemptId,
        resolved: parsed.result.resolved,
        workKey: parsed.workKey,
      });
    })();
    appendTail = operation;
    return operation;
  };

  return {
    appendAttempt,
    attempts: input.attempts,
    completed: input.completed,
    nextAttemptId(workKey) {
      assertSelectedWorkKey(workKey, input.selectedWorkKeys);
      const attemptCount = input.attempts.filter(
        (row) => row.workKey === workKey,
      ).length;
      return `${workKey}#attempt-${attemptCount + 1}`;
    },
    shouldRun(workKey) {
      assertSelectedWorkKey(workKey, input.selectedWorkKeys);
      return !input.completed.has(workKey);
    },
  };
}

function parseAttemptRows(
  raw: string,
  label: string,
  selectedWorkKeys: ReadonlySet<string>,
): CodexCodingEffectAttemptRow[] {
  const attempts: CodexCodingEffectAttemptRow[] = [];
  const attemptIds = new Set<string>();
  const finalizedWorkKeys = new Set<string>();
  for (const [index, line] of raw.split("\n").entries()) {
    if (line.trim().length === 0) {
      continue;
    }
    const row = parseAttemptLine(line, `${label}:${index + 1}`);
    if (!selectedWorkKeys.has(row.workKey)) {
      throw new Error(`attempt work key is outside selected scope: ${row.workKey}`);
    }
    if (attemptIds.has(row.attemptId)) {
      throw new Error(`duplicate attempt id ${row.attemptId}`);
    }
    if (
      row.disposition === "finalized" &&
      finalizedWorkKeys.has(row.workKey)
    ) {
      throw new Error(`duplicate finalized attempt for ${row.workKey}`);
    }
    attemptIds.add(row.attemptId);
    if (row.disposition === "finalized") {
      finalizedWorkKeys.add(row.workKey);
    }
    attempts.push(row);
  }
  return attempts;
}

function parseProgressRows(
  raw: string,
  label: string,
  selectedWorkKeys: ReadonlySet<string>,
  attempts: readonly CodexCodingEffectAttemptRow[],
): Map<string, CodexCodingEffectProgressRow> {
  const completed = new Map<string, CodexCodingEffectProgressRow>();
  const attemptsById = new Map(attempts.map((row) => [row.attemptId, row]));
  for (const [index, line] of raw.split("\n").entries()) {
    if (line.trim().length === 0) {
      continue;
    }
    const row = parseProgressLine(line, `${label}:${index + 1}`);
    if (!selectedWorkKeys.has(row.workKey)) {
      throw new Error(`progress work key is outside selected scope: ${row.workKey}`);
    }
    if (completed.has(row.workKey)) {
      throw new Error(`duplicate terminal progress for ${row.workKey}`);
    }
    const attempt = attemptsById.get(row.attemptId);
    if (attempt === undefined) {
      throw new Error(`progress references missing attempt ${row.attemptId}`);
    }
    if (attempt.disposition !== "finalized") {
      throw new Error(`progress references non-finalized attempt ${row.attemptId}`);
    }
    if (
      attempt.workKey !== row.workKey ||
      attempt.result.resolved !== row.resolved
    ) {
      throw new Error(`progress does not match finalized attempt ${row.attemptId}`);
    }
    completed.set(row.workKey, row);
  }
  return completed;
}

function parseAttemptLine(
  line: string,
  label: string,
): CodexCodingEffectAttemptRow {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new Error(`invalid attempt row at ${label}`, { cause: error });
  }
  try {
    return parseCodexCodingEffectAttemptRow(value);
  } catch (error) {
    throw new Error(`invalid attempt row at ${label}`, { cause: error });
  }
}

function parseProgressLine(
  line: string,
  label: string,
): CodexCodingEffectProgressRow {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new Error(`invalid progress row at ${label}`, { cause: error });
  }
  const result = progressRowSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`invalid progress row at ${label}`);
  }
  return result.data;
}

function assertAttemptSemantics(row: CodexCodingEffectAttemptRow): void {
  if (row.disposition === "infrastructure-failure") {
    if (
      row.result.executionFailureStage === null ||
      row.result.resolved ||
      row.result.taskFailureReasons.length > 0
    ) {
      throw new Error(
        "infrastructure-failure attempt has inconsistent result semantics",
      );
    }
    return;
  }

  if (row.result.executionFailureStage !== null) {
    throw new Error("finalized attempt cannot have an execution failure stage");
  }
  if (row.result.resolved && row.result.taskFailureReasons.length > 0) {
    throw new Error("resolved attempt cannot have task failure reasons");
  }
  if (!row.result.resolved && row.result.taskFailureReasons.length === 0) {
    throw new Error("unresolved finalized attempt requires task failure reasons");
  }
}

function progressFromAttempt(
  attempt: CodexCodingEffectAttemptRow,
): CodexCodingEffectProgressRow {
  return {
    attemptId: attempt.attemptId,
    resolved: attempt.result.resolved,
    schemaVersion: 1,
    workKey: attempt.workKey,
  };
}

function trimTornProgressTail(raw: string): string {
  if (raw.length === 0 || raw.endsWith("\n")) {
    return raw;
  }
  const finalLineStart = raw.lastIndexOf("\n") + 1;
  try {
    JSON.parse(raw.slice(finalLineStart));
    return raw;
  } catch {
    return raw.slice(0, finalLineStart);
  }
}

async function readRequiredIdentity(path: string): Promise<string> {
  const value = await readOptionalFile(path);
  if (value === null) {
    throw new Error("resume requires an existing run identity");
  }
  return value;
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
}

function assertSelectedWorkKey(
  workKey: string,
  selectedWorkKeys: ReadonlySet<string>,
): void {
  if (!selectedWorkKeys.has(workKey)) {
    throw new Error(`work key is outside selected scope: ${workKey}`);
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT";
}
