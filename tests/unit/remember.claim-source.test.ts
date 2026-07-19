import { describe, expect, it } from "bun:test";

import { createGoodMemory } from "../../src/api/createGoodMemory";
import type { ClassifiedCandidate } from "../../src/remember/contracts";
import {
  buildConversationalMemoryExtractionPrompt,
  memoryExtractionResultSchema,
} from "../../src/provider/memory-extractor";
import {
  buildCandidateEvidence,
  buildFact,
  buildSourceMessageRecords,
  sourceMessageRecordUri,
} from "../../src/remember/builders";
import {
  SOURCE_MESSAGES_COLLECTION,
  type EvidenceRecord,
  type SourceMessageRecord,
} from "../../src/evidence/contracts";
import { createRecallProjectionRuntime } from "../../src/recall/projections/runtime";
import {
  CLAIM_PROJECTIONS_COLLECTION,
  CLAIM_PROJECTION_STATUS_COLLECTION,
  type ClaimProjection,
  type ClaimProjectionStatus,
} from "../../src/recall/projections/contracts";
import { createRememberEngine } from "../../src/remember/engine";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import { createMemoryRepositories } from "../../src/storage/repositories";

const NOW = "2026-07-16T12:00:00.000Z";
const scope = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

function buildCandidate(): ClassifiedCandidate {
  return {
    id: "candidate-1",
    kindHint: "fact",
    memoryType: "fact",
    decision: "write",
    score: 1,
    explicitness: "explicit",
    content: "Atlas uses the partner API.",
    sourceMessageIndex: 0,
    sourceMessageIndexes: [0, 1],
    sourceRole: "user",
    extractorIds: ["atomic-extractor-v2"],
    metadata: {
      category: "technical",
      contextualDescriptor: "Atlas integration architecture",
      subject: "Atlas",
      claim: {
        predicateKey: "integration.partner_api",
        objectText: "partner API",
        polarity: "positive",
        modality: "asserted",
        validFrom: "2026-07-15T09:00:00.000Z",
      },
    },
  };
}

