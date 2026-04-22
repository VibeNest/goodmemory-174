import { createGoodMemory } from "goodmemory";
import {
  createGoodMemoryAISDK,
  validateAgentInputEvent,
} from "goodmemory/ai-sdk";
import {
  createHostAdapter,
  validateHostAgentEvent,
} from "goodmemory/host";

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

const validatedToolEvent = validateAgentInputEvent({
  surface: "ai-sdk",
  kind: "tool_call",
  eventId: "consumer-event-1",
  runId: "consumer-run-1",
  turnId: "consumer-turn-1",
  sequence: 0,
  occurredAt: "2026-04-22T00:00:00.000Z",
  hostKind: "codex",
  scope: {
    userId: "consumer-user",
    workspaceId: "consumer-workspace",
    sessionId: "consumer-s1",
  },
  toolName: "QuickCheck",
  payload: {
    checks: ["network"],
    dryRun: true,
  },
});

const validatedFileEditEvent = validateHostAgentEvent({
  surface: "host",
  kind: "file_edit",
  eventId: "consumer-event-2",
  attemptId: "consumer-attempt-1",
  turnId: "consumer-turn-1",
  sequence: 1,
  occurredAt: "2026-04-22T00:00:01.000Z",
  parentEventId: "consumer-event-1",
  hostKind: "claude",
  scope: {
    userId: "consumer-user",
    workspaceId: "consumer-workspace",
    sessionId: "consumer-s1",
  },
  operation: "update",
  relativePath: "playbooks/consumer-checklist.md",
  summary: "Capture the installed-package smoke edit shape.",
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
    validatedFileEditPath:
      validatedFileEditEvent.kind === "file_edit"
        ? validatedFileEditEvent.relativePath
        : undefined,
    validatedToolPayloadShape:
      validatedToolEvent.kind === "tool_call" &&
      validatedToolEvent.payload &&
      !Array.isArray(validatedToolEvent.payload)
        ? typeof validatedToolEvent.payload
        : "missing",
    ok: true,
    recallHitCount: recall.metadata.hits.length,
  }),
);
