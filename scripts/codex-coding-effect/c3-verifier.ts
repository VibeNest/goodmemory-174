import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { z } from "zod";

import {
  buildC3CodexArgs,
  normalizeC3CodexTreatmentArgs,
} from "./c3-arms";
import {
  assertC3BaseHealthPassed,
  parseC3BaseHealthEvidence,
  runC3BaseHealthProbe,
} from "./c3-base-health";
import {
  cleanupC3ControlledPilotFixture,
  prepareC3ControlledPilotFixture,
} from "./c3-controlled-pilot";
import {
  verifyC3EvaluatorFiles,
} from "./c3-evaluator";
import {
  buildC3HostConfigurationEvidence,
} from "./c3-host-configuration";
import type {
  C3HostConfigurationEvidence,
} from "./c3-host-configuration";
import {
  parseC3HostPreflightEvidence,
} from "./c3-host-preflight";
import {
  C3_BASE_DENIED_READ_LABELS,
  C3_INSTALLED_DENIED_READ_LABELS,
} from "./c3-permission-isolation";
import {
  C3_EVALUATOR_DENIED_PATH_LABELS,
} from "./c3-runtime";
import {
  parseC3ProjectionManifest,
} from "./c3-projection";
import type { C3ProjectionManifest } from "./c3-projection";
import {
  buildC3FrozenPrehistoryPilotSummary,
  parseC3FrozenPrehistoryPilotSummary,
} from "./c3-reporting";
import {
  assertC3GoodMemorySourceClean,
  collectC3GoodMemorySourceProvenance,
} from "./c3-source-provenance";
import type {
  C3CollectedSourceProvenance,
} from "./c3-source-provenance";
import {
  parseC3PilotStageEvidence,
} from "./c3-stage-evidence";
import type { C3PilotStageEvidence } from "./c3-stage-evidence";
import {
  applyWorkspacePatch,
} from "./patch";
import {
  parseCodexCodingEffectCaseResult,
  serializeCodexCodingEffectCases,
} from "./reporting";
import type { CodexCodingEffectCaseResult } from "./reporting";
import {
  runEvaluatorTest,
} from "./test-scoring";
import {
  prepareC3IsolatedClone,
} from "./c3-workspace";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const gitObjectSchema = z.string().regex(/^[a-f0-9]{40}$/u);

const evaluatorSecurityPathCommitmentSchema = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
  pathSha256: sha256Schema,
}).strict();

const evaluatorSecurityArmContractSchema = z.object({
  copiedAuth: evaluatorSecurityPathCommitmentSchema,
  evaluationWorkspace: evaluatorSecurityPathCommitmentSchema,
  evaluatorRoot: evaluatorSecurityPathCommitmentSchema,
  expectedConfigSha256: sha256Schema,
  sandboxRoot: evaluatorSecurityPathCommitmentSchema,
}).strict();

const evaluatorSecurityContractSchema = z.object({
  arms: z.object({
    goodmemoryInstalled: evaluatorSecurityArmContractSchema,
    noMemory: evaluatorSecurityArmContractSchema,
  }).strict(),
  credentialRemoval: z.literal(
    "after-both-codex-before-evaluator-materialization",
  ),
  deniedPaths: z.array(evaluatorSecurityPathCommitmentSchema).min(1),
  evidencePath: z.literal("evaluator-security.sanitized.json"),
  profileName: z.literal("c3-evaluator"),
  requirements: z.object({
    configWriteDenied: z.literal(true),
    copiedAuthRemovedBeforeEvaluator: z.literal(true),
    evaluatorRead: z.literal(true),
    evaluatorWriteDenied: z.literal(true),
    networkAccess: z.literal(false),
    networkDenied: z.literal(true),
    networkPositiveControl: z.literal(true),
    originalAuthAliasDenied: z.literal(true),
    originalAuthDenied: z.literal(true),
    workspaceRead: z.literal(true),
    workspaceWrite: z.literal(true),
  }).strict(),
  schemaVersion: z.literal(1),
  sourceEvaluatorRoot: evaluatorSecurityPathCommitmentSchema,
}).strict();

const credentialRevocationSchema = (
  arm: "goodmemory-installed" | "no-memory",
) => z.object({
  arm: z.literal(arm),
  auth: evaluatorSecurityPathCommitmentSchema,
  copiedAuthRemovedBeforeEvaluator: z.literal(true),
  phase: z.literal(
    "after-both-codex-before-evaluator-materialization",
  ),
  schemaVersion: z.literal(1),
}).strict();

const evaluatorSandboxEvidenceSchema = z.object({
  configSha256: sha256Schema,
  configWriteDenied: z.literal(true),
  copiedAuthRemovedBeforeEvaluator: z.literal(true),
  evaluatorRead: z.literal(true),
  evaluatorRoot: evaluatorSecurityPathCommitmentSchema,
  evaluatorWriteDenied: z.literal(true),
  networkAccess: z.literal(false),
  networkDenied: z.literal(true),
  networkPositiveControl: z.literal(true),
  originalAuthAliasDenied: z.literal(true),
  originalAuthDenied: z.literal(true),
  profileName: z.literal("c3-evaluator"),
  schemaVersion: z.literal(1),
  workspaceRead: z.literal(true),
  workspaceWrite: z.literal(true),
}).strict();

const evaluatorSecurityEvidenceSchema = z.object({
  contract: evaluatorSecurityContractSchema,
  credentialRevocations: z.object({
    goodmemoryInstalled: credentialRevocationSchema(
      "goodmemory-installed",
    ),
    noMemory: credentialRevocationSchema("no-memory"),
  }).strict(),
  sandboxes: z.object({
    goodmemoryInstalled: evaluatorSandboxEvidenceSchema,
    noMemory: evaluatorSandboxEvidenceSchema,
  }).strict(),
  schemaVersion: z.literal(1),
}).strict();

const sourceProvenanceSchema = z.object({
  commit: gitObjectSchema,
  dirty: z.literal(false),
  dirtyStateBytes: z.number().int().positive(),
  dirtyStateSha256: sha256Schema,
  sourceStateBytes: z.number().int().positive(),
  sourceStateSha256: sha256Schema,
  statusSha256: sha256Schema,
  trackedDiffSha256: sha256Schema,
  tree: gitObjectSchema,
  untrackedFiles: z.array(z.unknown()).length(0),
}).strict();

