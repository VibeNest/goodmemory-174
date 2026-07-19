import { createHash } from "node:crypto";

import { isActiveMemoryLifecycle } from "../../domain/records";
import type { FactMemory } from "../../domain/records";
import { normalizeScope } from "../../domain/scope";
import type { MemoryScope } from "../../domain/scope";
import type { EvidenceRecord } from "../../evidence/contracts";
import type {
  ProjectionCapableDocumentStore,
  StorageDocument,
} from "../../storage/contracts";
import {
  CLAIM_PROJECTIONS_COLLECTION,
  CLAIM_PROJECTION_STATUS_COLLECTION,
} from "./contracts";
import type {
  AppendClaimProjectionInput,
  ClaimProjection,
  ClaimProjectionState,
  ClaimProjectionStatus,
} from "./contracts";
import { buildEntityProjectionId, resolveProjectionScope } from "./projector";
import {
  matchesScopeFilter,
  recallScopeKey,
  scopeFilter,
} from "./shared";

export interface ClaimProjectionIndex {
  append(
    input: AppendClaimProjectionInput,
    state?: ClaimProjectionState,
  ): Promise<ClaimProjection | null>;
  markFailed(input: AppendClaimProjectionInput, error: unknown): Promise<void>;
  query(scope: MemoryScope): Promise<ClaimProjection[]>;
  queryHistory(scope: MemoryScope): Promise<ClaimProjection[]>;
  rebuildScope(input: {
    scope: MemoryScope;
    sources: readonly ClaimProjectionCanonicalSource[];
    timestamp: string;
  }): Promise<void>;
  synchronizeFact(input: {
    document: StorageDocument | null;
    evidence?: readonly EvidenceRecord[];
    fallbackScope?: MemoryScope;
    sourceMemoryId: string;
    timestamp: string;
  }): Promise<void>;
}

export interface ClaimProjectionCanonicalSource {
  collection: string;
  document: StorageDocument;
  evidence?: readonly EvidenceRecord[];
  id: string;
}

function stableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${prefix}:${digest}`;
}

function canonicalEntity(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function statusId(scope: MemoryScope, sourceMemoryId: string): string {
  return stableId("claim-status", `${recallScopeKey(scope)}\u0000${sourceMemoryId}`);
}

function projectionId(input: Omit<ClaimProjection, "id">): string {
  return stableId("claim", JSON.stringify({
    scopeKey: input.scopeKey,
    sourceMemoryId: input.sourceMemoryId,
    subjectEntityId: input.subjectEntityId,
    predicateKey: input.predicateKey,
    objectText: input.objectText,
    objectEntityId: input.objectEntityId,
    polarity: input.polarity,
    modality: input.modality,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    observedAt: input.observedAt,
    ingestedAt: input.ingestedAt,
    evidenceIds: input.evidenceIds,
    sourceMessageIds: input.sourceMessageIds,
    extractorVersion: input.extractorVersion,
    confidence: input.confidence,
    contextualDescriptor: input.contextualDescriptor,
  }));
}

function isFactMemory(document: StorageDocument): document is FactMemory {
  const record = document as Partial<FactMemory>;
  return typeof record.id === "string" && typeof record.content === "string";
}

function selectedClaims(
  statuses: readonly ClaimProjectionStatus[],
  history: readonly ClaimProjection[],
): ClaimProjection[] {
  const selectedIds = new Set(statuses.flatMap((status) => status.claimIds));
  return history
    .filter((claim) => selectedIds.has(claim.id))
    .sort((left, right) =>
      left.ingestedAt.localeCompare(right.ingestedAt) || left.id.localeCompare(right.id),
    );
}

export function createClaimProjectionIndex(
  documentStore: ProjectionCapableDocumentStore,
): ClaimProjectionIndex {
  async function queryStatuses(scope: MemoryScope): Promise<ClaimProjectionStatus[]> {
    const queried = await documentStore.query<ClaimProjectionStatus>(
      CLAIM_PROJECTION_STATUS_COLLECTION,
      scopeFilter(scope),
    );
    return queried.filter((status) => matchesScopeFilter(status, scope));
  }

  async function queryHistory(scope: MemoryScope): Promise<ClaimProjection[]> {
    const queried = await documentStore.query<ClaimProjection>(
      CLAIM_PROJECTIONS_COLLECTION,
      scopeFilter(scope),
    );
    return queried
      .filter((claim) => matchesScopeFilter(claim, scope))
      .sort((left, right) =>
        left.ingestedAt.localeCompare(right.ingestedAt) || left.id.localeCompare(right.id),
      );
  }

  async function append(
    input: AppendClaimProjectionInput,
    state: ClaimProjectionState = "projected",
  ): Promise<ClaimProjection | null> {
    const normalized = normalizeScope(input);
    const sourceFact = await documentStore.get<FactMemory>(
      "facts",
      input.sourceMemoryId,
    );
    if (
      !sourceFact ||
      !matchesScopeFilter(sourceFact, normalized) ||
      !isActiveMemoryLifecycle(sourceFact) ||
      sourceFact.isActive === false
    ) {
      return null;
    }
    const id = statusId(normalized, input.sourceMemoryId);
    const existingStatus = await documentStore.get<ClaimProjectionStatus>(
      CLAIM_PROJECTION_STATUS_COLLECTION,
      id,
    );
    if (existingStatus?.sourceUpdatedAt) {
      const timeOrder = existingStatus.sourceUpdatedAt.localeCompare(input.ingestedAt);
      const structuredPromotion =
        timeOrder === 0 &&
        existingStatus.state === "unstructured" &&
        state === "projected";
      const provenanceEnrichment =
        timeOrder === 0 &&
        existingStatus.state === "unstructured" &&
        state === "unstructured";
      if (
        timeOrder > 0 ||
        (timeOrder === 0 &&
          existingStatus.state !== "failed" &&
          !structuredPromotion &&
          !provenanceEnrichment)
      ) {
        return null;
      }
    }
    const scopeKey = recallScopeKey(normalized);
    const subjectKey = canonicalEntity(input.subject);
    const objectEntityKey = input.claim.objectEntity
      ? canonicalEntity(input.claim.objectEntity)
      : undefined;
    const projectionWithoutId: Omit<ClaimProjection, "id"> = {
      schemaVersion: 1,
      ...normalized,
      scopeKey,
      sourceMemoryId: input.sourceMemoryId,
      subjectEntityId: buildEntityProjectionId(scopeKey, subjectKey),
      predicateKey: input.claim.predicateKey.trim(),
      objectText: input.claim.objectText.trim(),
      ...(objectEntityKey
        ? { objectEntityId: buildEntityProjectionId(scopeKey, objectEntityKey) }
        : {}),
      polarity: input.claim.polarity ?? "positive",
      modality: input.claim.modality ?? "asserted",
      ...(input.claim.validFrom ? { validFrom: input.claim.validFrom } : {}),
      ...(input.claim.validUntil ? { validUntil: input.claim.validUntil } : {}),
      observedAt: input.observedAt,
      ingestedAt: input.ingestedAt,
      evidenceIds: [...new Set(input.evidenceIds)],
      sourceMessageIds: [...new Set(input.sourceMessageIds)],
      extractorVersion: input.extractorVersion,
      ...(input.claim.confidence !== undefined
        ? { confidence: input.claim.confidence }
        : {}),
      ...(input.contextualDescriptor
        ? { contextualDescriptor: input.contextualDescriptor }
        : {}),
    };
    const claim: ClaimProjection = {
      id: projectionId(projectionWithoutId),
      ...projectionWithoutId,
    };
    const status: ClaimProjectionStatus = {
      id,
      schemaVersion: 1,
      ...normalized,
      scopeKey,
      sourceMemoryId: input.sourceMemoryId,
      state,
      claimIds: [claim.id],
      extractorVersion: input.extractorVersion,
      sourceUpdatedAt: input.ingestedAt,
      updatedAt: input.ingestedAt,
    };
    const committed = await documentStore.writeBatchIfUnchanged({
      expected: {
        collection: "facts",
        id: sourceFact.id,
        document: sourceFact,
      },
      set: [
        {
          collection: CLAIM_PROJECTIONS_COLLECTION,
          id: claim.id,
          document: claim,
        },
        {
          collection: CLAIM_PROJECTION_STATUS_COLLECTION,
          id: status.id,
          document: status,
        },
      ],
      unchanged: [{
        collection: CLAIM_PROJECTION_STATUS_COLLECTION,
        document: existingStatus,
        id,
      }],
    });
    return committed ? claim : null;
  }

  async function removeSource(sourceMemoryId: string): Promise<void> {
    const [claims, statuses] = await Promise.all([
      documentStore.query<ClaimProjection>(CLAIM_PROJECTIONS_COLLECTION, {
        sourceMemoryId,
      }),
      documentStore.query<ClaimProjectionStatus>(CLAIM_PROJECTION_STATUS_COLLECTION, {
        sourceMemoryId,
      }),
    ]);
    for (const claim of claims) {
      await documentStore.delete(CLAIM_PROJECTIONS_COLLECTION, claim.id);
    }
    for (const status of statuses) {
      await documentStore.delete(CLAIM_PROJECTION_STATUS_COLLECTION, status.id);
    }
  }

  async function synchronizeFact(input: {
    document: StorageDocument | null;
    evidence?: readonly EvidenceRecord[];
    fallbackScope?: MemoryScope;
    sourceMemoryId: string;
    timestamp: string;
  }): Promise<void> {
    if (!input.document) {
      await removeSource(input.sourceMemoryId);
      return;
    }
    if (!isFactMemory(input.document)) {
      return;
    }
    const fact = input.document;
    const factScope = resolveProjectionScope(fact) ?? input.fallbackScope;
    if (!factScope) {
      return;
    }
    const existingStatuses = (
      await documentStore.query<ClaimProjectionStatus>(
        CLAIM_PROJECTION_STATUS_COLLECTION,
        { sourceMemoryId: input.sourceMemoryId },
      )
    ).filter((status) => matchesScopeFilter(status, factScope));
    const evidence = input.evidence ?? [];
    const evidenceIds = evidence.map(({ id }) => id);
    const sourceMessageIds = [
      ...new Set(evidence.flatMap((record) => record.sourceMessageIds)),
    ];
    const fallbackInput = (validUntil?: string): AppendClaimProjectionInput => ({
      ...factScope,
      sourceMemoryId: fact.id,
      subject: fact.subject && fact.subject !== "unknown"
        ? fact.subject
        : fact.userId,
      claim: {
        predicateKey: fact.factKind
          ? `fact.${fact.factKind}`
          : `fact.unstructured.${fact.id}`,
        objectText: fact.content,
        polarity: "positive",
        modality: "asserted",
        validFrom: fact.validFrom,
        validUntil,
        confidence: fact.confidence,
      },
      observedAt: fact.validFrom ?? fact.source.extractedAt ?? fact.createdAt,
      ingestedAt: fact.updatedAt,
      evidenceIds,
      sourceMessageIds,
      extractorVersion: "deterministic-fact-v1",
    });

    if (isActiveMemoryLifecycle(fact) && fact.isActive !== false) {
      const existingStatus = existingStatuses.find(
        (status) => status.claimIds.length > 0,
      );
      if (existingStatus && existingStatus.state !== "unstructured") {
        return;
      }
      if (existingStatus) {
        const existingClaims = await documentStore.query<ClaimProjection>(
          CLAIM_PROJECTIONS_COLLECTION,
          { sourceMemoryId: fact.id },
        );
        const current = existingClaims.find((claim) =>
          existingStatus.claimIds.includes(claim.id),
        );
        if (
          evidenceIds.length === 0 ||
          (current &&
            evidenceIds.every((id) => current.evidenceIds.includes(id)) &&
            sourceMessageIds.every((id) => current.sourceMessageIds.includes(id)))
        ) {
          return;
        }
      }
      await append(fallbackInput(fact.validUntil), "unstructured");
      return;
    }

    if (existingStatuses.length === 0) {
      await append(fallbackInput(fact.validUntil ?? fact.updatedAt), "unstructured");
      return;
    }

    const allClaims = await documentStore.query<ClaimProjection>(
      CLAIM_PROJECTIONS_COLLECTION,
      { sourceMemoryId: fact.id },
    );
    for (const status of existingStatuses) {
      const current = allClaims.filter((claim) => status.claimIds.includes(claim.id));
      const closed = current.map((claim): ClaimProjection => {
        if (claim.validUntil) return claim;
        const { id: _id, ...projectionWithoutId } = claim;
        const projection = {
          ...projectionWithoutId,
          validUntil: fact.updatedAt,
          ingestedAt: fact.updatedAt,
        };
        return { id: projectionId(projection), ...projection };
      });
      const nextStatus: ClaimProjectionStatus = {
        ...status,
        claimIds: closed.map(({ id }) => id),
        sourceUpdatedAt: fact.updatedAt,
        updatedAt: input.timestamp,
      };
      await documentStore.writeBatchIfUnchanged({
        expected: {
          collection: "facts",
          document: fact,
          id: fact.id,
        },
        set: [
          ...closed.map((claim) => ({
            collection: CLAIM_PROJECTIONS_COLLECTION,
            document: claim,
            id: claim.id,
          })),
          {
            collection: CLAIM_PROJECTION_STATUS_COLLECTION,
            document: nextStatus,
            id: nextStatus.id,
          },
        ],
        unchanged: [{
          collection: CLAIM_PROJECTION_STATUS_COLLECTION,
          document: status,
          id: status.id,
        }],
      });
    }
  }

  return {
    append,
    async markFailed(input, error) {
      const normalized = normalizeScope(input);
      const id = statusId(normalized, input.sourceMemoryId);
      const [sourceFact, existing] = await Promise.all([
        documentStore.get<FactMemory>("facts", input.sourceMemoryId),
        documentStore.get<ClaimProjectionStatus>(
          CLAIM_PROJECTION_STATUS_COLLECTION,
          id,
        ),
      ]);
      if (
        !sourceFact ||
        !matchesScopeFilter(sourceFact, normalized) ||
        !isActiveMemoryLifecycle(sourceFact) ||
        sourceFact.isActive === false
      ) {
        return;
      }
      if (
        existing?.sourceUpdatedAt &&
        (existing.sourceUpdatedAt > input.ingestedAt ||
          (existing.sourceUpdatedAt === input.ingestedAt &&
            existing.state === "projected"))
      ) {
        return;
      }
      const status: ClaimProjectionStatus = {
        id,
        schemaVersion: 1,
        ...normalized,
        scopeKey: recallScopeKey(normalized),
        sourceMemoryId: input.sourceMemoryId,
        state: "failed",
        claimIds: existing?.claimIds ?? [],
        extractorVersion: input.extractorVersion,
        sourceUpdatedAt: input.ingestedAt,
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: input.ingestedAt,
      };
      await documentStore.writeBatchIfUnchanged({
        expected: {
          collection: "facts",
          document: sourceFact,
          id: sourceFact.id,
        },
        set: [{
          collection: CLAIM_PROJECTION_STATUS_COLLECTION,
          document: status,
          id,
        }],
        unchanged: [{
          collection: CLAIM_PROJECTION_STATUS_COLLECTION,
          document: existing,
          id,
        }],
      });
    },
    async query(scope) {
      const [statuses, history] = await Promise.all([
        queryStatuses(scope),
        queryHistory(scope),
      ]);
      return selectedClaims(statuses, history);
    },
    queryHistory,
    async rebuildScope({ scope, sources, timestamp }) {
      const factSources = sources.filter((source) => source.collection === "facts");
      const canonicalIds = new Set(factSources.map(({ id }) => id));
      for (const source of factSources) {
        await synchronizeFact({
          document: source.document,
          evidence: source.evidence,
          sourceMemoryId: source.id,
          timestamp,
        });
      }
      for (const status of await queryStatuses(scope)) {
        if (!canonicalIds.has(status.sourceMemoryId)) {
          await removeSource(status.sourceMemoryId);
        }
      }
    },
    synchronizeFact,
  };
}
