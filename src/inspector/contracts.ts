import type { MemoryScope } from "../domain/scope";

/**
 * One distinct stored scope-tuple discovered by the scope index, with a
 * per-collection record breakdown. `scopeKey` is the canonical `scopeToKey`
 * grouping key; `counts` carries only the collections with at least one record.
 *
 * This reports distinct *stored* scope-tuples. Recall/forget broadening
 * (a narrower query scope matching a broader stored scope) is a retrieval
 * concept, not scope identity — the UI must surface that a forget/delete at a
 * broad scope can cascade to narrower ones.
 */
export interface ScopeSummary {
  scope: MemoryScope;
  scopeKey: string;
  counts: Record<string, number>;
  totalRecords: number;
  lastUpdatedAt?: string;
}

/**
 * Honest disclosure of what the scope index could and could not see. v1 scans
 * only the durable DocumentStore collections; session-only and vector-only
 * scopes are structurally invisible because neither store exposes an
 * enumeration primitive. These flags are literal `false` to make the gap
 * explicit in the type, not just the data.
 */
export interface ScopeIndexCoverage {
  collectionsScanned: string[];
  sessionStoreScanned: false;
  vectorStoreScanned: false;
  blindSpots: string[];
}

export interface ScopeIndexResult {
  generatedAt: string;
  scopes: ScopeSummary[];
  coverage: ScopeIndexCoverage;
}
