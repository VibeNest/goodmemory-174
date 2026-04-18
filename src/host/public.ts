import type {
  ExportMemoryInput,
} from "../api/contracts";
import type {
  CreateHostAdapterInput,
  HostAdapter,
  HostArtifact,
  HostArtifactType,
  HostReadArtifactsResult,
  HostWriteArtifactInput,
} from "./contracts";

export type {
  CreateHostAdapterInput,
  HostAdapter,
  HostAdapterCapabilities,
  HostAdapterMode,
  HostArtifact,
  HostArtifactType,
  HostKind,
  HostReadArtifactsResult,
  HostWriteArtifactInput,
} from "./contracts";

const DEFAULT_READABLE_ARTIFACT_TYPES = [
  "memory_index",
  "user_memory",
  "session_memory",
] as const satisfies readonly HostArtifactType[];

const DEFAULT_SUPPORTED_READABLE_ARTIFACT_TYPES = [
  ...DEFAULT_READABLE_ARTIFACT_TYPES,
] as const satisfies readonly HostArtifactType[];

function uniqueArtifactTypes(
  artifactTypes: readonly HostArtifactType[] | undefined,
  fallback: readonly HostArtifactType[],
): HostArtifactType[] {
  const resolved = artifactTypes ?? fallback;
  const deduped: HostArtifactType[] = [];

  for (const artifactType of resolved) {
    if (!deduped.includes(artifactType)) {
      deduped.push(artifactType);
    }
  }

  return deduped;
}

function freezeArtifactTypes(
  artifactTypes: readonly HostArtifactType[],
): readonly HostArtifactType[] {
  return Object.freeze([...artifactTypes]);
}

function resolveHostArtifactType(input: {
  kind: HostArtifact["kind"];
  relativePath: string;
}): HostArtifactType | null {
  if (input.relativePath.startsWith("archives/")) {
    return "archive_recap";
  }

  if (input.relativePath.startsWith("playbooks/")) {
    return "playbook";
  }

  if (input.relativePath === "MEMORY.md" || input.kind === "memory") {
    return "memory_index";
  }

  if (input.relativePath === "user.md" || input.kind === "user") {
    return "user_memory";
  }

  if (input.kind === "session" || input.relativePath === "session.md") {
    return "session_memory";
  }

  return null;
}

function assertReadableNegotiation(input: {
  readableArtifactTypes: readonly HostArtifactType[];
  supportedReadableArtifactTypes: readonly HostArtifactType[];
}): void {
  const unsupportedArtifactTypes = input.readableArtifactTypes.filter(
    (artifactType) => !input.supportedReadableArtifactTypes.includes(artifactType),
  );

  if (unsupportedArtifactTypes.length === 0) {
    return;
  }

  throw new Error(
    `readable artifact types must be supported by the configured export surface: ${unsupportedArtifactTypes.join(", ")}`,
  );
}

function assertWritableNegotiation(input: {
  mode: CreateHostAdapterInput["mode"];
  readableArtifactTypes: readonly HostArtifactType[];
  writableArtifactTypes: readonly HostArtifactType[];
}): void {
  if (input.mode !== "file-authoritative" && input.writableArtifactTypes.length > 0) {
    throw new Error("file-assisted adapters cannot declare writable artifact types");
  }

  for (const artifactType of input.writableArtifactTypes) {
    if (!input.readableArtifactTypes.includes(artifactType)) {
      throw new Error(
        "writable artifact types must be a subset of readable artifact types",
      );
    }
  }
}

async function readArtifacts(
  memory: CreateHostAdapterInput["memory"],
  readableArtifactTypes: readonly HostArtifactType[],
  input: ExportMemoryInput,
): Promise<HostReadArtifactsResult> {
  const exported = await memory.exportMemory(input);
  const artifacts = exported.artifacts.files.flatMap((file): HostArtifact[] => {
    const artifactType = resolveHostArtifactType(file);

    if (!artifactType || !readableArtifactTypes.includes(artifactType)) {
      return [];
    }

    return [
      {
        ...file,
        artifactType,
        writable: false,
      },
    ];
  });

  return {
    artifacts,
    exportedAt: exported.exportedAt,
    rootPath: exported.artifacts.rootPath,
    scope: exported.scope,
  };
}

function writeUnsupported(
  writableArtifactTypes: readonly HostArtifactType[],
  input: HostWriteArtifactInput,
): void {
  if (!writableArtifactTypes.includes(input.artifactType)) {
    throw new Error(
      `Host adapter does not allow writes for artifact type ${input.artifactType}`,
    );
  }

  throw new Error(
    `Structured delta writeback is not implemented yet for artifact type ${input.artifactType}`,
  );
}

export function createHostAdapter(input: CreateHostAdapterInput): HostAdapter {
  const readableArtifactTypes = uniqueArtifactTypes(
    input.readableArtifactTypes,
    DEFAULT_READABLE_ARTIFACT_TYPES,
  );
  const supportedReadableArtifactTypes = uniqueArtifactTypes(
    input.supportedReadableArtifactTypes,
    DEFAULT_SUPPORTED_READABLE_ARTIFACT_TYPES,
  );
  const writableArtifactTypes = uniqueArtifactTypes(input.writableArtifactTypes, []);
  const mode = input.mode ?? "file-assisted";

  if (input.id.trim().length === 0) {
    throw new Error("host adapter id must not be empty");
  }

  assertReadableNegotiation({
    readableArtifactTypes,
    supportedReadableArtifactTypes,
  });
  assertWritableNegotiation({
    mode,
    readableArtifactTypes,
    writableArtifactTypes,
  });

  const readableArtifactTypesSnapshot = freezeArtifactTypes(readableArtifactTypes);
  const writableArtifactTypesSnapshot = freezeArtifactTypes(writableArtifactTypes);
  const capabilities = Object.freeze({
    mode,
    readableArtifactTypes: readableArtifactTypesSnapshot,
    writableArtifactTypes: writableArtifactTypesSnapshot,
  });

  return Object.freeze({
    id: input.id,
    hostKind: input.hostKind ?? "generic",
    capabilities,
    async readArtifacts(exportInput: ExportMemoryInput) {
      const result = await readArtifacts(
        input.memory,
        readableArtifactTypesSnapshot,
        exportInput,
      );

      return {
        ...result,
        artifacts: result.artifacts.map((artifact) => ({
          ...artifact,
          writable: writableArtifactTypesSnapshot.includes(artifact.artifactType),
        })),
      };
    },
    async writeArtifact(writeInput: HostWriteArtifactInput) {
      return writeUnsupported(writableArtifactTypesSnapshot, writeInput);
    },
  });
}
