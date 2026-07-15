import { createHash } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  parseCodexCodingEffectAttemptRow,
} from "./attempts";
import type { CodexCodingEffectAttemptRow } from "./attempts";
import {
  parseCodexCodingEffectCaseResult,
} from "./reporting";
import type { CodexCodingEffectCaseResult } from "./reporting";
import type { CodexRunResult } from "./codex-runner";
import type { WorkspacePatch } from "./patch";
import {
  scoreCodexStage,
} from "./test-scoring";
import type {
  EvaluatorTestResult,
} from "./test-scoring";

const EVIDENCE_KEYS = [
  "attempt",
  "caseResult",
  "codexStderr",
  "codexStdout",
  "failToPassStderr",
  "failToPassStdout",
  "passToPassStderr",
  "passToPassStdout",
  "patchDiff",
  "schemaVersion",
] as const;

export interface CodexCodingEffectStageEvidence {
  attempt: CodexCodingEffectAttemptRow;
  caseResult: CodexCodingEffectCaseResult;
  codexStderr: string;
  codexStdout: string;
  failToPassStderr: string;
  failToPassStdout: string;
  passToPassStderr: string;
  passToPassStdout: string;
  patchDiff: string;
  schemaVersion: 1;
}

export async function persistCodexCodingEffectStageEvidence(
  directory: string,
  evidence: CodexCodingEffectStageEvidence,
): Promise<void> {
  const parsed = parseCodexCodingEffectStageEvidence(evidence);
  const key = evidenceKey(parsed.attempt.attemptId);
  const finalPath = join(directory, `${key}.json`);
  const temporaryPath = join(directory, `${key}.tmp`);
  const bytes = `${JSON.stringify(parsed, null, 2)}\n`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, bytes, { encoding: "utf8", flag: "wx" });
  try {
    await link(temporaryPath, finalPath);
  } finally {
    await unlinkIfPresent(temporaryPath);
  }
}

export async function loadCodexCodingEffectStageEvidence(
  directory: string,
): Promise<CodexCodingEffectStageEvidence[]> {
  if (!await pathExists(directory)) {
    return [];
  }

  const initialEntries = await readdir(directory, { withFileTypes: true });
  for (const entry of initialEntries) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.(?:json|tmp)$/u.test(entry.name)) {
      throw new Error(`invalid stage-evidence artifact ${entry.name}`);
    }
    if (entry.name.endsWith(".tmp")) {
      await recoverTemporaryEvidence(directory, entry.name);
    }
  }

  const evidence: CodexCodingEffectStageEvidence[] = [];
  const attemptIds = new Set<string>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      throw new Error(`invalid stage-evidence artifact ${entry.name}`);
    }
    const parsed = parseEvidenceBytes(
      await readFile(join(directory, entry.name), "utf8"),
      entry.name,
    );
    if (`${evidenceKey(parsed.attempt.attemptId)}.json` !== entry.name) {
      throw new Error(`stage-evidence filename does not match ${entry.name}`);
    }
    if (attemptIds.has(parsed.attempt.attemptId)) {
      throw new Error(`duplicate stage evidence ${parsed.attempt.attemptId}`);
    }
    attemptIds.add(parsed.attempt.attemptId);
    evidence.push(parsed);
  }
  return evidence.sort((left, right) =>
    left.attempt.attemptId.localeCompare(right.attempt.attemptId)
  );
}

export function parseCodexCodingEffectStageEvidence(
  value: unknown,
): CodexCodingEffectStageEvidence {
  if (!isRecord(value)) {
    throw new Error("invalid Codex coding-effect stage evidence");
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...EVIDENCE_KEYS].sort())) {
    throw new Error("invalid Codex coding-effect stage evidence keys");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("invalid Codex coding-effect stage evidence version");
  }

  const attempt = parseCodexCodingEffectAttemptRow(value.attempt);
  const caseResult = parseCodexCodingEffectCaseResult(value.caseResult);
  const strings = {
    codexStderr: stringValue(value.codexStderr, "codexStderr"),
    codexStdout: stringValue(value.codexStdout, "codexStdout"),
    failToPassStderr: stringValue(
      value.failToPassStderr,
      "failToPassStderr",
    ),
    failToPassStdout: stringValue(
      value.failToPassStdout,
      "failToPassStdout",
    ),
    passToPassStderr: stringValue(
      value.passToPassStderr,
      "passToPassStderr",
    ),
    passToPassStdout: stringValue(
      value.passToPassStdout,
      "passToPassStdout",
    ),
    patchDiff: stringValue(value.patchDiff, "patchDiff"),
  };
  assertAttemptMatchesCase(attempt, caseResult);
  const patchSha256 = strings.patchDiff.length === 0
    ? null
    : createHash("sha256").update(strings.patchDiff).digest("hex");
  if (patchSha256 !== caseResult.patchSha256) {
    throw new Error("stage evidence patch does not match its case result");
  }
  assertScoringSemantics(attempt, caseResult, strings.patchDiff);

  return {
    attempt,
    caseResult,
    ...strings,
    schemaVersion: 1,
  };
}

