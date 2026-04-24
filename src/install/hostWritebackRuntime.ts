import { createHash } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GoodMemory } from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import type {
  MessageAnnotation,
  MemoryExtractionStrategy,
  MemoryCandidateKindHint,
} from "../remember/candidates";
import {
  isRecord,
  normalizeText,
  readOptionalText,
  type InstalledHostWritebackConfig,
  type InstalledHostWritebackMode,
} from "./hostConfigValidation";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
  type InstalledHostContextDependencies,
  type InstalledHostResolvedContext,
} from "./hostExecutionContext";
import type { InstalledHostKind } from "./hostInstall";
import { resolveInstallRoot } from "./hostRuntimeConfig";

export type InstalledHostWritebackCommand = "turn-end" | "session-end";

export interface InstalledHostWritebackDependencies
  extends InstalledHostContextDependencies {}

export interface InstalledHostWritebackInput {
  command: InstalledHostWritebackCommand;
  dryRun?: boolean;
  homeRoot?: string;
  host: InstalledHostKind;
  mode?: InstalledHostWritebackMode;
  payload: Record<string, unknown>;
}

export interface InstalledHostWritebackCandidate {
  confidence: number;
  content: string;
  durable: boolean;
  kind: "preference" | "fact" | "feedback" | "reference" | "episode";
  reason: string;
  source: "user" | "assistant" | "host_event";
}

export interface InstalledHostWritebackResult {
  applied: boolean;
  candidates: InstalledHostWritebackCandidate[];
  mode: InstalledHostWritebackMode;
  reason:
    | "disabled"
    | "empty_transcript"
    | "missing_config"
    | "missing_repo_opt_in"
    | "no_candidates"
    | "observed"
    | "write_failed"
    | "written";
  trace: Record<string, unknown>;
  wrote: boolean;
}

interface NormalizedWritebackMessage {
  annotation?: HostPayloadAnnotation;
  content: string;
  role: "assistant" | "host_event" | "user";
}

type NormalizedWritebackRole = NormalizedWritebackMessage["role"];

interface HostPayloadAnnotation {
  confirmed?: boolean;
  kindHint?: InstalledHostWritebackCandidate["kind"];
  reason?: string;
  remember?: "always" | "auto" | "never";
  verified?: boolean;
}

interface CandidateWithKey extends InstalledHostWritebackCandidate {
  key: string;
  message: {
    content: string;
    role: "assistant" | "user";
  };
  messageAnnotation: MessageAnnotation;
}

interface WritebackLedger {
  events: string[];
  pending: string[];
}

const MAX_WRITEBACK_LEDGER_EVENTS = 1_000;
const MAX_WRITEBACK_LOCK_ATTEMPTS = 40;
const MAX_WRITEBACK_LOCK_DELAY_MS = 25;
const MAX_WRITEBACK_MESSAGE_CHARS = 1_500;
const SECRET_PATTERN =
  /\b(api[_-]?key|secret|token|password)\b\s*[:=]|sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{16,}/iu;
