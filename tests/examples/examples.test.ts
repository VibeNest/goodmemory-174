import { describe, expect, it } from "bun:test";
import {
  runBasicChatExample,
} from "../../examples/basic-chat";
import {
  runCodingAgentExample,
} from "../../examples/coding-agent";
import {
  runClaudeArtifactExample,
} from "../../examples/host-claude-artifacts";
import {
  runCodexHandoffExample,
} from "../../examples/host-codex-handoff";

describe("examples", () => {
  it("basic chat example demonstrates the minimal integration path", async () => {
    const result = await runBasicChatExample();

    expect(result.memoryContext).toContain("## Profile");
    expect(result.memoryContext).toContain("## Preferences");
    expect(result.artifacts.rootPath).toContain(".goodmemory/users/example-user");
    expect(result.artifacts.files.map((file) => file.relativePath)).toContain("MEMORY.md");
    expect(result.answer).toContain("bullet");
    expect(result.answer).toContain("migration");
  });

  it("coding-agent example demonstrates runtime continuity and procedural memory", async () => {
    const result = await runCodingAgentExample();

    expect(result.memoryContext).toContain("## Working Memory");
    expect(result.memoryContext).toContain("## Session Journal");
    expect(result.memoryContext).toContain("## Procedural Memory");
    expect(result.artifacts.files.map((file) => file.relativePath)).toContain("session.md");
    expect(
      result.artifacts.files.find((file) => file.relativePath === "session.md")?.content,
    ).toContain("Current goal: Finish recall engine");
    expect(result.answer).toContain("Finish recall engine");
    expect(result.answer).toContain("wire buildContext output");
  });

  it("claude host example demonstrates read-only compiled artifact consumption", async () => {
    const result = await runClaudeArtifactExample();

    expect(result.artifacts.map((artifact) => artifact.relativePath)).toEqual([
      "user.md",
      "MEMORY.md",
    ]);
    expect(result.artifacts[0]?.artifactType).toBe("user_memory");
    expect(result.artifacts[1]?.artifactType).toBe("memory_index");
    expect(result.summary).toContain("read compiled memory artifacts");
  });

  it("codex host example demonstrates session handoff consumption", async () => {
    const result = await runCodexHandoffExample();

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.relativePath).toBe("session-memory/agent-s1.md");
    expect(result.artifacts[0]?.content).toContain("# Session Handoff: agent-s1");
    expect(result.artifacts[0]?.content).toContain("Finish recall engine");
    expect(result.nextStep).toContain("wire buildContext output");
  });
});
