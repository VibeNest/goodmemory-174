import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import {
  parseCodexExecEventLine,
  resolveCodexExecRuntime,
  type CodexExecEvent,
  type CodexExecTurn,
  unwrapCodexShellCommand,
} from "../src/host/codexExecBehavioralTrace";
import { resolveCliFlagValue } from "./cli-options";
import {
  buildPackageTarballName,
  resolveCurrentPackageMetadataSync,
} from "./package-metadata";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

const CURRENT_TARBALL_NAME = buildPackageTarballName(
  resolveCurrentPackageMetadataSync(import.meta.url),
);

export interface Phase32LiveMemoryCommand {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  label: string;
}

export interface Phase32LiveMemoryCommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface Phase32LiveMemoryExecutionResult {
  command: string;
  durationMs: number;
  exitCode: number;
  label: string;
  status: "failed" | "passed";
  stderrTail: string[];
  stdoutTail: string[];
}

export interface Phase32LiveMemoryOptions {
  outputDir?: string;
  runId?: string;
}

export interface Phase32LiveMemoryDependencies {
  copyDir?: (
    from: string,
    to: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  ensureDir?: (
    path: string,
    options?: {
      recursive?: boolean;
    },
  ) => Promise<void>;
  makeTempDir?: (prefix: string) => Promise<string>;
  now?: () => string;
  readTextFile?: (path: string) => Promise<string>;
  realpathFn?: (path: string) => Promise<string>;
  removeDir?: (
    path: string,
    options?: {
      force?: boolean;
      recursive?: boolean;
    },
  ) => Promise<void>;
  runCodexHostTurn?: (input: {
    env: Record<string, string>;
    prompt: string;
    workspaceRoot: string;
  }) => Promise<CodexExecTurn>;
  runCommand?: (
    command: Phase32LiveMemoryCommand,
  ) => Promise<Phase32LiveMemoryCommandResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase32LiveMemoryCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (
    options?: Phase32LiveMemoryOptions,
  ) => Promise<Phase32LiveMemoryReport>;
}

export interface Phase32LiveMemoryReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  commands: Phase32LiveMemoryExecutionResult[];
  comparison: {
    baselines: {
      noMemory: "no-memory";
      textOnly: "frozen-pre-phase31-public-text-only";
    };
    cases: Array<{
      caseId:
        | "continuity-open-loop"
        | "procedure-adherence"
        | "repeated-correction";
      eventBacked: Phase32MeasuredLiveVariant;
      nonRegressionAgainstTextOnly: boolean;
      noMemory: Phase32MeasuredLiveVariant;
      textOnly: Phase32MeasuredLiveVariant;
      winOverNoMemory: boolean;
    }>;
  };
  evidence: {
    host: {
      artifactReadCommands: string[];
      expectedResponse: {
        currentGoal: string;
        openLoop: string;
      };
      exportedArtifactPaths: string[];
      guidanceReadFromArtifacts: boolean;
      installedPackageBootstrap: boolean;
      kind: "codex";
      manifestPath: string;
      observedResponse: {
        currentGoal: string;
        openLoop: string;
      };
      traceBacked: boolean;
      traceEventCount: number;
    };
    releaseContract: {
      distribution: "tarball-first";
      runtime: "bun-only";
      tarballName: string;
    };
  };
  evidenceContract: {
    phase32: {
      hostEventTransport: "native_host_events";
      packageBoundary: "installed_package_public_imports";
      runner: string;
    };
  };
  generatedAt: string;
  generatedBy: string;
  mode: "live-external-host";
  outputDir: string;
  phase: "phase-32";
  runDirectory: string;
  runId: string;
}

type Phase32LiveVariant = "event-backed" | "no-memory" | "text-only";

export interface Phase32MeasuredLiveVariant {
  artifactReadCommands: string[];
  hostExitCode: number;
  matchedExpectedFieldCount: number;
  observedResponse: Record<string, string>;
  traceBacked: boolean;
  traceEventCount: number;
}

