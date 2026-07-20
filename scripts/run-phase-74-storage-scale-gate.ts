import { Database } from "bun:sqlite";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildClaimProjectionSearchText,
  buildClaimProjectionStatusId,
} from "../src/recall/projections/claims";
import {
  CLAIM_PROJECTIONS_COLLECTION,
  CLAIM_PROJECTION_STATUS_COLLECTION,
  ENTITIES_COLLECTION,
} from "../src/recall/projections/contracts";
import type {
  ClaimProjection,
  ClaimProjectionStatus,
  EntityAdjacencyProjection,
} from "../src/recall/projections/contracts";
import { buildEntityProjectionSearchText } from "../src/recall/projections/entityIndex";
import { createRecallProjectionRuntime } from "../src/recall/projections/runtime";
import { recallScopeKey } from "../src/recall/projections/shared";
import type { ProjectionCapableDocumentStore } from "../src/storage/contracts";
import { createSQLiteDocumentStore } from "../src/storage/sqlite";
import { buildDocumentSearchQuery } from "../src/storage/textSearch";

const DEFAULT_MEASURED_QUERY_COUNT = 40;
const DEFAULT_SYNTHETIC_DOCUMENT_COUNT = 100_000;
const DEFAULT_WARMUP_QUERY_COUNT = 5;
const QUERY_SHARD_COUNT = 2_048;
const SCALE_GATE_P95_THRESHOLD_MS = 500;
const SELECTED_LIMIT = 12;
const SENTINEL_ID = "__full_collection_deserialization_sentinel__";
const SCOPE = {
  userId: "phase-74-scale-user",
  workspaceId: "phase-74-scale-workspace",
};
const SCOPE_KEY = recallScopeKey(SCOPE);
const TIMESTAMP = "2026-07-18T00:00:00.000Z";

interface QueryPlanRow {
  detail: string;
}

interface StoreMethodCalls {
  get: number;
  query: number;
  queryPage: number;
  searchText: number;
}

interface ProjectionCounts {
  claims: number;
  entities: number;
  statuses: number;
}

export interface Phase74StorageScaleGateOptions {
  measuredQueryCount?: number;
  onProgress?: (message: string) => void;
  syntheticDocumentCount?: number;
  thresholdMs?: number;
  warmupQueryCount?: number;
}

