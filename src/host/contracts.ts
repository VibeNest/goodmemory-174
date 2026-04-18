import type {
  ExportMemoryInput,
  GoodMemory,
} from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import type { MarkdownArtifactFile } from "../governance/markdownArtifacts";

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

export interface HostWriteArtifactInput {
  artifactType: HostArtifactType;
  content: string;
  relativePath: string;
  scope: MemoryScope;
}

export interface HostAdapter {
  readonly capabilities: HostAdapterCapabilities;
  readonly hostKind: HostKind;
  readonly id: string;
  readArtifacts(input: ExportMemoryInput): Promise<HostReadArtifactsResult>;
  writeArtifact(input: HostWriteArtifactInput): Promise<void>;
}

export interface CreateHostAdapterInput {
  hostKind?: HostKind;
  id: string;
  memory: Pick<GoodMemory, "exportMemory">;
  mode?: HostAdapterMode;
  readableArtifactTypes?: readonly HostArtifactType[];
  supportedReadableArtifactTypes?: readonly HostArtifactType[];
  writableArtifactTypes?: readonly HostArtifactType[];
}