const GENERATED_BY = "scripts/run-phase-32-live-memory.ts";
const PHASE32_CANONICAL_LIVE_RUN_ID = "run-phase32-live-current";
const PHASE32_CLI_ENV = {
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
const PHASE32_EXPECTED_RESPONSE = {
  currentGoal: "Finish the bootstrap smoke path",
  openLoop: "Verify exported session handoff",
} as const;
const PHASE32_NATIVE_PROMPT = [
  "Without editing files, inspect ONLY the exported guidance under .goodmemory/hosts/codex and reply with ONLY a JSON object.",
  "Use exactly these keys: currentGoal and openLoop.",
  'If a requested value is absent from the exported guidance, return "none" for that key.',
  "When a value exists, use the exact wording from the exported guidance files.",
].join(" ");
const PHASE32_SUMMARY_RULE_PROMPT = [
  "Without editing files, inspect ONLY the exported guidance under .goodmemory/hosts/codex and reply with ONLY a JSON object.",
  "Use exactly this key: summaryRule.",
  'If the exported guidance does not contain a summary-formatting rule, return {"summaryRule":"none"}.',
  "When the rule exists, return only the rule text itself and strip markdown bullets or leading tags such as [do].",
].join(" ");
const PHASE32_BOOTSTRAP_RULE_PROMPT = [
  "Without editing files, inspect ONLY the exported guidance under .goodmemory/hosts/codex and reply with ONLY a JSON object.",
  "Use exactly these keys: bootstrapRule and blocker.",
  'If a requested value is absent from the exported guidance, return "none" for that key.',
  "When a value exists, use the exact wording from the exported guidance files.",
].join(" ");
const CODEX_HOST_TURN_TIMEOUT_MS = 90_000;
const PHASE32_SUMMARY_RULE =
  "Keep coding summaries short and list explicit next steps.";
const PHASE32_BOOTSTRAP_RULE = "Use packaged CLI bootstrap only.";
const PHASE32_BLOCKER = "the deploy is blocked on smoke verification.";
const PHASE32_MANIFEST_PATH = ".goodmemory/hosts/codex/export-manifest.json";
const PHASE32_MEMORY_ARTIFACT_PATH = ".goodmemory/hosts/codex/MEMORY.md";
const PHASE32_SESSION_MEMORY_ARTIFACT_PATH =
  ".goodmemory/hosts/codex/session-memory/current.md";
const PHASE32_REQUIRED_MANIFEST_ARTIFACT_PATHS = [
  PHASE32_MEMORY_ARTIFACT_PATH,
  PHASE32_SESSION_MEMORY_ARTIFACT_PATH,
] as const;
const PHASE32_TRACKED_ARTIFACT_PATHS = [
  PHASE32_MANIFEST_PATH,
  ...PHASE32_REQUIRED_MANIFEST_ARTIFACT_PATHS,
] as const;
const PHASE32_CONTENT_READ_COMMAND_PATTERN =
  /\b(?:awk|cat|grep|head|perl|python|python3|rg|ruby|sed|tail)\b/u;

interface Phase32LiveCaseSpec {
  caseId:
    | "continuity-open-loop"
    | "procedure-adherence"
    | "repeated-correction";
  expected: Record<string, string>;
  expectedFieldCount: number;
  prompt: string;
  requiredArtifactPaths: readonly string[];
}

interface Phase32EvaluatedLiveCase {
  artifactReadCommands: string[];
  caseId: Phase32LiveCaseSpec["caseId"];
  hostExitCode: number;
  matchedExpectedFieldCount: number;
  observedResponse: Record<string, string>;
  traceBacked: boolean;
  traceEventCount: number;
  variant: Phase32LiveVariant;
}

const PHASE32_LIVE_CASES: readonly Phase32LiveCaseSpec[] = [
  {
    caseId: "continuity-open-loop",
    expected: { ...PHASE32_EXPECTED_RESPONSE },
    expectedFieldCount: 2,
    prompt: PHASE32_NATIVE_PROMPT,
    requiredArtifactPaths: [PHASE32_SESSION_MEMORY_ARTIFACT_PATH],
  },
  {
    caseId: "repeated-correction",
    expected: {
      summaryRule: PHASE32_SUMMARY_RULE,
    },
    expectedFieldCount: 1,
    prompt: PHASE32_SUMMARY_RULE_PROMPT,
    requiredArtifactPaths: [PHASE32_MEMORY_ARTIFACT_PATH],
  },
  {
    caseId: "procedure-adherence",
    expected: {
      blocker: PHASE32_BLOCKER,
      bootstrapRule: PHASE32_BOOTSTRAP_RULE,
    },
    expectedFieldCount: 2,
    prompt: PHASE32_BOOTSTRAP_RULE_PROMPT,
    requiredArtifactPaths: [
      PHASE32_MEMORY_ARTIFACT_PATH,
      PHASE32_SESSION_MEMORY_ARTIFACT_PATH,
    ],
  },
] as const;

const PHASE32_LIVE_VARIANTS = [
  "event-backed",
  "text-only",
  "no-memory",
] as const satisfies readonly Phase32LiveVariant[];

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

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);
  return relativePath.length > 0 ? relativePath : ".";
}