const PREFERENCE_PATTERN =
  /\b(always|remember to|remember that|prefer|please keep|please use|use .+ instead of|do not use|don't use|never use|以后|不要|不希望|优先)\b/iu;
const FEEDBACK_PATTERN =
  /\b(correction|wrong|not right|instead|next time|from now on|that approach was wrong|刚才.*不对|以后先|改成|更正|不要用)\b/iu;
const OPEN_LOOP_PATTERN =
  /\b(next step|todo|blocked|blocker|blocking|unresolved|follow up|still need|need to add|卡住|卡点|下一步|待办|阻塞)\b/iu;
const DECISION_PATTERN =
  /\b(we decided|decision|canonical|source of truth|accepted|must remain|我们决定|以.+为准|稳定面)\b/iu;
const REFERENCE_PATTERN =
  /(~\/\.goodmemory|\.goodmemory\/|docs\/|task-board\/|reports\/|scripts\/|src\/|tests\/|README\.md|AGENTS\.md|CLAUDE\.md)/u;

export async function executeInstalledHostWriteback(
  input: InstalledHostWritebackInput,
  dependencies: InstalledHostWritebackDependencies = {},
): Promise<InstalledHostWritebackResult> {
  const resolved = await resolveInstalledHostContext(
    {
      cwd: readOptionalText(input.payload, "cwd"),
      homeRoot: input.homeRoot,
      host: input.host,
      sessionId: readOptionalText(input.payload, "session_id"),
    },
    dependencies,
  );
  if (resolved.status !== "ok") {
    return buildSkippedWritebackResult({
      host: input.host,
      mode: input.mode ?? "off",
      reason:
        resolved.status === "missing_global_config" ||
        resolved.status === "invalid_global_config"
          ? "missing_config"
          : "missing_repo_opt_in",
      trace: {
        contextStatus: resolved.status,
        rawTranscriptPersisted: false,
      },
    });
  }

  const config = resolveEffectiveWritebackConfig({
    context: resolved.context,
    dryRun: input.dryRun,
    mode: input.mode,
  });
  if (config.mode === "off") {
    return buildSkippedWritebackResult({
      host: input.host,
      mode: "off",
      reason: "disabled",
      trace: {
        command: input.command,
        rawTranscriptPersisted: false,
      },
    });
  }

  const messages = normalizeWritebackMessages(input.payload, config);
  if (messages.length === 0) {
    return {
      applied: false,
      candidates: [],
      mode: config.mode,
      reason: "empty_transcript",
      trace: {
        command: input.command,
        rawTranscriptPersisted: false,
      },
      wrote: false,
    };
  }

  const durableScope = toDurableWritebackScope(resolved.context.scope);
  const candidates = buildWritebackCandidates({
    command: input.command,
    config,
    host: input.host,
    scope: durableScope,
    messages,
  });
  if (candidates.length === 0) {
    return {
      applied: true,
      candidates: [],
      mode: config.mode,
      reason: "no_candidates",
      trace: {
        command: input.command,
        messageCount: messages.length,
        rawTranscriptPersisted: false,
      },
      wrote: false,
    };
  }

  if (config.mode === "observe") {
    return {
      applied: true,
      candidates: candidates.map(stripCandidateKey),
      mode: "observe",
      reason: "observed",
      trace: {
        command: input.command,
        durableCandidateCount: candidates.filter((candidate) => candidate.durable)
          .length,
        messageCount: messages.length,
        rawTranscriptPersisted: false,
      },
      wrote: false,
    };
  }

  const durableCandidates = candidates.filter((candidate) => candidate.durable);
  if (durableCandidates.length === 0) {
    return {
      applied: true,
      candidates: candidates.map(stripCandidateKey),
      mode: "selective",
      reason: "no_candidates",
      trace: {
        command: input.command,
        durableCandidateCount: 0,
        messageCount: messages.length,
        rawTranscriptPersisted: false,
      },
      wrote: false,
    };
  }

  try {
    const memory = createInstalledHostMemory(resolved.context, dependencies);
    const extractionStrategy = resolveWritebackExtractionStrategy(resolved.context);
    const writeResult = await writeNewCandidates({
      candidates: durableCandidates,
      extractionStrategy,
      homeRoot: input.homeRoot,
      host: input.host,
      memory,
      scope: durableScope,
    });

    return {
      applied: true,
      candidates: candidates.map((candidate) =>
        writeResult.writtenKeys.has(candidate.key)
          ? stripCandidateKey(candidate)
          : {
              ...stripCandidateKey(candidate),
              durable: writeResult.uncommittedKeys.has(candidate.key),
              reason: writeResult.uncommittedKeys.has(candidate.key)
                ? "ledger_pending"
                : writeResult.rejectedKeys.has(candidate.key)
                  ? "write_rejected"
                  : writeResult.failedKeys.has(candidate.key)
                    ? "write_failed"
                    : candidate.durable
                      ? "duplicate"
                      : candidate.reason,
            }
      ),
      mode: "selective",
      reason: writeResult.failed
        ? "write_failed"
        : writeResult.wrote
          ? "written"
          : "no_candidates",
      trace: {
        command: input.command,
        duplicateCandidateCount: writeResult.duplicateCount,
        durableCandidateCount: durableCandidates.length,
        extractionStrategy,
        failedCandidateCount: writeResult.failedKeys.size,
        rawTranscriptPersisted: false,
        rejectedCandidateCount: writeResult.rejectedKeys.size,
        resolvedExtractionStrategies: [...writeResult.resolvedExtractionStrategies],
        uncommittedCandidateCount: writeResult.uncommittedKeys.size,
        writtenCandidateCount: writeResult.writtenKeys.size,
      },
      wrote: writeResult.wrote,
    };
  } catch {
    return {
      applied: true,
      candidates: candidates.map(stripCandidateKey),
      mode: "selective",
      reason: "write_failed",
      trace: {
        command: input.command,
        rawTranscriptPersisted: false,
      },
      wrote: false,
    };
  }
}

function resolveEffectiveWritebackConfig(input: {
  context: InstalledHostResolvedContext;
  dryRun?: boolean;
  mode?: InstalledHostWritebackMode;
}): InstalledHostWritebackConfig {
  const explicitDryRun = input.dryRun === true;
  const dryRun = explicitDryRun || input.context.writeback.dryRun;
  return {
    ...input.context.writeback,
    dryRun,
    mode: dryRun
      ? "observe"
      : input.mode ?? input.context.writeback.mode,
  };
}

function buildSkippedWritebackResult(input: {
  host: InstalledHostKind;
  mode: InstalledHostWritebackMode;
  reason: InstalledHostWritebackResult["reason"];
  trace: Record<string, unknown>;
}): InstalledHostWritebackResult {
  return {
    applied: false,
    candidates: [],
    mode: input.mode,
    reason: input.reason,
    trace: {
      host: input.host,
      ...input.trace,
    },
    wrote: false,
  };
}

function normalizeWritebackMessages(
  payload: Record<string, unknown>,
  config: InstalledHostWritebackConfig,
): NormalizedWritebackMessage[] {
  const annotations = readPayloadAnnotations(payload.annotations);
  const rawMessages = Array.isArray(payload.messages)
    ? payload.messages
    : Array.isArray(payload.transcript)
      ? payload.transcript
      : null;
  const messages = rawMessages
    ? rawMessages.flatMap((message, index) =>
        normalizePayloadMessage(message, annotations.get(index)),
      )
    : normalizeTranscriptText(payload, annotations);
  const summary = normalizeText(readOptionalText(payload, "summary"));
  const prompt = normalizeText(readOptionalText(payload, "prompt"));
  const summaryAnnotation = readSummaryAnnotation(payload);
  const withSignals = [
    ...messages,
    ...(summary
      ? [
          {
            ...(summaryAnnotation ? { annotation: summaryAnnotation } : {}),
            content: summary,
            role: "assistant" as const,
          },
        ]
      : []),
    ...(prompt
      ? [
          {
            content: prompt,
            role: "user" as const,
          },
        ]
      : []),
  ];

  let remainingChars = config.maxChars;
  const bounded: NormalizedWritebackMessage[] = [];
  const selectedMessages = withSignals.slice(-config.maxMessages);
  for (let index = selectedMessages.length - 1; index >= 0; index -= 1) {
    const message = selectedMessages[index];
    if (remainingChars <= 0) {
      break;
    }
    const content = clampText(message.content, Math.min(remainingChars, MAX_WRITEBACK_MESSAGE_CHARS));
    const normalized = normalizeText(content);
    if (!normalized) {
      continue;
    }
    bounded.unshift({
      ...message,
      content: normalized,
    });
    remainingChars -= normalized.length;
  }

  return bounded;
}

function readPayloadAnnotations(value: unknown): Map<number, HostPayloadAnnotation> {
  const annotations = new Map<number, HostPayloadAnnotation>();
  if (!Array.isArray(value)) {
    return annotations;
  }

  value.forEach((annotation) => {
    if (!isRecord(annotation)) {
      return;
    }
    const messageIndex = typeof annotation.messageIndex === "number"
      ? Math.floor(annotation.messageIndex)
      : undefined;
    if (messageIndex === undefined || messageIndex < 0) {
      return;
    }
    const remember =
      annotation.remember === "always" ||
      annotation.remember === "auto" ||
      annotation.remember === "never"
        ? annotation.remember
        : undefined;
    const kindHint = readCandidateKind(annotation.kindHint);
    annotations.set(messageIndex, {
      ...(annotation.confirmed === true ? { confirmed: true } : {}),
      ...(kindHint ? { kindHint } : {}),
      ...(typeof annotation.reason === "string" && annotation.reason.trim().length > 0
        ? { reason: annotation.reason.trim() }
        : {}),
      ...(remember ? { remember } : {}),
      ...(annotation.verified === true ? { verified: true } : {}),
    });
  });

  return annotations;
}

function readSummaryAnnotation(
  payload: Record<string, unknown>,
): HostPayloadAnnotation | undefined {
  const confirmed = payload.summary_confirmed === true;
  const verified = payload.summary_verified === true;
  const remember =
    payload.summary_remember === "always" ||
    payload.summary_remember === "auto" ||
    payload.summary_remember === "never"
      ? payload.summary_remember
      : undefined;
  const kindHint = readCandidateKind(payload.summary_kind);
  const reason = normalizeText(readOptionalText(payload, "summary_reason"));

  if (!confirmed && !verified) {
    if (remember === "never") {
      return {
        ...(kindHint ? { kindHint } : {}),
        ...(reason ? { reason } : {}),
        remember: "never",
      };
    }
    return undefined;
  }

  return {
    ...(confirmed ? { confirmed: true } : {}),
    ...(kindHint ? { kindHint } : {}),
    ...(reason ? { reason } : {}),
    remember: remember ?? (confirmed || verified ? "always" : "auto"),
    ...(verified ? { verified: true } : {}),
  };
}

function normalizePayloadMessage(
  value: unknown,
  annotation: HostPayloadAnnotation | undefined,
): NormalizedWritebackMessage[] {
  if (typeof value === "string") {
    const annotations = new Map<number, HostPayloadAnnotation>();
    if (annotation) {
      annotations.set(0, annotation);
    }
    return normalizeTranscriptLine(value, 0, annotations);
  }
  if (!isRecord(value)) {
    return [];
  }

  const content = normalizeText(
    typeof value.content === "string"
      ? value.content
      : typeof value.text === "string"
        ? value.text
        : undefined,
  );
  if (!content) {
    return [];
  }
  const role = readPayloadMessageRole(value.role);
  if (!role) {
    return [];
  }

  return [
    {
      annotation,
      content,
      role,
    },
  ];
}

function normalizeTranscriptText(
  payload: Record<string, unknown>,
  annotations: Map<number, HostPayloadAnnotation>,
): NormalizedWritebackMessage[] {
  const transcript = normalizeText(readOptionalText(payload, "transcript"));
  if (!transcript) {
    return [];
  }

  return transcript
    .split(/\r?\n/u)
    .map((line, index): NormalizedWritebackMessage | null => {
      return normalizeTranscriptLine(line, index, annotations)[0] ?? null;
    })
    .filter((message): message is NormalizedWritebackMessage => message !== null);
}

function normalizeTranscriptLine(
  line: string,
  index: number,
  annotations: Map<number, HostPayloadAnnotation>,
): NormalizedWritebackMessage[] {
  const match = line.match(
    /^\s*(user|assistant|host|host_event|system|tool)\s*:\s*(.+)$/iu,
  );
  if (!match) {
    return [];
  }
  const roleLabel = match[1];
  const contentText = match[2];
  if (!roleLabel || !contentText) {
    return [];
  }
  const role = readPayloadMessageRole(roleLabel);
  if (!role) {
    return [];
  }
  const content = normalizeText(contentText);
  if (!content) {
    return [];
  }
  return [
    {
      annotation: annotations.get(index),
      content,
      role,
    },
  ];
}

function readPayloadMessageRole(value: unknown): NormalizedWritebackRole | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }
  const role = normalized.toLowerCase();
  if (role === "assistant") {
    return "assistant";
  }
  if (role === "user") {
    return "user";
  }
  if (role === "host" || role === "host_event") {
    return "host_event";
  }

  return undefined;
}

