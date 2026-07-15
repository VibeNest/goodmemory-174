import { z } from "zod";

import type {
  NativeCanaryInjectionEvent,
  NativeCanaryWritebackEvent,
} from "./native-canary-contracts";

const writebackConfigSchema = z.object({
  mode: z.string(),
  persistRawTranscript: z.boolean(),
}).passthrough();

const hostStatusSchema = z.object({
  hookRegistered: z.boolean(),
  host: z.literal("codex"),
  mcpRegistered: z.boolean(),
  workspaceStatus: z.string(),
  writeback: writebackConfigSchema,
}).passthrough();

const statusSchema = z.object({
  hosts: z.array(hostStatusSchema).length(1),
}).passthrough();

const rememberSchema = z.object({
  accepted: z.number().int().nonnegative(),
  events: z.array(z.object({
    memoryId: z.string().min(1).optional(),
    outcome: z.string(),
  }).passthrough()),
  rejected: z.number().int().nonnegative(),
}).passthrough();

const injectionEventSchema = z.object({
  command: z.enum(["session-start", "user-prompt-submit"]),
  decision: z.enum(["duplicate_context", "injected", "low_relevance"]),
  recordIds: z.array(z.string()),
  sessionDigest: z.string().optional(),
}).passthrough();

const injectionStateSchema = z.object({
  events: z.array(injectionEventSchema),
  version: z.literal(1),
}).passthrough();

const cursorStateSchema = z.object({
  cursors: z.record(z.string(), z.object({
    offset: z.number().finite().positive(),
    updatedAt: z.string(),
  }).passthrough()),
  version: z.literal(1),
}).passthrough();

const writebackEventSchema = z.object({
  command: z.string(),
  contentPreview: z.string(),
  linkedRecordIds: z.array(z.object({
    id: z.string(),
    type: z.string(),
  }).passthrough()),
  recallHitCount: z.number().int().nonnegative(),
  recalledBy: z.array(z.object({
    sessionDigest: z.string(),
  }).passthrough()),
  sessionDigest: z.string().optional(),
  status: z.string(),
}).passthrough();

const writebackInspectionSchema = z.object({
  events: z.array(writebackEventSchema),
  host: z.literal("codex"),
}).passthrough();

export function parseNativeCanaryStatus(raw: string): {
  hookRegistered: boolean;
  mcpRegistered: boolean;
  workspaceStatus: string;
  writeback: { mode: string; persistRawTranscript: boolean };
} {
  const parsed = parseExternalJson(raw, statusSchema, "native canary status");
  const host = parsed.hosts[0]!;
  return {
    hookRegistered: host.hookRegistered,
    mcpRegistered: host.mcpRegistered,
    workspaceStatus: host.workspaceStatus,
    writeback: {
      mode: host.writeback.mode,
      persistRawTranscript: host.writeback.persistRawTranscript,
    },
  };
}

export function parseNativeCanaryRememberResult(raw: string): {
  accepted: number;
  memoryId: string;
  rejected: number;
} {
  const parsed = parseExternalJson(
    raw,
    rememberSchema,
    "native canary remember result",
  );
  const written = parsed.events.find((event) =>
    event.outcome === "written" && event.memoryId !== undefined
  );
  if (!written?.memoryId || parsed.accepted < 1) {
    throw new Error("native canary remember result has no written memory id");
  }
  return {
    accepted: parsed.accepted,
    memoryId: written.memoryId,
    rejected: parsed.rejected,
  };
}

export function parseNativeCanaryInjectionState(
  raw: string,
): NativeCanaryInjectionEvent[] {
  const parsed = parseExternalJson(
    raw,
    injectionStateSchema,
    "native canary injection state",
  );
  return parsed.events.map((event) => ({
    command: event.command,
    decision: event.decision,
    recordIds: event.recordIds,
    ...(event.sessionDigest ? { sessionDigest: event.sessionDigest } : {}),
  }));
}

export function parseNativeCanaryCursorState(raw: string): string[] {
  const parsed = parseExternalJson(
    raw,
    cursorStateSchema,
    "native canary transcript cursor state",
  );
  return Object.keys(parsed.cursors).sort();
}

export function parseNativeCanaryWritebackInspection(
  raw: string,
): NativeCanaryWritebackEvent[] {
  const parsed = parseExternalJson(
    raw,
    writebackInspectionSchema,
    "native canary writeback inspection",
  );
  return parsed.events.map((event) => ({
    command: event.command,
    contentPreview: event.contentPreview,
    linkedRecordIds: event.linkedRecordIds.map(({ id, type }) => ({ id, type })),
    recallHitCount: event.recallHitCount,
    recalledBy: event.recalledBy.map(({ sessionDigest }) => ({ sessionDigest })),
    ...(event.sessionDigest ? { sessionDigest: event.sessionDigest } : {}),
    status: event.status,
  }));
}

function parseExternalJson<T>(
  raw: string,
  schema: z.ZodType<T>,
  label: string,
): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".") ?? "root";
    throw new Error(`${label} failed schema validation at ${path}`);
  }
  return result.data;
}
