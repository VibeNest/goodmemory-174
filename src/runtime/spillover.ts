import type { ArtifactSpillRecord } from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import { scopeToKey } from "../domain/scope";
import type { DocumentStore } from "../storage/contracts";

const SPILL_COLLECTION = "artifact_spills";

export interface SpillInput {
  kind: ArtifactSpillRecord["kind"];
  sourceId: string;
  content: string;
  storageUri?: string;
}

export interface ArtifactSpilloverServiceConfig {
  documentStore: DocumentStore;
  previewChars?: number;
}

function buildStableHandle(scope: MemoryScope, sourceId: string): string {
  const value = `${scopeToKey(scope)}::${sourceId}`;
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function buildPreview(content: string, previewChars: number): string {
  if (content.length <= previewChars) {
    return content;
  }

  return `${content.slice(0, previewChars).trimEnd()}...`;
}

function buildRecordId(scope: MemoryScope, sourceId: string): string {
  return `${scopeToKey(scope)}::${sourceId}`;
}

export function createArtifactSpilloverService(
  config: ArtifactSpilloverServiceConfig,
) {
  const previewChars = Math.max(config.previewChars ?? 280, 8);

  return {
    async spill(scope: MemoryScope, input: SpillInput): Promise<ArtifactSpillRecord> {
      const recordId = buildRecordId(scope, input.sourceId);
      const existing = await config.documentStore.get<ArtifactSpillRecord>(
        SPILL_COLLECTION,
        recordId,
      );

      const record: ArtifactSpillRecord = {
        id: existing?.id ?? recordId,
        scope,
        kind: input.kind,
        sourceId: input.sourceId,
        preview: buildPreview(input.content, previewChars),
        replacementText:
          existing?.replacementText ??
          `[[spill:${input.kind}:${buildStableHandle(scope, input.sourceId)}]]`,
        storageUri:
          input.storageUri ??
          existing?.storageUri ??
          `memory://artifact-spills/${encodeURIComponent(recordId)}`,
        originalBytes: new TextEncoder().encode(input.content).length,
        createdAt: existing?.createdAt ?? new Date(0).toISOString(),
      };

      await config.documentStore.set(SPILL_COLLECTION, recordId, record);
      return record;
    },

    async getBySource(
      scope: MemoryScope,
      sourceId: string,
    ): Promise<ArtifactSpillRecord | null> {
      return config.documentStore.get(
        SPILL_COLLECTION,
        buildRecordId(scope, sourceId),
      );
    },
  };
}
