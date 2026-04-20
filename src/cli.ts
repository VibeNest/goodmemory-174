import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createGoodMemory } from "./api/createGoodMemory";
import type {
  ExportMemoryResult,
  GoodMemory,
  GoodMemoryConfig,
  RecallInput,
  RecallResult,
} from "./api/contracts";
import { normalizeScope, type MemoryScope } from "./domain/scope";
import type { RecallCandidateTrace } from "./recall/engine";
import type { RecallRouterStrategy } from "./recall/router";
import { resolveStoragePlan } from "./api/runtimeResolution";
import {
  canUsePostgresVectorExtension,
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "./storage/postgres";
import {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createSQLiteVectorStore,
} from "./storage/sqlite";

interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type ParsedFlags = Record<string, string>;

interface ParsedArgs {
  commands: string[];
  flags: ParsedFlags;
}

interface ProposalLifecycleTrace {
  experienceCount: number;
  experienceKindCounts?: Record<string, number>;
  proposalCount: number;
  proposalStatusCounts?: Record<string, number>;
  promotionCount: number;
  promotionDecisionCounts?: Record<string, number>;
  proposals: Array<{
    id: string;
    proposalType: string;
    status: string;
    summary: string;
    sourceExperienceIds: string[];
    linkedMemoryIds: string[];
    linkedArchiveIds: string[];
    linkedEvidenceIds: string[];
  }>;
  promotions: Array<{
    proposalId: string;
    decision: string;
    policyOutcome: string;
    verificationOutcome: string;
    evalOutcome: string;
  }>;
}

interface CLIStorageConfig {
  provider: NonNullable<GoodMemoryConfig["storage"]>["provider"];
  url?: string;
  displayValue: string;
}

interface DiagnosticMemoryOptions {
  readOnlyStorage?: boolean;
}

interface CLICommandOutput {
  json: unknown;
  text: string;
}

interface EvalInspectPayload {
  artifact: Record<string, unknown>;
  caseId: string;
  report: {
    mode?: string;
    runtime?: {
      generationMode?: string;
      judgeMode?: string;
    };
  };
}

interface EvalTracePayload {
  assertions: Record<string, unknown> | null;
  caseId: string;
  proposalTrace: ProposalLifecycleTrace | null;
  rawRecall: Record<string, unknown>;
  trace: Record<string, unknown>;
}

interface InternalDiagnosticGoodMemory extends GoodMemory {
  diagnoseRecall(input: RecallInput): Promise<RecallResult>;
}

const TOP_RECORD_LIMIT = 3;
const TRACE_SUPPRESSED_LIMIT = 8;

function parseArgs(argv: string[]): ParsedArgs {
  const commands: string[] = [];
  const flags: ParsedFlags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (!token.startsWith("--")) {
      commands.push(token);
      continue;
    }

    const inlineSeparator = token.indexOf("=");
    if (inlineSeparator >= 0) {
      flags[token.slice(2, inlineSeparator)] = token.slice(inlineSeparator + 1);
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      flags[key] = value;
      index += 1;
      continue;
    }

    flags[key] = "true";
  }

  return {
    commands,
    flags,
  };
}

function flagEnabled(flags: ParsedFlags, name: string): boolean {
  return flags[name] === "true";
}

function requireFlag(flags: ParsedFlags, name: string): string {
  const value = flags[name];
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }

  return value;
}

function requireCommand(commands: string[], index: number): string {
  const command = commands[index];
  if (!command) {
    throw new Error("Missing command");
  }

  return command;
}

