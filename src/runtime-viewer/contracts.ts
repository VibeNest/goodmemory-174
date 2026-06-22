import type { GoodMemory } from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import type { InstalledHostWritebackAuditInspection } from "../install/hostWritebackAuditRuntime";
import type { InstalledHostKind } from "../install/hostInstall";
import type { ProgressiveRecallService } from "../progressive/recall";
import type { RuntimeWorkerStatusResult } from "../runtime-worker/contracts";

export type RuntimeViewerBindHost = "127.0.0.1";

export interface RuntimeViewerMemoryCounts {
  durable: {
    archives: number;
    episodes: number;
    evidence: number;
    experiences: number;
    facts: number;
    feedback: number;
    preferences: number;
    profile: number;
    promotions: number;
    proposals: number;
    references: number;
    total: number;
  };
  runtime: {
    artifactSpills: number;
    journal: number;
    workingMemory: number;
  };
}

export interface RuntimeViewerSessionSummary {
  currentState?: string;
  learningsCount: number;
  rawTranscriptPersisted: false;
  scopeDigest: string;
  title?: string;
  updatedAt?: string;
  worklogCount: number;
}

export interface RuntimeViewerTraceSummary {
  candidateTraceCount: number;
  hitCount: number;
  latencyMs: number;
  policyApplied: string[];
  scopeDigest: string;
  tokenCount: number;
  traceId?: string;
}

export interface RuntimeViewerWritebackAuditSummary {
  events: Array<{
    contentPreview: string;
    eventId: string;
    kind: string;
    linkedRecordExistsCount?: number;
    memoryExistsCount?: number;
    mode: string;
    occurredAt: string;
    reason: string;
    recallHitCount: number;
    scopeDigest: string;
    sessionDigest?: string;
    source: string;
    status: string;
    updatedAt: string;
  }>;
  host: InstalledHostKind;
  legacyEventCount: number;
  legacyUnscopedEventCount: number;
  pendingCount: number;
}

export interface RuntimeViewerWorkerSummary {
  audits: Array<{
    action: string;
    at: string;
    jobId?: string;
    reason?: string;
  }>;
  counts: RuntimeWorkerStatusResult["counts"];
  daemon: RuntimeWorkerStatusResult["daemon"];
  queueFile: string;
  stuckJobs: Array<{
    attempts: number;
    jobId: string;
    kind: string;
    status: string;
    updatedAt: string;
  }>;
}

export interface RuntimeViewerSummary {
  generatedAt: string;
  host: InstalledHostKind;
  memoryCounts: RuntimeViewerMemoryCounts;
  readOnly: true;
  runtimeSessions: RuntimeViewerSessionSummary[];
  scopeDigest: string;
  traceSummaries: RuntimeViewerTraceSummary[];
  viewer: {
    bindHost: RuntimeViewerBindHost;
    cors: false;
    mutationRoutes: false;
    rawTranscript: false;
    tokenRequired: true;
  };
  worker?: RuntimeViewerWorkerSummary;
  writebackAudit?: RuntimeViewerWritebackAuditSummary;
}

export interface RuntimeViewerHandoff {
  action: "forget" | "revise";
  command: string;
  executed: false;
  recordId?: string;
  recordKind?: string;
  recordRef: string;
}

export interface RuntimeViewerApp {
  fetch(request: Request): Promise<Response>;
  token: string;
}

export interface CreateRuntimeViewerAppInput {
  bindHost?: string;
  host: InstalledHostKind;
  loadRuntimeWorkerStatus?: () => Promise<RuntimeWorkerStatusResult>;
  loadWritebackAudit?: () => Promise<InstalledHostWritebackAuditInspection>;
  memory: Pick<GoodMemory, "exportMemory" | "recall">;
  now?: () => Date;
  progressiveRecall: ProgressiveRecallService;
  scope: MemoryScope;
  scopeDigest: string;
  token?: string;
}

export interface CreateInstalledHostRuntimeViewerAppInput {
  bindHost?: string;
  cwd?: string;
  homeRoot?: string;
  host: InstalledHostKind;
  port?: number;
  queueFile?: string;
  token?: string;
}

export interface RuntimeViewerServerHandle {
  bindHost: RuntimeViewerBindHost;
  port: number;
  stop(): void;
  token: string;
  url: string;
}
