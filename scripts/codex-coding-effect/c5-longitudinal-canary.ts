import { createHash } from "node:crypto";

import type {
  NativeCanaryInjectionEvent,
  NativeCanaryWritebackEvent,
} from "./native-canary-contracts";

export interface C5HookContextEvidence {
  content: string;
  contentByteLength: number;
  contentHash: string;
  contentSha256: string;
}

export interface C5LongitudinalCanary {
  currentWrittenMemoryIds: string[];
  hookContexts: C5HookContextEvidence[];
  injectedRecordIds: string[];
  irrelevantInjection: boolean;
  memoryChannelStatus: "failed" | "passed";
  passed: boolean;
  recalledPriorMemoryIds: string[];
  reasons: string[];
  stopCursorAdvanced: boolean;
  writebackCommitted: boolean;
}

export function evaluateC5LongitudinalCanary(input: {
  cursorSessionDigests: readonly string[];
  expectedPriorMemoryIds: readonly string[];
  injectionEvents: readonly NativeCanaryInjectionEvent[];
  injectionSessionContentHashes: readonly string[];
  memoryExpectation: "irrelevant-control" | "none" | "required";
  rawTranscript: string;
  rawTranscriptPersisted: boolean;
  sessionDigest: string;
  writebackEvents: readonly NativeCanaryWritebackEvent[];
  writebackRequired: boolean;
}): C5LongitudinalCanary {
  const reasons: string[] = [];
  const currentInjectionEvents = input.injectionEvents.filter((event) =>
    event.sessionDigest === input.sessionDigest
  );
  const injectedRecordIds = uniqueSorted(currentInjectionEvents
    .filter((event) =>
      event.decision === "injected" || event.decision === "duplicate_context"
    )
    .flatMap((event) => event.recordIds));
  const expectedPriorMemoryIds = uniqueSorted(input.expectedPriorMemoryIds);
  const recalledPriorMemoryIds = expectedPriorMemoryIds.filter((memoryId) =>
    injectedRecordIds.includes(memoryId)
  );
  const currentWritebacks = input.writebackEvents.filter((event) =>
    event.sessionDigest === input.sessionDigest &&
    event.command === "turn-end" &&
    event.status === "committed"
  );
  const currentWrittenMemoryIds = uniqueSorted(currentWritebacks
    .flatMap((event) => event.linkedRecordIds)
    .filter((record) => record.type === "memory")
    .map((record) => record.id));
  const stopCursorAdvanced = input.cursorSessionDigests.includes(
    input.sessionDigest,
  );
  const writebackCommitted = currentWrittenMemoryIds.length > 0;
  const hookContexts = extractC5HookContextsFromTranscript({
    contentHashes: input.injectionSessionContentHashes,
    rawTranscript: input.rawTranscript,
  });

  if (input.rawTranscriptPersisted) {
    reasons.push("raw transcript persistence is enabled");
  }
  if (!stopCursorAdvanced) {
    reasons.push("native Stop did not advance the exact-session cursor");
  }
  if (input.writebackRequired && !writebackCommitted) {
    reasons.push("native Stop did not commit a memory record");
  }
  if (
    input.injectionSessionContentHashes.length > 0 &&
    hookContexts.length !== new Set(input.injectionSessionContentHashes).size
  ) {
    reasons.push(
      "actual injected hook context was not recoverable from the exact transcript",
    );
  }
  if (
    currentInjectionEvents.some((event) => event.decision === "injected") &&
    input.injectionSessionContentHashes.length === 0
  ) {
    reasons.push("injected hook context has no content-hash receipt");
  }

  if (input.memoryExpectation === "none") {
    if (expectedPriorMemoryIds.length > 0 || injectedRecordIds.length > 0) {
      reasons.push("no-history stage received durable memory context");
    }
  } else if (
    input.memoryExpectation === "required" &&
    recalledPriorMemoryIds.length === 0
  ) {
    reasons.push(
      "no required prior memory was injected into the fresh session",
    );
  }
  if (injectedRecordIds.some((id) => !expectedPriorMemoryIds.includes(id))) {
    reasons.push("fresh session received memory outside the same trajectory");
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    currentWrittenMemoryIds,
    hookContexts,
    injectedRecordIds,
    irrelevantInjection:
      input.memoryExpectation === "irrelevant-control" &&
      injectedRecordIds.length > 0,
    memoryChannelStatus: uniqueReasons.length === 0 ? "passed" : "failed",
    passed: uniqueReasons.length === 0,
    recalledPriorMemoryIds,
    reasons: uniqueReasons,
    stopCursorAdvanced,
    writebackCommitted,
  };
}

export function extractC5HookContextsFromTranscript(input: {
  contentHashes: readonly string[];
  rawTranscript: string;
}): C5HookContextEvidence[] {
  const expected = new Set(input.contentHashes);
  const matches = new Map<string, string>();
  for (const line of input.rawTranscript.split(/\r?\n/u)) {
    if (line.trim().length === 0) {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    collectHookInputText(value, expected, matches);
  }
  return [...matches.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([contentHash, content]) => ({
      content,
      contentByteLength: Buffer.byteLength(content, "utf8"),
      contentHash,
      contentSha256: sha256(content),
    }));
}

export function hashC5HookContext(content: string): string {
  return `content:${sha256(content).slice(0, 24)}`;
}

function collectHookInputText(
  value: unknown,
  expected: ReadonlySet<string>,
  matches: Map<string, string>,
): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  const item = value as Record<string, unknown>;
  if (item.type !== "response_item") {
    return;
  }
  const payload = item.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return;
  }
  const message = payload as Record<string, unknown>;
  if (
    message.type !== "message" ||
    (message.role !== "user" && message.role !== "developer") ||
    !Array.isArray(message.content)
  ) {
    return;
  }
  for (const block of message.content) {
    if (block === null || typeof block !== "object" || Array.isArray(block)) {
      continue;
    }
    const content = block as Record<string, unknown>;
    if (content.type !== "input_text" || typeof content.text !== "string") {
      continue;
    }
    const hash = hashC5HookContext(content.text);
    if (expected.has(hash) && !matches.has(hash)) {
      matches.set(hash, content.text);
    }
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
