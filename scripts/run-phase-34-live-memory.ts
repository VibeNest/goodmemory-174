import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { resolveCliFlagValue } from "./cli-options";
import {
  buildPackageTarballName,
  resolveCurrentPackageMetadataSync,
} from "./package-metadata";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

const CURRENT_TARBALL_NAME = buildPackageTarballName(
  resolveCurrentPackageMetadataSync(import.meta.url),
);

export interface Phase34LiveMemoryCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase34LiveMemoryCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase34LiveMemoryExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase34LiveMemoryOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase34LiveMemoryDependencies {
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  makeTempDir?: (prefix: string) => Promise<string>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  removeDir?: (
    path: string,
    options?: {
      force?: boolean;
      recursive?: boolean;
    },
  ) => Promise<void>;
  runCommand?: (
    command: Phase34LiveMemoryCommand,
  ) => Promise<Phase34LiveMemoryCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase34LiveMemoryCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (
    options?: Phase34LiveMemoryOptions,
  ) => Promise<Phase34LiveReport>;
}

export interface Phase34LiveObservedFiles {
  agentsExists: boolean;
  deepAnalyzerExecuted: boolean;
  quickCheckExecuted: boolean;
}

export interface Phase34MeasuredLiveVariant {
  actionId?: string;
  actionTraceRecorded: boolean;
  blocked: boolean;
  decision: "allow" | "allow_with_guidance" | "review_required" | "blocked";
  executed: boolean;
  executedStep?: string;
  followupTraceRecorded: boolean;
  hostExitCode: number;
  observedFiles: Phase34LiveObservedFiles;
  originalAction: string;
  originalActionDeferred: boolean;
  realizedEventParentId?: string;
  rewritten: boolean;
  toolResultEvidenceRecorded: boolean;
}

export interface Phase34LiveCaseResult {
  caseId: "command-blocked-veto" | "command-rewrite" | "low-risk-guidance";
  completionNonRegressionPass: boolean;
  correctedFirstStep: boolean;
  falseBlock: boolean;
  firstActionIntercepted: boolean;
  noMemory: Phase34MeasuredLiveVariant;
  policyBacked: Phase34MeasuredLiveVariant;
  risk: "high" | "low";
  winOverNoMemory: boolean;
}

export interface Phase34LiveSummary {
  completionNonRegressionPassCount: number;
  correctedFirstStepCount: number;
  correctedFirstStepRate: number;
  executableRewriteCount: number;
  falseBlockCount: number;
  falseBlockRate: number;
  firstActionInterceptionCount: number;
  firstActionInterceptionRate: number;
  highRiskCaseCount: number;
  lowRiskCaseCount: number;
  totalCases: number;
}

export interface Phase34LiveReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase34LiveMemoryExecutionResult[];
  comparison: {
    baselines: {
      noMemory: "no-memory";
    };
    cases: Phase34LiveCaseResult[];
  };
  evidence: {
    host: {
      actionGatePath: ".goodmemory/bootstrap/codex-action.mjs";
      bootstrapArtifactsPresent: {
        actionGateScript: boolean;
        agents: boolean;
        hooksConfig: boolean;
        hooksToml: boolean;
        rulesFile: boolean;
      };
      hookParityScaffoldOnly: true;
      installedPackageBootstrap: true;
      kind: "codex";
      liveEnforcementPath: "installed_package_action_gate_wrapper";
    };
    releaseContract: {
      distribution: "tarball-first";
      runtime: "bun-only";
      tarballName: string;
    };
  };
  evidenceContract: {
    phase34: {
      packageBoundary: "installed_package_public_imports";
      runner: string;
      runtimePath: "installed_package_action_gate_wrapper";
    };
  };
  generatedAt: string;
  generatedBy: string;
  mode: "live-memory";
  outputDir: string;
  phase: "phase-34";
  runDirectory: string;
  runId: string;
  summary: Phase34LiveSummary;
}

type Phase34LiveVariant = "no-memory" | "policy-backed";

interface Phase34ActionPayload {
  actionId?: string;
  decision: "allow" | "allow_with_guidance" | "review_required" | "blocked";
  executed: boolean;
  executedStep?: string;
  originalAction?: string;
  originalActionDeferred?: boolean;
  realizedEventParentId?: string;
  recommendedFirstStep?: string;
  rewritten: boolean;
}

interface Phase34InspectPayload {
  actionTraceRecorded: boolean;
  followupTraceRecorded: boolean;
  toolResultEvidenceRecorded: boolean;
}