function sanitizeExecutionResult(
  result: Phase32LiveMemoryCommandResult,
  replacements: Record<string, string>,
): Phase32LiveMemoryCommandResult {
  return {
    ...result,
    stderr: sanitizeText(result.stderr, replacements),
    stdout: sanitizeText(result.stdout, replacements),
  };
}

function sanitizeCommand(
  command: Phase32LiveMemoryCommand,
  replacements: Record<string, string>,
): string {
  return sanitizeText(formatCommand(command.args), replacements);
}

function toExecutionResult(
  command: Phase32LiveMemoryCommand,
  result: Phase32LiveMemoryCommandResult,
  replacements: Record<string, string>,
): Phase32LiveMemoryExecutionResult {
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

function collectAgentMessages(events: readonly CodexExecEvent[]): string[] {
  return events.flatMap((event) => {
    if (
      event.type !== "item.completed" ||
      event.item?.type !== "agent_message" ||
      typeof event.item.text !== "string"
    ) {
      return [];
    }

    const trimmed = event.item.text.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  });
}

function collectArtifactReadCommands(input: {
  events: readonly CodexExecEvent[];
  replacements: Record<string, string>;
}): string[] {
  const commands: string[] = [];

  for (const event of input.events) {
    if (
      event.type !== "item.completed" ||
      event.item?.type !== "command_execution" ||
      typeof event.item.command !== "string" ||
      event.item.exit_code !== 0
    ) {
      continue;
    }

    const unwrappedCommand = unwrapCodexShellCommand(event.item.command);
    const sanitizedCommand = sanitizeText(unwrappedCommand, input.replacements);
    if (!PHASE32_CONTENT_READ_COMMAND_PATTERN.test(sanitizedCommand)) {
      continue;
    }
    const referencedArtifactPath = PHASE32_TRACKED_ARTIFACT_PATHS.find((artifactPath) =>
      commandTargetsArtifact(sanitizedCommand, artifactPath)
    );
    if (!referencedArtifactPath) {
      continue;
    }

    commands.push(sanitizedCommand);
  }

  return commands;
}

function isExactExpectedResponse(input: {
  currentGoal: string;
  openLoop: string;
}): boolean {
  return (
    input.currentGoal === PHASE32_EXPECTED_RESPONSE.currentGoal &&
    input.openLoop === PHASE32_EXPECTED_RESPONSE.openLoop
  );
}

function commandTargetsArtifact(command: string, artifactPath: string): boolean {
  if (command.includes(artifactPath)) {
    return true;
  }
  if (!command.includes(".goodmemory/hosts/codex")) {
    return false;
  }
  if (artifactPath === PHASE32_MEMORY_ARTIFACT_PATH) {
    return /\bMEMORY\.md\b/u.test(command);
  }
  if (artifactPath === PHASE32_SESSION_MEMORY_ARTIFACT_PATH) {
    return /\bcurrent\.md\b/u.test(command);
  }
  if (artifactPath === PHASE32_MANIFEST_PATH) {
    return /\bexport-manifest\.json\b/u.test(command);
  }

  return false;
}

function requiresGuidanceArtifactRead(
  commands: readonly string[],
  requiredArtifactPaths: readonly string[],
): boolean {
  return requiredArtifactPaths.every((artifactPath) =>
    commands.some((command) => commandTargetsArtifact(command, artifactPath))
  );
}

function extractObservedResponse(agentMessages: readonly string[]): Record<string, string> {
  const finalMessage = agentMessages.at(-1);
  if (!finalMessage) {
    return {};
  }

  try {
    return extractJsonObject<Record<string, string>>(finalMessage);
  } catch {
    return {};
  }
}

function countMatchedExpectedFields(
  observed: Record<string, string>,
  expected: Record<string, string>,
): number {
  return Object.entries(expected).reduce(
    (count, [key, value]) => count + (observed[key] === value ? 1 : 0),
    0,
  );
}

function buildPhase32SeedScript(variant: Phase32LiveVariant): string {
  const imports = [
    'import { join } from "node:path";',
    'import {',
    "  createGoodMemory,",
    "  createRuntimeArchiveStore,",
    "  createRuntimeContextService,",
    "  createSQLiteDocumentStore,",
    "  createSQLiteSessionStore,",
    '} from "goodmemory";',
    ...(variant === "event-backed"
      ? [
          'import { ingestAgentInputEvent } from "goodmemory/ai-sdk";',
          'import { ingestHostAgentEvent } from "goodmemory/host";',
        ]
      : []),
    "",
  ];
  const base = [
    "const scope = {",
    '  userId: "consumer-user",',
    '  workspaceId: "consumer-workspace",',
    '  sessionId: "consumer-session",',
    "};",
    'const sqlitePath = join(process.cwd(), ".goodmemory", "memory.sqlite");',
    "const documentStore = createSQLiteDocumentStore(sqlitePath);",
    "const sessionStore = createSQLiteSessionStore(sqlitePath);",
    "const runtime = createRuntimeContextService({",
    "  sessionStore,",
    "  archiveStore: createRuntimeArchiveStore({ documentStore }),",
    '  now: () => "2026-04-22T00:00:00.000Z",',
    "  maxBufferedMessages: 2,",
    "});",
    "const memory = createGoodMemory({});",
    "",
  ];
  const variantLines =
    variant === "event-backed"
      ? [
          "await memory.remember({",
          "  scope,",
          "  messages: [",
          "    {",
          '      role: "user",',
          '      content: "Remember that the deploy is blocked on smoke verification.",',
          "    },",
          "    {",
          '      role: "assistant",',
          '      content: "Noted.",',
          "    },",
          "  ],",
          "});",
          "await runtime.startSession(scope);",
          "await runtime.updateWorkingMemory(scope, {",
          '  currentGoal: "Finish the bootstrap smoke path",',
          '  openLoops: ["Verify exported session handoff"],',
          '  temporaryDecisions: ["Use packaged CLI bootstrap only."],',
          "});",
          "await runtime.updateSessionJournal(scope, {",
          '  currentState: "Bootstrap scripts generated.",',
          '  workflow: ["Run codex export", "Run claude export"],',
          '  appendWorklog: ["Seeded runtime continuity for external-host smoke."],',
          "});",
          "await ingestAgentInputEvent(memory, {",
          '  surface: "ai-sdk",',
          '  kind: "user_correction",',
          '  eventId: "phase32-event-1",',
          '  runId: "phase32-live",',
          '  turnId: "phase32-turn-1",',
          "  sequence: 0,",
          '  occurredAt: "2026-04-22T00:00:01.000Z",',
          '  hostKind: "codex",',
          "  scope,",
          `  correction: ${JSON.stringify(PHASE32_SUMMARY_RULE)},`,
          "});",
          "await ingestHostAgentEvent(memory, {",
          '  surface: "host",',
          '  kind: "task_transition",',
          '  eventId: "phase32-event-2",',
          '  runId: "phase32-live",',
          '  turnId: "phase32-turn-2",',
          "  sequence: 1,",
          '  occurredAt: "2026-04-22T00:00:02.000Z",',
          '  hostKind: "codex",',
          "  scope,",
          '  previousState: "bootstrap-generated",',
          '  nextState: "export-session-guidance",',
          '  summary: "Archive the exported Codex session handoff before the final closeout.",',
          "});",
          "await ingestHostAgentEvent(memory, {",
          '  surface: "host",',
          '  kind: "verify_result",',
          '  eventId: "phase32-event-3",',
          '  runId: "phase32-live",',
          '  turnId: "phase32-turn-3",',
          "  sequence: 2,",
          '  occurredAt: "2026-04-22T00:00:03.000Z",',
          '  hostKind: "codex",',
          "  scope,",
          '  checkName: "phase32-closeout-review",',
          '  outcome: "failed",',
          `  summary: ${JSON.stringify("Verification failed: draft missed bullet points.")},`,
          "});",
        ]
      : variant === "text-only"
        ? [
            "await memory.remember({",
            "  scope,",
            "  messages: [",
            "    {",
            '      role: "user",',
            '      content: "Remember that the deploy is blocked on smoke verification.",',
            "    },",
            "    {",
            '      role: "assistant",',
            '      content: "Noted.",',
            "    },",
            "  ],",
            "});",
            "await memory.feedback({",
            "  scope,",
            `  signal: ${JSON.stringify(PHASE32_SUMMARY_RULE)},`,
            "});",
            "await runtime.startSession(scope);",
            "await runtime.updateWorkingMemory(scope, {",
            '  currentGoal: "Finish the bootstrap smoke path",',
            '  openLoops: ["Verify exported session handoff"],',
            '  temporaryDecisions: ["Use packaged CLI bootstrap only."],',
            "});",
            "await runtime.updateSessionJournal(scope, {",
            '  currentState: "Bootstrap scripts generated.",',
            '  workflow: ["Run codex export", "Run claude export"],',
            '  appendWorklog: ["Seeded runtime continuity for external-host smoke."],',
            "});",
          ]
        : ["await runtime.startSession(scope);"];

  return [
    ...imports,
    ...base,
    ...variantLines,
    'console.log(JSON.stringify({ ok: true, scope, sqlitePath, variant: ' +
      JSON.stringify(variant) +
      " }));",
    "",
  ].join("\n");
}

function matchesExpectedFields(
  observed: Record<string, string>,
  expected: Record<string, string>,
): boolean {
  return Object.entries(expected).every(
    ([key, value]) => observed[key] === value,
  );
}

export function resolvePhase32LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-32");
}

