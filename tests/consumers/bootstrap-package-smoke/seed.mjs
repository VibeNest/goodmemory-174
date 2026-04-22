import { join } from "node:path";
import {
  createGoodMemory,
  createRuntimeArchiveStore,
  createRuntimeContextService,
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
} from "goodmemory";

const scope = {
  userId: "consumer-user",
  workspaceId: "consumer-workspace",
  sessionId: "consumer-session",
};
const sqlitePath = join(process.cwd(), ".goodmemory", "memory.sqlite");
const documentStore = createSQLiteDocumentStore(sqlitePath);
const sessionStore = createSQLiteSessionStore(sqlitePath);
const runtime = createRuntimeContextService({
  sessionStore,
  archiveStore: createRuntimeArchiveStore({ documentStore }),
  now: () => "2026-04-22T00:00:00.000Z",
  maxBufferedMessages: 2,
});
const memory = createGoodMemory({});

await memory.remember({
  scope,
  messages: [
    {
      role: "user",
      content: "Remember that the deploy is blocked on smoke verification.",
    },
    {
      role: "assistant",
      content: "Noted.",
    },
  ],
});
await memory.feedback({
  scope,
  signal: "Keep coding summaries short and list explicit next steps.",
});
await runtime.startSession(scope);
await runtime.updateWorkingMemory(scope, {
  currentGoal: "Finish the bootstrap smoke path",
  openLoops: ["Verify exported session handoff"],
  temporaryDecisions: ["Use packaged CLI bootstrap only."],
});
await runtime.updateSessionJournal(scope, {
  currentState: "Bootstrap scripts generated.",
  workflow: ["Run codex export", "Run claude export"],
  appendWorklog: ["Seeded runtime continuity for external-host smoke."],
});

console.log(
  JSON.stringify({
    ok: true,
    scope,
    sqlitePath,
  }),
);
