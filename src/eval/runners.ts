import type {
  ExportMemoryResult,
  FeedbackResult,
  GoodMemory,
  RecallResult,
} from "../api/contracts";
import { readGoodMemoryEvalSupport } from "../api/evalSupport";
import type {
  ExperienceKind,
  ExperienceModelInfluence,
  LearningProposalStatus,
  LearningProposalType,
  PromotionDecision,
  PromotionGateOutcome,
} from "../evolution/contracts";
import type { MaintenanceJobName } from "../maintenance/runner";
import type {
  PersonalizationTaskFamily,
  PersonaSpec,
  ScenarioEvaluationSetting,
  ScenarioFeedbackSignal,
  ScenarioFixture,
  ScenarioTurn,
} from "./dataset";
import type { RecallRouterStrategy } from "../recall/router";
import type {
  MaintenanceStrategyLabel,
  RetrievalStrategyRolloutConfig,
  StrategyRolloutConfig,
  ReviewerStrategyLabel,
} from "./strategy-rollout";
import type { MemoryExtractionStrategy } from "../remember/candidates";
import type { RememberResult as PublicRememberResult } from "../remember/contracts";
import {
  resolveMaintenanceStrategyRollout,
  resolveRetrievalStrategyRollout,
  resolveReviewerStrategyRollout,
} from "./strategy-rollout";

const DEFAULT_HYGIENE_MAINTENANCE_JOBS = [
  "dedupe",
  "consolidation",
  "embeddingRepair",
] as const satisfies MaintenanceJobName[];

const OUTCOME_AWARE_MAINTENANCE_JOBS = [
  "dedupe",
  "contradiction",
  "consolidation",
  "embeddingRepair",
] as const satisfies MaintenanceJobName[];

function resolveMaintenanceJobs(
  strategyLabel: MaintenanceStrategyLabel,
): MaintenanceJobName[] {
  return strategyLabel === "outcome-aware"
    ? [...OUTCOME_AWARE_MAINTENANCE_JOBS]
    : [...DEFAULT_HYGIENE_MAINTENANCE_JOBS];
}

function assertReviewerExecutionSupport(input: {
  executedStrategyLabel: ReviewerStrategyLabel;
  memory: GoodMemory;
}): void {
  if (input.executedStrategyLabel !== "assisted") {
    return;
  }

  const support = readGoodMemoryEvalSupport(input.memory);
  if (support?.assistedReviewer) {
    return;
  }

  throw new Error(
    "Reviewer rollout strategy assisted requires eval memory with assisted reviewer support. When overriding createMemory, pass through strategyRollout and return createInternalGoodMemory(..., { assistedReviewer: true }) for assisted reviewer cases.",
  );
}

function resolveRetrievalCandidateInfluencedExecution(input: {
  recall: RecallResult;
  retrievalDecision: ReturnType<typeof resolveRetrievalStrategyRollout>;
}): boolean | undefined {
  if (input.retrievalDecision.candidateInfluencedExecution !== undefined) {
    return input.retrievalDecision.candidateInfluencedExecution;
  }

  if (
    !input.retrievalDecision.runtimeAppliesPromotion ||
    input.retrievalDecision.mode !== "promote"
  ) {
    return undefined;
  }

  return (
    input.recall.metadata.routingDecision.strategy ===
    input.retrievalDecision.promotedStrategyLabel
  );
}

export interface EvalAnswerGeneratorInput {
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  prompt: string;
  transcript: string;
  memoryContext?: string;
}

export interface EvalAnswerGeneratorOutput {
  content: string;
}

export type EvalAnswerGenerator = (
  input: EvalAnswerGeneratorInput,
) => Promise<EvalAnswerGeneratorOutput>;

export type EvalGoodMemoryScenarioFailureBoundary =
  | "pre_recall"
  | "recall_path";

interface EvalGoodMemoryScenarioStageError extends Error {
  cause?: unknown;
  boundary: EvalGoodMemoryScenarioFailureBoundary;
}

function wrapEvalGoodMemoryScenarioStageError(
  boundary: EvalGoodMemoryScenarioFailureBoundary,
  error: unknown,
): EvalGoodMemoryScenarioStageError {
  const wrapped = new Error(
    error instanceof Error ? error.message : String(error),
  ) as EvalGoodMemoryScenarioStageError;
  wrapped.name = "EvalGoodMemoryScenarioStageError";
  wrapped.boundary = boundary;
  wrapped.cause = error;
  if (error instanceof Error && error.stack) {
    wrapped.stack = error.stack;
  }

  return wrapped;
}