const armPathsSchema = z.object({
  armRoot: z.string().min(1),
  cache: z.string().min(1),
  codexHome: z.string().min(1),
  home: z.string().min(1),
  packagePrefix: z.string().min(1).optional(),
  result: z.string().min(1),
  temp: z.string().min(1),
  workspace: z.string().min(1),
}).strict();

const armScopesSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
}).strict();

const permissionProfileSchema = z.object({
  configSha256: sha256Schema,
  filesystemDefault: z.literal("deny"),
  minimalRead: z.literal(true),
  name: z.literal("c3-task"),
  networkAccess: z.literal(false),
  workspaceWrite: z.literal(true),
}).strict();

const permissionIsolationSchema = z.object({
  audit: z.object({
    configSha256: sha256Schema,
    deniedReads: z.array(z.object({
      denied: z.literal(true),
      exitCode: z.number().int().nullable(),
      label: z.string().min(1),
      path: z.string().min(1),
      pathSha256: sha256Schema,
    }).strict()).min(1),
    networkAccess: z.literal(false),
    networkDenied: z.literal(true),
    networkPositiveControl: z.literal(true),
    passed: z.literal(true),
    phase: z.enum(["pre-launch", "pre-seed", "preflight"]),
    profileName: z.literal("c3-task"),
    reasons: z.array(z.string()).length(0),
    schemaVersion: z.literal(1),
    workspaceRead: z.literal(true),
    workspaceWrite: z.literal(true),
  }).strict(),
  evidenceSha256: sha256Schema,
}).strict();

const packageEvidenceSchema = z.object({
  sha256: sha256Schema,
  version: z.string().min(1),
}).strict();

const installedProfileSchema = z.object({
  activationMode: z.literal("global"),
  hookRegistered: z.literal(true),
  mcpRegistered: z.literal(true),
  persistRawTranscript: z.literal(false),
  retrievalProfile: z.literal("coding_agent"),
  workspaceStatus: z.literal("ok"),
  writebackMode: z.literal("selective"),
}).strict();

const normalizedArmIdentitySchema = z.object({
  normalizedArgv: z.array(z.string()).min(1),
  normalizedArgvSha256: sha256Schema,
  paths: armPathsSchema,
  permissionIsolation: permissionIsolationSchema,
  permissionProfile: permissionProfileSchema,
  scopes: armScopesSchema,
}).strict();

const noMemoryIdentityArmSchema = normalizedArmIdentitySchema.extend({
  absenceAudit: z.record(z.string(), z.unknown()),
}).strict();

const installedIdentityArmSchema = normalizedArmIdentitySchema.extend({
  package: packageEvidenceSchema,
  profile: installedProfileSchema,
}).strict();

const runIdentitySchema = z.object({
  armOrder: z.tuple([
    z.literal("no-memory"),
    z.literal("goodmemory-installed"),
  ]),
  arms: z.object({
    goodmemoryInstalled: installedIdentityArmSchema,
    noMemory: noMemoryIdentityArmSchema,
  }).strict(),
  authSha256: sha256Schema,
  baseHealthSha256: sha256Schema,
  codex: z.object({
    executableSha256: sha256Schema,
    model: z.string().min(1),
    permissionProfile: z.literal("c3-task"),
    reasoningEffort: z.string().min(1),
    version: z.string().min(1),
  }).strict(),
  episodeId: z.string().min(1),
  evaluator: z.object({
    failToPassCommand: z.array(z.string().min(1)).min(1),
    files: z.array(z.object({
      relativePath: z.string().min(1),
      sha256: sha256Schema,
    }).strict()).min(2),
    materialization: z.literal("after-both-codex-processes"),
    passToPassCommand: z.array(z.string().min(1)).min(1),
    security: evaluatorSecurityContractSchema,
  }).strict(),
  evidenceClass: z.literal("frozen-prehistory-pilot"),
  expectedCommit: gitObjectSchema,
  generatedAt: z.string().min(1),
  goodMemorySource: sourceProvenanceSchema,
  historyMaterialization: z.literal("after-no-memory-process"),
  historySourceSha256: sha256Schema,
  hostConfigurationDiffSha256: sha256Schema,
  hostConfigurationsSha256: sha256Schema,
  hostPreflightSha256: sha256Schema,
  instructionSha256: sha256Schema,
  invocation: z.object({
    approval: z.literal("never"),
    json: z.literal(true),
    model: z.string().min(1),
    permissionProfile: z.literal("c3-task"),
    promptSha256: sha256Schema,
    reasoningEffort: z.string().min(1),
    strictConfig: z.literal(true),
    treatment: z.object({
      goodmemoryInstalled: z.tuple([
        z.literal("enable-hooks"),
        z.literal("bypass-hook-trust"),
      ]),
      noMemory: z.tuple([z.literal("disable-hooks")]),
    }).strict(),
  }).strict(),
  leakageAudit: z.object({
    algorithmVersion: z.literal(1),
    promptSourceSha256: sha256Schema,
  }).strict(),
  promptSha256: sha256Schema,
  repetition: z.number().int().positive(),
  runId: z.string().min(1),
  runnerSource: sourceProvenanceSchema,
  schemaVersion: z.literal(1),
  seed: z.number().int().positive(),
  stageId: z.string().min(1),
  stageTimeoutMs: z.number().int().positive(),
  testTimeoutMs: z.number().int().positive(),
}).strict();

const sourceStateSchema = z.object({
  dirty: z.literal(false),
  schemaVersion: z.literal(1),
  statusBytes: z.literal(0),
  statusSha256: sha256Schema,
  trackedDiffBytes: z.literal(0),
  trackedDiffSha256: sha256Schema,
  untrackedFiles: z.array(z.unknown()).length(0),
}).strict();

const normalizedConfigurationFileSchema = z.object({
  normalizedText: z.string(),
  sourceSha256: sha256Schema,
}).strict();

const normalizedArmHostConfigurationSchema = z.object({
  codexConfig: normalizedConfigurationFileSchema,
  environment: z.record(z.string(), z.string()),
  goodmemoryConfig: normalizedConfigurationFileSchema.nullable(),
  hooksConfig: normalizedConfigurationFileSchema.nullable(),
  profile: installedProfileSchema.nullable(),
}).strict();

const hostConfigurationsSchema = z.object({
  arms: z.object({
    goodmemoryInstalled: normalizedArmHostConfigurationSchema,
    noMemory: normalizedArmHostConfigurationSchema,
  }).strict(),
  normalizedDiff: z.array(z.object({
    goodmemoryInstalled: z.unknown(),
    noMemory: z.unknown(),
    path: z.string().min(1),
  }).strict()).min(1),
  schemaVersion: z.literal(1),
}).strict();

