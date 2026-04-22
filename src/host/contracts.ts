import type {
  ExportMemoryInput,
  GoodMemory,
} from "../api/contracts";
import type { AgentEventIngestResult } from "../api/integrationSupport";
import type {
  AgentEventHostKind,
  AgentEventIdentity,
  AgentEventKind,
  AgentEventScope,
  AgentEventStructuredValue,
  HostAgentEvent,
} from "../agentEvents";
import type { GoodMemoryPolicyHooks } from "../policy/hooks";
import type { DocumentStore } from "../storage/contracts";
import type { MemoryScope } from "../domain/scope";
import type { MarkdownArtifactFile } from "../governance/markdownArtifacts";

export type {
  AgentEventIngestResult,
  AgentEventHostKind,
  AgentEventIdentity,
  AgentEventKind,
  AgentEventScope,
  AgentEventStructuredValue,
  HostAgentEvent,
};

export type HostArtifactType =
  | "memory_index"
  | "user_memory"
  | "session_memory"
  | "archive_recap"
  | "playbook";

export type HostAdapterMode = "file-assisted" | "file-authoritative";

export type HostKind = "generic" | "claude" | "codex";

export interface HostArtifact extends MarkdownArtifactFile {
  artifactType: HostArtifactType;
  writable: boolean;
}

export interface HostAdapterCapabilities {
  readonly mode: HostAdapterMode;
  readonly readableArtifactTypes: readonly HostArtifactType[];
  readonly writableArtifactTypes: readonly HostArtifactType[];
}

export interface HostReadArtifactsResult {
  artifacts: HostArtifact[];
  exportedAt: string;
  rootPath: string;
  scope: MemoryScope;
}

export interface HostStructuredDelta {
  op: "set";
  target: "appliesTo" | "rule" | "why";
  value?: string;
}

export type HostWriteVerificationOutcome =
  | "blocked"
  | "not_run"
  | "passed"
  | "review_required";

export interface HostRollbackGuidance {
  hint: string;
  mode: "file-assisted";
  performed: boolean;
}

export interface HostWriteDiagnostics {
  adapterId: string;
  artifactType: HostArtifactType;
  canonicalMemoryId?: string;
  failureReasons: string[];
  hostKind: HostKind;
  mode: HostAdapterMode;
  policyApplied: string[];
  provenance: {
    adapterId: string;
    hostKind: HostKind;
    origin: "host_adapter";
    wroteAt: string;
  };
  relativePath: string;
  risky: boolean;
  rollback: HostRollbackGuidance;
  structuredDelta: HostStructuredDelta[];
  verificationOutcome: HostWriteVerificationOutcome;
}

export interface HostWriteArtifactInput {
  artifactType: HostArtifactType;
  content: string;
  relativePath: string;
  scope: MemoryScope;
}

export interface HostWriteVerificationInput {
  artifactType: HostArtifactType;
  canonicalMemoryId?: string;
  currentContent: string;
  nextContent: string;
  relativePath: string;
  risky: boolean;
  scope: MemoryScope;
  structuredDelta: HostStructuredDelta[];
}

export interface HostWriteVerificationResult {
  outcome: Exclude<HostWriteVerificationOutcome, "not_run">;
  reason?: string;
}

export interface HostWriteArtifactResult {
  diagnostics: HostWriteDiagnostics;
  linkedExperienceId?: string;
  status: "applied" | "noop";
  updatedArtifact: HostArtifact;
}

export class HostAdapterWriteError extends Error {
  constructor(
    message: string,
    readonly diagnostics: HostWriteDiagnostics,
  ) {
    super(message);
    this.name = "HostAdapterWriteError";
  }
}

export interface HostAdapter {
  readonly capabilities: HostAdapterCapabilities;
  readonly hostKind: HostKind;
  readonly id: string;
  readArtifacts(input: ExportMemoryInput): Promise<HostReadArtifactsResult>;
  writeArtifact(input: HostWriteArtifactInput): Promise<HostWriteArtifactResult>;
}

export interface CreateHostAdapterInput {
  createId?: () => string;
  documentStore?: DocumentStore;
  hostKind?: HostKind;
  id: string;
  memory: Pick<GoodMemory, "exportMemory">;
  mode?: HostAdapterMode;
  now?: () => string;
  policy?: Pick<
    GoodMemoryPolicyHooks,
    "redact" | "resolveConflict" | "shouldRemember"
  >;
  readableArtifactTypes?: readonly HostArtifactType[];
  supportedReadableArtifactTypes?: readonly HostArtifactType[];
  verifyWrite?(
    input: HostWriteVerificationInput,
  ): Promise<HostWriteVerificationResult> | HostWriteVerificationResult;
  writableArtifactTypes?: readonly HostArtifactType[];
}
