import { createHash } from "node:crypto";

import { scopeToKey } from "../domain/scope";
import type { MemoryScope } from "../domain/scope";
import type { ProjectionCapableDocumentStore } from "../storage/contracts";
import type { ExtractionOutcome } from "./contracts";

export const EXTRACTION_CURSORS_COLLECTION = "extraction_cursors_v1";

export interface ExtractionCursorAttempt {
  attempts: number;
  errorCode?: string;
  outcome: ExtractionOutcome;
  through: number;
  updatedAt: string;
}

export interface ExtractionCursor {
  committedThrough: number;
  id: string;
  lastAttempt: ExtractionCursorAttempt;
  schemaVersion: 1;
  scopeKey: string;
  sourceId: string;
}

export interface ExtractionCursorStore {
  get(scope: MemoryScope, sourceId: string): Promise<ExtractionCursor | null>;
  record(input: {
    errorCode?: string;
    outcome: ExtractionOutcome;
    scope: MemoryScope;
    sourceId: string;
    through: number;
  }): Promise<ExtractionCursor>;
}

function cursorId(scopeKey: string, sourceId: string): string {
  return createHash("sha256")
    .update(scopeKey)
    .update("\0")
    .update(sourceId)
    .digest("hex");
}

function assertSourceId(sourceId: string): string {
  const normalized = sourceId.trim();
  if (normalized.length === 0) {
    throw new Error("Extraction cursor sourceId must be non-empty.");
  }
  return normalized;
}

function assertThrough(through: number): void {
  if (!Number.isSafeInteger(through) || through < 0) {
    throw new Error("Extraction cursor offset must be a non-negative integer.");
  }
}

function isTerminal(outcome: ExtractionOutcome): boolean {
  return outcome === "committed" || outcome === "no_admissible_candidate";
}

export function createExtractionCursorStore(input: {
  documentStore: ProjectionCapableDocumentStore;
  now: () => string;
}): ExtractionCursorStore {
  const { documentStore, now } = input;

  async function get(
    scope: MemoryScope,
    sourceId: string,
  ): Promise<ExtractionCursor | null> {
    const scopeKey = scopeToKey(scope);
    const normalizedSourceId = assertSourceId(sourceId);
    return documentStore.get<ExtractionCursor>(
      EXTRACTION_CURSORS_COLLECTION,
      cursorId(scopeKey, normalizedSourceId),
    );
  }

  return {
    get,
    async record(recordInput) {
      assertThrough(recordInput.through);
      const scopeKey = scopeToKey(recordInput.scope);
      const sourceId = assertSourceId(recordInput.sourceId);
      const id = cursorId(scopeKey, sourceId);

      for (let writeAttempt = 0; writeAttempt < 8; writeAttempt += 1) {
        const current = await documentStore.get<ExtractionCursor>(
          EXTRACTION_CURSORS_COLLECTION,
          id,
        );
        if (current && recordInput.through <= current.committedThrough) {
          return current;
        }
        let newerAttempt: ExtractionCursorAttempt | undefined;
        if (current && recordInput.through < current.lastAttempt.through) {
          if (!isTerminal(recordInput.outcome)) {
            return current;
          }
          newerAttempt = current.lastAttempt;
        }
        const attempts = current?.lastAttempt.through === recordInput.through
          ? current.lastAttempt.attempts + 1
          : 1;
        const next: ExtractionCursor = {
          committedThrough: isTerminal(recordInput.outcome)
            ? Math.max(current?.committedThrough ?? 0, recordInput.through)
            : current?.committedThrough ?? 0,
          id,
          lastAttempt: newerAttempt
            ? newerAttempt
            : {
                attempts,
                ...(recordInput.errorCode === undefined
                  ? {}
                  : { errorCode: recordInput.errorCode }),
                outcome: recordInput.outcome,
                through: recordInput.through,
                updatedAt: now(),
              },
          schemaVersion: 1,
          scopeKey,
          sourceId,
        };
        const committed = await documentStore.writeBatchIfUnchanged({
          expected: {
            collection: EXTRACTION_CURSORS_COLLECTION,
            document: current,
            id,
          },
          set: [{
            collection: EXTRACTION_CURSORS_COLLECTION,
            document: next,
            id,
          }],
        });
        if (committed) {
          return next;
        }
      }
      throw new Error("Extraction cursor could not be committed after retries.");
    },
  };
}
