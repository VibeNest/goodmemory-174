import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  parseCodexCodingEffectAttemptRow,
} from "./attempts";
import type { CodexCodingEffectAttemptRow } from "./attempts";
import {
  parseCodexCodingEffectCaseResult,
} from "./reporting";
import type { CodexCodingEffectCaseResult } from "./reporting";
import {
  parseCodexCodingEffectStageEvidence,
} from "./stage-evidence";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const absenceAuditSchema = z.object({
  codexHomeEntryNames: z.array(z.string()),
  goodMemoryFileCount: z.literal(0),
  hookConfigPresent: z.literal(false),
  mcpConfigPresent: z.literal(false),
  passed: z.literal(true),
  preexistingSessionCount: z.literal(0),
  reasons: z.array(z.string()).length(0),
}).strict();

const permissionIsolationSchema = z.object({
  audit: z.object({
    configSha256: sha256Schema,
    deniedReads: z.array(z.object({
      denied: z.literal(true),
      exitCode: z.number().int().nullable(),
      label: z.string().min(1),
      pathSha256: sha256Schema,
    }).strict()).min(1),
    networkAccess: z.literal(false),
    passed: z.literal(true),
    profileName: z.literal("c3-task"),
    reasons: z.array(z.string()).length(0),
    schemaVersion: z.literal(1),
    workspaceRead: z.literal(true),
    workspaceWrite: z.literal(true),
  }).strict(),
  evidenceSha256: sha256Schema,
}).strict();

const seedReceiptSchema = z.object({
  historySourceSha256: sha256Schema,
  memoryExportSha256: sha256Schema,
  rawTranscriptPersisted: z.literal(false),
  schemaVersion: z.literal(1),
  seedSurface: z.literal("codex-writeback-from-rollout"),
  sourceSessionDigest: z.string().min(1),
  writebackOutcome: z.literal("written"),
  writtenMemoryIds: z.array(z.string().min(1)).min(1),
}).strict();

const passedRecallPreflightSchema = z.object({
  expectedMemoryIds: z.array(z.string().min(1)).min(1),
  injectedMemoryIds: z.array(z.string().min(1)).min(1),
  outputSha256: sha256Schema,
  passed: z.literal(true),
  schemaVersion: z.literal(1),
  sourceProjectionSha256: sha256Schema.optional(),
  stateSha256: sha256Schema,
}).strict();

const failedRecallPreflightSchema = z.object({
  expectedMemoryIds: z.array(z.string().min(1)).min(1),
  injectedMemoryIds: z.array(z.string().min(1)),
  outputSha256: sha256Schema.nullable(),
  passed: z.literal(false),
  reason: z.string().min(1),
  schemaVersion: z.literal(1),
  sourceProjectionSha256: sha256Schema.optional(),
  stateSha256: sha256Schema.nullable(),
}).strict();

const recallPreflightSchema = z.discriminatedUnion("passed", [
  passedRecallPreflightSchema,
  failedRecallPreflightSchema,
]);

const hostCanarySchema = z.object({
  expectedMemoryIds: z.array(z.string().min(1)).min(1),
  failureStage: z.string().min(1).nullable(),
  injectedExpectedMemoryIds: z.array(z.string().min(1)),
  passed: z.boolean(),
  rawTranscriptPersisted: z.literal(false),
  reasons: z.array(z.string().min(1)),
  sessionDigest: z.string().min(1),
  stateEvidenceSha256: sha256Schema,
  stopCursorAdvanced: z.boolean(),
  terminalWritebackStatuses: z.array(z.string().min(1)),
  threadId: z.string().min(1),
  transcriptSourceSha256: sha256Schema,
}).strict();

const noMemoryArmEvidenceSchema = z.object({
  absenceAudit: absenceAuditSchema,
  arm: z.literal("no-memory"),
  historyExposure: z.literal("none"),
  historySourceSha256: sha256Schema,
  instructionSha256: sha256Schema,
  permissionIsolation: permissionIsolationSchema,
  schemaVersion: z.literal(1),
  threadId: z.string().min(1).nullable(),
}).strict();

