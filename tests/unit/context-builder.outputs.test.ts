import { describe, expect, it } from "bun:test";
import {
  buildMemoryPacket,
  renderMemoryPacket,
} from "../../src/recall/contextBuilder";

describe("context builder output modes", () => {
  it("renders different non-json output modes differently", () => {
    const packet = buildMemoryPacket({
      profile: {
        userId: "u-1",
        identity: { name: "Lin", role: "Robotics engineer" },
        expertise: { primarySkills: [], domains: [] },
        activeContext: { goals: [], currentProjects: [] },
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      preferences: [],
      references: [],
      facts: [],
      feedback: [],
      episodes: [],
      workingMemory: null,
      journal: null,
    });

    const markdown = renderMemoryPacket(packet, "markdown");
    const systemPrompt = renderMemoryPacket(packet, "system_prompt_fragment");
    const developerPrompt = renderMemoryPacket(packet, "developer_prompt_fragment");

    expect(markdown.content).toContain("## Profile");
    expect(systemPrompt.content).not.toBe(markdown.content);
    expect(developerPrompt.content).not.toBe(markdown.content);
    expect(systemPrompt.content).toContain("User memory context");
    expect(developerPrompt.content).toContain("Developer memory notes");
  });

  it("respects token budgeting for json output by omitting low-priority sections", () => {
    const packet = buildMemoryPacket({
      profile: {
        userId: "u-1",
        identity: { name: "Lin", role: "Robotics engineer" },
        expertise: { primarySkills: [], domains: [] },
        activeContext: { goals: [], currentProjects: [] },
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      preferences: [
        {
          id: "pref-1",
          userId: "u-1",
          category: "response_style",
          value: "bullets",
          confidence: 1,
          evidenceCount: 1,
          source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      references: [],
      facts: [],
      feedback: [],
      episodes: [],
      workingMemory: {
        sessionId: "s-1",
        userId: "u-1",
        currentGoal: "Finish the memory layer",
        openLoops: ["tighten recall precision"],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      journal: {
        sessionId: "s-1",
        userId: "u-1",
        worklog: ["Implemented recall engine."],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const json = renderMemoryPacket(packet, "json", 20);
    const parsed = JSON.parse(json.content) as Record<string, unknown>;

    expect(json.omittedSections.length).toBeGreaterThan(0);
    expect(parsed.profileSummary).toBeDefined();
    expect(parsed.workingMemorySummary).toBeUndefined();
  });
});
