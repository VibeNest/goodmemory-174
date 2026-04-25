import type { GoodMemoryTracer } from "../observability/tracer";
import {
  createRuntimeArchiveStore,
  createRuntimeContextService,
} from "../runtime/public";
import type {
  DocumentStore,
  SessionStore,
} from "../storage/contracts";
import type {
  GoodMemoryRuntimeAppendMessageInput,
  GoodMemoryRuntimeBufferResult,
  GoodMemoryRuntimeEndSessionInput,
  GoodMemoryRuntimeFacade,
  GoodMemoryRuntimeGetRecallSnapshotInput,
  GoodMemoryRuntimeRecallSnapshotResult,
  GoodMemoryRuntimeSetSessionSummaryInput,
  GoodMemoryRuntimeStartSessionInput,
  GoodMemoryRuntimeStateResult,
  GoodMemoryRuntimeUpdateSessionJournalInput,
  GoodMemoryRuntimeUpdateWorkingMemoryInput,
  GoodMemoryRuntimeSessionJournalResult,
  GoodMemoryRuntimeWorkingMemoryResult,
} from "./contracts";

export interface GoodMemoryRuntimeFacadeConfig {
  documentStore: DocumentStore;
  sessionStore: SessionStore;
  now: () => Date;
  tracer: GoodMemoryTracer;
}

function resolveEndSessionArchiveOptions(
  input: GoodMemoryRuntimeEndSessionInput,
): Parameters<ReturnType<typeof createRuntimeContextService>["endSession"]>[1] {
  if (input.archive === undefined || input.archive === "off") {
    return { archive: "off" };
  }

  return {
    archive: {
      mode: "summary_only",
      includeNormalizedTranscript: false,
    },
  };
}

export function createGoodMemoryRuntimeFacade(
  config: GoodMemoryRuntimeFacadeConfig,
): GoodMemoryRuntimeFacade {
  const runtime = createRuntimeContextService({
    sessionStore: config.sessionStore,
    archiveStore: createRuntimeArchiveStore({
      documentStore: config.documentStore,
    }),
    now: () => config.now().toISOString(),
  });

  return {
    async startSession(
      input: GoodMemoryRuntimeStartSessionInput,
    ): Promise<GoodMemoryRuntimeStateResult> {
      const trace = await config.tracer.start({
        name: "runtime.session.start",
        scope: input.scope,
        attributes: {
          hasSessionId: Boolean(input.scope.sessionId),
        },
      });

      try {
        const state = await runtime.startSession(input.scope);
        await trace.succeeded({
          attributes: {
            bufferedMessageCount: state.buffer.messages.length,
          },
        });

        return {
          state,
          ...(trace.traceId ? { traceId: trace.traceId } : {}),
        };
      } catch (error) {
        await trace.failed({ error });
        throw error;
      }
    },

    async getState(
      input: GoodMemoryRuntimeStartSessionInput,
    ): Promise<GoodMemoryRuntimeStateResult> {
      return {
        state: await runtime.getRuntimeState(input.scope),
      };
    },

    async appendMessage(
      input: GoodMemoryRuntimeAppendMessageInput,
    ): Promise<GoodMemoryRuntimeBufferResult> {
      return {
        buffer: await runtime.appendToSession(input.scope, input.message),
      };
    },

    async setSessionSummary(
      input: GoodMemoryRuntimeSetSessionSummaryInput,
    ): Promise<GoodMemoryRuntimeBufferResult> {
      return {
        buffer: await runtime.setSessionSummary(input.scope, {
          summary: input.summary,
          summaryUpToIndex: input.summaryUpToIndex,
        }),
      };
    },

    async updateWorkingMemory(
      input: GoodMemoryRuntimeUpdateWorkingMemoryInput,
    ): Promise<GoodMemoryRuntimeWorkingMemoryResult> {
      return {
        workingMemory: await runtime.updateWorkingMemory(input.scope, input.patch),
      };
    },

    async updateSessionJournal(
      input: GoodMemoryRuntimeUpdateSessionJournalInput,
    ): Promise<GoodMemoryRuntimeSessionJournalResult> {
      return {
        journal: await runtime.updateSessionJournal(input.scope, input.patch),
      };
    },

    async getRecallSnapshot(
      input: GoodMemoryRuntimeGetRecallSnapshotInput,
    ): Promise<GoodMemoryRuntimeRecallSnapshotResult> {
      return {
        snapshot: await runtime.getRuntimeRecall(
          input.scope,
          input.retrievalProfile ?? "general_chat",
        ),
      };
    },

    async endSession(
      input: GoodMemoryRuntimeEndSessionInput,
    ): Promise<GoodMemoryRuntimeStateResult> {
      const archiveOptions = resolveEndSessionArchiveOptions(input);
      const archive = archiveOptions?.archive;
      const archiveMode =
        archive === "off"
          ? "off"
          : archive?.mode ?? "off";
      const trace = await config.tracer.start({
        name: "runtime.session.end",
        scope: input.scope,
        attributes: {
          archiveMode,
          includeNormalizedTranscript: false,
        },
      });

      try {
        const state = await runtime.endSession(input.scope, archiveOptions);
        await trace.succeeded({
          attributes: {
            archiveMode,
            bufferedMessageCount: state.buffer.messages.length,
            includeNormalizedTranscript: false,
          },
        });

        return {
          state,
          ...(trace.traceId ? { traceId: trace.traceId } : {}),
        };
      } catch (error) {
        await trace.failed({ error });
        throw error;
      }
    },
  };
}
