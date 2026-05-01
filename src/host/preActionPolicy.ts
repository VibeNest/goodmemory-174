import type { ExportMemoryResult } from "../api/contracts";
import {
  normalizeFeedbackAppliesTo,
  type FeedbackMemory,
  type SessionJournal,
  type WorkingMemorySnapshot,
} from "../domain/records";
import type { EvidenceRecord } from "../evidence/contracts";
import {
  behavioralPolicyActionSatisfiesCanonical,
  behavioralPolicyActionsEqual,
  type BehavioralPolicyAction,
  readBehavioralPolicyFromFeedbackMemory,
  selectBehavioralPolicies,
} from "../evolution/behavioralPolicy";
import type {
  HostActionAssessmentResult,
  HostActionIntent,
  HostPlannedAction,
  HostRecommendedFirstStep,
} from "./contracts";

const HOST_PRE_ACTION_POLICY_PREFIX = "host_pre_action_policy";
const ACTION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "before",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "the",
  "then",
  "to",
  "with",
]);
const NEGATIVE_POLICY_MARKERS = [
  "avoid",
  "blocked",
  "do not",
  "don't",
  "must not",
  "never",
  "risk",
];
const PRECONDITION_MARKERS = [
  "before",
  "first",
  "precondition",
  "prerequisite",
  "review",
  "run smoke",
  "smoke verification",
  "verify",
];
const HIGH_RISK_COMMAND_MARKERS = [
  "deepanalyzer",
  "deploy",
  "drop",
  "git push",
  "migration",
  "prod",
  "production",
  "publish",
  "release",
  "rm -",
];
const HIGH_RISK_PATH_MARKERS = [
  "agents.md",
  "claude.md",
  "package.json",
  "playbooks/",
  "src/",
  "task-board/",
];
const EVIDENCE_PRIORITY: Record<EvidenceRecord["kind"], number> = {
  correction_context: 4,
  verification_result: 3,
  tool_result_excerpt: 2,
  document_excerpt: 2,
  conversation_excerpt: 1,
};

interface MatchedPattern {
  linkedEvidenceIds: string[];
  pattern: FeedbackMemory;
  score: number;
}

interface MatchedEvidence {
  evidence: EvidenceRecord;
  score: number;
}

interface MatchedTypedBehavioralPolicy {
  feedback: FeedbackMemory;
  policy: NonNullable<ReturnType<typeof readBehavioralPolicyFromFeedbackMemory>>;
  score: number;
}

function uniqueStrings(values: Iterable<string | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    deduped.push(trimmed);
  }

  return deduped;
}

function normalizeForMatch(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !ACTION_STOP_WORDS.has(token));
}

function countTokenOverlap(left: string, right: string): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightTokens = new Set(tokenize(right));
  let matches = 0;

  for (const token of tokenize(left)) {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  }

  return matches;
}

function describeAction(action: HostPlannedAction): string {
  switch (action.kind) {
    case "command":
      return [action.command, action.summary].filter(Boolean).join(" ");
    case "tool_call":
      return [
        action.toolName,
        action.raw,
        action.summary,
        action.payload ? JSON.stringify(action.payload) : undefined,
      ].filter(Boolean).join(" ");
    case "file_edit":
      return [action.operation, action.relativePath, action.summary].filter(Boolean).join(" ");
  }
}

export function buildHostPlannedActionSummary(action: HostPlannedAction): string {
  switch (action.kind) {
    case "command":
      return `command ${action.command}`;
    case "tool_call":
      return `tool ${action.toolName}`;
    case "file_edit":
      return `${action.operation} ${action.relativePath}`;
  }
}

function isActiveValidatedPattern(pattern: FeedbackMemory): boolean {
  return (
    pattern.kind === "validated_pattern" &&
    pattern.lifecycle === "active" &&
    !pattern.supersededBy
  );
}

function appliesToCodingAgent(pattern: FeedbackMemory): boolean {
  const appliesTo = normalizeFeedbackAppliesTo(pattern.appliesTo);
  return appliesTo === "coding_agent" || appliesTo === "general_response";
}