function buildWritebackCandidates(input: {
  command: InstalledHostWritebackCommand;
  config: InstalledHostWritebackConfig;
  host: InstalledHostKind;
  scope: MemoryScope;
  messages: NormalizedWritebackMessage[];
}): CandidateWithKey[] {
  return input.messages.flatMap((message) =>
    buildMessageCandidate(message, {
      command: input.command,
      config: input.config,
      host: input.host,
      scope: input.scope,
    }),
  );
}

function toDurableWritebackScope(scope: MemoryScope): MemoryScope {
  const { sessionId: _sessionId, ...durableScope } = scope;
  return durableScope;
}

function resolveWritebackExtractionStrategy(
  context: InstalledHostResolvedContext,
): MemoryExtractionStrategy {
  return context.providers?.assistedExtractor ? "llm-assisted" : "rules-only";
}

function buildMessageCandidate(
  message: NormalizedWritebackMessage,
  runtime: {
    command: InstalledHostWritebackCommand;
    config: InstalledHostWritebackConfig;
    host: InstalledHostKind;
    scope: MemoryScope;
  },
): CandidateWithKey[] {
  if (message.annotation?.remember === "never") {
    return [];
  }

  const source = message.role === "host_event" ? "host_event" : message.role;
  const secretLike = SECRET_PATTERN.test(message.content);
  const base = classifyDurableSignal(message);
  if (!base && !secretLike) {
    return [];
  }

  const content = secretLike
    ? "[redacted secret-like content]"
    : clampText(message.content, MAX_WRITEBACK_MESSAGE_CHARS);
  const kind = message.annotation?.kindHint ?? base?.kind ?? "fact";
  const confidence = secretLike ? 0 : base?.confidence ?? 0.72;
  const assistantAllowed =
    source !== "assistant" ||
    isAssistantOutputAllowed(
      message.annotation,
      runtime.config.allowAssistantOutput,
    );
  const durable =
    !secretLike &&
    assistantAllowed &&
    confidence >= runtime.config.minConfidence &&
    kind !== "episode";
  const reason = secretLike
    ? "secret_blocked"
    : !assistantAllowed
      ? "assistant_policy_blocked"
      : durable
        ? base?.reason ?? message.annotation?.reason ?? "host_annotation"
        : "below_confidence";

  const messageRole = source === "assistant" ? "assistant" : "user";
  const candidate: InstalledHostWritebackCandidate = {
    confidence,
    content,
    durable,
    kind,
    reason,
    source,
  };

  return [
    {
      ...candidate,
      key: buildCandidateKey({
        candidate,
        scope: runtime.scope,
      }),
      message: {
        content,
        role: messageRole,
      },
      messageAnnotation: {
        ...(source === "assistant" && message.annotation?.confirmed === true
          ? { confirmed: true }
          : {}),
        ...(source === "assistant" && message.annotation?.verified === true
          ? { verified: true }
          : {}),
        kindHint: toMessageAnnotationKind(kind),
        messageIndex: 0,
        metadataPatch: {
          attributes: {
            hostWritebackAssistantPolicy: runtime.config.allowAssistantOutput,
            hostWritebackCommand: runtime.command,
            hostWritebackHost: runtime.host,
            hostWritebackMode: runtime.config.mode,
            hostWritebackReason: reason,
            hostWritebackSource: source,
          },
          tags: ["installed-host-writeback"],
        },
        reason: `GoodMemory installed-host writeback: ${reason}`,
        remember: durable ? "always" : "auto",
      },
    },
  ];
}