function clipText(content: string, maxLength = 100): string {
  return content.length <= maxLength
    ? content
    : `${content.slice(0, maxLength - 3)}...`;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function formatCountBreakdown(
  counts: Record<string, number> | undefined,
): string | null {
  if (!counts || Object.keys(counts).length === 0) {
    return null;
  }

  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function formatCountLine(
  label: string,
  total: number | undefined,
  counts: Record<string, number> | undefined,
): string {
  if (total === undefined) {
    return `${label}: unknown`;
  }

  const breakdown = formatCountBreakdown(counts);
  return breakdown ? `${label}: ${total} (${breakdown})` : `${label}: ${total}`;
}

function formatScope(scope: MemoryScope): string {
  const parts = [
    `user=${scope.userId}`,
    ...(scope.tenantId ? [`tenant=${scope.tenantId}`] : []),
    ...(scope.workspaceId ? [`workspace=${scope.workspaceId}`] : []),
    ...(scope.agentId ? [`agent=${scope.agentId}`] : []),
    ...(scope.sessionId ? [`session=${scope.sessionId}`] : []),
  ];

  return parts.join(", ");
}

function resolveSQLiteURL(rawPath: string | undefined): string {
  if (!rawPath || rawPath.trim().length === 0) {
    return resolve(".goodmemory/memory.sqlite");
  }

  return rawPath === ":memory:" ? rawPath : resolve(rawPath);
}

function describeStorageProbeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

async function resolveStorageConfig(
  flags: ParsedFlags,
  options?: DiagnosticMemoryOptions,
): Promise<CLIStorageConfig> {
  const plan = resolveStoragePlan({
    storage: {
      provider:
        flags["storage-provider"] === undefined
          ? undefined
          : (flags["storage-provider"] as CLIStorageConfig["provider"]),
      url: flags["storage-url"],
    },
  });

  if (plan.mode === "explicit") {
    if (plan.storage.provider === "postgres") {
      return {
        provider: "postgres",
        url: plan.storage.url,
        displayValue: "configured",
      };
    }

    if (plan.storage.provider === "memory") {
      return {
        provider: "memory",
        displayValue: "in-memory",
      };
    }

    const url = resolveSQLiteURL(plan.storage.url);
    if (options?.readOnlyStorage && url !== ":memory:" && !(await pathExists(url))) {
      throw new Error(
        `Read-only CLI commands require an existing sqlite database at ${url}; they do not create local sqlite state implicitly.`,
      );
    }

    if (!options?.readOnlyStorage && url !== ":memory:") {
      await mkdir(dirname(url), { recursive: true });
    }

    return {
      provider: "sqlite",
      url,
      displayValue: url,
    };
  }

  if (plan.postgresUrl) {
    let usable = false;

    try {
      usable = await canUsePostgresVectorExtension({
        url: plan.postgresUrl,
      });
    } catch (error) {
      throw new Error(
        [
          "CLI auto storage could not verify the configured postgres backend.",
          "Falling back to sqlite would inspect the wrong durable authority.",
          `Underlying error: ${describeStorageProbeError(error)}`,
        ].join(" "),
      );
    }

    if (usable) {
      return {
        provider: "postgres",
        url: plan.postgresUrl,
        displayValue: "configured",
      };
    }
  }

  const url = resolveSQLiteURL(plan.sqliteUrl);
  if (options?.readOnlyStorage && url !== ":memory:" && !(await pathExists(url))) {
    throw new Error(
      `Read-only CLI commands require an existing sqlite database at ${url}; they do not create local sqlite state implicitly.`,
    );
  }

  if (!options?.readOnlyStorage && url !== ":memory:") {
    await mkdir(dirname(url), { recursive: true });
  }

  return {
    provider: "sqlite",
    url,
    displayValue: url,
  };
}

async function createDiagnosticMemory(
  flags: ParsedFlags,
  options?: DiagnosticMemoryOptions,
): Promise<{
  memory: InternalDiagnosticGoodMemory;
  storage: CLIStorageConfig;
}> {
  const storage = await resolveStorageConfig(flags, options);
  const readOnlySQLiteAdapters =
    options?.readOnlyStorage &&
    storage.provider === "sqlite" &&
    storage.url &&
    storage.url !== ":memory:"
      ? {
          documentStore: createSQLiteDocumentStore(storage.url, {
            readOnly: true,
          }),
          sessionStore: createSQLiteSessionStore(storage.url, {
            readOnly: true,
          }),
          vectorStore: createSQLiteVectorStore(storage.url, {
            readOnly: true,
          }),
        }
      : undefined;
  const readOnlyPostgresAdapters =
    options?.readOnlyStorage &&
    storage.provider === "postgres" &&
    storage.url
      ? {
          documentStore: createPostgresDocumentStore(
            { url: storage.url },
            { readOnly: true },
          ),
          sessionStore: createPostgresSessionStore(
            { url: storage.url },
            { readOnly: true },
          ),
          vectorStore: createPostgresVectorStore(
            { url: storage.url },
            { readOnly: true },
          ),
        }
      : undefined;

  return {
    memory: createGoodMemory({
      adapters: readOnlySQLiteAdapters ?? readOnlyPostgresAdapters,
      storage: {
        provider: storage.provider,
        url: storage.url,
      },
    }) as InternalDiagnosticGoodMemory,
    storage,
  };
}

function resolveScopeFromFlags(flags: ParsedFlags): MemoryScope {
  return normalizeScope({
    userId: requireFlag(flags, "user-id"),
    tenantId: flags["tenant-id"],
    workspaceId: flags["workspace-id"],
    agentId: flags["agent-id"],
    sessionId: flags["session-id"],
  });
}

function shouldIncludeRuntime(flags: ParsedFlags, scope: MemoryScope): boolean {
  return flagEnabled(flags, "include-runtime") || scope.sessionId !== undefined;
}

function countActiveRecords<TRecord extends { lifecycle?: string }>(
  records: TRecord[],
): number {
  return records.filter(isCurrentInspectRecord).length;
}

function isCurrentInspectRecord<TRecord extends { lifecycle?: string }>(
  record: TRecord,
): boolean {
  return record.lifecycle !== "superseded";
}

function buildProfileSummary(
  result: ExportMemoryResult,
): Record<string, unknown> | null {
  if (!result.durable.profile) {
    return null;
  }

  return {
    currentProjects: result.durable.profile.activeContext.currentProjects,
    goals: result.durable.profile.activeContext.goals,
    languagePreference:
      result.durable.profile.identity.languagePreference ?? null,
    location: result.durable.profile.identity.location ?? null,
    name: result.durable.profile.identity.name ?? null,
    organization: result.durable.profile.identity.organization ?? null,
    role: result.durable.profile.identity.role ?? null,
    timezone: result.durable.profile.identity.timezone ?? null,
  };
}

function sortByTimestamp<TRecord>(
  records: TRecord[],
  selector: (record: TRecord) => string,
): TRecord[] {
  return [...records].sort((left, right) => {
    const updated = selector(right).localeCompare(selector(left));
    if (updated !== 0) {
      return updated;
    }

    return compareStrings(JSON.stringify(left), JSON.stringify(right));
  });
}

function selectCurrentTopTimestampedRecords<TRecord extends { lifecycle?: string }>(
  records: TRecord[],
  selector: (record: TRecord) => string,
): TRecord[] {
  return sortByTimestamp(
    records.filter(isCurrentInspectRecord),
    selector,
  ).slice(0, TOP_RECORD_LIMIT);
}

function buildInspectPayload(input: {
  result: ExportMemoryResult;
  storage: CLIStorageConfig;
}): Record<string, unknown> {
  const { result, storage } = input;
  const facts = selectCurrentTopTimestampedRecords(
    result.durable.facts,
    (record) => record.updatedAt,
  );
  const references = selectCurrentTopTimestampedRecords(
    result.durable.references,
    (record) => record.updatedAt,
  );
  const feedback = selectCurrentTopTimestampedRecords(
    result.durable.feedback,
    (record) => record.updatedAt,
  );
  const proposals = sortByTimestamp(
    result.durable.proposals,
    (record) => record.updatedAt,
  ).slice(0, TOP_RECORD_LIMIT);
  const promotions = sortByTimestamp(
    result.durable.promotions,
    (record) => record.decidedAt,
  ).slice(0, TOP_RECORD_LIMIT);

  return {
    counts: {
      archives: result.durable.archives.length,
      episodes: result.durable.episodes.length,
      evidence: result.durable.evidence.length,
      experiences: result.durable.experiences.length,
      facts: result.durable.facts.length,
      feedback: result.durable.feedback.length,
      preferences: result.durable.preferences.length,
      profile: result.durable.profile ? 1 : 0,
      promotions: result.durable.promotions.length,
      proposals: result.durable.proposals.length,
      references: result.durable.references.length,
      runtimeSpills: result.runtime?.spills.length ?? 0,
    },
    profile: buildProfileSummary(result),
    runtime: result.runtime
      ? {
          journal: result.runtime.journal ? 1 : 0,
          spills: result.runtime.spills.length,
          workingMemory: result.runtime.workingMemory ? 1 : 0,
        }
      : null,
    scope: result.scope,
    storage: {
      location: storage.displayValue,
      provider: storage.provider,
    },
    topRecords: {
      facts: facts.map((record) => ({
        content: record.content,
        lifecycle: record.lifecycle,
        subject: record.subject ?? null,
      })),
      feedback: feedback.map((record) => ({
        kind: record.kind,
        lifecycle: record.lifecycle,
        rule: record.rule,
      })),
      promotions: promotions.map((record) => ({
        decision: record.decision,
        proposalId: record.proposalId,
        summary: record.summary,
      })),
      proposals: proposals.map((record) => ({
        status: record.status,
        summary: record.summary,
        type: record.proposalType,
      })),
      references: references.map((record) => ({
        lifecycle: record.lifecycle,
        pointer: record.pointer,
        title: record.title,
      })),
    },
  };
}

function renderInspectPayload(payload: Record<string, unknown>): string {
  const counts = payload.counts as Record<string, unknown>;
  const storage = payload.storage as Record<string, unknown>;
  const runtime = payload.runtime as Record<string, unknown> | null;
  const profile = payload.profile as Record<string, unknown> | null;
  const topRecords = payload.topRecords as Record<string, unknown>;
  const facts = topRecords.facts as Array<Record<string, unknown>>;
  const references = topRecords.references as Array<Record<string, unknown>>;
  const feedback = topRecords.feedback as Array<Record<string, unknown>>;
  const proposals = topRecords.proposals as Array<Record<string, unknown>>;
  const promotions = topRecords.promotions as Array<Record<string, unknown>>;

  return [
    `Scope: ${formatScope(payload.scope as unknown as MemoryScope)}`,
    `Storage: ${storage.provider} (${storage.location})`,
    `Profile: ${profile ? "present" : "absent"}`,
    `Preferences: ${counts.preferences}`,
    `References: ${counts.references}`,
    `Facts: ${counts.facts}`,
    `Feedback: ${counts.feedback}`,
    `Archives: ${counts.archives}`,
    `Evidence: ${counts.evidence}`,
    `Episodes: ${counts.episodes}`,
    `Experiences: ${counts.experiences}`,
    `Proposals: ${counts.proposals}`,
    `Promotions: ${counts.promotions}`,
    `Runtime: ${
      runtime
        ? `workingMemory=${runtime.workingMemory}, journal=${runtime.journal}, spills=${runtime.spills}`
        : "not requested"
    }`,
    ...(profile
      ? [
          "",
          "Profile Summary",
          `- name: ${profile.name ?? "unknown"}`,
          `- role: ${profile.role ?? "unknown"}`,
          `- location: ${profile.location ?? "unknown"}`,
          `- current projects: ${
            ((profile.currentProjects as string[]) ?? []).join(", ") || "none"
          }`,
        ]
      : []),
    "",
    "Top Facts",
    ...(facts.length > 0
      ? facts.map(
          (record) =>
            `- ${record.content}${
              record.subject
                ? ` [subject=${record.subject}]`
                : ""
            }`,
        )
      : ["- none"]),
    "",
    "Top References",
    ...(references.length > 0
      ? references.map(
          (record) =>
            `- ${record.title} -> ${record.pointer}`,
        )
      : ["- none"]),
    "",
    "Top Feedback",
    ...(feedback.length > 0
      ? feedback.map(
          (record) =>
            `- ${record.kind}: ${record.rule}`,
        )
      : ["- none"]),
    "",
    "Top Proposals",
    ...(proposals.length > 0
      ? proposals.map(
          (record) =>
            `- ${record.type} / ${record.status}: ${clipText(String(record.summary))}`,
        )
      : ["- none"]),
    "",
    "Top Promotions",
    ...(promotions.length > 0
      ? promotions.map(
          (record) =>
            `- ${record.proposalId} -> ${record.decision}: ${clipText(String(record.summary))}`,
        )
      : ["- none"]),
  ].join("\n");
}

function buildStatsPayload(input: {
  result: ExportMemoryResult;
  storage: CLIStorageConfig;
}): Record<string, unknown> {
  const { result, storage } = input;

  return {
    counts: {
      archives: result.durable.archives.length,
      episodes: result.durable.episodes.length,
      evidence: result.durable.evidence.length,
      experiences: result.durable.experiences.length,
      facts: result.durable.facts.length,
      factsActive: countActiveRecords(result.durable.facts),
      feedback: result.durable.feedback.length,
      feedbackActive: countActiveRecords(result.durable.feedback),
      preferences: result.durable.preferences.length,
      profile: result.durable.profile ? 1 : 0,
      promotions: result.durable.promotions.length,
      proposals: result.durable.proposals.length,
      references: result.durable.references.length,
      referencesActive: countActiveRecords(result.durable.references),
    },
    runtime: result.runtime
      ? {
          journal: result.runtime.journal ? 1 : 0,
          spills: result.runtime.spills.length,
          workingMemory: result.runtime.workingMemory ? 1 : 0,
        }
      : null,
    scope: result.scope,
    storage: {
      location: storage.displayValue,
      provider: storage.provider,
    },
  };
}

function renderStatsPayload(payload: Record<string, unknown>): string {
  const counts = payload.counts as Record<string, unknown>;
  const storage = payload.storage as Record<string, unknown>;
  const runtime = payload.runtime as Record<string, unknown> | null;

  return [
    `Scope: ${formatScope(payload.scope as unknown as MemoryScope)}`,
    `Storage Provider: ${storage.provider}`,
    `Storage Location: ${storage.location}`,
    `Profile Records: ${counts.profile}`,
    `Preferences: ${counts.preferences}`,
    `References: ${counts.references} (active=${counts.referencesActive})`,
    `Facts: ${counts.facts} (active=${counts.factsActive})`,
    `Feedback: ${counts.feedback} (active=${counts.feedbackActive})`,
    `Episodes: ${counts.episodes}`,
    `Archives: ${counts.archives}`,
    `Evidence: ${counts.evidence}`,
    `Experiences: ${counts.experiences}`,
    `Proposals: ${counts.proposals}`,
    `Promotions: ${counts.promotions}`,
    `Runtime: ${
      runtime
        ? `workingMemory=${runtime.workingMemory}, journal=${runtime.journal}, spills=${runtime.spills}`
        : "not requested"
    }`,
  ].join("\n");
}

function parseRetrievalProfile(flags: ParsedFlags): "coding_agent" | "general_chat" {
  const profile = flags["retrieval-profile"] ?? "general_chat";
  if (profile === "coding_agent" || profile === "general_chat") {
    return profile;
  }

  throw new Error(
    `Unsupported retrieval profile: ${profile}. Expected general_chat|coding_agent.`,
  );
}

function parseRecallStrategy(flags: ParsedFlags): RecallRouterStrategy {
  const strategy = flags.strategy ?? "auto";
  if (
    strategy === "auto" ||
    strategy === "rules-only" ||
    strategy === "hybrid" ||
    strategy === "llm-assisted"
  ) {
    return strategy;
  }

  throw new Error(
    `Unsupported recall strategy: ${strategy}. Expected auto|rules-only|hybrid|llm-assisted.`,
  );
}

function buildTracePayload(input: {
  query: string;
  recall: RecallResult;
  scope: MemoryScope;
  storage: CLIStorageConfig;
}): Record<string, unknown> {
  return {
    candidateTraceCount: input.recall.metadata.candidateTraces.length,
    candidateTraces: input.recall.metadata.candidateTraces,
    hits: input.recall.metadata.hits,
    policyApplied: input.recall.metadata.policyApplied,
    query: input.query,
    routingDecision: input.recall.metadata.routingDecision,
    scope: input.scope,
    storage: {
      location: input.storage.displayValue,
      provider: input.storage.provider,
    },
    verificationHints: input.recall.metadata.verificationHints,
  };
}

function formatCandidateTrace(trace: RecallCandidateTrace): string {
  const outcome = trace.returned
    ? trace.whyReturned ?? "returned"
    : trace.whySuppressed ?? "suppressed";

  return `- ${trace.memoryType}:${trace.memoryId} slot=${trace.slot} ${
    trace.returned ? "returned" : "suppressed"
  } ${clipText(outcome, 160)}`;
}

function renderTracePayload(payload: Record<string, unknown>): string {
  const routingDecision =
    payload.routingDecision as RecallResult["metadata"]["routingDecision"];
  const hits = payload.hits as RecallResult["metadata"]["hits"];
  const candidateTraces =
    payload.candidateTraces as unknown as RecallCandidateTrace[];
  const verificationHints =
    payload.verificationHints as RecallResult["metadata"]["verificationHints"];
  const returned = candidateTraces.filter((trace) => trace.returned);
  const suppressed = candidateTraces
    .filter((trace) => !trace.returned)
    .slice(0, TRACE_SUPPRESSED_LIMIT);
  const policyApplied = payload.policyApplied as string[];
  const storage = payload.storage as Record<string, unknown>;

  return [
    `Scope: ${formatScope(payload.scope as unknown as MemoryScope)}`,
    `Storage: ${storage.provider} (${storage.location})`,
    `Query: ${payload.query}`,
    "",
    "Routing Decision",
    `- requested strategy: ${routingDecision.strategyExplanation.requestedStrategy}`,
    `- resolved strategy: ${routingDecision.strategyExplanation.resolvedStrategy}`,
    `- retrieval profile: ${routingDecision.retrievalProfile}`,
    `- intent: ${routingDecision.intent}`,
    `- explanation: ${routingDecision.strategyExplanation.summary}`,
    "",
    "Hits",
    ...(hits.length > 0
      ? hits.map(
          (hit) =>
            `- ${hit.type}: ${hit.reason ?? "no_reason"}${
              hit.evidenceIds?.length ? ` [evidence=${hit.evidenceIds.join(",")}]` : ""
            }`,
        )
      : ["- none"]),
    "",
    "Returned Candidate Traces",
    ...(returned.length > 0 ? returned.map(formatCandidateTrace) : ["- none"]),
    "",
    "Suppressed Candidate Traces",
    ...(suppressed.length > 0
      ? suppressed.map(formatCandidateTrace)
      : ["- none"]),
    "",
    "Verification Hints",
    ...(verificationHints.length > 0
      ? verificationHints.map(
          (hint) =>
            `- ${hint.memoryType}:${hint.memoryId} ${clipText(hint.reason, 160)}${
              hint.evidenceIds?.length ? ` [evidence=${hint.evidenceIds.join(",")}]` : ""
            }`,
        )
      : ["- none"]),
    "",
    "Policy Applied",
    ...(policyApplied.length > 0 ? policyApplied.map((item) => `- ${item}`) : ["- none"]),
  ].join("\n");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeExportMemoryOutput(input: {
  force: boolean;
  outputPath: string;
  result: ExportMemoryResult;
}): Promise<void> {
  if ((await pathExists(input.outputPath)) && !input.force) {
    throw new Error(
      `Output path already exists: ${input.outputPath}. Pass --force to overwrite.`,
    );
  }

  if (input.force) {
    await rm(input.outputPath, { force: true, recursive: true });
  }

  await mkdir(input.outputPath, { recursive: true });
  await writeFile(
    join(input.outputPath, "memory-export.json"),
    `${JSON.stringify(input.result, null, 2)}\n`,
    "utf8",
  );

  for (const file of input.result.artifacts.files) {
    const destination = join(
      input.outputPath,
      input.result.artifacts.rootPath,
      file.relativePath,
    );
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }
}

async function exportCaseArtifact(input: {
  caseId: string;
  force: boolean;
  outputPath: string;
  runDir: string;
}): Promise<void> {
  if ((await pathExists(input.outputPath)) && !input.force) {
    throw new Error(
      `Output path already exists: ${input.outputPath}. Pass --force to overwrite.`,
    );
  }

  if (input.force) {
    await rm(input.outputPath, { force: true });
  }

  await mkdir(dirname(input.outputPath), { recursive: true });
  await copyFile(
    join(input.runDir, "cases", `${input.caseId}.json`),
    input.outputPath,
  );
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

async function inspectEvalCase(
  runDir: string,
  caseId: string,
): Promise<EvalInspectPayload> {
  return {
    artifact: await readJson<Record<string, unknown>>(
      join(runDir, "cases", `${caseId}.json`),
    ),
    caseId,
    report: await readJson<EvalInspectPayload["report"]>(join(runDir, "report.json")),
  };
}

function renderEvalInspectPayload(payload: EvalInspectPayload): string {
  const artifact = payload.artifact as {
    assertions?: {
      contaminationFindings?: string[];
      passedChecks?: number;
      totalChecks?: number;
      updateFindings?: string[];
    };
    goodmemory?: {
      retrieved?: {
        archives?: unknown[];
        episodes?: unknown[];
        evidence?: unknown[];
        facts?: unknown[];
        feedback?: unknown[];
        policyApplied?: string[];
        preferences?: unknown[];
        references?: unknown[];
      };
      trace?: {
        proposalLifecycle?: ProposalLifecycleTrace | null;
        recallHitCount?: number;
      };
    };
    judge: { winner: string };
    metadata?: {
      evaluationSetting?: string;
      memorySourceDomains?: string[];
      targetDomain?: string;
      taskFamily?: string;
    };
  };
  const retrieved = artifact.goodmemory?.retrieved;
  const proposalLifecycle = artifact.goodmemory?.trace?.proposalLifecycle ?? null;

  return [
    `Run Mode: ${payload.report.mode ?? "unknown"}`,
    `Runtime: generation=${payload.report.runtime?.generationMode ?? "unknown"}, judge=${
      payload.report.runtime?.judgeMode ?? "unknown"
    }`,
    `Case: ${payload.caseId}`,
    `Task Family: ${artifact.metadata?.taskFamily ?? "unknown"}`,
    `Setting: ${artifact.metadata?.evaluationSetting ?? "unknown"}`,
    `Target Domain: ${artifact.metadata?.targetDomain ?? "unknown"}`,
    `Memory Source Domains: ${
      artifact.metadata?.memorySourceDomains?.join(", ") ?? "unknown"
    }`,
    `Winner: ${artifact.judge.winner}`,
    `References: ${retrieved?.references?.length ?? 0}`,
    `Facts: ${retrieved?.facts?.length ?? 0}`,
    `Feedback: ${retrieved?.feedback?.length ?? 0}`,
    `Archives: ${retrieved?.archives?.length ?? 0}`,
    `Evidence: ${retrieved?.evidence?.length ?? 0}`,
    `Episodes: ${retrieved?.episodes?.length ?? 0}`,
    formatCountLine(
      "Experience Records",
      proposalLifecycle?.experienceCount,
      proposalLifecycle?.experienceKindCounts,
    ),
    formatCountLine(
      "Proposals",
      proposalLifecycle?.proposalCount,
      proposalLifecycle?.proposalStatusCounts,
    ),
    formatCountLine(
      "Promotions",
      proposalLifecycle?.promotionCount,
      proposalLifecycle?.promotionDecisionCounts,
    ),
    `Recall Hits: ${artifact.goodmemory?.trace?.recallHitCount ?? 0}`,
    `Assertions: ${
      artifact.assertions
        ? `${artifact.assertions.passedChecks ?? 0}/${artifact.assertions.totalChecks ?? 0} passed`
        : "unknown"
    }`,
    `Contamination Findings: ${
      artifact.assertions?.contaminationFindings?.length ?? 0
    }`,
    `Update Findings: ${artifact.assertions?.updateFindings?.length ?? 0}`,
    `Policy Applied: ${
      retrieved?.policyApplied?.length ? retrieved.policyApplied.join(", ") : "none"
    }`,
  ].join("\n");
}

async function traceEvalCase(
  runDir: string,
  caseId: string,
): Promise<EvalTracePayload> {
  const trace = await readJson<Record<string, unknown>>(
    join(runDir, "traces", caseId, "goodmemory.json"),
  );
  const rawRecall = await readJson<Record<string, unknown>>(
    join(runDir, "traces", caseId, "raw-recall.json"),
  );
  const assertions = await readOptionalJson<Record<string, unknown>>(
    join(runDir, "traces", caseId, "assertions.json"),
  );
  const proposalTrace =
    (await readOptionalJson<ProposalLifecycleTrace>(
      join(runDir, "traces", caseId, "proposal-trace.json"),
    )) ??
    ((trace.trace as { proposalLifecycle?: ProposalLifecycleTrace | null })
      ?.proposalLifecycle ??
      null);

  return {
    assertions,
    caseId,
    proposalTrace,
    rawRecall,
    trace,
  };
}

function renderEvalTracePayload(payload: EvalTracePayload): string {
  const trace = payload.trace as {
    trace: {
      rememberEvents: Array<{
        accepted: number;
        events?: Array<{ memoryType: string; reason?: string }>;
        rejected: number;
        sessionId: string;
      }>;
    };
  };
  const rawRecall = payload.rawRecall as {
    hits?: Array<{ evidenceIds?: string[]; reason?: string; type: string }>;
    policyApplied?: string[];
    routingDecision?: {
      strategy?: string;
      strategyExplanation?: { summary?: string };
    };
    verificationHints?: Array<{
      evidenceIds?: string[];
      memoryType: string;
      reason: string;
    }>;
  };
  const assertions = payload.assertions as
    | {
        checks: Array<{ details: string[]; id: string; passed: boolean }>;
        contaminationFindings: string[];
        updateFindings: string[];
      }
    | null;
  const proposalTrace = payload.proposalTrace;

  const writeLines = trace.trace.rememberEvents.flatMap((session) => {
    const header = `- ${session.sessionId}: accepted=${session.accepted}, rejected=${session.rejected}`;
    const events = (session.events ?? []).map(
      (event) => `  * ${event.memoryType}: ${event.reason ?? "no_reason"}`,
    );
    return [header, ...events];
  });

  const hitLines = (rawRecall.hits ?? []).map(
    (hit) =>
      `- ${hit.type}: ${hit.reason ?? "no_reason"}${
        hit.evidenceIds?.length ? ` [evidence=${hit.evidenceIds.join(",")}]` : ""
      }`,
  );
  const routerLines = rawRecall.routingDecision
    ? [
        `- strategy: ${rawRecall.routingDecision.strategy ?? "unknown"}`,
        `- explanation: ${
          rawRecall.routingDecision.strategyExplanation?.summary ?? "no_explanation"
        }`,
      ]
    : ["- unavailable"];
  const verificationLines = (rawRecall.verificationHints ?? []).map(
    (hint) =>
      `- ${hint.memoryType}: ${hint.reason}${
        hint.evidenceIds?.length ? ` [evidence=${hint.evidenceIds.join(",")}]` : ""
      }`,
  );
  const policyLines = (rawRecall.policyApplied ?? []).map((policy) => `- ${policy}`);
  const proposalLines = proposalTrace
    ? [
        `- experiences: ${proposalTrace.experienceCount}${
          formatCountBreakdown(proposalTrace.experienceKindCounts)
            ? ` [${formatCountBreakdown(proposalTrace.experienceKindCounts)}]`
            : ""
        }`,
        `- proposals: ${proposalTrace.proposalCount}${
          formatCountBreakdown(proposalTrace.proposalStatusCounts)
            ? ` [${formatCountBreakdown(proposalTrace.proposalStatusCounts)}]`
            : ""
        }`,
        ...proposalTrace.proposals.map(
          (proposal) =>
            `- ${proposal.proposalType} / ${proposal.status}: ${clipText(proposal.summary)} ` +
            `[source=${proposal.sourceExperienceIds.length} memory=${proposal.linkedMemoryIds.length} ` +
            `archive=${proposal.linkedArchiveIds.length} evidence=${proposal.linkedEvidenceIds.length}]`,
        ),
      ]
    : ["- unavailable"];
  const promotionLines = proposalTrace
    ? proposalTrace.promotions.map(
        (promotion) =>
          `- ${promotion.proposalId} -> ${promotion.decision} ` +
          `[policy=${promotion.policyOutcome} verification=${promotion.verificationOutcome} eval=${promotion.evalOutcome}]`,
      )
    : ["- unavailable"];
  const assertionLines = assertions
    ? assertions.checks.map(
        (check) =>
          `- ${check.id}: ${check.passed ? "pass" : "fail"} (${check.details.join(", ")})`,
      )
    : ["- unavailable (legacy run)"];

  return [
    "Write Trace",
    ...writeLines,
    "",
    "Recall Hits",
    ...hitLines,
    "",
    "Router Strategy",
    ...routerLines,
    "",
    "Verification Hints",
    ...(verificationLines.length > 0 ? verificationLines : ["- none"]),
    "",
    "Policy Applied",
    ...(policyLines.length > 0 ? policyLines : ["- none"]),
    "",
    "Proposal Lifecycle",
    ...(proposalLines.length > 0 ? proposalLines : ["- none"]),
    "",
    "Promotion Decisions",
    ...(promotionLines.length > 0 ? promotionLines : ["- none"]),
    "",
    "Assertions",
    ...assertionLines,
    "",
    "Contamination Findings",
    ...(assertions?.contaminationFindings.length
      ? assertions.contaminationFindings.map((finding) => `- ${finding}`)
      : ["- none"]),
    "",
    "Update Findings",
    ...(assertions?.updateFindings.length
      ? assertions.updateFindings.map((finding) => `- ${finding}`)
      : ["- none"]),
  ].join("\n");
}

function renderOutput(
  output: CLICommandOutput,
  flags: ParsedFlags,
): CLIResult {
  return {
    exitCode: 0,
    stderr: "",
    stdout: flagEnabled(flags, "json")
      ? `${JSON.stringify(output.json, null, 2)}\n`
      : output.text,
  };
}

async function handleInspect(flags: ParsedFlags): Promise<CLICommandOutput> {
  const scope = resolveScopeFromFlags(flags);
  const includeRuntime = shouldIncludeRuntime(flags, scope);
  const { memory, storage } = await createDiagnosticMemory(flags, {
    readOnlyStorage: true,
  });
  const result = await memory.exportMemory({
    includeRuntime,
    scope,
  });
  const payload = buildInspectPayload({
    result,
    storage,
  });

  return {
    json: payload,
    text: renderInspectPayload(payload),
  };
}

async function handleStats(flags: ParsedFlags): Promise<CLICommandOutput> {
  const scope = resolveScopeFromFlags(flags);
  const includeRuntime = shouldIncludeRuntime(flags, scope);
  const { memory, storage } = await createDiagnosticMemory(flags, {
    readOnlyStorage: true,
  });
  const result = await memory.exportMemory({
    includeRuntime,
    scope,
  });
  const payload = buildStatsPayload({
    result,
    storage,
  });

  return {
    json: payload,
    text: renderStatsPayload(payload),
  };
}

async function handleTrace(flags: ParsedFlags): Promise<CLICommandOutput> {
  const scope = resolveScopeFromFlags(flags);
  const query = requireFlag(flags, "query");
  const retrievalProfile = parseRetrievalProfile(flags);
  const strategy = parseRecallStrategy(flags);
  const { memory, storage } = await createDiagnosticMemory(flags, {
    readOnlyStorage: true,
  });
  const recall = await memory.diagnoseRecall({
    ignoreMemory: false,
    locale: flags.locale,
    query,
    retrievalProfile,
    scope,
    strategy,
  });
  const payload = buildTracePayload({
    query,
    recall,
    scope,
    storage,
  });

  return {
    json: payload,
    text: renderTracePayload(payload),
  };
}

async function handleExportMemory(
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const scope = resolveScopeFromFlags(flags);
  const includeRuntime = shouldIncludeRuntime(flags, scope);
  const outputPath = resolve(requireFlag(flags, "output"));
  const force = flagEnabled(flags, "force");
  const { memory, storage } = await createDiagnosticMemory(flags, {
    readOnlyStorage: true,
  });
  const result = await memory.exportMemory({
    includeRuntime,
    scope,
  });

  await writeExportMemoryOutput({
    force,
    outputPath,
    result,
  });

  const payload = {
    artifactFileCount: result.artifacts.files.length,
    artifactRootPath: result.artifacts.rootPath,
    includeRuntime,
    jsonPath: join(outputPath, "memory-export.json"),
    outputPath,
    scope,
    storage: {
      location: storage.displayValue,
      provider: storage.provider,
    },
  };

  return {
    json: payload,
    text:
      `Exported memory snapshot to ${outputPath}\n` +
      `- json: ${join(outputPath, "memory-export.json")}\n` +
      `- markdown root: ${join(outputPath, result.artifacts.rootPath)}`,
  };
}

async function handleEvalInspect(
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const payload = await inspectEvalCase(
    requireFlag(flags, "run-dir"),
    requireFlag(flags, "case-id"),
  );
  return {
    json: payload,
    text: renderEvalInspectPayload(payload),
  };
}

async function handleEvalTrace(flags: ParsedFlags): Promise<CLICommandOutput> {
  const payload = await traceEvalCase(
    requireFlag(flags, "run-dir"),
    requireFlag(flags, "case-id"),
  );
  return {
    json: payload,
    text: renderEvalTracePayload(payload),
  };
}

async function handleEvalExportCase(
  flags: ParsedFlags,
): Promise<CLICommandOutput> {
  const runDir = requireFlag(flags, "run-dir");
  const caseId = requireFlag(flags, "case-id");
  const outputPath = resolve(requireFlag(flags, "output"));
  await exportCaseArtifact({
    caseId,
    force: flagEnabled(flags, "force"),
    outputPath,
    runDir,
  });

  const payload = {
    caseId,
    outputPath,
    runDir,
  };

  return {
    json: payload,
    text: `Exported case artifact to ${outputPath}`,
  };
}

export async function runCLI(argv: string[]): Promise<CLIResult> {
  try {
    const { commands, flags } = parseArgs(argv);
    const primary = requireCommand(commands, 0);

    if (primary === "eval") {
      const secondary = requireCommand(commands, 1);
      if (secondary === "inspect") {
        return renderOutput(await handleEvalInspect(flags), flags);
      }
      if (secondary === "trace") {
        return renderOutput(await handleEvalTrace(flags), flags);
      }
      if (secondary === "export-case") {
        return renderOutput(await handleEvalExportCase(flags), flags);
      }

      throw new Error(`Unknown eval command: ${secondary}`);
    }

    if (primary === "inspect") {
      return renderOutput(await handleInspect(flags), flags);
    }
    if (primary === "trace") {
      return renderOutput(await handleTrace(flags), flags);
    }
    if (primary === "stats") {
      return renderOutput(await handleStats(flags), flags);
    }
    if (primary === "export-memory") {
      return renderOutput(await handleExportMemory(flags), flags);
    }

    throw new Error(`Unknown command: ${primary}`);
  } catch (error) {
    return {
      exitCode: 1,
      stderr: error instanceof Error ? error.message : String(error),
      stdout: "",
    };
  }
}