function collectLinkedEvidenceIds(
  exported: ExportMemoryResult,
  memoryId: string,
): string[] {
  const linkedFromEvidence = exported.durable.evidence
    .filter((record) => record.linkedMemoryIds.includes(memoryId))
    .map((record) => record.id);
  const linkedFromExperiences = exported.durable.experiences
    .filter((record) => record.linkedMemoryIds.includes(memoryId))
    .flatMap((record) => record.linkedEvidenceIds);
  const linkedFromPromotions = exported.durable.promotions
    .filter((record) => record.linkedMemoryIds.includes(memoryId))
    .flatMap((record) => record.linkedEvidenceIds);

  return uniqueStrings([
    ...patternEvidenceIds(exported, memoryId),
    ...linkedFromEvidence,
    ...linkedFromExperiences,
    ...linkedFromPromotions,
  ]);
}

function patternEvidenceIds(exported: ExportMemoryResult, memoryId: string): string[] {
  const pattern = exported.durable.feedback.find((record) => record.id === memoryId);
  return uniqueStrings(pattern?.evidence ?? []);
}

function matchPatterns(
  exported: ExportMemoryResult,
  intent: HostActionIntent,
  actionText: string,
): MatchedPattern[] {
  const normalizedActionText = normalizeForMatch(actionText);

  return exported.durable.feedback
    .filter((record) => isActiveValidatedPattern(record) && appliesToCodingAgent(record))
    .map((pattern) => {
      const searchableRule = [pattern.rule, pattern.why].filter(Boolean).join(" ");
      const overlap = countTokenOverlap(searchableRule, actionText);
      const actionSummary = buildHostPlannedActionSummary(intent.action).toLowerCase();
      const directMarkerMatch = overlap > 0
        || normalizeForMatch(searchableRule).includes(actionSummary)
        || normalizeForMatch(searchableRule).includes(normalizedActionText);

      if (!directMarkerMatch) {
        return null;
      }

      return {
        pattern,
        linkedEvidenceIds: collectLinkedEvidenceIds(exported, pattern.id),
        score: overlap + (pattern.why ? 1 : 0) + Math.round(pattern.confidence),
      } satisfies MatchedPattern;
    })
    .filter((record): record is MatchedPattern => Boolean(record))
    .sort((left, right) => right.score - left.score);
}

function matchEvidence(
  exported: ExportMemoryResult,
  actionText: string,
): MatchedEvidence[] {
  return exported.durable.evidence
    .map((evidence) => {
      const overlap = countTokenOverlap(evidence.excerpt, actionText);
      if (overlap === 0) {
        return null;
      }

      return {
        evidence,
        score: overlap + EVIDENCE_PRIORITY[evidence.kind],
      } satisfies MatchedEvidence;
    })
    .filter((record): record is MatchedEvidence => Boolean(record))
    .sort((left, right) => right.score - left.score);
}

function isHighRiskAction(action: HostPlannedAction): boolean {
  if (action.kind === "file_edit") {
    if (action.operation === "delete") {
      return true;
    }

    const normalizedPath = normalizeForMatch(action.relativePath);
    return HIGH_RISK_PATH_MARKERS.some((marker) => normalizedPath.includes(marker));
  }

  const normalized = normalizeForMatch(describeAction(action));
  return HIGH_RISK_COMMAND_MARKERS.some((marker) => normalized.includes(marker));
}

function hasNegativeMarker(value: string): boolean {
  const normalized = normalizeForMatch(value);
  return NEGATIVE_POLICY_MARKERS.some((marker) => normalized.includes(marker));
}

