import { describe, expect, it, spyOn } from "bun:test";
import {
  createGoodMemory,
  type GoodMemoryTraceSpan,
} from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("observability trace sink", () => {
  it("uses a private per-instance scope digest secret by default", async () => {
    const firstSpans: GoodMemoryTraceSpan[] = [];
    const secondSpans: GoodMemoryTraceSpan[] = [];
    const scope = {
      userId: "low-entropy@example.com",
      workspaceId: "default",
      sessionId: "morning",
    };

    const first = createGoodMemory({
      storage: { provider: "memory" },
      observability: {
        traceSink: {
          emit(span) {
            firstSpans.push(span);
          },
        },
      },
    });
    const second = createGoodMemory({
      storage: { provider: "memory" },
      observability: {
        traceSink: {
          emit(span) {
            secondSpans.push(span);
          },
        },
      },
    });

    await first.remember({
      scope,
      messages: [{ role: "user", content: "Remember that I prefer brief updates." }],
    });
    await second.remember({
      scope,
      messages: [{ role: "user", content: "Remember that I prefer brief updates." }],
    });

    expect(firstSpans[0]?.scopeDigest.userIdHash).toStartWith("hmac-sha256:");
    expect(secondSpans[0]?.scopeDigest.userIdHash).toStartWith("hmac-sha256:");
    expect(firstSpans[0]?.scopeDigest.userIdHash).not.toBe(
      secondSpans[0]?.scopeDigest.userIdHash,
    );
    expect(firstSpans[0]?.scopeDigest.workspaceIdHash).not.toBe(
      secondSpans[0]?.scopeDigest.workspaceIdHash,
    );
  });

  it("allows explicit scope digest secrets for stable trusted correlation", async () => {
    const firstSpans: GoodMemoryTraceSpan[] = [];
    const secondSpans: GoodMemoryTraceSpan[] = [];
    const scope = { userId: "stable@example.com", workspaceId: "workspace-a" };

    for (const spans of [firstSpans, secondSpans]) {
      const memory = createGoodMemory({
        storage: { provider: "memory" },
        observability: {
          scopeDigestSecret: "trusted-install-secret-for-tests",
          traceSink: {
            emit(span) {
              spans.push(span);
            },
          },
        },
      });
      await memory.remember({
        scope,
        messages: [{ role: "user", content: "Remember stable trace correlation." }],
      });
    }

    expect(firstSpans[0]?.scopeDigest.userIdHash).toBe(
      secondSpans[0]?.scopeDigest.userIdHash,
    );
    expect(firstSpans[0]?.scopeDigest.workspaceIdHash).toBe(
      secondSpans[0]?.scopeDigest.workspaceIdHash,
    );
  });

  it("emits redaction-safe spans for the core memory API", async () => {
    const spans: GoodMemoryTraceSpan[] = [];
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      observability: {
        traceSink: {
          emit(span) {
            spans.push(span);
          },
        },
      },
      testing: {
        now: () => new Date("2026-04-25T00:00:00.000Z"),
      },
    });
    const scope = {
      userId: "raw-user-id",
      workspaceId: "raw-workspace-id",
      sessionId: "raw-session-id",
    };

    const remember = await memory.remember({
      scope,
      messages: [
        {
          role: "user",
          content:
            "Remember that my private launch token is sk-raw-secret and my preferred editor is Cursor.",
        },
      ],
    });
    const recall = await memory.recall({
      scope,
      query: "What editor should I use?",
      retrievalProfile: "general_chat",
    });
    const context = await memory.buildContext({
      recall,
      output: "system_prompt_fragment",
    });
    const feedback = await memory.feedback({
      scope,
      signal: "Correction: use short bullet lists when I ask for launch notes.",
    });
    const forgotten = await memory.forget({
      scope,
      memoryId: remember.events.find((event) => event.memoryId)?.memoryId,
    });
    const exported = await memory.exportMemory({
      scope,
      includeRuntime: true,
    });
    const maintenance = await memory.runMaintenance({
      scope,
      jobs: [],
    });
    const deleted = await memory.deleteAllMemory({
      scope,
    });

    expect(remember.metadata?.traceId).toBeString();
    expect(recall.metadata.traceId).toBeString();
    expect(context.traceId).toBeString();
    expect(feedback.metadata?.traceId).toBeString();
    expect(forgotten.traceId).toBeString();
    expect(exported.traceId).toBeString();
    expect(maintenance.traceId).toBeString();
    expect(deleted.traceId).toBeString();

    const names = spans.map((span) => `${span.name}:${span.status}`);
    expect(names).toContain("memory.remember:started");
    expect(names).toContain("memory.remember:succeeded");
    expect(names).toContain("memory.recall:started");
    expect(names).toContain("memory.recall:succeeded");
    expect(names).toContain("memory.build_context:started");
    expect(names).toContain("memory.build_context:succeeded");
    expect(names).toContain("memory.feedback:started");
    expect(names).toContain("memory.feedback:succeeded");
    expect(names).toContain("memory.forget:started");
    expect(names).toContain("memory.forget:succeeded");
    expect(names).toContain("memory.export:started");
    expect(names).toContain("memory.export:succeeded");
    expect(names).toContain("maintenance.run:started");
    expect(names).toContain("maintenance.run:succeeded");
    expect(names).toContain("memory.delete_all:started");
    expect(names).toContain("memory.delete_all:succeeded");

    const serialized = JSON.stringify(spans);
    expect(serialized).not.toContain("sk-raw-secret");
    expect(serialized).not.toContain("Cursor");
    expect(serialized).not.toContain("raw-user-id");
    expect(serialized).not.toContain("raw-workspace-id");
    expect(serialized).not.toContain("raw-session-id");
    expect(spans.every((span) => span.redaction.containsRawUserText === false)).toBe(
      true,
    );
    expect(
      spans.every((span) => span.scopeDigest.userIdHash.startsWith("hmac-sha256:")),
    ).toBe(true);
  });

  it("emits failed spans without exposing raw message content", async () => {
    const spans: GoodMemoryTraceSpan[] = [];
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      observability: {
        traceSink: {
          emit(span) {
            spans.push(span);
          },
        },
      },
      testing: {
        extractor: {
          async extract() {
            throw new Error("extractor failed");
          },
        },
      },
    });

    await expect(
      memory.remember({
        scope: { userId: "failure-user" },
        messages: [
          {
            role: "user",
            content: "This raw failure payload must not appear in trace spans.",
          },
        ],
      }),
    ).rejects.toThrow("extractor failed");

    expect(spans.map((span) => `${span.name}:${span.status}`)).toEqual([
      "memory.remember:started",
      "memory.remember:failed",
    ]);
    expect(JSON.stringify(spans)).not.toContain("raw failure payload");
  });

  it("marks assisted fallback as retryable failure without learning from it", async () => {
    const spans: GoodMemoryTraceSpan[] = [];
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        assistedExtractor: {
          async extract() {
            throw new Error("provider unavailable");
          },
        },
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
      observability: {
        traceSink: {
          emit(span) {
            spans.push(span);
          },
        },
      },
    });

    const result = await memory.remember({
      extractionStrategy: "llm-assisted",
      messages: [{
        role: "user",
        content: "Remember that the launch is blocked on review.",
      }],
      scope: { userId: "retryable-extraction-user" },
    });

    expect(result.outcome).toBe("failed");
    expect(spans.map((span) => `${span.name}:${span.status}`)).toEqual([
      "memory.remember:started",
      "memory.remember:failed",
    ]);
    expect(await documentStore.query("experiences")).toEqual([]);
  });

  it("fails open when the trace sink throws", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      observability: {
        traceSink: {
          emit() {
            throw new Error("sink unavailable");
          },
        },
      },
    });

    try {
      const result = await memory.remember({
        scope: { userId: "sink-failure-user" },
        messages: [
          {
            role: "user",
            content: "Remember that trace sinks must fail open.",
          },
        ],
      });

      expect(result.accepted).toBeGreaterThan(0);
      expect(result.metadata?.traceId).toBeString();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not await slow trace sinks on the core memory path", async () => {
    let emitCount = 0;
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      observability: {
        traceSink: {
          emit() {
            emitCount += 1;
            return new Promise<void>(() => {});
          },
        },
      },
    });

    const result = await Promise.race([
      memory.remember({
        scope: { userId: "slow-sink-user" },
        messages: [
          {
            role: "user",
            content: "Remember that slow trace sinks must not block memory writes.",
          },
        ],
      }),
      new Promise<"timed-out">((resolve) =>
        setTimeout(() => resolve("timed-out"), 50),
      ),
    ]);

    expect(result).not.toBe("timed-out");
    if (result !== "timed-out") {
      expect(result.accepted).toBeGreaterThan(0);
      expect(result.metadata?.traceId).toBeString();
    }
    expect(emitCount).toBeGreaterThan(0);
  });
});