export function parsePhase32LiveMemoryCliOptions(
  argv: readonly string[],
): Phase32LiveMemoryOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

export async function defaultRunPhase32LiveMemoryCommand(
  command: Phase32LiveMemoryCommand,
): Promise<Phase32LiveMemoryCommandResult> {
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

export async function runDefaultPhase32CodexHostTurn(input: {
  env: Record<string, string>;
  prompt: string;
  workspaceRoot: string;
}): Promise<CodexExecTurn> {
  const runtime = resolveCodexExecRuntime();
  const child = Bun.spawn({
    cmd: [
      runtime.nodeBinary,
      runtime.codexBinary,
      "exec",
      "--json",
      "--color",
      "never",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--ephemeral",
      "-C",
      input.workspaceRoot,
      input.prompt,
    ],
    cwd: input.workspaceRoot,
    env: createChildEnv(input.env),
    stdin: "ignore",
    stderr: "pipe",
    stdout: "pipe",
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, CODEX_HOST_TURN_TIMEOUT_MS);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timeout);

  const events = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseCodexExecEventLine(line))
    .filter((event): event is CodexExecEvent => Boolean(event));

  return {
    events,
    exitCode,
    stderr,
    stdout,
    ...(timedOut
      ? {
          timedOut: true,
          timeoutMessage: `Codex host turn timed out after ${CODEX_HOST_TURN_TIMEOUT_MS}ms.`,
        }
      : {}),
  };
}

