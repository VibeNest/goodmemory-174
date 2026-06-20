import { type FeedbackKind, normalizeFeedbackAppliesTo } from "../domain/records";
import type { ExperienceRecord } from "./contracts";

const AGENT_EVENT_FEEDBACK_ORIGIN = "agent_event";

export interface AgentEventCorrectionMetadata {
  appliesTo: string;
  kind: Exclude<FeedbackKind, "validated_pattern">;
  signal: string;
}

function readMetadataString(
  experience: ExperienceRecord,
  key: string,
): string | undefined {
  const value = experience.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isFeedbackKind(value: string): value is Exclude<FeedbackKind, "validated_pattern"> {
  return value === "do" || value === "dont" || value === "prefer";
}

export function readAgentEventCorrectionMetadata(
  experience: ExperienceRecord,
): AgentEventCorrectionMetadata | null {
  if (
    experience.kind !== "feedback" ||
    experience.outcome !== "success" ||
    experience.linkedMemoryIds.length > 0
  ) {
    return null;
  }

  const origin = readMetadataString(experience, "feedbackOrigin");
  const signal = readMetadataString(experience, "feedbackSignal");
  const rawKind = readMetadataString(experience, "feedbackKind");

  if (origin !== AGENT_EVENT_FEEDBACK_ORIGIN || !signal || !rawKind) {
    return null;
  }

  if (!isFeedbackKind(rawKind)) {
    return null;
  }

  return {
    appliesTo: normalizeFeedbackAppliesTo(
      readMetadataString(experience, "feedbackAppliesTo"),
    ),
    kind: rawKind,
    signal,
  };
}

export function buildAgentEventCorrectionGroupKey(input: {
  experience: ExperienceRecord;
  metadata: AgentEventCorrectionMetadata;
}): string {
  return [
    input.experience.userId,
    input.experience.tenantId ?? "",
    input.experience.workspaceId ?? "",
    input.experience.agentId ?? "",
    input.metadata.appliesTo,
    input.metadata.kind,
    input.metadata.signal.trim().toLowerCase(),
  ].join("\u0000");
}
