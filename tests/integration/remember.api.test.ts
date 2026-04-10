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

  it("counts ignored noise per message instead of per clause", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const noiseOnly = await memory.remember({
      scope: { userId: "u-1", sessionId: "s-noise" },
      messages: [{ role: "user", content: "hi" }],
    });
    const mixed = await memory.remember({
      scope: { userId: "u-1", sessionId: "s-mixed" },
      messages: [{ role: "user", content: "My name is Felix. Thanks" }],
    });

    expect(noiseOnly.accepted).toBe(0);
    expect(noiseOnly.rejected).toBe(1);
    expect(mixed.accepted).toBe(1);
    expect(mixed.rejected).toBe(0);
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
    const episodes = await documentStore.query<{
      summary: string;
      keyDecisions: string[];
    }>("episodes", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });
    expect(episodes[0]?.summary).toContain(
      "Assistant follow-through: Understood. I will use concise bullet points.",
    );
    expect(episodes[0]?.keyDecisions).toContain(
      "Understood. I will use concise bullet points.",
    );
  });

  it("does not promote assistant-only claims into durable semantic memory", async () => {
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
          role: "assistant",
          content:
            "I will use docs/migration-runbook-v2.md and remember that the blocker is vendor approval.",
        },
      ],
    });

    expect(result.accepted).toBe(0);
    expect(await documentStore.query("profiles", { userId: "u-1" })).toHaveLength(0);
    expect(await documentStore.query("references", { userId: "u-1" })).toHaveLength(0);
    expect(await documentStore.query("facts", { userId: "u-1" })).toHaveLength(0);
    expect(await documentStore.query("preferences", { userId: "u-1" })).toHaveLength(0);
    expect(await documentStore.query("episodes", { userId: "u-1" })).toHaveLength(0);
  });

  it("captures assistant follow-through in episodic memory without promoting it to durable facts", async () => {
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
          content: "Use docs/migration-runbook-v2.md as the source of truth.",
        },
        {
          role: "assistant",
          content: "Updated. I will use the newer runbook going forward.",
        },
      ],
    });

    const episodes = await documentStore.query<{
      summary: string;
      keyDecisions: string[];
    }>("episodes", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });
    const facts = await documentStore.query("facts", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });
    const references = await documentStore.query("references", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });

    expect(references).toHaveLength(1);
    expect(facts).toHaveLength(0);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.summary).toContain(
      "Assistant follow-through: Updated. I will use the newer runbook going forward.",
    );
    expect(episodes[0]?.keyDecisions).toContain(
      "Updated. I will use the newer runbook going forward.",
    );
  });

  it("does not persist duplicate identity facts when remember-that clauses only restate profile", async () => {
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
        { role: "user", content: "Remember that my name is Felix." },
        {
          role: "user",
          content: "Remember that I'm a climate policy advisor in Austin, USA.",
        },
      ],
    });

    const profiles = await documentStore.query<{
      identity: Record<string, string>;
    }>("profiles", { userId: "u-1" });
    const facts = await documentStore.query("facts", {
      userId: "u-1",
      workspaceId: "workspace-a",
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.identity).toEqual({
      name: "Felix",
      role: "climate policy advisor",
      location: "Austin, USA",
    });
    expect(facts).toHaveLength(0);
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
      subject?: string;
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
          reference.lifecycle === "active" &&
          reference.subject === "migration work",
      ),
    ).toBe(true);
  });

  it("updates the durable profile when the user moves into a new role", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-role", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "Remember that I am a biomedical researcher in London, UK.",
        },
      ],
    });

    await memory.remember({
      scope: { userId: "u-role", workspaceId: "workspace-a", sessionId: "s-2" },
      messages: [
        {
          role: "user",
          content:
            "Remember that I have now moved into a staff platform engineer leading release quality program.",
        },
      ],
    });

    const profiles = await documentStore.query<{
      identity: {
        role?: string;
        location?: string;
      };
      activeContext?: {
        currentProjects?: string[];
      };
    }>("profiles", { userId: "u-role" });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.identity.role).toBe("staff platform engineer");
    expect(profiles[0]?.identity.location).toBe("London, UK");
    expect(profiles[0]?.activeContext?.currentProjects).toContain(
      "release quality program",
    );
  });

  it("writes slot-structured fact and reference metadata during remember", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-structured", workspaceId: "workspace-a", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content:
            "Remember that I have now moved into a staff platform engineer leading release quality program.",
        },
        {
          role: "user",
          content:
            "Remember that my current focus is runtime reliability and platform migration for release quality program.",
        },
        {
          role: "user",
          content:
            "Remember that the current blocker is vendor approval for release quality program.",
        },
        {
          role: "user",
          content:
            "Remember that owner review is still pending for release quality program.",
        },
        {
          role: "user",
          content:
            "Remember that the next milestone is cutover readiness for release quality program.",
        },
        {
          role: "user",
          content:
            "Remember that the next step for the service that has to stay online is vendor validation.",
        },
        {
          role: "user",
          content:
            "Use docs/release-quality-runbook.md as the source of truth for release quality program.",
        },
      ],
    });

    const facts = await documentStore.query<{
      content: string;
      category?: string;
      factKind?: string;
      scopeKind?: string;
      subject?: string;
    }>("facts", {
      userId: "u-structured",
      workspaceId: "workspace-a",
    });
    const references = await documentStore.query<{
      pointer: string;
      referenceKind?: string;
      subject?: string;
    }>("references", {
      userId: "u-structured",
      workspaceId: "workspace-a",
    });

    expect(
      facts.some(
        (fact) =>
          fact.content ===
            "my current role is staff platform engineer leading release quality program." &&
          fact.factKind === "role_update" &&
          fact.scopeKind === "identity" &&
          fact.subject === "release quality program",
      ),
    ).toBe(true);
    expect(
      facts.some(
        (fact) =>
          fact.content ===
            "my current focus is runtime reliability and platform migration for release quality program." &&
          fact.factKind === "focus_update" &&
          fact.scopeKind === "project" &&
          fact.subject === "release quality program",
      ),
    ).toBe(true);
    expect(
      facts.some(
        (fact) =>
          fact.content ===
            "the current blocker is vendor approval for release quality program." &&
          fact.factKind === "blocker" &&
          fact.scopeKind === "project" &&
          fact.subject === "release quality program",
      ),
    ).toBe(true);
    expect(
      facts.some(
        (fact) =>
          fact.content ===
            "owner review is still pending for release quality program." &&
          fact.factKind === "project_state" &&
          fact.scopeKind === "project" &&
          fact.subject === "release quality program",
      ),
    ).toBe(true);
    expect(
      facts.some(
        (fact) =>
          fact.content ===
            "the next milestone is cutover readiness for release quality program." &&
          fact.factKind === "project_state" &&
          fact.scopeKind === "project" &&
          fact.subject === "release quality program",
      ),
    ).toBe(true);
    expect(
      facts.some(
        (fact) =>
          fact.content ===
            "the next step for the service that has to stay online is vendor validation." &&
          fact.factKind === "project_state" &&
          fact.scopeKind === "project" &&
          fact.category !== "personal" &&
          fact.subject === "service that has to stay online",
      ),
    ).toBe(true);
    expect(
      references.some(
        (reference) =>
          reference.pointer === "docs/release-quality-runbook.md" &&
          reference.referenceKind === "source_of_truth" &&
          reference.subject === "release quality program",
      ),
    ).toBe(true);
  });

  it("writes Chinese durable memory through the public API", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.remember({
      scope: { userId: "u-zh", sessionId: "s-1", workspaceId: "workspace-zh" },
      messages: [
        {
          role: "user",
          content: "请记住迁移流程目前仍然被审批阻塞。",
        },
        {
          role: "user",
          content: "请以后优先使用要点列表回复。",
        },
        {
          role: "user",
          content: "以docs/migration-runbook.md为准。",
        },
      ],
    });

    expect(result.accepted).toBe(3);
    expect(result.metadata?.locale).toBe("zh-CN");
    expect(await documentStore.query("facts", { userId: "u-zh" })).toHaveLength(1);
    expect(await documentStore.query("feedback", { userId: "u-zh" })).toHaveLength(1);
    expect(await documentStore.query("references", { userId: "u-zh" })).toHaveLength(1);
  });

  it("persists Chinese work-location phrasing as location instead of organization", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-zh-profile", sessionId: "s-1", workspaceId: "workspace-zh" },
      messages: [
        {
          role: "user",
          content: "我在北京工作。我是后端工程师。",
        },
      ],
    });

    const profiles = await documentStore.query<{
      userId: string;
      identity: {
        role?: string;
        organization?: string;
        location?: string;
      };
    }>("profiles", { userId: "u-zh-profile" });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.identity.location).toBe("北京");
    expect(profiles[0]?.identity.role).toBe("后端工程师");
    expect(profiles[0]?.identity.organization).toBeUndefined();
  });

  it("does not create an episode for trivial Chinese assistant acknowledgements", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await memory.remember({
      scope: { userId: "u-zh-ack", sessionId: "s-1", workspaceId: "workspace-zh" },
      messages: [
        {
          role: "user",
          content: "请记住迁移流程目前仍然被审批阻塞。",
        },
        {
          role: "assistant",
          content: "好的。",
        },
      ],
    });

    expect(result.accepted).toBe(1);
    expect(
      await documentStore.query("episodes", {
        userId: "u-zh-ack",
        workspaceId: "workspace-zh",
      }),
    ).toHaveLength(0);
  });

  it("supersedes stale Chinese reference memory when the user corrects the source of truth", async () => {
    const documentStore = createInMemoryDocumentStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore,
        sessionStore: createInMemorySessionStore(),
      },
    });

    await memory.remember({
      scope: { userId: "u-zh-ref", workspaceId: "workspace-zh", sessionId: "s-1" },
      messages: [
        {
          role: "user",
          content: "迁移流程以docs/old-runbook.md为准。",
        },
      ],
    });

    await memory.remember({
      scope: { userId: "u-zh-ref", workspaceId: "workspace-zh", sessionId: "s-2" },
      messages: [
        {
          role: "user",
          content: "现在以docs/new-runbook.md为准，不再以docs/old-runbook.md为准。",
        },
      ],
    });

    const references = await documentStore.query<{
      pointer: string;
      lifecycle: string;
      subject?: string;
    }>("references", {
      userId: "u-zh-ref",
      workspaceId: "workspace-zh",
    });

    expect(
      references.some(
        (reference) =>
          reference.pointer === "docs/old-runbook.md" &&
          reference.lifecycle === "superseded",
      ),
    ).toBe(true);
    expect(
      references.some(
        (reference) =>
          reference.pointer === "docs/new-runbook.md" &&
          reference.lifecycle === "active" &&
          reference.subject === "迁移流程",
      ),
    ).toBe(true);
  });
});
