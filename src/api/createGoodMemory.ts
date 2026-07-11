import type {
  FeedbackKind,
  FeedbackMemory,
} from "../domain/records";
import {
  buildFeedbackIdentityKey,
  createFeedbackMemory,
  normalizeFeedbackAppliesTo,
} from "../domain/records";
import { createMemorySource } from "../domain/provenance";
import type { EmbeddingAdapter } from "../embedding/contracts";
import { EVIDENCE_COLLECTION } from "../evidence/contracts";
import type { BehavioralOutcomeObservationResult } from "../evolution/behavioralTelemetry";
import { createProceduralPatternCompiler } from "../evolution/compiler";
import type { LearningProposal } from "../evolution/contracts";
import { createProposalGateProcessor } from "../evolution/gates";
import { createRulesOnlyReviewer } from "../evolution/reviewer";
import {
  EXPERIENCES_COLLECTION,
  LEARNING_PROPOSALS_COLLECTION,
  PROMOTION_RECORDS_COLLECTION,
  SESSION_ARCHIVES_COLLECTION,
} from "../evolution/contracts";
import type { RetrievalStrategyRolloutConfig } from "../governance/retrievalInternalRollout";
import { createLanguageService } from "../language";
import {
  createDreamMaintenanceGate,
  createDreamMaintenanceOrchestrator,
} from "../maintenance/dream";
import { createMaintenanceRunner } from "../maintenance/runner";
import type { GoodMemoryTraceLink } from "../observability/contracts";
import {
  createGoodMemoryTracer,
  type GoodMemoryTracer,
} from "../observability/tracer";
import type { RecallRouterAssistant } from "../recall/assistant";
import { buildMemoryPacket, renderMemoryPacket } from "../recall/contextBuilder";
import { createRecallEngine } from "../recall/engine";
import { iterativeRecall } from "../recall/iterativeRecall";
import { createRecallProjectionRuntime } from "../recall/projections/runtime";
import { decomposedRecall } from "../recall/queryDecomposition";
import type { Reranker } from "../recall/reranker";
import type { RecallRetrievalTrace } from "../recall/retrievalTrace";
import { createDeterministicMemoryExtractor } from "../remember/deterministicExtractor";
import { createRememberEngine } from "../remember/engine";
import { createInMemoryDocumentStore, createInMemorySessionStore, createInMemoryVectorStore } from "../storage/memory";
import { createAutoStorageAdapters } from "../storage/auto";
import {
  createPostgresDocumentStore,
  createPostgresSessionStore,
  createPostgresVectorStore,
} from "../storage/postgresPublic";
import { createMemoryRepositories } from "../storage/repositories";
import type {
  GovernanceRepositoryPort,
  GovernanceVectorPort,
  RememberVectorPort,
} from "../storage/ports";
import type { DocumentStore } from "../storage/contracts";
import {
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createSQLiteVectorStore,
} from "../storage/sqlitePublic";
import {
  createProviderConversationalMemoryExtractor,
  createProviderEmbeddingAdapter,
  createProviderMemoryExtractor,
  createProviderPointwiseReranker,
} from "../provider/layer";
import {
  attachGoodMemoryEvalSupport,
  type GoodMemoryEvalSupport,
} from "./evalSupport";
import {
  attachGoodMemoryIntegrationSupport,
  type AgentEventCorrectionResult,
  type AgentEventPromotionReceipt,
  type AgentEventProposalReceipt,
  type GoodMemoryIntegrationSupport,
} from "./integrationSupport";
import {
  attachGoodMemoryRuntimeInfo,
  buildGoodMemoryRuntimeInfo,
} from "./runtimeInfo";
import { createAgentEventIngestor } from "./agentEventIngestion";
import { createEvolutionRuntime } from "./evolutionRuntime";
import { deleteVectorForCollection } from "./governance";
import {
  deleteAllMemoryOperation,
  exportMemoryOperation,
  isPureUserScope,
  recordMatchesScope,
  type ScopeBoundRecord,
} from "./memoryAdminOps";
import { recordHostActionAssessment } from "./hostActionAssessmentOps";
import { createGoodMemoryJobsFacade } from "./jobs";
import {
  applyFactRerankingToResult,
  buildSkippedRerankerTrace,
  sanitizeRerankerGateway,
  type RerankerExecutionTarget,
  withRerankerTrace,
} from "./recallReranking";
import { wrapInternalRetrievalRolloutMemory } from "./internalRetrievalRollout";
import { reviseMemory as reviseMemoryThroughService } from "./revision";
import { createGoodMemoryRuntimeFacade } from "./runtimeFacade";
import type {
  BuildContextInput,
  BuildContextResult,
  DeleteAllMemoryInput,
  DeleteAllMemoryResult,
  ExportMemoryInput,
  ExportMemoryResult,
  FeedbackInput,
  FeedbackResult,
  ForgetInput,
  ForgetResult,
  GoodMemory,
  GoodMemoryConfig,
  GoodMemoryJobsFacade,
  GoodMemoryRuntimeFacade,
  RecallInput,
  RecallResult,
  RememberInput,
  RememberResult,
  ReviseMemoryInput,
  ReviseMemoryResult,
  RunMaintenanceInput,
  RunMaintenanceResult,
} from "./contracts";
import {
  type GoodMemoryRuntimeResolution,
  resolveGoodMemoryRuntimeResolution,
  resolveAssistedExtractorModelConfigFromEnv,
} from "./runtimeResolution";
import type { EvidenceRecord } from "../evidence/contracts";
import type { ExperienceRecord } from "../evolution/contracts";

const FORGETTABLE_COLLECTIONS = [
  "facts",
  "feedback",
  "profiles",
  "preferences",
  "references",
  "episodes",
  SESSION_ARCHIVES_COLLECTION,
  EVIDENCE_COLLECTION,
  EXPERIENCES_COLLECTION,
  LEARNING_PROPOSALS_COLLECTION,
  PROMOTION_RECORDS_COLLECTION,
] as const;

