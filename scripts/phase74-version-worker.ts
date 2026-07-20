import { pathToFileURL } from "node:url";
import { join } from "node:path";

import type { AISDKModelConfig } from "../src/provider/ai-sdk-runtime";
import { createLexicalCoverageReranker } from "../src/recall/reranker";
import { buildPhase74LabelFreeScope } from "../src/eval/phase74FullRuntime";
import {
  parsePhase74VersionWorkerInput,
  type Phase74VersionWorkerInput,
} from "../src/eval/phase74VersionBaseline";

interface Phase74VersionEvidence {
  id: string;
  linkedMemoryIds: readonly string[];
  sourceMessageIds: readonly string[];
}

interface Phase74VersionFact {
  content: string;
  id: string;
}

interface Phase74VersionRememberInput {
  annotations: Array<{
    confirmed: boolean;
    kindHint: "fact";
    messageIndex: number;
    reason: string;
    remember: "always";
    verified: boolean;
  }>;
  extractionStrategy: "llm-assisted";
  messages: Array<{
    content: string;
    id: string;
    observedAt: string;
    role: "assistant" | "user";
  }>;
  scope: { sessionId?: string; userId: string; workspaceId?: string };
}

export interface Phase74VersionGoodMemory {
  exportMemory(input: {
    scope: { userId: string; workspaceId?: string };
  }): Promise<{
    durable: {
      evidence: Phase74VersionEvidence[];
      facts: Phase74VersionFact[];
    };
  }>;
  recall(input: {
    includeEvidence: true;
    locale?: string;
    query: string;
    scope: { userId: string; workspaceId?: string };
    strategy: "hybrid";
  }): Promise<{
    evidence: Phase74VersionEvidence[];
    facts: Phase74VersionFact[];
    metadata: { latencyMs: number };
  }>;
  remember(input: Phase74VersionRememberInput): Promise<{
    accepted: number;
    rejected: number;
    warnings?: string[];
  }>;
}

export type Phase74VersionCreateGoodMemory = (
  config: unknown,
) => Phase74VersionGoodMemory;

export interface Phase74VersionWorkerResult {
  arm: Phase74VersionWorkerInput["arm"];
  caseId: string;
  ingestionLatencyMs: number;
  recallLatencyMs: number;
  retrievedMemories: Array<{
    content: string;
    id: string;
    sourceIds: string[];
  }>;
  schemaVersion: 1;
  sourceCommit: string;
  storedMemories: Array<{
    content: string;
    id: string;
    sourceIds: string[];
  }>;
}

