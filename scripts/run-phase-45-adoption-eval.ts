import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeKitWritebackCandidate } from "goodmemory/runtime-kit";
import { createGoodMemoryRuntimeKit } from "goodmemory/runtime-kit";
import type { MemoryScope } from "goodmemory";
import {
  createInMemoryReferenceProductBackend,
} from "../examples/reference-chat-product/backend";
import {
  createRuntimeViewerApp,
} from "../src/runtime-viewer/public";
import { resolveCliFlagValue } from "./cli-options";
import { resolveRepoRootFromScriptUrl } from "./script-paths";

export interface Phase45AdoptionEvalOptions {
  outputDir?: string;
  runId?: string;
}

export type Phase45ScenarioFamily =
  | "identity_background_continuity"
  | "project_preference_continuity"
  | "coding_style_preference_continuity"
  | "historical_task_continuation"
  | "user_correction_targeted_revise"
  | "wrong_memory_forget"
  | "procedural_feedback_memory"
  | "observe_writeback_candidate_visibility"
  | "selective_writeback_next_turn_recall"
  | "no_provider_rules_only_fallback"
  | "optional_provider_backed_retrieval_uplift"
  | "local_viewer_trace_writeback_session_inspection";

type Phase45ObserveReviewOutcome =
  | "accepted_as_useful"
  | "rejected_as_unsafe_or_noisy";

type Phase45ObserveReviewReasonCode =
  | "explicit_private_secret_do_not_store"
  | "useful_launch_note_candidate";

interface Phase45ObserveReviewDecision {
  candidatePreviewRedacted: boolean;
  outcome: Phase45ObserveReviewOutcome;
  persistedAsMemory: false;
  rawTranscriptPersisted: false;
  reasonCode: Phase45ObserveReviewReasonCode;
}

export interface Phase45VariantScenarioResult {
  missedRecall: boolean;
  observed: boolean;
  status: "passed" | "skipped";
  usefulRecall: boolean;
  wrongRecall: boolean;
}

export interface Phase45ScenarioResult {
  caseId: string;
  checks: string[];
  family: Phase45ScenarioFamily;
  passed: boolean;
  productPath: "reference-product-backend";
  providerBacked: Phase45VariantScenarioResult;
  rawTranscriptPersisted: false;
  redactedEvidence: {
    acceptedCandidateCount?: number;
    backendMutationCount?: number;
    handoffCount?: number;
    matchedSignals: string[];
    observedCandidateCount?: number;
    recordRefCount?: number;
    rejectedCandidateCount?: number;
    reviewDecisionCount?: number;
    reviewDecisionReasonCodes?: Phase45ObserveReviewReasonCode[];
    traceEventCount?: number;
    viewerMutationRejected?: boolean;
  };
  rulesOnlyGoodMemory: Phase45VariantScenarioResult;
  noMemory: Phase45VariantScenarioResult;
}

export interface Phase45AdoptionEvalReport {
  acceptance: {
    decision: "accepted" | "blocked";
    reason: string;
  };
  generatedAt: string;
  generatedBy: "scripts/run-phase-45-adoption-eval.ts";
  metrics: {
    correctionSuccessRate: number;
    firstUsefulRecallRate: number;
    missedRecallRate: number;
    observeToSelectiveConversionReadiness: {
      acceptedReviewedRatio: number;
      observedCandidatesAcceptedAsUseful: number;
      observedCandidatesRejectedAsUnsafeOrNoisy: number;
      observedCandidatesReviewed: number;
      scenariosWhereSelectiveWritebackJustified: number;
    };
    noMemoryLeakRate: number;
    staleMemoryRate: number;
    timeToFirstMemoryValueMs: number;
    userVisibleSetupSteps: number;
    wrongRecallRate: number;
  };
  mode: "reference-product-adoption-eval";
  outputDir: string;
  phase: "phase-45";
  rawTranscriptPersistence: {
    defaultRuntimeArchive: "off";
    evidenceSource: "redacted_reference_product_scenario_events";
    persistedRawTranscripts: false;
  };
  runDirectory: string;
  runId: string;
  scenarios: Phase45ScenarioResult[];
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
  variants: {
    noMemory: {
      description: string;
      mode: "no-memory";
      observed: true;
    };
    providerBackedGoodMemory: {
      description: string;
      mode: "provider-backed-goodmemory";
      reason: string;
      status: "accepted" | "skipped";
    };
    rulesOnlyGoodMemory: {
      description: string;
      mode: "rules-only-goodmemory";
      storage: "memory";
    };
  };
}