function classifyDurableSignal(
  message: NormalizedWritebackMessage,
): { confidence: number; kind: InstalledHostWritebackCandidate["kind"]; reason: string } | null {
  const content = message.content;
  if (message.annotation?.remember === "always") {
    return {
      confidence: 0.86,
      kind: message.annotation.kindHint ?? "fact",
      reason: message.annotation.reason ?? "host_annotation",
    };
  }
  if (FEEDBACK_PATTERN.test(content)) {
    return {
      confidence: 0.9,
      kind: "feedback",
      reason: "procedural_feedback",
    };
  }
  if (PREFERENCE_PATTERN.test(content)) {
    return {
      confidence: 0.88,
      kind: "preference",
      reason: "explicit_preference",
    };
  }
  if (OPEN_LOOP_PATTERN.test(content)) {
    return {
      confidence: 0.84,
      kind: "fact",
      reason: "open_loop",
    };
  }
  if (DECISION_PATTERN.test(content)) {
    return {
      confidence: 0.82,
      kind: "fact",
      reason: "confirmed_decision",
    };
  }
  if (REFERENCE_PATTERN.test(content)) {
    return {
      confidence: 0.78,
      kind: "reference",
      reason: "stable_reference",
    };
  }

  return null;
}

function isAssistantOutputAllowed(
  annotation: HostPayloadAnnotation | undefined,
  policy: InstalledHostWritebackConfig["allowAssistantOutput"],
): boolean {
  if (!annotation || annotation.remember !== "always") {
    return false;
  }
  if (policy === "never") {
    return false;
  }
  if (policy === "confirmed") {
    return annotation.confirmed === true;
  }
  if (policy === "verified") {
    return annotation.verified === true;
  }

  return annotation.confirmed === true || annotation.verified === true;
}

