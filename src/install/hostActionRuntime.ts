import { createHash } from "node:crypto";
import { accessSync, constants } from "node:fs";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type {
  ExportMemoryResult,
  GoodMemory,
} from "../api/contracts";
import {
  attachGoodMemoryIntegrationSupport,
  readGoodMemoryIntegrationSupport,
} from "../api/integrationSupport";
import type { MemoryScope } from "../domain/scope";
import {
  createHostAdapter,
  ingestHostAgentEvent,
  resolveHostActionExecutionPlan,
  type HostActionIntent,
  type HostAdapter,
  type HostPlannedAction,
  type HostRecommendedFirstStep,
} from "../host";
import {
  isRecord,
  normalizeText,
  readOptionalText,
} from "./hostConfigValidation";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
  type InstalledHostContextDependencies,
  type InstalledHostResolvedContext,
} from "./hostExecutionContext";
import type { InstalledHostKind } from "./hostInstall";

const PRE_TOOL_USE_HOOK_EVENT_NAME = "PreToolUse";
const PRE_TOOL_USE_TOOL_NAME = "Bash";
const PRE_TOOL_USE_FALLBACK_TURN_ID = "goodmemory-installed-pretool-turn";
const SHELL_BINARY_CANDIDATES = ["/bin/bash", "/bin/sh", "/bin/zsh"];
const DEFAULT_ACTION_SEQUENCE = 0;

type InstalledHostActionResolutionStatus =
  | "assessment_failed"
  | "disabled"
  | "invalid_global_config"
  | "invalid_repo_config"
  | "managed_command"
  | "missing_command"
  | "missing_global_config"
  | "missing_repo_config"
  | "missing_session"
  | "unsupported_hook_event"
  | "unsupported_tool";

interface InstalledHostActionInvocation {
  actionId?: string;
  attemptId?: string;
  command: string;
  cwd?: string;
  runId?: string;
  sequence: number;
  sessionId: string;
  turnId?: string;
}

interface InstalledHostActionAssessmentReady {
  assessment: Awaited<ReturnType<HostAdapter["assessAction"]>>;
  context: InstalledHostResolvedContext;
  intent: HostActionIntent;
  memory: GoodMemory;
  status: "ok";
}

interface InstalledHostActionAssessmentSkipped {
  command: string | null;
  debug: boolean;
  maxTokens?: number;
  reason: InstalledHostActionResolutionStatus;
  scope: MemoryScope | null;
  status: "skip";
}

type InstalledHostActionAssessment =
  | InstalledHostActionAssessmentReady
  | InstalledHostActionAssessmentSkipped;

export interface InstalledHostPreToolUseInput {
  homeRoot?: string;
  host: InstalledHostKind;
  payload: Record<string, unknown>;
}

export interface InstalledHostPreToolUseResult {
  command: string | null;
  debug: boolean;
  maxTokens?: number;
  output: Record<string, unknown> | null;
  reason:
    | "allow"
    | "applied"
    | InstalledHostActionResolutionStatus;
  scope: MemoryScope | null;
}

export interface InstalledHostActionExecutionInput {
  actionId?: string;
  attemptId?: string;
  command: string;
  cwd?: string;
  homeRoot?: string;
  host: InstalledHostKind;
  runId?: string;
  sequence?: number;
  sessionId: string;
  turnId?: string;
}

export interface InstalledHostActionExecutionResult {
  exitCode: number;
  payload: Record<string, unknown>;
}

export interface InstalledHostActionDependencies
  extends InstalledHostContextDependencies {
  createActionId?: () => string;
  createHostAdapter?: (input: Parameters<typeof createHostAdapter>[0]) => HostAdapter;
  now?: () => string;
  runCommand?: (command: string, cwd: string) => Promise<{
    exitCode: number;
    stderr: string;
    stdout: string;
  }>;
}

