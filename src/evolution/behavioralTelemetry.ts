import type { FeedbackKind } from "../domain/records";
import type { BehavioralPolicy } from "./behavioralPolicy";
import { createExperienceRecord, type ExperienceRecord, type ExperienceModelInfluence, type LearningProposal } from "./contracts";

const TOOL_OUTCOME_POLICY_TOKEN = "tool_outcome";
const TOOL_OUTCOME_PREFIX = "tool_outcome.";

export type BehavioralFirstActionKind = "command" | "tool_call" | "warning";
export type BehavioralOutcomeRetrievalProfile = "coding_agent" | "general_chat";

export interface BehavioralFirstAction {
  args?: string[];
  kind: BehavioralFirstActionKind;
  name: string;
  raw?: string;
}

export interface BehavioralOutcomeObservationResult {
  cue: string;
  evidenceExcerpt?: string;
  failureClass: string;
  firstAction: BehavioralFirstAction;
  modelInfluence: ExperienceModelInfluence;
  outcome?: "failure" | "mixed" | "skipped" | "success";
  retrievalProfile?: BehavioralOutcomeRetrievalProfile;
  saferAlternative?: BehavioralFirstAction;
}

export interface BehavioralOutcomeRecordInput
  extends Omit<BehavioralOutcomeObservationResult, "modelInfluence"> {
  modelInfluence?: ExperienceModelInfluence;
}

export interface ToolOutcomeExperienceRecord extends Omit<ExperienceRecord, "kind"> {
  kind: "tool_outcome";
}

export interface CompiledGuidance {
  appliesTo?: string;
  behavioralPolicy?: BehavioralPolicy;
  confidence?: number;
  kind: Exclude<FeedbackKind, "validated_pattern">;
  rule: string;
  why?: string;
}

export interface LearningProposalWithCompiledGuidance extends LearningProposal {
  compiledGuidance?: CompiledGuidance;
}

export interface ParsedToolOutcomeMetadata {
  cue: string;
  failureClass: string;
  firstAction: BehavioralFirstAction;
  retrievalProfile?: BehavioralOutcomeRetrievalProfile;
  saferAlternative?: BehavioralFirstAction;
}

interface BehavioralOutcomeExperienceInput {
  createdAt: string;
  createId: () => string;
  linkedEvidenceIds?: string[];
  scope: {
    agentId?: string;
    sessionId?: string;
    tenantId?: string;
    userId: string;
    workspaceId?: string;
  };
  traceId: string;
}

function encodeTagValue(value: string): string {
  return encodeURIComponent(value);
}

function decodeTagValue(value: string): string {
  return decodeURIComponent(value);
}

function toTag(key: string, value: string): string {
  return `${TOOL_OUTCOME_PREFIX}${key}=${encodeTagValue(value)}`;
}

function normalizeAction(action: BehavioralFirstAction): BehavioralFirstAction {
  return {
    ...action,
    args: action.args && action.args.length > 0 ? [...action.args] : undefined,
    raw: action.raw?.trim() || undefined,
  };
}

export function formatBehavioralFirstAction(
  action: BehavioralFirstAction,
): string {
  if (action.kind === "warning") {
    return action.raw ?? action.name;
  }

  const argsText = action.args && action.args.length > 0
    ? `(${action.args.join(", ")})`
    : "";
  return argsText.length > 0 ? `${action.name}${argsText}` : action.raw ?? action.name;
}

function resolveBehavioralActionIdentity(
  action: BehavioralFirstAction,
): BehavioralFirstAction {
  const normalized = normalizeAction(action);

  if (normalized.args) {
    return {
      kind: normalized.kind,
      name: normalized.name,
      args: normalized.args,
    };
  }

  return {
    kind: normalized.kind,
    name: normalized.name,
    ...(normalized.raw ? { raw: normalized.raw } : {}),
  };
}

export function serializeBehavioralFirstAction(
  action: BehavioralFirstAction,
): string {
  return JSON.stringify(resolveBehavioralActionIdentity(action));
}

export function behavioralFirstActionsEqual(
  left: BehavioralFirstAction | undefined,
  right: BehavioralFirstAction | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return serializeBehavioralFirstAction(left) === serializeBehavioralFirstAction(right);
}

export function buildBehavioralOutcomePolicyApplied(
  result: BehavioralOutcomeObservationResult,
): string[] {
  const tags = [
    TOOL_OUTCOME_POLICY_TOKEN,
    toTag("cue", result.cue),
    toTag("failure_class", result.failureClass),
    toTag("first_action.kind", result.firstAction.kind),
    toTag("first_action.name", result.firstAction.name),
  ];

  if (result.firstAction.args && result.firstAction.args.length > 0) {
    tags.push(toTag("first_action.args", JSON.stringify(result.firstAction.args)));
  }
  if (result.firstAction.raw) {
    tags.push(toTag("first_action.raw", result.firstAction.raw));
  }
  if (result.retrievalProfile) {
    tags.push(toTag("retrieval_profile", result.retrievalProfile));
  }
  if (result.saferAlternative) {
    tags.push(toTag("safer_alternative.kind", result.saferAlternative.kind));
    tags.push(toTag("safer_alternative.name", result.saferAlternative.name));
    if (result.saferAlternative.args && result.saferAlternative.args.length > 0) {
      tags.push(
        toTag("safer_alternative.args", JSON.stringify(result.saferAlternative.args)),
      );
    }
    if (result.saferAlternative.raw) {
      tags.push(toTag("safer_alternative.raw", result.saferAlternative.raw));
    }
  }

  return tags;
}

