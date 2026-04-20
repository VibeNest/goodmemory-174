import { describe, expect, it } from "bun:test";
import {
  runBasicChatExample,
} from "../../examples/basic-chat";
import {
  runCodingAgentExample,
} from "../../examples/coding-agent";
import {
  runVercelAIChatExample,
} from "../../examples/vercel-ai-chat";
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

  it("vercel ai example demonstrates wrapper-first recall injection and remember writeback", async () => {
    const previousSearchFunction =
      process.env.GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION;
    process.env.GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION = "bad-name!";

    try {
      const result = await runVercelAIChatExample();

      expect(typeof result.secondSystem).toBe("string");
      expect(result.secondSystem).toContain("You are a concise product copilot.");
      expect(result.secondSystem).toContain(
        "migration rollout is blocked on prod verification",
      );
      expect(result.answer).toContain("migration rollout is still blocked");
      expect(result.events.some((event) => event.phase === "recall")).toBe(true);
      expect(result.events.some((event) => event.phase === "remember")).toBe(true);
      expect(result.artifacts.files.map((file) => file.relativePath)).toContain(
        "MEMORY.md",
      );
    } finally {
      if (previousSearchFunction === undefined) {
        delete process.env.GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION;
      } else {
        process.env.GOODMEMORY_SQLITE_VECTOR_SEARCH_FUNCTION =
          previousSearchFunction;
      }
    }
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