export async function evaluateInstalledHostPreToolUse(
  input: InstalledHostPreToolUseInput,
  dependencies: InstalledHostActionDependencies = {},
): Promise<InstalledHostPreToolUseResult> {
  const invocation = parseInstalledPreToolUseInvocation(input.payload);
  if (invocation.status !== "ok") {
    return {
      command: invocation.command,
      debug: false,
      output: null,
      reason: invocation.reason,
      scope: null,
    };
  }

  const assessed = await assessInstalledHostCommandAction(
    {
      command: invocation.command,
      cwd: invocation.cwd,
      homeRoot: input.homeRoot,
      host: input.host,
      ...(invocation.actionId ? { actionId: invocation.actionId } : {}),
      ...(invocation.attemptId ? { attemptId: invocation.attemptId } : {}),
      ...(invocation.runId ? { runId: invocation.runId } : {}),
      sequence: invocation.sequence,
      sessionId: invocation.sessionId,
      turnId: invocation.turnId,
    },
    dependencies,
  );
  if (assessed.status === "skip") {
    return {
      command: assessed.command,
      debug: assessed.debug,
      ...(assessed.maxTokens !== undefined ? { maxTokens: assessed.maxTokens } : {}),
      output: null,
      reason: assessed.reason,
      scope: assessed.scope,
    };
  }

  if (
    assessed.assessment.decision === "allow" ||
    assessed.assessment.decision === "allow_with_guidance"
  ) {
    return {
      command: invocation.command,
      debug: assessed.context.debug,
      maxTokens: assessed.context.maxTokens,
      output: null,
      reason: "allow",
      scope: assessed.context.scope,
    };
  }

  return {
    command: invocation.command,
    debug: assessed.context.debug,
    maxTokens: assessed.context.maxTokens,
    output: buildInstalledHookDenial(
      assessed.assessment.reason,
      buildInstalledActionCommand(assessed.intent),
    ),
    reason: "applied",
    scope: assessed.context.scope,
  };
}