function extractPreconditions(values: readonly string[]): string[] {
  const preconditions: string[] = [];

  for (const value of values) {
    const normalized = normalizeForMatch(value);
    if (!PRECONDITION_MARKERS.some((marker) => normalized.includes(marker))) {
      continue;
    }

    if (normalized.includes("smoke")) {
      preconditions.push("run smoke verification");
      continue;
    }

    if (normalized.includes("quickcheck")) {
      preconditions.push("run QuickCheck first");
      continue;
    }

    if (normalized.includes("playbook") || normalized.includes("runbook")) {
      preconditions.push("read the current playbook or runbook");
      continue;
    }

    if (normalized.includes("verify")) {
      preconditions.push("run verification first");
      continue;
    }

    const sentence = value
      .split(/[.!?]/u)
      .map((segment) => segment.trim())
      .find((segment) =>
        PRECONDITION_MARKERS.some((marker) =>
          normalizeForMatch(segment).includes(marker)
        )
      );
    if (sentence) {
      preconditions.push(sentence);
    }
  }

  return uniqueStrings(preconditions);
}

function extractExecutableToken(action: HostPlannedAction): string | undefined {
  const rawCommand = action.kind === "command"
    ? action.command
    : action.kind === "tool_call"
      ? action.raw
      : undefined;
  const trimmed = rawCommand?.trim();

  if (!trimmed) {
    return undefined;
  }

  const [firstToken] = trimmed.split(/\s+/u);
  return firstToken?.trim() || undefined;
}

function resolveSiblingExecutablePath(
  executableToken: string | undefined,
  siblingName: string,
): string | undefined {
  const normalized = executableToken?.trim();
  if (!normalized || !normalized.includes("/")) {
    return undefined;
  }

  const lastSlashIndex = normalized.lastIndexOf("/");
  if (lastSlashIndex < 0) {
    return undefined;
  }

  return `${normalized.slice(0, lastSlashIndex + 1)}${siblingName}`;
}

function buildRecommendedFirstStep(
  preconditions: readonly string[],
  action: HostPlannedAction,
): HostRecommendedFirstStep | undefined {
  const first = preconditions[0];
  if (!first) {
    return undefined;
  }

  const normalized = normalizeForMatch(first);
  if (normalized.includes("quickcheck")) {
    const quickCheckPath = resolveSiblingExecutablePath(
      extractExecutableToken(action),
      "QuickCheck",
    );
    if (quickCheckPath) {
      return {
        kind: "tool_call",
        toolName: "QuickCheck",
        raw: quickCheckPath,
        summary: "Run QuickCheck before the original action.",
      };
    }

    return {
      kind: "warning",
      message: first,
    };
  }

  return {
    kind: "warning",
    message: first,
  };
}

function parseCommandTokens(value: string): string[] {
  return [...value.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/gu)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .filter((token) => token.length > 0);
}

function toBehavioralPolicyAction(
  action: HostPlannedAction,
): BehavioralPolicyAction {
  if (action.kind === "tool_call") {
    const raw = action.raw?.trim();
    return {
      ...(raw ? { args: parseCommandTokens(raw).slice(1), raw } : {}),
      kind: "tool_call",
      name: action.toolName,
    };
  }

  if (action.kind === "command") {
    const raw = action.command.trim();
    const tokens = parseCommandTokens(raw);
    return {
      args: tokens.slice(1),
      kind: "command",
      name: tokens[0] ?? raw,
      raw,
    };
  }

  return {
    kind: "warning",
    name: "file_edit",
    raw: `${action.operation} ${action.relativePath}`,
  };
}

function behavioralPolicyActionToRecommendedStep(
  action: BehavioralPolicyAction,
): HostRecommendedFirstStep {
  if (action.kind === "warning") {
    return {
      kind: "warning",
      message: action.raw ?? action.name,
    };
  }

  if (action.kind === "tool_call") {
    return {
      kind: "tool_call",
      toolName: action.name,
      ...(action.raw ? { raw: action.raw } : {}),
      summary: "Use the canonical first action from validated behavioral policy.",
    };
  }

  return {
    command:
      action.raw ??
      [action.name, ...(action.args ?? [])].filter(Boolean).join(" "),
    kind: "command",
    summary: "Use the canonical first action from validated behavioral policy.",
  };
}