export interface InternalGoodMemoryOptions {
  assistedRecallRouter?: RecallRouterAssistant;
  assistedReviewer?: boolean;
  behavioralOutcomeRecorder?: boolean;
  environment?: Record<string, string | undefined>;
  projectionBulkBackfill?: boolean;
  projectionWriteThrough?: boolean;
  retrievalStrategyRollout?: RetrievalStrategyRolloutConfig;
}

const ASSISTED_REVIEWER_PREFIX = "[assisted reviewer] ";

function prefixAssistedReviewerText(value: string): string {
  return value.startsWith(ASSISTED_REVIEWER_PREFIX)
    ? value
    : `${ASSISTED_REVIEWER_PREFIX}${value}`;
}

function annotateAssistedReviewerProposal(
  proposal: LearningProposal,
  timestamp: string,
): LearningProposal {
  return {
    ...proposal,
    summary: prefixAssistedReviewerText(proposal.summary),
    rationale: prefixAssistedReviewerText(proposal.rationale),
    modelInfluence: "llm-assisted",
    updatedAt: timestamp,
  };
}

function buildRememberTraceLinks(events: RememberResult["events"]): GoodMemoryTraceLink[] {
  const links: GoodMemoryTraceLink[] = [];
  for (const event of events) {
    if (event.memoryId && event.memoryType !== "profile") {
      links.push({ type: "memory", id: event.memoryId });
    }
    for (const evidenceId of event.evidenceIds ?? []) {
      links.push({ type: "evidence", id: evidenceId });
    }
  }
  return links;
}

function unionRecordsById<T extends { id: string }>(
  results: readonly RecallResult[],
  select: (result: RecallResult) => readonly T[],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const result of results) {
    for (const item of select(result)) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }
  return merged;
}

function unionMetadataList<T>(
  results: readonly RecallResult[],
  select: (metadata: RecallResult["metadata"]) => readonly T[],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const result of results) {
    for (const item of select(result.metadata)) {
      const key = JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  }
  return merged;
}

function mergeRetrievalTraces(
  results: readonly RecallResult[],
): RecallRetrievalTrace | undefined {
  const fusionRuns = results.flatMap(
    (result) => result.metadata.retrievalTrace?.fusionRuns ?? [],
  );
  const reranker = results.find(
    (result) => result.metadata.retrievalTrace?.reranker !== undefined,
  )?.metadata.retrievalTrace?.reranker;
  if (fusionRuns.length === 0 && !reranker) {
    return undefined;
  }
  return {
    ...(fusionRuns.length > 0 ? { fusionRuns } : {}),
    ...(reranker ? { reranker } : {}),
    schemaVersion: 1,
  };
}

// Union the retrieved records across the primary recall and each sub-query
// recall (primary first, deduped by id), then re-render the packet over the
// union so the merged RecallResult stays internally consistent. Session-scoped
// singletons (profile, working memory, journal) come from the primary recall.
function mergeDecomposedRecallResults(
  primary: RecallResult,
  supplementary: RecallResult[],
): RecallResult {
  if (supplementary.length === 0) {
    return primary;
  }
  const results = [primary, ...supplementary];
  const facts = unionRecordsById(results, (result) => result.facts);
  const preferences = unionRecordsById(results, (result) => result.preferences);
  const references = unionRecordsById(results, (result) => result.references);
  const feedback = unionRecordsById(results, (result) => result.feedback);
  const episodes = unionRecordsById(results, (result) => result.episodes);
  const archives = unionRecordsById(results, (result) => result.archives);
  const evidence = unionRecordsById(results, (result) => result.evidence);
  const packet = buildMemoryPacket({
    profile: primary.profile,
    preferences,
    references,
    facts,
    feedback,
    archives,
    evidence,
    episodes,
    workingMemory: primary.workingMemory,
    journal: primary.journal,
    locale: primary.metadata.locale,
    routingDecision: primary.metadata.routingDecision,
  });
  const retrievalTrace = mergeRetrievalTraces(results);
  return {
    profile: primary.profile,
    preferences,
    references,
    facts,
    feedback,
    archives,
    evidence,
    episodes,
    workingMemory: primary.workingMemory,
    journal: primary.journal,
    packet,
    metadata: {
      ...primary.metadata,
      tokenCount: packet.debug?.estimatedTokens ?? primary.metadata.tokenCount,
      hits: unionMetadataList(results, (metadata) => metadata.hits),
      candidateTraces: unionMetadataList(
        results,
        (metadata) => metadata.candidateTraces,
      ),
      verificationHints: unionMetadataList(
        results,
        (metadata) => metadata.verificationHints,
      ),
      policyApplied: [
        ...new Set([
          ...results.flatMap((result) => result.metadata.policyApplied),
          "decomposed_recall",
        ]),
      ],
      ...(retrievalTrace ? { retrievalTrace } : {}),
    },
  };
}

function buildRecallTraceLinks(result: RecallResult): GoodMemoryTraceLink[] {
  const links: GoodMemoryTraceLink[] = [];
  for (const hit of result.metadata.hits) {
    links.push({ type: "memory", id: hit.id });
    for (const evidenceId of hit.evidenceIds ?? []) {
      links.push({ type: "evidence", id: evidenceId });
    }
  }
  return links;
}

function buildFeedbackTraceLinks(result: FeedbackResult): GoodMemoryTraceLink[] {
  const links: GoodMemoryTraceLink[] = [];
  if (result.memoryId) {
    links.push({ type: "memory", id: result.memoryId });
  }
  for (const evidenceId of result.evidenceIds ?? []) {
    links.push({ type: "evidence", id: evidenceId });
  }
  for (const receipt of result.proposalReceipts ?? []) {
    links.push({ type: "proposal", id: receipt.proposalId });
  }
  for (const receipt of result.promotionReceipts ?? []) {
    links.push({ type: "promotion", id: receipt.promotionId });
  }
  return links;
}

