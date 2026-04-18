import type { SessionStore } from "../storage/contracts";
import {
  createRuntimeContextService as createInternalRuntimeContextService,
} from "./contextService";
import type {
  RuntimeArchiveStore,
  RuntimeContextState,
  RuntimeRecallSnapshot,
  SessionJournalPatch,
  SessionSummaryInput,
  WorkingMemoryPatch,
} from "./contextService";

export type {
  RuntimeArchiveStore,
  RuntimeContextState,
  RuntimeRecallSnapshot,
  SessionJournalPatch,
  SessionSummaryInput,
  WorkingMemoryPatch,
} from "./contextService";

export interface RuntimeContextServiceConfig {
  sessionStore: SessionStore;
  archiveStore?: RuntimeArchiveStore;
  now?: () => string;
  createMessageId?: () => string;
  createArchiveId?: () => string;
  maxBufferedMessages?: number;
}

export function createRuntimeContextService(
  config: RuntimeContextServiceConfig,
) {
  const publicConfig = {
    sessionStore: config.sessionStore,
    archiveStore: config.archiveStore,
    now: config.now,
    createMessageId: config.createMessageId,
    createArchiveId: config.createArchiveId,
    maxBufferedMessages: config.maxBufferedMessages,
  };

  return createInternalRuntimeContextService(publicConfig);
}