export function isEvalGoodMemoryScenarioStageError(
  error: unknown,
): error is EvalGoodMemoryScenarioStageError {
  return (
    error instanceof Error &&
    "boundary" in error &&
    (error.boundary === "pre_recall" || error.boundary === "recall_path")
  );
}

export interface EvalProposalTraceItem {
  id: string;
  proposalType: LearningProposalType;
  status: LearningProposalStatus;
  summary: string;
  rationale: string;
  modelInfluence: ExperienceModelInfluence;
  sourceExperienceIds: string[];
  linkedMemoryIds: string[];
  linkedArchiveIds: string[];
  linkedEvidenceIds: string[];
}

export interface EvalPromotionTraceItem {
  id: string;
  proposalId: string;
  decision: PromotionDecision;
  summary: string;
  rationale: string;
  policyOutcome: PromotionGateOutcome;
  verificationOutcome: PromotionGateOutcome;
  evalOutcome: PromotionGateOutcome;
}

export interface EvalProposalLifecycleTrace {
  experienceCount: number;
  experienceKindCounts: Partial<Record<ExperienceKind, number>>;
  proposalCount: number;
  proposalStatusCounts: Partial<Record<LearningProposalStatus, number>>;
  promotionCount: number;
  promotionDecisionCounts: Partial<Record<PromotionDecision, number>>;
  proposals: EvalProposalTraceItem[];
  promotions: EvalPromotionTraceItem[];
}

export interface EvalMaintenanceDebugSummary {
  acceptedProceduralPromotionCount: number;
  activeValidatedPatternCount: number;
  compiledValidatedPatternCount: number;
  correctionRepairFactCount: number;
  demotedFactCount: number;
  pressuredFactCount: number;
  supersededFeedbackCount: number;
}

export interface EvalAnswerPackage {
  mode: "baseline" | "goodmemory";
  strategyLabel:
    | "baseline"
    | RecallRouterStrategy
    | ReviewerStrategyLabel
    | MaintenanceStrategyLabel;
  resolvedStrategyLabel?:
    | RecallRouterStrategy
    | ReviewerStrategyLabel
    | MaintenanceStrategyLabel;
  strategyFamily?: "retrieval" | "reviewer" | "maintenance";
  strategyMode?: "observe" | "assist" | "promote";
  promotedStrategyLabel?:
    | "rules-only"
    | "assisted"
    | "hybrid"
    | "llm-assisted"
    | "default-hygiene"
    | "outcome-aware";
  candidateInfluencedExecution?: boolean;
  personaId: string;
  scenarioId: string;
  taskFamily: PersonalizationTaskFamily;
  targetDomain: string;
  memorySourceDomains: string[];
  evaluationSetting: ScenarioEvaluationSetting;
  prompt: string;
  transcript: string;
  memoryContext?: string;
  answer: string;
  retrieved?: {
    profile: RecallResult["profile"];
    preferences: RecallResult["preferences"];
    references: RecallResult["references"];
    facts: RecallResult["facts"];
    feedback: RecallResult["feedback"];
    archives: RecallResult["archives"];
    evidence: RecallResult["evidence"];
    episodes: RecallResult["episodes"];
    workingMemory: RecallResult["workingMemory"];
    journal: RecallResult["journal"];
    assistantInfluence?: RecallResult["metadata"]["assistantInfluence"];
    routingDecision?: RecallResult["metadata"]["routingDecision"];
    hits: RecallResult["metadata"]["hits"];
    candidateTraces: RecallResult["metadata"]["candidateTraces"];
    verificationHints: RecallResult["metadata"]["verificationHints"];
    policyApplied: RecallResult["metadata"]["policyApplied"];
    renderedMemoryContext: string;
  };
  trace: {
    sessionsReplayed: number;
    rememberEvents: Array<{
      sessionId: string;
      replayedTurns: number;
      accepted: number;
      rejected: number;
      events: PublicRememberResult["events"];
      metadata?: PublicRememberResult["metadata"];
    }>;
    feedbackEvents: Array<{
      sessionId: string;
      signal: string;
      accepted: boolean;
      outcome?: FeedbackResult["outcome"];
      memoryId?: string;
      kind?: FeedbackResult["kind"];
    }>;
    recallHitCount: number;
    verificationHintCount: number;
    proposalLifecycle: EvalProposalLifecycleTrace | null;
    maintenanceSummary?: EvalMaintenanceDebugSummary | null;
    contextBuild:
      | null
      | {
          output: "json" | "markdown" | "system_prompt_fragment" | "developer_prompt_fragment";
          maxTokens: number;
          contentLength: number;
          contextEstimatedTokens: number;
          packetTokenCountBeforeRender: number;
        };
  };
}

