import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import { createFactMemory, createFeedbackMemory } from "../../src/domain/records";
import { createMemorySource } from "../../src/domain/provenance";
import {
  createExperienceRecord,
  createLearningProposal,
  createPromotionRecord,
} from "../../src/evolution/contracts";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";

describe("public maintenance API", () => {
  it("runs dream orchestration through GoodMemory and applies low-risk maintenance jobs", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore,
      },
      testing: {
        now: () => new Date("2026-04-17T00:00:00.000Z"),
      },
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a" } as const;

    await documentStore.set(
      "facts",
      "fact-1",
      createFactMemory({
        id: "fact-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      }),
    );
    await documentStore.set(
      "facts",
      "fact-2",
      createFactMemory({
        id: "fact-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow is blocked on prod migration.",
        source: { method: "explicit", extractedAt: "2026-04-02T00:00:00.000Z" },
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      }),
    );

    const result = await memory.runMaintenance({
      scope,
      jobs: ["dedupe"],
    });

    expect(result.ran).toBe(true);
    expect(result.reason).toBe("completed");
    expect(result.maintenance?.jobs).toEqual([{ name: "dedupe", applied: 1 }]);

    const exported = await memory.exportMemory({ scope });
    expect(exported.durable.facts.filter((fact) => fact.lifecycle === "active")).toHaveLength(1);
    expect(exported.durable.facts.filter((fact) => fact.lifecycle === "superseded")).toHaveLength(1);
  });

  it("uses the public maintenance entrypoint to run reviewer, gate, and compiler passes", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore,
      },
      testing: {
        now: () => new Date("2026-04-17T00:00:00.000Z"),
      },
    });
    const scope = { userId: "u-1", workspaceId: "workspace-a", agentId: "agent-a" } as const;

    await documentStore.set(
      "feedback",
      "feedback-source",
      createFeedbackMemory({
        id: "feedback-source",
        userId: "u-1",
        workspaceId: "workspace-a",
        agentId: "agent-a",
        rule: "Use bullet points in summaries.",
        kind: "do",
        appliesTo: "general_response",
        source: createMemorySource({
          method: "explicit",
          extractedAt: "2026-04-01T00:00:00.000Z",
        }),
        updatedAt: "2026-04-01T00:00:00.000Z",
      }),
    );
    await documentStore.set(
      "feedback",
      "feedback-accepted",
      createFeedbackMemory({
        id: "feedback-accepted",
        userId: "u-1",
        workspaceId: "workspace-a",
        agentId: "agent-a",
        rule: "Start reviews with findings first.",
        kind: "do",
        appliesTo: "code_review",
        source: createMemorySource({
          method: "explicit",
          extractedAt: "2026-04-03T00:00:00.000Z",
        }),
        updatedAt: "2026-04-03T00:00:00.000Z",
      }),
    );
    await documentStore.set(
      "experiences",
      "xp-1",
      createExperienceRecord({
        id: "xp-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        agentId: "agent-a",
        kind: "feedback",
        traceId: "trace-1",
        trigger: "api",
        summary: "Feedback confirmed bullet summaries.",
        outcome: "success",
        linkedMemoryIds: ["feedback-source"],
        createdAt: "2026-04-10T00:00:00.000Z",
      }),
    );
    await documentStore.set(
      "experiences",
      "xp-2",
      createExperienceRecord({
        id: "xp-2",
        userId: "u-1",
        workspaceId: "workspace-a",
        agentId: "agent-a",
        kind: "feedback",
        traceId: "trace-2",
        trigger: "api",
        summary: "Feedback confirmed bullet summaries again.",
        outcome: "success",
        linkedMemoryIds: ["feedback-source"],
        createdAt: "2026-04-11T00:00:00.000Z",
      }),
    );
    await documentStore.set(
      "learning_proposals",
      "proposal-accepted",
      createLearningProposal({
        id: "proposal-accepted",
        userId: "u-1",
        workspaceId: "workspace-a",
        agentId: "agent-a",
        proposalType: "procedural_pattern",
        status: "accepted",
        traceId: "proposal-trace-accepted",
        summary: "Promote stable review opening guidance.",
        rationale: "Accepted through earlier deterministic review.",
        linkedMemoryIds: ["feedback-accepted"],
        sourceExperienceIds: ["xp-accepted-1", "xp-accepted-2"],
        createdAt: "2026-04-15T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
      }),
    );
    await documentStore.set(
      "promotion_records",
      "promotion-accepted",
      createPromotionRecord({
        id: "promotion-accepted",
        proposalId: "proposal-accepted",
        userId: "u-1",
        workspaceId: "workspace-a",
        agentId: "agent-a",
        decision: "accepted",
        traceId: "promotion-trace-accepted",
        summary: "accepted proposal: Promote stable review opening guidance.",
        rationale: "proposal passed deterministic gates",
        linkedMemoryIds: ["feedback-accepted"],
        sourceExperienceIds: ["xp-accepted-1", "xp-accepted-2"],
        policyOutcome: "passed",
        verificationOutcome: "passed",
        evalOutcome: "passed",
        createdAt: "2026-04-16T00:00:00.000Z",
        decidedAt: "2026-04-16T00:00:00.000Z",
      }),
    );

    const result = await memory.runMaintenance({
      scope,
      jobs: [],
    });

    expect(result.ran).toBe(true);
    expect(result.proposalCount).toBe(1);
    expect(result.promotionDecisionCounts).toEqual({ accepted: 1 });
    expect(result.compiledCount).toBe(2);

    const exported = await memory.exportMemory({ scope });
    expect(
      exported.durable.proposals.some(
        (proposal) =>
          proposal.proposalType === "procedural_pattern" &&
          proposal.linkedMemoryIds.includes("feedback-source") &&
          proposal.status === "accepted",
      ),
    ).toBe(true);
    expect(
      exported.durable.feedback.some(
        (record) =>
          record.kind === "validated_pattern" &&
          record.rule === "Start reviews with findings first." &&
          record.lifecycle === "active",
      ),
    ).toBe(true);
  });

  it("does not share overlap locks across independent GoodMemory instances", async () => {
    const scope = { userId: "u-1", workspaceId: "workspace-a" } as const;
    const createIsolatedMemory = async (factId: string) => {
      const documentStore = createInMemoryDocumentStore();
      const sessionStore = createInMemorySessionStore();
      const memory = createGoodMemory({
        storage: { provider: "memory" },
        adapters: {
          documentStore,
          sessionStore,
        },
        testing: {
          now: () => new Date("2026-04-17T00:00:00.000Z"),
        },
      });

      await documentStore.set(
        "facts",
        factId,
        createFactMemory({
          id: factId,
          userId: "u-1",
          workspaceId: "workspace-a",
          category: "project",
          content: "Robot workflow is blocked on prod migration.",
          source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        }),
      );

      return memory;
    };

    const [left, right] = await Promise.all([
      createIsolatedMemory("fact-left"),
      createIsolatedMemory("fact-right"),
    ]);

    const [leftResult, rightResult] = await Promise.all([
      left.runMaintenance({ scope, jobs: ["dedupe"] }),
      right.runMaintenance({ scope, jobs: ["dedupe"] }),
    ]);

    expect(leftResult.ran).toBe(true);
    expect(leftResult.reason).toBe("completed");
    expect(rightResult.ran).toBe(true);
    expect(rightResult.reason).toBe("completed");
  });

  it("propagates env-resolved embedding adapters into maintenance jobs", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const vectorStore = createInMemoryVectorStore();
    const originalFetch = globalThis.fetch;
    const originalProvider = process.env.GOODMEMORY_EMBEDDING_PROVIDER;
    const originalModel = process.env.GOODMEMORY_EMBEDDING_MODEL;
    const originalApiKey = process.env.GOODMEMORY_EMBEDDING_API_KEY;
    const originalBaseURL = process.env.GOODMEMORY_EMBEDDING_BASE_URL;
    const requests: string[] = [];

    process.env.GOODMEMORY_EMBEDDING_PROVIDER = "openai";
    process.env.GOODMEMORY_EMBEDDING_MODEL = "text-embedding-3-small";
    process.env.GOODMEMORY_EMBEDDING_API_KEY = "test-key";
    process.env.GOODMEMORY_EMBEDDING_BASE_URL = "https://embedding.test/v1";

    globalThis.fetch = (async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      requests.push(url);

      const payload = init?.body ? JSON.parse(String(init.body)) as { input?: string | string[] } : {};
      const values = Array.isArray(payload.input)
        ? payload.input
        : payload.input
          ? [payload.input]
          : [];

      return new Response(
        JSON.stringify({
          object: "list",
          data: values.map((value, index) => ({
            object: "embedding",
            index,
            embedding: value.includes("vendor approval") ? [1, 0, 0] : [0, 0, 1],
          })),
          model: "text-embedding-3-small",
          usage: {
            prompt_tokens: values.length,
            total_tokens: values.length,
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }) as typeof fetch;

    try {
      const memory = createGoodMemory({
        storage: { provider: "memory" },
        adapters: {
          documentStore,
          sessionStore,
          vectorStore,
        },
        testing: {
          now: () => new Date("2026-04-17T00:00:00.000Z"),
        },
      });
      const scope = { userId: "u-env-maintenance", workspaceId: "workspace-a" } as const;

      await documentStore.set(
        "facts",
        "fact-env-maintenance",
        createFactMemory({
          id: "fact-env-maintenance",
          userId: scope.userId,
          workspaceId: scope.workspaceId,
          category: "project",
          content: "Runtime rollout is blocked on vendor approval.",
          source: { method: "explicit", extractedAt: "2026-04-01T00:00:00.000Z" },
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        }),
      );

      const result = await memory.runMaintenance({
        scope,
        jobs: ["embeddingRepair"],
      });

      expect(result.ran).toBe(true);
      expect(result.reason).toBe("completed");
      expect(result.maintenance?.jobs).toEqual([{ name: "embeddingRepair", applied: 1 }]);
      expect(requests.some((url) => url.includes("/embeddings"))).toBe(true);
      expect(await vectorStore.get("facts", "fact-env-maintenance")).toEqual(
        expect.objectContaining({
          id: "fact-env-maintenance",
          embedding: [1, 0, 0],
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalProvider === undefined) {
        delete process.env.GOODMEMORY_EMBEDDING_PROVIDER;
      } else {
        process.env.GOODMEMORY_EMBEDDING_PROVIDER = originalProvider;
      }
      if (originalModel === undefined) {
        delete process.env.GOODMEMORY_EMBEDDING_MODEL;
      } else {
        process.env.GOODMEMORY_EMBEDDING_MODEL = originalModel;
      }
      if (originalApiKey === undefined) {
        delete process.env.GOODMEMORY_EMBEDDING_API_KEY;
      } else {
        process.env.GOODMEMORY_EMBEDDING_API_KEY = originalApiKey;
      }
      if (originalBaseURL === undefined) {
        delete process.env.GOODMEMORY_EMBEDDING_BASE_URL;
      } else {
        process.env.GOODMEMORY_EMBEDDING_BASE_URL = originalBaseURL;
      }
    }
  });
});
