import type { ExportMemoryResult } from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import {
  buildWritebackSessionDigest,
  buildWritebackScopeDigest,
  markWritebackAuditForgetFailed,
  markWritebackAuditRecalled,
  markWritebackAuditForgotten,
  readInstalledHostWritebackLedger,
  withInstalledHostWritebackLedgerLock,
  writeInstalledHostWritebackLedger,
} from "./hostWritebackAuditLedger";
import type {
  InstalledHostWritebackAuditEvent,
  InstalledHostWritebackAuditReview,
  InstalledHostWritebackLinkedRecordId,
} from "./hostWritebackAuditLedger";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
} from "./hostExecutionContext";
import type { InstalledHostContextDependencies } from "./hostExecutionContext";
import type { InstalledHostKind } from "./hostInstall";

export interface InstalledHostWritebackAuditRuntimeInput {
  cwd?: string;
  homeRoot?: string;
  host: InstalledHostKind;
}

export interface InspectInstalledHostWritebackAuditInput
  extends InstalledHostWritebackAuditRuntimeInput {
  limit?: number;
}

export interface ForgetInstalledHostWritebackAuditEventInput
  extends InstalledHostWritebackAuditRuntimeInput {
  eventId: string;
  review?: InstalledHostWritebackAuditReview;
}

export interface RecordInstalledHostWritebackRecallInput {
  host: InstalledHostKind;
  homeRoot?: string;
  now?: string;
  recalledRecordIds: string[];
  scope: MemoryScope;
  sessionId?: string;
}

export interface InstalledHostWritebackAuditInspectionEvent
  extends InstalledHostWritebackAuditEvent {
  linkedRecordExistsCount: number;
  memoryExistsCount: number;
}

export interface InstalledHostWritebackAuditInspection {
  events: InstalledHostWritebackAuditInspectionEvent[];
  host: InstalledHostKind;
  legacyUnscopedEventCount: number;
  legacyEventCount: number;
  pendingCount: number;
  scope: MemoryScope;
}

export interface ForgetInstalledHostWritebackAuditEventResult {
  eventId: string;
  forgottenLinkedRecordIds: InstalledHostWritebackLinkedRecordId[];
  forgottenMemoryIds: string[];
  host: InstalledHostKind;
  review?: InstalledHostWritebackAuditReview;
  scope: MemoryScope;
  status: "forgotten";
}

export interface RecordInstalledHostWritebackRecallResult {
  host: InstalledHostKind;
  recalledEventIds: string[];
}

const DEFAULT_AUDIT_INSPECT_LIMIT = 20;

export async function inspectInstalledHostWritebackAudit(
  input: InspectInstalledHostWritebackAuditInput,
  dependencies: InstalledHostContextDependencies = {},
): Promise<InstalledHostWritebackAuditInspection> {
  const resolved = await resolveInstalledHostContext(
    {
      cwd: input.cwd,
      homeRoot: input.homeRoot,
      host: input.host,
    },
    dependencies,
  );
  if (resolved.status !== "ok") {
    throw new Error(`Cannot inspect ${input.host} writeback audit: ${resolved.status}.`);
  }

  const durableScope = toDurableScope(resolved.context.scope);
  const memory = createInstalledHostMemory(resolved.context, dependencies);
  const exported = await memory.exportMemory({ scope: durableScope });
  const existingIds = collectExportedRecordIds(exported);
  const ledger = await readInstalledHostWritebackLedger(input.host, input.homeRoot);
  const scopeDigest = buildWritebackScopeDigest(durableScope);
  const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_AUDIT_INSPECT_LIMIT));
  const scopedDedupeKeyPrefix = `${scopeDigest}:`;
  const events = ledger.auditEvents
    .filter((event) => event.scopeDigest === scopeDigest)
    .slice(-limit)
    .reverse()
    .map((event) => withInspectionCounts(event, existingIds));

  return {
    events,
    host: input.host,
    legacyEventCount: ledger.events.filter((key) => key.startsWith(scopedDedupeKeyPrefix))
      .length,
    legacyUnscopedEventCount: ledger.events.filter((key) => !key.startsWith("scope:"))
      .length,
    pendingCount: ledger.pending.filter((key) => key.startsWith(scopedDedupeKeyPrefix))
      .length,
    scope: durableScope,
  };
}

