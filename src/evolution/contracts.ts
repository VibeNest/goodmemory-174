export const SESSION_ARCHIVES_COLLECTION = "session_archives";
export const EXPERIENCES_COLLECTION = "experiences";

export type ExperienceKind =
  | "remember"
  | "recall"
  | "feedback"
  | "verify"
  | "maintenance"
  | "session_end";

export interface ExperienceRecord {
  id: string;
  userId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  sessionId?: string;
  kind: ExperienceKind;
  traceId: string;
  summary: string;
  outcome: "success" | "failure" | "mixed" | "skipped";
  linkedMemoryIds: string[];
  linkedArchiveIds: string[];
  linkedEvidenceIds: string[];
  createdAt: string;
}

export interface SessionArchive {
  id: string;
  userId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  sessionId: string;
  sourceSessionIds: string[];
  summary: string;
  normalizedTranscript?: string;
  keyDecisions: string[];
  unresolvedItems: string[];
  referencedArtifacts: string[];
  scopeLineage: string[];
  locale?: string;
  createdAt: string;
  archivedAt: string;
}

function resolveArchiveTimestamp(
  createdAt: string | undefined,
  archivedAt: string | undefined,
): string {
  return createdAt ?? archivedAt ?? new Date(0).toISOString();
}

export function createSessionArchive(
  input: Pick<SessionArchive, "id" | "sessionId" | "summary" | "userId"> &
    Partial<Omit<SessionArchive, "id" | "sessionId" | "summary" | "userId">>,
): SessionArchive {
  const createdAt = resolveArchiveTimestamp(input.createdAt, input.archivedAt);

  return {
    id: input.id,
    userId: input.userId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    sourceSessionIds: input.sourceSessionIds ?? [input.sessionId],
    summary: input.summary,
    normalizedTranscript: input.normalizedTranscript,
    keyDecisions: input.keyDecisions ?? [],
    unresolvedItems: input.unresolvedItems ?? [],
    referencedArtifacts: input.referencedArtifacts ?? [],
    scopeLineage: input.scopeLineage ?? [],
    locale: input.locale,
    createdAt,
    archivedAt: input.archivedAt ?? createdAt,
  };
}

export function createExperienceRecord(
  input: Pick<
    ExperienceRecord,
    "id" | "kind" | "summary" | "traceId" | "userId"
  > &
    Partial<
      Omit<ExperienceRecord, "id" | "kind" | "summary" | "traceId" | "userId">
    >,
): ExperienceRecord {
  return {
    id: input.id,
    userId: input.userId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    kind: input.kind,
    traceId: input.traceId,
    summary: input.summary,
    outcome: input.outcome ?? "success",
    linkedMemoryIds: input.linkedMemoryIds ?? [],
    linkedArchiveIds: input.linkedArchiveIds ?? [],
    linkedEvidenceIds: input.linkedEvidenceIds ?? [],
    createdAt: input.createdAt ?? new Date(0).toISOString(),
  };
}