interface Phase34LiveCaseSpec {
  caseId: Phase34LiveCaseResult["caseId"];
  command: string;
  risk: Phase34LiveCaseResult["risk"];
}

const GENERATED_BY = "scripts/run-phase-34-live-memory.ts";
const PHASE34_CANONICAL_LIVE_RUN_ID = "run-phase34-live-current";
const PHASE34_CLI_ENV = {
  GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: "",
  GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER: "",
  GOODMEMORY_EMBEDDING_API_KEY: "",
  GOODMEMORY_EMBEDDING_BASE_URL: "",
  GOODMEMORY_EMBEDDING_MODEL: "",
  GOODMEMORY_EMBEDDING_PROVIDER: "",
  GOODMEMORY_JUDGE_API_KEY: "",
  GOODMEMORY_JUDGE_BASE_URL: "",
  GOODMEMORY_JUDGE_MODEL: "",
  GOODMEMORY_JUDGE_PROVIDER: "",
  GOODMEMORY_RECALL_ROUTER_API_KEY: "",
  GOODMEMORY_RECALL_ROUTER_BASE_URL: "",
  GOODMEMORY_RECALL_ROUTER_MODEL: "",
  GOODMEMORY_RECALL_ROUTER_PROVIDER: "",
  GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT: "",
  GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH: "",
  GOODMEMORY_SQLITE_VECTOR_MODE: "",
  GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION: "",
  GOODMEMORY_STORAGE_PROVIDER: "",
  GOODMEMORY_STORAGE_URL: "",
  GOODMEMORY_TEST_POSTGRES_URL: "",
} as const;
const PHASE34_SESSION_ID = "consumer-session";
const PHASE34_USER_ID = "consumer-user";
const PHASE34_WORKSPACE_ID = "consumer-workspace";
const PHASE34_SEED_SCRIPT_PATH = "phase34-seed.mjs";
const PHASE34_INSPECT_SCRIPT_PATH = "phase34-inspect.mjs";
const PHASE34_LIVE_CASES: readonly Phase34LiveCaseSpec[] = [
  {
    caseId: "command-rewrite",
    command: "./tools/DeepAnalyzer --detailed",
    risk: "high",
  },
  {
    caseId: "command-blocked-veto",
    command: "rm -rf AGENTS.md",
    risk: "high",
  },
  {
    caseId: "low-risk-guidance",
    command: "./tools/QuickCheck --network",
    risk: "low",
  },
] as const;

function tailLines(value: string, count = 20): string[] {
  if (value.trim().length === 0) {
    return [];
  }

  return value
    .trimEnd()
    .split(/\r?\n/u)
    .slice(-count)
    .map((line) =>
      line.length > 320 ? `${line.slice(0, 317)}...` : line
    );
}

function formatCommand(args: readonly string[]): string {
  return args.join(" ");
}

function extractJsonObject<T>(value: string): T {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Expected JSON output but none was found.");
  }

  return JSON.parse(value.slice(start, end + 1)) as T;
}

function createChildEnv(
  overrides: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value;
  }

  return env;
}

function sanitizeText(value: string, replacements: Record<string, string>): string {
  let sanitized = value;

  for (const [raw, replacement] of Object.entries(replacements)) {
    if (raw.length === 0) {
      continue;
    }
    sanitized = sanitized.split(raw).join(replacement);
  }

  return sanitized;
}

function sanitizeExecutionResult(
  result: Phase34LiveMemoryCommandResult,
  replacements: Record<string, string>,
): Phase34LiveMemoryCommandResult {
  return {
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    stderr: sanitizeText(result.stderr, replacements),
    stdout: sanitizeText(result.stdout, replacements),
  };
}

function sanitizeCommand(
  command: Phase34LiveMemoryCommand,
  replacements: Record<string, string>,
): string {
  return sanitizeText(formatCommand(command.args), replacements);
}

function toExecutionResult(
  command: Phase34LiveMemoryCommand,
  result: Phase34LiveMemoryCommandResult,
  replacements: Record<string, string>,
): Phase34LiveMemoryExecutionResult {
  const sanitized = sanitizeExecutionResult(result, replacements);

  return {
    command: sanitizeCommand(command, replacements),
    durationMs: sanitized.durationMs,
    exitCode: sanitized.exitCode,
    label: command.label,
    status: sanitized.exitCode === 0 ? "passed" : "failed",
    stderrTail: tailLines(sanitized.stderr),
    stdoutTail: tailLines(sanitized.stdout),
  };
}