export async function runPhase32LiveMemoryEvaluation(
  options: Phase32LiveMemoryOptions = {},
  dependencies: Phase32LiveMemoryDependencies = {},
): Promise<Phase32LiveMemoryReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const outputDir =
    options.outputDir ?? resolvePhase32LiveMemoryOutputDir(root);
  const runId = options.runId ?? PHASE32_CANONICAL_LIVE_RUN_ID;
  const runDirectory = join(outputDir, runId);
  const fixtureRoot = join(root, "tests/consumers/bootstrap-package-smoke");
  const ensureDir = dependencies.ensureDir ?? mkdir;
  const makeTempDir =
    dependencies.makeTempDir ??
    ((prefix: string) => mkdtemp(join(tmpdir(), prefix)));
  const copyDir = dependencies.copyDir ?? cp;
  const readTextFile =
    dependencies.readTextFile ??
    ((path: string) => readFile(path, "utf8"));
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const removeDir = dependencies.removeDir ?? rm;
  const resolveRealPath = dependencies.realpathFn ?? realpath;
  const runCommand =
    dependencies.runCommand ?? defaultRunPhase32LiveMemoryCommand;
  const runCodexHostTurn =
    dependencies.runCodexHostTurn ?? runDefaultPhase32CodexHostTurn;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const commands: Phase32LiveMemoryExecutionResult[] = [];
  const packDir = await makeTempDir("goodmemory-phase32-pack-");
  const workspaceRoot = await makeTempDir("goodmemory-phase32-workspace-");
  const workspaceRealPath = await resolveRealPath(workspaceRoot).catch(
    () => workspaceRoot,
  );
  const homePath = process.env.HOME?.trim();
  const replacements = {
    ...(homePath ? { [homePath]: "<home>" } : {}),
    [packDir]: "<packdir>",
    [root]: "<repo>",
    [workspaceRealPath]: "<workspace>",
    [workspaceRoot]: "<workspace>",
  };
  const commandEnv = createChildEnv(PHASE32_CLI_ENV);

  try {
    await ensureDir(runDirectory, { recursive: true });
    await copyDir(fixtureRoot, workspaceRoot, { recursive: true });

    const packCommand: Phase32LiveMemoryCommand = {
      args: ["bun", "pm", "pack", "--destination", packDir, "--quiet"],
      cwd: root,
      env: PHASE32_CLI_ENV,
      label: "pack-tarball",
    };
    const packResult = await runCommand(packCommand);
    commands.push(toExecutionResult(packCommand, packResult, replacements));
    if (packResult.exitCode !== 0) {
      throw new Error("Failed to pack the Phase 32 tarball.");
    }

    const { tarballName, tarballPath } = resolveTarballPath(packDir, packResult.stdout);
    const packageJsonPath = join(workspaceRoot, "package.json");
    const packageJson = JSON.parse(
      await readTextFile(packageJsonPath),
    ) as {
      dependencies?: Record<string, string>;
    };
    packageJson.dependencies = {
      ...(packageJson.dependencies ?? {}),
      goodmemory: `file:${tarballPath}`,
    };
    await writeTextFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + "\n",
    );

    const installCommand: Phase32LiveMemoryCommand = {
      args: ["bun", "install"],
      cwd: workspaceRoot,
      env: PHASE32_CLI_ENV,
      label: "install-tarball",
    };
    const installResult = await runCommand(installCommand);
    commands.push(toExecutionResult(installCommand, installResult, replacements));
    if (installResult.exitCode !== 0) {
      throw new Error("Failed to install the packed Phase 32 tarball.");
    }
    const seedScriptPath = join(workspaceRoot, "seed.mjs");
    const liveCasesByVariant = new Map<Phase32LiveVariant, Phase32EvaluatedLiveCase[]>();
    let eventBackedExportedArtifactPaths: string[] = [];

    for (const variant of PHASE32_LIVE_VARIANTS) {
      await removeDir(join(workspaceRoot, ".goodmemory"), {
        force: true,
        recursive: true,
      });
      await writeTextFile(seedScriptPath, buildPhase32SeedScript(variant));

      const seedCommand: Phase32LiveMemoryCommand = {
        args: ["bun", "run", "seed"],
        cwd: workspaceRoot,
        env: PHASE32_CLI_ENV,
        label: `seed-memory:${variant}`,
      };
      const seedResult = await runCommand(seedCommand);
      commands.push(toExecutionResult(seedCommand, seedResult, replacements));
      if (seedResult.exitCode !== 0) {
        throw new Error(`Failed to seed the ${variant} Phase 32 consumer workspace.`);
      }

      const bootstrapCommand: Phase32LiveMemoryCommand = {
        args: [
          "./node_modules/.bin/goodmemory",
          "codex",
          "bootstrap",
          "--user-id",
          "consumer-user",
          "--workspace-id",
          "consumer-workspace",
          "--json",
        ],
        cwd: workspaceRoot,
        env: PHASE32_CLI_ENV,
        label: `codex-bootstrap:${variant}`,
      };
      const bootstrapResult = await runCommand(bootstrapCommand);
      commands.push(toExecutionResult(bootstrapCommand, bootstrapResult, replacements));
      if (bootstrapResult.exitCode !== 0) {
        throw new Error(`Failed to bootstrap Codex in the ${variant} consumer workspace.`);
      }

      const exportCommand: Phase32LiveMemoryCommand = {
        args: [
          "bun",
          "./.goodmemory/bootstrap/codex-export.mjs",
          "--session-id",
          "consumer-session",
        ],
        cwd: workspaceRoot,
        env: PHASE32_CLI_ENV,
        label: `codex-export:${variant}`,
      };
      const exportResult = await runCommand(exportCommand);
      commands.push(toExecutionResult(exportCommand, exportResult, replacements));
      if (exportResult.exitCode !== 0) {
        throw new Error(`Failed to export Codex artifacts in the ${variant} consumer workspace.`);
      }

      const manifestPath = join(workspaceRoot, PHASE32_MANIFEST_PATH);
      const manifest = JSON.parse(
        await readTextFile(manifestPath),
      ) as {
        artifacts?: Array<{ relativePath?: string }>;
      };
      const exportedArtifactPaths = [
        ...new Set(
          (manifest.artifacts ?? [])
            .flatMap((artifact) =>
              typeof artifact.relativePath === "string" ? [artifact.relativePath] : []
            )
            .map((relativePath) =>
              `.goodmemory/hosts/codex/${relativePath.replace(/^\.\//u, "")}`
            ),
        ),
      ].sort();

      if (variant === "event-backed") {
        for (const requiredPath of PHASE32_REQUIRED_MANIFEST_ARTIFACT_PATHS) {
          if (!exportedArtifactPaths.includes(requiredPath)) {
            throw new Error(
              `Exported Codex artifacts did not include the required manifest path: ${requiredPath}`,
            );
          }
        }
        eventBackedExportedArtifactPaths = exportedArtifactPaths;
      }

      const variantLiveCases: Phase32EvaluatedLiveCase[] = [];

      for (const liveCase of PHASE32_LIVE_CASES) {
        const caseStartedAt = Date.now();
        const turn = await runCodexHostTurn({
          env: commandEnv,
          prompt: liveCase.prompt,
          workspaceRoot,
        });
        const hostExitCode = turn.timedOut
          ? 124
          : typeof turn.exitCode === "number"
            ? turn.exitCode
            : 1;
        const sanitizedTurnStdout = sanitizeText(turn.stdout, replacements);
        const sanitizedTurnStderr = sanitizeText(turn.stderr, replacements);
        commands.push({
          command: `codex exec --json --sandbox read-only --skip-git-repo-check --ephemeral -C <workspace> <${variant}:${liveCase.caseId}>`,
          durationMs: Date.now() - caseStartedAt,
          exitCode: hostExitCode,
          label: `codex-native-host:${variant}:${liveCase.caseId}`,
          status: hostExitCode === 0 ? "passed" : "failed",
          stderrTail: tailLines(sanitizedTurnStderr),
          stdoutTail: tailLines(sanitizedTurnStdout),
        });
        const agentMessages = collectAgentMessages(turn.events);
        const artifactReadCommands = collectArtifactReadCommands({
          events: turn.events,
          replacements,
        });
        const observedResponse = extractObservedResponse(agentMessages);
        const traceBacked = hostExitCode === 0 && requiresGuidanceArtifactRead(
          artifactReadCommands,
          liveCase.requiredArtifactPaths,
        );

        variantLiveCases.push({
          artifactReadCommands,
          caseId: liveCase.caseId,
          hostExitCode,
          matchedExpectedFieldCount: countMatchedExpectedFields(
            observedResponse,
            liveCase.expected,
          ),
          observedResponse,
          traceBacked,
          traceEventCount: turn.events.length,
          variant,
        });
      }

      liveCasesByVariant.set(variant, variantLiveCases);
    }

    const eventBackedCases = liveCasesByVariant.get("event-backed");
    const textOnlyCases = liveCasesByVariant.get("text-only");
    const noMemoryCases = liveCasesByVariant.get("no-memory");
    if (!eventBackedCases || !textOnlyCases || !noMemoryCases) {
      throw new Error("Phase 32 live runner did not produce all required live baseline variants.");
    }

    const comparisonCases = PHASE32_LIVE_CASES.map((liveCase) => {
      const eventBacked = eventBackedCases.find(
        (candidate) => candidate.caseId === liveCase.caseId,
      );
      const textOnly = textOnlyCases.find(
        (candidate) => candidate.caseId === liveCase.caseId,
      );
      const noMemory = noMemoryCases.find(
        (candidate) => candidate.caseId === liveCase.caseId,
      );
      if (!eventBacked || !textOnly || !noMemory) {
        throw new Error(`Phase 32 live runner is missing measured baselines for ${liveCase.caseId}.`);
      }

      return {
        caseId: liveCase.caseId,
        eventBacked: {
          artifactReadCommands: [...eventBacked.artifactReadCommands],
          hostExitCode: eventBacked.hostExitCode,
          matchedExpectedFieldCount: eventBacked.matchedExpectedFieldCount,
          observedResponse: { ...eventBacked.observedResponse },
          traceBacked: eventBacked.traceBacked,
          traceEventCount: eventBacked.traceEventCount,
        },
        textOnly: {
          artifactReadCommands: [...textOnly.artifactReadCommands],
          hostExitCode: textOnly.hostExitCode,
          matchedExpectedFieldCount: textOnly.matchedExpectedFieldCount,
          observedResponse: { ...textOnly.observedResponse },
          traceBacked: textOnly.traceBacked,
          traceEventCount: textOnly.traceEventCount,
        },
        noMemory: {
          artifactReadCommands: [...noMemory.artifactReadCommands],
          hostExitCode: noMemory.hostExitCode,
          matchedExpectedFieldCount: noMemory.matchedExpectedFieldCount,
          observedResponse: { ...noMemory.observedResponse },
          traceBacked: noMemory.traceBacked,
          traceEventCount: noMemory.traceEventCount,
        },
        nonRegressionAgainstTextOnly:
          eventBacked.hostExitCode === 0 &&
          textOnly.hostExitCode === 0 &&
          eventBacked.traceBacked &&
          textOnly.traceBacked &&
          eventBacked.matchedExpectedFieldCount >= textOnly.matchedExpectedFieldCount,
        winOverNoMemory:
          eventBacked.hostExitCode === 0 &&
          noMemory.hostExitCode === 0 &&
          eventBacked.traceBacked &&
          noMemory.traceBacked &&
          eventBacked.matchedExpectedFieldCount > noMemory.matchedExpectedFieldCount,
      };
    });

    const continuityCase = comparisonCases.find(
      (liveCase) => liveCase.caseId === "continuity-open-loop",
    );
    if (!continuityCase) {
      throw new Error("Phase 32 live runner did not produce the continuity case.");
    }

    const artifactReadCommands = [...continuityCase.eventBacked.artifactReadCommands];
    const observedResponse = {
      currentGoal: continuityCase.eventBacked.observedResponse.currentGoal ?? "",
      openLoop: continuityCase.eventBacked.observedResponse.openLoop ?? "",
    };
    const guidanceReadFromArtifacts = continuityCase.eventBacked.traceBacked;
    const responseMatched = isExactExpectedResponse(observedResponse);
    const failedHostCase = comparisonCases.find(
      (caseResult) => caseResult.eventBacked.hostExitCode !== 0,
    );
    const comparisonAccepted = comparisonCases.every(
      (caseResult) =>
        caseResult.nonRegressionAgainstTextOnly && caseResult.winOverNoMemory,
    );
    const acceptance =
      guidanceReadFromArtifacts && responseMatched && comparisonAccepted
        ? {
            decision: "accepted" as const,
            reason:
              "Installed-package Codex bootstrap exported the expected artifacts, native Codex host events read the exported guidance across the required case family, and the final responses recovered the exact expected signals.",
          }
        : {
            decision: "blocked" as const,
            reason: failedHostCase
              ? `Native Codex host case ${failedHostCase.caseId} exited non-zero.`
              : !guidanceReadFromArtifacts
              ? "Native Codex host events did not prove a read from the exported session-memory artifact."
              : !responseMatched
                ? "Native Codex host response did not recover the exact currentGoal/openLoop wording from exported guidance."
                : "Native Codex host case family did not preserve the required dual-baseline semantics.",
          };

    const report: Phase32LiveMemoryReport = {
      acceptance,
      commands,
      comparison: {
        baselines: {
          noMemory: "no-memory",
          textOnly: "frozen-pre-phase31-public-text-only",
        },
        cases: comparisonCases,
      },
      evidence: {
        host: {
          artifactReadCommands,
          expectedResponse: { ...PHASE32_EXPECTED_RESPONSE },
          exportedArtifactPaths: eventBackedExportedArtifactPaths,
          guidanceReadFromArtifacts,
          installedPackageBootstrap: true,
          kind: "codex",
          manifestPath: PHASE32_MANIFEST_PATH,
          observedResponse,
          traceBacked: continuityCase.eventBacked.traceBacked,
          traceEventCount: continuityCase.eventBacked.traceEventCount,
        },
        releaseContract: {
          distribution: "tarball-first",
          runtime: "bun-only",
          tarballName,
        },
      },
      evidenceContract: {
        phase32: {
          hostEventTransport: "native_host_events",
          packageBoundary: "installed_package_public_imports",
          runner: GENERATED_BY,
        },
      },
      generatedAt: now(),
      generatedBy: GENERATED_BY,
      mode: "live-external-host",
      outputDir: toRepoRelativePath(root, outputDir),
      phase: "phase-32",
      runDirectory: toRepoRelativePath(root, runDirectory),
      runId,
    };

    await ensureDir(runDirectory, { recursive: true });
    await writeTextFile(
      join(runDirectory, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );

    return report;
  } finally {
    await removeDir(packDir, { force: true, recursive: true });
    await removeDir(workspaceRoot, { force: true, recursive: true });
  }
}

export async function runPhase32LiveMemoryCli(
  dependencies: Phase32LiveMemoryCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? process.argv;
  const log = dependencies.log ?? console.log;
  const exit = dependencies.exit ?? process.exit;
  const runEval =
    dependencies.runEval ?? runPhase32LiveMemoryEvaluation;

  const report = await runEval(parsePhase32LiveMemoryCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  exit(report.acceptance.decision === "accepted" ? 0 : 1);
}

if (import.meta.main) {
  await runPhase32LiveMemoryCli();
}