function matchTypedBehavioralPolicies(
  exported: ExportMemoryResult,
  intent: HostActionIntent,
  actionText: string,
): MatchedTypedBehavioralPolicy[] {
  const selections = selectBehavioralPolicies({
    appliesTo: "coding_agent",
    feedback: exported.durable.feedback,
    query: actionText,
    surface: "host_action",
  });
  const currentAction = toBehavioralPolicyAction(intent.action);

  return selections
    .filter((selection) => {
      const searchableRule = [selection.feedback.rule, selection.feedback.why]
        .filter(Boolean)
        .join(" ");
      const overlap = countTokenOverlap(searchableRule, actionText);
      const canonicalAction = selection.policy.applicability.canonicalFirstAction;
      const canonicalNameMatch =
        canonicalAction &&
        normalizeForMatch(canonicalAction.name) === normalizeForMatch(currentAction.name);
      return selection.matchedQueryTokens.length > 0 || overlap > 0 || Boolean(canonicalNameMatch);
    })
    .map((selection) => ({
      feedback: selection.feedback,
      policy: selection.policy,
      score: selection.score,
    }))
    .sort((left, right) => right.score - left.score);
}

function resolveRuntimeGuidance(input: {
  action: HostPlannedAction;
  journal: SessionJournal | null | undefined;
  workingMemory: WorkingMemorySnapshot | null | undefined;
}): string[] {
  const guidance: string[] = [];
  const highRisk = isHighRiskAction(input.action);

  if (input.workingMemory?.temporaryDecisions?.length) {
    guidance.push(...input.workingMemory.temporaryDecisions);
  }

  if (highRisk && input.workingMemory?.openLoops?.length) {
    guidance.push(`Open loop before proceeding: ${input.workingMemory.openLoops[0]}`);
  }

  if (highRisk && input.journal?.workflow?.length) {
    guidance.push(`Session workflow says to start with: ${input.journal.workflow[0]}`);
  }

  if (input.journal?.errorsAndCorrections?.length) {
    guidance.push(input.journal.errorsAndCorrections[0]!);
  }

  return uniqueStrings(guidance);
}

function buildPolicyApplied(input: {
  decision: HostActionAssessmentResult["decision"];
  highRisk: boolean;
  intent: HostActionIntent;
  matchedEvidenceIds: readonly string[];
  matchedMemoryIds: readonly string[];
}): string[] {
  return uniqueStrings([
    HOST_PRE_ACTION_POLICY_PREFIX,
    `${HOST_PRE_ACTION_POLICY_PREFIX}.decision=${input.decision}`,
    `${HOST_PRE_ACTION_POLICY_PREFIX}.action_kind=${input.intent.action.kind}`,
    `${HOST_PRE_ACTION_POLICY_PREFIX}.host_kind=${input.intent.hostKind}`,
    input.highRisk ? `${HOST_PRE_ACTION_POLICY_PREFIX}.high_risk` : undefined,
    input.matchedMemoryIds.length > 0
      ? `${HOST_PRE_ACTION_POLICY_PREFIX}.matched_memory=${input.matchedMemoryIds.length}`
      : undefined,
    input.matchedEvidenceIds.length > 0
      ? `${HOST_PRE_ACTION_POLICY_PREFIX}.matched_evidence=${input.matchedEvidenceIds.length}`
      : undefined,
  ]);
}

function shouldBlockIrrecoverably(action: HostPlannedAction): boolean {
  if (action.kind === "file_edit") {
    return action.operation === "delete";
  }

  if (action.kind === "command") {
    const normalized = normalizeForMatch(action.command);
    return normalized.includes("rm -") || normalized.includes("git reset --hard");
  }

  return false;
}

