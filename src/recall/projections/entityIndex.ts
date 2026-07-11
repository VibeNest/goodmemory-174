import {
  normalizeScope,
  scopeToKey,
} from "../../domain/scope";
import type { MemoryScope } from "../../domain/scope";
import type { DocumentStore } from "../../storage/contracts";
import {
  ENTITIES_COLLECTION,
} from "./contracts";
import type {
  EntityAdjacencyProjection,
  EntityProjection,
  RecallIndexDocument,
  RecallProjectionSourceCollection,
} from "./contracts";
import { buildEntityAdjacencyProjectionId } from "./projector";
import {
  memoryProjectionId,
  normalizeRecallScope,
  matchesScopeFilter,
  recallScopeKey,
  scopeFilter,
} from "./shared";

export interface EntityProjectionIndex {
  query(scope: MemoryScope): Promise<EntityProjection[]>;
  updateForSource(input: {
    collection: RecallProjectionSourceCollection;
    existingDocuments: RecallIndexDocument[];
    newDocuments: RecallIndexDocument[];
    recoverStaleAdjacency: boolean;
    scope: MemoryScope;
    sourceMemoryId: string;
    timestamp: string;
  }): Promise<void>;
}

function firstDefinedTimestamp(
  values: Array<string | undefined>,
): string | undefined {
  return values.filter((value): value is string => Boolean(value)).sort()[0];
}

function lastDefinedTimestamp(
  values: Array<string | undefined>,
): string | undefined {
  const sorted = values.filter((value): value is string => Boolean(value)).sort();
  return sorted.at(-1);
}

function aggregateEntityAdjacencies(
  edges: readonly EntityAdjacencyProjection[],
): EntityProjection[] {
  const grouped = new Map<string, EntityAdjacencyProjection[]>();
  for (const edge of edges) {
    const group = grouped.get(edge.entityId) ?? [];
    group.push(edge);
    grouped.set(edge.entityId, group);
  }
  return [...grouped.entries()]
    .map(([entityId, group]) => {
      const ordered = [...group].sort((left, right) =>
        left.memoryId.localeCompare(right.memoryId),
      );
      const first = ordered[0]!;
      const normalizedScope = normalizeRecallScope(first);
      const description = ordered.find((edge) => edge.description)?.description;
      const validFrom = ordered.every((edge) => edge.validFrom)
        ? firstDefinedTimestamp(ordered.map((edge) => edge.validFrom))
        : undefined;
      const validUntil = ordered.every((edge) => edge.validUntil)
        ? lastDefinedTimestamp(ordered.map((edge) => edge.validUntil))
        : undefined;
      return {
        id: entityId,
        schemaVersion: 1 as const,
        ...normalizedScope,
        scopeKey: recallScopeKey(normalizedScope),
        canonicalKey: first.canonicalKey,
        aliases: [...new Set(ordered.flatMap((edge) => edge.aliases))].sort(),
        ...(description ? { description } : {}),
        memoryIds: ordered.map((edge) => edge.memoryId),
        ...(validFrom ? { validFrom } : {}),
        ...(validUntil ? { validUntil } : {}),
        updatedAt: ordered
          .map((edge) => edge.updatedAt)
          .sort()
          .at(-1)!,
      } satisfies EntityProjection;
    })
    .sort(
      (left, right) =>
        left.canonicalKey.localeCompare(right.canonicalKey) ||
        left.id.localeCompare(right.id),
    );
}

function buildEntitySource(input: {
  documents: RecallIndexDocument[];
  entityId: string;
}): {
  aliases: string[];
  canonicalKey: string;
  description?: string;
  validFrom?: string;
  validUntil?: string;
} | null {
  const mentions = input.documents.flatMap((document) =>
    document.entityMentions.filter(
      (mention) => mention.entityId === input.entityId,
    ),
  );
  const canonicalKey = mentions[0]?.canonicalKey;
  if (!canonicalKey) {
    return null;
  }
  const description = input.documents
    .filter(
      (document) =>
        document.entityIds.includes(input.entityId) &&
        document.granularity === "memory",
    )
    .sort((left, right) => left.id.localeCompare(right.id))[0]?.text.slice(0, 280);
  const matching = input.documents.filter((document) =>
    document.entityIds.includes(input.entityId),
  );
  const validFrom = firstDefinedTimestamp(
    matching.map((document) => document.effectiveFrom),
  );
  const validUntil = lastDefinedTimestamp(
    matching.map((document) => document.effectiveUntil),
  );
  return {
    canonicalKey,
    aliases: [...new Set(mentions.map((mention) => mention.surface))].sort(),
    ...(description ? { description } : {}),
    ...(validFrom ? { validFrom } : {}),
    ...(validUntil ? { validUntil } : {}),
  };
}