async function writeNewCandidates(input: {
  candidates: CandidateWithKey[];
  extractionStrategy: MemoryExtractionStrategy;
  homeRoot: string | undefined;
  host: InstalledHostKind;
  memory: GoodMemory;
  scope: MemoryScope;
}): Promise<{
  duplicateCount: number;
  failed: boolean;
  failedKeys: Set<string>;
  rejectedKeys: Set<string>;
  resolvedExtractionStrategies: Set<MemoryExtractionStrategy>;
  uncommittedKeys: Set<string>;
  wrote: boolean;
  writtenKeys: Set<string>;
}> {
  return await withWritebackLedgerLock(input.host, input.homeRoot, async () => {
    let ledger = await readWritebackLedger(input.host, input.homeRoot);
    const existing = new Set([...ledger.events, ...ledger.pending]);
    const newCandidates = input.candidates.filter(
      (candidate) => !existing.has(candidate.key),
    );
    if (newCandidates.length === 0) {
      return {
        duplicateCount: input.candidates.length,
        failed: false,
        failedKeys: new Set<string>(),
        rejectedKeys: new Set<string>(),
        resolvedExtractionStrategies: new Set<MemoryExtractionStrategy>(),
        uncommittedKeys: new Set<string>(),
        wrote: false,
        writtenKeys: new Set<string>(),
      };
    }

    const writtenKeys: string[] = [];
    const rejectedKeys: string[] = [];
    const uncommittedKeys: string[] = [];
    const resolvedExtractionStrategies = new Set<MemoryExtractionStrategy>();
    for (const [index, candidate] of newCandidates.entries()) {
      let acceptedCurrentCandidate = false;
      try {
        ledger = markWritebackPending(ledger, candidate.key);
        await writeWritebackLedger(input.host, input.homeRoot, ledger);
        const result = await input.memory.remember({
          annotations: [
            {
              ...candidate.messageAnnotation,
              messageIndex: 0,
            },
          ],
          extractionStrategy: input.extractionStrategy,
          messages: [candidate.message],
          scope: input.scope,
        });
        if (result.metadata?.resolvedExtractionStrategy) {
          resolvedExtractionStrategies.add(
            result.metadata.resolvedExtractionStrategy,
          );
        }
        if (result.accepted > 0) {
          acceptedCurrentCandidate = true;
          ledger = markWritebackCommitted(ledger, candidate.key);
          await writeWritebackLedger(input.host, input.homeRoot, ledger);
          writtenKeys.push(candidate.key);
        } else {
          ledger = clearWritebackPending(ledger, candidate.key);
          await writeWritebackLedger(input.host, input.homeRoot, ledger);
          rejectedKeys.push(candidate.key);
        }
      } catch {
        if (acceptedCurrentCandidate) {
          uncommittedKeys.push(candidate.key);
        } else {
          try {
            ledger = clearWritebackPending(ledger, candidate.key);
            await writeWritebackLedger(input.host, input.homeRoot, ledger);
          } catch {
            // Keep the conservative pending marker if cleanup cannot be persisted.
          }
        }
        return {
          duplicateCount: input.candidates.length - newCandidates.length,
          failed: true,
          failedKeys: new Set(
            newCandidates.slice(index).map((failedCandidate) => failedCandidate.key),
          ),
          rejectedKeys: new Set(rejectedKeys),
          resolvedExtractionStrategies,
          uncommittedKeys: new Set(uncommittedKeys),
          wrote: writtenKeys.length > 0 || uncommittedKeys.length > 0,
          writtenKeys: new Set(writtenKeys),
        };
      }
    }
    if (writtenKeys.length === 0) {
      return {
        duplicateCount: input.candidates.length - newCandidates.length,
        failed: false,
        failedKeys: new Set<string>(),
        rejectedKeys: new Set(rejectedKeys),
        resolvedExtractionStrategies,
        uncommittedKeys: new Set<string>(),
        wrote: false,
        writtenKeys: new Set<string>(),
      };
    }

    return {
      duplicateCount: input.candidates.length - newCandidates.length,
      failed: false,
      failedKeys: new Set<string>(),
      rejectedKeys: new Set(rejectedKeys),
      resolvedExtractionStrategies,
      uncommittedKeys: new Set<string>(),
      wrote: true,
      writtenKeys: new Set(writtenKeys),
    };
  });
}