export interface Phase74StorageScaleGateReport {
  audit: {
    ftsIndexedDocumentCount: number;
    maxMaterializedDocumentsPerQuery: number;
    methodCalls: StoreMethodCalls;
    nonMatchingInvalidJsonSentinelDidNotBreakSearch: boolean;
    projectionCounts: ProjectionCounts;
    sqlQueryPlan: string[];
    storedRowCount: number;
    usesFtsVirtualTableIndex: boolean;
  };
  database: "sqlite";
  gate: "claim-entity-projection-query";
  generatedAt: string;
  latencyMs: {
    max: number;
    mean: number;
    min: number;
    p50: number;
    p95: number;
    p99: number;
  };
  measuredQueryCount: number;
  passed: boolean;
  phase: "phase-74";
  selectedLimit: number;
  syntheticDocumentCount: number;
  thresholdMs: number;
  warmupQueryCount: number;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function percentile(sortedValues: readonly number[], probability: number): number {
  const index = Math.max(0, Math.ceil(sortedValues.length * probability) - 1);
  return sortedValues[index]!;
}

function queryTerm(iteration: number, perChannelDocumentCount: number): string {
  const shardCount = Math.min(QUERY_SHARD_COUNT, perChannelDocumentCount);
  return `shard${(iteration * 37) % shardCount}`;
}

function createAuditedStore(inner: ProjectionCapableDocumentStore): {
  methodCalls: StoreMethodCalls;
  store: ProjectionCapableDocumentStore;
} {
  const methodCalls: StoreMethodCalls = {
    get: 0,
    query: 0,
    queryPage: 0,
    searchText: 0,
  };
  const store: ProjectionCapableDocumentStore = {
    projectionBatchSemantics: inner.projectionBatchSemantics,
    async set(collection, id, document) {
      return inner.set(collection, id, document);
    },
    async get(collection, id) {
      methodCalls.get += 1;
      return inner.get(collection, id);
    },
    async update(collection, id, patch) {
      return inner.update(collection, id, patch);
    },
    async query(collection, filter) {
      methodCalls.query += 1;
      return inner.query(collection, filter);
    },
    async queryPage(collection, input) {
      methodCalls.queryPage += 1;
      return inner.queryPage!(collection, input);
    },
    async searchText(collection, input) {
      methodCalls.searchText += 1;
      return inner.searchText!(collection, input);
    },
    async writeBatchIfUnchanged(input) {
      return inner.writeBatchIfUnchanged(input);
    },
    async delete(collection, id) {
      return inner.delete(collection, id);
    },
  };
  return { methodCalls, store };
}

function createClaim(index: number): ClaimProjection {
  const suffix = index.toString().padStart(6, "0");
  const sourceMemoryId = `memory-${suffix}`;
  const predicateKey = "project.status";
  const objectText = `Durable claim shard${index % QUERY_SHARD_COUNT} sequence${index}`;
  return {
    id: `claim-${suffix}`,
    schemaVersion: 1,
    ...SCOPE,
    scopeKey: SCOPE_KEY,
    sourceMemoryId,
    subjectEntityId: "entity:phase-74-scale-project",
    predicateKey,
    objectText,
    text: buildClaimProjectionSearchText({
      subject: "Phase 74 scale project",
      predicateKey,
      objectText,
      polarity: "positive",
      modality: "asserted",
    }),
    polarity: "positive",
    modality: "asserted",
    observedAt: TIMESTAMP,
    ingestedAt: TIMESTAMP,
    evidenceIds: [`evidence-${suffix}`],
    sourceMessageIds: [`message-${suffix}`],
    extractorVersion: "phase-74-scale-v1",
  };
}

function createClaimStatus(claim: ClaimProjection): ClaimProjectionStatus {
  return {
    id: buildClaimProjectionStatusId(SCOPE, claim.sourceMemoryId),
    schemaVersion: 1,
    ...SCOPE,
    scopeKey: SCOPE_KEY,
    sourceMemoryId: claim.sourceMemoryId,
    state: "projected",
    claimIds: [claim.id],
    extractorVersion: claim.extractorVersion,
    sourceUpdatedAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function createEntity(index: number): EntityAdjacencyProjection {
  const suffix = index.toString().padStart(6, "0");
  const canonicalKey = `entity shard${index % QUERY_SHARD_COUNT}`;
  const aliases = [`Entity ${index}`];
  const description = `Durable entity projection sequence${index}`;
  return {
    id: `entity-edge-${suffix}`,
    schemaVersion: 1,
    ...SCOPE,
    scopeKey: SCOPE_KEY,
    entityId: `entity-${suffix}`,
    canonicalKey,
    memoryId: `facts:entity-memory-${suffix}`,
    aliases,
    description,
    text: buildEntityProjectionSearchText({
      aliases,
      canonicalKey,
      description,
    }),
    updatedAt: TIMESTAMP,
  };
}

function seedProjectionDocuments(input: {
  databasePath: string;
  onProgress?: (message: string) => void;
  syntheticDocumentCount: number;
}): {
  ftsIndexedDocumentCount: number;
  projectionCounts: ProjectionCounts;
  storedRowCount: number;
} {
  const claims = Math.ceil(input.syntheticDocumentCount / 2);
  const entities = input.syntheticDocumentCount - claims;
  const projectionCounts = { claims, entities, statuses: claims };
  const database = new Database(input.databasePath, { strict: true });
  const insertDocument = database.query(
    `INSERT INTO documents (collection, id, json) VALUES (?1, ?2, ?3)`,
  );
  const insertFts = database.query(
    `INSERT INTO document_text_fts (collection, id, text) VALUES (?1, ?2, ?3)`,
  );

  database.exec("PRAGMA synchronous = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < claims; index += 1) {
      const claim = createClaim(index);
      const status = createClaimStatus(claim);
      insertDocument.run(
        CLAIM_PROJECTIONS_COLLECTION,
        claim.id,
        JSON.stringify(claim),
      );
      insertFts.run(CLAIM_PROJECTIONS_COLLECTION, claim.id, claim.text!);
      insertDocument.run(
        CLAIM_PROJECTION_STATUS_COLLECTION,
        status.id,
        JSON.stringify(status),
      );
      if ((index + 1) % 25_000 === 0) {
        input.onProgress?.(`seeded ${index + 1} claim projections`);
      }
    }
    for (let index = 0; index < entities; index += 1) {
      const entity = createEntity(index);
      insertDocument.run(ENTITIES_COLLECTION, entity.id, JSON.stringify(entity));
      insertFts.run(ENTITIES_COLLECTION, entity.id, entity.text!);
      if ((index + 1) % 25_000 === 0) {
        input.onProgress?.(`seeded ${index + 1} entity projections`);
      }
    }

    for (const collection of [CLAIM_PROJECTIONS_COLLECTION, ENTITIES_COLLECTION]) {
      insertDocument.run(collection, SENTINEL_ID, "{not-json");
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const storedRowCount = database
    .query<{ count: number }, [string, string, string]>(
      `SELECT count(*) AS count FROM documents
       WHERE collection IN (?1, ?2, ?3)`,
    )
    .get(
      CLAIM_PROJECTIONS_COLLECTION,
      CLAIM_PROJECTION_STATUS_COLLECTION,
      ENTITIES_COLLECTION,
    )!.count;
  const ftsIndexedDocumentCount = database
    .query<{ count: number }, [string, string]>(
      `SELECT count(*) AS count FROM document_text_fts
       WHERE collection IN (?1, ?2)`,
    )
    .get(CLAIM_PROJECTIONS_COLLECTION, ENTITIES_COLLECTION)!.count;
  database.close();
  return { ftsIndexedDocumentCount, projectionCounts, storedRowCount };
}

function readFtsQueryPlan(databasePath: string, collection: string): string[] {
  const database = new Database(databasePath, { readonly: true, strict: true });
  const plan = database
    .query<QueryPlanRow, [string, string, string, number]>(
      `EXPLAIN QUERY PLAN
       SELECT documents.id, documents.json, bm25(document_text_fts) AS score
       FROM document_text_fts
       JOIN documents
         ON documents.collection = document_text_fts.collection
        AND documents.id = document_text_fts.id
       WHERE document_text_fts MATCH ?1
         AND document_text_fts.collection = ?2
         AND json_extract(documents.json, '$.scopeKey') = ?3
       ORDER BY score ASC, documents.id ASC
       LIMIT ?4`,
    )
    .all(buildDocumentSearchQuery("shard0"), collection, SCOPE_KEY, SELECTED_LIMIT)
    .map(({ detail }) => `${collection}: ${detail}`);
  database.close();
  return plan;
}

export async function runPhase74StorageScaleGate(
  options: Phase74StorageScaleGateOptions = {},
): Promise<Phase74StorageScaleGateReport> {
  const measuredQueryCount = options.measuredQueryCount ??
    DEFAULT_MEASURED_QUERY_COUNT;
  const syntheticDocumentCount = options.syntheticDocumentCount ??
    DEFAULT_SYNTHETIC_DOCUMENT_COUNT;
  const thresholdMs = options.thresholdMs ?? SCALE_GATE_P95_THRESHOLD_MS;
  const warmupQueryCount = options.warmupQueryCount ?? DEFAULT_WARMUP_QUERY_COUNT;
  assertPositiveInteger(measuredQueryCount, "measuredQueryCount");
  assertPositiveInteger(syntheticDocumentCount, "syntheticDocumentCount");
  if (syntheticDocumentCount < 2) {
    throw new Error("syntheticDocumentCount must cover claim and entity projections.");
  }
  assertPositiveInteger(thresholdMs, "thresholdMs");
  assertPositiveInteger(warmupQueryCount, "warmupQueryCount");

  const databasePath = join(
    tmpdir(),
    `goodmemory-phase-74-scale-${process.pid}-${Date.now()}-${Math.random()}.db`,
  );
  try {
    const innerStore = createSQLiteDocumentStore(databasePath);
    const seedAudit = seedProjectionDocuments({
      databasePath,
      onProgress: options.onProgress,
      syntheticDocumentCount,
    });
    const sqlQueryPlan = [
      ...readFtsQueryPlan(databasePath, CLAIM_PROJECTIONS_COLLECTION),
      ...readFtsQueryPlan(databasePath, ENTITIES_COLLECTION),
    ];
    const { methodCalls, store } = createAuditedStore(innerStore);
    const runtime = createRecallProjectionRuntime({ documentStore: store });
    const perChannelDocumentCount = Math.min(
      seedAudit.projectionCounts.claims,
      seedAudit.projectionCounts.entities,
    );
    let maxMaterializedDocumentsPerQuery = 0;

    const executeSearch = async (iteration: number): Promise<void> => {
      const query = queryTerm(iteration, perChannelDocumentCount);
      const [claims, entities] = await Promise.all([
        runtime.searchClaims(SCOPE, query, SELECTED_LIMIT),
        runtime.searchEntities(SCOPE, query, SELECTED_LIMIT),
      ]);
      if (claims.length === 0 || entities.length === 0) {
        throw new Error(
          `Scale query ${iteration} did not traverse both projection channels.`,
        );
      }
      maxMaterializedDocumentsPerQuery = Math.max(
        maxMaterializedDocumentsPerQuery,
        claims.length,
        entities.length,
      );
    };

    for (let index = 0; index < warmupQueryCount; index += 1) {
      await executeSearch(index);
    }

    const latencies: number[] = [];
    for (let index = 0; index < measuredQueryCount; index += 1) {
      const startedAt = performance.now();
      await executeSearch(warmupQueryCount + index);
      latencies.push(performance.now() - startedAt);
    }
    latencies.sort((left, right) => left - right);
    const latencyMs = {
      max: roundMilliseconds(latencies.at(-1)!),
      mean: roundMilliseconds(
        latencies.reduce((total, latency) => total + latency, 0) /
          latencies.length,
      ),
      min: roundMilliseconds(latencies[0]!),
      p50: roundMilliseconds(percentile(latencies, 0.5)),
      p95: roundMilliseconds(percentile(latencies, 0.95)),
      p99: roundMilliseconds(percentile(latencies, 0.99)),
    };
    const expectedSearchCount = 2 *
      (warmupQueryCount + measuredQueryCount);
    const usesFtsVirtualTableIndex = [
      CLAIM_PROJECTIONS_COLLECTION,
      ENTITIES_COLLECTION,
    ].every((collection) =>
      sqlQueryPlan.some((detail) =>
        detail.startsWith(`${collection}:`) &&
        /document_text_fts VIRTUAL TABLE INDEX/i.test(detail)
      )
    );
    const expectedStoredRows = syntheticDocumentCount +
      seedAudit.projectionCounts.statuses + 2;
    const nonMatchingInvalidJsonSentinelDidNotBreakSearch =
      seedAudit.storedRowCount === expectedStoredRows;
    const maximumStatusGets =
      (warmupQueryCount + measuredQueryCount) * SELECTED_LIMIT;
    const passed = latencyMs.p95 <= thresholdMs &&
      methodCalls.get > 0 &&
      methodCalls.get <= maximumStatusGets &&
      methodCalls.query === 0 &&
      methodCalls.queryPage === 0 &&
      methodCalls.searchText === expectedSearchCount &&
      usesFtsVirtualTableIndex &&
      nonMatchingInvalidJsonSentinelDidNotBreakSearch &&
      seedAudit.ftsIndexedDocumentCount === syntheticDocumentCount &&
      maxMaterializedDocumentsPerQuery <= SELECTED_LIMIT;

    return {
      audit: {
        ...seedAudit,
        maxMaterializedDocumentsPerQuery,
        methodCalls,
        nonMatchingInvalidJsonSentinelDidNotBreakSearch,
        sqlQueryPlan,
        usesFtsVirtualTableIndex,
      },
      database: "sqlite",
      gate: "claim-entity-projection-query",
      generatedAt: new Date().toISOString(),
      latencyMs,
      measuredQueryCount,
      passed,
      phase: "phase-74",
      selectedLimit: SELECTED_LIMIT,
      syntheticDocumentCount,
      thresholdMs,
      warmupQueryCount,
    };
  } finally {
    await Promise.all([
      rm(databasePath, { force: true }),
      rm(`${databasePath}-shm`, { force: true }),
      rm(`${databasePath}-wal`, { force: true }),
    ]);
  }
}

if (import.meta.main) {
  const report = await runPhase74StorageScaleGate({
    onProgress(message) {
      console.error(`[phase-74-storage-scale] ${message}`);
    },
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) {
    process.exitCode = 1;
  }
}