const auditEvidenceSchema = z.object({
  baseHealthSha256: sha256Schema,
  evaluatorSecuritySha256: sha256Schema,
  evidenceClass: z.literal("frozen-prehistory-pilot"),
  goodMemorySource: sourceProvenanceSchema,
  hostConfigurationDiffSha256: sha256Schema,
  hostConfigurationsSha256: sha256Schema,
  hostPreflightSha256: sha256Schema,
  outcome: z.enum([
    "rescue",
    "regression",
    "tie-both-pass",
    "tie-both-fail",
    "incomparable",
  ]),
  publicClaimEligible: z.literal(false),
  runId: z.string().min(1),
  runnerSource: sourceProvenanceSchema,
  runnerSourceStatePostRunSha256: sha256Schema,
  runnerStable: z.literal(true),
  schemaVersion: z.literal(1),
  sourceRunIdentitySha256: sha256Schema,
  sourceCasesSha256: sha256Schema,
  sourceStable: z.literal(true),
  sourceStatePostRunSha256: sha256Schema,
  summarySha256: sha256Schema,
}).strict();

const leakageEnvelopeSchema = z.object({
  algorithmVersion: z.literal(1),
  audit: z.object({
    passed: z.literal(true),
    sourceSha256: sha256Schema,
  }).passthrough(),
}).strict();

export interface C3ReplayFixture {
  bunExecutable: string;
  cleanup: () => Promise<void>;
  evaluatorFiles: ReadonlyArray<{
    relativePath: string;
    sha256: string;
  }>;
  evaluatorRoot: string;
  expectedCommit: string;
  expectedFailToPassOutputFragments: readonly string[];
  failToPassCommand: readonly string[];
  failToPassSource: string;
  passToPassCommand: readonly string[];
  passToPassSource: string;
  sourceRepository: string;
  visibleBaseHealthCommand: readonly string[];
}

export interface C3ProjectionVerification {
  decision: "accepted" | "rejected";
  evidenceClass: "frozen-prehistory-pilot";
  projectionManifestSha256: string | null;
  reasons: string[];
  replayedArmCount: number;
  runId: string | null;
  schemaVersion: 1;
  verifiedFileCount: number;
}

export async function verifyC3Projection(input: {
  projectionDirectory: string;
  replayFixture?: () => Promise<C3ReplayFixture>;
  testOnlyCollectVerifierSource?: () => Promise<C3CollectedSourceProvenance>;
}): Promise<C3ProjectionVerification> {
  const observedManifest: { current: C3ProjectionManifest | null } = {
    current: null,
  };
  try {
    const result = await verifyProjectionOrThrow(input, (parsed) => {
      observedManifest.current = parsed;
    });
    return {
      decision: "accepted",
      evidenceClass: "frozen-prehistory-pilot",
      projectionManifestSha256: result.projectionManifestSha256,
      reasons: [],
      replayedArmCount: result.replayedArmCount,
      runId: result.runId,
      schemaVersion: 1,
      verifiedFileCount: result.verifiedFileCount,
    };
  } catch (error) {
    return {
      decision: "rejected",
      evidenceClass: "frozen-prehistory-pilot",
      projectionManifestSha256: await optionalFileSha256(
        join(resolve(input.projectionDirectory), "projection-manifest.json"),
      ),
      reasons: [normalizeVerificationError(error)],
      replayedArmCount: 0,
      runId: observedManifest.current?.runId ?? null,
      schemaVersion: 1,
      verifiedFileCount: 0,
    };
  }
}

