import { describe, expect, it } from "bun:test";
import {
  runBasicChatExample,
} from "../../examples/basic-chat";
import {
  runCodingAgentExample,
} from "../../examples/coding-agent";

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
    expect(result.salvageProposalSummaries).toHaveLength(2);
    expect(
      result.salvageProposalSummaries.some((summary) =>
        summary.includes("Pre-compact salvage"),
      ),
    ).toBe(true);
  });
});