function renderTranscript(turns: ScenarioTurn[]): string {
  return turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
}

function getEvaluationPrompt(scenario: ScenarioFixture): string {
  return scenario.evaluation.prompt;
}

function buildEvaluationPlan(scenario: ScenarioFixture): {
  replaySessions: ScenarioFixture["sessions"];
  visibleTranscriptTurns: ScenarioTurn[];
} {
  const lastSession = scenario.sessions.at(-1);
  if (!lastSession) {
    return {
      replaySessions: [],
      visibleTranscriptTurns: [],
    };
  }

  const promptIndex = lastSession.turns.findIndex(
    (turn) => turn.role === "user" && turn.content === scenario.evaluation.prompt,
  );

  if (promptIndex === -1) {
    return {
      replaySessions: scenario.sessions,
      visibleTranscriptTurns: lastSession.turns,
    };
  }

  const replaySessions = scenario.sessions.slice(0, -1);
  const historicalTurns = lastSession.turns.slice(0, promptIndex);
  if (historicalTurns.length > 0) {
    replaySessions.push({
      ...lastSession,
      turns: historicalTurns,
    });
  }

  return {
    replaySessions,
    visibleTranscriptTurns: lastSession.turns.slice(0, promptIndex + 1),
  };
}

export async function runBaselineScenario(input: {
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  answerGenerator: EvalAnswerGenerator;
}): Promise<EvalAnswerPackage> {
  const prompt = getEvaluationPrompt(input.scenario);
  const evaluationPlan = buildEvaluationPlan(input.scenario);
  const transcript = renderTranscript(evaluationPlan.visibleTranscriptTurns);
  const answer = await input.answerGenerator({
    persona: input.persona,
    scenario: input.scenario,
    prompt,
    transcript,
  });

  return {
    mode: "baseline",
    strategyLabel: "baseline",
    personaId: input.persona.persona_id,
    scenarioId: input.scenario.scenario_id,
    taskFamily: input.scenario.task_family,
    targetDomain: input.scenario.domain,
    memorySourceDomains: input.scenario.memory_source_domains,
    evaluationSetting: input.scenario.evaluation_setting,
    prompt,
    transcript,
    answer: answer.content,
    trace: {
      sessionsReplayed: 0,
      rememberEvents: [],
      feedbackEvents: [],
      recallHitCount: 0,
      verificationHintCount: 0,
      proposalLifecycle: null,
      maintenanceSummary: null,
      contextBuild: null,
    },
  };
}

function sanitizeScopeNamespace(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-");
}

export function buildEvalUserId(
  persona: PersonaSpec,
  scopeNamespace?: string,
): string {
  return scopeNamespace
    ? `${persona.persona_id}--eval-${sanitizeScopeNamespace(scopeNamespace)}`
    : persona.persona_id;
}

export function buildEvalWorkspaceId(
  persona: PersonaSpec,
  scopeNamespace?: string,
): string {
  return scopeNamespace
    ? `eval-${persona.lifecycle_bucket}-${sanitizeScopeNamespace(scopeNamespace)}`
    : `eval-${persona.lifecycle_bucket}`;
}

function buildScenarioScope(
  persona: PersonaSpec,
  sessionId: string,
  scopeNamespace?: string,
) {
  return {
    userId: buildEvalUserId(persona, scopeNamespace),
    workspaceId: buildEvalWorkspaceId(persona, scopeNamespace),
    sessionId,
  };
}

function incrementCount<Key extends string>(
  counts: Partial<Record<Key, number>>,
  key: Key,
): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function compareByTimestamp(
  left: { id: string; createdAt?: string; decidedAt?: string },
  right: { id: string; createdAt?: string; decidedAt?: string },
): number {
  const leftTimestamp = left.decidedAt ?? left.createdAt ?? "";
  const rightTimestamp = right.decidedAt ?? right.createdAt ?? "";
  const timestampComparison = leftTimestamp.localeCompare(rightTimestamp);

  return timestampComparison !== 0 ? timestampComparison : left.id.localeCompare(right.id);
}