const installedArmEvidenceSchema = z.object({
  arm: z.literal("goodmemory-installed"),
  historyExposure: z.literal("goodmemory-installed"),
  historySourceSha256: sha256Schema,
  hostCanary: hostCanarySchema.nullable(),
  instructionSha256: sha256Schema,
  permissionIsolation: permissionIsolationSchema,
  package: z.object({
    sha256: sha256Schema,
    version: z.string().min(1),
  }).strict(),
  profile: z.object({
    activationMode: z.literal("global"),
    hookRegistered: z.literal(true),
    mcpRegistered: z.literal(true),
    persistRawTranscript: z.literal(false),
    retrievalProfile: z.literal("coding_agent"),
    workspaceStatus: z.literal("ok"),
    writebackMode: z.literal("selective"),
  }).strict(),
  recallPreflight: recallPreflightSchema,
  schemaVersion: z.literal(1),
  seedReceipt: seedReceiptSchema,
}).strict();

const armEvidenceSchema = z.discriminatedUnion("arm", [
  noMemoryArmEvidenceSchema,
  installedArmEvidenceSchema,
]);

const evidenceEnvelopeSchema = z.object({
  armEvidence: z.unknown(),
  attempt: z.unknown(),
  caseResult: z.unknown(),
  codexStderr: z.string(),
  codexStdout: z.string(),
  failToPassStderr: z.string(),
  failToPassStdout: z.string(),
  passToPassStderr: z.string(),
  passToPassStdout: z.string(),
  patchDiff: z.string(),
  schemaVersion: z.literal(1),
}).strict();

export type C3ArmStageEvidence = z.infer<typeof armEvidenceSchema>;

export interface C3PilotStageEvidence {
  armEvidence: C3ArmStageEvidence;
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

export function parseC3PilotStageEvidence(
  value: unknown,
): C3PilotStageEvidence {
  const envelope = evidenceEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    throw new Error("invalid C3 pilot stage evidence");
  }
  const armEvidenceResult = armEvidenceSchema.safeParse(
    envelope.data.armEvidence,
  );
  if (!armEvidenceResult.success) {
    throw new Error("invalid C3 arm evidence");
  }
  const armEvidence = armEvidenceResult.data;
  if (armEvidence.arm === "goodmemory-installed") {
    assertInstalledArmSemantics(armEvidence);
  }

  const attempt = parseCodexCodingEffectAttemptRow(envelope.data.attempt);
  const caseResult = parseCodexCodingEffectCaseResult(envelope.data.caseResult);
  if (caseResult.arm !== armEvidence.arm) {
    throw new Error("C3 arm evidence does not match the case arm");
  }
  const baseEvidence = {
    attempt,
    caseResult,
    codexStderr: envelope.data.codexStderr,
    codexStdout: envelope.data.codexStdout,
    failToPassStderr: envelope.data.failToPassStderr,
    failToPassStdout: envelope.data.failToPassStdout,
    passToPassStderr: envelope.data.passToPassStderr,
    passToPassStdout: envelope.data.passToPassStdout,
    patchDiff: envelope.data.patchDiff,
    schemaVersion: 1 as const,
  };

  if (
    armEvidence.arm === "goodmemory-installed" &&
    (armEvidence.hostCanary === null || !armEvidence.hostCanary.passed)
  ) {
    assertFailedCanaryEvidence(
      baseEvidence,
      armEvidence.hostCanary?.failureStage ?? "goodmemory-recall-preflight",
    );
  } else {
    parseCodexCodingEffectStageEvidence(baseEvidence);
  }
  return { armEvidence, ...baseEvidence };
}