export async function persistC3ProjectionVerification(input: {
  path: string;
  verification: C3ProjectionVerification;
}): Promise<void> {
  await writeFile(
    input.path,
    `${JSON.stringify(input.verification, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
}

async function verifyProjectionOrThrow(
  input: {
    projectionDirectory: string;
    replayFixture?: () => Promise<C3ReplayFixture>;
    testOnlyCollectVerifierSource?: () => Promise<C3CollectedSourceProvenance>;
  },
  onManifest: (manifest: C3ProjectionManifest) => void,
): Promise<{
  projectionManifestSha256: string;
  replayedArmCount: number;
  runId: string;
  verifiedFileCount: number;
}> {
  const projectionDirectory = resolve(input.projectionDirectory);
  await assertRealDirectory(projectionDirectory);
  const manifestBytes = await readRegularFile(
    projectionDirectory,
    "projection-manifest.json",
  );
  const manifest = parseC3ProjectionManifest(parseJson(
    manifestBytes,
    "projection-manifest.json",
  ));
  onManifest(manifest);
  const files = await verifyManifestFiles(projectionDirectory, manifest);
  for (const bytes of files.values()) {
    assertNoHostPaths(bytes);
  }

  const identityBytes = requiredFile(files, "run-identity.json");
  if (sha256(identityBytes) !== manifest.projectionRunIdentitySha256) {
    throw new Error("projection run identity hash does not match the manifest");
  }
  const identity = runIdentitySchema.parse(parseJson(
    identityBytes,
    "run-identity.json",
  ));
  if (identity.runId !== manifest.runId) {
    throw new Error("projection manifest run identity is inconsistent");
  }
  await verifyVerifierSourceCheckout(
    identity.runnerSource,
    input.testOnlyCollectVerifierSource,
  );
  verifyNormalizedArgv(identity);

  const baseHealthBytes = requiredFile(files, "base-health.json");
  const baseHealth = parseC3BaseHealthEvidence(parseJson(
    baseHealthBytes,
    "base-health.json",
  ));
  if (
    sha256(baseHealthBytes) !== identity.baseHealthSha256 ||
    !baseHealth.passed ||
    baseHealth.reasons.length !== 0 ||
    baseHealth.commit !== identity.expectedCommit ||
    baseHealth.statusBefore !== "" ||
    baseHealth.statusAfter !== ""
  ) {
    throw new Error("C3 base-health does not bind a clean accepted snapshot");
  }
  const evaluatorHashes = new Set(
    identity.evaluator.files.map((file) => file.sha256),
  );
  if (
    baseHealth.probes.failToPass.sourceSha256 === null ||
    baseHealth.probes.passToPass.sourceSha256 === null ||
    baseHealth.probes.failToPass.sourceSha256 ===
      baseHealth.probes.passToPass.sourceSha256 ||
    !evaluatorHashes.has(baseHealth.probes.failToPass.sourceSha256) ||
    !evaluatorHashes.has(baseHealth.probes.passToPass.sourceSha256)
  ) {
    throw new Error("C3 base-health hidden sources do not match evaluator commitments");
  }

  const hostConfigurationsBytes = requiredFile(
    files,
    "host-configurations.sanitized.json",
  );
  const hostConfigurations = hostConfigurationsSchema.parse(parseJson(
    hostConfigurationsBytes,
    "host-configurations.sanitized.json",
  ));
  const recomputedHostConfigurations = buildC3HostConfigurationEvidence({
    goodmemoryInstalled:
      hostConfigurations.arms.goodmemoryInstalled,
    noMemory: hostConfigurations.arms.noMemory,
  });
  if (
    sha256(hostConfigurationsBytes) !== identity.hostConfigurationsSha256 ||
    sha256(JSON.stringify(hostConfigurations.normalizedDiff)) !==
      identity.hostConfigurationDiffSha256 ||
    JSON.stringify(hostConfigurations.normalizedDiff) !==
      JSON.stringify(recomputedHostConfigurations.normalizedDiff)
  ) {
    throw new Error("C3 host configuration hashes are inconsistent");
  }

  const hostPreflightBytes = requiredFile(
    files,
    "host-preflight.sanitized.json",
  );
  const hostPreflight = parseC3HostPreflightEvidence(parseJson(
    hostPreflightBytes,
    "host-preflight.sanitized.json",
  ));
  if (
    sha256(hostPreflightBytes) !== identity.hostPreflightSha256 ||
    hostPreflight.hostConfigurationsSha256 !==
      identity.hostConfigurationsSha256 ||
    hostPreflight.repository.commit !== identity.expectedCommit ||
    hostPreflight.repository.tree !== baseHealth.tree ||
    hostPreflight.codex.executableSha256 !==
      identity.codex.executableSha256 ||
    hostPreflight.codex.version !== identity.codex.version ||
    hostPreflight.codex.model !== identity.codex.model ||
    hostPreflight.codex.reasoningEffort !== identity.codex.reasoningEffort
  ) {
    throw new Error("C3 host preflight does not match the frozen run identity");
  }
  verifyHostCrossBindings({
    hostConfigurations,
    hostPreflight,
    identity,
  });

  verifySourceState(
    files,
    identity.goodMemorySource,
    "goodmemory-source-state.json",
    "goodmemory-source-state-post-run.json",
    "GoodMemory package source",
  );
  verifySourceState(
    files,
    identity.runnerSource,
    "runner-source-state.json",
    "runner-source-state-post-run.json",
    "C3 runner source",
  );
  verifyLeakageAudits(files, identity);
  const evaluatorSecuritySha256 = verifyEvaluatorSecurity(
    files,
    identity.evaluator.security,
  );

  const casesBytes = requiredFile(files, "cases.jsonl");
  const cases = parseCases(casesBytes);
  const stages = parseStages(files);
  assertCaseStageLinkage(cases, stages);
  assertPairedHostSemantics(
    identity,
    stages,
    hostConfigurations,
    evaluatorSecuritySha256,
  );

  const summaryBytes = requiredFile(files, "summary.json");
  const summary = parseC3FrozenPrehistoryPilotSummary(parseJson(
    summaryBytes,
    "summary.json",
  ));
  const recomputedSummary = buildC3FrozenPrehistoryPilotSummary({
    attempts: stages.map((stage) => stage.attempt),
    cases,
    generatedAt: identity.generatedAt,
    runId: identity.runId,
  });
  if (
    JSON.stringify(summary) !== JSON.stringify(recomputedSummary) ||
    summary.sourceCasesSha256 !== sha256(serializeCodexCodingEffectCases(cases))
  ) {
    throw new Error("C3 summary does not recompute from projected cases");
  }

  const auditEvidence = auditEvidenceSchema.parse(parseJson(
    requiredFile(files, "audit-evidence.sanitized.json"),
    "audit-evidence.sanitized.json",
  ));
  if (
    auditEvidence.runId !== identity.runId ||
    auditEvidence.baseHealthSha256 !== identity.baseHealthSha256 ||
    auditEvidence.evaluatorSecuritySha256 !== evaluatorSecuritySha256 ||
    auditEvidence.hostConfigurationsSha256 !==
      identity.hostConfigurationsSha256 ||
    auditEvidence.hostConfigurationDiffSha256 !==
      identity.hostConfigurationDiffSha256 ||
    auditEvidence.hostPreflightSha256 !== identity.hostPreflightSha256 ||
    auditEvidence.sourceCasesSha256 !== summary.sourceCasesSha256 ||
    auditEvidence.summarySha256 !== sha256(summaryBytes) ||
    auditEvidence.outcome !== summary.outcome ||
    auditEvidence.sourceStatePostRunSha256 !==
      identity.goodMemorySource.sourceStateSha256 ||
    JSON.stringify(auditEvidence.goodMemorySource) !==
      JSON.stringify(identity.goodMemorySource) ||
    auditEvidence.runnerSourceStatePostRunSha256 !==
      identity.runnerSource.sourceStateSha256 ||
    JSON.stringify(auditEvidence.runnerSource) !==
      JSON.stringify(identity.runnerSource) ||
    auditEvidence.sourceRunIdentitySha256 !==
      manifest.sourceRunIdentitySha256
  ) {
    if (
      auditEvidence.sourceRunIdentitySha256 !==
        manifest.sourceRunIdentitySha256
    ) {
      throw new Error(
        "C3 source run identity commitment is inconsistent",
      );
    }
    throw new Error("C3 audit evidence does not match the projected run");
  }

  const replayFixture = await (
    input.replayFixture?.() ?? prepareDefaultReplayFixture()
  );
  try {
    if (
      replayFixture.expectedCommit !== identity.expectedCommit ||
      JSON.stringify([...replayFixture.evaluatorFiles].sort(compareFile)) !==
        JSON.stringify([...identity.evaluator.files].sort(compareFile))
    ) {
      throw new Error("C3 clean-clone replay fixture does not match the run identity");
    }
    await verifyC3EvaluatorFiles(
      replayFixture.evaluatorRoot,
      replayFixture.evaluatorFiles,
    );
    await replayBaseHealth({
      fixture: replayFixture,
      recorded: baseHealth,
    });
    await replayStages({
      fixture: replayFixture,
      stages,
      testTimeoutMs: identity.testTimeoutMs,
    });
  } finally {
    await replayFixture.cleanup();
  }

  return {
    projectionManifestSha256: sha256(manifestBytes),
    replayedArmCount: stages.length,
    runId: identity.runId,
    verifiedFileCount: manifest.files.length,
  };
}

async function verifyVerifierSourceCheckout(
  expected: z.infer<typeof sourceProvenanceSchema>,
  collect: (() => Promise<C3CollectedSourceProvenance>) | undefined,
): Promise<void> {
  const observed = await (
    collect?.() ?? collectC3GoodMemorySourceProvenance()
  );
  try {
    assertC3GoodMemorySourceClean(observed.provenance);
  } catch {
    throw new Error("C3 verifier checkout must be clean");
  }
  if (
    JSON.stringify(observed.provenance) !== JSON.stringify(expected) ||
    sha256(observed.sourceStateArtifactBytes) !==
      expected.sourceStateSha256 ||
    Buffer.byteLength(observed.sourceStateArtifactBytes) !==
      expected.sourceStateBytes
  ) {
    throw new Error(
      "C3 verifier checkout does not match the recorded runner source",
    );
  }
}

async function verifyManifestFiles(
  projectionDirectory: string,
  manifest: C3ProjectionManifest,
): Promise<Map<string, string>> {
  const actualPaths = (await collectFiles(projectionDirectory))
    .filter((path) =>
      path !== "projection-manifest.json" &&
      path !== "c3-verification.json"
    );
  const expectedPaths = manifest.files.map((file) => file.path).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error("C3 projection files do not match the manifest");
  }
  const files = new Map<string, string>();
  for (const file of manifest.files) {
    const bytes = await readRegularFile(projectionDirectory, file.path);
    if (
      Buffer.byteLength(bytes) !== file.bytes ||
      sha256(bytes) !== file.sha256
    ) {
      throw new Error(`C3 projection file hash mismatch: ${file.path}`);
    }
    files.set(file.path, bytes);
  }
  return files;
}

function verifySourceState(
  files: Map<string, string>,
  provenance: z.infer<typeof sourceProvenanceSchema>,
  beforePath: string,
  afterPath: string,
  label: string,
): void {
  const beforeBytes = requiredFile(files, beforePath);
  const afterBytes = requiredFile(files, afterPath);
  const before = sourceStateSchema.parse(parseJson(
    beforeBytes,
    beforePath,
  ));
  const after = sourceStateSchema.parse(parseJson(
    afterBytes,
    afterPath,
  ));
  if (
    beforeBytes !== afterBytes ||
    JSON.stringify(before) !== JSON.stringify(after) ||
    sha256(beforeBytes) !== provenance.sourceStateSha256 ||
    Buffer.byteLength(beforeBytes) !== provenance.sourceStateBytes ||
    provenance.dirtyStateSha256 !== provenance.sourceStateSha256 ||
    provenance.dirtyStateBytes !== provenance.sourceStateBytes
  ) {
    throw new Error(`${label} state is not clean and stable`);
  }
}

function verifyNormalizedArgv(
  identity: z.infer<typeof runIdentitySchema>,
): void {
  const arms = [
    {
      arm: "no-memory" as const,
      evidence: identity.arms.noMemory,
    },
    {
      arm: "goodmemory-installed" as const,
      evidence: identity.arms.goodmemoryInstalled,
    },
  ];
  for (const { arm, evidence } of arms) {
    const expected = buildC3CodexArgs({
      arm,
      model: identity.codex.model,
      prompt: "<prompt>",
      reasoningEffort: identity.codex.reasoningEffort,
      workspaceRoot: "<workspace>",
    });
    if (
      JSON.stringify(evidence.normalizedArgv) !== JSON.stringify(expected) ||
      evidence.normalizedArgvSha256 !==
        sha256(JSON.stringify(evidence.normalizedArgv))
    ) {
      throw new Error(`C3 ${arm} normalized argv is inconsistent`);
    }
  }
  if (
    JSON.stringify(normalizeC3CodexTreatmentArgs(
      identity.arms.noMemory.normalizedArgv,
    )) !==
      JSON.stringify(normalizeC3CodexTreatmentArgs(
        identity.arms.goodmemoryInstalled.normalizedArgv,
      ))
  ) {
    throw new Error("C3 normalized argv differs outside the treatment surface");
  }
}

function verifyHostCrossBindings(input: {
  hostConfigurations: z.infer<typeof hostConfigurationsSchema>;
  hostPreflight: ReturnType<typeof parseC3HostPreflightEvidence>;
  identity: z.infer<typeof runIdentitySchema>;
}): void {
  const installedConfig =
    input.hostConfigurations.arms.goodmemoryInstalled;
  const noMemoryConfig = input.hostConfigurations.arms.noMemory;
  const installedIdentity = input.identity.arms.goodmemoryInstalled;
  const noMemoryIdentity = input.identity.arms.noMemory;
  if (
    installedConfig.goodmemoryConfig === null ||
    installedConfig.hooksConfig === null ||
    installedConfig.profile === null ||
    noMemoryConfig.goodmemoryConfig !== null ||
    noMemoryConfig.hooksConfig !== null ||
    noMemoryConfig.profile !== null ||
    installedConfig.codexConfig.sourceSha256 !==
      installedIdentity.permissionProfile.configSha256 ||
    noMemoryConfig.codexConfig.sourceSha256 !==
      noMemoryIdentity.permissionProfile.configSha256 ||
    input.hostPreflight.goodmemory.configSha256 !==
      installedConfig.goodmemoryConfig.sourceSha256 ||
    input.hostPreflight.goodmemory.hooksSha256 !==
      installedConfig.hooksConfig.sourceSha256 ||
    input.hostPreflight.goodmemory.packageSha256 !==
      installedIdentity.package.sha256 ||
    input.hostPreflight.goodmemory.version !==
      installedIdentity.package.version ||
    JSON.stringify(installedConfig.profile) !==
      JSON.stringify(installedIdentity.profile)
  ) {
    throw new Error(
      "C3 package, host configuration, and permission identities are not cross-bound",
    );
  }
  verifyArmPaths(
    input.hostPreflight.paths.goodmemoryInstalled,
    installedIdentity.paths,
  );
  verifyArmPaths(
    input.hostPreflight.paths.noMemory,
    noMemoryIdentity.paths,
  );
}

function verifyArmPaths(
  preflight: {
    codexHome: string;
    home: string;
    result: string;
    runtime: string;
    workspace: string;
  },
  identity: z.infer<typeof armPathsSchema>,
): void {
  if (
    preflight.codexHome !== identity.codexHome ||
    preflight.home !== identity.home ||
    preflight.result !== identity.result ||
    preflight.runtime !== identity.armRoot ||
    preflight.workspace !== identity.workspace
  ) {
    throw new Error("C3 host paths do not match the run identity");
  }
}

function verifyPermissionIsolation(input: {
  configSha256: string;
  evidence: z.infer<typeof permissionIsolationSchema>;
  expectedLabels: readonly string[];
  phase: "pre-launch" | "pre-seed" | "preflight";
}): void {
  const { audit } = input.evidence;
  const labels = audit.deniedReads.map((entry) => entry.label).sort();
  if (
    audit.configSha256 !== input.configSha256 ||
    audit.phase !== input.phase ||
    new Set(labels).size !== labels.length ||
    JSON.stringify(labels) !== JSON.stringify([...input.expectedLabels].sort()) ||
    audit.deniedReads.some((entry) =>
      entry.pathSha256 !== sha256(entry.path)
    ) ||
    input.evidence.evidenceSha256 !==
      sha256(`${JSON.stringify(audit, null, 2)}\n`)
  ) {
    throw new Error("C3 permission isolation evidence is inconsistent");
  }
}

function verifyEvaluatorSecurity(
  files: Map<string, string>,
  expectedContract: z.infer<typeof evaluatorSecurityContractSchema>,
): string {
  const bytes = requiredFile(
    files,
    "evaluator-security.sanitized.json",
  );
  const parsed = evaluatorSecurityEvidenceSchema.safeParse(parseJson(
    bytes,
    "evaluator-security.sanitized.json",
  ));
  if (!parsed.success) {
    throw new Error("C3 evaluator security evidence is inconsistent");
  }
  const evidence = parsed.data;
  const { contract } = evidence;
  const deniedLabels = contract.deniedPaths.map((path) => path.label);
  if (
    JSON.stringify(contract) !== JSON.stringify(expectedContract) ||
    contract.sourceEvaluatorRoot.label !== "source-evaluator-root" ||
    !pathCommitmentIsValid(contract.sourceEvaluatorRoot) ||
    new Set(deniedLabels).size !== deniedLabels.length ||
    JSON.stringify([...deniedLabels].sort()) !==
      JSON.stringify([...C3_EVALUATOR_DENIED_PATH_LABELS].sort()) ||
    contract.deniedPaths.some((path) => !pathCommitmentIsValid(path))
  ) {
    throw new Error("C3 evaluator security evidence is inconsistent");
  }
  verifyEvaluatorSecurityArm({
    arm: "goodmemory-installed",
    contract: contract.arms.goodmemoryInstalled,
    credentialRevocation:
      evidence.credentialRevocations.goodmemoryInstalled,
    sandbox: evidence.sandboxes.goodmemoryInstalled,
  });
  verifyEvaluatorSecurityArm({
    arm: "no-memory",
    contract: contract.arms.noMemory,
    credentialRevocation: evidence.credentialRevocations.noMemory,
    sandbox: evidence.sandboxes.noMemory,
  });
  const committedPaths = [
    contract.sourceEvaluatorRoot.path,
    contract.arms.goodmemoryInstalled.copiedAuth.path,
    contract.arms.goodmemoryInstalled.evaluationWorkspace.path,
    contract.arms.goodmemoryInstalled.evaluatorRoot.path,
    contract.arms.goodmemoryInstalled.sandboxRoot.path,
    contract.arms.noMemory.copiedAuth.path,
    contract.arms.noMemory.evaluationWorkspace.path,
    contract.arms.noMemory.evaluatorRoot.path,
    contract.arms.noMemory.sandboxRoot.path,
  ];
  if (new Set(committedPaths).size !== committedPaths.length) {
    throw new Error("C3 evaluator security evidence is inconsistent");
  }
  return sha256(bytes);
}

function verifyEvaluatorSecurityArm(input: {
  arm: "goodmemory-installed" | "no-memory";
  contract: z.infer<typeof evaluatorSecurityArmContractSchema>;
  credentialRevocation: z.infer<
    ReturnType<typeof credentialRevocationSchema>
  >;
  sandbox: z.infer<typeof evaluatorSandboxEvidenceSchema>;
}): void {
  const expectedLabels = {
    copiedAuth: `${input.arm}-copied-auth`,
    evaluationWorkspace: `${input.arm}-evaluation-workspace`,
    evaluatorRoot: `${input.arm}-evaluator-root`,
    sandboxRoot: `${input.arm}-sandbox-root`,
  };
  if (
    input.contract.copiedAuth.label !== expectedLabels.copiedAuth ||
    input.contract.evaluationWorkspace.label !==
      expectedLabels.evaluationWorkspace ||
    input.contract.evaluatorRoot.label !== expectedLabels.evaluatorRoot ||
    input.contract.sandboxRoot.label !== expectedLabels.sandboxRoot ||
    !pathCommitmentIsValid(input.contract.copiedAuth) ||
    !pathCommitmentIsValid(input.contract.evaluationWorkspace) ||
    !pathCommitmentIsValid(input.contract.evaluatorRoot) ||
    !pathCommitmentIsValid(input.contract.sandboxRoot) ||
    !pathCommitmentIsValid(input.sandbox.evaluatorRoot) ||
    JSON.stringify(input.sandbox.evaluatorRoot) !==
      JSON.stringify(input.contract.evaluatorRoot) ||
    input.sandbox.configSha256 !== input.contract.expectedConfigSha256 ||
    input.credentialRevocation.phase !==
      "after-both-codex-before-evaluator-materialization" ||
    JSON.stringify(input.credentialRevocation.auth) !==
      JSON.stringify(input.contract.copiedAuth)
  ) {
    throw new Error("C3 evaluator security evidence is inconsistent");
  }
}

function pathCommitmentIsValid(
  commitment: z.infer<typeof evaluatorSecurityPathCommitmentSchema>,
): boolean {
  return commitment.pathSha256 === sha256(commitment.path);
}

function verifyLeakageAudits(
  files: Map<string, string>,
  identity: z.infer<typeof runIdentitySchema>,
): void {
  const prompt = leakageEnvelopeSchema.parse(parseJson(
    requiredFile(files, "prompt-leakage-audit.json"),
    "prompt-leakage-audit.json",
  ));
  const prehistory = leakageEnvelopeSchema.parse(parseJson(
    requiredFile(files, "prehistory-leakage-audit.json"),
    "prehistory-leakage-audit.json",
  ));
  if (
    prompt.audit.sourceSha256 !== identity.promptSha256 ||
    prompt.audit.sourceSha256 !== identity.leakageAudit.promptSourceSha256 ||
    prehistory.audit.sourceSha256 !== identity.historySourceSha256
  ) {
    throw new Error("C3 leakage audit hashes do not match the run identity");
  }
}

function parseCases(bytes: string): CodexCodingEffectCaseResult[] {
  const rows = bytes.split("\n").filter((line) => line.length > 0).map(
    (line, index) => parseCodexCodingEffectCaseResult(parseJson(
      line,
      `cases.jsonl:${index + 1}`,
    )),
  );
  if (rows.length !== 2) {
    throw new Error("C3 projection must contain exactly two cases");
  }
  return rows;
}

function parseStages(files: Map<string, string>): C3PilotStageEvidence[] {
  const stages = [...files.entries()]
    .filter(([path]) => path.startsWith("stage-evidence/"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, bytes]) =>
      parseC3PilotStageEvidence(parseJson(bytes, path))
    );
  if (stages.length !== 2) {
    throw new Error("C3 projection must contain exactly two stage records");
  }
  return stages;
}

function assertCaseStageLinkage(
  cases: readonly CodexCodingEffectCaseResult[],
  stages: readonly C3PilotStageEvidence[],
): void {
  const casesByAttempt = new Map(cases.map((row) => [row.attemptId, row]));
  for (const stage of stages) {
    const row = casesByAttempt.get(stage.attempt.attemptId);
    if (
      row === undefined ||
      JSON.stringify(row) !== JSON.stringify(stage.caseResult)
    ) {
      throw new Error("C3 stage evidence does not match cases.jsonl");
    }
  }
}

function assertPairedHostSemantics(
  identity: z.infer<typeof runIdentitySchema>,
  stages: readonly C3PilotStageEvidence[],
  hostConfigurations: z.infer<typeof hostConfigurationsSchema>,
  evaluatorSecuritySha256: string,
): void {
  const noMemory = stages.find((stage) =>
    stage.armEvidence.arm === "no-memory"
  );
  const installed = stages.find((stage) =>
    stage.armEvidence.arm === "goodmemory-installed"
  );
  if (
    noMemory === undefined ||
    installed === undefined ||
    noMemory.armEvidence.arm !== "no-memory" ||
    installed.armEvidence.arm !== "goodmemory-installed"
  ) {
    throw new Error("C3 projection does not contain both frozen arms");
  }
  if (
    noMemory.caseResult.codexStatus !== "completed" ||
    installed.caseResult.codexStatus !== "completed" ||
    noMemory.caseResult.disposition !== "finalized" ||
    installed.caseResult.disposition !== "finalized" ||
    noMemory.armEvidence.threadId === null ||
    installed.armEvidence.hostCanary === null ||
    !installed.armEvidence.hostCanary.passed ||
    noMemory.armEvidence.threadId === installed.armEvidence.hostCanary.threadId
  ) {
    throw new Error("C3 paired host execution did not complete with distinct threads");
  }
  if (
    noMemory.armEvidence.historySourceSha256 !== identity.historySourceSha256 ||
    installed.armEvidence.historySourceSha256 !== identity.historySourceSha256 ||
    noMemory.armEvidence.evaluatorSecuritySha256 !== evaluatorSecuritySha256 ||
    installed.armEvidence.evaluatorSecuritySha256 !==
      evaluatorSecuritySha256 ||
    noMemory.armEvidence.instructionSha256 !== identity.instructionSha256 ||
    installed.armEvidence.instructionSha256 !== identity.instructionSha256
  ) {
    throw new Error("C3 paired arms do not share frozen history and instructions");
  }
  verifyPermissionIsolation({
    configSha256:
      hostConfigurations.arms.noMemory.codexConfig.sourceSha256,
    evidence: identity.arms.noMemory.permissionIsolation,
    expectedLabels: C3_BASE_DENIED_READ_LABELS,
    phase: "preflight",
  });
  verifyPermissionIsolation({
    configSha256:
      hostConfigurations.arms.goodmemoryInstalled.codexConfig.sourceSha256,
    evidence: identity.arms.goodmemoryInstalled.permissionIsolation,
    expectedLabels: C3_BASE_DENIED_READ_LABELS,
    phase: "preflight",
  });
  verifyPermissionIsolation({
    configSha256:
      hostConfigurations.arms.noMemory.codexConfig.sourceSha256,
    evidence: noMemory.armEvidence.permissionIsolation,
    expectedLabels: C3_BASE_DENIED_READ_LABELS,
    phase: "pre-launch",
  });
  verifyPermissionIsolation({
    configSha256:
      hostConfigurations.arms.goodmemoryInstalled.codexConfig.sourceSha256,
    evidence: installed.armEvidence.permissionIsolation,
    expectedLabels: C3_INSTALLED_DENIED_READ_LABELS,
    phase: "pre-launch",
  });
  if (
    noMemory.armEvidence.permissionIsolation.audit.configSha256 !==
      identity.arms.noMemory.permissionIsolation.audit.configSha256 ||
    installed.armEvidence.package.sha256 !==
      identity.arms.goodmemoryInstalled.package.sha256 ||
    installed.armEvidence.package.version !==
      identity.arms.goodmemoryInstalled.package.version
  ) {
    throw new Error("C3 stage host evidence is not cross-bound to the run identity");
  }
}

async function replayStages(input: {
  fixture: C3ReplayFixture;
  stages: readonly C3PilotStageEvidence[];
  testTimeoutMs: number;
}): Promise<void> {
  const replayRoot = await mkdtemp(join(tmpdir(), "goodmemory-c3-replay-"));
  try {
    for (const stage of input.stages) {
      const workspace = join(
        replayRoot,
        stage.armEvidence.arm,
      );
      await prepareC3IsolatedClone({
        destination: workspace,
        expectedCommit: input.fixture.expectedCommit,
        sourceRepository: input.fixture.sourceRepository,
      });
      await applyWorkspacePatch({
        patch: {
          baseCommit: input.fixture.expectedCommit,
          changedFiles: stage.caseResult.changedFiles,
          diff: stage.patchDiff,
          forbiddenFiles: stage.caseResult.forbiddenFiles,
          hasPatch: stage.caseResult.patchSha256 !== null,
          sha256: stage.caseResult.patchSha256,
          untrackedFiles: [],
        },
        workspace,
      });
      const failToPass = await runEvaluatorTest({
        command: input.fixture.failToPassCommand,
        cwd: workspace,
        evaluatorRoot: input.fixture.evaluatorRoot,
        kind: "fail-to-pass",
        timeoutMs: input.testTimeoutMs,
      });
      const passToPass = await runEvaluatorTest({
        command: input.fixture.passToPassCommand,
        cwd: workspace,
        evaluatorRoot: input.fixture.evaluatorRoot,
        kind: "pass-to-pass",
        timeoutMs: input.testTimeoutMs,
      });
      if (
        failToPass.status !== stage.caseResult.failToPassStatus ||
        passToPass.status !== stage.caseResult.passToPassStatus
      ) {
        throw new Error(
          `C3 clean-clone replay changed hidden-test status for ${stage.armEvidence.arm}`,
        );
      }
    }
  } finally {
    await rm(replayRoot, { force: true, recursive: true });
  }
}

async function replayBaseHealth(input: {
  fixture: C3ReplayFixture;
  recorded: ReturnType<typeof parseC3BaseHealthEvidence>;
}): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-c3-base-replay-"));
  const workspace = join(root, "workspace");
  try {
    await prepareC3IsolatedClone({
      destination: workspace,
      expectedCommit: input.fixture.expectedCommit,
      sourceRepository: input.fixture.sourceRepository,
    });
    const replayed = assertC3BaseHealthPassed(await runC3BaseHealthProbe({
      bunExecutable: input.fixture.bunExecutable,
      expectedCommit: input.fixture.expectedCommit,
      expectedFailToPassOutputFragments:
        input.fixture.expectedFailToPassOutputFragments,
      failToPassSource: input.fixture.failToPassSource,
      passToPassSource: input.fixture.passToPassSource,
      visibleCommand: input.fixture.visibleBaseHealthCommand,
      workspace,
    }));
    if (
      JSON.stringify(baseHealthKey(replayed)) !==
        JSON.stringify(baseHealthKey(input.recorded))
    ) {
      throw new Error(
        "C3 fresh-clone base-health does not match the projected evidence",
      );
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

function baseHealthKey(
  evidence: ReturnType<typeof parseC3BaseHealthEvidence>,
): Record<string, unknown> {
  const probe = (
    value: ReturnType<typeof parseC3BaseHealthEvidence>["probes"]["visible"],
  ) => ({
    argv: value.command.slice(1),
    bootstrapSha256: value.bootstrapSha256,
    executableSha256: value.executableSha256,
    exitCode: value.exitCode,
    expectation: value.expectation,
    fingerprintMatched: value.fingerprintMatched,
    fingerprintSha256: value.fingerprintSha256,
    sourceSha256: value.sourceSha256,
    status: value.status,
    timedOut: value.timedOut,
  });
  return {
    commit: evidence.commit,
    dependencyLocks: evidence.dependencyLocks,
    hiddenEvaluatorLifecycle: evidence.hiddenEvaluatorLifecycle,
    passed: evidence.passed,
    probes: {
      failToPass: probe(evidence.probes.failToPass),
      passToPass: probe(evidence.probes.passToPass),
      visible: probe(evidence.probes.visible),
    },
    reasons: evidence.reasons,
    statusAfter: evidence.statusAfter,
    statusBefore: evidence.statusBefore,
    tree: evidence.tree,
  };
}

async function prepareDefaultReplayFixture(): Promise<C3ReplayFixture> {
  const root = await mkdtemp(join(tmpdir(), "goodmemory-c3-fixture-replay-"));
  const fixture = await prepareC3ControlledPilotFixture({
    root: join(root, "fixture"),
  });
  await fixture.materializeEvaluator();
  return {
    bunExecutable: process.execPath,
    cleanup: async () => {
      await cleanupC3ControlledPilotFixture(fixture);
      await rm(root, { force: true, recursive: true });
    },
    evaluatorFiles: fixture.evaluatorFiles,
    evaluatorRoot: fixture.evaluatorRoot,
    expectedCommit: fixture.expectedCommit,
    expectedFailToPassOutputFragments:
      fixture.expectedFailToPassOutputFragments,
    failToPassCommand: fixture.failToPassCommand,
    failToPassSource: fixture.failToPassSource,
    passToPassCommand: fixture.passToPassCommand,
    passToPassSource: fixture.passToPassSource,
    sourceRepository: fixture.sourceRepository,
    visibleBaseHealthCommand: fixture.baseHealthCommand,
  };
}

async function collectFiles(
  root: string,
  directory = root,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("C3 projection must not contain symbolic links");
    }
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, path));
    } else if (entry.isFile()) {
      files.push(relative(root, path).split(sep).join("/"));
    } else {
      throw new Error("C3 projection contains an unsupported filesystem entry");
    }
  }
  return files.sort();
}

async function readRegularFile(root: string, path: string): Promise<string> {
  if (!isSafeRelativePath(path)) {
    throw new Error(`invalid C3 projection path: ${path}`);
  }
  const sourcePath = join(root, ...path.split("/"));
  const stats = await lstat(sourcePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`C3 projection file is not regular: ${path}`);
  }
  return readFile(sourcePath, "utf8");
}

function requiredFile(files: Map<string, string>, path: string): string {
  const bytes = files.get(path);
  if (bytes === undefined) {
    throw new Error(`C3 projection is missing ${path}`);
  }
  return bytes;
}

function parseJson(bytes: string, label: string): unknown {
  try {
    return JSON.parse(bytes);
  } catch {
    throw new Error(`invalid JSON in C3 projection: ${label}`);
  }
}

function assertNoHostPaths(bytes: string): void {
  if (/\/(?:Users|home|private|tmp|var\/folders)\//u.test(bytes)) {
    throw new Error("C3 projection contains a host absolute path");
  }
}

async function assertRealDirectory(path: string): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("C3 projection root must be a real directory");
  }
}

function isSafeRelativePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized !== path ||
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

function compareFile(
  first: { relativePath: string; sha256: string },
  second: { relativePath: string; sha256: string },
): number {
  return first.relativePath.localeCompare(second.relativePath);
}

function normalizeVerificationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "stage evidence patch does not match its case result") {
    return "stage patch hash does not match the recorded case";
  }
  if (message.startsWith("C3 clean-clone replay changed hidden-test status")) {
    return message;
  }
  if (error instanceof z.ZodError) {
    return "C3 projection failed strict schema validation";
  }
  return message;
}

async function optionalFileSha256(path: string): Promise<string | null> {
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      return null;
    }
    return sha256(await readFile(path));
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
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
