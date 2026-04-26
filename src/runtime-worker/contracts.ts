import type { HostKind } from "../host";
import type { GoodMemoryScopeDigest } from "../observability/contracts";
import type { RuntimeKitBoundedJob } from "../runtime-kit/contracts";

export type RuntimeWorkerJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "coalesced";

export type RuntimeWorkerJobKind = "remember_candidate";

export interface RuntimeWorkerPayload {
  estimatedTokens: number;
  fullAssistantOutputPersisted: false;
  rawTranscriptPersisted: false;
  redactedPreview: string;
}

export interface RuntimeWorkerJobLastError {
  code: "worker_failed" | "job_payload_unavailable";
  message: string;
}

export interface RuntimeWorkerTraceLinks {
  linkedEvidenceIds: string[];
  linkedMemoryIds: string[];
  linkedTraceIds: string[];
}

export interface RuntimeWorkerJobEnvelope {
  attempts: number;
  coalescedCount: number;
  createdAt: string;
  dedupeKey: string;
  hostKind: HostKind;
  jobId: string;
  kind: RuntimeWorkerJobKind;
  lastError?: RuntimeWorkerJobLastError;
  operation: RuntimeKitBoundedJob["operation"];
  payload: RuntimeWorkerPayload;
  payloadDigest: string;
  scopeDigest: GoodMemoryScopeDigest;
  status: RuntimeWorkerJobStatus;
  trace: RuntimeWorkerTraceLinks;
  updatedAt: string;
}

export interface RuntimeWorkerAuditEvent {
  action:
    | "job_enqueued"
    | "job_coalesced"
    | "job_started"
    | "job_succeeded"
    | "job_failed"
    | "job_requeued"
    | "daemon_started"
    | "daemon_stopped";
  at: string;
  jobId?: string;
  reason?: string;
}

export interface RuntimeWorkerDaemonState {
  enabled: boolean;
  updatedAt: string;
}

export interface RuntimeWorkerQueueSnapshot {
  audits: RuntimeWorkerAuditEvent[];
  daemon: RuntimeWorkerDaemonState;
  jobs: RuntimeWorkerJobEnvelope[];
  version: 1;
}

export interface RuntimeWorkerEnqueueResult {
  coalesced: boolean;
  job: RuntimeWorkerJobEnvelope;
}

export interface RuntimeWorkerDrainOnceInput {
  maxJobs?: number;
}

export interface RuntimeWorkerDrainOnceResult {
  jobs: RuntimeWorkerJobEnvelope[];
  processed: number;
  queueFile: string;
}

export interface RuntimeWorkerStatusInput {
  stuckAfterMs?: number;
}

export interface RuntimeWorkerStatusResult {
  audits: RuntimeWorkerAuditEvent[];
  counts: Record<RuntimeWorkerJobStatus | "stuck" | "total", number>;
  daemon: RuntimeWorkerDaemonState;
  jobs: RuntimeWorkerJobEnvelope[];
  jobsJson: string;
  queueFile: string;
  stuckJobs: RuntimeWorkerJobEnvelope[];
}

export interface RuntimeWorkerRecoverInput {
  dryRun: boolean;
  stuckAfterMs?: number;
}

export interface RuntimeWorkerRepair {
  action: "requeue";
  fromStatus: "failed" | "running";
  jobId: string;
  reason: "failed" | "stuck";
}

export interface RuntimeWorkerRecoverResult {
  dryRun: boolean;
  mutationApplied: boolean;
  queueFile: string;
  repairs: RuntimeWorkerRepair[];
}

export interface RuntimeWorkerDaemonResult {
  daemon: RuntimeWorkerDaemonState;
  queueFile: string;
}

export interface RuntimeWorkerQueue {
  drainOnce(input?: RuntimeWorkerDrainOnceInput): Promise<RuntimeWorkerDrainOnceResult>;
  enqueue(job: RuntimeWorkerJobEnvelope): Promise<RuntimeWorkerEnqueueResult>;
  recover(input: RuntimeWorkerRecoverInput): Promise<RuntimeWorkerRecoverResult>;
  start(): Promise<RuntimeWorkerDaemonResult>;
  status(input?: RuntimeWorkerStatusInput): Promise<RuntimeWorkerStatusResult>;
  stop(): Promise<RuntimeWorkerDaemonResult>;
}

export type RuntimeWorkerJobProcessor = (
  job: RuntimeWorkerJobEnvelope,
) => Promise<void> | void;

export interface CreateRuntimeWorkerQueueInput {
  now?: () => Date;
  processor?: RuntimeWorkerJobProcessor;
  queueFile: string;
}

export interface CreateRuntimeWorkerJobEnvelopeInput {
  boundedJob: RuntimeKitBoundedJob;
  createdAt: string;
  hostKind: HostKind;
  scopeDigest: GoodMemoryScopeDigest;
  traceId?: string;
}
