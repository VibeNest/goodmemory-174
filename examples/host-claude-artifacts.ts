import type { HostArtifact } from "../src/host";
import { createGoodMemory } from "../src";
import { createHostAdapter } from "../src/host";

export async function runClaudeArtifactExample(): Promise<{
  artifacts: HostArtifact[];
  summary: string;
}> {
  const memory = createGoodMemory({
    storage: { provider: "memory" },
  });

  const scope = {
    userId: "claude-user",
    sessionId: "claude-s1",
    workspaceId: "claude-workspace",
  } as const;

  await memory.remember({
    scope,
    messages: [
      {
        role: "user",
        content:
          "My name is Lin. Remember that the migration rollout is blocked on prod verification.",
      },
      {
        role: "assistant",
        content: "Noted.",
      },
    ],
  });
  await memory.feedback({
    scope,
    signal: "Keep project updates short and scannable.",
  });

  const adapter = createHostAdapter({
    id: "claude-artifacts",
    hostKind: "claude",
    memory,
    readableArtifactTypes: ["memory_index", "user_memory"],
  });
  const result = await adapter.readArtifacts({
    scope,
  });

  return {
    artifacts: result.artifacts,
    summary:
      "Claude can read compiled memory artifacts through file-assisted mode without editing canonical GoodMemory state.",
  };
}

if (import.meta.main) {
  const result = await runClaudeArtifactExample();
  console.log(JSON.stringify(result, null, 2));
}