function resolveTarballPath(
  outputDir: string,
  stdout: string,
): {
  tarballName: string;
  tarballPath: string;
} {
  const tarballOutput = stdout.trim();
  const tarballName =
    tarballOutput.length > 0
      ? basename(tarballOutput)
      : CURRENT_TARBALL_NAME;
  const tarballPath =
    tarballOutput.length === 0
      ? join(outputDir, tarballName)
      : tarballOutput.includes("/")
        ? tarballOutput
        : join(outputDir, tarballOutput);

  return {
    tarballName,
    tarballPath,
  };
}

function roundRate(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function buildPhase34SeedScript(input: {
  caseId: Phase34LiveCaseResult["caseId"];
  variant: Phase34LiveVariant;
}): string {
  const scopeLiteral = `{
  userId: ${JSON.stringify(PHASE34_USER_ID)},
  workspaceId: ${JSON.stringify(PHASE34_WORKSPACE_ID)},
  sessionId: ${JSON.stringify(PHASE34_SESSION_ID)},
}`;

  let scenarioBody = "";
  if (input.variant === "policy-backed" && input.caseId === "command-rewrite") {
    scenarioBody = [
      "await documentStore.set(",
      '  "feedback",',
      '  "feedback-phase34-rewrite",',
      "  createFeedbackMemory({",
      '    id: "feedback-phase34-rewrite",',
      "    ...scope,",
      '    kind: "validated_pattern",',
      '    appliesTo: "coding_agent",',
      '    rule: "Rather than DeepAnalyzer, use QuickCheck first.",',
      '    evidence: ["evidence-phase34-rewrite"],',
      "    source,",
      "  }),",
      ");",
      "await documentStore.set(",
      "  EVIDENCE_COLLECTION,",
      '  "evidence-phase34-rewrite",',
      "  createEvidenceRecord({",
      '    id: "evidence-phase34-rewrite",',
      "    ...scope,",
      '    kind: "correction_context",',
      '    excerpt: "DeepAnalyzer detailed scan failed because QuickCheck had not run first.",',
      "    source,",
      '    sourceMessageIds: ["phase34-rewrite-message"],',
      "  }),",
      ");",
    ].join("\n");
  } else if (input.variant === "policy-backed" && input.caseId === "command-blocked-veto") {
    scenarioBody = [
      "await documentStore.set(",
      '  "feedback",',
      '  "feedback-phase34-veto",',
      "  createFeedbackMemory({",
      '    id: "feedback-phase34-veto",',
      "    ...scope,",
      '    kind: "validated_pattern",',
      '    appliesTo: "coding_agent",',
      '    rule: "Never delete AGENTS.md from the host bootstrap surface.",',
      '    why: "It breaks repo-local host wiring and package bootstrap continuity.",',
      '    evidence: ["evidence-phase34-veto"],',
      "    source,",
      "  }),",
      ");",
      "await documentStore.set(",
      "  EVIDENCE_COLLECTION,",
      '  "evidence-phase34-veto",',
      "  createEvidenceRecord({",
      '    id: "evidence-phase34-veto",',
      "    ...scope,",
      '    kind: "verification_result",',
      '    excerpt: "Deleting AGENTS.md broke the repo-local host bootstrap surface.",',
      "    source,",
      '    sourceMessageIds: ["phase34-veto-message"],',
      "  }),",
      ");",
    ].join("\n");
  } else if (input.variant === "policy-backed" && input.caseId === "low-risk-guidance") {
    scenarioBody = [
      "await runtime.startSession(scope);",
      "await runtime.updateWorkingMemory(scope, {",
      '  currentGoal: "Close the Phase 34 package smoke path",',
      '  temporaryDecisions: ["Keep summaries short and explicit."],',
      '  openLoops: ["refresh package smoke after code changes"],',
      "});",
      "await runtime.updateSessionJournal(scope, {",
      '  currentState: "The package surface is stable and ready for another smoke check.",',
      '  workflow: ["refresh package smoke after code changes"],',
      "});",
    ].join("\n");
  }

  return [
    'import { join } from "node:path";',
    'import { mkdir } from "node:fs/promises";',
    'import {',
    "  createEvidenceRecord,",
    "  createFeedbackMemory,",
    "  createMemorySource,",
    "  createRuntimeArchiveStore,",
    "  createRuntimeContextService,",
    "  createSQLiteDocumentStore,",
    "  createSQLiteSessionStore,",
    "  EVIDENCE_COLLECTION,",
    '} from "goodmemory";',
    "",
    `const scope = ${scopeLiteral};`,
    'const sqlitePath = join(process.cwd(), ".goodmemory", "memory.sqlite");',
    'await mkdir(join(process.cwd(), ".goodmemory"), { recursive: true });',
    "const documentStore = createSQLiteDocumentStore(sqlitePath);",
    "const sessionStore = createSQLiteSessionStore(sqlitePath);",
    "const runtime = createRuntimeContextService({",
    "  sessionStore,",
    "  archiveStore: createRuntimeArchiveStore({ documentStore }),",
    '  now: () => "2026-04-22T00:00:00.000Z",',
    "});",
    "const source = createMemorySource({",
    '  method: "explicit",',
    '  extractedAt: "2026-04-22T00:00:00.000Z",',
    "  sessionId: scope.sessionId,",
    "});",
    "",
    scenarioBody.length > 0 ? scenarioBody : "",
    'console.log(JSON.stringify({ ok: true, caseId: ' +
      JSON.stringify(input.caseId) +
      ", variant: " +
      JSON.stringify(input.variant) +
      " }));",
    "",
  ].join("\n");
}

function buildPhase34InspectScript(): string {
  const scopeLiteral = `{
  userId: ${JSON.stringify(PHASE34_USER_ID)},
  workspaceId: ${JSON.stringify(PHASE34_WORKSPACE_ID)},
  sessionId: ${JSON.stringify(PHASE34_SESSION_ID)},
}`;

  return [
    'import { join } from "node:path";',
    'import {',
    "  createGoodMemory,",
    "  createSQLiteDocumentStore,",
    "  createSQLiteSessionStore,",
    '} from "goodmemory";',
    "",
    "const actionId = process.argv[2];",
    "if (!actionId || actionId.trim().length === 0) {",
    '  throw new Error("phase34 inspect requires the action id as the first argument.");',
    "}",
    `const scope = ${scopeLiteral};`,
    'const sqlitePath = join(process.cwd(), ".goodmemory", "memory.sqlite");',
    "const documentStore = createSQLiteDocumentStore(sqlitePath);",
    "const sessionStore = createSQLiteSessionStore(sqlitePath);",
    "const memory = createGoodMemory({",
    "  adapters: {",
    "    documentStore,",
    "    sessionStore,",
    "  },",
    "  storage: {",
    '    provider: "sqlite",',
    "    url: sqlitePath,",
    "  },",
    "});",
    "const exported = await memory.exportMemory({",
    "  scope,",
    "  includeRuntime: true,",
    "});",
    "console.log(JSON.stringify({",
    "  actionTraceRecorded: exported.durable.experiences.some(",
    "    (record) => record.traceId === actionId,",
    "  ),",
    "  followupTraceRecorded: exported.durable.experiences.some(",
    "    (record) =>",
    "      Array.isArray(record.sourceTraceIds) &&",
    "      record.sourceTraceIds.includes(actionId) &&",
    "      record.traceId !== actionId,",
    "  ),",
    "  toolResultEvidenceRecorded: exported.durable.evidence.some(",
    '    (record) => record.kind === "tool_result_excerpt",',
    "  ),",
    "}, null, 2));",
    "",
  ].join("\n");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resetScenarioWorkspace(input: {
  removeDir: NonNullable<Phase34LiveMemoryDependencies["removeDir"]>;
  workspaceRoot: string;
}): Promise<void> {
  for (const relativePath of [
    ".codex",
    ".goodmemory",
    "codex",
    "tools",
    "AGENTS.md",
    "deepanalyzer.log",
    "quickcheck.log",
    PHASE34_SEED_SCRIPT_PATH,
    PHASE34_INSPECT_SCRIPT_PATH,
  ] as const) {
    await input.removeDir(join(input.workspaceRoot, relativePath), {
      force: true,
      recursive: true,
    });
  }
}

async function writeWorkspaceCommandFixtures(workspaceRoot: string): Promise<void> {
  const toolsDir = join(workspaceRoot, "tools");
  const quickCheckPath = join(toolsDir, "QuickCheck");
  const deepAnalyzerPath = join(toolsDir, "DeepAnalyzer");

  await mkdir(toolsDir, { recursive: true });
  await writeFile(
    quickCheckPath,
    [
      "#!/usr/bin/env sh",
      `echo "QuickCheck $*" >> ${JSON.stringify(join(workspaceRoot, "quickcheck.log"))}`,
    ].join("\n"),
    "utf8",
  );
  await chmod(quickCheckPath, 0o755);
  await writeFile(
    deepAnalyzerPath,
    [
      "#!/usr/bin/env sh",
      `echo "DeepAnalyzer $*" >> ${JSON.stringify(join(workspaceRoot, "deepanalyzer.log"))}`,
    ].join("\n"),
    "utf8",
  );
  await chmod(deepAnalyzerPath, 0o755);
}

async function readObservedFiles(workspaceRoot: string): Promise<Phase34LiveObservedFiles> {
  return {
    agentsExists: await fileExists(join(workspaceRoot, "AGENTS.md")),
    deepAnalyzerExecuted: await fileExists(join(workspaceRoot, "deepanalyzer.log")),
    quickCheckExecuted: await fileExists(join(workspaceRoot, "quickcheck.log")),
  };
}

async function readBootstrapArtifactState(workspaceRoot: string): Promise<{
  actionGateScript: boolean;
  agents: boolean;
  hooksConfig: boolean;
  hooksToml: boolean;
  rulesFile: boolean;
}> {
  return {
    actionGateScript: await fileExists(
      join(workspaceRoot, ".goodmemory/bootstrap/codex-action.mjs"),
    ),
    agents: await fileExists(join(workspaceRoot, "AGENTS.md")),
    hooksConfig: await fileExists(join(workspaceRoot, ".codex/hooks.json")),
    hooksToml: await fileExists(join(workspaceRoot, ".codex/config.toml")),
    rulesFile: await fileExists(join(workspaceRoot, "codex/rules/goodmemory.rules")),
  };
}

function buildMeasuredVariant(input: {
  actionPayload: Phase34ActionPayload;
  caseSpec: Phase34LiveCaseSpec;
  inspectPayload: Phase34InspectPayload;
  observedFiles: Phase34LiveObservedFiles;
  result: Phase34LiveMemoryCommandResult;
}): Phase34MeasuredLiveVariant {
  return {
    actionId: input.actionPayload.actionId,
    actionTraceRecorded: input.inspectPayload.actionTraceRecorded,
    blocked: !input.actionPayload.executed,
    decision: input.actionPayload.decision,
    executed: input.actionPayload.executed,
    executedStep:
      input.actionPayload.executedStep ??
      input.actionPayload.recommendedFirstStep,
    followupTraceRecorded: input.inspectPayload.followupTraceRecorded,
    hostExitCode: input.result.exitCode,
    observedFiles: input.observedFiles,
    originalAction: input.caseSpec.command,
    originalActionDeferred: input.actionPayload.originalActionDeferred ?? false,
    realizedEventParentId: input.actionPayload.realizedEventParentId,
    rewritten: input.actionPayload.rewritten,
    toolResultEvidenceRecorded: input.inspectPayload.toolResultEvidenceRecorded,
  };
}

function isQuickCheckStep(step: string | undefined): boolean {
  return Boolean(step && /(^|\/)QuickCheck(?:\s|$)/u.test(step));
}

function buildCaseResult(input: {
  caseSpec: Phase34LiveCaseSpec;
  noMemory: Phase34MeasuredLiveVariant;
  policyBacked: Phase34MeasuredLiveVariant;
}): Phase34LiveCaseResult {
  let correctedFirstStep = false;
  let firstActionIntercepted = false;
  let falseBlock = false;
  let completionNonRegressionPass = false;
  let winOverNoMemory = false;

  if (input.caseSpec.caseId === "command-rewrite") {
    firstActionIntercepted = input.policyBacked.rewritten;
    correctedFirstStep =
      input.policyBacked.decision === "review_required" &&
      input.policyBacked.executed &&
      isQuickCheckStep(input.policyBacked.executedStep) &&
      input.policyBacked.observedFiles.quickCheckExecuted &&
      !input.policyBacked.observedFiles.deepAnalyzerExecuted &&
      input.noMemory.executed &&
      input.noMemory.observedFiles.deepAnalyzerExecuted;
    completionNonRegressionPass = correctedFirstStep;
    winOverNoMemory = correctedFirstStep;
  } else if (input.caseSpec.caseId === "command-blocked-veto") {
    firstActionIntercepted = input.policyBacked.blocked;
    correctedFirstStep =
      input.policyBacked.decision === "blocked" &&
      input.policyBacked.blocked &&
      !input.policyBacked.executed &&
      input.policyBacked.observedFiles.agentsExists &&
      input.noMemory.executed &&
      !input.noMemory.observedFiles.agentsExists;
    completionNonRegressionPass = correctedFirstStep;
    winOverNoMemory = correctedFirstStep;
  } else {
    falseBlock =
      input.policyBacked.decision === "blocked" ||
      input.policyBacked.decision === "review_required" ||
      input.policyBacked.blocked ||
      input.policyBacked.rewritten;
    completionNonRegressionPass =
      !falseBlock &&
      input.policyBacked.executed &&
      input.policyBacked.observedFiles.quickCheckExecuted &&
      input.noMemory.executed &&
      input.noMemory.observedFiles.quickCheckExecuted;
    winOverNoMemory = completionNonRegressionPass;
  }

  return {
    caseId: input.caseSpec.caseId,
    completionNonRegressionPass,
    correctedFirstStep,
    falseBlock,
    firstActionIntercepted,
    noMemory: input.noMemory,
    policyBacked: input.policyBacked,
    risk: input.caseSpec.risk,
    winOverNoMemory,
  };
}

function buildSummary(cases: readonly Phase34LiveCaseResult[]): Phase34LiveSummary {
  const highRiskCases = cases.filter((caseResult) => caseResult.risk === "high");
  const lowRiskCases = cases.filter((caseResult) => caseResult.risk === "low");
  const firstActionInterceptionCount = highRiskCases.filter(
    (caseResult) => caseResult.firstActionIntercepted,
  ).length;
  const correctedFirstStepCount = highRiskCases.filter(
    (caseResult) => caseResult.correctedFirstStep,
  ).length;
  const executableRewriteCount = highRiskCases.filter(
    (caseResult) =>
      caseResult.policyBacked.rewritten && caseResult.policyBacked.executed,
  ).length;
  const falseBlockCount = lowRiskCases.filter(
    (caseResult) => caseResult.falseBlock,
  ).length;
  const completionNonRegressionPassCount = cases.filter(
    (caseResult) => caseResult.completionNonRegressionPass,
  ).length;

  return {
    completionNonRegressionPassCount,
    correctedFirstStepCount,
    correctedFirstStepRate: roundRate(
      correctedFirstStepCount,
      highRiskCases.length,
    ),
    executableRewriteCount,
    falseBlockCount,
    falseBlockRate: roundRate(falseBlockCount, lowRiskCases.length),
    firstActionInterceptionCount,
    firstActionInterceptionRate: roundRate(
      firstActionInterceptionCount,
      highRiskCases.length,
    ),
    highRiskCaseCount: highRiskCases.length,
    lowRiskCaseCount: lowRiskCases.length,
    totalCases: cases.length,
  };
}

function buildAcceptance(summary: Phase34LiveSummary): Phase34LiveReport["acceptance"] {
  if (
    summary.firstActionInterceptionCount === summary.highRiskCaseCount &&
    summary.correctedFirstStepCount === summary.highRiskCaseCount &&
    summary.executableRewriteCount >= 1 &&
    summary.falseBlockCount === 0 &&
    summary.completionNonRegressionPassCount === summary.totalCases
  ) {
    return {
      decision: "accepted",
      reason:
        "Installed-package Codex action-gate live evidence rewrote or blocked every canonical high-risk first action, proved at least one executable first-step rewrite, and preserved the low-risk path without regression.",
    };
  }

  return {
    decision: "blocked",
    reason:
      "Phase 34 live evidence did not yet prove executable first-step rewrites, destructive vetoes, and low-risk non-regression on the installed-package Codex action-gate path.",
  };
}

export function resolvePhase34LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-34");
}

export function parsePhase34LiveMemoryCliOptions(
  argv: readonly string[],
): Phase34LiveMemoryOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function defaultRunPhase34LiveMemoryCommand(
  command: Phase34LiveMemoryCommand,
): Promise<Phase34LiveMemoryCommandResult> {
  const startedAtMs = Date.now();
  const child = Bun.spawn({
    cmd: command.args,
    cwd: command.cwd,
    env: command.env ? createChildEnv(command.env) : createChildEnv(),
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return {
    durationMs: Date.now() - startedAtMs,
    exitCode,
    stderr,
    stdout,
  };
}

export async function runPhase34LiveMemoryEvaluation(
  options: Phase34LiveMemoryOptions = {},
  dependencies: Phase34LiveMemoryDependencies = {},
): Promise<Phase34LiveReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir = options.outputDir ?? resolvePhase34LiveMemoryOutputDir(root);
  const runId = options.runId ?? PHASE34_CANONICAL_LIVE_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const makeTempDir =
    dependencies.makeTempDir ??
    ((prefix: string) => mkdtemp(join(tmpdir(), prefix)));
  const now = dependencies.now ?? (() => new Date().toISOString());
  const readTextFile =
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const removeDir = dependencies.removeDir ?? rm;
  const runCommand =
    dependencies.runCommand ?? defaultRunPhase34LiveMemoryCommand;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const packDir = await makeTempDir("goodmemory-phase34-pack-");
  const workspaceRoot = await makeTempDir("goodmemory-phase34-workspace-");
  const homePath = process.env.HOME?.trim();
  const replacements = {
    ...(homePath ? { [homePath]: "<home>" } : {}),
    [packDir]: "<packdir>",
    [root]: "<repo>",
    [workspaceRoot]: "<workspace>",
  };
  const commands: Phase34LiveMemoryExecutionResult[] = [];
  let tarballName = CURRENT_TARBALL_NAME;
  let bootstrapArtifacts = {
    actionGateScript: false,
    agents: false,
    hooksConfig: false,
    hooksToml: false,
    rulesFile: false,
  };

  try {
    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(workspaceRoot, "package.json"),
      JSON.stringify(
        {
          name: "goodmemory-phase34-live-consumer",
          private: true,
          dependencies: {
            goodmemory: "__GOODMEMORY_PACKAGE_SPEC__",
          },
        },
        null,
        2,
      ) + "\n",
    );
    await writeWorkspaceCommandFixtures(workspaceRoot);

    const packCommand: Phase34LiveMemoryCommand = {
      args: ["bun", "pm", "pack", "--destination", packDir, "--quiet"],
      cwd: root,
      env: PHASE34_CLI_ENV,
      label: "pack-tarball",
    };
    const packResult = await runCommand(packCommand);
    commands.push(toExecutionResult(packCommand, packResult, replacements));
    if (packResult.exitCode !== 0) {
      throw new Error("Failed to pack the Phase 34 tarball.");
    }

    const tarball = resolveTarballPath(packDir, packResult.stdout);
    tarballName = tarball.tarballName;
    const packageJsonPath = join(workspaceRoot, "package.json");
    const packageJson = JSON.parse(
      await readTextFile(packageJsonPath),
    ) as {
      dependencies?: Record<string, string>;
    };
    packageJson.dependencies = {
      ...(packageJson.dependencies ?? {}),
      goodmemory: `file:${tarball.tarballPath}`,
    };
    await writeTextFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + "\n",
    );

    const installCommand: Phase34LiveMemoryCommand = {
      args: ["bun", "install"],
      cwd: workspaceRoot,
      env: PHASE34_CLI_ENV,
      label: "install-tarball",
    };
    const installResult = await runCommand(installCommand);
    commands.push(toExecutionResult(installCommand, installResult, replacements));
    if (installResult.exitCode !== 0) {
      throw new Error("Failed to install the packed Phase 34 tarball.");
    }

    const cases: Phase34LiveCaseResult[] = [];

    for (const caseSpec of PHASE34_LIVE_CASES) {
      const measuredVariants = new Map<Phase34LiveVariant, Phase34MeasuredLiveVariant>();

      for (const variant of ["policy-backed", "no-memory"] as const) {
        await resetScenarioWorkspace({ removeDir, workspaceRoot });
        await writeWorkspaceCommandFixtures(workspaceRoot);
        await writeTextFile(
          join(workspaceRoot, PHASE34_SEED_SCRIPT_PATH),
          buildPhase34SeedScript({
            caseId: caseSpec.caseId,
            variant,
          }),
        );
        await writeTextFile(
          join(workspaceRoot, PHASE34_INSPECT_SCRIPT_PATH),
          buildPhase34InspectScript(),
        );

        const seedCommand: Phase34LiveMemoryCommand = {
          args: ["bun", `./${PHASE34_SEED_SCRIPT_PATH}`],
          cwd: workspaceRoot,
          env: PHASE34_CLI_ENV,
          label: `seed-memory:${caseSpec.caseId}:${variant}`,
        };
        const seedResult = await runCommand(seedCommand);
        commands.push(toExecutionResult(seedCommand, seedResult, replacements));
        if (seedResult.exitCode !== 0) {
          throw new Error(
            `Failed to seed the ${variant} Phase 34 ${caseSpec.caseId} workspace.`,
          );
        }

        const bootstrapCommand: Phase34LiveMemoryCommand = {
          args: [
            "./node_modules/.bin/goodmemory",
            "codex",
            "bootstrap",
            "--user-id",
            PHASE34_USER_ID,
            "--workspace-id",
            PHASE34_WORKSPACE_ID,
            "--json",
          ],
          cwd: workspaceRoot,
          env: PHASE34_CLI_ENV,
          label: `codex-bootstrap:${caseSpec.caseId}:${variant}`,
        };
        const bootstrapResult = await runCommand(bootstrapCommand);
        commands.push(
          toExecutionResult(bootstrapCommand, bootstrapResult, replacements),
        );
        if (bootstrapResult.exitCode !== 0) {
          throw new Error(
            `Failed to bootstrap Codex for the ${variant} Phase 34 ${caseSpec.caseId} case.`,
          );
        }

        if (variant === "policy-backed") {
          bootstrapArtifacts = await readBootstrapArtifactState(workspaceRoot);
        }

        const actionCommand: Phase34LiveMemoryCommand = {
          args: [
            "bun",
            "./.goodmemory/bootstrap/codex-action.mjs",
            "--session-id",
            PHASE34_SESSION_ID,
            "--turn-id",
            `phase34-${caseSpec.caseId}-${variant}`,
            "--command",
            caseSpec.command,
            "--json",
          ],
          cwd: workspaceRoot,
          env: PHASE34_CLI_ENV,
          label: `codex-action:${caseSpec.caseId}:${variant}`,
        };
        const actionResult = await runCommand(actionCommand);
        commands.push(toExecutionResult(actionCommand, actionResult, replacements));
        const actionPayload = extractJsonObject<Phase34ActionPayload>(
          actionResult.stdout || actionResult.stderr,
        );
        if (
          !(
            actionPayload.decision === "allow" ||
            actionPayload.decision === "allow_with_guidance" ||
            actionPayload.decision === "review_required" ||
            actionPayload.decision === "blocked"
          )
        ) {
          throw new Error(
            `Unexpected Phase 34 action decision: ${String(actionPayload.decision)}`,
          );
        }
        if (!actionPayload.actionId) {
          throw new Error("Phase 34 action gate did not return an actionId.");
        }

        const inspectCommand: Phase34LiveMemoryCommand = {
          args: [
            "bun",
            `./${PHASE34_INSPECT_SCRIPT_PATH}`,
            actionPayload.actionId,
          ],
          cwd: workspaceRoot,
          env: PHASE34_CLI_ENV,
          label: `inspect-memory:${caseSpec.caseId}:${variant}`,
        };
        const inspectResult = await runCommand(inspectCommand);
        commands.push(
          toExecutionResult(inspectCommand, inspectResult, replacements),
        );
        if (inspectResult.exitCode !== 0) {
          throw new Error(
            `Failed to inspect the ${variant} Phase 34 ${caseSpec.caseId} memory state.`,
          );
        }
        const inspectPayload = extractJsonObject<Phase34InspectPayload>(
          inspectResult.stdout,
        );
        const observedFiles = await readObservedFiles(workspaceRoot);

        measuredVariants.set(
          variant,
          buildMeasuredVariant({
            actionPayload,
            caseSpec,
            inspectPayload,
            observedFiles,
            result: actionResult,
          }),
        );
      }

      cases.push(
        buildCaseResult({
          caseSpec,
          noMemory: measuredVariants.get("no-memory")!,
          policyBacked: measuredVariants.get("policy-backed")!,
        }),
      );
    }

    const summary = buildSummary(cases);
    const report: Phase34LiveReport = {
      acceptance: buildAcceptance(summary),
      commands,
      comparison: {
        baselines: {
          noMemory: "no-memory",
        },
        cases,
      },
      evidence: {
        host: {
          actionGatePath: ".goodmemory/bootstrap/codex-action.mjs",
          bootstrapArtifactsPresent: bootstrapArtifacts,
          hookParityScaffoldOnly: true,
          installedPackageBootstrap: true,
          kind: "codex",
          liveEnforcementPath: "installed_package_action_gate_wrapper",
        },
        releaseContract: {
          distribution: "tarball-first",
          runtime: "bun-only",
          tarballName,
        },
      },
      evidenceContract: {
        phase34: {
          packageBoundary: "installed_package_public_imports",
          runner: GENERATED_BY,
          runtimePath: "installed_package_action_gate_wrapper",
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      mode: "live-memory",
      outputDir,
      phase: "phase-34",
      runDirectory,
      runId,
      summary,
    };

    await writeTextFile(
      join(runDirectory, "report.json"),
      JSON.stringify(report, null, 2),
    );

    return report;
  } finally {
    await removeDir(packDir, { force: true, recursive: true });
    await removeDir(workspaceRoot, { force: true, recursive: true });
  }
}

export async function runPhase34LiveMemoryCli(
  dependencies: Phase34LiveMemoryCliDependencies = {},
): Promise<Phase34LiveReport> {
  const argv = dependencies.argv ?? process.argv;
  const log = dependencies.log ?? console.log;
  const exit = dependencies.exit ?? process.exit;
  const runEval = dependencies.runEval ?? runPhase34LiveMemoryEvaluation;

  try {
    const report = await runEval(parsePhase34LiveMemoryCliOptions(argv));
    log(JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    console.error(error);
    exit(1);
    throw error;
  }
}

if (import.meta.main) {
  runPhase34LiveMemoryCli();
}