export async function forgetInstalledHostWritebackAuditEvent(
  input: ForgetInstalledHostWritebackAuditEventInput,
  dependencies: InstalledHostContextDependencies = {},
): Promise<ForgetInstalledHostWritebackAuditEventResult> {
  const resolved = await resolveInstalledHostContext(
    {
      cwd: input.cwd,
      homeRoot: input.homeRoot,
      host: input.host,
    },
    dependencies,
  );
  if (resolved.status !== "ok") {
    throw new Error(`Cannot forget ${input.host} writeback event: ${resolved.status}.`);
  }

  const durableScope = toDurableScope(resolved.context.scope);
  const expectedScopeDigest = buildWritebackScopeDigest(durableScope);
  const memory = createInstalledHostMemory(resolved.context, dependencies);
  const snapshot = await withInstalledHostWritebackLedgerLock(
    input.host,
    input.homeRoot,
    async () => {
      const ledger = await readInstalledHostWritebackLedger(input.host, input.homeRoot);
      const event = ledger.auditEvents.find((item) => item.eventId === input.eventId);
      if (!event) {
        throw new Error(`Unknown writeback audit event: ${input.eventId}.`);
      }
      if (event.scopeDigest !== expectedScopeDigest) {
        throw new Error("Writeback audit event does not belong to the current installed-host scope.");
      }

      const linkedRecordIds: InstalledHostWritebackLinkedRecordId[] = event.linkedRecordIds.length > 0
        ? event.linkedRecordIds
        : event.memoryIds.map((id) => ({ id, type: "memory" as const }));
      if (linkedRecordIds.length === 0) {
        throw new Error(
          `Writeback audit event ${input.eventId} has no linked records to forget.`,
        );
      }
      return { linkedRecordIds };
    },
  );

  const exported = await memory.exportMemory({ scope: durableScope });
  const existingIds = collectExportedRecordIds(exported);
  const notForgettable = snapshot.linkedRecordIds.filter(
    (record) => !record.forgottenAt && !existingIds.has(record.id),
  );
  if (notForgettable.length > 0) {
    throw new Error(
      `Could not forget every linked writeback audit record for event ${input.eventId}.`,
    );
  }

  const forgottenLinkedRecordIds: InstalledHostWritebackLinkedRecordId[] = [];
  const newlyForgottenLinkedRecordIds: InstalledHostWritebackLinkedRecordId[] = [];
  const now = new Date().toISOString();
  try {
    for (const record of snapshot.linkedRecordIds) {
      if (record.forgottenAt) {
        forgottenLinkedRecordIds.push(record);
        continue;
      }
      const result = await memory.forget({
        memoryId: record.id,
        scope: durableScope,
      });
      if (result.forgotten) {
        forgottenLinkedRecordIds.push(record);
        newlyForgottenLinkedRecordIds.push(record);
        continue;
      }
      throw new Error(
        `Could not forget every linked writeback audit record for event ${input.eventId}.`,
      );
    }
  } catch (error) {
    if (newlyForgottenLinkedRecordIds.length > 0) {
      await withInstalledHostWritebackLedgerLock(
        input.host,
        input.homeRoot,
        async () => {
          const ledger = markWritebackAuditForgetFailed(
            await readInstalledHostWritebackLedger(input.host, input.homeRoot),
            {
              eventId: input.eventId,
              forgottenLinkedRecordIds: newlyForgottenLinkedRecordIds,
              now,
            },
          );
          await writeInstalledHostWritebackLedger(input.host, input.homeRoot, ledger);
        },
      );
    }
    throw error;
  }

  const forgottenMemoryIds = forgottenLinkedRecordIds
    .filter((record) => record.type === "memory")
    .map((record) => record.id);
  return await withInstalledHostWritebackLedgerLock(
    input.host,
    input.homeRoot,
    async () => {
      const ledger = markWritebackAuditForgotten(
        await readInstalledHostWritebackLedger(input.host, input.homeRoot),
        {
          eventId: input.eventId,
          forgottenLinkedRecordIds,
          forgottenMemoryIds,
          now,
          ...(input.review ? { review: input.review } : {}),
        },
      );
      await writeInstalledHostWritebackLedger(input.host, input.homeRoot, ledger);
      const updatedEvent = ledger.auditEvents.find((item) => item.eventId === input.eventId);

      return {
        eventId: input.eventId,
        forgottenLinkedRecordIds: updatedEvent?.forgottenLinkedRecordIds ??
          forgottenLinkedRecordIds,
        forgottenMemoryIds: updatedEvent?.forgottenMemoryIds ?? forgottenMemoryIds,
        host: input.host,
        ...(updatedEvent?.review ? { review: updatedEvent.review } : {}),
        scope: durableScope,
        status: "forgotten",
      };
    },
  );
}

