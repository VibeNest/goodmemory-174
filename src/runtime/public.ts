import type {
  DocumentStore,
  SessionStore,
} from "../storage/contracts";
import { SESSION_ARCHIVES_COLLECTION } from "../evolution/contracts";
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

export interface RuntimeArchiveStoreConfig {
  documentStore: DocumentStore;
}

export interface RuntimeContextServiceConfig {
  sessionStore: SessionStore;
  archiveStore?: RuntimeArchiveStore;
  now?: () => string;
  createMessageId?: () => string;
  createArchiveId?: () => string;
  maxBufferedMessages?: number;
}

export function createRuntimeArchiveStore(
  config: RuntimeArchiveStoreConfig,
): RuntimeArchiveStore {
  return {
    async add(archive) {
      await config.documentStore.set(
        SESSION_ARCHIVES_COLLECTION,
        archive.id,
        archive,
      );
    },
  };
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
