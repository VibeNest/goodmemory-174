export type Coverage = "complete" | "partial";

export interface ScopeTuple {
  userId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  sessionId?: string;
}

export interface ScopeItem {
  counts: Record<string, number>;
  coverage: Coverage;
  etag: string;
  lastUpdatedAt?: string;
  scope: ScopeTuple;
  scopeKey: string;
  totalRecords: number;
}

export interface MemoryItem {
  collection: string;
  createdAt?: string;
  details: Record<string, unknown>;
  etag: string;
  id: string;
  lifecycle?: string;
  memoryType: string;
  revisable: boolean;
  summary: string;
  supersededBy?: string | null;
  supersedes?: string | null;
  updatedAt?: string;
}

export interface CandidateItem {
  approvable: boolean;
  contentPreview: string;
  createdAt: string;
  etag: string;
  host: string;
  id: string;
  kind: string;
  origin: string;
  reason: string;
  recoverable?: boolean;
  scopeKey: string;
  status: string;
  updatedAt: string;
}

export interface AuditEvent {
  action: string;
  actionId: string;
  contentPreview?: string;
  occurredAt: string;
  reason?: string;
  resultStatus: "ok" | "error";
  targetId?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface InspectorDescriptor {
  bindHost: "127.0.0.1";
  mutationRoutes: boolean;
  readOnly: boolean;
  tokenRequired: true;
}
