import type {
  DocumentStore,
  StorageDocument,
  StorageFilter,
} from "../storage/contracts";

// Opt-in cross-host read union (config sharedAgents). The storage filter is
// strict equality, so agentId-less "shared" records would be invisible to
// every host scope, and dropping agentId from the recall scope would hide
// the host's own records behind the default scope guard. The honest minimal
// design is a read-side decorator: own-agent queries re-issue without the
// agentId key and post-filter to own ∪ shared. Writes pass through with the
// writing host's agentId — provenance stays intact, sharing is read-only,
// and symmetric sharing means both hosts opt in.
//
// v1 scope: document reads only (the lexical/BM25 path). Semantic vector
// search does not union shared agents yet; doctor surfaces that limitation
// when sharedAgents is combined with an embedding provider.

export interface SharedAgentStoreOptions {
  ownAgentId: string;
  sharedAgentIds: string[];
}

export function wrapDocumentStoreForSharedAgents(
  store: DocumentStore,
  options: SharedAgentStoreOptions,
): DocumentStore {
  const visibleAgents = new Set([options.ownAgentId, ...options.sharedAgentIds]);

  const wrapped: DocumentStore = {
    delete: (collection, id) => store.delete(collection, id),
    get: (collection, id) => store.get(collection, id),
    async query<TDocument extends StorageDocument>(
      collection: string,
      filter?: StorageFilter,
    ): Promise<TDocument[]> {
      if (!filter || filter.agentId !== options.ownAgentId) {
        return store.query<TDocument>(collection, filter);
      }
      const { agentId: _ownAgentId, ...rest } = filter;
      const results = await store.query<TDocument>(collection, rest);
      return results.filter((record) => {
        const agentId = (record as Record<string, unknown>).agentId;
        return typeof agentId === "string" && visibleAgents.has(agentId);
      });
    },
    set: (collection, id, document) => store.set(collection, id, document),
    update: (collection, id, patch) => store.update(collection, id, patch),
  };

  // Preserve optional-capability detection on the base store.
  if (store.writeBatchIfUnchanged) {
    wrapped.writeBatchIfUnchanged = (input) => store.writeBatchIfUnchanged!(input);
  }

  return wrapped;
}