export function buildBehavioralOutcomeExperienceRecord(
  input: BehavioralOutcomeExperienceInput & {
    result: BehavioralOutcomeObservationResult;
  },
): ToolOutcomeExperienceRecord {
  const result = {
    ...input.result,
    firstAction: normalizeAction(input.result.firstAction),
    saferAlternative: input.result.saferAlternative
      ? normalizeAction(input.result.saferAlternative)
      : undefined,
  };
  const saferAlternativeLabel = result.saferAlternative
    ? ` Safer first action: ${formatBehavioralFirstAction(result.saferAlternative)}.`
    : "";

  return {
    ...createExperienceRecord({
      id: input.createId(),
      userId: input.scope.userId,
      tenantId: input.scope.tenantId,
      workspaceId: input.scope.workspaceId,
      agentId: input.scope.agentId,
      sessionId: input.scope.sessionId,
      kind: "maintenance",
      traceId: input.traceId,
      trigger: "api",
      modelInfluence: result.modelInfluence,
      summary:
        `Behavioral tool outcome for cue "${result.cue}": first action ${formatBehavioralFirstAction(result.firstAction)} failed with ${result.failureClass}.` +
        saferAlternativeLabel,
      outcome: result.outcome ?? "failure",
      policyApplied: buildBehavioralOutcomePolicyApplied(result),
      metrics: {
        accepted: 0,
        rejected: 1,
      },
      linkedEvidenceIds: input.linkedEvidenceIds ?? [],
      createdAt: input.createdAt,
    }),
    kind: "tool_outcome",
  };
}

export function isToolOutcomeExperience(
  experience: ExperienceRecord | ToolOutcomeExperienceRecord,
): boolean {
  return (
    (experience.kind as string) === "tool_outcome" ||
    experience.policyApplied.includes(TOOL_OUTCOME_POLICY_TOKEN)
  );
}

export function toStoredExperienceRecord(
  experience: ToolOutcomeExperienceRecord,
): ExperienceRecord {
  return experience as unknown as ExperienceRecord;
}

function parseAction(
  values: Map<string, string>,
  prefix: "first_action" | "safer_alternative",
): BehavioralFirstAction | undefined {
  const kind = values.get(`${prefix}.kind`);
  const name = values.get(`${prefix}.name`);

  if (!kind || !name) {
    return undefined;
  }

  const argsValue = values.get(`${prefix}.args`);
  const raw = values.get(`${prefix}.raw`);
  let args: string[] | undefined;

  if (argsValue) {
    try {
      const parsed = JSON.parse(argsValue) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        args = parsed;
      }
    } catch {
      args = undefined;
    }
  }

  return {
    kind: kind as BehavioralFirstActionKind,
    name,
    ...(args ? { args } : {}),
    ...(raw ? { raw } : {}),
  };
}

export function parseToolOutcomeMetadata(
  experience: ExperienceRecord | ToolOutcomeExperienceRecord,
): ParsedToolOutcomeMetadata | null {
  if (!isToolOutcomeExperience(experience)) {
    return null;
  }

  const values = new Map<string, string>();

  for (const token of experience.policyApplied) {
    if (!token.startsWith(TOOL_OUTCOME_PREFIX)) {
      continue;
    }

    const [rawKey, rawValue] = token.slice(TOOL_OUTCOME_PREFIX.length).split("=", 2);
    if (!rawKey || rawValue === undefined) {
      continue;
    }
    values.set(rawKey, decodeTagValue(rawValue));
  }

  const cue = values.get("cue");
  const failureClass = values.get("failure_class");
  const firstAction = parseAction(values, "first_action");

  if (!cue || !failureClass || !firstAction) {
    return null;
  }

  const retrievalProfile = values.get("retrieval_profile");
  const parsedRetrievalProfile =
    retrievalProfile === "coding_agent" || retrievalProfile === "general_chat"
      ? retrievalProfile
      : undefined;

  return {
    cue,
    failureClass,
    firstAction,
    retrievalProfile: parsedRetrievalProfile,
    saferAlternative: parseAction(values, "safer_alternative"),
  };
}

export function attachCompiledGuidance(
  proposal: LearningProposal,
  compiledGuidance: CompiledGuidance,
): LearningProposal {
  return ({
    ...proposal,
    compiledGuidance,
  } as LearningProposalWithCompiledGuidance) as LearningProposal;
}

export function readCompiledGuidance(
  proposal: LearningProposal,
): CompiledGuidance | undefined {
  return (proposal as LearningProposalWithCompiledGuidance).compiledGuidance;
}