function stripCandidateKey(
  candidate: CandidateWithKey,
): InstalledHostWritebackCandidate {
  return {
    confidence: candidate.confidence,
    content: candidate.content,
    durable: candidate.durable,
    kind: candidate.kind,
    reason: candidate.reason,
    source: candidate.source,
  };
}

function buildCandidateKey(input: {
  candidate: InstalledHostWritebackCandidate;
  scope: MemoryScope;
}): string {
  const hash = createHash("sha256")
    .update(
      [
        input.scope.userId,
        input.scope.workspaceId ?? "",
        input.scope.agentId ?? "",
        input.candidate.kind,
        input.candidate.content.toLowerCase(),
      ].join("\n"),
    )
    .digest("hex")
    .slice(0, 32);
  return `candidate:${hash}`;
}

function readCandidateKind(
  value: unknown,
): InstalledHostWritebackCandidate["kind"] | undefined {
  return value === "preference" ||
    value === "fact" ||
    value === "feedback" ||
    value === "reference" ||
    value === "episode"
    ? value
    : undefined;
}

function toMessageAnnotationKind(
  kind: InstalledHostWritebackCandidate["kind"],
): Exclude<MemoryCandidateKindHint, "episode" | "noise"> {
  return kind === "episode" ? "fact" : kind;
}