function buildProposalLifecycleTrace(
  exported: ExportMemoryResult,
): EvalProposalLifecycleTrace {
  const experienceKindCounts: EvalProposalLifecycleTrace["experienceKindCounts"] = {};
  const proposalStatusCounts: EvalProposalLifecycleTrace["proposalStatusCounts"] = {};
  const promotionDecisionCounts: EvalProposalLifecycleTrace["promotionDecisionCounts"] = {};

  for (const experience of exported.durable.experiences) {
    incrementCount(experienceKindCounts, experience.kind);
  }
  for (const proposal of exported.durable.proposals) {
    incrementCount(proposalStatusCounts, proposal.status);
  }
  for (const promotion of exported.durable.promotions) {
    incrementCount(promotionDecisionCounts, promotion.decision);
  }

  return {
    experienceCount: exported.durable.experiences.length,
    experienceKindCounts,
    proposalCount: exported.durable.proposals.length,
    proposalStatusCounts,
    promotionCount: exported.durable.promotions.length,
    promotionDecisionCounts,
    proposals: [...exported.durable.proposals]
      .sort(compareByTimestamp)
      .map((proposal) => ({
        id: proposal.id,
        proposalType: proposal.proposalType,
        status: proposal.status,
        summary: proposal.summary,
        rationale: proposal.rationale,
        modelInfluence: proposal.modelInfluence,
        sourceExperienceIds: proposal.sourceExperienceIds,
        linkedMemoryIds: proposal.linkedMemoryIds,
        linkedArchiveIds: proposal.linkedArchiveIds,
        linkedEvidenceIds: proposal.linkedEvidenceIds,
      })),
    promotions: [...exported.durable.promotions]
      .sort(compareByTimestamp)
      .map((promotion) => ({
        id: promotion.id,
        proposalId: promotion.proposalId,
        decision: promotion.decision,
        summary: promotion.summary,
        rationale: promotion.rationale,
        policyOutcome: promotion.policyOutcome,
        verificationOutcome: promotion.verificationOutcome,
        evalOutcome: promotion.evalOutcome,
      })),
  };
}

function buildMaintenanceDebugSummary(
  exported: ExportMemoryResult,
): EvalMaintenanceDebugSummary {
  const activeValidatedPatterns = exported.durable.feedback.filter(
    (record) =>
      record.lifecycle === "active" && record.kind === "validated_pattern",
  );
  const activeValidatedPatternCount = activeValidatedPatterns.length;
  const compiledValidatedPatternCount = activeValidatedPatterns.filter(
    (record) => record.source.method === "confirmed",
  ).length;
  const supersededFeedbackCount = exported.durable.feedback.filter(
    (record) => record.lifecycle === "superseded",
  ).length;
  const pressuredFactCount = exported.durable.facts.filter(
    (record) => (record.verificationPressureCount ?? 0) > 0,
  ).length;
  const demotedFacts = exported.durable.facts.filter((record) =>
    Boolean(record.demotionReason),
  );
  const acceptedProceduralProposalIds = new Set(
    exported.durable.proposals
      .filter(
        (proposal) =>
          proposal.proposalType === "procedural_pattern" &&
          proposal.status === "accepted",
      )
      .map((proposal) => proposal.id),
  );

  return {
    activeValidatedPatternCount,
    compiledValidatedPatternCount,
    supersededFeedbackCount,
    pressuredFactCount,
    demotedFactCount: demotedFacts.length,
    correctionRepairFactCount: demotedFacts.filter(
      (record) => record.demotionReason === "contradicted_by_stronger_fact",
    ).length,
    acceptedProceduralPromotionCount: exported.durable.promotions.filter(
      (promotion) =>
        promotion.decision === "accepted" &&
        acceptedProceduralProposalIds.has(promotion.proposalId),
    ).length,
  };
}