export async function persistC3PilotStageEvidence(
  directory: string,
  evidence: C3PilotStageEvidence,
): Promise<string> {
  const parsed = parseC3PilotStageEvidence(evidence);
  const key = createHash("sha256")
    .update(parsed.attempt.attemptId)
    .digest("hex");
  const path = join(directory, `${key}.json`);
  await mkdir(directory, { recursive: true });
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return path;
}

function assertInstalledArmSemantics(
  evidence: z.infer<typeof installedArmEvidenceSchema>,
): void {
  const { hostCanary, recallPreflight, seedReceipt } = evidence;
  if (
    evidence.historySourceSha256 !== seedReceipt.historySourceSha256 ||
    !sameUniqueValues(
      recallPreflight.expectedMemoryIds,
      seedReceipt.writtenMemoryIds,
    )
  ) {
    throw new Error("invalid C3 installed arm evidence");
  }
  if (!recallPreflight.passed) {
    if (
      hostCanary !== null ||
      recallPreflight.injectedMemoryIds.some((memoryId) =>
        !seedReceipt.writtenMemoryIds.includes(memoryId)
      )
    ) {
      throw new Error("invalid C3 installed arm evidence");
    }
    return;
  }
  if (
    hostCanary === null ||
    !sameUniqueValues(hostCanary.expectedMemoryIds, seedReceipt.writtenMemoryIds) ||
    !sameUniqueValues(
      recallPreflight.injectedMemoryIds,
      seedReceipt.writtenMemoryIds,
    )
  ) {
    throw new Error("invalid C3 installed arm evidence");
  }
  if (hostCanary.passed) {
    if (
      hostCanary.failureStage !== null ||
      hostCanary.reasons.length > 0 ||
      !sameUniqueValues(
        hostCanary.injectedExpectedMemoryIds,
        hostCanary.expectedMemoryIds,
      ) ||
      !hostCanary.stopCursorAdvanced ||
      !hostCanary.terminalWritebackStatuses.includes("committed")
    ) {
      throw new Error("invalid C3 installed arm evidence");
    }
    return;
  }
  if (hostCanary.failureStage === null || hostCanary.reasons.length === 0) {
    throw new Error("invalid C3 installed arm evidence");
  }
}

function assertFailedCanaryEvidence(
  evidence: Omit<C3PilotStageEvidence, "armEvidence">,
  failureStage: string | null,
): void {
  if (
    failureStage === null ||
    evidence.attempt.disposition !== "infrastructure-failure" ||
    evidence.caseResult.disposition !== "infrastructure-failure" ||
    evidence.attempt.result.executionFailureStage !== failureStage ||
    evidence.caseResult.executionFailureStage !== failureStage ||
    evidence.attempt.result.resolved ||
    evidence.caseResult.resolved ||
    evidence.attempt.result.taskFailureReasons.length > 0 ||
    evidence.caseResult.taskFailureReasons.length > 0
  ) {
    throw new Error("failed C3 canary has inconsistent stage semantics");
  }
  if (
    evidence.attempt.attemptId !== evidence.caseResult.attemptId ||
    evidence.attempt.workKey !== evidence.caseResult.workKey
  ) {
    throw new Error("failed C3 canary attempt does not match its case");
  }
  if (
    failureStage === "goodmemory-recall-preflight" &&
    evidence.caseResult.codexStatus !== "not-started"
  ) {
    throw new Error(
      "failed C3 recall preflight did not prevent Codex launch",
    );
  }
  const patchSha256 = evidence.patchDiff.length === 0
    ? null
    : createHash("sha256").update(evidence.patchDiff).digest("hex");
  if (patchSha256 !== evidence.caseResult.patchSha256) {
    throw new Error("failed C3 canary patch does not match its case");
  }
}

function sameUniqueValues(
  first: readonly string[],
  second: readonly string[],
): boolean {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  return firstSet.size === first.length &&
    secondSet.size === second.length &&
    firstSet.size === secondSet.size &&
    [...firstSet].every((value) => secondSet.has(value));
}
