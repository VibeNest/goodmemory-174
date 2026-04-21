import { createGoodMemory } from "goodmemory";
import { createGoodMemoryAISDK } from "goodmemory/ai-sdk";
import { createHostAdapter } from "goodmemory/host";

const LOCAL_DEFAULT_RUNTIME_ENV_KEYS = [
  "GOODMEMORY_STORAGE_PROVIDER",
  "GOODMEMORY_STORAGE_URL",
  "GOODMEMORY_EMBEDDING_PROVIDER",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_SQLITE_CUSTOM_LIBRARY_PATH",
  "GOODMEMORY_SQLITE_VECTOR_EXTENSION_PATH",
  "GOODMEMORY_SQLITE_VECTOR_EXTENSION_ENTRYPOINT",
  "GOODMEMORY_SQLITE_VECTOR_MODE",
  "GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION",
];

for (const key of LOCAL_DEFAULT_RUNTIME_ENV_KEYS) {
  delete process.env[key];
}

const memory = createGoodMemory({});

await memory.remember({
  scope: {
    userId: "consumer-user",
    workspaceId: "consumer-workspace",
    sessionId: "consumer-s0",
  },
  messages: [
    {
      role: "user",
      content: "Remember that I prefer concise release checklists.",
    },
  ],
});

const aiSDK = createGoodMemoryAISDK({
  memory,
  dependencies: {
    streamText: ((input) => {
      const finishPromise = Promise.resolve(
        input.onFinish?.({
          text: "The blocker is still prod verification.",
        }),
      );

      return {
        text: finishPromise.then(() => "The blocker is still prod verification."),
        finishReason: Promise.resolve("stop"),
      };
    }),
  },
});

await aiSDK.streamText({
  scope: {
    userId: "consumer-user",
    workspaceId: "consumer-workspace",
    sessionId: "consumer-s1",
  },
  messages: [
    {
      role: "user",
      content: "Remember that the blocker is prod verification.",
    },
  ],
  system: "You are a concise project copilot.",
  model: {},
}).text;

const recall = await memory.recall({
  scope: {
    userId: "consumer-user",
    workspaceId: "consumer-workspace",
    sessionId: "consumer-s2",
  },
  query: "What is the blocker and how should I answer this user?",
  retrievalProfile: "general_chat",
});
const context = await memory.buildContext({
  recall,
  output: "markdown",
  maxTokens: 160,
});

const adapter = createHostAdapter({
  id: "consumer-host",
  hostKind: "claude",
  memory,
  readableArtifactTypes: ["memory_index"],
});

const artifacts = await adapter.readArtifacts({
  scope: {
    userId: "consumer-user",
    workspaceId: "consumer-workspace",
    sessionId: "consumer-s1",
  },
});

console.log(
  JSON.stringify({
    artifactPaths: artifacts.artifacts.map((artifact) => artifact.relativePath),
    contextIncludesBlocker: context.content.includes("prod verification"),
    ok: true,
    recallHitCount: recall.metadata.hits.length,
  }),
);