describe("remember claim source provenance", () => {
  it("rejects a candidate when any cited source message is annotated remember-never", async () => {
    const rawStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      adapters: {
        documentStore: rawStore,
        sessionStore: createInMemorySessionStore(),
      },
      testing: {
        extractor: {
          async extract() {
            return { candidates: [buildCandidate()], ignoredMessageCount: 0 };
          },
        },
        now: () => new Date(NOW),
      },
    });

    const result = await memory.remember({
      scope,
      messages: [
        { role: "user", content: "Atlas uses the partner API." },
        { role: "assistant", content: "DO NOT STORE" },
      ],
      annotations: [{ messageIndex: 1, remember: "never" }],
    });

    expect(result.accepted).toBe(0);
    expect(await rawStore.query("facts", {})).toEqual([]);
    expect(await rawStore.query(SOURCE_MESSAGES_COLLECTION, {})).toEqual([]);
  });

  it("redacts every cited source message with that message's actual role", async () => {
    const rawStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      adapters: {
        documentStore: rawStore,
        sessionStore: createInMemorySessionStore(),
      },
      policy: {
        redact(candidate) {
          return candidate.sourceRole === "assistant"
            ? { ...candidate, content: "[assistant-redacted]" }
            : candidate;
        },
      },
      testing: {
        extractor: {
          async extract() {
            return { candidates: [buildCandidate()], ignoredMessageCount: 0 };
          },
        },
        now: () => new Date(NOW),
      },
    });

    await memory.remember({
      scope,
      messages: [
        { role: "user", content: "Atlas uses the partner API." },
        { role: "assistant", content: "assistant-sensitive-source" },
      ],
    });

    const sourceMessages = await rawStore.query<SourceMessageRecord>(
      SOURCE_MESSAGES_COLLECTION,
      { userId: scope.userId },
    );
    expect(sourceMessages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "user", content: "Atlas uses the partner API." },
      { role: "assistant", content: "[assistant-redacted]" },
    ]);
    expect(JSON.stringify(sourceMessages)).not.toContain("assistant-sensitive-source");
  });

  it("projects fallback fact claims with the evidence written by remember", async () => {
    const rawStore = createInMemoryDocumentStore();
    const candidate = buildCandidate();
    candidate.metadata = {
      category: candidate.metadata?.category,
      subject: candidate.metadata?.subject,
    };
    const projectionRuntime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    const repositories = createMemoryRepositories({
      documentStore: projectionRuntime.documentStore,
      sessionStore: createInMemorySessionStore(),
    });
    let nextId = 0;
    const engine = createRememberEngine({
      claimProjection: projectionRuntime,
      createId: () => `fallback-${++nextId}`,
      documentStore: projectionRuntime.documentStore,
      extractor: {
        async extract() {
          return { candidates: [candidate], ignoredMessageCount: 0 };
        },
      },
      now: () => NOW,
      repositories,
    });
    await projectionRuntime.ensureScopeIndexed(scope);

    const result = await engine.remember({
      scope,
      messages: [{ role: "user", content: "Atlas uses the partner API." }],
    });
    const factEvent = result.events.find(({ memoryType }) => memoryType === "fact")!;
    const claims = await rawStore.query<ClaimProjection>(
      CLAIM_PROJECTIONS_COLLECTION,
      { sourceMemoryId: factEvent.memoryId },
    );

    expect(claims).toHaveLength(1);
    expect(claims[0]?.evidenceIds).toEqual(factEvent.evidenceIds ?? []);
  });

  it("wires structured claims through the public API without losing message identity or observed time", async () => {
    const rawStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      adapters: {
        documentStore: rawStore,
        sessionStore: createInMemorySessionStore(),
      },
      testing: {
        createId: (() => {
          let nextId = 0;
          return () => `api-${++nextId}`;
        })(),
        extractor: {
          async extract() {
            return {
              candidates: [buildCandidate()],
              ignoredMessageCount: 0,
            };
          },
        },
        now: () => new Date(NOW),
      },
    });

    const result = await memory.remember({
      scope,
      messages: [{
        id: "api-message-1",
        role: "user",
        content: "Atlas uses the partner API.",
        observedAt: "2026-07-15T09:00:00.000Z",
      }],
    });
    const memoryId = result.events.find(({ memoryType }) => memoryType === "fact")
      ?.memoryId;
    const statuses = await rawStore.query<ClaimProjectionStatus>(
      CLAIM_PROJECTION_STATUS_COLLECTION,
      { sourceMemoryId: memoryId },
    );
    const rawMessages = await rawStore.query<SourceMessageRecord>(
      SOURCE_MESSAGES_COLLECTION,
      { sourceMessageId: "api-message-1" },
    );

    expect(statuses).toEqual([
      expect.objectContaining({
        extractorVersion: "atomic-extractor-v2",
        state: "projected",
      }),
    ]);
    expect(rawMessages).toEqual([
      expect.objectContaining({
        observedAt: "2026-07-15T09:00:00.000Z",
        sourceMessageId: "api-message-1",
      }),
    ]);
  });

  it("accepts structured claim metadata and asks the assisted extractor to keep it domain-general", () => {
    const parsed = memoryExtractionResultSchema.parse({
      candidates: [buildCandidate()],
      ignoredMessageCount: 0,
    });
    const prompt = buildConversationalMemoryExtractionPrompt({
      scope,
      messages: [{ role: "user", content: "Atlas uses the partner API." }],
    });

    expect(parsed.candidates[0]?.metadata?.claim).toEqual(
      buildCandidate().metadata?.claim,
    );
    expect(prompt).toContain("metadata.claim");
    expect(prompt).toContain("never from external labels");
    expect(prompt).toContain("sourceMessageIndexes");
  });

  it("builds immutable source records and evidence that points back to every source message", () => {
    const candidate = buildCandidate();
    const sourceMessages = buildSourceMessageRecords(
      scope,
      candidate,
      [
        {
          id: "message-1",
          role: "user",
          content: "Atlas uses the partner API.",
          observedAt: "2026-07-15T09:00:00.000Z",
        },
        {
          id: "message-2",
          role: "assistant",
          content: "Confirmed: partner API, not a spouse relationship.",
          observedAt: "2026-07-15T09:01:00.000Z",
        },
      ],
      NOW,
    );

    expect(sourceMessages).toHaveLength(2);
    expect(sourceMessages[0]).toMatchObject({
      ...scope,
      schemaVersion: 1,
      sourceMessageId: "message-1",
      role: "user",
      content: "Atlas uses the partner API.",
      observedAt: "2026-07-15T09:00:00.000Z",
      ingestedAt: NOW,
    });
    expect(sourceMessages[0]?.contentSha256).toMatch(/^[a-f0-9]{64}$/u);

    const evidence = buildCandidateEvidence(
      scope,
      candidate,
      "fact-1",
      "evidence-1",
      NOW,
      "en-US",
      sourceMessages,
    );

    expect(evidence.sourceUri).toBe(sourceMessageRecordUri(sourceMessages[0]!));
    expect(evidence.sourceMessageIds).toEqual(["message-1", "message-2"]);
    expect(evidence.excerpt).toBe("Atlas uses the partner API.");
  });

  it("keeps canonical fact content atomic while storing descriptors only in the claim index", async () => {
    const rawStore = createInMemoryDocumentStore();
    const projectionRuntime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    const repositories = createMemoryRepositories({
      documentStore: projectionRuntime.documentStore,
      sessionStore: createInMemorySessionStore(),
    });
    const candidate = buildCandidate();
    let nextId = 0;
    const engine = createRememberEngine({
      claimProjection: projectionRuntime,
      createId: () => `generated-${++nextId}`,
      documentStore: projectionRuntime.documentStore,
      extractor: {
        async extract() {
          return { candidates: [candidate], ignoredMessageCount: 0 };
        },
      },
      now: () => NOW,
      repositories,
    });

    const result = await engine.remember({
      scope,
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Atlas uses the partner API.",
          observedAt: "2026-07-15T09:00:00.000Z",
        },
        {
          id: "message-2",
          role: "assistant",
          content: "Confirmed: partner API, not a spouse relationship.",
          observedAt: "2026-07-15T09:01:00.000Z",
        },
      ],
    });

    const factEvent = result.events.find((event) => event.memoryType === "fact");
    const fact = await rawStore.get<{ content: string; validFrom?: string }>(
      "facts",
      factEvent!.memoryId!,
    );
    expect(fact).toMatchObject({
      content: "Atlas uses the partner API.",
      validFrom: "2026-07-15T09:00:00.000Z",
    });
    expect(fact?.content).not.toContain("Atlas integration architecture");

    const rawMessages = await rawStore.query<SourceMessageRecord>(
      SOURCE_MESSAGES_COLLECTION,
      { userId: scope.userId },
    );
    expect(rawMessages.map(({ sourceMessageId }) => sourceMessageId).sort()).toEqual([
      "message-1",
      "message-2",
    ]);

    const evidence = await rawStore.get<EvidenceRecord>(
      "evidence",
      factEvent!.evidenceIds![0]!,
    );
    expect(evidence?.sourceUri).toMatch(/^goodmemory:\/\/source-messages\//u);
    expect(evidence?.sourceMessageIds).toEqual(["message-1", "message-2"]);

    expect(await projectionRuntime.queryClaims(scope)).toEqual([
      expect.objectContaining({
        sourceMemoryId: factEvent!.memoryId,
        subjectEntityId: expect.any(String),
        predicateKey: "integration.partner_api",
        objectText: "partner API",
        contextualDescriptor: "Atlas integration architecture",
        sourceMessageIds: ["message-1", "message-2"],
        evidenceIds: factEvent!.evidenceIds,
        extractorVersion: "atomic-extractor-v2",
      }),
    ]);
  });

  it("maps structured validity into FactMemory without changing its content", () => {
    const fact = buildFact(scope, buildCandidate(), "fact-1", NOW, "en-US");

    expect(fact.content).toBe("Atlas uses the partner API.");
    expect(fact.validFrom).toBe("2026-07-15T09:00:00.000Z");
  });

  it("preserves raw evidence and records an unstructured projection when assisted extraction fails", async () => {
    const rawStore = createInMemoryDocumentStore();
    const projectionRuntime = createRecallProjectionRuntime({
      documentStore: rawStore,
      now: () => NOW,
    });
    const repositories = createMemoryRepositories({
      documentStore: projectionRuntime.documentStore,
      sessionStore: createInMemorySessionStore(),
    });
    let nextId = 0;
    const engine = createRememberEngine({
      assistedExtractor: {
        async extract() {
          throw new Error("provider unavailable");
        },
      },
      claimProjection: projectionRuntime,
      createId: () => `fallback-${++nextId}`,
      documentStore: projectionRuntime.documentStore,
      now: () => NOW,
      repositories,
    });

    const result = await engine.remember({
      extractionStrategy: "llm-assisted",
      scope,
      messages: [{
        id: "message-fallback",
        role: "user",
        content: "Remember that the Atlas migration is blocked on review.",
        observedAt: "2026-07-15T10:00:00.000Z",
      }],
    });
    const factEvent = result.events.find((event) => event.memoryType === "fact");
    await projectionRuntime.ensureScopeIndexed(scope);

    expect(result.warnings).toContain("assisted_extraction_failed");
    expect(await rawStore.query(SOURCE_MESSAGES_COLLECTION, {
      sourceMessageId: "message-fallback",
    })).toHaveLength(1);
    expect(await projectionRuntime.queryClaims(scope)).toEqual([
      expect.objectContaining({
        sourceMemoryId: factEvent?.memoryId,
        sourceMessageIds: ["message-fallback"],
      }),
    ]);
    expect(await rawStore.query<ClaimProjectionStatus>(
      CLAIM_PROJECTION_STATUS_COLLECTION,
      { sourceMemoryId: factEvent?.memoryId },
    )).toEqual([
      expect.objectContaining({ state: "unstructured" }),
    ]);
  });
});
