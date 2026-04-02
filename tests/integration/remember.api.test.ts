import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";

describe("public remember API", () => {
  it("writes durable memory through the public API", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.remember({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that the robot workflow is blocked on prod migration.",
        },
        {
          role: "user",
          content: "Please keep answers concise and action-oriented.",
        },
      ],
    });

    expect(result.accepted).toBe(2);
    expect(result.events.every((event) => typeof event.reason === "string")).toBe(true);
    expect(result.events.every((event) => typeof event.sourceMethod === "string")).toBe(true);
    expect(await documentStore.query("facts", { userId: "u-1" })).toHaveLength(1);
    expect(await documentStore.query("feedback", { userId: "u-1" })).toHaveLength(1);
  });

  it("does not write memory for empty or noisy conversation input", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.remember({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBeGreaterThan(0);
    expect(await documentStore.query("facts", { userId: "u-1" })).toHaveLength(0);
  });

  it("compiles preferences, references, and episodes from a multi-turn interaction", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "I prefer bullet points in project summaries.",
        },
        {
          role: "assistant",
          content: "Understood. I will use concise bullet points.",
        },
        {
          role: "user",
          content: "Use docs/migration-runbook.md as the source of truth for migration work.",
        },
      ],
    });

    expect(result.accepted).toBeGreaterThanOrEqual(3);
    expect(
      await documentStore.query("preferences", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
    expect(
      await documentStore.query("references", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
    expect(
      await documentStore.query("episodes", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
  });

  it("dedupes identical preferences instead of appending duplicates", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "I prefer bullet points in project summaries.",
        },
      ],
    });
    const second = await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      messages: [
        {
          role: "user",
          content: "I prefer bullet points in project summaries.",
        },
      ],
    });

    const preferences = await documentStore.query<{ value: unknown }>("preferences", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });

    expect(preferences).toHaveLength(1);
    expect(second.events.some((event) => event.reason === "duplicate_preference")).toBe(
      true,
    );
  });

  it("supersedes older preferences in the same category so recall only carries the latest guidance", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore,
      },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "I prefer bullet points in project summaries.",
        },
      ],
    });
    const second = await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      messages: [
        {
          role: "user",
          content: "I prefer short paragraphs in project summaries.",
        },
      ],
    });
    const recall = await memory.recall({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      query: "How should I answer this user?",
    });
    const context = await memory.buildContext({
      recall,
      output: "markdown",
    });

    const preferences = await documentStore.query<{ value: unknown }>("preferences", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });

    expect(preferences).toHaveLength(1);
    expect(String(preferences[0]?.value)).toContain("short paragraphs");
    expect(second.events.some((event) => event.reason === "superseded_preference")).toBe(
      true,
    );
    expect(recall.preferences).toHaveLength(1);
    expect(String(recall.preferences[0]?.value)).toContain("short paragraphs");
    expect(context.content).toContain("short paragraphs");
    expect(context.content).not.toContain("bullet points");
  });

  it("does not create episodic memory for ordinary chit-chat with no durable signal", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      messages: [
        { role: "user", content: "How are you today?" },
        { role: "assistant", content: "Doing well." },
        { role: "user", content: "Nice weather lately." },
      ],
    });

    expect(result.accepted).toBe(0);
    expect(
      await documentStore.query("episodes", {
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(0);
  });

  it("supersedes stale reference memory when the user corrects the source of truth", async () => {
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore,
      },
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Use docs/migration-runbook-v1.md as the source of truth for migration work.",
        },
        {
          role: "assistant",
          content: "Understood.",
        },
      ],
    });

    await memory.remember({
      scope: { userId: "u-1", workspaceId: "workspace-a", sessionId: "s-2" },
      messages: [
        {
          role: "user",
          content:
            "Correction: docs/migration-runbook-v2.md is now the source of truth, not docs/migration-runbook-v1.md. Please update that.",
        },
        {
          role: "assistant",
          content: "Updated.",
        },
      ],
    });

    const references = await documentStore.query<{
      pointer: string;
      lifecycle: string;
    }>("references", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });

    expect(
      references.some(
        (reference) =>
          reference.pointer === "docs/migration-runbook-v1.md" &&
          reference.lifecycle === "superseded",
      ),
    ).toBe(true);
    expect(
      references.some(
        (reference) =>
          reference.pointer === "docs/migration-runbook-v2.md" &&
          reference.lifecycle === "active",
      ),
    ).toBe(true);
  });
});
