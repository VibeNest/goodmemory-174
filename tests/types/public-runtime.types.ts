import {
  createGoodMemory,
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "../../src";
import type {
  RuntimeArchiveStore,
  RuntimeContextServiceConfig,
} from "../../src";

const documentStore = createInMemoryDocumentStore();
const sessionStore = createInMemorySessionStore();
const archiveStore: RuntimeArchiveStore = createRuntimeArchiveStore({
  documentStore,
});

const publicRuntimeConfig: RuntimeContextServiceConfig = {
  sessionStore,
  archiveStore,
};

void publicRuntimeConfig;
const publicRuntime = createRuntimeContextService(publicRuntimeConfig);
const publicRuntimeScope = {
  userId: "public-runtime-types-user",
  sessionId: "public-runtime-types-session",
};

void publicRuntime;

const invalidPublicRuntimeConfig: RuntimeContextServiceConfig = {
  sessionStore,
  // @ts-expect-error Root runtime config must not expose internal salvage hooks.
  salvageHooks: {},
};

void invalidPublicRuntimeConfig;

void publicRuntime.endSession(publicRuntimeScope, {
  archive: "off",
});
void publicRuntime.endSession(publicRuntimeScope, {
  archive: {
    mode: "summary_only",
    includeNormalizedTranscript: false,
  },
});
void publicRuntime.endSession(publicRuntimeScope, {
  // @ts-expect-error Public runtime helper must not expose auto transcript archives.
  archive: "auto",
});
void publicRuntime.endSession(publicRuntimeScope, {
  archive: {
    mode: "summary_only",
    // @ts-expect-error Public runtime helper must not expose transcript archive persistence.
    includeNormalizedTranscript: true,
  },
});

const memory = createGoodMemory({
  storage: { provider: "memory" },
});
const scope = {
  userId: "runtime-types-user",
  sessionId: "runtime-types-session",
};

void memory.runtime.startSession({ scope });
void memory.runtime.appendMessage({
  scope,
  message: {
    role: "user",
    content: "Track this turn in runtime memory.",
  },
});
void memory.runtime.updateWorkingMemory({
  scope,
  patch: {
    currentGoal: "Exercise the public runtime facade types.",
    openLoops: ["Verify archive options"],
  },
});
void memory.runtime.updateSessionJournal({
  scope,
  patch: {
    title: "Runtime facade",
    appendWorklog: ["Type surface checked."],
  },
});
void memory.runtime.getRecallSnapshot({
  scope,
  retrievalProfile: "coding_agent",
});
void memory.runtime.endSession({
  scope,
  archive: "off",
});
void memory.runtime.endSession({
  scope,
  archive: {
    mode: "summary_only",
    includeNormalizedTranscript: false,
  },
});

void memory.runtime.endSession({
  scope,
  archive: {
    mode: "summary_only",
    // @ts-expect-error Root runtime facade must not expose transcript archive persistence.
    includeNormalizedTranscript: true,
  },
});

void memory.jobs.enqueueRemember({
  scope,
  messages: [
    {
      role: "user",
      content: "Remember that public background jobs are explicit.",
    },
  ],
  idempotencyKey: "runtime-types-job-1",
  reason: "post_response_memory_write",
});
void memory.jobs.getJob({ jobId: "job_1" });
void memory.jobs.retryJob({ jobId: "job_1" });
void memory.jobs.drain({ maxJobs: 1 });

// @ts-expect-error Root barrel must not export internal runtime salvage hook types.
type RootRuntimeSalvageHooks = import("../../src").RuntimeSalvageHooks;

void (0 as unknown as RootRuntimeSalvageHooks);