export function assessHostAction(input: {
  exported: ExportMemoryResult;
  intent: HostActionIntent;
}): HostActionAssessmentResult {
  const actionText = describeAction(input.intent.action);
  const typedPolicies = matchTypedBehavioralPolicies(
    input.exported,
    input.intent,
    actionText,
  );
  const matchedPatterns = matchPatterns(input.exported, input.intent, actionText);
  const matchedEvidence = matchEvidence(input.exported, actionText);
  const matchedMemoryIds = uniqueStrings(
    [
      ...typedPolicies.map((record) => record.feedback.id),
      ...matchedPatterns.map((record) => record.pattern.id),
    ],
  );
  const matchedEvidenceIds = uniqueStrings([
    ...typedPolicies.flatMap((record) => record.feedback.evidence ?? []),
    ...matchedPatterns.flatMap((record) => record.linkedEvidenceIds),
    ...matchedEvidence.map((record) => record.evidence.id),
  ]);
  const patternTexts = matchedPatterns.flatMap((record) =>
    [record.pattern.rule, record.pattern.why].filter(
      (text): text is string => Boolean(text),
    )
  );
  const evidenceTexts = matchedEvidence.map((record) => record.evidence.excerpt);
  const requiredPreconditions = extractPreconditions([...patternTexts, ...evidenceTexts]);
  const runtimeGuidance = resolveRuntimeGuidance({
    action: input.intent.action,
    journal: input.exported.runtime?.journal,
    workingMemory: input.exported.runtime?.workingMemory,
  });
  const guidance = uniqueStrings([...patternTexts, ...runtimeGuidance]).slice(0, 4);
  const highRisk = isHighRiskAction(input.intent.action);
  const memoryBacked = matchedMemoryIds.length > 0 || matchedEvidenceIds.length > 0;
  const negativeSignal = [...patternTexts, ...evidenceTexts].some((text) =>
    hasNegativeMarker(text)
  );

  let decision: HostActionAssessmentResult["decision"] = "allow";
  let reason = "No matched memory-backed pre-action policy applied to this action.";
  let recommendedFirstStep: HostRecommendedFirstStep | undefined;
  const currentAction = toBehavioralPolicyAction(input.intent.action);

  const firstTypedPolicy = typedPolicies[0];
  const canonicalFirstAction = firstTypedPolicy?.policy.applicability.canonicalFirstAction;
  if (firstTypedPolicy && canonicalFirstAction) {
    guidance.unshift(firstTypedPolicy.feedback.rule);
    if (!behavioralPolicyActionSatisfiesCanonical(currentAction, canonicalFirstAction)) {
      decision = "review_required";
      reason =
        "Matched typed behavioral policy requires a canonical first action before the proposed host action.";
      recommendedFirstStep = behavioralPolicyActionToRecommendedStep(
        canonicalFirstAction,
      );
    } else if (guidance.length > 0) {
      decision = "allow_with_guidance";
      reason = "Matched typed behavioral policy confirms the canonical first action.";
    }
  }

  if (
    decision === "allow" &&
    memoryBacked &&
    highRisk &&
    (negativeSignal || requiredPreconditions.length > 0)
  ) {
    recommendedFirstStep = buildRecommendedFirstStep(
      requiredPreconditions,
      input.intent.action,
    );
    if (shouldBlockIrrecoverably(input.intent.action) && !recommendedFirstStep) {
      decision = "blocked";
      reason = "Matched memory-backed veto blocks this destructive action before execution.";
    } else {
      decision = "review_required";
      reason = requiredPreconditions.length > 0
        ? `Matched memory-backed policy requires preconditions before ${buildHostPlannedActionSummary(input.intent.action)}.`
        : `Matched memory-backed policy requires rewriting the first step before ${buildHostPlannedActionSummary(input.intent.action)}.`;
      recommendedFirstStep ??= {
        kind: "warning",
        message: "Review matched memory guidance before continuing.",
      };
    }
  } else if (decision === "allow" && guidance.length > 0) {
    decision = "allow_with_guidance";
    reason = "Matched memory or runtime continuity guidance is available for this action.";
  }

  const policyApplied = buildPolicyApplied({
    decision,
    highRisk,
    intent: input.intent,
    matchedEvidenceIds,
    matchedMemoryIds,
  });

  return {
    actionId: input.intent.actionId,
    auditRecorded: false,
    decision,
    guidance,
    matchedEvidenceIds,
    matchedMemoryIds,
    policyApplied,
    reason,
    ...(recommendedFirstStep ? { recommendedFirstStep } : {}),
    requiredPreconditions,
  };
}