export async function executeInstalledHostAction(
  input: InstalledHostActionExecutionInput,
  dependencies: InstalledHostActionDependencies = {},
): Promise<InstalledHostActionExecutionResult> {
  const command = normalizeText(input.command);
  if (!command) {
    return {
      exitCode: 1,
      payload: {
        executed: false,
        reason:
          "Codex action gate requires --command <command> or command tokens after --.",
      },
    };
  }

  if (!normalizeText(input.sessionId)) {
    return {
      exitCode: 1,
      payload: {
        executed: false,
        reason:
          "Codex action gate requires --session-id <session-id> to bind memory-backed policy to a real host session.",
      },
    };
  }

  const assessed = await assessInstalledHostCommandAction(
    {
      actionId: input.actionId,
      attemptId: input.attemptId,
      command,
      cwd: input.cwd,
      homeRoot: input.homeRoot,
      host: input.host,
      runId: input.runId,
      sequence: input.sequence ?? DEFAULT_ACTION_SEQUENCE,
      sessionId: input.sessionId,
      turnId: input.turnId,
    },
    dependencies,
  );
  if (assessed.status === "skip") {
    return {
      exitCode: 1,
      payload: {
        executed: false,
        reason: assessed.reason,
      },
    };
  }

  const plan = resolveHostActionExecutionPlan({
    assessment: assessed.assessment,
    intent: assessed.intent,
  });
  const executedStep = plan.effectiveFirstStep;

  if (plan.blocked || executedStep?.kind === "warning") {
    return {
      exitCode: 2,
      payload: {
        actionId: assessed.intent.actionId,
        decision: assessed.assessment.decision,
        executed: false,
        guidance: [...assessed.assessment.guidance],
        originalAction: command,
        reason: assessed.assessment.reason,
        recommendedFirstStep: summarizeStep(executedStep),
        realizedEventParentId: plan.realizedEventParentId,
        rewritten: plan.rewritten,
      },
    };
  }
  if (!executedStep) {
    return {
      exitCode: 2,
      payload: {
        actionId: assessed.intent.actionId,
        decision: assessed.assessment.decision,
        executed: false,
        guidance: [...assessed.assessment.guidance],
        originalAction: command,
        reason:
          "Codex action gate resolved no executable first step for the installed action bridge.",
        realizedEventParentId: plan.realizedEventParentId,
        rewritten: plan.rewritten,
      },
    };
  }
  const executableCommand =
    executedStep.kind === "file_edit"
      ? undefined
      : resolveExecutableCommand(executedStep);
  if (executedStep.kind === "tool_call" && !executableCommand) {
    return {
      exitCode: 2,
      payload: {
        actionId: assessed.intent.actionId,
        decision: assessed.assessment.decision,
        executed: false,
        guidance: [...assessed.assessment.guidance],
        originalAction: command,
        reason: buildNonExecutableRewriteReason(
          assessed.assessment.reason,
          executedStep,
        ),
        recommendedFirstStep: summarizeStep(executedStep),
        realizedEventParentId: plan.realizedEventParentId,
        rewritten: plan.rewritten,
      },
    };
  }

  const eventIdBase = `goodmemory-host-${assessed.intent.actionId}`;
  const executedCommand =
    executableCommand ?? summarizeStep(executedStep) ?? command;
  const executedToolName =
    executedStep.kind === "file_edit"
      ? undefined
      : executedStep.kind === "tool_call"
        ? executedStep.toolName
        : resolveCommandToolName(executedCommand);
  const hostEventBinding = buildHostEventRunBinding(assessed.intent);

  if (executedStep.kind !== "file_edit") {
    await ingestHostAgentEvent(assessed.memory, {
      surface: "host",
      kind: "tool_call",
      eventId: `${eventIdBase}-call`,
      ...hostEventBinding,
      turnId: assessed.intent.turnId,
      sequence: assessed.intent.sequence,
      occurredAt: assessed.intent.occurredAt,
      hostKind: assessed.intent.hostKind,
      scope: assessed.intent.scope,
      parentEventId: plan.realizedEventParentId,
      toolName: executedToolName ?? PRE_TOOL_USE_TOOL_NAME,
      raw: executedCommand,
      payload: {
        command: executedCommand,
        originalAction: command,
        rewritten: plan.rewritten,
        ...(executedStep.kind === "tool_call" && executedStep.payload !== undefined
          ? { structuredPayload: executedStep.payload }
          : {}),
      },
    });
  }

  let executionSummary = "";
  let exitCode = 0;
  let stderr = "";
  let stdout = "";

  try {
    if (executedStep.kind === "file_edit") {
      const result = await executeFileEdit(
        executedStep,
        assessed.context.workspaceRoot,
      );
      executionSummary = result.summary;
      await ingestHostAgentEvent(assessed.memory, {
        surface: "host",
        kind: "file_edit",
        eventId: `${eventIdBase}-file`,
        ...hostEventBinding,
        turnId: assessed.intent.turnId,
        sequence: assessed.intent.sequence + 1,
        occurredAt: now(dependencies),
        hostKind: assessed.intent.hostKind,
        scope: assessed.intent.scope,
        parentEventId: plan.realizedEventParentId,
        operation: executedStep.operation,
        relativePath: executedStep.relativePath,
        summary: result.summary,
      });
    } else {
      const result = await runInstalledCommand(
        executedCommand,
        assessed.context.workspaceRoot,
        dependencies,
      );
      exitCode = result.exitCode;
      stderr = result.stderr;
      stdout = result.stdout;
      executionSummary = clipText(
        [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n"),
      );
      await ingestHostAgentEvent(assessed.memory, {
        surface: "host",
        kind: "tool_result",
        eventId: `${eventIdBase}-result`,
        ...hostEventBinding,
        turnId: assessed.intent.turnId,
        sequence: assessed.intent.sequence + 1,
        occurredAt: now(dependencies),
        hostKind: assessed.intent.hostKind,
        scope: assessed.intent.scope,
        parentEventId: plan.realizedEventParentId,
        toolName: executedToolName ?? PRE_TOOL_USE_TOOL_NAME,
        outcome: classifyToolResultOutcome(result.exitCode, false),
        excerpt: executionSummary || `Command exited with code ${result.exitCode}.`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    executionSummary = clipText(message);
    exitCode = 1;
    if (executedStep.kind !== "file_edit") {
      await ingestHostAgentEvent(assessed.memory, {
        surface: "host",
        kind: "tool_result",
        eventId: `${eventIdBase}-result`,
        ...hostEventBinding,
        turnId: assessed.intent.turnId,
        sequence: assessed.intent.sequence + 1,
        occurredAt: now(dependencies),
        hostKind: assessed.intent.hostKind,
        scope: assessed.intent.scope,
        parentEventId: plan.realizedEventParentId,
        toolName: executedToolName ?? PRE_TOOL_USE_TOOL_NAME,
        outcome: "failure",
        excerpt: executionSummary || "Codex action gate execution failed.",
      });
    }

    return {
      exitCode,
      payload: {
        actionId: assessed.intent.actionId,
        decision: assessed.assessment.decision,
        error: message,
        executed: false,
        executedStep: summarizeStep(executedStep),
        guidance: [...assessed.assessment.guidance],
        originalAction: command,
        reason: assessed.assessment.reason,
        realizedEventParentId: plan.realizedEventParentId,
        rewritten: plan.rewritten,
      },
    };
  }

  return {
    exitCode,
    payload: {
      actionId: assessed.intent.actionId,
      decision: assessed.assessment.decision,
      executed: true,
      executedStep: summarizeStep(executedStep),
      executionSummary,
      guidance: [...assessed.assessment.guidance],
      originalAction: command,
      reason: assessed.assessment.reason,
      realizedEventParentId: plan.realizedEventParentId,
      rewritten: plan.rewritten,
      originalActionDeferred: plan.rewritten,
      exitCode,
      ...(stdout.trim().length > 0 ? { stdout: stdout.trim() } : {}),
      ...(stderr.trim().length > 0 ? { stderr: stderr.trim() } : {}),
    },
  };
}

async function assessInstalledHostCommandAction(
  input: InstalledHostActionExecutionInput,
  dependencies: InstalledHostActionDependencies,
): Promise<InstalledHostActionAssessment> {
  if (!normalizeText(input.sessionId)) {
    return {
      command: normalizeText(input.command),
      debug: false,
      reason: "missing_session",
      scope: null,
      status: "skip",
    };
  }

  const command = normalizeText(input.command);
  if (!command) {
    return {
      command: null,
      debug: false,
      reason: "missing_command",
      scope: null,
      status: "skip",
    };
  }

  if (isInstalledManagedCommand(command)) {
    return {
      command,
      debug: false,
      reason: "managed_command",
      scope: null,
      status: "skip",
    };
  }

  const resolved = await resolveInstalledHostContext(
    {
      cwd: input.cwd,
      homeRoot: input.homeRoot,
      host: input.host,
      sessionId: input.sessionId,
    },
    dependencies,
  );
  if (resolved.status !== "ok") {
    return {
      command,
      debug: resolved.debug,
      reason: resolved.status,
      scope: null,
      status: "skip",
    };
  }

  try {
    const memory = createInstalledHostMemory(resolved.context, dependencies);
    const adapter = (dependencies.createHostAdapter ?? createHostAdapter)({
      id: `goodmemory-installed-${input.host}-action`,
      hostKind: input.host,
      memory: createInstalledHostAssessmentMemory(resolved.context, memory),
    });
    const occurredAt = now(dependencies);
    const intent = buildInstalledActionIntent(
      {
        actionId: input.actionId,
        attemptId: input.attemptId,
        command,
        runId: input.runId,
        sequence: input.sequence ?? DEFAULT_ACTION_SEQUENCE,
        sessionId: input.sessionId,
        turnId: input.turnId,
      },
      resolved.context,
      occurredAt,
      dependencies,
    );
    const assessment = await adapter.assessAction(intent);
    return {
      assessment,
      context: resolved.context,
      intent,
      memory,
      status: "ok",
    };
  } catch {
    return {
      command,
      debug: resolved.context.debug,
      maxTokens: resolved.context.maxTokens,
      reason: "assessment_failed",
      scope: resolved.context.scope,
      status: "skip",
    };
  }
}

function buildInstalledActionIntent(
  input: InstalledHostActionInvocation,
  context: InstalledHostResolvedContext,
  occurredAt: string,
  dependencies: InstalledHostActionDependencies,
): HostActionIntent {
  const runBinding = resolveRunBinding(input);
  const actionId =
    input.actionId ??
    `${context.host}-installed-action-${
      dependencies.createActionId ? dependencies.createActionId() : crypto.randomUUID()
    }`;
  const turnId = input.turnId ?? `goodmemory-installed-action-${actionId}`;
  const base = {
    actionId,
    action: {
      kind: "command" as const,
      command: input.command,
    },
    hostKind: context.host,
    occurredAt,
    scope: context.scope,
    sequence: input.sequence,
    turnId,
  };

  if (runBinding.runId) {
    return {
      ...base,
      runId: runBinding.runId,
      ...(runBinding.attemptId ? { attemptId: runBinding.attemptId } : {}),
    };
  }

  return {
    ...base,
    attemptId: runBinding.attemptId!,
  };
}

function resolveRunBinding(
  input: Pick<InstalledHostActionInvocation, "attemptId" | "runId" | "sessionId">,
):
  | { attemptId: string; runId?: undefined }
  | { attemptId?: string; runId: string } {
  if (input.runId && input.attemptId) {
    return {
      attemptId: input.attemptId,
      runId: input.runId,
    };
  }
  if (input.runId) {
    return {
      runId: input.runId,
    };
  }
  if (input.attemptId) {
    return {
      attemptId: input.attemptId,
    };
  }
  return {
    runId: `goodmemory-installed-${input.sessionId}`,
  };
}

function buildHostEventRunBinding(
  intent: Pick<HostActionIntent, "attemptId" | "runId">,
):
  | { attemptId: string; runId?: undefined }
  | { attemptId?: string; runId: string } {
  if (intent.runId) {
    return {
      runId: intent.runId,
      ...(intent.attemptId ? { attemptId: intent.attemptId } : {}),
    };
  }

  return {
    attemptId: intent.attemptId!,
  };
}

function parseInstalledPreToolUseInvocation(
  payload: Record<string, unknown>,
):
  | ({
      actionId?: string;
      attemptId?: string;
      command: string;
      cwd?: string;
      runId?: string;
      sequence: number;
      sessionId: string;
      status: "ok";
      turnId: string;
    })
  | {
      command: string | null;
      reason:
        | "managed_command"
        | "missing_command"
        | "missing_session"
        | "unsupported_hook_event"
        | "unsupported_tool";
      status: "skip";
    } {
  if (readOptionalText(payload, "hook_event_name") !== PRE_TOOL_USE_HOOK_EVENT_NAME) {
    return {
      command: null,
      reason: "unsupported_hook_event",
      status: "skip",
    };
  }
  if (readOptionalText(payload, "tool_name") !== PRE_TOOL_USE_TOOL_NAME) {
    return {
      command: null,
      reason: "unsupported_tool",
      status: "skip",
    };
  }

  const sessionId = normalizeText(readOptionalText(payload, "session_id"));
  if (!sessionId) {
    return {
      command: null,
      reason: "missing_session",
      status: "skip",
    };
  }

  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : null;
  const command = normalizeText(toolInput ? readOptionalText(toolInput, "command") : undefined);
  if (!command) {
    return {
      command: null,
      reason: "missing_command",
      status: "skip",
    };
  }
  if (isInstalledManagedCommand(command)) {
    return {
      command,
      reason: "managed_command",
      status: "skip",
    };
  }
  const turnId =
    normalizeText(readOptionalText(payload, "turn_id")) ??
    PRE_TOOL_USE_FALLBACK_TURN_ID;

  return {
    actionId:
      normalizeText(readOptionalText(payload, "action_id")) ??
      buildStableInstalledPreToolActionId({
        command,
        ...(normalizeText(readOptionalText(payload, "cwd"))
          ? { cwd: normalizeText(readOptionalText(payload, "cwd")) ?? undefined }
          : {}),
        sequence: readNonNegativeInteger(payload.sequence) ?? DEFAULT_ACTION_SEQUENCE,
        sessionId,
        turnId,
      }),
    ...(normalizeText(readOptionalText(payload, "attempt_id"))
      ? { attemptId: normalizeText(readOptionalText(payload, "attempt_id")) ?? undefined }
      : {}),
    command,
    ...(normalizeText(readOptionalText(payload, "cwd"))
      ? { cwd: normalizeText(readOptionalText(payload, "cwd")) ?? undefined }
      : {}),
    ...(normalizeText(readOptionalText(payload, "run_id"))
      ? { runId: normalizeText(readOptionalText(payload, "run_id")) ?? undefined }
      : {}),
    sequence: readNonNegativeInteger(payload.sequence) ?? DEFAULT_ACTION_SEQUENCE,
    sessionId,
    status: "ok",
    turnId,
  };
}

function buildStableInstalledPreToolActionId(input: {
  command: string;
  cwd?: string;
  sequence: number;
  sessionId: string;
  turnId: string;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        command: input.command,
        cwd: input.cwd ?? "",
        sequence: input.sequence,
        sessionId: input.sessionId,
        turnId: input.turnId,
      }),
    )
    .digest("hex")
    .slice(0, 12);

  return `goodmemory-installed-pretool-${digest}`;
}

function buildInstalledActionCommand(intent: HostActionIntent): string {
  return [
    "goodmemory",
    "codex",
    "action",
    "--session-id",
    shellEscape(intent.scope.sessionId ?? ""),
    ...(intent.runId ? ["--run-id", shellEscape(intent.runId)] : []),
    ...(intent.attemptId ? ["--attempt-id", shellEscape(intent.attemptId)] : []),
    "--action-id",
    shellEscape(intent.actionId),
    "--turn-id",
    shellEscape(intent.turnId),
    "--sequence",
    String(intent.sequence),
    "--command",
    shellEscape(intent.action.kind === "command" ? intent.action.command : summarizeStep(intent.action) ?? ""),
  ].join(" ");
}

function buildInstalledHookDenial(
  reason: string,
  actionCommand: string,
): Record<string, unknown> {
  return {
    hookSpecificOutput: {
      hookEventName: PRE_TOOL_USE_HOOK_EVENT_NAME,
      permissionDecision: "deny",
      permissionDecisionReason: `${trimTrailingPeriod(
        reason,
      )}. Run this instead: ${actionCommand}`,
    },
  };
}

function trimTrailingPeriod(value: string): string {
  return value.replace(/[.\s]+$/u, "");
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isInstalledManagedCommand(command: string): boolean {
  return (
    matchesInstalledManagedCommand(command, ["goodmemory", "codex", "action"]) ||
    matchesInstalledManagedCommand(command, [
      "goodmemory",
      "codex",
      "hook",
      "pre-tool-use",
    ])
  );
}

function matchesInstalledManagedCommand(
  command: string,
  expectedTokens: readonly string[],
): boolean {
  const tokens = readShellTokens(command);
  let index = 0;
  while (index < tokens.length && isShellEnvAssignment(tokens[index]!)) {
    index += 1;
  }

  if (tokens.length - index < expectedTokens.length) {
    return false;
  }

  const executable = basename(tokens[index] ?? "");
  if (executable !== expectedTokens[0]) {
    return false;
  }

  for (let offset = 1; offset < expectedTokens.length; offset += 1) {
    if (tokens[index + offset] !== expectedTokens[offset]) {
      return false;
    }
  }

  return true;
}

function isShellEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/u.test(token);
}

function readShellTokens(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const character of command) {
    if (quote === "'") {
      if (character === "'") {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = true;
      continue;
    }

    if (quote === '"') {
      if (character === '"') {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }

    if (/\s/u.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += "\\";
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function now(dependencies: InstalledHostActionDependencies): string {
  return (dependencies.now ?? (() => new Date().toISOString()))();
}

function resolveExecutableCommand(
  step: HostPlannedAction | HostRecommendedFirstStep | undefined,
): string | undefined {
  if (!step) {
    return undefined;
  }

  switch (step.kind) {
    case "warning":
      return undefined;
    case "command":
      return step.command;
    case "tool_call":
      return step.raw?.trim() || undefined;
    case "file_edit":
      return undefined;
  }
}

function summarizeStep(
  step: HostPlannedAction | HostRecommendedFirstStep | undefined,
): string | undefined {
  if (!step) {
    return undefined;
  }

  switch (step.kind) {
    case "warning":
      return step.message;
    case "command":
      return step.command;
    case "tool_call":
      return step.raw?.trim() || step.toolName;
    case "file_edit":
      return `${step.operation} ${step.relativePath}`;
  }
}

function buildNonExecutableRewriteReason(
  reason: string,
  step: HostPlannedAction | HostRecommendedFirstStep,
): string {
  const detail =
    step.kind === "tool_call"
      ? `The recommended ${step.toolName} tool call has no shell-equivalent raw command for the Codex action bridge.`
      : "The recommended first step is not executable on the Codex action bridge.";
  return `${reason} ${detail}`.trim();
}

function resolveCommandToolName(command: string | undefined): string {
  const trimmed = command?.trim() ?? "";
  if (trimmed.length === 0) {
    return PRE_TOOL_USE_TOOL_NAME;
  }

  const firstToken = trimmed.split(/\s+/u)[0];
  return firstToken ? basename(firstToken) : PRE_TOOL_USE_TOOL_NAME;
}

function clipText(value: string, maxLength = 280): string {
  if (!value || value.trim().length === 0) {
    return "";
  }

  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function classifyToolResultOutcome(
  exitCode: number,
  timedOut: boolean,
): "failure" | "success" | "timeout" {
  if (timedOut) {
    return "timeout";
  }
  return exitCode === 0 ? "success" : "failure";
}

function resolveShellBinary(): string {
  for (const candidate of SHELL_BINARY_CANDIDATES) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Codex action gate could not resolve a supported shell. Install /bin/bash, /bin/sh, or /bin/zsh.",
  );
}

async function runInstalledCommand(
  command: string,
  cwd: string,
  dependencies: InstalledHostActionDependencies,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  if (dependencies.runCommand) {
    return dependencies.runCommand(command, cwd);
  }

  const child = Bun.spawn({
    cmd: [resolveShellBinary(), "-lc", command],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return {
    exitCode,
    stderr,
    stdout,
  };
}

async function executeFileEdit(
  step: Extract<HostPlannedAction, { kind: "file_edit" }>,
  cwd: string,
): Promise<{ summary: string }> {
  const absolutePath = resolve(cwd, step.relativePath);

  if (step.operation === "delete") {
    await rm(absolutePath, { force: true, recursive: true });
    return {
      summary: `Deleted ${step.relativePath}`,
    };
  }

  if (step.operation === "create") {
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "", "utf8");
    return {
      summary: `Created ${step.relativePath}`,
    };
  }

  const existing = await readFile(absolutePath, "utf8").catch(() => "");
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, existing, "utf8");
  return {
    summary: `Touched ${step.relativePath}`,
  };
}

function createInstalledHostAssessmentMemory(
  context: InstalledHostResolvedContext,
  memory: GoodMemory,
): Pick<GoodMemory, "exportMemory"> {
  if (!context.scope.agentId) {
    return {
      exportMemory: memory.exportMemory.bind(memory),
    };
  }

  const wrappedMemory = {
    async exportMemory(input) {
      const primary = await memory.exportMemory(input);
      const broaderScope = {
        ...input.scope,
      };
      delete broaderScope.agentId;
      const broader = await memory.exportMemory({
        ...input,
        scope: broaderScope,
      });
      return mergeExportMemoryResults(primary, broader);
    },
  } as GoodMemory;
  const integrationSupport = readGoodMemoryIntegrationSupport(memory);

  return integrationSupport
    ? attachGoodMemoryIntegrationSupport(wrappedMemory, integrationSupport)
    : wrappedMemory;
}

function mergeExportMemoryResults(
  primary: ExportMemoryResult,
  broader: ExportMemoryResult,
): ExportMemoryResult {
  return {
    ...primary,
    durable: {
      profile: primary.durable.profile ?? broader.durable.profile,
      preferences: mergeScopeBoundRecords(
        primary.durable.preferences,
        broader.durable.preferences,
      ),
      references: mergeScopeBoundRecords(
        primary.durable.references,
        broader.durable.references,
      ),
      facts: mergeScopeBoundRecords(primary.durable.facts, broader.durable.facts),
      feedback: mergeScopeBoundRecords(
        primary.durable.feedback,
        broader.durable.feedback,
      ),
      episodes: mergeScopeBoundRecords(
        primary.durable.episodes,
        broader.durable.episodes,
      ),
      archives: mergeScopeBoundRecords(
        primary.durable.archives,
        broader.durable.archives,
      ),
      evidence: mergeScopeBoundRecords(
        primary.durable.evidence,
        broader.durable.evidence,
      ),
      experiences: mergeScopeBoundRecords(
        primary.durable.experiences,
        broader.durable.experiences,
      ),
      proposals: mergeScopeBoundRecords(
        primary.durable.proposals,
        broader.durable.proposals,
      ),
      promotions: mergeScopeBoundRecords(
        primary.durable.promotions,
        broader.durable.promotions,
      ),
    },
    runtime: mergeRuntimeExport(primary.runtime, broader.runtime),
  };
}

function mergeRuntimeExport(
  primary: ExportMemoryResult["runtime"] | undefined,
  broader: ExportMemoryResult["runtime"] | undefined,
): ExportMemoryResult["runtime"] | undefined {
  if (!primary && !broader) {
    return undefined;
  }

  return {
    workingMemory: mergeWorkingMemory(
      primary?.workingMemory,
      broader?.workingMemory,
    ),
    journal: mergeSessionJournal(primary?.journal, broader?.journal),
    spills: mergeScopeBoundRecords(primary?.spills ?? [], broader?.spills ?? []),
  };
}

function mergeWorkingMemory(
  primary: NonNullable<ExportMemoryResult["runtime"]>["workingMemory"] | undefined,
  broader: NonNullable<ExportMemoryResult["runtime"]>["workingMemory"] | undefined,
): NonNullable<ExportMemoryResult["runtime"]>["workingMemory"] {
  if (!primary && !broader) {
    return null;
  }
  if (!primary) {
    return broader ?? null;
  }
  if (!broader) {
    return primary;
  }

  return {
    sessionId: primary.sessionId || broader.sessionId,
    userId: primary.userId || broader.userId,
    ...(primary.currentGoal ?? broader.currentGoal
      ? { currentGoal: primary.currentGoal ?? broader.currentGoal }
      : {}),
    ...(mergeOptionalStringArray(primary.constraints, broader.constraints)
      ? { constraints: mergeOptionalStringArray(primary.constraints, broader.constraints) }
      : {}),
    openLoops: mergeStringArray(primary.openLoops, broader.openLoops),
    ...(mergeOptionalStringArray(
      primary.temporaryDecisions,
      broader.temporaryDecisions,
    )
      ? {
          temporaryDecisions: mergeOptionalStringArray(
            primary.temporaryDecisions,
            broader.temporaryDecisions,
          ),
        }
      : {}),
    ...(mergeOptionalRecord(primary.toolState, broader.toolState)
      ? { toolState: mergeOptionalRecord(primary.toolState, broader.toolState) }
      : {}),
    ...(mergeOptionalRecord(primary.state, broader.state)
      ? { state: mergeOptionalRecord(primary.state, broader.state) }
      : {}),
    updatedAt: maxIsoTimestamp(primary.updatedAt, broader.updatedAt),
  };
}

function mergeSessionJournal(
  primary: NonNullable<ExportMemoryResult["runtime"]>["journal"] | undefined,
  broader: NonNullable<ExportMemoryResult["runtime"]>["journal"] | undefined,
): NonNullable<ExportMemoryResult["runtime"]>["journal"] {
  if (!primary && !broader) {
    return null;
  }
  if (!primary) {
    return broader ?? null;
  }
  if (!broader) {
    return primary;
  }

  return {
    sessionId: primary.sessionId || broader.sessionId,
    userId: primary.userId || broader.userId,
    ...(primary.title ?? broader.title
      ? { title: primary.title ?? broader.title }
      : {}),
    ...(primary.currentState ?? broader.currentState
      ? { currentState: primary.currentState ?? broader.currentState }
      : {}),
    ...(primary.taskSpecification ?? broader.taskSpecification
      ? { taskSpecification: primary.taskSpecification ?? broader.taskSpecification }
      : {}),
    ...(mergeOptionalStringArray(
      primary.filesAndFunctions,
      broader.filesAndFunctions,
    )
      ? {
          filesAndFunctions: mergeOptionalStringArray(
            primary.filesAndFunctions,
            broader.filesAndFunctions,
          ),
        }
      : {}),
    ...(mergeOptionalStringArray(primary.workflow, broader.workflow)
      ? { workflow: mergeOptionalStringArray(primary.workflow, broader.workflow) }
      : {}),
    ...(mergeOptionalStringArray(
      primary.errorsAndCorrections,
      broader.errorsAndCorrections,
    )
      ? {
          errorsAndCorrections: mergeOptionalStringArray(
            primary.errorsAndCorrections,
            broader.errorsAndCorrections,
          ),
        }
      : {}),
    ...(mergeOptionalStringArray(
      primary.systemDocumentation,
      broader.systemDocumentation,
    )
      ? {
          systemDocumentation: mergeOptionalStringArray(
            primary.systemDocumentation,
            broader.systemDocumentation,
          ),
        }
      : {}),
    ...(mergeOptionalStringArray(primary.learnings, broader.learnings)
      ? { learnings: mergeOptionalStringArray(primary.learnings, broader.learnings) }
      : {}),
    ...(mergeOptionalStringArray(primary.keyResults, broader.keyResults)
      ? { keyResults: mergeOptionalStringArray(primary.keyResults, broader.keyResults) }
      : {}),
    worklog: mergeStringArray(primary.worklog, broader.worklog),
    ...(primary.lastSummarizedMessageId ?? broader.lastSummarizedMessageId
      ? {
          lastSummarizedMessageId:
            primary.lastSummarizedMessageId ?? broader.lastSummarizedMessageId,
        }
      : {}),
    updatedAt: maxIsoTimestamp(primary.updatedAt, broader.updatedAt),
  };
}

function mergeStringArray(primary: string[], broader: string[]): string[] {
  return [...new Set([...broader, ...primary])];
}

function mergeOptionalStringArray(
  primary: string[] | undefined,
  broader: string[] | undefined,
): string[] | undefined {
  if (!primary && !broader) {
    return undefined;
  }

  return mergeStringArray(primary ?? [], broader ?? []);
}

function mergeOptionalRecord(
  primary: Record<string, unknown> | undefined,
  broader: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!primary && !broader) {
    return undefined;
  }

  return {
    ...(broader ?? {}),
    ...(primary ?? {}),
  };
}

function maxIsoTimestamp(primary: string, broader: string): string {
  return primary >= broader ? primary : broader;
}

function mergeScopeBoundRecords<T extends { id: string }>(
  primary: T[],
  broader: T[],
): T[] {
  const merged = new Map<string, T>();

  for (const record of [...broader, ...primary]) {
    merged.set(record.id, record);
  }

  return [...merged.values()];
}