function appendWritebackEvents(
  events: string[],
  eventKeys: string[],
): string[] {
  return [...new Set([...events, ...eventKeys])].slice(-MAX_WRITEBACK_LEDGER_EVENTS);
}

function markWritebackPending(
  ledger: WritebackLedger,
  eventKey: string,
): WritebackLedger {
  if (ledger.events.includes(eventKey)) {
    return {
      events: ledger.events,
      pending: ledger.pending.filter((pendingKey) => pendingKey !== eventKey),
    };
  }

  return {
    events: ledger.events,
    pending: [...new Set([...ledger.pending, eventKey])].slice(
      -MAX_WRITEBACK_LEDGER_EVENTS,
    ),
  };
}

function markWritebackCommitted(
  ledger: WritebackLedger,
  eventKey: string,
): WritebackLedger {
  return {
    events: appendWritebackEvents(ledger.events, [eventKey]),
    pending: ledger.pending.filter((pendingKey) => pendingKey !== eventKey),
  };
}

function clearWritebackPending(
  ledger: WritebackLedger,
  eventKey: string,
): WritebackLedger {
  return {
    events: ledger.events,
    pending: ledger.pending.filter((pendingKey) => pendingKey !== eventKey),
  };
}

async function withWritebackLedgerLock<T>(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const lockPath = `${writebackLedgerPath(host, homeRoot)}.lock`;
  let attempt = 0;

  while (attempt < MAX_WRITEBACK_LOCK_ATTEMPTS) {
    try {
      const lockHandle = await open(lockPath, "wx", 0o600);
      try {
        return await callback();
      } finally {
        await lockHandle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (!isLockAlreadyHeldError(error)) {
        throw error;
      }
    }

    attempt += 1;
    await delay(MAX_WRITEBACK_LOCK_DELAY_MS);
  }

  throw new Error(`Timed out waiting for the ${host} writeback ledger lock.`);
}

async function writeWritebackLedger(
  host: InstalledHostKind,
  homeRoot: string | undefined,
  ledger: WritebackLedger,
): Promise<void> {
  const path = writebackLedgerPath(host, homeRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        events: ledger.events,
        pending: ledger.pending,
        version: 2,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

async function readWritebackLedger(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): Promise<WritebackLedger> {
  try {
    const parsed = JSON.parse(await readFile(writebackLedgerPath(host, homeRoot), "utf8")) as unknown;
    if (isRecord(parsed) && Array.isArray(parsed.events)) {
      return {
        events: parsed.events.filter((event): event is string => typeof event === "string"),
        pending: Array.isArray(parsed.pending)
          ? parsed.pending.filter((event): event is string => typeof event === "string")
          : [],
      };
    }
    throw new Error("GoodMemory writeback ledger must be a JSON object with an events array.");
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        events: [],
        pending: [],
      };
    }
    throw error;
  }
}

function writebackLedgerPath(
  host: InstalledHostKind,
  homeRoot: string | undefined,
): string {
  return join(resolveInstallRoot(homeRoot), `${host}-writeback-events.json`);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isLockAlreadyHeldError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

function clampText(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
