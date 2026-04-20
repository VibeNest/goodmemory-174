import { streamText } from "ai";
import type {
  ModelMessage,
  SystemModelMessage,
} from "@ai-sdk/provider-utils";

import type { MarkdownArtifactBundle } from "goodmemory";
import { createGoodMemory } from "goodmemory";
import type { GoodMemoryAISDKEvent } from "goodmemory/ai-sdk";
import { createGoodMemoryAISDK } from "goodmemory/ai-sdk";

import { withLocalDefaultRuntime } from "./support/local-default-runtime";

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
    const responseText = /remember/i.test(userText)
      ? "Noted. The migration rollout is blocked on prod verification."
      : "The migration rollout is still blocked on prod verification.";
    const finishPromise = Promise.resolve(
      input.onFinish?.({
        text: responseText,
      } as never),
    );

    return {
      text: finishPromise.then(() => responseText),
      finishReason: Promise.resolve("stop"),
    } as never;
  }) as typeof streamText;
}

export async function runVercelAIChatExample(): Promise<{
  answer: string;
  artifacts: MarkdownArtifactBundle;
  events: GoodMemoryAISDKEvent[];
  secondSystem?: string | SystemModelMessage | Array<SystemModelMessage>;
}> {
  return withLocalDefaultRuntime("goodmemory-example-ai-sdk", async () => {
    const events: GoodMemoryAISDKEvent[] = [];
    const seenSystems: Array<
      string | SystemModelMessage | Array<SystemModelMessage> | undefined
    > = [];
    const memory = createGoodMemory({});
    const aiSDK = createGoodMemoryAISDK({
      memory,
      onMemoryEvent: async (event) => {
        events.push(event);
      },
      dependencies: {
        streamText: ((input) => {
          seenSystems.push(input.system);
          return buildDeterministicStreamText()(input);
        }) as typeof streamText,
      },
    });

    const firstMessages: ModelMessage[] = [
      {
        role: "user",
        content:
          "Remember that the migration rollout is blocked on prod verification.",
      },
    ];

    const firstResult = aiSDK.streamText({
      scope: {
        userId: "vercel-ai-user",
        workspaceId: "vercel-ai-workspace",
        sessionId: "vercel-ai-s1",
      },
      system: "You are a concise product copilot.",
      messages: firstMessages,
      model: {} as never,
    });
    await firstResult.text;

    const secondMessages: ModelMessage[] = [
      {
        role: "user",
        content: "What is the current blocker?",
      },
    ];

    const secondResult = aiSDK.streamText({
      scope: {
        userId: "vercel-ai-user",
        workspaceId: "vercel-ai-workspace",
        sessionId: "vercel-ai-s2",
      },
      system: "You are a concise product copilot.",
      messages: secondMessages,
      query: "migration rollout blocked on prod verification",
      model: {} as never,
    });
    const answer = await secondResult.text;

    const exported = await memory.exportMemory({
      scope: {
        userId: "vercel-ai-user",
        workspaceId: "vercel-ai-workspace",
      },
    });

    return {
      answer,
      artifacts: exported.artifacts,
      events,
      secondSystem: seenSystems[1],
    };
  });
}

if (import.meta.main) {
  const result = await runVercelAIChatExample();
  console.log(JSON.stringify(result, null, 2));
}