export function buildEntityAdjacencyProjections(input: {
  documents: readonly RecallIndexDocument[];
  timestamp: string;
}): EntityAdjacencyProjection[] {
  const documentsByMemory = new Map<string, RecallIndexDocument[]>();
  for (const document of input.documents) {
    const memoryId = memoryProjectionId(
      document.sourceCollection,
      document.sourceMemoryId,
    );
    const documents = documentsByMemory.get(memoryId) ?? [];
    documents.push(document);
    documentsByMemory.set(memoryId, documents);
  }

  const edges: EntityAdjacencyProjection[] = [];
  for (const [memoryId, documents] of documentsByMemory) {
    const first = documents[0]!;
    const normalizedScope = normalizeRecallScope(first);
    for (const entityId of new Set(
      documents.flatMap((document) => document.entityIds),
    )) {
      const source = buildEntitySource({ documents, entityId });
      if (!source) {
        continue;
      }
      edges.push({
        id: buildEntityAdjacencyProjectionId(entityId, memoryId),
        schemaVersion: 1,
        ...normalizedScope,
        scopeKey: recallScopeKey(normalizedScope),
        entityId,
        canonicalKey: source.canonicalKey,
        memoryId,
        aliases: source.aliases,
        ...(source.description ? { description: source.description } : {}),
        ...(source.validFrom ? { validFrom: source.validFrom } : {}),
        ...(source.validUntil ? { validUntil: source.validUntil } : {}),
        updatedAt: input.timestamp,
      });
    }
  }
  return edges.sort((left, right) => left.id.localeCompare(right.id));
}

export function createEntityProjectionIndex(
  documentStore: DocumentStore,
): EntityProjectionIndex {
  async function findEntityIdsForMemory(
    scope: MemoryScope,
    collection: RecallProjectionSourceCollection,
    sourceMemoryId: string,
  ): Promise<Set<string>> {
    const memoryId = memoryProjectionId(collection, sourceMemoryId);
    const entities = await documentStore.query<EntityAdjacencyProjection>(
      ENTITIES_COLLECTION,
      { scopeKey: recallScopeKey(scope), memoryId },
    );
    return new Set(entities.map((entity) => entity.entityId));
  }

  async function updateAdjacency(input: {
    entityId: string;
    memoryId: string;
    scope: MemoryScope;
    source: ReturnType<typeof buildEntitySource>;
    timestamp: string;
  }): Promise<void> {
    const edgeId = buildEntityAdjacencyProjectionId(
      input.entityId,
      input.memoryId,
    );
    if (!input.source) {
      await documentStore.delete(ENTITIES_COLLECTION, edgeId);
      return;
    }
    const normalizedScope = normalizeRecallScope(input.scope);
    const edge: EntityAdjacencyProjection = {
      id: edgeId,
      schemaVersion: 1,
      ...normalizedScope,
      scopeKey: recallScopeKey(normalizedScope),
      entityId: input.entityId,
      canonicalKey: input.source.canonicalKey,
      memoryId: input.memoryId,
      aliases: input.source.aliases,
      ...(input.source.description
        ? { description: input.source.description }
        : {}),
      ...(input.source.validFrom ? { validFrom: input.source.validFrom } : {}),
      ...(input.source.validUntil ? { validUntil: input.source.validUntil } : {}),
      updatedAt: input.timestamp,
    };
    await documentStore.set(ENTITIES_COLLECTION, edge.id, edge);
  }

  return {
    async query(scope) {
      const queried = await documentStore.query<EntityAdjacencyProjection>(
        ENTITIES_COLLECTION,
        scopeFilter(scope),
      );
      return aggregateEntityAdjacencies(
        queried.filter((edge) => matchesScopeFilter(edge, scope)),
      );
    },
    async updateForSource(input) {
      const memoryId = memoryProjectionId(
        input.collection,
        input.sourceMemoryId,
      );
      const entityIds = new Set([
        ...input.existingDocuments.flatMap((document) => document.entityIds),
        ...input.newDocuments.flatMap((document) => document.entityIds),
      ]);
      if (input.recoverStaleAdjacency) {
        for (const entityId of await findEntityIdsForMemory(
          input.scope,
          input.collection,
          input.sourceMemoryId,
        )) {
          entityIds.add(entityId);
        }
      }
      for (const entityId of entityIds) {
        await updateAdjacency({
          entityId,
          memoryId,
          scope: input.scope,
          source: buildEntitySource({
            documents: input.newDocuments,
            entityId,
          }),
          timestamp: input.timestamp,
        });
      }
    },
  };
}