function buildRevisionTraceLinks(result: ReviseMemoryResult): GoodMemoryTraceLink[] {
  const links: GoodMemoryTraceLink[] = [];
  if (result.previousMemoryId) {
    links.push({ type: "memory", id: result.previousMemoryId });
  }
  if (result.newMemoryId) {
    links.push({ type: "memory", id: result.newMemoryId });
  }
  for (const evidenceId of result.evidenceIds ?? []) {
    links.push({ type: "evidence", id: evidenceId });
  }

  return links;
}

function resolveRevisionTraceReason(reason: ReviseMemoryInput["reason"]): string {
  if (
    reason === "user_correction" ||
    reason === "manual_review" ||
    reason === "system_repair"
  ) {
    return reason;
  }

  return "custom";
}

function withRecallTrace(
  result: RecallResult,
  trace: Awaited<ReturnType<GoodMemoryTracer["start"]>>,
): RecallResult {
  if (!trace.traceId) {
    return result;
  }

  return {
    ...result,
    metadata: {
      ...result.metadata,
      traceId: trace.traceId,
      traceScopeDigest: trace.scopeDigest,
    },
  };
}

function withRememberTrace(
  result: RememberResult,
  traceId: string | undefined,
): RememberResult {
  if (!traceId || !result.metadata) {
    return result;
  }

  return {
    ...result,
    metadata: {
      ...result.metadata,
      traceId,
    },
  };
}

function withFeedbackTrace(
  result: FeedbackResult,
  traceId: string | undefined,
): FeedbackResult {
  if (!traceId || !result.metadata) {
    return result;
  }

  return {
    ...result,
    metadata: {
      ...result.metadata,
      traceId,
    },
  };
}

async function resolveFeedbackSignalState(input: {
  appliesTo?: string;
  feedbackRepository: GovernanceRepositoryPort["feedback"];
  language: ReturnType<typeof createLanguageService>;
  locale?: string;
  scope: FeedbackInput["scope"];
  signal: string;
}): Promise<{
  duplicate?: FeedbackMemory;
  existing: FeedbackMemory[];
  kind: ReturnType<ReturnType<typeof createLanguageService>["deriveFeedbackKind"]>;
  normalizedRule: string;
  resolvedLanguage: ReturnType<ReturnType<typeof createLanguageService>["resolveFromText"]>;
  superseded?: FeedbackMemory;
}> {
  const {
    appliesTo,
    kind,
    normalizedRule,
    resolvedLanguage,
  } = resolveFeedbackSignalMetadata({
    appliesTo: input.appliesTo,
    language: input.language,
    locale: input.locale,
    signal: input.signal,
  });
  const existing = await input.feedbackRepository.listByScope(input.scope);
  const nextIdentityKey = buildFeedbackIdentityKey({
    kind,
    normalizedRule,
    appliesTo,
  });
  const duplicate = existing.find(
    (record) =>
      record.lifecycle === "active" &&
      buildFeedbackIdentityKey({
        kind: record.kind,
        normalizedRule: input.language.normalizeForEquality(
          record.rule,
          resolvedLanguage,
        ),
        appliesTo: record.appliesTo,
      }) === nextIdentityKey,
  );
  const superseded = existing.find(
    (record) =>
      record.lifecycle === "active" &&
      record.kind === kind &&
      normalizeFeedbackAppliesTo(record.appliesTo) === appliesTo,
  );

  return {
    duplicate,
    existing,
    kind,
    normalizedRule,
    resolvedLanguage,
    superseded,
  };
}

function resolveFeedbackSignalMetadata(input: {
  appliesTo?: string;
  language: ReturnType<typeof createLanguageService>;
  locale?: string;
  signal: string;
}): {
  appliesTo: string;
  kind: Exclude<FeedbackKind, "validated_pattern">;
  normalizedRule: string;
  resolvedLanguage: ReturnType<ReturnType<typeof createLanguageService>["resolveFromText"]>;
} {
  const resolvedLanguage = input.language.resolveFromText({
    locale: input.locale,
    text: input.signal,
  });
  const derivedKind = input.language.deriveFeedbackKind(input.signal, resolvedLanguage);
  const kind = derivedKind === "validated_pattern" ? "do" : derivedKind;
  const normalizedRule = input.language.normalizeForEquality(
    input.signal,
    resolvedLanguage,
  );

  return {
    appliesTo: normalizeFeedbackAppliesTo(input.appliesTo),
    kind,
    normalizedRule,
    resolvedLanguage,
  };
}

