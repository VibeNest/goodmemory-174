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
  createReferenceMemory,
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

  it("falls back to rules-only extraction when llm-assisted extraction fails", async () => {
    const scope = { userId: "u-fallback", sessionId: "s-1", workspaceId: "workspace-a" };
    const { engine, repositories } = createEngine({
      extractor: {
        async extract() {
          return {
            candidates: [
              {
                id: "rules-1",
                kindHint: "fact",
                explicitness: "explicit",
                content: "Runtime launch is blocked on legal review.",
                sourceMessageIndex: 0,
                sourceRole: "user",
                metadata: {
                  category: "project",
                  factKind: "open_loop",
                  subject: "runtime launch",
                },
              },
            ],
            ignoredMessageCount: 0,
          };
        },
      },
      assistedExtractor: {
        async extract() {
          throw new Error("OpenAI-compatible gateway timeout after 45000ms.");
        },
      },
    });

    const result = await engine.remember({
      scope,
      extractionStrategy: "llm-assisted",
      messages: [
        {
          role: "user",
          content: "Remember that runtime launch is blocked on legal review.",
        },
      ],
    });

    const facts = await repositories.facts.listByScope(scope);

    expect(result.accepted).toBe(1);
    expect(result.metadata?.requestedExtractionStrategy).toBe("llm-assisted");
    expect(result.metadata?.resolvedExtractionStrategy).toBe("rules-only");
    expect(result.events[0]?.extractionSources).toEqual(["rules-only"]);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.subject).toBe("runtime launch");
  });

  it("defaults extraction strategy to auto and keeps simple explicit inputs on rules-only", async () => {
    const scope = { userId: "u-auto-simple", sessionId: "s-1", workspaceId: "workspace-a" };
    let assistedCalls = 0;
    const { engine } = createEngine({
      extractor: {
        async extract() {
          return {
            candidates: [
              {
                id: "rules-1",
                kindHint: "fact",
                explicitness: "explicit",
                content: "Runtime launch is blocked on legal review.",
                sourceMessageIndex: 0,
                sourceRole: "user",
                metadata: {
                  category: "project",
                  factKind: "blocker",
                  subject: "runtime launch",
                },
              },
            ],
            ignoredMessageCount: 0,
          };
        },
      },
      assistedExtractor: {
        async extract() {
          assistedCalls += 1;
          return {
            candidates: [],
            ignoredMessageCount: 0,
          };
        },
      },
    });

    const result = await engine.remember({
      scope,
      messages: [
        {
          role: "user",
          content: "Remember that runtime launch is blocked on legal review.",
        },
      ],
    });

    expect(result.metadata?.requestedExtractionStrategy).toBe("auto");
    expect(result.metadata?.resolvedExtractionStrategy).toBe("rules-only");
    expect(assistedCalls).toBe(0);
    expect(result.events[0]?.extractionSources).toEqual(["rules-only"]);
  });

  it("upgrades auto extraction to llm-assisted for multi-intent replay batches", async () => {
    const scope = { userId: "u-auto-assisted", sessionId: "s-1", workspaceId: "workspace-a" };
    let assistedCalls = 0;
    const { engine } = createEngine({
      extractor: {
        async extract() {
          return {
            candidates: [
              {
                id: "rules-reference",
                kindHint: "reference",
                explicitness: "explicit",
                content: "docs/runtime-runbook.md",
                sourceMessageIndex: 0,
                sourceRole: "user",
                metadata: {
                  referencePointer: "docs/runtime-runbook.md",
                  referenceTitle: "Runtime runbook",
                },
              },
              {
                id: "rules-fact",
                kindHint: "fact",
                explicitness: "explicit",
                content: "Runtime migration is blocked on schema rollout.",
                sourceMessageIndex: 1,
                sourceRole: "user",
                metadata: {
                  category: "project",
                  factKind: "blocker",
                  subject: "runtime migration",
                },
              },
            ],
            ignoredMessageCount: 0,
          };
        },
      },
      assistedExtractor: {
        async extract() {
          assistedCalls += 1;
          return {
            candidates: [
              {
                id: "llm-reference",
                kindHint: "reference",
                explicitness: "explicit",
                content: "The source of truth is docs/runtime-runbook.md.",
                sourceMessageIndex: 0,
                sourceRole: "user",
                metadata: {
                  referenceKind: "runbook",
                  referencePointer: "docs/runtime-runbook.md",
                  referenceTitle: "Runtime runbook",
                },
              },
            ],
            ignoredMessageCount: 0,
          };
        },
      },
    });

    const result = await engine.remember({
      scope,
      messages: [
        {
          role: "user",
          content: "Use docs/runtime-runbook.md as the source of truth.",
        },
        {
          role: "user",
          content: "Remember that runtime migration is blocked on schema rollout.",
        },
      ],
    });

    expect(result.metadata?.requestedExtractionStrategy).toBe("auto");
    expect(result.metadata?.resolvedExtractionStrategy).toBe("llm-assisted");
    expect(assistedCalls).toBe(1);
    expect(
      result.events.some((event) => event.extractionSources?.includes("llm-assisted")),
    ).toBe(true);
  });

  it("falls back from auto extraction to rules-only when assisted extraction fails", async () => {
    const scope = { userId: "u-auto-fallback", sessionId: "s-1", workspaceId: "workspace-a" };
    const { engine, repositories } = createEngine({
      extractor: {
        async extract() {
          return {
            candidates: [
              {
                id: "rules-reference",
                kindHint: "reference",
                explicitness: "explicit",
                content: "docs/runtime-runbook.md",
                sourceMessageIndex: 0,
                sourceRole: "user",
                metadata: {
                  referencePointer: "docs/runtime-runbook.md",
                  referenceTitle: "Runtime runbook",
                },
              },
              {
                id: "rules-fact",
                kindHint: "fact",
                explicitness: "explicit",
                content: "Runtime launch is blocked on legal review.",
                sourceMessageIndex: 1,
                sourceRole: "user",
                metadata: {
                  category: "project",
                  factKind: "blocker",
                  subject: "runtime launch",
                },
              },
            ],
            ignoredMessageCount: 0,
          };
        },
      },
      assistedExtractor: {
        async extract() {
          throw new Error("OpenAI-compatible gateway timeout after 45000ms.");
        },
      },
    });

    const result = await engine.remember({
      scope,
      messages: [
        {
          role: "user",
          content: "Correction: docs/runtime-runbook.md is now the source of truth.",
        },
        {
          role: "user",
          content: "Remember that runtime launch is blocked on legal review.",
        },
      ],
    });

    const references = await repositories.references.listByScope(scope);
    const facts = await repositories.facts.listByScope(scope);

    expect(result.metadata?.requestedExtractionStrategy).toBe("auto");
    expect(result.metadata?.resolvedExtractionStrategy).toBe("rules-only");
    expect(references).toHaveLength(1);
    expect(facts).toHaveLength(1);
  });

  it("enriches duplicate facts with better structured metadata during llm-assisted merge", async () => {
    const scope = { userId: "u-llm-fact", sessionId: "s-1", workspaceId: "workspace-a" };
    const { engine, repositories } = createEngine({
      extractor: {
        async extract() {
          return {
            candidates: [
              {
                id: "rules-1",
                kindHint: "fact",
                explicitness: "explicit",
                content: "Runtime rollout is blocked on legal signoff.",
                sourceMessageIndex: 0,
                sourceRole: "user",
                metadata: {
                  category: "project",
                },
              },
            ],
            ignoredMessageCount: 0,
          };
        },
      },
      assistedExtractor: {
        async extract() {
          return {
            candidates: [
              {
                id: "llm-1",
                kindHint: "fact",
                explicitness: "explicit",
                content: "Runtime rollout is blocked on legal signoff.",
                sourceMessageIndex: 0,
                sourceRole: "user",
                metadata: {
                  category: "project",
                  factKind: "blocker",
                  scopeKind: "project",
                  subject: "runtime rollout",
                },
              },
            ],
            ignoredMessageCount: 0,
          };
        },
      },
    });

    const result = await engine.remember({
      scope,
      extractionStrategy: "llm-assisted",
      messages: [
        {
          role: "user",
          content: "Remember that the runtime rollout is blocked on legal signoff.",
        },
      ],
    });

    const facts = await repositories.facts.listByScope(scope);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.factKind).toBe("blocker");
    expect(facts[0]?.scopeKind).toBe("project");
    expect(facts[0]?.subject).toBe("runtime rollout");
    expect(result.events.some((event) => event.reason === "duplicate_fact")).toBe(true);
  });

  it("strengthens duplicate fact provenance when a stronger duplicate arrives", async () => {
    const scope = { userId: "u-fact-provenance", sessionId: "s-1", workspaceId: "workspace-a" };
    const { engine, repositories } = createEngine({
      extractor: {
        async extract() {
          return {
            candidates: [
              {
                id: "explicit-1",
                kindHint: "fact",
                explicitness: "explicit",
                content: "Runtime rollout is blocked on legal signoff.",
                sourceMessageIndex: 0,
                sourceRole: "user",
                metadata: {
                  category: "project",
                },
              },
            ],
            ignoredMessageCount: 0,
          };
        },
      },
    });

    await repositories.facts.add(
      createFactMemory({
        id: "fact-existing",
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        sessionId: "s-legacy",
        category: "project",
        content: "Runtime rollout is blocked on legal signoff.",
        source: {
          method: "inferred",
          extractedAt: "2026-01-01T00:00:00.000Z",
          locale: "en-US",
        },
      }),
    );

    await engine.remember({
      scope,
      messages: [
        {
          role: "user",
          content: "Remember that the runtime rollout is blocked on legal signoff.",
        },
      ],
    });

    const facts = await repositories.facts.listByScope(scope);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.source.method).toBe("explicit");
  });

  it("strengthens duplicate references with assisted referenceKind and provenance", async () => {
    const scope = { userId: "u-ref-upgrade", sessionId: "s-1", workspaceId: "workspace-a" };
    const { engine, repositories } = createEngine({
      extractor: {
        async extract() {
          return {
            candidates: [],
            ignoredMessageCount: 0,
          };
        },
      },
      assistedExtractor: {
        async extract() {
          return {
            candidates: [
              {
                id: "llm-ref-1",
                kindHint: "reference",
                explicitness: "explicit",
                content: "docs/runtime-runbook.md",
                sourceMessageIndex: 0,
                sourceRole: "user",
                metadata: {
                  referencePointer: "docs/runtime-runbook.md",
                  referenceKind: "source_of_truth",
                  subject: "runtime rollout",
                },
              },
            ],
            ignoredMessageCount: 0,
          };
        },
      },
    });

    await repositories.references.add(
      createReferenceMemory({
        id: "ref-existing",
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        sessionId: "s-legacy",
        title: "docs/runtime-runbook.md",
        pointer: "docs/runtime-runbook.md",
        referenceKind: "doc",
        subject: "unknown",
        source: {
          method: "inferred",
          extractedAt: "2026-01-01T00:00:00.000Z",
          locale: "en-US",
        },
      }),
    );

    await engine.remember({
      scope,
      extractionStrategy: "llm-assisted",
      messages: [
        {
          role: "user",
          content: "Use docs/runtime-runbook.md as the source of truth for runtime rollout.",
        },
      ],
    });

    const references = await repositories.references.listByScope(scope);

    expect(references).toHaveLength(1);
    expect(references[0]?.referenceKind).toBe("source_of_truth");
    expect(references[0]?.subject).toBe("runtime rollout");
    expect(references[0]?.source.method).toBe("explicit");
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
