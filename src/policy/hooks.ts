import type {
  EpisodeMemory,
  FactMemory,
  FeedbackMemory,
  PreferenceMemory,
  ReferenceMemory,
  UserProfile,
} from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import type { EvidenceRecord } from "../evidence/contracts";
import type { SessionArchive } from "../evolution/contracts";
import type { MemoryCandidate } from "../domain/memoryCandidate";

export interface PolicyContext {
  scope: MemoryScope;
  query?: string;
  retrievalProfile?: "general_chat" | "coding_agent";
  phase: "remember" | "recall";
  locale: string;
  localeSource: "explicit" | "detected" | "default";
}

export type PolicyMemoryRecord =
  | ({ memoryType: "profile" } & UserProfile)
  | ({ memoryType: "preference" } & PreferenceMemory)
  | ({ memoryType: "reference" } & ReferenceMemory)
  | ({ memoryType: "fact" } & FactMemory)
  | ({ memoryType: "feedback" } & FeedbackMemory)
  | ({ memoryType: "evidence" } & EvidenceRecord)
  | ({ memoryType: "archive" } & SessionArchive)
  | ({ memoryType: "episode" } & EpisodeMemory);

export interface ConflictResolution {
  action: "keep_existing" | "supersede_existing";
  reason?: string;
}

export interface GoodMemoryPolicyHooks {
  shouldRemember?(
    candidate: MemoryCandidate,
    ctx: PolicyContext,
  ): Promise<boolean> | boolean;
  shouldRecall?(
    record: PolicyMemoryRecord,
    ctx: PolicyContext,
  ): Promise<boolean> | boolean;
  redact?(
    candidate: MemoryCandidate,
    ctx: PolicyContext,
  ): Promise<MemoryCandidate> | MemoryCandidate;
  resolveConflict?(
    existing: PolicyMemoryRecord,
    incoming: MemoryCandidate,
    ctx: PolicyContext,
  ): Promise<ConflictResolution> | ConflictResolution;
}

export function toPolicyMemoryRecord(
  record:
    | UserProfile
    | PreferenceMemory
    | ReferenceMemory
    | FactMemory
    | FeedbackMemory
    | EvidenceRecord
    | SessionArchive
    | EpisodeMemory,
  memoryType: PolicyMemoryRecord["memoryType"],
): PolicyMemoryRecord {
  return {
    ...(record as object),
    memoryType,
  } as PolicyMemoryRecord;
}

export function passesDefaultScopeGuard(
  scope: MemoryScope,
  record: {
    tenantId?: string;
    workspaceId?: string;
    agentId?: string;
  },
): boolean {
  if (scope.tenantId === undefined && record.tenantId !== undefined) {
    return false;
  }

  if (scope.workspaceId === undefined && record.workspaceId !== undefined) {
    return false;
  }

  if (scope.agentId === undefined && record.agentId !== undefined) {
    return false;
  }

  return true;
}