async function writeFeedbackSignal(input: {
  appliesTo?: string;
  evolutionRuntime: {
    handleFeedback(input: {
      result: FeedbackResult;
      scope: FeedbackInput["scope"];
      strict?: boolean;
      traceId?: string;
    }): Promise<{
      promotionReceipts: AgentEventPromotionReceipt[];
      proposalReceipts: AgentEventProposalReceipt[];
    }>;
  };
  feedbackRepository: GovernanceRepositoryPort["feedback"];
  language: ReturnType<typeof createLanguageService>;
  locale?: string;
  scope: FeedbackInput["scope"];
  signal: string;
  evidenceIds?: string[];
  strictExperience?: boolean;
  traceId?: string;
}): Promise<{
  receipts: {
    promotionReceipts: AgentEventPromotionReceipt[];
    proposalReceipts: AgentEventProposalReceipt[];
  };
  result: FeedbackResult;
}> {
  const {
    duplicate,
    kind,
    resolvedLanguage,
    superseded,
  } = await resolveFeedbackSignalState({
    feedbackRepository: input.feedbackRepository,
    language: input.language,
    locale: input.locale,
    scope: input.scope,
    signal: input.signal,
    appliesTo: input.appliesTo,
  });

  if (!duplicate) {
    const timestamp = new Date().toISOString();
    const nextRecord = createFeedbackMemory({
      id: crypto.randomUUID(),
      userId: input.scope.userId,
      tenantId: input.scope.tenantId,
      workspaceId: input.scope.workspaceId,
      agentId: input.scope.agentId,
      sessionId: input.scope.sessionId,
      rule: input.signal,
      kind,
      appliesTo: input.appliesTo ?? "general_response",
      source: createMemorySource({
        method: "explicit",
        extractedAt: timestamp,
        sessionId: input.scope.sessionId,
        locale: resolvedLanguage.locale,
      }),
      updatedAt: timestamp,
    });

    if (superseded) {
      await input.feedbackRepository.upsert(
        createFeedbackMemory({
          ...superseded,
          lifecycle: "superseded",
          supersededBy: nextRecord.id,
          updatedAt: timestamp,
        }),
      );

      await input.feedbackRepository.upsert(nextRecord);
      const result: FeedbackResult = {
        accepted: true,
        ...(input.evidenceIds ? { evidenceIds: input.evidenceIds } : {}),
        outcome: "superseded",
        memoryId: nextRecord.id,
        kind,
        metadata: {
          locale: resolvedLanguage.locale,
          localeSource: resolvedLanguage.localeSource,
          adapterId: resolvedLanguage.adapterId,
          analysisMode: resolvedLanguage.analysisMode,
        },
      };

      const receipts = await input.evolutionRuntime.handleFeedback({
        scope: input.scope,
        result,
        ...(input.traceId ? { traceId: input.traceId } : {}),
        ...(input.strictExperience ? { strict: true } : {}),
      });

      return {
        receipts,
        result,
      };
    }

    await input.feedbackRepository.upsert(nextRecord);
    const result: FeedbackResult = {
      accepted: true,
      ...(input.evidenceIds ? { evidenceIds: input.evidenceIds } : {}),
      outcome: "written",
      memoryId: nextRecord.id,
      kind,
      metadata: {
        locale: resolvedLanguage.locale,
        localeSource: resolvedLanguage.localeSource,
        adapterId: resolvedLanguage.adapterId,
        analysisMode: resolvedLanguage.analysisMode,
      },
    };

    const receipts = await input.evolutionRuntime.handleFeedback({
      scope: input.scope,
      result,
      ...(input.traceId ? { traceId: input.traceId } : {}),
      ...(input.strictExperience ? { strict: true } : {}),
    });

    return {
      receipts,
      result,
    };
  }

  const result: FeedbackResult = {
    accepted: true,
    ...(input.evidenceIds ? { evidenceIds: input.evidenceIds } : {}),
    outcome: "merged",
    memoryId: duplicate.id,
    kind,
    metadata: {
      locale: resolvedLanguage.locale,
      localeSource: resolvedLanguage.localeSource,
      adapterId: resolvedLanguage.adapterId,
      analysisMode: resolvedLanguage.analysisMode,
    },
  };

  const receipts = await input.evolutionRuntime.handleFeedback({
    scope: input.scope,
    result,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.strictExperience ? { strict: true } : {}),
  });

  return {
    receipts,
    result,
  };
}

function withFeedbackReceipts(
  result: FeedbackResult,
  receipts: {
    promotionReceipts: AgentEventPromotionReceipt[];
    proposalReceipts: AgentEventProposalReceipt[];
  },
): FeedbackResult {
  return {
    ...result,
    ...(receipts.proposalReceipts.length > 0
      ? { proposalReceipts: receipts.proposalReceipts }
      : {}),
    ...(receipts.promotionReceipts.length > 0
      ? { promotionReceipts: receipts.promotionReceipts }
      : {}),
  };
}

function withAgentEventCorrectionReceipts(
  result: AgentEventCorrectionResult,
  receipts: {
    promotionReceipts: AgentEventPromotionReceipt[];
    proposalReceipts: AgentEventProposalReceipt[];
  },
): AgentEventCorrectionResult {
  return {
    ...result,
    ...(receipts.proposalReceipts.length > 0
      ? { proposalReceipts: receipts.proposalReceipts }
      : {}),
    ...(receipts.promotionReceipts.length > 0
      ? { promotionReceipts: receipts.promotionReceipts }
      : {}),
  };
}

class GoodMemoryImpl implements GoodMemory {
  readonly jobs: GoodMemoryJobsFacade;
  readonly runtime: GoodMemoryRuntimeFacade;

  private readonly documentStore;
  private readonly sessionStore;
  private readonly governanceRepositories: GovernanceRepositoryPort;
  private readonly governanceVectors: GovernanceVectorPort | null;
  private readonly revisionVectorIndex: RememberVectorPort | null;
  private readonly runtimeResolution: GoodMemoryRuntimeResolution;
  private readonly recallEngine;
  private readonly rememberEngine;
  private readonly evolutionRuntime: ReturnType<typeof createEvolutionRuntime>;
  private readonly embeddingAdapter?: EmbeddingAdapter;
  private readonly reranker?: Reranker;
  private readonly rerankerTarget?: RerankerExecutionTarget;
  private readonly language;
  private readonly now: () => Date;
  private readonly tracer: GoodMemoryTracer;

