import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  normalizeC3CodexArgvForEvidence,
} from "./c3-arms";
import type { C3HostConfigurationEvidence } from "./c3-host-configuration";
import type { C3HostPreflightEvidence } from "./c3-host-preflight";
import type { C3FrozenPrehistoryPilotSummary } from "./c3-reporting";
import type {
  C3EvaluatorSecurityContract,
  C3InstalledArmRuntime,
  C3NoMemoryArmRuntime,
  C3PermissionIsolationEvidence,
} from "./c3-runtime";
import type { FrozenPrehistoryLeakageAudit } from "./frozen-prehistory";
import type { C3GoodMemorySourceProvenance } from "./c3-source-provenance";

export interface C3RunIdentity extends Record<string, unknown> {
  evidenceClass: "frozen-prehistory-pilot";
  baseHealthSha256: string;
  goodMemorySource: C3GoodMemorySourceProvenance;
  hostConfigurationsSha256: string;
  hostPreflightSha256: string;
  runId: string;
  runnerSource: C3GoodMemorySourceProvenance;
  schemaVersion: 1;
}

export async function buildC3RunIdentity(input: {
  baseHealthBytes: string;
  goodMemorySource: C3GoodMemorySourceProvenance;
  hostConfigurationsBytes: string;
  hostConfigurations: C3HostConfigurationEvidence;
  hostPreflight: C3HostPreflightEvidence;
  hostPreflightBytes: string;
  evaluatorSecurity: C3EvaluatorSecurityContract;
  input: {
    authFile: string;
    episodeId: string;
    evaluatorFiles: ReadonlyArray<{ relativePath: string; sha256: string }>;
    expectedCommit: string;
    failToPassCommand: readonly string[];
    generatedAt: string;
    historySourceSha256: string;
    model: string;
    passToPassCommand: readonly string[];
    prompt: string;
    reasoningEffort: string;
    repetition: number;
    runId: string;
    seed: number;
    stageId: string;
    stageTimeoutMs: number;
    testTimeoutMs: number;
  };
  installedArgs: readonly string[];
  installedPermissionIsolation: C3PermissionIsolationEvidence;
  installedRuntime: C3InstalledArmRuntime;
  noMemoryArgs: readonly string[];
  noMemoryPermissionIsolation: C3PermissionIsolationEvidence;
  noMemoryRuntime: C3NoMemoryArmRuntime;
  promptLeakageAudit: FrozenPrehistoryLeakageAudit;
  runnerSource: C3GoodMemorySourceProvenance;
}): Promise<C3RunIdentity> {
  const installedArgv = normalizeC3CodexArgvForEvidence(
    input.installedArgs,
    {
      prompt: input.input.prompt,
      workspaceRoot: input.installedRuntime.plan.paths.workspace,
    },
  );
  const noMemoryArgv = normalizeC3CodexArgvForEvidence(
    input.noMemoryArgs,
    {
      prompt: input.input.prompt,
      workspaceRoot: input.noMemoryRuntime.plan.paths.workspace,
    },
  );
  return {
    armOrder: ["no-memory", "goodmemory-installed"],
    arms: {
      goodmemoryInstalled: {
        normalizedArgv: installedArgv,
        normalizedArgvSha256: sha256(JSON.stringify(installedArgv)),
        package: input.installedRuntime.package,
        paths: input.installedRuntime.plan.paths,
        permissionIsolation: input.installedPermissionIsolation,
        permissionProfile: input.installedRuntime.permissionProfile,
        profile: input.installedRuntime.profile,
        scopes: input.installedRuntime.plan.scopes,
      },
      noMemory: {
        absenceAudit: input.noMemoryRuntime.isolation,
        normalizedArgv: noMemoryArgv,
        normalizedArgvSha256: sha256(JSON.stringify(noMemoryArgv)),
        paths: input.noMemoryRuntime.plan.paths,
        permissionIsolation: input.noMemoryPermissionIsolation,
        permissionProfile: input.noMemoryRuntime.permissionProfile,
        scopes: input.noMemoryRuntime.plan.scopes,
      },
    },
    authSha256: await sha256File(input.input.authFile),
    baseHealthSha256: sha256(input.baseHealthBytes),
    codex: {
      executableSha256: input.noMemoryRuntime.codex.executableSha256,
      model: input.input.model,
      permissionProfile: "c3-task",
      reasoningEffort: input.input.reasoningEffort,
      version: input.noMemoryRuntime.codex.version,
    },
    episodeId: input.input.episodeId,
    evaluator: {
      failToPassCommand: input.input.failToPassCommand,
      files: [...input.input.evaluatorFiles].sort((first, second) =>
        first.relativePath.localeCompare(second.relativePath)
      ),
      materialization: "after-both-codex-processes",
      passToPassCommand: input.input.passToPassCommand,
      security: input.evaluatorSecurity,
    },
    evidenceClass: "frozen-prehistory-pilot",
    expectedCommit: input.input.expectedCommit,
    generatedAt: input.input.generatedAt,
    goodMemorySource: input.goodMemorySource,
    historyMaterialization: "after-no-memory-process",
    historySourceSha256: input.input.historySourceSha256,
    hostConfigurationDiffSha256: sha256(
      JSON.stringify(input.hostConfigurations.normalizedDiff),
    ),
    hostConfigurationsSha256: sha256(input.hostConfigurationsBytes),
    hostPreflightSha256: sha256(input.hostPreflightBytes),
    instructionSha256: input.noMemoryRuntime.instructionSha256,
    invocation: {
      approval: "never",
      json: true,
      model: input.hostPreflight.codex.model,
      permissionProfile: "c3-task",
      promptSha256: sha256(input.input.prompt),
      reasoningEffort: input.hostPreflight.codex.reasoningEffort,
      strictConfig: true,
      treatment: {
        goodmemoryInstalled: ["enable-hooks", "bypass-hook-trust"],
        noMemory: ["disable-hooks"],
      },
    },
    leakageAudit: {
      algorithmVersion: 1,
      promptSourceSha256: input.promptLeakageAudit.sourceSha256,
    },
    promptSha256: sha256(input.input.prompt),
    repetition: input.input.repetition,
    runId: input.input.runId,
    runnerSource: input.runnerSource,
    schemaVersion: 1,
    seed: input.input.seed,
    stageId: input.input.stageId,
    stageTimeoutMs: input.input.stageTimeoutMs,
    testTimeoutMs: input.input.testTimeoutMs,
  };
}

