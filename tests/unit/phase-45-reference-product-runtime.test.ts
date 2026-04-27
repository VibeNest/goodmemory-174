import { describe, expect, it } from "bun:test";
import {
  createInMemoryReferenceProductBackend,
  createReferenceProductBackend,
} from "../../examples/reference-chat-product/backend";
import type {
  ReferenceProductBackend,
} from "../../examples/reference-chat-product/backend";

function bridgeResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

describe("phase-45 reference product runtime", () => {
  it("runs a product chat loop with recall-context injection and explicit remember", async () => {
    const { product } = createInMemoryReferenceProductBackend();

    const firstTurn = await product.chat({
      message: "My top priority this quarter is rebuilding my sleep routine.",
      remember: true,
      turnId: "runtime-turn-1",
    });
    expect(firstTurn.contextIncluded).toBe(false);
    expect(firstTurn.rememberAccepted).toBe(true);

    const secondTurn = await product.chat({
      message: "What is my quarterly priority?",
      turnId: "runtime-turn-2",
    });
    expect(secondTurn.contextIncluded).toBe(true);
    expect(secondTurn.itemCount).toBeGreaterThan(0);
    expect(secondTurn.text).toContain("sleep routine");
    expect(secondTurn.memoryIds.length).toBeGreaterThan(0);
  });

  it("exercises feedback, export, forget, and targeted revise through bridge calls", async () => {
    const { product } = createInMemoryReferenceProductBackend();

    await product.remember({
      idempotencyKey: "runtime-remember-1",
      message: "My top priority this quarter is rebuilding my sleep routine.",
    });
    const recall = await product.recallContext("What is my quarterly priority?");
    const memoryId = recall.memoryIds[0];
    expect(memoryId).toBeString();

    const feedback = await product.feedback({
      idempotencyKey: "runtime-feedback-1",
      signal: "Keep doing checklist summaries after coaching sessions.",
    });
    expect(feedback.accepted).toBe(true);

    const revised = await product.revise({
      content:
        "Quarterly priority: rebuild my sleep routine with a consistent wind-down.",
      idempotencyKey: "runtime-revise-1",
      memoryId: memoryId!,
    });
    expect(revised.accepted).toBe(true);

    const revisedRecall = await product.recallContext("What is my quarterly priority?");
    expect(revisedRecall.contextText).toContain("wind-down");
    const revisedChat = await product.chat({
      message: "What is my quarterly priority?",
      turnId: "runtime-turn-revised",
    });
    expect(revisedChat.text).toContain("wind-down");

    const exported = await product.exportMemory({ includeRuntime: true });
    expect(exported.factCount).toBeGreaterThan(0);
    expect(exported.feedbackCount).toBeGreaterThan(0);

    const forgotten = await product.forget({ memoryId: memoryId! });
    expect(forgotten.accepted).toBe(true);

    const afterForget = await product.recallContext("What is my quarterly priority?");
    expect(afterForget.memoryIds).not.toContain(memoryId);
  });

  it("dedupes sync remember retries at the product boundary", async () => {
    const { product } = createInMemoryReferenceProductBackend();

    await product.remember({
      idempotencyKey: "runtime-dedupe-1",
      message: "My top priority this quarter is rebuilding my sleep routine.",
    });
    await product.remember({
      idempotencyKey: "runtime-dedupe-1",
      message: "My top priority this quarter is rebuilding my sleep routine.",
    });
    await expect(product.remember({
      idempotencyKey: "runtime-dedupe-1",
      message: "My top priority this quarter is writing a release plan.",
    })).rejects.toThrow("idempotency key was reused for different content");

    const recall = await product.recallContext("What is my quarterly priority?");
    expect(recall.memoryIds).toHaveLength(1);
    expect(recall.contextText).toContain("sleep routine");
    expect(recall.contextText).not.toContain("release plan");
  });

  it("serializes concurrent sync remember calls with the same idempotency key", async () => {
    const { product } = createInMemoryReferenceProductBackend();

    const [first, second] = await Promise.all([
      product.remember({
        idempotencyKey: "runtime-concurrent-1",
        message: "My top priority this quarter is rebuilding my sleep routine.",
      }),
      product.remember({
        idempotencyKey: "runtime-concurrent-1",
        message: "My top priority this quarter is rebuilding my sleep routine.",
      }),
    ]);
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);

    const recall = await product.recallContext("What is my quarterly priority?");
    expect(recall.memoryIds).toHaveLength(1);

    const [accepted, rejected] = await Promise.allSettled([
      product.remember({
        idempotencyKey: "runtime-concurrent-2",
        message: "My top priority this quarter is rebuilding my sleep routine.",
      }),
      product.remember({
        idempotencyKey: "runtime-concurrent-2",
        message: "My top priority this quarter is writing a release plan.",
      }),
    ]);
    expect(accepted.status).toBe("fulfilled");
    expect(rejected.status).toBe("rejected");

    const afterConflict = await product.recallContext("What is my quarterly priority?");
    expect(afterConflict.contextText).not.toContain("release plan");
  });

  it("serializes chat idempotency before runtime side effects", async () => {
    let appendCount = 0;
    let recallCalls = 0;
    let rememberCalls = 0;
    const product = createReferenceProductBackend({
      bridgeFetch: async (request) => {
        const pathname = new URL(request.url).pathname;
        await Bun.sleep(1);
        if (pathname === "/memory/recall-context") {
          recallCalls += 1;
          return bridgeResponse({
            contextText: "",
            hasContext: false,
            itemCount: 0,
            items: [],
            ok: true,
            operation: "recall-context",
          });
        }
        if (pathname === "/memory/remember") {
          rememberCalls += 1;
          return bridgeResponse({
            ok: true,
            operation: "remember",
            result: { accepted: true },
          });
        }
        throw new Error(`Unexpected bridge path: ${pathname}`);
      },
      bridgeUrl: "http://reference-product.local",
      runtimeRecorder: {
        async appendMessage() {
          appendCount += 1;
          return {
            buffer: {
              createdAt: "2026-04-27T00:00:00.000Z",
              lastActiveAt: "2026-04-27T00:00:00.000Z",
              messages: [],
              sessionId: "runtime-chat-concurrent",
              summary: null,
              summaryUpToIndex: 0,
              userId: "phase45-reference-user",
            },
          };
        },
      },
    });

    const [first, second] = await Promise.all([
      product.chat({
        message: "My top priority this quarter is rebuilding my sleep routine.",
        remember: true,
        turnId: "runtime-chat-concurrent-1",
      }),
      product.chat({
        message: "My top priority this quarter is rebuilding my sleep routine.",
        remember: true,
        turnId: "runtime-chat-concurrent-1",
      }),
    ]);
    expect(first).toEqual(second);
    expect(appendCount).toBe(2);
    expect(recallCalls).toBe(1);
    expect(rememberCalls).toBe(1);

    appendCount = 0;
    recallCalls = 0;
    rememberCalls = 0;
    const [accepted, rejected] = await Promise.allSettled([
      product.chat({
        message: "My top priority this quarter is rebuilding my sleep routine.",
        remember: true,
        turnId: "runtime-chat-concurrent-2",
      }),
      product.chat({
        message: "My top priority this quarter is writing a release plan.",
        remember: true,
        turnId: "runtime-chat-concurrent-2",
      }),
    ]);
    expect(accepted.status).toBe("fulfilled");
    expect(rejected.status).toBe("rejected");
    expect(appendCount).toBe(2);
    expect(recallCalls).toBe(1);
    expect(rememberCalls).toBe(1);
  });

  it("reserves chat turn ids before reentrant runtime side effects", async () => {
    let appendCount = 0;
    let product: ReferenceProductBackend;
    let reentrantResult = "";
    const bridgeFetch = async (request: Request): Promise<Response> => {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/memory/recall-context") {
        return bridgeResponse({
          contextText: "",
          hasContext: false,
          itemCount: 0,
          items: [],
          ok: true,
          operation: "recall-context",
        });
      }
      if (pathname === "/memory/remember") {
        return bridgeResponse({
          ok: true,
          operation: "remember",
          result: { accepted: true },
        });
      }
      throw new Error(`Unexpected bridge path: ${pathname}`);
    };
    product = createReferenceProductBackend({
      bridgeFetch,
      bridgeUrl: "http://reference-product.local",
      runtimeRecorder: {
        async appendMessage() {
          appendCount += 1;
          if (appendCount === 1) {
            reentrantResult = await product.chat({
              message: "My top priority this quarter is writing a release plan.",
              remember: true,
              turnId: "runtime-chat-reentrant-1",
            }).then(
              () => "fulfilled",
              (error: unknown) => error instanceof Error ? error.message : String(error),
            );
          }
          return {
            buffer: {
              createdAt: "2026-04-27T00:00:00.000Z",
              lastActiveAt: "2026-04-27T00:00:00.000Z",
              messages: [],
              sessionId: "runtime-chat-reentrant",
              summary: null,
              summaryUpToIndex: 0,
              userId: "phase45-reference-user",
            },
          };
        },
      },
    });

    await product.chat({
      message: "My top priority this quarter is rebuilding my sleep routine.",
      remember: true,
      turnId: "runtime-chat-reentrant-1",
    });

    expect(reentrantResult).toContain("turnId was reused");
    expect(appendCount).toBe(2);
  });

  it("rejects same-payload reentrant chat instead of awaiting itself", async () => {
    let appendCount = 0;
    let product: ReferenceProductBackend;
    let reentrantResult = "";
    const message = "My top priority this quarter is rebuilding my sleep routine.";
    product = createReferenceProductBackend({
      bridgeFetch: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/memory/recall-context") {
          return bridgeResponse({
            contextText: "",
            hasContext: false,
            itemCount: 0,
            items: [],
            ok: true,
            operation: "recall-context",
          });
        }
        if (pathname === "/memory/remember") {
          return bridgeResponse({
            ok: true,
            operation: "remember",
            result: { accepted: true },
          });
        }
        throw new Error(`Unexpected bridge path: ${pathname}`);
      },
      bridgeUrl: "http://reference-product.local",
      runtimeRecorder: {
        async appendMessage() {
          appendCount += 1;
          if (appendCount === 1) {
            reentrantResult = await Promise.race([
              product.chat({
                message,
                remember: true,
                turnId: "runtime-chat-reentrant-same",
              }).then(
                () => "fulfilled",
                (error: unknown) => error instanceof Error ? error.message : String(error),
              ),
              Bun.sleep(50).then(() => "timeout"),
            ]);
          }
          return {
            buffer: {
              createdAt: "2026-04-27T00:00:00.000Z",
              lastActiveAt: "2026-04-27T00:00:00.000Z",
              messages: [],
              sessionId: "runtime-chat-reentrant-same",
              summary: null,
              summaryUpToIndex: 0,
              userId: "phase45-reference-user",
            },
          };
        },
      },
    });

    await product.chat({
      message,
      remember: true,
      turnId: "runtime-chat-reentrant-same",
    });

    expect(reentrantResult).toContain("already running");
    expect(reentrantResult).not.toBe("timeout");
    expect(appendCount).toBe(2);
  });

  it("does not let chat and remember guards collide on the same raw key", async () => {
    const message = "My top priority this quarter is rebuilding my sleep routine.";
    const { product } = createInMemoryReferenceProductBackend();

    await product.remember({
      idempotencyKey: "chat:shared-key",
      message: "My top priority this quarter is writing a release plan.",
    });
    await product.remember({
      idempotencyKey: "chat:shared-key",
      message: "My top priority this quarter is writing a release plan.",
    });
    await expect(product.remember({
      idempotencyKey: "chat:shared-key",
      message: "My top priority this quarter is rebuilding my sleep routine.",
    })).rejects.toThrow("idempotency key was reused for different content");

    const chat = await product.chat({
      message,
      remember: true,
      turnId: "shared-key",
    });

    expect(chat.rememberAccepted).toBe(true);
    const recall = await product.recallContext("What is my quarterly priority?");
    expect(recall.contextText).toContain("sleep routine");
    expect(recall.contextText).toContain("release plan");
  });

  it("dedupes feedback retries at the product boundary", async () => {
    const { product } = createInMemoryReferenceProductBackend();

    const first = await product.feedback({
      idempotencyKey: "feedback-shared-key",
      signal: "Keep doing checklist summaries after coaching sessions.",
    });
    const second = await product.feedback({
      idempotencyKey: "feedback-shared-key",
      signal: "Keep doing checklist summaries after coaching sessions.",
    });
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    await expect(product.feedback({
      idempotencyKey: "feedback-shared-key",
      signal: "Avoid checklist summaries after coaching sessions.",
    })).rejects.toThrow("feedback idempotency key was reused");

    const exported = await product.exportMemory();
    expect(exported.feedbackCount).toBe(1);
  });

  it("keeps failed chat idempotency terminal after side effects start", async () => {
    let appendCount = 0;
    let recallCalls = 0;
    let rememberCalls = 0;
    const product = createReferenceProductBackend({
      bridgeFetch: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/memory/recall-context") {
          recallCalls += 1;
          return bridgeResponse({
            contextText: "",
            hasContext: false,
            itemCount: 0,
            items: [],
            ok: true,
            operation: "recall-context",
          });
        }
        if (pathname === "/memory/remember") {
          rememberCalls += 1;
          throw new Error("bridge remember unavailable");
        }
        throw new Error(`Unexpected bridge path: ${pathname}`);
      },
      bridgeUrl: "http://reference-product.local",
      runtimeRecorder: {
        async appendMessage() {
          appendCount += 1;
          return {
            buffer: {
              createdAt: "2026-04-27T00:00:00.000Z",
              lastActiveAt: "2026-04-27T00:00:00.000Z",
              messages: [],
              sessionId: "runtime-chat-failed",
              summary: null,
              summaryUpToIndex: 0,
              userId: "phase45-reference-user",
            },
          };
        },
      },
    });

    const input = {
      message: "My top priority this quarter is rebuilding my sleep routine.",
      remember: true,
      turnId: "runtime-chat-failed-1",
    };
    await expect(product.chat(input)).rejects.toThrow("bridge remember unavailable");
    await expect(product.chat(input)).rejects.toThrow("bridge remember unavailable");

    expect(appendCount).toBe(2);
    expect(recallCalls).toBe(1);
    expect(rememberCalls).toBe(1);
  });
});
