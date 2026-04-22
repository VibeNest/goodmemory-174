import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createInternalGoodMemory } from "../src/api/createGoodMemory";
import type { GoodMemoryConfig } from "../src/api/contracts";
import { createGoodMemory } from "../src/api/createGoodMemory";
import type {
  BehavioralAdaptationEvidenceContract,
  BehavioralAdaptationMemoryFactory,
  BehavioralAdaptationReport,
  BehavioralAnswerGenerator,
  RunBehavioralAdaptationEvaluationOptions,
} from "../src/eval/behavioral-adaptation";
import {
  behavioralFirstActionMatchesExpectedForScoring,
  runBehavioralAdaptationEvaluation,
} from "../src/eval/behavioral-adaptation";
import type { BehavioralFirstAction } from "../src/evolution/behavioralTelemetry";
import {
  type CodexExecEvent,
  parseCodexExecEventLine,
  resolveCodexExecRuntime,
  unwrapCodexShellCommand,
} from "../src/host/codexExecBehavioralTrace";
import { readHostEvalSupport } from "../src/host/evalSupport";
import type { HostBehavioralTraceRecorder } from "../src/host/behavioralTraceRecorder";
import { createHostAdapter } from "../src/host/public";
import {
  createProviderEmbeddingAdapter,
  createProviderMemoryExtractor,
  createProviderTextGenerator,
} from "../src/provider/layer";
import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import { canBootstrapPostgresStorageBackend } from "../src/storage/postgres";
import {
  resolveFlagValue,
  resolveLiveModelConfig,
  resolveProviderBackedModelConfig,
} from "./run-eval";
import type { Phase30EvalOptions } from "./run-phase-30-eval";
import { resolvePhase30FixtureDir } from "./run-phase-30-eval";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase30LiveMemoryDependencies {
  assertProviderBackedStorage?: (postgresUrl: string) => Promise<void>;
  createEmbeddingAdapter?: typeof createProviderEmbeddingAdapter;
  createMemory?: typeof createInternalGoodMemory;
  createMemoryExtractor?: typeof createProviderMemoryExtractor;
  createTextGenerator?: typeof createProviderTextGenerator;
  preflightLiveMemory?: () => Promise<void>;
  runCodexHostTurn?: (input: {
    model: string;
    prompt: string;
  }) => Promise<Phase30CodexExecTurn>;
  runEvaluation?: (
    input: RunBehavioralAdaptationEvaluationOptions,
  ) => Promise<BehavioralAdaptationReport>;
}

interface Phase30CodexExecTurn {
  events: CodexExecEvent[];
  stderr: string;
  stdout: string;
}

export const PHASE30_CANONICAL_LIVE_RUN_ID = "run-phase30-live-current";
export const PHASE30_LIVE_MEMORY_GENERATED_BY =
  "scripts/run-phase-30-live-memory.ts";
const CODEX_HOST_TURN_TIMEOUT_MS = 90_000;
const PHASE30_HOST_SHIM_COMMANDS = [
  "QuickCheck",
  "DeepAnalyzer",
  "safe_delete",
  "copy_file",
  "deploy",
] as const;
const PHASE30_LIVE_PREFLIGHT_SCOPE = {
  userId: "phase30-live-preflight",
  workspaceId: "phase30-live-preflight",
} as const;

export function resolvePhase30LiveMemoryOutputDir(root: string): string {
  return join(root, "reports/eval/live-memory/phase-30");
}

function toRepoRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path);
  return relativePath.length > 0 ? relativePath : ".";
}

export function buildPhase30LiveMemoryEvidenceContract(
  fixtureDir: string,
): BehavioralAdaptationEvidenceContract {
  return {
    phase30: {
      fixtureDir,
      hostRuntime: {
        modelTransport: "codex-exec-json",
        structuredFirstAction: "disabled",
      },
      providerBackedStorage: {
        envVar: "GOODMEMORY_TEST_POSTGRES_URL",
        memoryStackPreflight: "passed",
        provider: "postgres",
        storageBootstrap: "passed",
      },
      requireTraceForStructuredCases: true,
      runner: PHASE30_LIVE_MEMORY_GENERATED_BY,
      scopePrefix: "phase30-live",
    },
  };
}

