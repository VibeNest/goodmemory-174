import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface CodexTranscriptAudit {
  codexVersion: string;
  conversationMessageCount: number;
  formatDrift: null;
  lineCount: number;
  sanitizedSha256: string;
  sessionId: string;
  sourceSha256: string;
}

export function auditAndSanitizeCodexTranscript(input: {
  codexVersion: string;
  raw: string;
  threadId: string;
}): { audit: CodexTranscriptAudit; sanitizedJsonl: string } {
  const sanitized: Record<string, unknown>[] = [];
  let conversationMessageCount = 0;
  let sessionId: string | null = null;
  let lineCount = 0;

  for (const [lineIndex, line] of input.raw.split(/\r?\n/u).entries()) {
    if (line.trim().length === 0) {
      continue;
    }
    lineCount += 1;
    const parsed = parseLine(line, lineIndex + 1);
    if (parsed.type === "session_meta") {
      const payload = requireRecord(parsed.payload, lineIndex + 1, "session_meta payload");
      if (typeof payload.id !== "string") {
        throw drift(lineIndex + 1, "session_meta payload.id must be a string");
      }
      sessionId = payload.id;
      sanitized.push({ payload: { id: payload.id }, type: "session_meta" });
      continue;
    }
    if (parsed.type !== "response_item") {
      continue;
    }
    const payload = requireRecord(parsed.payload, lineIndex + 1, "response_item payload");
    if (payload.type !== "message") {
      continue;
    }
    if (payload.role !== "user" && payload.role !== "assistant") {
      continue;
    }
    if (!Array.isArray(payload.content)) {
      throw drift(lineIndex + 1, "response_item message content must be an array");
    }
    const expectedBlockType = payload.role === "user" ? "input_text" : "output_text";
    const redactedText = payload.role === "user"
      ? "<redacted-user-text>"
      : "<redacted-assistant-text>";
    const textBlocks: Array<{
      length: number;
      text: string;
      textSha256: string;
      type: string;
    }> = [];
    for (const block of payload.content) {
      const record = requireRecord(block, lineIndex + 1, "message content block");
      if (typeof record.type !== "string") {
        throw drift(lineIndex + 1, "message content block type must be a string");
      }
      if (record.type !== expectedBlockType) {
        continue;
      }
      if (typeof record.text !== "string") {
        throw drift(lineIndex + 1, `${expectedBlockType} text must be a string`);
      }
      textBlocks.push({
        length: record.text.length,
        text: redactedText,
        textSha256: sha256(record.text),
        type: record.type,
      });
    }
    if (textBlocks.length === 0) {
      throw drift(lineIndex + 1, `message must contain ${expectedBlockType}`);
    }
    conversationMessageCount += 1;
    sanitized.push({
      payload: { content: textBlocks, role: payload.role, type: "message" },
      type: "response_item",
    });
  }

  if (sessionId === null) {
    throw new Error("Codex transcript does not contain session_meta payload.id");
  }
  if (sessionId !== input.threadId) {
    throw new Error("Codex transcript session id does not match thread.started");
  }
  const sanitizedJsonl = sanitized.map((row) => JSON.stringify(row)).join("\n") + "\n";
  return {
    audit: {
      codexVersion: input.codexVersion,
      conversationMessageCount,
      formatDrift: null,
      lineCount,
      sanitizedSha256: sha256(sanitizedJsonl),
      sessionId,
      sourceSha256: sha256(input.raw),
    },
    sanitizedJsonl,
  };
}

export async function findCodexTranscriptByThreadId(input: {
  sessionsRoot: string;
  threadId: string;
}): Promise<string> {
  if (!/^[A-Za-z0-9-]+$/u.test(input.threadId)) {
    throw new Error("Codex thread id is not path-safe");
  }
  const matches: string[] = [];
  await walk(input.sessionsRoot, 0, async (path, name) => {
    if (name.endsWith(`-${input.threadId}.jsonl`)) {
      matches.push(path);
    }
  });
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one Codex transcript for thread ${input.threadId}; found ${matches.length}`,
    );
  }
  return matches[0]!;
}

async function walk(
  directory: string,
  depth: number,
  visit: (path: string, name: string) => Promise<void>,
): Promise<void> {
  if (depth > 4) {
    return;
  }
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path, depth + 1, visit);
    } else if (entry.isFile()) {
      await visit(path, entry.name);
    }
  }
}

function parseLine(line: string, lineNumber: number): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw drift(lineNumber, "line is not valid JSON");
  }
  return requireRecord(parsed, lineNumber, "line");
}

function requireRecord(
  value: unknown,
  lineNumber: number,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw drift(lineNumber, `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function drift(lineNumber: number, reason: string): Error {
  return new Error(`Codex transcript format drift at line ${lineNumber}: ${reason}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