  constructor(
    private readonly config: GoodMemoryConfig,
    internal?: InternalGoodMemoryOptions,
  ) {
    const runtimeResolution = resolveGoodMemoryRuntimeResolution({
      config,
      env: internal?.environment,
    });
    this.runtimeResolution = runtimeResolution;
    const storagePlan = runtimeResolution.storagePlan;
    const explicitStorage = storagePlan.mode === "explicit" ? storagePlan.storage : null;
    const autoStorageAdapters =
      storagePlan.mode === "auto"
        ? createAutoStorageAdapters(
            "sqliteUrl" in storagePlan
              ? {
                  postgresUrl: storagePlan.postgresUrl,
                  sqliteUrl: storagePlan.sqliteUrl,
                }
              : {
                  fallbackProvider: "memory",
                  postgresUrl: storagePlan.postgresUrl,
                },
          )
        : null;
    const embeddingAdapter =
      config.adapters?.embeddingAdapter ??
      (runtimeResolution.embeddingModelConfig
        ? createProviderEmbeddingAdapter({
            model: runtimeResolution.embeddingModelConfig,
          })
        : undefined);
    const assistedExtractor =
      config.adapters?.assistedExtractor ??
      (runtimeResolution.assistedExtractorModelConfig
        ? // Resolved mode = the raw config predicate plus the recommended
          // preset's conversational flip; identical to the old inline check
          // for non-preset configs by construction.
          runtimeResolution.extractionMode === "conversational"
          ? createProviderConversationalMemoryExtractor({
              model: runtimeResolution.assistedExtractorModelConfig,
              contextualDescriptor:
                config.providers?.extraction?.contextualDescriptors,
            })
          : createProviderMemoryExtractor({
              model: runtimeResolution.assistedExtractorModelConfig,
            })
        : undefined);
    const reranker =
      config.adapters?.reranker ??
      (runtimeResolution.rerankerModelConfig
        ? createProviderPointwiseReranker({
            model: runtimeResolution.rerankerModelConfig,
            requestTimeoutMs: config.providers?.reranking?.requestTimeoutMs,
          })
        : undefined);
    const rerankerTarget: RerankerExecutionTarget | undefined = reranker
      ? config.adapters?.reranker
        ? { adapter: "custom" }
        : {
            adapter: "provider",
            gateway: sanitizeRerankerGateway(
              runtimeResolution.rerankerModelConfig?.baseURL,
            ),
            model: runtimeResolution.rerankerModelConfig?.model,
            provider: runtimeResolution.rerankerModelConfig?.provider,
          }
      : undefined;
    const rawDocumentStore =
      config.adapters?.documentStore ??
      (autoStorageAdapters
        ? autoStorageAdapters.documentStore
        : explicitStorage?.provider === "sqlite"
        ? createSQLiteDocumentStore(explicitStorage.url)
        : explicitStorage?.provider === "postgres"
          ? createPostgresDocumentStore({
              url: explicitStorage.url,
            })
          : createInMemoryDocumentStore());
    const projectionRuntime = createRecallProjectionRuntime({
      bulkBackfill: internal?.projectionBulkBackfill,
      documentStore: rawDocumentStore,
      now: config.testing?.now
        ? () => config.testing!.now!().toISOString()
        : undefined,
      writeThrough:
        runtimeResolution.retrieval.generalizedFusion !== undefined &&
        internal?.projectionWriteThrough !== false,
    });
    const documentStore = projectionRuntime.documentStore;
    const sessionStore =
      config.adapters?.sessionStore ??
      (autoStorageAdapters
        ? autoStorageAdapters.sessionStore
        : explicitStorage?.provider === "sqlite"
        ? createSQLiteSessionStore(explicitStorage.url)
        : explicitStorage?.provider === "postgres"
          ? createPostgresSessionStore({
              url: explicitStorage.url,
            })
          : createInMemorySessionStore());
    const vectorStore =
      config.adapters?.vectorStore ??
      (autoStorageAdapters
        ? autoStorageAdapters.vectorStore
        : explicitStorage?.provider === "postgres"
        ? createPostgresVectorStore({
            url: explicitStorage.url,
          })
        : explicitStorage?.provider === "sqlite"
          ? createSQLiteVectorStore(explicitStorage.url)
          : createInMemoryVectorStore());
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
      vectorStore,
    });
    const language = createLanguageService(config.language);

    this.documentStore = documentStore;
    this.sessionStore = sessionStore;
    this.governanceRepositories = repositories;
    this.governanceVectors = repositories.vectorIndex;
    this.revisionVectorIndex = repositories.vectorIndex;
    this.embeddingAdapter = embeddingAdapter;
    this.reranker = reranker;
    this.rerankerTarget = rerankerTarget;
    this.language = language;
    this.now = config.testing?.now ?? (() => new Date());
    this.tracer = createGoodMemoryTracer(config.observability, this.now);
    this.runtime = createGoodMemoryRuntimeFacade({
      documentStore,
      sessionStore,
      now: this.now,
      tracer: this.tracer,
    });
    this.recallEngine = createRecallEngine({
      assistedRouter: internal?.assistedRecallRouter,
      repositories,
      runtime: sessionStore,
      vectorIndex: repositories.vectorIndex,
      embedding: embeddingAdapter,
      autoStrategyBias: runtimeResolution.retrieval.autoStrategyBias,
      bm25Ranking: runtimeResolution.retrieval.bm25Ranking,
      generalizedFusion: runtimeResolution.retrieval.generalizedFusion,
      projectionIndex: projectionRuntime,
      semanticCandidates: runtimeResolution.retrieval.semanticCandidates,
      now: config.testing?.now ? () => config.testing!.now!().getTime() : undefined,
      referenceTime: config.testing?.now
        ? () => config.testing!.now!().toISOString()
        : undefined,
      language,
      policy: config.policy,
    });
    this.rememberEngine = createRememberEngine({
      repositories,
      vectorIndex: repositories.vectorIndex,
      assistedExtractor,
      documentStore,
      embedding: embeddingAdapter,
      extractor:
        config.testing?.extractor ??
        createDeterministicMemoryExtractor({
          service: language,
        }),
      language,
      remember: config.remember,
      policy: config.policy,
      createId: config.testing?.createId,
      now: config.testing?.now
        ? () => config.testing!.now!().toISOString()
        : undefined,
    });
    this.jobs = createGoodMemoryJobsFacade({
      now: this.now,
      tracer: this.tracer,
      remember: (input) => this.remember(input),
    });
    const reviewer = createRulesOnlyReviewer({
      repositories,
      ...(internal?.assistedReviewer
        ? {
            assistedReview: {
              enabled: true,
              annotate: async (proposal: LearningProposal) =>
                annotateAssistedReviewerProposal(
                  proposal,
                  this.now().toISOString(),
                ),
            },
          }
        : {}),
    });
    const proposalGate = createProposalGateProcessor({
      repositories,
    });
    const proceduralPatternCompiler = createProceduralPatternCompiler({
      repositories,
      language,
      now: () => this.now().toISOString(),
    });
    const maintenanceRunner = createMaintenanceRunner({
      repositories,
      vectorIndex: repositories.vectorIndex,
      embedding: embeddingAdapter,
      language,
      projectionRepair: projectionRuntime,
      now: () => this.now().toISOString(),
    });
    const dreamMaintenanceGate = createDreamMaintenanceGate();
    const dreamMaintenance = createDreamMaintenanceOrchestrator({
      gate: dreamMaintenanceGate,
      maintenanceRunner,
      reviewer,
      proposalGate,
      compiler: proceduralPatternCompiler,
    });
    this.evolutionRuntime = createEvolutionRuntime({
      governanceRepositories: repositories,
      reviewer,
      proposalGate,
      compiler: proceduralPatternCompiler,
      dreamMaintenance,
      now: () => this.now().toISOString(),
    });
  }

  async recall(input: RecallInput): Promise<RecallResult> {
    const trace = await this.tracer.start({
      name: "memory.recall",
      scope: input.scope,
      attributes: {
        ignoreMemory: Boolean(input.ignoreMemory),
        multiHop: Boolean(input.multiHop),
        decompose: Boolean(input.decompose),
        requestedRetrievalProfile: input.retrievalProfile ?? "default",
        requestedStrategy: input.strategy ?? "default",
      },
    });

    try {
      const singlePassRecall = (query: string) =>
        this.recallEngine.recall({ ...input, query });
      const multiHopMaxHops =
        typeof input.multiHop === "number" ? input.multiHop : undefined;
      const perQueryRecall = input.multiHop
        ? async (query: string) =>
            (
              await iterativeRecall({
                query,
                recall: singlePassRecall,
                options: { maxHops: multiHopMaxHops },
              })
            ).result
        : singlePassRecall;
      let result = input.decompose
        ? (
            await decomposedRecall({
              query: input.query,
              recall: perQueryRecall,
              merge: mergeDecomposedRecallResults,
            })
          ).result
        : input.multiHop
          ? (
              await iterativeRecall({
                query: input.query,
                recall: singlePassRecall,
                options: { maxHops: multiHopMaxHops },
              })
            ).result
          : await this.recallEngine.recall(input);
      if (this.reranker && this.rerankerTarget) {
        result = input.rerank === false
          ? withRerankerTrace(
              result,
              buildSkippedRerankerTrace({
                candidateCount: result.facts.length,
                reason: "disabled",
                target: this.rerankerTarget,
              }),
            )
          : await applyFactRerankingToResult({
              query: input.query,
              reranker: this.reranker,
              result,
              target: this.rerankerTarget,
            });
      }
      await this.evolutionRuntime.handleRecall({
        scope: input.scope,
        result,
      });
      const traced = withRecallTrace(result, trace);
      await trace.succeeded({
        attributes: {
          hitCount: result.metadata.hits.length,
          policyAppliedCount: result.metadata.policyApplied.length,
          tokenCount: result.metadata.tokenCount,
          verificationHintCount: result.metadata.verificationHints.length,
        },
        links: buildRecallTraceLinks(result),
      });

      return traced;
    } catch (error) {
      await trace.failed({ error });
      throw error;
    }
  }

  async diagnoseRecall(input: RecallInput): Promise<RecallResult> {
    return this.recallEngine.recall(input);
  }

  async buildContext(input: BuildContextInput): Promise<BuildContextResult> {
    const output = input.output ?? "json";
    const trace = await this.tracer.start({
      name: "memory.build_context",
      scopeDigest: input.recall.metadata.traceScopeDigest,
      attributes: {
        maxTokens: input.maxTokens ?? 0,
        output,
        retrievalProfile: input.recall.metadata.routingDecision.retrievalProfile,
      },
    });

    try {
      const rendered = renderMemoryPacket(
        input.recall.packet,
        output,
        input.maxTokens,
        input.recall.metadata.routingDecision.retrievalProfile,
        { suppressDuplicateEvidence: input.suppressDuplicateEvidence === true },
      );
      await trace.succeeded({
        attributes: {
          estimatedTokens: rendered.estimatedTokens,
          omittedSectionCount: rendered.omittedSections.length,
        },
      });

      return {
        output,
        content: rendered.content,
        estimatedTokens: rendered.estimatedTokens,
        omittedSections: rendered.omittedSections,
        ...(trace.traceId ? { traceId: trace.traceId } : {}),
      };
    } catch (error) {
      await trace.failed({ error });
      throw error;
    }
  }

  async remember(input: RememberInput): Promise<RememberResult> {
    const trace = await this.tracer.start({
      name: "memory.remember",
      scope: input.scope,
      attributes: {
        annotationCount: input.annotations?.length ?? 0,
        extractionStrategy: input.extractionStrategy ?? "auto",
        messageCount: input.messages.length,
      },
    });

    try {
      const result = await this.rememberEngine.remember(input);
      await this.evolutionRuntime.handleRemember({
        scope: input.scope,
        result,
      });
      const traced = withRememberTrace(result, trace.traceId);
      await trace.succeeded({
        attributes: {
          accepted: result.accepted,
          eventCount: result.events.length,
          rejected: result.rejected,
        },
        links: buildRememberTraceLinks(result.events),
      });

      return traced;
    } catch (error) {
      await trace.failed({ error });
      throw error;
    }
  }

  async reviseMemory(input: ReviseMemoryInput): Promise<ReviseMemoryResult> {
    const trace = await this.tracer.start({
      name: "memory.revise",
      scope: input.scope,
      attributes: {
        hasEvidence: Boolean(input.evidence),
        reason: resolveRevisionTraceReason(input.reason),
        target: "memory_id",
      },
    });

    try {
      const result = await reviseMemoryThroughService({
        config: {
          documentStore: this.documentStore,
          embedding: this.embeddingAdapter,
          language: this.language,
          now: this.now,
          policy: this.config.policy,
          vectorIndex: this.revisionVectorIndex,
        },
        input,
      });
      const traced: ReviseMemoryResult = {
        ...result,
        ...(trace.traceId ? { traceId: trace.traceId } : {}),
      };
      const completion = {
        attributes: {
          accepted: result.accepted,
          memoryType: result.memoryType ?? "unknown",
          outcome: result.outcome,
          policyAppliedCount: result.policyApplied.length,
          warningCount: result.warnings?.length ?? 0,
        },
        links: buildRevisionTraceLinks(result),
      };

      if (result.outcome === "blocked") {
        await trace.blocked(completion);
      } else {
        await trace.succeeded(completion);
      }

      return traced;
    } catch (error) {
      await trace.failed({ error });
      throw error;
    }
  }

  async forget(input: ForgetInput): Promise<ForgetResult> {
    const trace = await this.tracer.start({
      name: "memory.forget",
      scope: input.scope,
      attributes: {
        hasMemoryId: Boolean(input.memoryId),
      },
    });

    try {
      if (!input.memoryId) {
        await trace.succeeded({
          attributes: {
            forgotten: false,
          },
        });
        return {
          forgotten: false,
          ...(trace.traceId ? { traceId: trace.traceId } : {}),
        };
      }

      for (const collection of FORGETTABLE_COLLECTIONS) {
        const existing = await this.documentStore.get(collection, input.memoryId);

        if (existing && recordMatchesScope(existing as ScopeBoundRecord, input.scope)) {
          await deleteVectorForCollection(
            this.governanceVectors,
            collection,
            input.memoryId,
          );
          await this.documentStore.delete(collection, input.memoryId);
          await trace.succeeded({
            attributes: {
              collection,
              forgotten: true,
            },
            links: [{ type: "memory", id: input.memoryId }],
          });
          return {
            forgotten: true,
            ...(trace.traceId ? { traceId: trace.traceId } : {}),
          };
        }
      }

      await trace.succeeded({
        attributes: {
          forgotten: false,
        },
      });
      return {
        forgotten: false,
        ...(trace.traceId ? { traceId: trace.traceId } : {}),
      };
    } catch (error) {
      await trace.failed({ error });
      throw error;
    }
  }

  async exportMemory(input: ExportMemoryInput): Promise<ExportMemoryResult> {
    return exportMemoryOperation(
      {
        tracer: this.tracer,
        governanceRepositories: this.governanceRepositories,
        governanceVectors: this.governanceVectors,
        sessionStore: this.sessionStore,
        documentStore: this.documentStore,
      },
      input,
    );
  }

  async deleteAllMemory(input: DeleteAllMemoryInput): Promise<DeleteAllMemoryResult> {
    return deleteAllMemoryOperation(
      {
        tracer: this.tracer,
        governanceRepositories: this.governanceRepositories,
        governanceVectors: this.governanceVectors,
        sessionStore: this.sessionStore,
        documentStore: this.documentStore,
      },
      input,
    );
  }

  async feedback(input: FeedbackInput): Promise<FeedbackResult> {
    const trace = await this.tracer.start({
      name: "memory.feedback",
      scope: input.scope,
      attributes: {
        signalLength: input.signal.length,
      },
    });

    try {
      const { receipts, result } = await writeFeedbackSignal({
        evolutionRuntime: this.evolutionRuntime,
        feedbackRepository: this.governanceRepositories.feedback,
        language: this.language,
        locale: input.locale,
        scope: input.scope,
        signal: input.signal,
      });
      const withReceipts = withFeedbackReceipts(result, receipts);
      const traced = withFeedbackTrace(withReceipts, trace.traceId);
      await trace.succeeded({
        attributes: {
          accepted: withReceipts.accepted,
          kind: withReceipts.kind ?? "unknown",
          outcome: withReceipts.outcome ?? "none",
          proposalReceiptCount: withReceipts.proposalReceipts?.length ?? 0,
        },
        links: buildFeedbackTraceLinks(withReceipts),
      });

      return traced;
    } catch (error) {
      await trace.failed({ error });
      throw error;
    }
  }

  async runMaintenance(input: RunMaintenanceInput): Promise<RunMaintenanceResult> {
    const trace = await this.tracer.start({
      name: "maintenance.run",
      scope: input.scope,
      attributes: {
        jobCount: input.jobs?.length ?? 0,
      },
    });

    try {
      const result = await this.evolutionRuntime.runMaintenance(input);
      await trace.succeeded({
        attributes: {
          compiledCount: result.compiledCount,
          proposalCount: result.proposalCount,
          ran: result.ran,
          reason: result.reason,
        },
      });

      return {
        ...result,
        ...(trace.traceId ? { traceId: trace.traceId } : {}),
      };
    } catch (error) {
      await trace.failed({ error });
      throw error;
    }
  }
}

