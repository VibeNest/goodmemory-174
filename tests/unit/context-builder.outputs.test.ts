import { describe, expect, it } from "bun:test";
import {
  buildMemoryPacket,
  renderMemoryPacket,
} from "../../src/recall/contextBuilder";
import { planRecall } from "../../src/recall/router";

describe("context builder output modes", () => {
  it("renders different non-json output modes differently", () => {
    const packet = buildMemoryPacket({
      profile: {
        userId: "u-1",
        identity: { name: "Lin", role: "Robotics engineer" },
        expertise: { primarySkills: [], domains: [] },
        activeContext: { goals: [], currentProjects: ["Migration rollout"] },
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      preferences: [],
      references: [],
      facts: [],
      feedback: [],
      archives: [],
      evidence: [],
      episodes: [],
      workingMemory: null,
      journal: null,
    });

    const markdown = renderMemoryPacket(packet, "markdown");
    const systemPrompt = renderMemoryPacket(packet, "system_prompt_fragment");
    const developerPrompt = renderMemoryPacket(packet, "developer_prompt_fragment");

    expect(markdown.content).toContain("## Profile");
    expect(markdown.content).toContain("## Active Context");
    expect(markdown.content).toContain("Current projects: Migration rollout");
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
      archives: [],
      evidence: [],
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

  it("prioritizes semantic facts ahead of stylistic preferences under markdown token pressure", () => {
    const packet = buildMemoryPacket({
      profile: {
        userId: "u-1",
        identity: { name: "Adrian", role: "Staff platform engineer" },
        expertise: { primarySkills: [], domains: [] },
        activeContext: { goals: [], currentProjects: ["Release quality program"] },
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      preferences: [
        {
          id: "pref-1",
          userId: "u-1",
          category: "response_style",
          value: "concise bullet points and incremental delivery",
          confidence: 1,
          evidenceCount: 1,
          source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      references: [
        {
          id: "ref-1",
          userId: "u-1",
          title: "release-quality-program-runbook-v2.md",
          pointer: "docs/release-quality-program-runbook-v2.md",
          confidence: 1,
          source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
          lifecycle: "active",
          updatedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      facts: [
        {
          id: "fact-1",
          userId: "u-1",
          category: "project",
          content: "my current role is staff platform engineer leading release quality program.",
          confidence: 1,
          importance: 1,
          source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
          updatedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          accessCount: 0,
          lifecycle: "active",
          isActive: true,
          supersededBy: null,
        },
      ],
      feedback: [
        {
          id: "fb-1",
          userId: "u-1",
          rule: "Keep answers concise.",
          kind: "validated_pattern",
          confidence: 1,
          source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
          updatedAt: "2026-01-01T00:00:00.000Z",
          lifecycle: "active",
          evidence: [],
          appliesTo: "general_response",
        },
      ],
      archives: [],
      evidence: [],
      episodes: [],
      workingMemory: null,
      journal: null,
    });

    const markdown = renderMemoryPacket(packet, "markdown", 80);

    expect(markdown.content).toContain("## Facts");
    expect(markdown.content).toContain(
      "my current role is staff platform engineer leading release quality program.",
    );
  });

  it("keeps working memory ahead of evidence under tight markdown token budgets", () => {
    const markdown = renderMemoryPacket(
      {
        evidenceSummary:
          "- vendor approval excerpt proves the handoff was discussed in a prior session",
        workingMemorySummary: "Current goal: finish the rollout handoff",
        journalSummary: "Current state: drafting the user reply",
      },
      "markdown",
      20,
    );

    expect(markdown.content).toContain("## Working Memory");
    expect(markdown.content).not.toContain("## Evidence");
  });

  it("frames blocker facts as immediate next-step support and open loops as deferred context", () => {
    const packet = buildMemoryPacket({
      profile: null,
      preferences: [],
      references: [],
      facts: [
        {
          id: "fact-blocker",
          userId: "u-1",
          category: "project",
          content: "The current blocker is vendor approval for release quality.",
          confidence: 1,
          importance: 1,
          source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
          factKind: "blocker",
          scopeKind: "project",
          accessCount: 0,
          lifecycle: "active",
          isActive: true,
          supersededBy: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "fact-open-loop",
          userId: "u-1",
          category: "project",
          content: "The open loop is final verification for release quality.",
          confidence: 1,
          importance: 1,
          source: { method: "explicit", extractedAt: "2026-01-02T00:00:00.000Z" },
          factKind: "open_loop",
          scopeKind: "project",
          accessCount: 0,
          lifecycle: "active",
          isActive: true,
          supersededBy: null,
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      feedback: [],
      archives: [],
      evidence: [],
      episodes: [],
      workingMemory: null,
      journal: null,
      routingDecision: planRecall({
        retrievalProfile: "general_chat",
        query:
          "Which runbook is the source of truth, and what should I do next for release quality?",
        runtime: {
          hasWorkingMemory: false,
          hasJournal: false,
        },
      }),
    });

    const markdown = renderMemoryPacket(packet, "markdown");

    expect(markdown.content).toContain("Immediate next-step support:");
    expect(markdown.content).toContain(
      "The current blocker is vendor approval for release quality.",
    );
    expect(markdown.content).toContain("Deferred follow-up context:");
    expect(markdown.content).toContain(
      "The open loop is final verification for release quality.",
    );
    expect(markdown.content.indexOf("Immediate next-step support:")).toBeLessThan(
      markdown.content.indexOf("Deferred follow-up context:"),
    );
  });

  it("localizes next-step support labels for Chinese memory context", () => {
    const packet = buildMemoryPacket({
      profile: null,
      preferences: [],
      references: [],
      facts: [
        {
          id: "fact-blocker-zh",
          userId: "u-zh",
          category: "project",
          content: "当前阻塞是供应商审批。",
          confidence: 1,
          importance: 1,
          source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
          factKind: "blocker",
          scopeKind: "project",
          accessCount: 0,
          lifecycle: "active",
          isActive: true,
          supersededBy: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "fact-open-loop-zh",
          userId: "u-zh",
          category: "project",
          content: "待后续跟进的是最终签收。",
          confidence: 1,
          importance: 1,
          source: { method: "explicit", extractedAt: "2026-01-02T00:00:00.000Z" },
          factKind: "open_loop",
          scopeKind: "project",
          accessCount: 0,
          lifecycle: "active",
          isActive: true,
          supersededBy: null,
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      feedback: [],
      archives: [],
      evidence: [],
      episodes: [],
      workingMemory: null,
      journal: null,
      locale: "zh-CN",
      routingDecision: planRecall({
        retrievalProfile: "general_chat",
        query: "当前以哪个 runbook 为准，下一步该做什么？",
        locale: "zh-CN",
        runtime: {
          hasWorkingMemory: false,
          hasJournal: false,
        },
      }),
    });

    const markdown = renderMemoryPacket(packet, "markdown");

    expect(markdown.content).toContain("当前可立即推进的下一步:");
    expect(markdown.content).toContain("后续待跟进事项:");
    expect(markdown.content).not.toContain("Immediate next-step support:");
  });
});
