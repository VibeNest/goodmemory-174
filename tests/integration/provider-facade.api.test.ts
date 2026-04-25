import { afterEach, describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src";

const providerEnvKeys = [
  "GOODMEMORY_EMBEDDING_PROVIDER",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER",
  "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY",
  "GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL",
] as const;

const originalEnv = Object.fromEntries(
  providerEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof providerEnvKeys)[number], string | undefined>;
const originalFetch = globalThis.fetch;

function restoreProviderEnv(): void {
  for (const key of providerEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("public provider facade", () => {
  afterEach(() => {
    restoreProviderEnv();
    globalThis.fetch = originalFetch;
  });

  it("maps providers.embedding and providers.extraction onto existing adapters", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const vectorStore = createInMemoryVectorStore();
    const requests: string[] = [];

    for (const key of providerEnvKeys) {
      delete process.env[key];
    }

    globalThis.fetch = (async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      requests.push(url);

      if (url.includes("/embeddings")) {
        const payload = init?.body
          ? JSON.parse(String(init.body)) as { input?: string | string[] }
          : {};
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
              embedding: String(value).includes("staging smoke")
                ? [1, 0, 0]
                : [0, 0, 1],
            })),
            model: "text-embedding-3-small",
            usage: {
              prompt_tokens: values.length,
              total_tokens: values.length,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          id: "chatcmpl-provider-facade",
          object: "chat.completion",
          model: "gpt-4o-mini",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  candidates: [
                    {
                      id: "provider-fact-1",
                      kindHint: "fact",
                      explicitness: "explicit",
                      content:
                        "The migration rollout is blocked on staging smoke verification.",
                      sourceMessageIndex: 0,
                      sourceRole: "user",
                      metadata: {
                        category: "project",
                        factKind: "blocker",
                        scopeKind: "project",
                      },
                    },
                  ],
                  ignoredMessageCount: 0,
                }),
              },
              finish_reason: "stop",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    const memory = createGoodMemory({
      storage: { provider: "memory" },
      providers: {
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          apiKey: "embedding-key",
          baseURL: "https://embedding-provider.test/v1",
        },
        extraction: {
          provider: "openai",
          model: "gpt-4o-mini",
          apiKey: "extractor-key",
          baseURL: "https://extractor-provider.test/v1",
        },
      },
      adapters: {
        documentStore,
        sessionStore,
        vectorStore,
      },
    });
    const scope = {
      userId: "provider-facade-user",
      workspaceId: "provider-facade-workspace",
      sessionId: "provider-facade-session",
    };

    const remembered = await memory.remember({
      scope,
      extractionStrategy: "llm-assisted",
      messages: [
        {
          role: "user",
          content:
            "Remember that the migration rollout is blocked on staging smoke verification.",
        },
      ],
    });

    const [writtenFact] = await documentStore.query<{ id: string }>("facts", {
      userId: scope.userId,
    });

    expect(remembered.accepted).toBeGreaterThan(0);
    expect(remembered.metadata?.resolvedExtractionStrategy).toBe("llm-assisted");
    expect(requests.some((url) => url.includes("/chat/completions"))).toBe(true);
    expect(requests.some((url) => url.includes("/embeddings"))).toBe(true);
    expect(writtenFact?.id).toBeString();
    expect(await vectorStore.get("facts", writtenFact!.id)).toEqual(
      expect.objectContaining({
        embedding: [1, 0, 0],
      }),
    );
  });
});