async function submitAgentEventCorrection(input: {
  appliesTo?: string;
  evolutionRuntime: {
    handleAgentCorrection(input: {
      appliesTo: string;
      evidenceIds?: string[];
      kind: Exclude<FeedbackKind, "validated_pattern">;
      scope: FeedbackInput["scope"];
      signal: string;
      strict?: boolean;
      traceId?: string;
    }): Promise<{
      promotionReceipts: AgentEventPromotionReceipt[];
      proposalReceipts: AgentEventProposalReceipt[];
    }>;
  };
  language: ReturnType<typeof createLanguageService>;
  locale?: string;
  scope: FeedbackInput["scope"];
  signal: string;
  evidenceIds?: string[];
  strictExperience?: boolean;
  traceId?: string;
}): Promise<AgentEventCorrectionResult> {
  const {
    appliesTo,
    kind,
    resolvedLanguage,
  } = resolveFeedbackSignalMetadata({
    appliesTo: input.appliesTo,
    language: input.language,
    locale: input.locale,
    signal: input.signal,
  });
  const receipts = await input.evolutionRuntime.handleAgentCorrection({
    appliesTo,
    kind,
    scope: input.scope,
    signal: input.signal,
    ...(input.evidenceIds ? { evidenceIds: input.evidenceIds } : {}),
    ...(input.strictExperience ? { strict: true } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
  });
  const result: AgentEventCorrectionResult = {
    accepted: true,
    ...(input.evidenceIds ? { evidenceIds: input.evidenceIds } : {}),
    kind,
    metadata: {
      locale: resolvedLanguage.locale,
      localeSource: resolvedLanguage.localeSource,
      adapterId: resolvedLanguage.adapterId,
      analysisMode: resolvedLanguage.analysisMode,
    },
  };

  return withAgentEventCorrectionReceipts(result, receipts);
}

export function createGoodMemory(config: GoodMemoryConfig): GoodMemory {
  return createInternalGoodMemory(config);
}

export function createInternalGoodMemory(
  config: GoodMemoryConfig,
  internal?: InternalGoodMemoryOptions,
): GoodMemory {
  const impl = new GoodMemoryImpl(config, internal);
  const memory = wrapInternalRetrievalRolloutMemory(
    impl,
    {
      assistedRecallRouterEnabled: Boolean(internal?.assistedRecallRouter),
      config,
      now: config.testing?.now,
      rollout: internal?.retrievalStrategyRollout,
    },
  );
  const implWithInternals = impl as unknown as {
    documentStore: DocumentStore;
    evolutionRuntime: {
      handleAgentEvent: (input: {
        evidence?: EvidenceRecord;
        experience?: ExperienceRecord;
        scope: ForgetInput["scope"];
      }) => Promise<void>;
      handleBehavioralOutcome: (input: {
        result: BehavioralOutcomeObservationResult;
        scope: ForgetInput["scope"];
      }) => Promise<void>;
      handleAgentCorrection: (input: {
        appliesTo: string;
        evidenceIds?: string[];
        kind: Exclude<FeedbackKind, "validated_pattern">;
        scope: FeedbackInput["scope"];
        signal: string;
        strict?: boolean;
        traceId?: string;
      }) => Promise<{
        promotionReceipts: AgentEventPromotionReceipt[];
        proposalReceipts: AgentEventProposalReceipt[];
      }>;
      handleFeedback: (input: {
        result: FeedbackResult;
        scope: FeedbackInput["scope"];
        strict?: boolean;
        traceId?: string;
      }) => Promise<{
        promotionReceipts: AgentEventPromotionReceipt[];
        proposalReceipts: AgentEventProposalReceipt[];
      }>;
    };
    governanceRepositories: GovernanceRepositoryPort;
    feedback: GoodMemory["feedback"];
    language: ReturnType<typeof createLanguageService>;
    now: () => Date;
    runtimeResolution: GoodMemoryRuntimeResolution;
  };
  type BehavioralOutcomeSupportInput = Parameters<
    Exclude<GoodMemoryEvalSupport["recordBehavioralOutcome"], undefined>
  >[0];
  const integrationSupport: GoodMemoryIntegrationSupport = {
    ingestAgentInputEvent: ({ event }) =>
      createAgentEventIngestor({
        documentStore: implWithInternals.documentStore,
        submitCorrection: (input) =>
          submitAgentEventCorrection({
            evolutionRuntime: implWithInternals.evolutionRuntime,
            language: implWithInternals.language,
            appliesTo: input.appliesTo,
            locale: input.locale,
            scope: input.scope,
            signal: input.signal,
            ...(input.evidenceIds ? { evidenceIds: input.evidenceIds } : {}),
            strictExperience: true,
            ...(input.traceId ? { traceId: input.traceId } : {}),
          }),
        language: implWithInternals.language,
        now: implWithInternals.now,
        policy: config.policy,
        persist: ({ evidence, experience, scope }) =>
          implWithInternals.evolutionRuntime.handleAgentEvent({
            scope,
            ...(evidence ? { evidence } : {}),
            ...(experience ? { experience } : {}),
          }),
      }).ingest(event),
    ingestHostAgentEvent: ({ event }) =>
      createAgentEventIngestor({
        documentStore: implWithInternals.documentStore,
        submitCorrection: (input) =>
          submitAgentEventCorrection({
            evolutionRuntime: implWithInternals.evolutionRuntime,
            language: implWithInternals.language,
            appliesTo: input.appliesTo,
            locale: input.locale,
            scope: input.scope,
            signal: input.signal,
            ...(input.evidenceIds ? { evidenceIds: input.evidenceIds } : {}),
            strictExperience: true,
            ...(input.traceId ? { traceId: input.traceId } : {}),
          }),
        language: implWithInternals.language,
        now: implWithInternals.now,
        policy: config.policy,
        persist: ({ evidence, experience, scope }) =>
          implWithInternals.evolutionRuntime.handleAgentEvent({
            scope,
            ...(evidence ? { evidence } : {}),
            ...(experience ? { experience } : {}),
          }),
      }).ingest(event),
    recordHostActionAssessment: ({ assessment }) =>
      recordHostActionAssessment({
        assessment,
        documentStore: implWithInternals.documentStore,
        persist: ({ experience, scope }) =>
          implWithInternals.evolutionRuntime.handleAgentEvent({
            scope,
            experience,
          }),
      }),
  };
  const support = {
    ...(internal?.assistedRecallRouter ? { assistedRecallRouter: true } : {}),
    ...(internal?.assistedReviewer ? { assistedReviewer: true } : {}),
    ...(internal?.behavioralOutcomeRecorder
      ? {
          recordBehavioralOutcome: (input: BehavioralOutcomeSupportInput) =>
            implWithInternals.evolutionRuntime.handleBehavioralOutcome({
              scope: input.scope,
              result: {
                cue: input.cue,
                evidenceExcerpt: input.evidenceExcerpt,
                failureClass: input.failureClass,
                firstAction: input.firstAction,
                modelInfluence: input.modelInfluence ?? "rules-only",
                outcome: input.outcome,
                retrievalProfile: input.retrievalProfile,
                saferAlternative: input.saferAlternative,
              },
            }),
        }
      : {}),
  };
  const runtimeInfo = buildGoodMemoryRuntimeInfo(implWithInternals.runtimeResolution);
  const runtimeAwareMemory = attachGoodMemoryRuntimeInfo(memory, runtimeInfo);

  if (Object.keys(support).length === 0) {
    return attachGoodMemoryIntegrationSupport(runtimeAwareMemory, integrationSupport);
  }

  return attachGoodMemoryEvalSupport(
    attachGoodMemoryIntegrationSupport(runtimeAwareMemory, integrationSupport),
    support,
  );
}