export async function recordInstalledHostWritebackRecallHits(
  input: RecordInstalledHostWritebackRecallInput,
): Promise<RecordInstalledHostWritebackRecallResult> {
  const recalledRecordIds = new Set(
    input.recalledRecordIds.filter((id) => id.length > 0),
  );
  const recallSessionDigest = buildWritebackSessionDigest(input.sessionId);
  if (!recallSessionDigest || recalledRecordIds.size === 0) {
    return {
      host: input.host,
      recalledEventIds: [],
    };
  }

  const scopeDigest = buildWritebackScopeDigest(toDurableScope(input.scope));
  return await withInstalledHostWritebackLedgerLock(
    input.host,
    input.homeRoot,
    async () => {
      let ledger = await readInstalledHostWritebackLedger(input.host, input.homeRoot);
      const recalledEventIds: string[] = [];
      const now = input.now ?? new Date().toISOString();

      for (const event of ledger.auditEvents) {
        if (
          event.status !== "committed" ||
          event.scopeDigest !== scopeDigest ||
          !event.sessionDigest ||
          event.sessionDigest === recallSessionDigest ||
          event.recalledBy.some((hit) => hit.sessionDigest === recallSessionDigest)
        ) {
          continue;
        }

        const forgottenMemoryIds = new Set([
          ...event.forgottenMemoryIds,
          ...event.forgottenLinkedRecordIds
            .filter((record) => record.type === "memory")
            .map((record) => record.id),
          ...event.linkedRecordIds
            .filter((record) => record.type === "memory" && record.forgottenAt)
            .map((record) => record.id),
        ]);
        const activeWritebackMemoryIds = event.memoryIds.filter(
          (id) => !forgottenMemoryIds.has(id),
        );
        const wasRecalled = activeWritebackMemoryIds.some(
          (id) => recalledRecordIds.has(id),
        );
        if (!wasRecalled) {
          continue;
        }

        ledger = markWritebackAuditRecalled(ledger, {
          eventId: event.eventId,
          now,
          recallSessionDigest,
        });
        recalledEventIds.push(event.eventId);
      }

      if (recalledEventIds.length > 0) {
        await writeInstalledHostWritebackLedger(input.host, input.homeRoot, ledger);
      }

      return {
        host: input.host,
        recalledEventIds,
      };
    },
  );
}

function withInspectionCounts(
  event: InstalledHostWritebackAuditEvent,
  existingIds: Set<string>,
): InstalledHostWritebackAuditInspectionEvent {
  return {
    ...event,
    linkedRecordExistsCount: event.linkedRecordIds.filter((record) =>
      existingIds.has(record.id),
    ).length,
    memoryExistsCount: event.memoryIds.filter((id) => existingIds.has(id)).length,
  };
}

function collectExportedRecordIds(exported: ExportMemoryResult): Set<string> {
  const ids = new Set<string>();
  for (const record of [
    ...exported.durable.preferences,
    ...exported.durable.references,
    ...exported.durable.facts,
    ...exported.durable.feedback,
    ...exported.durable.episodes,
    ...exported.durable.archives,
    ...exported.durable.evidence,
    ...exported.durable.experiences,
    ...exported.durable.proposals,
    ...exported.durable.promotions,
  ]) {
    ids.add(record.id);
  }
  if (exported.durable.profile) {
    ids.add(exported.durable.profile.userId);
  }
  return ids;
}

function toDurableScope(scope: MemoryScope): MemoryScope {
  const { sessionId: _sessionId, ...durableScope } = scope;
  return durableScope;
}
