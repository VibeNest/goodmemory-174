import { streamText } from "ai";
import type {
  ModelMessage,
  SystemModelMessage,
} from "@ai-sdk/provider-utils";

import type { GoodMemory, MarkdownArtifactBundle } from "goodmemory";
import { createGoodMemory } from "goodmemory";
import type {
  GoodMemoryAISDKDependencies,
  GoodMemoryAISDKEvent,
  GoodMemoryStreamTextInput,
} from "goodmemory/ai-sdk";
import { createGoodMemoryAISDK } from "goodmemory/ai-sdk";

import { withLocalDefaultRuntime } from "./support/local-default-runtime";

export type PlainAISDKServerRequestBody = Pick<
  GoodMemoryStreamTextInput,
  "messages" | "query" | "scope" | "system"
>;

export interface CreatePlainAISDKServerHandlerInput {
  dependencies?: GoodMemoryAISDKDependencies;
  memory?: GoodMemory;
  onMemoryEvent?(event: GoodMemoryAISDKEvent): Promise<void> | void;
}

function serializeSystemPrompt(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  return JSON.stringify(value);
}

function createSingleChunkStream(value: string): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

function buildDeterministicStreamText(): typeof streamText {
  return ((input) => {
    const messages = input.messages ?? [];
    let lastUserMessage: ModelMessage | undefined;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === "user") {
        lastUserMessage = message;
        break;
      }
    }

    const userText =
      lastUserMessage && typeof lastUserMessage.content === "string"
        ? lastUserMessage.content
        : "What should I know?";
    const systemText = serializeSystemPrompt(input.system)?.toLowerCase() ?? "";
    const responseText = /remember/i.test(userText)
      ? "Noted. The migration rollout is blocked on prod verification."
      : systemText.includes("prod verification")
        ? "The migration rollout is still blocked on prod verification."
        : "I do not have a stored blocker yet.";
    const finishPromise = Promise.resolve(
      input.onFinish?.({
        text: responseText,
      } as never),
    );

    return {
      finishReason: Promise.resolve("stop"),
      text: finishPromise.then(() => responseText),
      textStream: {
        async *[Symbol.asyncIterator]() {
          await finishPromise;
          yield* createSingleChunkStream(responseText);
        },
      },
    } as never;
  }) as typeof streamText;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonEmptyString(
  value: unknown,
): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isPlainAISDKServerScope(
  value: unknown,
): value is PlainAISDKServerRequestBody["scope"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.userId) &&
    isOptionalNonEmptyString(candidate.tenantId) &&
    isOptionalNonEmptyString(candidate.workspaceId) &&
    isOptionalNonEmptyString(candidate.agentId) &&
    isOptionalNonEmptyString(candidate.sessionId)
  );
}

function isPlainAISDKServerRequestBody(
  value: unknown,
): value is PlainAISDKServerRequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isPlainAISDKServerScope(candidate.scope) &&
    Array.isArray(candidate.messages)
  );
}

function createJsonErrorResponse(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({
      error: message,
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      status,
    },
  );
}

export function createPlainAISDKServerHandler(
  input: CreatePlainAISDKServerHandlerInput = {},
): (request: Request) => Promise<Response> {
  const memory = input.memory ?? createGoodMemory({});
  const aiSDK = createGoodMemoryAISDK({
    dependencies: input.dependencies,
    memory,
    onMemoryEvent: input.onMemoryEvent,
  });

  return async (request: Request): Promise<Response> => {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return createJsonErrorResponse("Expected a JSON request body.");
    }

    if (!isPlainAISDKServerRequestBody(payload)) {
      return createJsonErrorResponse(
        "Expected a request body with a messages array and scope.userId.",
      );
    }

    const result = aiSDK.streamText({
      ...payload,
      model: {} as never,
    });

    return result.toTextStreamResponse({
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
      status: 200,
    });
  };
}

export async function runPlainAISDKServerExample(): Promise<{
  artifacts: MarkdownArtifactBundle;
  events: GoodMemoryAISDKEvent[];
  firstResponseText: string;
  secondResponseText: string;
  secondSystem?: string;
}> {
  return withLocalDefaultRuntime("goodmemory-example-ai-sdk-server", async () => {
    const events: GoodMemoryAISDKEvent[] = [];
    const seenSystems: Array<
      string | SystemModelMessage | Array<SystemModelMessage> | undefined
    > = [];
    const memory = createGoodMemory({});
    const handler = createPlainAISDKServerHandler({
      dependencies: {
        streamText: ((input) => {
          seenSystems.push(input.system);
          return buildDeterministicStreamText()(input);
        }) as typeof streamText,
      },
      memory,
      onMemoryEvent: async (event) => {
        events.push(event);
      },
    });

    const firstResponse = await handler(
      new Request("http://localhost/api/memory-chat", {
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content:
                "Remember that the migration rollout is blocked on prod verification.",
            },
          ],
          scope: {
            userId: "server-user",
            workspaceId: "server-workspace",
            sessionId: "server-s1",
          },
          system: "You are a concise product copilot.",
        } satisfies PlainAISDKServerRequestBody),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const firstResponseText = await firstResponse.text();

    const secondResponse = await handler(
      new Request("http://localhost/api/memory-chat", {
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: "What is the current blocker?",
            },
          ],
          query: "migration rollout blocked on prod verification",
          scope: {
            userId: "server-user",
            workspaceId: "server-workspace",
            sessionId: "server-s2",
          },
          system: "You are a concise product copilot.",
        } satisfies PlainAISDKServerRequestBody),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const secondResponseText = await secondResponse.text();

    const exported = await memory.exportMemory({
      scope: {
        userId: "server-user",
        workspaceId: "server-workspace",
      },
    });

    return {
      artifacts: exported.artifacts,
      events,
      firstResponseText,
      secondResponseText,
      secondSystem: serializeSystemPrompt(seenSystems[1]),
    };
  });
}

if (import.meta.main) {
  const result = await runPlainAISDKServerExample();
  console.log(JSON.stringify(result, null, 2));
}