async function runScenarioFeedbackSignals(input: {
  memory: GoodMemory;
  persona: PersonaSpec;
  signals: ScenarioFeedbackSignal[];
  scopeNamespace?: string;
}): Promise<EvalAnswerPackage["trace"]["feedbackEvents"]> {
  const events: EvalAnswerPackage["trace"]["feedbackEvents"] = [];

  for (const signal of input.signals) {
    const result = await input.memory.feedback({
      scope: buildScenarioScope(
        input.persona,
        signal.session_id,
        input.scopeNamespace,
      ),
      signal: signal.signal,
    });
    events.push({
      sessionId: signal.session_id,
      signal: signal.signal,
      accepted: result.accepted,
      outcome: result.outcome,
      memoryId: result.memoryId,
      kind: result.kind,
    });
  }

  return events;
}

export async function runGoodMemoryScenario(input: {
  memory: GoodMemory;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  answerGenerator: EvalAnswerGenerator;
  retrievalProfile?: "general_chat" | "coding_agent";
  strategy?: RecallRouterStrategy;
  strategyRollout?: StrategyRolloutConfig;
  rememberExtractionStrategy?: MemoryExtractionStrategy;
  ignoreMemory?: boolean;
  scopeNamespace?: string;
}): Promise<EvalAnswerPackage> {
  const rememberEvents: EvalAnswerPackage["trace"]["rememberEvents"] = [];
  const evaluationPlan = buildEvaluationPlan(input.scenario);
  const evalUserId = buildEvalUserId(input.persona, input.scopeNamespace);
  const evalWorkspaceId = buildEvalWorkspaceId(input.persona, input.scopeNamespace);
  const retrievalRollout =
    !input.strategyRollout ||
    (input.strategyRollout.family ?? "retrieval") === "retrieval"
      ? (input.strategyRollout as RetrievalStrategyRolloutConfig | undefined)
      : undefined;
  const retrievalDecision = resolveRetrievalStrategyRollout({
    requestedStrategy: input.strategy,
    rollout: retrievalRollout,
  });
  const reviewerDecision =
    input.strategyRollout?.family === "reviewer"
      ? resolveReviewerStrategyRollout(input.strategyRollout)
      : undefined;
  const maintenanceDecision =
    input.strategyRollout?.family === "maintenance"
      ? resolveMaintenanceStrategyRollout(input.strategyRollout)
      : undefined;

  if (reviewerDecision) {
    assertReviewerExecutionSupport({
      executedStrategyLabel: reviewerDecision.executedStrategyLabel,
      memory: input.memory,
    });
  }

  let feedbackEvents: EvalAnswerPackage["trace"]["feedbackEvents"];
  try {
    for (const session of evaluationPlan.replaySessions) {
      const result = await input.memory.remember({
        scope: buildScenarioScope(
          input.persona,
          session.session_id,
          input.scopeNamespace,
        ),
        messages: session.turns,
        extractionStrategy: input.rememberExtractionStrategy,
      });

      rememberEvents.push({
        sessionId: session.session_id,
        replayedTurns: session.turns.length,
        accepted: result.accepted,
        rejected: result.rejected,
        events: result.events,
        metadata: result.metadata,
      });
    }

    feedbackEvents = await runScenarioFeedbackSignals({
      memory: input.memory,
      persona: input.persona,
      signals: input.scenario.feedback_signals ?? [],
      scopeNamespace: input.scopeNamespace,
    });

    if (maintenanceDecision) {
      await input.memory.runMaintenance({
        scope: {
          userId: evalUserId,
          workspaceId: evalWorkspaceId,
        },
        jobs: resolveMaintenanceJobs(
          maintenanceDecision.executedStrategyLabel,
        ),
      });
    }
  } catch (error) {
    throw wrapEvalGoodMemoryScenarioStageError("pre_recall", error);
  }

  let recall: RecallResult;
  try {
    recall = await input.memory.recall({
      scope: buildScenarioScope(
        input.persona,
        input.scenario.sessions.at(-1)!.session_id,
        input.scopeNamespace,
      ),
      query: getEvaluationPrompt(input.scenario),
      retrievalProfile: input.retrievalProfile ?? "general_chat",
      strategy: retrievalDecision.executedStrategy,
      ignoreMemory: input.ignoreMemory,
    });
  } catch (error) {
    throw wrapEvalGoodMemoryScenarioStageError("recall_path", error);
  }
  const retrievalCandidateInfluencedExecution =
    resolveRetrievalCandidateInfluencedExecution({
      recall,
      retrievalDecision,
    });

  let context;
  let exported: ExportMemoryResult;
  const prompt = getEvaluationPrompt(input.scenario);
  const transcript = renderTranscript(evaluationPlan.visibleTranscriptTurns);
  let answer: EvalAnswerGeneratorOutput;
  let proposalLifecycle: EvalProposalLifecycleTrace;
  try {
    context = await input.memory.buildContext({
      recall,
      output: "markdown",
      maxTokens: 160,
    });
    exported = await input.memory.exportMemory({
      scope: {
        userId: evalUserId,
        workspaceId: evalWorkspaceId,
      },
    });
    answer = await input.answerGenerator({
      persona: input.persona,
      scenario: input.scenario,
      prompt,
      transcript,
      memoryContext: context.content,
    });
    proposalLifecycle = buildProposalLifecycleTrace(exported);
  } catch (error) {
    throw wrapEvalGoodMemoryScenarioStageError("recall_path", error);
  }

  return {
    mode: "goodmemory",
    strategyLabel:
      reviewerDecision?.requestedStrategyLabel ??
      maintenanceDecision?.requestedStrategyLabel ??
      retrievalDecision.requestedStrategyLabel,
    resolvedStrategyLabel:
      reviewerDecision?.executedStrategyLabel ??
      maintenanceDecision?.executedStrategyLabel ??
      recall.metadata.routingDecision.strategy,
    strategyFamily:
      reviewerDecision?.family ??
      maintenanceDecision?.family ??
      retrievalDecision.family,
    strategyMode:
      reviewerDecision?.mode ??
      maintenanceDecision?.mode ??
      retrievalDecision.mode,
    promotedStrategyLabel:
      reviewerDecision?.promotedStrategyLabel ??
      maintenanceDecision?.promotedStrategyLabel ??
      retrievalDecision.promotedStrategyLabel,
    candidateInfluencedExecution:
      reviewerDecision?.candidateInfluencedExecution ??
      maintenanceDecision?.candidateInfluencedExecution ??
      retrievalCandidateInfluencedExecution,
    personaId: input.persona.persona_id,
    scenarioId: input.scenario.scenario_id,
    taskFamily: input.scenario.task_family,
    targetDomain: input.scenario.domain,
    memorySourceDomains: input.scenario.memory_source_domains,
    evaluationSetting: input.scenario.evaluation_setting,
    prompt,
    transcript,
    memoryContext: context.content,
    answer: answer.content,
    retrieved: {
      profile: recall.profile,
      preferences: recall.preferences,
      references: recall.references,
      facts: recall.facts,
      feedback: recall.feedback,
      archives: recall.archives,
      evidence: recall.evidence,
      episodes: recall.episodes,
      workingMemory: recall.workingMemory,
      journal: recall.journal,
      ...(recall.metadata.assistantInfluence
        ? { assistantInfluence: recall.metadata.assistantInfluence }
        : {}),
      routingDecision: recall.metadata.routingDecision,
      hits: recall.metadata.hits,
      candidateTraces: recall.metadata.candidateTraces,
      verificationHints: recall.metadata.verificationHints,
      policyApplied: recall.metadata.policyApplied,
      renderedMemoryContext: context.content,
    },
    trace: buildGoodMemoryTrace(
      rememberEvents,
      feedbackEvents,
      recall,
      context,
      proposalLifecycle,
      buildMaintenanceDebugSummary(exported),
    ),
  };
}

function buildGoodMemoryTrace(
  rememberEvents: EvalAnswerPackage["trace"]["rememberEvents"],
  feedbackEvents: EvalAnswerPackage["trace"]["feedbackEvents"],
  recall: RecallResult,
  context: {
    output: "json" | "markdown" | "system_prompt_fragment" | "developer_prompt_fragment";
    content: string;
    estimatedTokens: number;
  },
  proposalLifecycle: EvalProposalLifecycleTrace,
  maintenanceSummary: EvalMaintenanceDebugSummary,
): EvalAnswerPackage["trace"] {
  return {
    sessionsReplayed: rememberEvents.length,
    rememberEvents,
    feedbackEvents,
    recallHitCount: recall.metadata.hits.length,
    verificationHintCount: recall.metadata.verificationHints.length,
    proposalLifecycle,
    maintenanceSummary,
    contextBuild: {
      output: context.output,
      maxTokens: 160,
      contentLength: context.content.length,
      contextEstimatedTokens: context.estimatedTokens,
      packetTokenCountBeforeRender: recall.metadata.tokenCount,
    },
  };
}
