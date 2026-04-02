import { createGoodMemory } from "../src";

export async function runBasicChatExample(): Promise<{
  memoryContext: string;
  answer: string;
}> {
  const memory = createGoodMemory({
    storage: { provider: "memory" },
  });

  await memory.remember({
    scope: { userId: "example-user", sessionId: "chat-s1", workspaceId: "example-chat" },
    messages: [
      {
        role: "user",
        content: "My name is Lin. Remember that the migration rollout is blocked on prod verification.",
      },
      {
        role: "assistant",
        content: "Noted.",
      },
      {
        role: "user",
        content: "I prefer bullet points in project summaries.",
      },
    ],
  });

  const recall = await memory.recall({
    scope: { userId: "example-user", sessionId: "chat-s2", workspaceId: "example-chat" },
    query: "How should I answer this user about the current project?",
    retrievalProfile: "general_chat",
  });
  const context = await memory.buildContext({
    recall,
    output: "markdown",
    maxTokens: 160,
  });

  return {
    memoryContext: context.content,
    answer:
      "Bullet summary: the migration rollout is still blocked on prod verification, so I would answer in concise bullet points.",
  };
}

if (import.meta.main) {
  const result = await runBasicChatExample();
  console.log(JSON.stringify(result, null, 2));
}