function assertScoringSemantics(
  attempt: CodexCodingEffectAttemptRow,
  caseResult: CodexCodingEffectCaseResult,
  patchDiff: string,
): void {
  const expected = scoreCodexStage({
    codex: codexResultFromCase(caseResult),
    failToPass: testResultFromCase(caseResult, "fail-to-pass"),
    passToPass: testResultFromCase(caseResult, "pass-to-pass"),
    patch: patchFromCase(caseResult, patchDiff),
  });
  if (
    expected.disposition !== attempt.disposition ||
    expected.executionFailureStage !==
      attempt.result.executionFailureStage ||
    expected.resolved !== attempt.result.resolved ||
    JSON.stringify(expected.taskFailureReasons) !==
      JSON.stringify(attempt.result.taskFailureReasons)
  ) {
    throw new Error("stage evidence scoring semantics are inconsistent");
  }
}

function codexResultFromCase(
  row: CodexCodingEffectCaseResult,
): CodexRunResult {
  return {
    durationMs: 0,
    events: [],
    exitCode: row.codexStatus === "spawn-failed"
      ? null
      : row.codexStatus === "non-zero-exit"
      ? 1
      : 0,
    normalized: null,
    status: row.codexStatus,
    stderr: "",
    stdout: "",
    timedOut: row.codexStatus === "timed-out",
  };
}

function testResultFromCase(
  row: CodexCodingEffectCaseResult,
  kind: "fail-to-pass" | "pass-to-pass",
): EvaluatorTestResult {
  const status = kind === "fail-to-pass"
    ? row.failToPassStatus
    : row.passToPassStatus;
  return {
    command: [],
    durationMs: 0,
    exitCode: status === "infrastructure-failure"
      ? null
      : status === "failed"
      ? 1
      : 0,
    kind,
    status,
    stderr: "",
    stdout: "",
  };
}

function patchFromCase(
  row: CodexCodingEffectCaseResult,
  patchDiff: string,
): WorkspacePatch {
  return {
    baseCommit: "0".repeat(40),
    changedFiles: row.changedFiles,
    diff: patchDiff,
    forbiddenFiles: row.forbiddenFiles,
    hasPatch: row.patchSha256 !== null,
    sha256: row.patchSha256,
    untrackedFiles: [],
  };
}

function assertAttemptMatchesCase(
  attempt: CodexCodingEffectAttemptRow,
  caseResult: CodexCodingEffectCaseResult,
): void {
  if (
    attempt.attemptId !== caseResult.attemptId ||
    attempt.workKey !== caseResult.workKey ||
    attempt.disposition !== caseResult.disposition ||
    attempt.result.executionFailureStage !==
      caseResult.executionFailureStage ||
    attempt.result.resolved !== caseResult.resolved ||
    JSON.stringify(attempt.result.taskFailureReasons) !==
      JSON.stringify(caseResult.taskFailureReasons)
  ) {
    throw new Error("stage evidence attempt does not match its case result");
  }
}

async function recoverTemporaryEvidence(
  directory: string,
  temporaryName: string,
): Promise<void> {
  const temporaryPath = join(directory, temporaryName);
  const finalPath = join(directory, temporaryName.replace(/\.tmp$/u, ".json"));
  const temporaryBytes = await readFile(temporaryPath, "utf8");
  parseEvidenceBytes(temporaryBytes, temporaryName);
  if (await pathExists(finalPath)) {
    if (await readFile(finalPath, "utf8") !== temporaryBytes) {
      throw new Error(`stage-evidence temp conflicts with ${finalPath}`);
    }
  } else {
    await link(temporaryPath, finalPath);
  }
  await unlink(temporaryPath);
}

function parseEvidenceBytes(
  raw: string,
  label: string,
): CodexCodingEffectStageEvidence {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid stage evidence ${label}`, { cause: error });
  }
  try {
    return parseCodexCodingEffectStageEvidence(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid stage evidence ${label}: ${detail}`, {
      cause: error,
    });
  }
}

function evidenceKey(attemptId: string): string {
  return createHash("sha256").update(attemptId).digest("hex");
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`stage evidence ${field} must be a string`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) {
      throw error;
    }
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code;
}