function isoDate(value: string | undefined): string {
  const parsed = new Date(value ?? 0);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid Phase 74 version-worker time: ${value}.`);
  }
  return parsed.toISOString();
}

function sessionId(sourceId: string): string {
  return sourceId.match(/^(D\d+):/u)?.[1] ?? sourceId;
}

function contextItems(input: {
  evidence: readonly Phase74VersionEvidence[];
  facts: readonly Phase74VersionFact[];
  sourceIdsByMessageId: ReadonlyMap<string, readonly string[]>;
}): Phase74VersionWorkerResult["retrievedMemories"] {
  const sourceIdsByMemoryId = new Map<string, Set<string>>();
  for (const evidence of input.evidence) {
    const sourceIds = evidence.sourceMessageIds.flatMap(
      (messageId) => input.sourceIdsByMessageId.get(messageId) ?? [messageId],
    );
    for (const memoryId of evidence.linkedMemoryIds) {
      const existing = sourceIdsByMemoryId.get(memoryId) ?? new Set<string>();
      sourceIds.forEach((sourceId) => existing.add(sourceId));
      sourceIdsByMemoryId.set(memoryId, existing);
    }
  }
  return input.facts.map((fact) => ({
    content: fact.content,
    id: fact.id,
    sourceIds: [...(sourceIdsByMemoryId.get(fact.id) ?? [])],
  }));
}

export async function loadPhase74VersionCreateGoodMemory(
  sourceRoot: string,
): Promise<Phase74VersionCreateGoodMemory> {
  const module = await import(
    pathToFileURL(join(sourceRoot, "src", "index.ts")).href
  ) as { createGoodMemory?: unknown };
  if (typeof module.createGoodMemory !== "function") {
    throw new Error("Phase 74 version source has no createGoodMemory export.");
  }
  return module.createGoodMemory as Phase74VersionCreateGoodMemory;
}

export async function runPhase74VersionWorker(input: {
  createGoodMemory: Phase74VersionCreateGoodMemory;
  input: Phase74VersionWorkerInput;
  models: {
    embedding: AISDKModelConfig;
    extraction: AISDKModelConfig;
  };
  now?: () => number;
  sqlitePath: string;
}): Promise<Phase74VersionWorkerResult> {
  const workerInput = parsePhase74VersionWorkerInput(input.input);
  const now = input.now ?? (() => performance.now());
  const memory = input.createGoodMemory({
    adapters: { reranker: createLexicalCoverageReranker() },
    providers: {
      embedding: input.models.embedding,
      extraction: {
        ...input.models.extraction,
        contextualDescriptors: true,
        mode: "conversational",
      },
    },
    remember: {
      profiles: [{
        assistantOutputs: { mode: "confirmed_or_verified_only" },
        id: "external-evidence",
      }],
    },
    retrieval: { preset: "recommended" },
    storage: { provider: "sqlite", url: input.sqlitePath },
    testing: {
      now: () => new Date(isoDate(workerInput.referenceTime)),
    },
  });
  const scope = buildPhase74LabelFreeScope(workerInput);
  const groups = new Map<string, typeof workerInput.rawEvidence>();
  for (const item of workerInput.rawEvidence) {
    const group = sessionId(item.sourceIds[0] ?? "source");
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  const ingestionStartedAt = now();
  for (const [group, items] of groups) {
    const messages = items.map((item) => ({
      content: item.content,
      id: item.id,
      observedAt: isoDate(item.observedAt ?? workerInput.referenceTime),
      role: item.role === "assistant" ? "assistant" as const : "user" as const,
    }));
    const remembered = await memory.remember({
      annotations: messages.map((_, messageIndex) => ({
        confirmed: true,
        kindHint: "fact" as const,
        messageIndex,
        reason: "Preserve immutable external benchmark evidence.",
        remember: "always" as const,
        verified: true,
      })),
      extractionStrategy: "llm-assisted",
      messages,
      scope: { ...scope, sessionId: group },
    });
    if (remembered.warnings?.includes("assisted_extraction_failed")) {
      throw new Error("Phase 74 release assisted extraction failed.");
    }
  }
  const ingestionLatencyMs = Math.max(0, now() - ingestionStartedAt);
  const recalled = await memory.recall({
    includeEvidence: true,
    ...(workerInput.locale === undefined ? {} : { locale: workerInput.locale }),
    query: workerInput.question,
    scope,
    strategy: "hybrid",
  });
  const exported = await memory.exportMemory({ scope });
  const sourceIdsByMessageId = new Map(
    workerInput.rawEvidence.map((item) => [item.id, item.sourceIds] as const),
  );
  return {
    arm: workerInput.arm,
    caseId: workerInput.caseId,
    ingestionLatencyMs,
    recallLatencyMs: recalled.metadata.latencyMs,
    retrievedMemories: contextItems({
      evidence: recalled.evidence,
      facts: recalled.facts.slice(0, 12),
      sourceIdsByMessageId,
    }),
    schemaVersion: 1,
    sourceCommit: workerInput.sourceCommit,
    storedMemories: contextItems({
      evidence: exported.durable.evidence,
      facts: exported.durable.facts,
      sourceIdsByMessageId,
    }),
  };
}