export function buildC3AuditEvidence(input: {
  evaluatorSecuritySha256: string | null;
  identity: C3RunIdentity;
  postRunSource: C3GoodMemorySourceProvenance;
  postRunRunnerSource: C3GoodMemorySourceProvenance;
  summary: C3FrozenPrehistoryPilotSummary;
  summaryBytes: string;
}): Record<string, unknown> {
  return {
    evidenceClass: input.identity.evidenceClass,
    evaluatorSecuritySha256: input.evaluatorSecuritySha256,
    baseHealthSha256: input.identity.baseHealthSha256,
    goodMemorySource: input.identity.goodMemorySource,
    hostConfigurationDiffSha256: input.identity.hostConfigurationDiffSha256,
    hostConfigurationsSha256: input.identity.hostConfigurationsSha256,
    hostPreflightSha256: input.identity.hostPreflightSha256,
    outcome: input.summary.outcome,
    publicClaimEligible: input.summary.publicClaimEligible,
    runId: input.identity.runId,
    runnerSource: input.identity.runnerSource,
    runnerSourceStatePostRunSha256:
      input.postRunRunnerSource.sourceStateSha256,
    runnerStable:
      input.postRunRunnerSource.commit === input.identity.runnerSource.commit &&
      input.postRunRunnerSource.tree === input.identity.runnerSource.tree &&
      input.postRunRunnerSource.sourceStateSha256 ===
        input.identity.runnerSource.sourceStateSha256,
    schemaVersion: 1,
    sourceRunIdentitySha256: sha256(
      `${JSON.stringify(input.identity, null, 2)}\n`,
    ),
    sourceCasesSha256: input.summary.sourceCasesSha256,
    sourceStable:
      input.postRunSource.commit === input.identity.goodMemorySource.commit &&
      input.postRunSource.tree === input.identity.goodMemorySource.tree &&
      input.postRunSource.sourceStateSha256 ===
        input.identity.goodMemorySource.sourceStateSha256,
    sourceStatePostRunSha256: input.postRunSource.sourceStateSha256,
    summarySha256: sha256(input.summaryBytes),
  };
}

async function sha256File(path: string): Promise<string> {
  return sha256(await readFile(path));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
