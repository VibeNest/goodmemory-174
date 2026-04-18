import type { GoodMemory } from "../../src";
import { createHostAdapter } from "../../src/host";
import type {
  HostAdapter,
  HostAdapterMode,
  HostArtifactType,
} from "../../src/host";

type Expect<T extends true> = T;

type IsExactly<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

declare const memory: Pick<GoodMemory, "exportMemory">;

const mode: HostAdapterMode = "file-assisted";
const readableArtifactTypes: HostArtifactType[] = [
  "memory_index",
  "session_memory",
];

const adapter: HostAdapter = createHostAdapter({
  id: "codex-readonly",
  hostKind: "codex",
  mode,
  readableArtifactTypes,
  memory,
});

void adapter.readArtifacts({
  scope: {
    userId: "u-1",
    workspaceId: "ws-1",
    sessionId: "s-1",
  },
  includeRuntime: true,
});

void adapter.writeArtifact({
  scope: {
    userId: "u-1",
    workspaceId: "ws-1",
  },
  artifactType: "user_memory",
  relativePath: "user.md",
  content: "# User Memory",
});

type WriteArtifactReturn = ReturnType<HostAdapter["writeArtifact"]>;
type _writeArtifactMustNotBeLockedToNever = Expect<
  IsExactly<WriteArtifactReturn, Promise<never>> extends false ? true : false
>;

// @ts-expect-error Root barrel must not export host adapter lifecycle.
type RootCreateHostAdapter = typeof import("../../src").createHostAdapter;

void (0 as unknown as RootCreateHostAdapter);
