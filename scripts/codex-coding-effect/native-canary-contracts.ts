import { createHash } from "node:crypto";

export interface CodexHooksFeature {
  enabled: boolean;
  maturity: string;
}

export interface NativeCanaryInjectionEvent {
  command: "session-start" | "user-prompt-submit";
  decision: "duplicate_context" | "injected" | "low_relevance";
  recordIds: string[];
  sessionDigest?: string;
}

export interface NativeCanaryWritebackEvent {
  command: string;
  contentPreview: string;
  linkedRecordIds: Array<{ id: string; type: string }>;
  recallHitCount: number;
  recalledBy: Array<{ sessionDigest: string }>;
  sessionDigest?: string;
  status: string;
}

export interface NativeCanaryEvidence {
  codexHooks: CodexHooksFeature;
  firstSession: {
    injectionEvents: NativeCanaryInjectionEvent[];
    threadId: string;
  };
  hostStatus: {
    hookRegistered: boolean;
    writeback: {
      mode: string;
      persistRawTranscript: boolean;
    };
  };
  manualRolloutSelectionUsed: boolean;
  openLoopMarker: string;
  secondSession: {
    injectionEvents: NativeCanaryInjectionEvent[];
    threadId: string;
  };
  seedMemoryId: string;
  transcript: {
    conversationMessageCount: number;
    formatDrift: null | { line: number; reason: string };
    sessionId: string;
    sourceSha256: string;
  };
  transcriptCursorSessionDigests: string[];
  writebackEvents: NativeCanaryWritebackEvent[];
}

export interface NativeCanaryEvaluation {
  firstSessionDigest: string;
  passed: boolean;
  reasons: string[];
  recalledWritebackRecordIds: string[];
  secondSessionDigest: string;
  writebackRecordIds: string[];
}

export function parseCodexFeatureList(raw: string): CodexHooksFeature {
  for (const line of raw.split(/\r?\n/u)) {
    const match = /^hooks\s+(\S+)\s+(true|false)\s*$/u.exec(line);
    if (match) {
      return { enabled: match[2] === "true", maturity: match[1]! };
    }
  }
  throw new Error("Codex feature list does not contain hooks");
}

export function buildNativeCodexArgs(input: {
  model: string;
  prompt: string;
  reasoningEffort?: string;
  workspaceRoot: string;
}): string[] {
  return [
    "--enable",
    "hooks",
    "--ask-for-approval",
    "never",
    "--dangerously-bypass-hook-trust",
    "exec",
    "--strict-config",
    "--json",
    "--sandbox",
    "read-only",
    "--model",
    input.model,
    ...(input.reasoningEffort
      ? ["-c", `model_reasoning_effort=${JSON.stringify(input.reasoningEffort)}`]
      : []),
    "--cd",
    input.workspaceRoot,
    input.prompt,
  ];
}

export function buildNativeCanarySessionDigest(sessionId: string): string {
  return `session:${createHash("sha256").update(sessionId).digest("hex").slice(0, 24)}`;
}

export function buildNativeCanaryPrompts(input: {
  lookupKey: string;
  openLoopMarker: string;
}): {
  first: string;
  second: string;
} {
  return {
    first:
      `Handoff key ${input.lookupKey}. Next step is ${input.openLoopMarker}. `
      + "Remember that this is the only open C2 canary action. "
      + `Does installed context contain the release codename for ${input.lookupKey}? `
      + "Do not quote it or use tools.",
    second: [
      "Do not edit files, run commands, or use MCP or memory tools.",
      `For handoff key ${input.lookupKey}, briefly acknowledge whether installed workspace context contains the associated only open C2 canary action; do not quote or guess it.`,
    ].join(" "),
  };
}

export function evaluateNativeCanaryEvidence(
  evidence: NativeCanaryEvidence,
): NativeCanaryEvaluation {
  const reasons: string[] = [];
  const firstSessionDigest = buildNativeCanarySessionDigest(
    evidence.firstSession.threadId,
  );
  const secondSessionDigest = buildNativeCanarySessionDigest(
    evidence.secondSession.threadId,
  );

  if (!evidence.codexHooks.enabled) {
    reasons.push("Codex hooks feature is disabled");
  }
  if (evidence.codexHooks.maturity !== "stable") {
    reasons.push("Codex hooks feature is not stable");
  }
  if (!evidence.hostStatus.hookRegistered) {
    reasons.push("GoodMemory lifecycle hooks are not registered");
  }
  if (evidence.hostStatus.writeback.mode !== "selective") {
    reasons.push("GoodMemory selective writeback is not enabled");
  }
  if (evidence.hostStatus.writeback.persistRawTranscript) {
    reasons.push("raw transcript persistence is enabled");
  }
  if (evidence.manualRolloutSelectionUsed) {
    reasons.push("manual rollout selection was used");
  }
  if (evidence.firstSession.threadId === evidence.secondSession.threadId) {
    reasons.push("fresh Codex session reused the first thread id");
  }
  if (
    evidence.transcript.formatDrift !== null ||
    evidence.transcript.conversationMessageCount < 2 ||
    evidence.transcript.sessionId !== evidence.firstSession.threadId
  ) {
    reasons.push("first Codex transcript failed the pinned parser contract");
  }

  const firstInjected = evidence.firstSession.injectionEvents.some((event) =>
    event.sessionDigest === firstSessionDigest &&
    event.decision === "injected" &&
    event.recordIds.includes(evidence.seedMemoryId)
  );
  if (!firstInjected) {
    reasons.push("seed memory was not injected into the first Codex session");
  }
  if (!evidence.transcriptCursorSessionDigests.includes(firstSessionDigest)) {
    reasons.push("native Stop did not advance the exact transcript cursor");
  }

  const matchingWritebacks = evidence.writebackEvents.filter((event) =>
    event.command === "turn-end" &&
    event.status === "committed" &&
    event.sessionDigest === firstSessionDigest &&
    event.contentPreview.includes(evidence.openLoopMarker)
  );
  const writebackRecordIds = [...new Set(matchingWritebacks.flatMap((event) =>
    event.linkedRecordIds
      .filter((record) => record.type === "memory")
      .map((record) => record.id)
  ))].sort();
  if (writebackRecordIds.length === 0) {
    reasons.push("native Stop writeback was not committed");
  }

  const recalledWritebackRecordIds = writebackRecordIds.filter((recordId) =>
    evidence.secondSession.injectionEvents.some((event) =>
      event.sessionDigest === secondSessionDigest &&
      event.decision === "injected" &&
      event.recordIds.includes(recordId)
    )
  );
  if (recalledWritebackRecordIds.length === 0) {
    reasons.push("Stop-written memory was not injected into the fresh session");
  }
  const recallAuditRecorded = matchingWritebacks.some((event) =>
    event.recallHitCount > 0 &&
    event.recalledBy.some((recall) => recall.sessionDigest === secondSessionDigest)
  );
  if (!recallAuditRecorded) {
    reasons.push("public writeback audit did not record fresh-session recall");
  }

  return {
    firstSessionDigest,
    passed: reasons.length === 0,
    reasons,
    recalledWritebackRecordIds,
    secondSessionDigest,
    writebackRecordIds,
  };
}
