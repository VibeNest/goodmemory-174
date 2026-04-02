import {
  createSessionBuffer,
  createSessionJournal,
  createWorkingMemorySnapshot,
} from "../domain/records";
import type {
  SessionBuffer,
  SessionJournal,
  SessionMessage,
  WorkingMemorySnapshot,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import { scopeToKey } from "../domain/scope";
import type { SessionStore } from "../storage/contracts";

export interface RuntimeContextServiceConfig {
  sessionStore: SessionStore;
  now?: () => string;
  createMessageId?: () => string;
  maxBufferedMessages?: number;
}

export interface RuntimeContextState {
  buffer: SessionBuffer;
  workingMemory: WorkingMemorySnapshot;
  journal: SessionJournal;
}

export interface WorkingMemoryPatch {
  currentGoal?: string | null;
  constraints?: string[] | null;
  openLoops?: string[];
  resolvedOpenLoops?: string[];
  temporaryDecisions?: string[] | null;
  toolState?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
}

export interface SessionSummaryInput {
  summary: string;
  summaryUpToIndex: number;
}

export interface SessionJournalPatch {
  title?: string;
  currentState?: string;
  taskSpecification?: string;
  filesAndFunctions?: string[];
  workflow?: string[];
  errorsAndCorrections?: string[];
  systemDocumentation?: string[];
  learnings?: string[];
  keyResults?: string[];
  worklog?: string[];
  appendWorklog?: string[];
  lastSummarizedMessageId?: string;
}

export interface RuntimeRecallSnapshot {
  buffer: SessionBuffer | null;
  workingMemory: WorkingMemorySnapshot | null;
  journal: SessionJournal | null;
}

type SessionLifecycleStatus = "active" | "ended";

function mergeUnique(existing: string[], next: string[]): string[] {
  return [...new Set([...existing, ...next])];
}

function shallowMergeRecord(
  current: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (patch === null) {
    return undefined;
  }

  if (patch === undefined) {
    return current;
  }

  return {
    ...(current ?? {}),
    ...patch,
  };
}

function hasRuntimeSignal(snapshot: WorkingMemorySnapshot): boolean {
  return Boolean(
    snapshot.currentGoal ||
      (snapshot.constraints?.length ?? 0) > 0 ||
      snapshot.openLoops.length > 0 ||
      (snapshot.temporaryDecisions?.length ?? 0) > 0,
  );
}

export function createRuntimeContextService(config: RuntimeContextServiceConfig) {
  const now = config.now ?? (() => new Date().toISOString());
  const createMessageId = config.createMessageId ?? (() => crypto.randomUUID());
  const maxBufferedMessages = Math.max(config.maxBufferedMessages ?? 24, 1);
  const lifecycle = new Map<string, SessionLifecycleStatus>();

  function requireSessionScope(scope: MemoryScope): MemoryScope & { sessionId: string } {
    if (!scope.sessionId) {
      throw new Error("Runtime context requires scope.sessionId");
    }

    return {
      ...scope,
      sessionId: scope.sessionId,
    };
  }

  async function createFreshState(
    scope: MemoryScope & { sessionId: string },
  ): Promise<RuntimeContextState> {
    const timestamp = now();
    const buffer = createSessionBuffer({
      sessionId: scope.sessionId,
      userId: scope.userId,
      createdAt: timestamp,
      lastActiveAt: timestamp,
    });
    const workingMemory = createWorkingMemorySnapshot({
      sessionId: scope.sessionId,
      userId: scope.userId,
      updatedAt: timestamp,
    });
    const journal = createSessionJournal({
      sessionId: scope.sessionId,
      userId: scope.userId,
      updatedAt: timestamp,
    });

    await config.sessionStore.saveBuffer(scope, buffer);
    await config.sessionStore.saveWorkingMemory(scope, workingMemory);
    await config.sessionStore.saveJournal(scope, journal);
    lifecycle.set(scopeToKey(scope), "active");

    return {
      buffer,
      workingMemory,
      journal,
    };
  }

  async function ensureActiveState(
    scope: MemoryScope & { sessionId: string },
  ): Promise<RuntimeContextState> {
    const key = scopeToKey(scope);

    if (lifecycle.get(key) === "ended") {
      throw new Error(`Runtime session ${scope.sessionId} has ended`);
    }

    const [buffer, workingMemory, journal] = await Promise.all([
      config.sessionStore.getBuffer(scope),
      config.sessionStore.getWorkingMemory(scope),
      config.sessionStore.getJournal(scope),
    ]);

    if (!buffer || !workingMemory || !journal) {
      return createFreshState(scope);
    }

    lifecycle.set(key, "active");

    return {
      buffer,
      workingMemory,
      journal,
    };
  }

  return {
    async startSession(scope: MemoryScope): Promise<RuntimeContextState> {
      return createFreshState(requireSessionScope(scope));
    },

    async getRuntimeState(scope: MemoryScope): Promise<RuntimeContextState> {
      return ensureActiveState(requireSessionScope(scope));
    },

    async appendToSession(
      scope: MemoryScope,
      message: SessionMessage,
    ): Promise<SessionBuffer> {
      const sessionScope = requireSessionScope(scope);
      const state = await ensureActiveState(sessionScope);
      const timestamp = now();
      const nextMessages = [
        ...state.buffer.messages,
        {
          id: message.id ?? createMessageId(),
          role: message.role,
          content: message.content,
        },
      ];

      let summary = state.buffer.summary;
      let summaryUpToIndex = state.buffer.summaryUpToIndex;
      let messages = nextMessages;

      if (nextMessages.length > maxBufferedMessages) {
        const overflow = nextMessages.length - maxBufferedMessages;
        messages = nextMessages.slice(overflow);
        summary = summary ?? "Earlier messages compacted.";
        summaryUpToIndex += overflow;
      }

      const buffer = createSessionBuffer({
        ...state.buffer,
        messages,
        summary,
        summaryUpToIndex,
        lastActiveAt: timestamp,
      });

      await config.sessionStore.saveBuffer(sessionScope, buffer);
      return buffer;
    },

    async setSessionSummary(
      scope: MemoryScope,
      input: SessionSummaryInput,
    ): Promise<SessionBuffer> {
      const sessionScope = requireSessionScope(scope);
      const state = await ensureActiveState(sessionScope);
      const buffer = createSessionBuffer({
        ...state.buffer,
        summary: input.summary,
        summaryUpToIndex: Math.max(
          state.buffer.summaryUpToIndex,
          input.summaryUpToIndex,
        ),
        lastActiveAt: now(),
      });

      await config.sessionStore.saveBuffer(sessionScope, buffer);
      return buffer;
    },

    async updateWorkingMemory(
      scope: MemoryScope,
      patch: WorkingMemoryPatch,
    ): Promise<WorkingMemorySnapshot> {
      const sessionScope = requireSessionScope(scope);
      const state = await ensureActiveState(sessionScope);

      const openLoops = mergeUnique(state.workingMemory.openLoops, patch.openLoops ?? [])
        .filter((item) => !(patch.resolvedOpenLoops ?? []).includes(item));

      const workingMemory = createWorkingMemorySnapshot({
        ...state.workingMemory,
        currentGoal:
          patch.currentGoal === undefined
            ? state.workingMemory.currentGoal
            : patch.currentGoal ?? undefined,
        constraints:
          patch.constraints === undefined
            ? state.workingMemory.constraints
            : patch.constraints ?? undefined,
        openLoops,
        temporaryDecisions:
          patch.temporaryDecisions === undefined
            ? state.workingMemory.temporaryDecisions
            : patch.temporaryDecisions ?? undefined,
        toolState: shallowMergeRecord(state.workingMemory.toolState, patch.toolState),
        state: shallowMergeRecord(state.workingMemory.state, patch.state),
        updatedAt: now(),
      });

      await config.sessionStore.saveWorkingMemory(sessionScope, workingMemory);
      return workingMemory;
    },

    async updateSessionJournal(
      scope: MemoryScope,
      patch: SessionJournalPatch,
    ): Promise<SessionJournal> {
      const sessionScope = requireSessionScope(scope);
      const state = await ensureActiveState(sessionScope);
      const journal = createSessionJournal({
        ...state.journal,
        title: patch.title ?? state.journal.title,
        currentState: patch.currentState ?? state.journal.currentState,
        taskSpecification:
          patch.taskSpecification ?? state.journal.taskSpecification,
        filesAndFunctions:
          patch.filesAndFunctions ?? state.journal.filesAndFunctions,
        workflow: patch.workflow ?? state.journal.workflow,
        errorsAndCorrections:
          patch.errorsAndCorrections ?? state.journal.errorsAndCorrections,
        systemDocumentation:
          patch.systemDocumentation ?? state.journal.systemDocumentation,
        learnings: patch.learnings ?? state.journal.learnings,
        keyResults: patch.keyResults ?? state.journal.keyResults,
        worklog: patch.worklog ?? [
          ...state.journal.worklog,
          ...(patch.appendWorklog ?? []),
        ],
        lastSummarizedMessageId:
          patch.lastSummarizedMessageId ?? state.journal.lastSummarizedMessageId,
        updatedAt: now(),
      });

      await config.sessionStore.saveJournal(sessionScope, journal);
      return journal;
    },

    async getRuntimeRecall(
      scope: MemoryScope,
      profile: "general_chat" | "coding_agent",
    ): Promise<RuntimeRecallSnapshot> {
      const sessionScope = requireSessionScope(scope);
      const state = await ensureActiveState(sessionScope);

      return {
        buffer: state.buffer,
        workingMemory: hasRuntimeSignal(state.workingMemory)
          ? state.workingMemory
          : null,
        journal: profile === "coding_agent" ? state.journal : null,
      };
    },

    async endSession(scope: MemoryScope): Promise<RuntimeContextState> {
      const sessionScope = requireSessionScope(scope);
      const state = await ensureActiveState(sessionScope);
      lifecycle.set(scopeToKey(sessionScope), "ended");
      return state;
    },
  };
}
