import { describe, expect, it } from "bun:test";
import { createMemoryRepositories } from "../../src/storage/repositories";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import {
  createRememberEngine,
  type RememberEngineConfig,
} from "../../src/remember/engine";
import {
  createFactMemory,
} from "../../src/domain/records";
import {
  DeterministicClock,
  createDeterministicIdGenerator,
} from "../../src/testing/utils";

function createEngine(overrides: Partial<RememberEngineConfig> = {}) {
  const clock = new DeterministicClock("2026-01-01T00:00:00.000Z");
  const documentStore = createInMemoryDocumentStore();
  const repositories = createMemoryRepositories({
    documentStore,
    sessionStore: createInMemorySessionStore(),
  });
  const engine = createRememberEngine({
    repositories,
    documentStore,
    now: () => clock.now().toISOString(),
    createId: createDeterministicIdGenerator("mem"),
    ...overrides,
  });

  return {
    clock,
    documentStore,
    repositories,
    engine,
  };
}

describe("remember engine", () => {
  it("scores explicit candidates above inferred ones and rejects low-value noise", async () => {
    const { engine } = createEngine();

    const explicit = engine.classifyCandidate({
      id: "c-1",
      kindHint: "fact",
      explicitness: "explicit",
      content: "the robot workflow is blocked on prod migration.",
      sourceMessageIndex: 0,
      sourceRole: "user",
      metadata: { category: "project" },
    });
    const inferred = engine.classifyCandidate({
      id: "c-2",
      kindHint: "fact",
      explicitness: "inferred",
      content: "The robot workflow is still failing in production.",
      sourceMessageIndex: 0,
      sourceRole: "user",
      metadata: { category: "project" },
    });
    const noise = engine.classifyCandidate({
      id: "c-3",
      kindHint: "noise",
      explicitness: "inferred",
      content: "hi",
      sourceMessageIndex: 0,
      sourceRole: "user",
    });

    expect(explicit.score).toBeGreaterThan(inferred.score);
    expect(inferred.decision).toBe("reject");
    expect(noise.decision).toBe("reject");
  });

  it("supersedes an older inferred fact with a newer explicit fact on the same topic", async () => {
    const { clock, repositories, engine } = createEngine();
    const scope = { userId: "u-1", sessionId: "s-1" };

    await repositories.facts.add(
      createFactMemory({
        id: "f-legacy",
        userId: "u-1",
        workspaceId: "workspace-a",
        sessionId: "s-legacy",
        category: "project",
        content: "The robot workflow is still failing in production after the migration.",
        source: { method: "inferred", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );

    clock.advanceMs(1000);
    const result = await engine.remember({
      scope: {
        ...scope,
        workspaceId: "workspace-a",
      },
      messages: [
        {
          role: "user",
          content: "Remember that the robot workflow is now stable in production.",
        },
      ],
    });

    const facts = await repositories.facts.listByUser("u-1");
    expect(facts).toHaveLength(2);
    expect(facts.filter((fact) => fact.lifecycle === "active")).toHaveLength(1);
    expect(facts.find((fact) => fact.lifecycle === "superseded")?.isActive).toBe(false);
    expect(result.events.some((event) => event.outcome === "superseded")).toBe(true);
  });

  it("keeps workspace-scoped durable facts isolated during dedupe and supersession", async () => {
    const { repositories, engine } = createEngine();

    await repositories.facts.add(
      createFactMemory({
        id: "f-1",
        userId: "u-1",
        workspaceId: "workspace-a",
        category: "project",
        content: "Robot workflow remains open.",
        source: { method: "explicit", extractedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );

    const result = await engine.remember({
      scope: {
        userId: "u-1",
        sessionId: "s-2",
        workspaceId: "workspace-b",
      },
      messages: [
        {
          role: "user",
          content: "Remember that Robot workflow remains open.",
        },
      ],
    });

    expect(result.events[0]?.outcome).toBe("written");
    expect(
      await repositories.facts.listByScope({
        userId: "u-1",
        workspaceId: "workspace-a",
      }),
    ).toHaveLength(1);
    expect(
      await repositories.facts.listByScope({
        userId: "u-1",
        workspaceId: "workspace-b",
      }),
    ).toHaveLength(1);
  });

  it("updates procedural memory independently from semantic fact storage", async () => {
    const { repositories, engine } = createEngine();
    const scope = { userId: "u-1", sessionId: "s-1" };

    const result = await engine.remember({
      scope,
      messages: [
        {
          role: "user",
          content: "Please keep answers concise and action-oriented.",
        },
      ],
    });

    expect(await repositories.facts.listByUser("u-1")).toHaveLength(0);
    expect(await repositories.feedback.listByUser("u-1")).toHaveLength(1);
    expect(result.accepted).toBe(1);
  });

  it("merges multi-field profile updates into one durable profile", async () => {
    const { repositories, engine } = createEngine();

    await engine.remember({
      scope: { userId: "u-1", sessionId: "s-1", workspaceId: "workspace-a" },
      messages: [
        {
          role: "user",
          content:
            "My name is Felix. I'm a climate policy advisor in Austin, USA. Remember that I'm leading incident playbook refresh.",
        },
      ],
    });

    const profile = await repositories.profiles.get("u-1");
    const facts = await repositories.facts.listByScope({
      userId: "u-1",
      workspaceId: "workspace-a",
      sessionId: "s-1",
    });

    expect(profile?.identity).toEqual({
      name: "Felix",
      role: "climate policy advisor",
      location: "Austin, USA",
    });
    expect(profile?.activeContext.currentProjects).toEqual([
      "incident playbook refresh",
    ]);
    expect(facts).toHaveLength(0);
  });

  it("writes structured profile fields beyond name and explains them in trace reasons", async () => {
    const { repositories, engine } = createEngine();

    const result = await engine.remember({
      scope: { userId: "u-1", sessionId: "s-1", workspaceId: "workspace-a" },
      messages: [
        {
          role: "user",
          content:
            "I'm a staff engineer at Acme Labs. My timezone is Asia/Shanghai. My preferred language is Chinese.",
        },
      ],
    });

    const profile = await repositories.profiles.get("u-1");

    expect(profile?.identity).toEqual({
      role: "staff engineer",
      organization: "Acme Labs",
      timezone: "Asia/Shanghai",
      languagePreference: "Chinese",
    });
    expect(result.events.map((event) => event.reason)).toContain("explicit_profile_role");
    expect(result.events.map((event) => event.reason)).toContain(
      "explicit_profile_organization",
    );
    expect(result.events.map((event) => event.reason)).toContain(
      "explicit_profile_timezone",
    );
    expect(result.events.map((event) => event.reason)).toContain(
      "explicit_profile_language_preference",
    );
  });

  it("exposes extraction and rejects unsupported kinds or policy-vetoed writes", async () => {
    const base = createEngine();
    const blocked = createEngine({
      shouldWrite: () => false,
    });

    const extraction = await base.engine.extract({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [{ role: "user", content: "Remember that runtime stability matters." }],
    });
    const unsupported = base.engine.classifyCandidate({
      id: "c-episode",
      kindHint: "episode",
      explicitness: "explicit",
      content: "conversation episode",
      sourceMessageIndex: 0,
      sourceRole: "user",
    });

    const blockedResult = await blocked.engine.remember({
      scope: { userId: "u-1", sessionId: "s-1" },
      messages: [{ role: "user", content: "Remember that runtime stability matters." }],
    });

    expect(extraction.candidates).toHaveLength(1);
    expect(unsupported.decision).toBe("reject");
    expect(unsupported.reason).toBe("unsupported_kind");
    expect(blockedResult.accepted).toBe(0);
    expect(blockedResult.events[0]?.reason).toBe("policy_rejected");
  });

  it("merges duplicate references and facts within the same scope", async () => {
    const { engine } = createEngine();
    const scope = { userId: "u-1", sessionId: "s-1", workspaceId: "workspace-a" };

    await engine.remember({
      scope,
      messages: [
        {
          role: "user",
          content: "Use docs/runtime-runbook.md as the source of truth for runtime work.",
        },
        {
          role: "user",
          content: "Remember that the runtime migration is blocked on a schema rollout.",
        },
      ],
    });

    const duplicateResult = await engine.remember({
      scope,
      messages: [
        {
          role: "user",
          content: "Use docs/runtime-runbook.md as the source of truth for runtime work.",
        },
        {
          role: "user",
          content: "Remember that the runtime migration is blocked on a schema rollout.",
        },
      ],
    });

    expect(
      duplicateResult.events.some((event) => event.reason === "duplicate_reference"),
    ).toBe(true);
    expect(
      duplicateResult.events.some((event) => event.reason === "duplicate_fact"),
    ).toBe(true);
  });

  it("supersedes older feedback rules when a new active rule replaces them", async () => {
    const { repositories, engine } = createEngine();
    const scope = { userId: "u-1", sessionId: "s-1", workspaceId: "workspace-a" };

    await engine.remember({
      scope,
      messages: [
        {
          role: "user",
          content: "Please keep answers concise.",
        },
      ],
    });

    const result = await engine.remember({
      scope: {
        ...scope,
        sessionId: "s-2",
      },
      messages: [
        {
          role: "user",
          content: "Please use bullet points in every response.",
        },
      ],
    });

    const feedback = await repositories.feedback.listByScope({
      userId: "u-1",
      workspaceId: "workspace-a",
    });

    expect(result.events[0]?.reason).toBe("superseded_feedback");
    expect(feedback.some((item) => item.lifecycle === "superseded")).toBe(true);
    expect(feedback.some((item) => item.lifecycle === "active")).toBe(true);
  });
});