function resolvePostgresUrl(): string {
  const postgresUrl = process.env.GOODMEMORY_TEST_POSTGRES_URL;
  if (!postgresUrl || postgresUrl.trim().length === 0) {
    throw new Error(
      "Missing required provider-backed eval environment variables: GOODMEMORY_TEST_POSTGRES_URL",
    );
  }

  return postgresUrl;
}

async function assertPhase30ProviderBackedStorage(
  postgresUrl: string,
): Promise<void> {
  let usable = false;

  try {
    usable = await canBootstrapPostgresStorageBackend({
      url: postgresUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error);
    throw new Error(
      [
        "Phase 30 live provider-backed evidence requires a bootstrap-usable Postgres backend.",
        "A report built on a broken provider-backed storage path is not closure-quality evidence.",
        `Underlying error: ${message}`,
      ].join(" "),
    );
  }

  if (!usable) {
    throw new Error(
      [
        "Phase 30 live provider-backed evidence requires a bootstrap-usable Postgres backend.",
        "A report built on a broken provider-backed storage path is not closure-quality evidence.",
      ].join(" "),
    );
  }
}

function buildPhase30LiveMemoryConfig(input: {
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  embeddingModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  postgresUrl: string;
}): GoodMemoryConfig {
  return {
    storage: {
      provider: "postgres",
      url: input.postgresUrl,
    },
    adapters: {
      embeddingAdapter: input.createEmbeddingAdapter({
        model: input.embeddingModel,
      }),
      assistedExtractor: input.createMemoryExtractor({
        model: input.extractorModel,
      }),
    },
  };
}

async function assertPhase30LiveMemoryStackUsable(input: {
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createMemory: typeof createInternalGoodMemory;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  embeddingModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  postgresUrl: string;
}): Promise<void> {
  const memory = input.createMemory(
    buildPhase30LiveMemoryConfig({
      createEmbeddingAdapter: input.createEmbeddingAdapter,
      createMemoryExtractor: input.createMemoryExtractor,
      embeddingModel: input.embeddingModel,
      extractorModel: input.extractorModel,
      postgresUrl: input.postgresUrl,
    }),
    {
      behavioralOutcomeRecorder: true,
    },
  );
  let failure: unknown;

  try {
    await memory.remember({
      scope: PHASE30_LIVE_PREFLIGHT_SCOPE,
      messages: [
        {
          role: "user",
          content:
            "Before any deploy --prod action, request explicit approval first.",
        },
      ],
    });
    await memory.recall({
      scope: PHASE30_LIVE_PREFLIGHT_SCOPE,
      query: "What must happen before deploy --prod?",
    });
  } catch (error) {
    failure = error;
  }

  try {
    await memory.deleteAllMemory({
      scope: PHASE30_LIVE_PREFLIGHT_SCOPE,
      includeRuntime: true,
    });
  } catch (cleanupError) {
    failure ??= cleanupError;
  }

  if (!failure) {
    return;
  }

  const message =
    failure instanceof Error && failure.message.trim().length > 0
      ? failure.message
      : String(failure);
  throw new Error(
    [
      "Phase 30 live provider-backed evidence requires a bootstrap-usable memory stack.",
      "The runner must prove storage, extraction, and recall can initialize before case-level execution starts.",
      `Underlying error: ${message}`,
    ].join(" "),
  );
}

function buildLivePrompt(input: Parameters<BehavioralAnswerGenerator>[0]): string {
  const canonicalProbe =
    input.mode === "goodmemory" ? input.prompt : `Probe:\n${input.prompt}`;

  if (input.fixture.paradigm === "priming") {
    return [
      "Return exactly three codenames, one per line.",
      canonicalProbe,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    "Do not inspect files or run discovery commands.",
    "Choose exactly one first action for this prompt.",
    "If a warning is required, emit one warning message and stop.",
    "If a command is appropriate, run exactly one shell command and stop.",
    "If the prompt or memory context names a concrete utility, assume that utility is available in this isolated host harness for one first-action attempt.",
    "Choose the first action semantically from the prompt and memory context, not from this isolated sandbox's limitations.",
    "If the prompt and memory context identify a concrete command, run that command once even if it will fail here.",
    "Do not replace a concrete command with a sandbox-capability warning just because this isolated host lacks the tool or has a read-only filesystem.",
    "Only emit a warning when the task itself is unsafe, missing required approval, or too underspecified to choose a concrete first command.",
    "Do not return JSON.",
    "Do not explain your reasoning before the first action.",
    "If the memory context or probe defines a specific utility name or argument order, preserve that exact utility and ordering instead of substituting a generic shell equivalent.",
    canonicalProbe,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function firstNonEmptyLine(value: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? value.trim();
}

function tokenizeCommandLine(value: string): string[] {
  return [...value.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/gu)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .filter((token) => token.length > 0);
}

function startsWithWarning(value: string): boolean {
  return /^(warning|warn|caution|stop|abort)\b\s*[:：-]?/iu.test(value.trim());
}

function looksLikeWarningStatement(value: string): boolean {
  return /^(?:i\s+(?:would\s+)?(?:first\s+)?(?:request|need|would\s+need|can't|cannot|can’t)|need\b|please\s+provide\b|unable\b)/iu.test(
    value.trim(),
  );
}

function normalizeExecutableText(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function trimCommandSentencePunctuation(value: string): string {
  return value.trim().replace(/[.。]+$/u, "").trim();
}

function actionNamesEqual(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function actionArgsEqual(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function actionMatchesParsedFirstAction(
  parsed: BehavioralFirstAction,
  action: BehavioralFirstAction,
): boolean {
  if (parsed.kind === "warning" && action.kind === "warning") {
    return behavioralFirstActionMatchesExpectedForScoring(parsed, action);
  }

  if (parsed.kind !== action.kind || !actionNamesEqual(parsed.name, action.name)) {
    return false;
  }

  if (action.args) {
    return actionArgsEqual(parsed.args, action.args);
  }

  if (action.raw && parsed.raw) {
    return normalizeExecutableText(parsed.raw) === normalizeExecutableText(action.raw);
  }

  return true;
}

function resolveFixtureActionForParsedFirstAction(input: {
  expected: BehavioralFirstAction;
  forbidden: BehavioralFirstAction;
  parsed: BehavioralFirstAction;
}): BehavioralFirstAction | undefined {
  for (const action of [input.forbidden, input.expected]) {
    if (actionMatchesParsedFirstAction(input.parsed, action)) {
      if (action.kind === "warning" && input.parsed.kind === "warning") {
        return {
          ...action,
          ...(input.parsed.raw ? { raw: input.parsed.raw } : {}),
        };
      }

      return action;
    }
  }

  return undefined;
}

function resolveKnownActionKind(input: {
  expected: BehavioralFirstAction;
  forbidden: BehavioralFirstAction;
  name: string;
  raw: string;
}): BehavioralFirstAction["kind"] {
  const knownAction = [input.expected, input.forbidden].find((action) =>
    actionNamesEqual(action.name, input.name),
  );

  return knownAction?.kind ?? (input.raw.includes("(") ? "tool_call" : "command");
}

function parseFunctionCallAction(input: {
  expected: BehavioralFirstAction;
  forbidden: BehavioralFirstAction;
  value: string;
}): BehavioralFirstAction | undefined {
  const raw = trimCommandSentencePunctuation(input.value);
  const match = /^([A-Za-z_][\w.-]*)\s*\((.*)\)$/u.exec(raw);
  if (!match) {
    return undefined;
  }

  const args = [...match[2].matchAll(/\s*(?:'([^']*)'|"([^"]*)"|([^,]+?))\s*(?:,|$)/gu)]
    .map((argMatch) => (argMatch[1] ?? argMatch[2] ?? argMatch[3] ?? "").trim())
    .filter((arg) => arg.length > 0);
  const name = match[1];

  return {
    kind: resolveKnownActionKind({
      expected: input.expected,
      forbidden: input.forbidden,
      name,
      raw,
    }),
    name,
    ...(args.length > 0 ? { args } : {}),
    raw,
  };
}

function stripExecutableLeadIn(value: string): string {
  return value
    .trim()
    .replace(
      /^(?:(?:i|we)\s+(?:will|would|should|can)\s+)?(?:run|running|use|execute|call|invoke|issue|start|launch)\s+/iu,
      "",
    )
    .trim();
}

function startsLikeProse(value: string): boolean {
  const firstToken = tokenizeCommandLine(value)[0]?.toLowerCase();
  if (!firstToken) {
    return true;
  }

  return [
    "i",
    "we",
    "please",
    "the",
    "this",
    "that",
    "it",
    "use",
    "run",
    "running",
  ].includes(firstToken);
}

function parseDirectExecutableAction(input: {
  allowUnknown: boolean;
  expected: BehavioralFirstAction;
  forbidden: BehavioralFirstAction;
  value: string;
}): BehavioralFirstAction | undefined {
  const raw = trimCommandSentencePunctuation(stripExecutableLeadIn(input.value));
  const functionCall = parseFunctionCallAction({
    expected: input.expected,
    forbidden: input.forbidden,
    value: raw,
  });
  if (functionCall) {
    return (
      resolveFixtureActionForParsedFirstAction({
        expected: input.expected,
        forbidden: input.forbidden,
        parsed: functionCall,
      }) ?? functionCall
    );
  }

  const tokens = tokenizeCommandLine(raw);
  const commandName = tokens[0];
  if (!commandName) {
    return undefined;
  }

  const parsed: BehavioralFirstAction = {
    kind: resolveKnownActionKind({
      expected: input.expected,
      forbidden: input.forbidden,
      name: commandName,
      raw,
    }),
    name: commandName,
    ...(tokens.length > 1 ? { args: tokens.slice(1) } : {}),
    raw,
  };
  const fixtureAction = resolveFixtureActionForParsedFirstAction({
    expected: input.expected,
    forbidden: input.forbidden,
    parsed,
  });
  if (fixtureAction) {
    return fixtureAction;
  }

  const mentionsKnownAction = [input.expected, input.forbidden].some((action) =>
    actionNamesEqual(action.name, commandName),
  );
  if (mentionsKnownAction || (input.allowUnknown && !startsLikeProse(input.value))) {
    return parsed;
  }

  return undefined;
}

function splitExecutableClauses(value: string): string[] {
  return value
    .split(/(?:;|\.\s+|。)+/u)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function clauseNegatesAction(clause: string, action: BehavioralFirstAction): boolean {
  const actionIndex = clause.toLowerCase().indexOf(action.name.toLowerCase());
  if (actionIndex < 0) {
    return false;
  }

  const beforeAction = clause.slice(0, actionIndex).toLowerCase();
  return /\b(?:do\s+not|don't|will\s+not|won't|not|never|avoid|instead\s+of|rather\s+than|without)\b/u.test(
    beforeAction,
  );
}

function resolveKnownExecutableActionFromLine(input: {
  expected: BehavioralFirstAction;
  forbidden: BehavioralFirstAction;
  firstLine: string;
}): BehavioralFirstAction | undefined {
  for (const clause of splitExecutableClauses(input.firstLine)) {
    const parsed = parseDirectExecutableAction({
      allowUnknown: false,
      expected: input.expected,
      forbidden: input.forbidden,
      value: clause,
    });

    if (!parsed || clauseNegatesAction(clause, parsed)) {
      continue;
    }

    return parsed;
  }

  return undefined;
}

function resolveWarningFirstAction(input: {
  expected: BehavioralFirstAction;
  firstLine: string;
  forbidden: BehavioralFirstAction;
}): BehavioralFirstAction {
  const parsed: BehavioralFirstAction = {
    kind: "warning",
    name: "warning",
    raw: input.firstLine,
  };
  for (const action of [input.forbidden, input.expected]) {
    if (action.kind !== "warning") {
      continue;
    }

    const categorized: BehavioralFirstAction = {
      ...parsed,
      name: action.name,
    };
    if (behavioralFirstActionMatchesExpectedForScoring(categorized, action)) {
      return categorized;
    }
  }

  return (
    resolveFixtureActionForParsedFirstAction({
      expected: input.expected,
      forbidden: input.forbidden,
      parsed,
    }) ?? parsed
  );
}

function resolveLiveFirstActionFromAnswer(input: {
  answer: string;
  payload: Parameters<BehavioralAnswerGenerator>[0];
  structuredFirstAction?: BehavioralFirstAction;
}): BehavioralFirstAction | undefined {
  if (input.structuredFirstAction) {
    return input.structuredFirstAction;
  }
  if (input.payload.fixture.paradigm === "priming") {
    return undefined;
  }

  const firstLine = firstNonEmptyLine(input.answer);
  const lowerFirstLine = firstLine.toLowerCase();
  const expected = input.payload.fixture.expected_first_action;
  const forbidden = input.payload.fixture.forbidden_first_action;

  if (startsWithWarning(firstLine) || looksLikeWarningStatement(firstLine)) {
    return resolveWarningFirstAction({
      expected,
      firstLine,
      forbidden,
    });
  }

  const knownExecutableAction = resolveKnownExecutableActionFromLine({
    expected,
    firstLine,
    forbidden,
  });
  if (knownExecutableAction) {
    return knownExecutableAction;
  }

  return parseDirectExecutableAction({
    allowUnknown: true,
    expected,
    forbidden,
    value: lowerFirstLine.includes("(") ? firstLine : trimCommandSentencePunctuation(firstLine),
  });
}

function resolveActionOutcome(input: {
  action: BehavioralFirstAction;
  payload: Parameters<BehavioralAnswerGenerator>[0];
}): "failure" | "success" {
  if (input.payload.fixture.paradigm === "priming") {
    return "success";
  }

  return behavioralFirstActionMatchesExpectedForScoring(
    input.action,
    input.payload.fixture.expected_first_action,
  )
    ? "success"
    : "failure";
}

export function buildPhase30LiveAnswerGenerator(input: {
  createTextGenerator: typeof createProviderTextGenerator;
  evalModel: AISDKModelConfig;
  runCodexHostTurn?: (input: {
    model: string;
    prompt: string;
  }) => Promise<Phase30CodexExecTurn>;
}): BehavioralAnswerGenerator {
  const generator = input.createTextGenerator({
    model: input.evalModel,
    system:
      "You are a strict first-action evaluator. Return only the first warning or executable command, preserve environment-specific utility names, never return JSON, and do not let isolated-sandbox limitations replace a concrete semantic first command.",
    promptBuilder: (payload) => payload.prompt,
  });

  return async (payload) => {
    if (payload.fixture.paradigm === "priming") {
      const result = await generator({
        persona: {} as never,
        scenario: {} as never,
        prompt: buildLivePrompt(payload),
        transcript: "",
        memoryContext: payload.memoryContext,
      });

      return {
        answer: result.content.trim(),
      };
    }

    const answer = input.runCodexHostTurn
      ? await runPhase30CodexHostAnswer({
          evalModel: input.evalModel,
          payload,
          runCodexHostTurn: input.runCodexHostTurn,
        })
      : await runPhase30LegacyTextAnswer({
          generator,
          payload,
        });

    if (!answer.firstAction) {
      return {
        answer: answer.answer,
      };
    }

    const recorder = createPhase30CodexTraceRecorder({
      cue: payload.fixture.task_name,
      traceId: buildPhase30LiveTraceId(payload),
    });
    recorder.appendEvent({
      actionKind: answer.firstAction.kind,
      actionName: answer.firstAction.name,
      ...(answer.firstAction.args ? { args: answer.firstAction.args } : {}),
      outcome: resolveActionOutcome({
        action: answer.firstAction,
        payload,
      }),
      ...(answer.firstAction.raw ? { raw: answer.firstAction.raw } : {}),
    });
    const closeResult = await recorder.close();

    if (!closeResult.trace) {
      return {
        answer: answer.answer,
      };
    }

    return {
      answer: answer.answer,
      trace: closeResult.trace,
    };
  };
}

function buildPhase30LiveTraceId(
  payload: Parameters<BehavioralAnswerGenerator>[0],
): string {
  return [
    "phase30-live",
    payload.mode,
    payload.profile,
    payload.fixture.case_id,
    payload.branch ?? "default",
  ].join("-");
}

function createPhase30CodexTraceRecorder(input: {
  cue: string;
  traceId: string;
}): HostBehavioralTraceRecorder {
  const adapter = createHostAdapter({
    id: `phase30-live-host-${input.traceId}`,
    hostKind: "codex",
    memory: createGoodMemory({
      storage: {
        provider: "memory",
      },
    }),
    readableArtifactTypes: ["session_memory"],
  });
  const support = readHostEvalSupport(adapter);
  const recorder = support?.createBehavioralTraceRecorder?.({
    cue: input.cue,
    scope: {
      userId: "phase30-live-host",
      workspaceId: input.traceId,
    },
    traceId: input.traceId,
  });

  if (!recorder) {
    throw new Error("Phase 30 live runner could not initialize Codex host trace support.");
  }

  return recorder;
}

async function runPhase30LegacyTextAnswer(input: {
  generator: ReturnType<typeof createProviderTextGenerator>;
  payload: Parameters<BehavioralAnswerGenerator>[0];
}): Promise<{
  answer: string;
  firstAction?: BehavioralFirstAction;
}> {
  const result = await input.generator({
    persona: {} as never,
    scenario: {} as never,
    prompt: buildLivePrompt(input.payload),
    transcript: "",
    memoryContext: input.payload.memoryContext,
  });
  const answer = result.content.trim();

  return {
    answer,
    firstAction: resolveLiveFirstActionFromAnswer({
      answer,
      payload: input.payload,
    }),
  };
}

async function runPhase30CodexHostAnswer(input: {
  evalModel: AISDKModelConfig;
  payload: Parameters<BehavioralAnswerGenerator>[0];
  runCodexHostTurn: (input: {
    model: string;
    prompt: string;
  }) => Promise<Phase30CodexExecTurn>;
}): Promise<{
  answer: string;
  firstAction?: BehavioralFirstAction;
}> {
  const turn = await input.runCodexHostTurn({
    model: input.evalModel.model,
    prompt: buildLivePrompt(input.payload),
  });
  const firstCommand = extractFirstCodexCommand(turn.events);
  const finalMessage = extractLastCodexAgentMessage(turn.events);
  const answer = firstCommand ?? finalMessage ?? "";

  return {
    answer,
    firstAction: answer.length === 0
      ? undefined
      : resolveLiveFirstActionFromAnswer({
          answer,
          payload: input.payload,
        }),
  };
}

function extractFirstCodexCommand(
  events: readonly CodexExecEvent[],
): string | undefined {
  const commandEvent = events.find(
    (event) =>
      event.type === "item.started" &&
      event.item?.type === "command_execution" &&
      typeof event.item.command === "string",
  );

  return commandEvent?.item?.command
    ? unwrapCodexShellCommand(commandEvent.item.command)
    : undefined;
}

function extractLastCodexAgentMessage(
  events: readonly CodexExecEvent[],
): string | undefined {
  const messages = events
    .filter(
      (event) =>
        event.type === "item.completed" &&
        event.item?.type === "agent_message" &&
        typeof event.item.text === "string",
    )
    .map((event) => event.item?.text?.trim())
    .filter((value): value is string => Boolean(value && value.length > 0));

  return messages.at(-1);
}

async function createPhase30HostShims(directory: string): Promise<void> {
  await Promise.all(
    PHASE30_HOST_SHIM_COMMANDS.map(async (commandName) => {
      const scriptPath = join(directory, commandName);
      const script = [
        "#!/usr/bin/env sh",
        `echo "phase30-host-shim:${commandName} $*"`,
        "exit 0",
        "",
      ].join("\n");

      await writeFile(scriptPath, script);
      await chmod(scriptPath, 0o755);
    }),
  );
}

async function runDefaultCodexHostTurn(input: {
  model: string;
  prompt: string;
}): Promise<Phase30CodexExecTurn> {
  const sandboxPath = await mkdtemp(join(tmpdir(), "goodmemory-phase30-codex-"));
  const codexStdoutLines: string[] = [];
  const runtime = resolveCodexExecRuntime();

  try {
    await createPhase30HostShims(sandboxPath);

    const spawnedProcess = Bun.spawn({
      cmd: [
        runtime.nodeBinary,
        runtime.codexBinary,
        "exec",
        "--json",
        "--color",
        "never",
        "--sandbox",
        "read-only",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--ephemeral",
        "-m",
        input.model,
        "-C",
        sandboxPath,
        input.prompt,
      ],
      env: {
        ...globalThis.process.env,
        PATH: [sandboxPath, globalThis.process.env.PATH].filter(Boolean).join(":"),
      },
      stderr: "pipe",
      stdout: "pipe",
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      spawnedProcess.kill();
    }, CODEX_HOST_TURN_TIMEOUT_MS);
    const stdoutPromise = new Response(spawnedProcess.stdout).text();
    const stderrPromise = new Response(spawnedProcess.stderr).text();
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    await spawnedProcess.exited;
    clearTimeout(timeout);

    if (timedOut) {
      throw new Error(
        `Phase 30 Codex host turn timed out after ${CODEX_HOST_TURN_TIMEOUT_MS}ms.`,
      );
    }

    for (const line of stdout.split(/\r?\n/u)) {
      if (line.trim().length > 0) {
        codexStdoutLines.push(line);
      }
    }

    return {
      events: codexStdoutLines
        .map((line) => parseCodexExecEventLine(line))
        .filter((event): event is CodexExecEvent => Boolean(event)),
      stderr,
      stdout,
    };
  } finally {
    await rm(sandboxPath, {
      force: true,
      recursive: true,
    });
  }
}

function sanitizePhase30LiveReportPaths(
  root: string,
  report: BehavioralAdaptationReport,
): BehavioralAdaptationReport {
  return {
    ...report,
    evidenceContract: report.evidenceContract?.phase30
      ? {
          phase30: {
            ...report.evidenceContract.phase30,
            fixtureDir: toRepoRelativePath(
              root,
              report.evidenceContract.phase30.fixtureDir,
            ),
          },
        }
      : report.evidenceContract,
    outputDir: toRepoRelativePath(root, report.outputDir),
    runDirectory: toRepoRelativePath(root, report.runDirectory),
  };
}

function buildLiveMemoryFactory(input: {
  createEmbeddingAdapter: typeof createProviderEmbeddingAdapter;
  createMemory: typeof createInternalGoodMemory;
  createMemoryExtractor: typeof createProviderMemoryExtractor;
  embeddingModel: AISDKModelConfig;
  extractorModel: AISDKModelConfig;
  postgresUrl: string;
}): BehavioralAdaptationMemoryFactory {
  return ({ scope }) => {
    const config = buildPhase30LiveMemoryConfig({
      createEmbeddingAdapter: input.createEmbeddingAdapter,
      createMemoryExtractor: input.createMemoryExtractor,
      embeddingModel: input.embeddingModel,
      extractorModel: input.extractorModel,
      postgresUrl: input.postgresUrl,
    });
    const memory = input.createMemory(config, {
      behavioralOutcomeRecorder: true,
    });

    return {
      memory,
      cleanup: async () => {
        await memory.deleteAllMemory({
          scope: {
            userId: scope.userId,
            workspaceId: scope.workspaceId,
          },
          includeRuntime: true,
        });
      },
    };
  };
}

export async function runPhase30LiveMemoryEval(
  input?: Phase30EvalOptions,
  dependencies?: Phase30LiveMemoryDependencies,
): Promise<BehavioralAdaptationReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const evalModel = resolveLiveModelConfig("GOODMEMORY_EVAL");
  const embeddingModel = resolveProviderBackedModelConfig("GOODMEMORY_EMBEDDING");
  const extractorModel = resolveProviderBackedModelConfig(
    "GOODMEMORY_ASSISTED_EXTRACTOR",
  );
  const createEmbeddingAdapter =
    dependencies?.createEmbeddingAdapter ?? createProviderEmbeddingAdapter;
  const createMemory = dependencies?.createMemory ?? createInternalGoodMemory;
  const createMemoryExtractor =
    dependencies?.createMemoryExtractor ?? createProviderMemoryExtractor;
  const createTextGenerator =
    dependencies?.createTextGenerator ?? createProviderTextGenerator;
  const runCodexHostTurn =
    dependencies?.runCodexHostTurn ?? runDefaultCodexHostTurn;
  const assertProviderBackedStorage =
    dependencies?.assertProviderBackedStorage ?? assertPhase30ProviderBackedStorage;
  const postgresUrl = resolvePostgresUrl();
  const preflightLiveMemory =
    dependencies?.preflightLiveMemory ??
    (() =>
      assertPhase30LiveMemoryStackUsable({
        createEmbeddingAdapter,
        createMemory,
        createMemoryExtractor,
        embeddingModel,
        extractorModel,
        postgresUrl,
      }));
  const runEvaluation = dependencies?.runEvaluation ?? runBehavioralAdaptationEvaluation;
  const fixtureDir = resolvePhase30FixtureDir(root);

  await assertProviderBackedStorage(postgresUrl);
  await preflightLiveMemory();

  const report = await runEvaluation({
    answerGenerator: buildPhase30LiveAnswerGenerator({
      createTextGenerator,
      evalModel,
      runCodexHostTurn,
    }),
    createMemory: buildLiveMemoryFactory({
      createEmbeddingAdapter,
      createMemory,
      createMemoryExtractor,
      embeddingModel,
      extractorModel,
      postgresUrl,
    }),
    evidenceContract: buildPhase30LiveMemoryEvidenceContract(fixtureDir),
    fixtureDir,
    generatedBy: PHASE30_LIVE_MEMORY_GENERATED_BY,
    mode: "live-memory",
    outputDir: input?.outputDir ?? resolvePhase30LiveMemoryOutputDir(root),
    requireTraceForStructuredCases: true,
    runId: input?.runId ?? PHASE30_CANONICAL_LIVE_RUN_ID,
    scopePrefix: "phase30-live",
  });
  const sanitizedReport = sanitizePhase30LiveReportPaths(root, report);
  await mkdir(join(root, sanitizedReport.runDirectory), {
    recursive: true,
  });

  await writeFile(
    join(root, sanitizedReport.runDirectory, "report.json"),
    `${JSON.stringify(sanitizedReport, null, 2)}\n`,
  );

  return sanitizedReport;
}

export function parsePhase30LiveMemoryCliOptions(
  argv: readonly string[],
): Phase30EvalOptions {
  return {
    outputDir: resolveFlagValue([...argv], "--output-dir"),
    runId: resolveFlagValue([...argv], "--run-id"),
  };
}

async function main(): Promise<void> {
  const report = await runPhase30LiveMemoryEval(
    parsePhase30LiveMemoryCliOptions(process.argv),
  );
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  await main();
}