export interface Phase45AdoptionEvalDependencies {
  ensureDir?: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  now?: () => string;
  overrideNoMemoryBaseline?: (
    input: Phase45NoMemoryBaselineInput,
  ) => Phase45VariantScenarioResult | Promise<Phase45VariantScenarioResult>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

export interface Phase45AdoptionEvalCliDependencies {
  argv?: readonly string[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
  runEval?: (
    options?: Phase45AdoptionEvalOptions,
  ) => Promise<Phase45AdoptionEvalReport>;
}

interface RecallScenarioDefinition {
  caseId: string;
  expectedNeedles: string[];
  expectedSignals: string[];
  family: Phase45ScenarioFamily;
  message: string;
  query: string;
  wrongNeedles?: string[];
}

export interface Phase45NoMemoryBaselineInput {
  caseId: string;
  expectedNeedles: readonly string[];
  query: string;
  wrongNeedles?: readonly string[];
}

const GENERATED_BY = "scripts/run-phase-45-adoption-eval.ts";
const PHASE45_IN_SCOPE = [
  "runnable reference product under examples/reference-chat-product",
  "public package and authenticated HTTP bridge surfaces",
  "no-memory baseline versus rules-only GoodMemory",
  "provider-backed uplift explicitly skipped locally until a real runner exists",
  "product-facing correction, forget, feedback, observe, and selective writeback evidence",
  "deprecated runtime-viewer compatibility through the scope-bound read-only Inspector",
] as const;
const PHASE45_OUT_OF_SCOPE = [
  "hosted dashboard, account, team workspace, cloud sync, or analytics",
  "mutations through the deprecated runtime viewer",
  "raw transcript archive as accepted evidence",
  "new root public API",
] as const;

const RECALL_SCENARIOS = [
  {
    caseId: "identity-background-continuity",
    expectedNeedles: ["Aster"],
    expectedSignals: ["remembered-profile-name"],
    family: "identity_background_continuity",
    message: "My name is Aster.",
    query: "What is my name?",
  },
  {
    caseId: "project-preference-continuity",
    expectedNeedles: ["concise launch risk summaries"],
    expectedSignals: ["project-update-style"],
    family: "project_preference_continuity",
    message: "I prefer concise launch risk summaries.",
    query: "How should launch updates be written?",
  },
  {
    caseId: "coding-style-preference-continuity",
    expectedNeedles: ["TypeScript with explicit boundary tests"],
    expectedSignals: ["typescript-boundary-test-style"],
    family: "coding_style_preference_continuity",
    message: "I prefer TypeScript with explicit boundary tests.",
    query: "What coding style should be used?",
  },
  {
    caseId: "historical-task-continuation",
    expectedNeedles: ["security review"],
    expectedSignals: ["launch-checklist-blocker"],
    family: "historical_task_continuation",
    message:
      "Remember that the project launch checklist is blocked by security review.",
    query: "What blocks the launch checklist?",
  },
] as const satisfies readonly RecallScenarioDefinition[];

export function resolvePhase45AdoptionEvalOutputDir(root: string): string {
  return join(root, "reports/eval/adoption/phase-45");
}

export function buildPhase45AdoptionEvalRunId(timestamp: string): string {
  const value = timestamp.replace(/\D/gu, "").slice(0, 14) || "phase45adoption";
  return `run-${value}-adoption-eval`;
}

export function parsePhase45AdoptionEvalCliOptions(
  argv: readonly string[],
): Phase45AdoptionEvalOptions {
  return {
    outputDir: resolveCliFlagValue(argv, "--output-dir"),
    runId: resolveCliFlagValue(argv, "--run-id"),
  };
}

function scenarioScope(caseId: string): MemoryScope {
  return {
    agentId: "phase45-reference-product",
    sessionId: `phase45-${caseId}`,
    tenantId: "phase45-adoption-tenant",
    userId: `phase45-${caseId}-user`,
    workspaceId: "phase45-adoption-workspace",
  };
}

function passedVariant(input: {
  usefulRecall: boolean;
  wrongRecall?: boolean;
}): Phase45VariantScenarioResult {
  const wrongRecall = input.wrongRecall ?? false;
  return {
    missedRecall: !input.usefulRecall,
    observed: true,
    status: "passed",
    usefulRecall: input.usefulRecall,
    wrongRecall,
  };
}

function skippedVariant(): Phase45VariantScenarioResult {
  return {
    missedRecall: false,
    observed: false,
    status: "skipped",
    usefulRecall: false,
    wrongRecall: false,
  };
}

function noMemoryMissed(): Phase45VariantScenarioResult {
  return {
    missedRecall: true,
    observed: true,
    status: "passed",
    usefulRecall: false,
    wrongRecall: false,
  };
}

function hasEveryNeedle(content: string, needles: readonly string[]): boolean {
  return needles.every((needle) => content.includes(needle));
}

function hasAnyNeedle(content: string, needles: readonly string[] = []): boolean {
  return needles.some((needle) => content.includes(needle));
}

async function observeNoMemoryRecall(
  input: Phase45NoMemoryBaselineInput,
  override?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45VariantScenarioResult> {
  if (override) {
    return await override(input);
  }

  const { product } = createInMemoryReferenceProductBackend({
    scope: scenarioScope(`${input.caseId}-no-memory`),
  });
  const recall = await product.recallContext(input.query);
  const usefulRecall = hasEveryNeedle(recall.contextText, input.expectedNeedles);
  const wrongRecall = hasAnyNeedle(recall.contextText, input.wrongNeedles);

  return {
    missedRecall: !usefulRecall,
    observed: true,
    status: "passed",
    usefulRecall,
    wrongRecall,
  };
}

function createScenarioResult(input: {
  acceptedCandidateCount?: number;
  backendMutationCount?: number;
  caseId: string;
  checks: string[];
  family: Phase45ScenarioFamily;
  handoffCount?: number;
  matchedSignals: string[];
  noMemory?: Phase45VariantScenarioResult;
  observedCandidateCount?: number;
  passed: boolean;
  providerBacked?: Phase45VariantScenarioResult;
  recordRefCount?: number;
  rejectedCandidateCount?: number;
  reviewDecisionCount?: number;
  reviewDecisionReasonCodes?: Phase45ObserveReviewReasonCode[];
  rulesOnlyGoodMemory?: Phase45VariantScenarioResult;
  traceEventCount?: number;
  viewerMutationRejected?: boolean;
}): Phase45ScenarioResult {
  return {
    caseId: input.caseId,
    checks: input.checks,
    family: input.family,
    noMemory: input.noMemory ?? noMemoryMissed(),
    passed: input.passed,
    productPath: "reference-product-backend",
    providerBacked: input.providerBacked ?? skippedVariant(),
    rawTranscriptPersisted: false,
    redactedEvidence: {
      ...(input.acceptedCandidateCount !== undefined
        ? { acceptedCandidateCount: input.acceptedCandidateCount }
        : {}),
      ...(input.backendMutationCount !== undefined
        ? { backendMutationCount: input.backendMutationCount }
        : {}),
      ...(input.handoffCount !== undefined
        ? { handoffCount: input.handoffCount }
        : {}),
      matchedSignals: input.matchedSignals,
      ...(input.observedCandidateCount !== undefined
        ? { observedCandidateCount: input.observedCandidateCount }
        : {}),
      ...(input.recordRefCount !== undefined
        ? { recordRefCount: input.recordRefCount }
        : {}),
      ...(input.rejectedCandidateCount !== undefined
        ? { rejectedCandidateCount: input.rejectedCandidateCount }
        : {}),
      ...(input.reviewDecisionCount !== undefined
        ? { reviewDecisionCount: input.reviewDecisionCount }
        : {}),
      ...(input.reviewDecisionReasonCodes !== undefined
        ? { reviewDecisionReasonCodes: input.reviewDecisionReasonCodes }
        : {}),
      ...(input.traceEventCount !== undefined
        ? { traceEventCount: input.traceEventCount }
        : {}),
      ...(input.viewerMutationRejected !== undefined
        ? { viewerMutationRejected: input.viewerMutationRejected }
        : {}),
    },
    rulesOnlyGoodMemory:
      input.rulesOnlyGoodMemory ?? passedVariant({ usefulRecall: input.passed }),
  };
}

function reviewObserveCandidates(input: {
  candidates: RuntimeKitWritebackCandidate[];
  outcome: Phase45ObserveReviewOutcome;
  reasonCode: Phase45ObserveReviewReasonCode;
  redactedNeedle?: string;
}): Phase45ObserveReviewDecision[] {
  return input.candidates.map((candidate) => ({
    candidatePreviewRedacted:
      input.redactedNeedle === undefined ||
      !candidate.preview.includes(input.redactedNeedle),
    outcome: input.outcome,
    persistedAsMemory: false,
    rawTranscriptPersisted: candidate.rawTranscriptPersisted,
    reasonCode: input.reasonCode,
  }));
}

function countObserveReviewDecisions(
  decisions: Phase45ObserveReviewDecision[],
  outcome: Phase45ObserveReviewOutcome,
): number {
  return decisions.filter((decision) => decision.outcome === outcome).length;
}

function observeReviewDecisionsPassed(
  decisions: Phase45ObserveReviewDecision[],
): boolean {
  return (
    decisions.length === 2 &&
    decisions.every((decision) =>
      decision.rawTranscriptPersisted === false &&
      decision.persistedAsMemory === false &&
      decision.candidatePreviewRedacted
    ) &&
    decisions.some((decision) =>
      decision.outcome === "accepted_as_useful" &&
      decision.reasonCode === "useful_launch_note_candidate"
    ) &&
    decisions.some((decision) =>
      decision.outcome === "rejected_as_unsafe_or_noisy" &&
      decision.reasonCode === "explicit_private_secret_do_not_store"
    )
  );
}

async function executeRecallScenario(
  definition: RecallScenarioDefinition,
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45ScenarioResult & { firstValueMs: number }> {
  const noMemory = await observeNoMemoryRecall({
    caseId: definition.caseId,
    expectedNeedles: definition.expectedNeedles,
    query: definition.query,
    wrongNeedles: definition.wrongNeedles,
  }, overrideNoMemoryBaseline);
  const { product } = createInMemoryReferenceProductBackend({
    scope: scenarioScope(definition.caseId),
  });
  const startedAtMs = Date.now();
  await product.remember({
    idempotencyKey: `${definition.caseId}-remember`,
    message: definition.message,
  });
  const recall = await product.recallContext(definition.query);
  const firstValueMs = Date.now() - startedAtMs;
  const usefulRecall = hasEveryNeedle(recall.contextText, definition.expectedNeedles);
  const wrongRecall = hasAnyNeedle(recall.contextText, definition.wrongNeedles);

  return {
    ...createScenarioResult({
      caseId: definition.caseId,
      checks: ["remember", "recall-context", "no-memory-baseline"],
      family: definition.family,
      matchedSignals: usefulRecall ? definition.expectedSignals : [],
      noMemory,
      passed: usefulRecall && !wrongRecall,
      rulesOnlyGoodMemory: passedVariant({ usefulRecall, wrongRecall }),
    }),
    firstValueMs,
  };
}

async function executeCorrectionScenario(
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45ScenarioResult> {
  const noMemory = await observeNoMemoryRecall({
    caseId: "user-correction-targeted-revise",
    expectedNeedles: ["wind-down"],
    query: "What is the quarterly priority?",
    wrongNeedles: ["release plan"],
  }, overrideNoMemoryBaseline);
  const { product } = createInMemoryReferenceProductBackend({
    scope: scenarioScope("user-correction-targeted-revise"),
  });
  await product.remember({
    idempotencyKey: "correction-original",
    message: "Remember that the quarterly priority is writing a release plan.",
  });
  const original = await product.recallContext("What is the quarterly priority?");
  const targetMemoryId = original.memoryIds[0];
  if (!targetMemoryId) {
    return createScenarioResult({
      caseId: "user-correction-targeted-revise",
      checks: ["remember", "recall-context", "revise"],
      family: "user_correction_targeted_revise",
      matchedSignals: [],
      noMemory,
      passed: false,
      rulesOnlyGoodMemory: passedVariant({ usefulRecall: false }),
    });
  }

  await product.revise({
    content:
      "Quarterly priority: rebuild the sleep routine with a consistent wind-down.",
    idempotencyKey: "correction-revise",
    memoryId: targetMemoryId,
  });
  const revised = await product.recallContext("What is the quarterly priority?");
  const usefulRecall = revised.contextText.includes("wind-down");
  const staleRecall = revised.contextText.includes("release plan");

  return createScenarioResult({
    caseId: "user-correction-targeted-revise",
    checks: ["remember", "recall-context", "revise", "stale-memory-check"],
    family: "user_correction_targeted_revise",
    matchedSignals: usefulRecall ? ["targeted-revise-applied"] : [],
    noMemory,
    passed: usefulRecall && !staleRecall,
    rulesOnlyGoodMemory: passedVariant({
      usefulRecall,
      wrongRecall: staleRecall,
    }),
  });
}

async function executeForgetScenario(
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45ScenarioResult> {
  const noMemory = await observeNoMemoryRecall({
    caseId: "wrong-memory-forget",
    expectedNeedles: ["Mars"],
    query: "What is the deployment target?",
  }, overrideNoMemoryBaseline);
  const { product } = createInMemoryReferenceProductBackend({
    scope: scenarioScope("wrong-memory-forget"),
  });
  await product.remember({
    idempotencyKey: "forget-wrong-memory",
    message: "Remember that the wrong deployment target is Mars.",
  });
  const beforeForget = await product.recallContext("What is the deployment target?");
  const targetMemoryId = beforeForget.memoryIds[0];
  if (targetMemoryId) {
    await product.forget({ memoryId: targetMemoryId });
  }
  const afterForget = await product.recallContext("What is the deployment target?");
  const staleRecall = afterForget.contextText.includes("Mars");
  const forgotTarget = Boolean(targetMemoryId) && !afterForget.memoryIds.includes(targetMemoryId);

  return createScenarioResult({
    caseId: "wrong-memory-forget",
    checks: ["remember", "recall-context", "forget", "stale-memory-check"],
    family: "wrong_memory_forget",
    matchedSignals: forgotTarget && !staleRecall ? ["wrong-memory-forgotten"] : [],
    noMemory,
    passed: forgotTarget && !staleRecall,
    rulesOnlyGoodMemory: passedVariant({
      usefulRecall: forgotTarget,
      wrongRecall: staleRecall,
    }),
  });
}

async function executeFeedbackScenario(
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45ScenarioResult> {
  const noMemory = await observeNoMemoryRecall({
    caseId: "procedural-feedback-memory",
    expectedNeedles: ["checklists"],
    query: "How should coaching sessions be summarized?",
  }, overrideNoMemoryBaseline);
  const { product } = createInMemoryReferenceProductBackend({
    scope: scenarioScope("procedural-feedback-memory"),
  });
  await product.feedback({
    idempotencyKey: "feedback-procedural",
    signal: "Always summarize coaching sessions as short action checklists.",
  });
  const exported = await product.exportMemory();
  const feedbackStored = exported.feedbackCount > 0;

  return createScenarioResult({
    caseId: "procedural-feedback-memory",
    checks: ["feedback", "export"],
    family: "procedural_feedback_memory",
    matchedSignals: feedbackStored ? ["procedural-feedback-stored"] : [],
    noMemory,
    passed: feedbackStored,
    rulesOnlyGoodMemory: passedVariant({ usefulRecall: feedbackStored }),
  });
}

async function executeObserveScenario(
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45ScenarioResult & {
  acceptedCandidates: number;
  rejectedCandidates: number;
  reviewedCandidates: number;
}> {
  const noMemory = await observeNoMemoryRecall({
    caseId: "observe-writeback-candidate-visibility",
    expectedNeedles: ["launch note"],
    query: "What launch note is ready?",
  }, overrideNoMemoryBaseline);
  const { memory } = createInMemoryReferenceProductBackend({
    scope: scenarioScope("observe-writeback-candidate-visibility"),
  });
  const kit = createGoodMemoryRuntimeKit({ memory });
  const useful = await kit.afterModelCall({
    assistantText: "I will keep that launch note visible for review.",
    messages: [
      {
        content: "Remember that the launch note is ready for review.",
        role: "user",
      },
    ],
    scope: scenarioScope("observe-writeback-candidate-visibility"),
    writeback: { mode: "observe" },
  });
  const unsafe = await kit.afterModelCall({
    assistantText: "I will not preserve private secrets.",
    messages: [
      {
        content: "Do not store sk-phase45-private as a durable memory.",
        role: "user",
      },
    ],
    scope: scenarioScope("observe-writeback-candidate-visibility"),
    writeback: { mode: "observe" },
  });
  const secretRedacted = unsafe.candidates.every(
    (candidate) => !candidate.preview.includes("sk-phase45-private"),
  );
  const reviewDecisions = [
    ...reviewObserveCandidates({
      candidates: useful.candidates,
      outcome: "accepted_as_useful",
      reasonCode: "useful_launch_note_candidate",
    }),
    ...reviewObserveCandidates({
      candidates: unsafe.candidates,
      outcome: "rejected_as_unsafe_or_noisy",
      reasonCode: "explicit_private_secret_do_not_store",
      redactedNeedle: "sk-phase45-private",
    }),
  ];
  const reviewPassed = observeReviewDecisionsPassed(reviewDecisions);
  const rawTranscriptPersisted =
    useful.trace.rawTranscriptPersisted || unsafe.trace.rawTranscriptPersisted;
  const reviewedCandidates = reviewDecisions.length;
  const acceptedCandidates = countObserveReviewDecisions(
    reviewDecisions,
    "accepted_as_useful",
  );
  const rejectedCandidates =
    reviewDecisions.filter((decision) =>
      decision.outcome === "rejected_as_unsafe_or_noisy" &&
      decision.candidatePreviewRedacted
    ).length;
  const reviewDecisionReasonCodes = Array.from(
    new Set(reviewDecisions.map((decision) => decision.reasonCode)),
  );

  return {
    ...createScenarioResult({
      acceptedCandidateCount: acceptedCandidates,
      caseId: "observe-writeback-candidate-visibility",
      checks: ["runtime-kit-observe", "reference-product-review-decision"],
      family: "observe_writeback_candidate_visibility",
      matchedSignals:
        reviewPassed && secretRedacted && !rawTranscriptPersisted
          ? [
              "observe-candidates-reviewable",
              "observe-useful-candidate-approved",
              "observe-private-candidate-rejected",
            ]
          : [],
      noMemory,
      observedCandidateCount: reviewedCandidates,
      passed: reviewPassed && secretRedacted && !rawTranscriptPersisted,
      rejectedCandidateCount: rejectedCandidates,
      reviewDecisionCount: reviewDecisions.length,
      reviewDecisionReasonCodes,
      rulesOnlyGoodMemory: passedVariant({
        usefulRecall: reviewPassed && secretRedacted,
      }),
      traceEventCount: useful.events.length + unsafe.events.length,
    }),
    acceptedCandidates,
    rejectedCandidates,
    reviewedCandidates,
  };
}

async function executeSelectiveWritebackScenario(
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45ScenarioResult> {
  const scope = scenarioScope("selective-writeback-next-turn-recall");
  const noMemory = await observeNoMemoryRecall({
    caseId: "selective-writeback-next-turn-recall",
    expectedNeedles: ["selective launch note is ready"],
    query: "What selective launch note is ready?",
  }, overrideNoMemoryBaseline);
  const { memory, product } = createInMemoryReferenceProductBackend({ scope });
  const kit = createGoodMemoryRuntimeKit({ memory });
  const writeback = await kit.afterModelCall({
    assistantText: "I will remember that the selective launch note is ready.",
    messages: [
      {
        content: "Remember that the selective launch note is ready.",
        role: "user",
      },
    ],
    scope,
    writeback: {
      annotation: "durable_candidate",
      mode: "selective",
      policy: "allow",
    },
  });
  const recall = await product.recallContext("What selective launch note is ready?");
  const usefulRecall = recall.contextText.includes("selective launch note is ready");

  return createScenarioResult({
    caseId: "selective-writeback-next-turn-recall",
    checks: ["runtime-kit-selective-writeback", "next-turn-recall"],
    family: "selective_writeback_next_turn_recall",
    matchedSignals:
      usefulRecall && writeback.rememberResult
        ? ["selective-writeback-recalled"]
        : [],
    noMemory,
    passed: usefulRecall && Boolean(writeback.rememberResult),
    rulesOnlyGoodMemory: passedVariant({ usefulRecall }),
    traceEventCount: writeback.events.length,
  });
}

async function executeRulesOnlyFallbackScenario(
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45ScenarioResult> {
  const noMemory = await observeNoMemoryRecall({
    caseId: "no-provider-rules-only-fallback",
    expectedNeedles: ["phase45-runbook.md"],
    query: "What source of truth should I use?",
  }, overrideNoMemoryBaseline);
  const { product } = createInMemoryReferenceProductBackend({
    scope: scenarioScope("no-provider-rules-only-fallback"),
  });
  await product.remember({
    idempotencyKey: "no-provider-fallback",
    message: "Use docs/phase45-runbook.md as the source of truth.",
  });
  const recall = await product.recallContext("What source of truth should I use?");
  const usefulRecall = recall.contextText.includes("phase45-runbook.md");

  return createScenarioResult({
    caseId: "no-provider-rules-only-fallback",
    checks: ["rules-only-remember", "rules-only-recall-context"],
    family: "no_provider_rules_only_fallback",
    matchedSignals: usefulRecall ? ["rules-only-reference-recalled"] : [],
    noMemory,
    passed: usefulRecall,
    rulesOnlyGoodMemory: passedVariant({ usefulRecall }),
  });
}

async function executeProviderBackedScenario(
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45ScenarioResult> {
  const providerEvalRequested = isProviderBackedEvalRequested();
  const providerBacked = skippedVariant();
  const noMemory = await withRulesOnlyEnvironment(async () =>
    await observeNoMemoryRecall({
      caseId: "optional-provider-backed-retrieval-uplift",
      expectedNeedles: ["provider-backed uplift"],
      query: "What provider-backed uplift is available?",
    }, overrideNoMemoryBaseline)
  );

  return createScenarioResult({
    caseId: "optional-provider-backed-retrieval-uplift",
    checks: [
      providerEvalRequested
        ? "provider-backed-real-execution-not-implemented"
        : "provider-backed-eval-explicitly-skipped",
    ],
    family: "optional_provider_backed_retrieval_uplift",
    matchedSignals: [],
    noMemory,
    passed: !providerEvalRequested && providerBacked.status === "skipped",
    providerBacked,
    rulesOnlyGoodMemory: skippedVariant(),
  });
}

interface Phase45ViewerFlowEvidence {
  backendMutationCount: number;
  handoffCount: number;
  inspectable: boolean;
  matchedSignals: string[];
  observedCandidateCount: number;
  recordRefCount: number;
  traceEventCount: number;
  viewerMutationRejected: boolean;
}

interface Phase45AdminEnvelope<T> {
  data: T;
}

function viewerRequest(input: {
  body?: string;
  method?: string;
  path: string;
  token: string;
}): Request {
  const headers = new Headers({
    authorization: `Bearer ${input.token}`,
  });
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new Request(`http://127.0.0.1${input.path}`, {
    ...(input.body !== undefined ? { body: input.body } : {}),
    headers,
    method: input.method,
  });
}

async function readViewerJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

async function executeReferenceProductViewerFlow(input: {
  product: ReturnType<typeof createInMemoryReferenceProductBackend>["product"];
  memory: ReturnType<typeof createInMemoryReferenceProductBackend>["memory"];
  observe: Awaited<ReturnType<ReturnType<typeof createGoodMemoryRuntimeKit>["afterModelCall"]>>;
  scope: MemoryScope;
  startedEventCount: number;
}): Promise<Phase45ViewerFlowEvidence> {
  const token = "phase45-viewer-token";
  const app = createRuntimeViewerApp({
    memory: input.memory,
    now: () => new Date("2026-04-27T10:45:30.000Z"),
    scope: input.scope,
    token,
  });
  const descriptorResponse = await app.fetch(
    viewerRequest({ path: "/admin/v1/descriptor", token }),
  );
  const descriptor = await readViewerJson<Phase45AdminEnvelope<{
    mutationRoutes: boolean;
    readOnly: boolean;
  }>>(descriptorResponse);
  const scopesResponse = await app.fetch(
    viewerRequest({ path: "/admin/v1/scopes", token }),
  );
  const scopes = await readViewerJson<Phase45AdminEnvelope<{
    items: Array<{ scopeKey: string }>;
  }>>(scopesResponse);
  const scopeKey = scopes.data.items[0]?.scopeKey;
  const memoriesResponse = scopeKey
    ? await app.fetch(
        viewerRequest({
          path: `/admin/v1/scopes/${encodeURIComponent(scopeKey)}/memories`,
          token,
        }),
      )
    : undefined;
  const memoriesText = memoriesResponse ? await memoriesResponse.text() : "";
  const memories = memoriesText
    ? JSON.parse(memoriesText) as Phase45AdminEnvelope<{
        items: Array<{ id: string; summary: string }>;
      }>
    : { data: { items: [] } };
  const memoryItem = memories.data.items.find(({ summary }) =>
    summary.includes("traceable session")
  );
  const traceResponse = scopeKey
    ? await app.fetch(
        viewerRequest({
          body: JSON.stringify({
            query: "What viewer inspection run is traceable?",
            scopeKey,
          }),
          method: "POST",
          path: "/admin/v1/recall-traces",
          token,
        }),
      )
    : undefined;
  const traceText = traceResponse ? await traceResponse.text() : "";
  const deniedScope = await app.fetch(
    viewerRequest({
      path: "/admin/v1/scopes/scope_other/memories",
      token,
    }),
  );
  const mutationDenied = scopeKey && memoryItem
    ? await app.fetch(
        viewerRequest({
          method: "DELETE",
          path: `/admin/v1/scopes/${encodeURIComponent(scopeKey)}/memories/${encodeURIComponent(memoryItem.id)}`,
          token,
        }),
      )
    : undefined;
  const beforeMutation = await input.product.recallContext(
    "What viewer inspection run is traceable?",
  );
  const targetMemoryId = beforeMutation.memoryIds[0];
  const revised = targetMemoryId
    ? await input.product.revise({
        content:
          "Viewer inspection run: traceable session updated through backend revise.",
        idempotencyKey: "viewer-backend-revise",
        memoryId: targetMemoryId,
      })
    : { accepted: false };
  const revisedRecall = await input.product.recallContext(
    "What viewer inspection run is traceable?",
  );
  const forgotten = targetMemoryId
    ? await input.product.forget({ memoryId: targetMemoryId })
    : { accepted: false };
  const afterForget = await input.product.recallContext(
    "What viewer inspection run is traceable?",
  );
  const handoffCount = 0;
  const backendMutationCount =
    (revised.accepted ? 1 : 0) + (forgotten.accepted ? 1 : 0);
  const viewerMutationRejected =
    mutationDenied?.status === 405 && deniedScope.status === 404;
  const adminInspectable =
    descriptorResponse.status === 200 &&
    descriptor.data.readOnly === true &&
    descriptor.data.mutationRoutes === false &&
    scopesResponse.status === 200 &&
    traceResponse?.status === 200 &&
    traceText.includes("candidateTraces") &&
    !traceText.includes("viewer.phase45@example.com") &&
    !traceText.includes("sk-phase45-viewer");
  const memoriesInspectable =
    memoriesResponse?.status === 200 &&
    memoryItem !== undefined &&
    !memoriesText.includes("viewer.phase45@example.com") &&
    !memoriesText.includes("sk-phase45-viewer");
  const backendMutated =
    revisedRecall.contextText.includes("backend revise") &&
    !afterForget.memoryIds.includes(targetMemoryId ?? "");
  const inspectable = Boolean(
    adminInspectable &&
      memoriesInspectable &&
      viewerMutationRejected &&
      backendMutationCount === 2 &&
      backendMutated,
  );

  return {
    backendMutationCount,
    handoffCount,
    inspectable,
    matchedSignals: inspectable
      ? [
          "inspector-scope-catalog",
          "inspector-memory-drilldown",
          "inspector-recall-trace",
          "runtime-viewer-read-only-adapter",
          "backend-mutations-outside-inspector",
        ]
      : [],
    observedCandidateCount: input.observe.trace.candidateCount,
    recordRefCount: memoryItem ? 1 : 0,
    traceEventCount: input.startedEventCount + input.observe.events.length,
    viewerMutationRejected,
  };
}

async function executeViewerInspectabilityScenario(
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"],
): Promise<Phase45ScenarioResult> {
  const scope = scenarioScope("local-viewer-trace-writeback-session-inspection");
  const noMemory = await observeNoMemoryRecall({
    caseId: "local-viewer-trace-writeback-session-inspection",
    expectedNeedles: ["traceable session"],
    query: "What viewer inspection run is traceable?",
  }, overrideNoMemoryBaseline);
  const { memory, product } = createInMemoryReferenceProductBackend({ scope });
  const kit = createGoodMemoryRuntimeKit({ memory });
  const started = await kit.sessionStart({ scope });
  await product.chat({
    message: "Remember that the viewer inspection run has a traceable session.",
    remember: true,
    turnId: "viewer-inspection-chat",
  });
  const observe = await kit.afterModelCall({
    assistantText: "I will keep the viewer inspection candidate visible.",
    messages: [
      {
        content:
          "Remember that viewer inspection candidate is ready for viewer.phase45@example.com with token sk-phase45-viewer.",
        role: "user",
      },
    ],
    scope,
    writeback: { mode: "observe" },
  });
  const viewer = await executeReferenceProductViewerFlow({
    memory,
    observe,
    product,
    scope,
    startedEventCount: started.events.length,
  });
  const ended = await kit.sessionEnd({ archive: "off", scope });
  const traceEventCount =
    viewer.traceEventCount + ended.events.length;
  const inspectable =
    viewer.inspectable &&
    traceEventCount > 0 &&
    !observe.trace.rawTranscriptPersisted;

  return createScenarioResult({
    caseId: "local-viewer-trace-writeback-session-inspection",
    backendMutationCount: viewer.backendMutationCount,
    checks: [
      "session-start",
      "chat",
      "inspector-scope-catalog",
      "inspector-memory-list",
      "inspector-recall-trace",
      "runtime-viewer-read-only-adapter",
      "backend-mutation-flow",
      "session-end",
    ],
    family: "local_viewer_trace_writeback_session_inspection",
    handoffCount: viewer.handoffCount,
    matchedSignals: viewer.matchedSignals,
    noMemory,
    observedCandidateCount: viewer.observedCandidateCount,
    passed: inspectable,
    recordRefCount: viewer.recordRefCount,
    rulesOnlyGoodMemory: passedVariant({ usefulRecall: inspectable }),
    traceEventCount,
    viewerMutationRejected: viewer.viewerMutationRejected,
  });
}

function countRecallScenarios(
  scenarios: readonly Phase45ScenarioResult[],
): Phase45ScenarioResult[] {
  return scenarios.filter((scenario) =>
    [
      "identity_background_continuity",
      "project_preference_continuity",
      "coding_style_preference_continuity",
      "historical_task_continuation",
      "user_correction_targeted_revise",
      "selective_writeback_next_turn_recall",
      "no_provider_rules_only_fallback",
    ].includes(scenario.family),
  );
}

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function rate(
  values: readonly Phase45ScenarioResult[],
  predicate: (scenario: Phase45ScenarioResult) => boolean,
): number {
  if (values.length === 0) {
    return 0;
  }

  return roundMetric(values.filter(predicate).length / values.length);
}

function buildProviderBackedVariant(): Phase45AdoptionEvalReport["variants"]["providerBackedGoodMemory"] {
  const providerConfigPresent = hasProviderBackedConfig();
  const providerEvalRequested = isProviderBackedEvalRequested();

  return {
	    description: providerEvalRequested
	      ? "Provider-backed eval was requested, but Phase 45 has no implemented real provider-backed execution path yet."
	      : providerConfigPresent
	        ? "Provider env is present, but Phase 45 has no real provider-backed execution path yet; local closure records an explicit skip."
	        : "Provider env is absent; local closure records an explicit skip instead of fabricating uplift.",
	    mode: "provider-backed-goodmemory",
	    reason: providerEvalRequested
	      ? "provider-backed requested but not implemented"
	      : providerConfigPresent
	        ? "provider-backed explicitly skipped until a real provider-backed runner exists"
	        : "GOODMEMORY provider env is not configured",
    status: "skipped",
  };
}

function hasProviderBackedConfig(): boolean {
  return Boolean(
    process.env.GOODMEMORY_EMBEDDING_PROVIDER ||
      process.env.GOODMEMORY_EMBEDDING_MODEL ||
      process.env.GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER,
  );
}

function isProviderBackedEvalRequested(): boolean {
  return process.env.GOODMEMORY_PHASE45_PROVIDER_BACKED === "1";
}

const PROVIDER_ENV_KEYS = [
  "GOODMEMORY_EMBEDDING_PROVIDER",
  "GOODMEMORY_EMBEDDING_MODEL",
  "GOODMEMORY_EMBEDDING_API_KEY",
  "GOODMEMORY_EMBEDDING_BASE_URL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_PROVIDER",
  "GOODMEMORY_ASSISTED_EXTRACTOR_MODEL",
  "GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY",
  "GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL",
] as const;

async function withRulesOnlyEnvironment<TResult>(
  run: () => Promise<TResult>,
): Promise<TResult> {
  const original = new Map<string, string | undefined>();
  for (const key of PROVIDER_ENV_KEYS) {
    original.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return await run();
  } finally {
    for (const key of PROVIDER_ENV_KEYS) {
      const value = original.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function executeScenarios(input: {
  overrideNoMemoryBaseline?: Phase45AdoptionEvalDependencies["overrideNoMemoryBaseline"];
} = {}): Promise<{
  firstValueMs: number;
  observe: {
    acceptedCandidates: number;
    rejectedCandidates: number;
    reviewedCandidates: number;
  };
  scenarios: Phase45ScenarioResult[];
}> {
  const executed = await withRulesOnlyEnvironment(async () => {
    const recallResults = await Promise.all(
      RECALL_SCENARIOS.map((scenario) =>
        executeRecallScenario(scenario, input.overrideNoMemoryBaseline)
      ),
    );
    const correction = await executeCorrectionScenario(input.overrideNoMemoryBaseline);
    const forget = await executeForgetScenario(input.overrideNoMemoryBaseline);
    const feedback = await executeFeedbackScenario(input.overrideNoMemoryBaseline);
    const observe = await executeObserveScenario(input.overrideNoMemoryBaseline);
    const selectiveWriteback = await executeSelectiveWritebackScenario(
      input.overrideNoMemoryBaseline,
    );
    const fallback = await executeRulesOnlyFallbackScenario(
      input.overrideNoMemoryBaseline,
    );
    const viewer = await executeViewerInspectabilityScenario(
      input.overrideNoMemoryBaseline,
    );

    return {
      correction,
      fallback,
      feedback,
      forget,
      observe,
      recallResults,
      selectiveWriteback,
      viewer,
    };
  });
  const providerBacked = await executeProviderBackedScenario(
    input.overrideNoMemoryBaseline,
  );
  const {
    correction,
    fallback,
    feedback,
    forget,
    observe,
    recallResults,
    selectiveWriteback,
    viewer,
  } = executed;
  const recallScenarios = recallResults.map(({ firstValueMs: _firstValueMs, ...result }) => result);
  const {
    acceptedCandidates: _acceptedCandidates,
    rejectedCandidates: _rejectedCandidates,
    reviewedCandidates: _reviewedCandidates,
    ...observeScenario
  } = observe;
  const scenarios = [
    ...recallScenarios,
    correction,
    forget,
    feedback,
    observeScenario,
    selectiveWriteback,
    fallback,
    providerBacked,
    viewer,
  ];

  return {
    firstValueMs: recallResults[0]?.firstValueMs ?? 0,
    observe: {
      acceptedCandidates: observe.acceptedCandidates,
      rejectedCandidates: observe.rejectedCandidates,
      reviewedCandidates: observe.reviewedCandidates,
    },
    scenarios,
  };
}

export async function runPhase45AdoptionEval(
  options: Phase45AdoptionEvalOptions = {},
  dependencies: Phase45AdoptionEvalDependencies = {},
): Promise<Phase45AdoptionEvalReport> {
  const root = resolveRepoRootFromScriptUrl(import.meta.url);
  const now = dependencies.now?.() ?? new Date().toISOString();
  const outputDir = options.outputDir ?? resolvePhase45AdoptionEvalOutputDir(root);
  const runId = options.runId ?? buildPhase45AdoptionEvalRunId(now);
  const runDirectory = join(outputDir, runId);
  const executed = await executeScenarios({
    overrideNoMemoryBaseline: dependencies.overrideNoMemoryBaseline,
  });
  const recallScenarios = countRecallScenarios(executed.scenarios);
  const staleMemoryScenarios = executed.scenarios.filter((scenario) =>
    [
      "user_correction_targeted_revise",
      "wrong_memory_forget",
    ].includes(scenario.family),
  );
  const allPassed = executed.scenarios.every((scenario) => scenario.passed);
  const noMemoryLeakRate = rate(
    executed.scenarios,
    (scenario) =>
      !scenario.noMemory.observed ||
      scenario.noMemory.usefulRecall ||
      !scenario.noMemory.missedRecall ||
      scenario.noMemory.wrongRecall,
  );
  const acceptedReviewedRatio =
    executed.observe.reviewedCandidates === 0
      ? 0
      : roundMetric(
          executed.observe.acceptedCandidates / executed.observe.reviewedCandidates,
        );
  const metrics = {
    correctionSuccessRate: rate(
      executed.scenarios.filter((scenario) =>
        scenario.family === "user_correction_targeted_revise",
      ),
      (scenario) => scenario.passed,
    ),
    firstUsefulRecallRate: rate(
      recallScenarios,
      (scenario) => scenario.rulesOnlyGoodMemory.usefulRecall,
    ),
    missedRecallRate: rate(
      recallScenarios,
      (scenario) => scenario.rulesOnlyGoodMemory.missedRecall,
    ),
    observeToSelectiveConversionReadiness: {
      acceptedReviewedRatio,
      observedCandidatesAcceptedAsUseful: executed.observe.acceptedCandidates,
      observedCandidatesRejectedAsUnsafeOrNoisy:
        executed.observe.rejectedCandidates,
      observedCandidatesReviewed: executed.observe.reviewedCandidates,
      scenariosWhereSelectiveWritebackJustified:
        executed.observe.acceptedCandidates > 0 ? 1 : 0,
    },
    noMemoryLeakRate,
    staleMemoryRate: rate(
      staleMemoryScenarios,
      (scenario) => scenario.rulesOnlyGoodMemory.wrongRecall,
    ),
    timeToFirstMemoryValueMs: Math.max(0, executed.firstValueMs),
    userVisibleSetupSteps: 4,
    wrongRecallRate: rate(
      recallScenarios,
      (scenario) => scenario.rulesOnlyGoodMemory.wrongRecall,
    ),
  };
  const accepted =
    allPassed &&
    metrics.missedRecallRate === 0 &&
    metrics.wrongRecallRate === 0 &&
    metrics.correctionSuccessRate === 1 &&
    metrics.noMemoryLeakRate === 0 &&
    metrics.staleMemoryRate === 0 &&
    metrics.observeToSelectiveConversionReadiness.observedCandidatesReviewed > 0 &&
    metrics.observeToSelectiveConversionReadiness
      .observedCandidatesAcceptedAsUseful > 0 &&
    metrics.observeToSelectiveConversionReadiness
      .observedCandidatesRejectedAsUnsafeOrNoisy > 0;
  const report: Phase45AdoptionEvalReport = {
    acceptance: {
      decision: accepted ? "accepted" : "blocked",
      reason: accepted
        ? "Phase 45 reference product scenarios passed with rules-only GoodMemory, explicit no-memory comparison, redacted observe/selective evidence, and no raw transcript persistence."
        : metrics.noMemoryLeakRate > 0
          ? "Phase 45 reference product adoption evidence is blocked because the no-memory baseline leaked useful recall."
          : "Phase 45 reference product adoption evidence is blocked by scenario or metric failures.",
    },
    generatedAt: now,
    generatedBy: GENERATED_BY,
    metrics,
    mode: "reference-product-adoption-eval",
    outputDir,
    phase: "phase-45",
    rawTranscriptPersistence: {
      defaultRuntimeArchive: "off",
      evidenceSource: "redacted_reference_product_scenario_events",
      persistedRawTranscripts: false,
    },
    runDirectory,
    runId,
    scenarios: executed.scenarios,
    scope: {
      inScope: [...PHASE45_IN_SCOPE],
      outOfScope: [...PHASE45_OUT_OF_SCOPE],
    },
    variants: {
      noMemory: {
        description: "A product path with no persisted memory context.",
        mode: "no-memory",
        observed: true,
      },
      providerBackedGoodMemory: buildProviderBackedVariant(),
      rulesOnlyGoodMemory: {
        description:
          "The reference product using GoodMemory memory storage, deterministic extraction, recall, feedback, forget, revise, and runtime-kit writeback.",
        mode: "rules-only-goodmemory",
        storage: "memory",
      },
    },
  };

  await (dependencies.ensureDir ?? mkdir)(runDirectory, { recursive: true });
  await (dependencies.writeTextFile ?? writeFile)(
    join(runDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

export async function runPhase45AdoptionEvalCli(
  dependencies: Phase45AdoptionEvalCliDependencies = {},
): Promise<void> {
  const argv = dependencies.argv ?? Bun.argv;
  const log = dependencies.log ?? console.log;
  const exit = dependencies.exit ?? process.exit;
  const runEval = dependencies.runEval ?? runPhase45AdoptionEval;
  const report = await runEval(parsePhase45AdoptionEvalCliOptions(argv));
  log(JSON.stringify(report, null, 2));
  if (report.acceptance.decision !== "accepted") {
    exit(1);
  }
}

if (import.meta.main) {
  await runPhase45AdoptionEvalCli();
}
