import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createGoodMemory } from "../../src";
import { createSessionArchive } from "../../src/evolution/contracts";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
  createInMemoryVectorStore,
} from "../../src/storage/memory";
import { createMemoryRepositories } from "../../src/storage/repositories";
import { createFakeEmbeddingAdapter } from "../../src/testing/fakes";
import {
  loadPersonaSpec,
  loadScenarioFixture,
} from "../../src/eval/dataset";
import {
  runBaselineScenario,
  runGoodMemoryScenario,
} from "../../src/eval/runners";

describe("eval runners", () => {
  it("builds a baseline answer package without memory context", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );

    const result = await runBaselineScenario({
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext ? "unexpected" : "baseline-answer",
      }),
    });

    expect(result.mode).toBe("baseline");
    expect(result.memoryContext).toBeUndefined();
    expect(result.answer).toBe("baseline-answer");
    expect(result.trace.sessionsReplayed).toBe(0);
  });

  it("replays scenario history through GoodMemory and builds a memory-backed answer package", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext?.includes("runbook")
          ? "goodmemory-answer"
          : "missing-context",
      }),
    });

    expect(result.mode).toBe("goodmemory");
    expect(result.strategyLabel).toBe("auto");
    expect(result.memoryContext).toContain("runbook");
    expect(result.answer).toBe("goodmemory-answer");
    expect(result.trace.sessionsReplayed).toBeGreaterThan(0);
    expect(result.trace.rememberEvents.length).toBeGreaterThan(0);
    expect(result.trace.recallHitCount).toBeGreaterThan(0);
    expect(
      result.trace.rememberEvents.some((session) => session.events.length > 0),
    ).toBe(true);
    expect(
      result.trace.rememberEvents
        .flatMap((session) => session.events)
        .some((event) => event.memoryType === "reference"),
    ).toBe(true);
    expect(result.retrieved?.references.length).toBeGreaterThan(0);
    expect(result.retrieved?.evidence.length).toBeGreaterThan(0);
    expect(result.retrieved?.hits.some((hit) => hit.type === "reference")).toBe(true);
    expect(result.retrieved?.candidateTraces.length).toBeGreaterThan(0);
    expect(
      result.retrieved?.candidateTraces.some(
        (trace) => trace.returned && typeof trace.whyReturned === "string",
      ),
    ).toBe(true);
    expect(result.retrieved?.renderedMemoryContext).toContain("runbook");
    expect(result.memoryContext).toContain("final verification for migration rollout");
    expect(
      result.retrieved?.feedback.some((feedback) =>
        feedback.rule.includes("Please confirm the updated runbook"),
      ) ?? false,
    ).toBe(false);
    expect(result.transcript).not.toContain("I can do that once I have the full remembered context.");
  });

  it("forwards requested recall strategy into eval replay when semantic adapters exist", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createInMemoryDocumentStore(),
        sessionStore: createInMemorySessionStore(),
        vectorStore: createInMemoryVectorStore(),
        embeddingAdapter: createFakeEmbeddingAdapter(),
      },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      strategy: "hybrid",
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    expect(result.retrieved?.routingDecision?.strategy).toBe("hybrid");
    expect(result.retrieved?.routingDecision?.strategyExplanation.semanticTieBreaking).toBe(
      true,
    );
  });

  it("forwards requested remember extraction strategy into eval replay", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const rememberStrategies: Array<string | undefined> = [];
    const memory = {
      async remember(input: {
        extractionStrategy?: string;
      }) {
        rememberStrategies.push(input.extractionStrategy);
        return {
          accepted: 0,
          rejected: 0,
          events: [],
          metadata: {
            locale: "en-US",
            localeSource: "default" as const,
            adapterId: "english",
            analysisMode: "rules-only" as const,
            requestedExtractionStrategy: "auto" as const,
            resolvedExtractionStrategy: "rules-only" as const,
          },
        };
      },
      async feedback() {
        return {
          accepted: false,
        };
      },
      async recall() {
        return {
          profile: null,
          preferences: [],
          references: [],
          facts: [],
          feedback: [],
          archives: [],
          evidence: [],
          episodes: [],
          workingMemory: null,
          journal: null,
          packet: {
            locale: "en-US",
            profile: null,
            preferences: [],
            references: [],
            facts: [],
            feedback: [],
            archives: [],
            evidence: [],
            episodes: [],
            workingMemory: null,
            journal: null,
            routingDecision: {
              retrievalProfile: "general_chat",
              intent: "general_assistance",
              strategy: "rules-only" as const,
              strategyExplanation: {
                requestedStrategy: "auto" as const,
                resolvedStrategy: "rules-only" as const,
                summary: "auto routing stayed rules-only",
                hardFloor: "lexical_runtime_procedural_priors" as const,
                semanticTieBreaking: false,
                llmRefinement: false,
              },
              sourcePriorities: ["profile", "feedback", "fact"],
              requestedSlots: [],
              supportSlots: [],
              actionDriving: false,
              referenceSeeking: false,
              continuation: false,
            },
          },
          metadata: {
            routingDecision: {
              retrievalProfile: "general_chat",
              intent: "general_assistance",
              strategy: "rules-only" as const,
              strategyExplanation: {
                requestedStrategy: "auto" as const,
                resolvedStrategy: "rules-only" as const,
                summary: "auto routing stayed rules-only",
                hardFloor: "lexical_runtime_procedural_priors" as const,
                semanticTieBreaking: false,
                llmRefinement: false,
              },
              sourcePriorities: ["profile", "feedback", "fact"],
              requestedSlots: [],
              supportSlots: [],
              actionDriving: false,
              referenceSeeking: false,
              continuation: false,
            },
            tokenCount: 0,
            latencyMs: 0,
            hits: [],
            candidateTraces: [],
            verificationHints: [],
            policyApplied: [],
          },
        };
      },
      async buildContext() {
        return {
          output: "markdown" as const,
          content: "memory context",
          estimatedTokens: 3,
          omittedSections: [],
        };
      },
      async forget() {
        return { forgotten: false };
      },
      async exportMemory() {
        throw new Error("not used");
      },
      async deleteAllMemory() {
        return {
          scope: { userId: persona.persona_id },
          deleted: {
            profiles: 0,
            preferences: 0,
            references: 0,
            facts: 0,
            feedback: 0,
            episodes: 0,
            archives: 0,
            evidence: 0,
            experiences: 0,
            workingMemory: 0,
            journal: 0,
            artifactSpills: 0,
          },
        };
      },
    };

    await runGoodMemoryScenario({
      memory: memory as never,
      persona,
      scenario,
      rememberExtractionStrategy: "auto",
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    expect(rememberStrategies.every((strategy) => strategy === "auto")).toBe(true);
  });

  it("records remember extraction metadata in eval traces", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const memory = {
      async remember() {
        return {
          accepted: 1,
          rejected: 0,
          events: [],
          metadata: {
            locale: "en-US",
            localeSource: "default" as const,
            adapterId: "english",
            analysisMode: "rules-only" as const,
            requestedExtractionStrategy: "auto" as const,
            resolvedExtractionStrategy: "llm-assisted" as const,
          },
        };
      },
      async feedback() {
        return { accepted: false };
      },
      async recall() {
        return {
          profile: null,
          preferences: [],
          references: [],
          facts: [],
          feedback: [],
          archives: [],
          evidence: [],
          episodes: [],
          workingMemory: null,
          journal: null,
          packet: {
            locale: "en-US",
            profile: null,
            preferences: [],
            references: [],
            facts: [],
            feedback: [],
            archives: [],
            evidence: [],
            episodes: [],
            workingMemory: null,
            journal: null,
            routingDecision: {
              retrievalProfile: "general_chat",
              intent: "general_assistance",
              strategy: "rules-only" as const,
              strategyExplanation: {
                requestedStrategy: "auto" as const,
                resolvedStrategy: "rules-only" as const,
                summary: "auto routing stayed rules-only",
                hardFloor: "lexical_runtime_procedural_priors" as const,
                semanticTieBreaking: false,
                llmRefinement: false,
              },
              sourcePriorities: ["profile", "feedback", "fact"],
              requestedSlots: [],
              supportSlots: [],
              actionDriving: false,
              referenceSeeking: false,
              continuation: false,
            },
          },
          metadata: {
            routingDecision: {
              retrievalProfile: "general_chat",
              intent: "general_assistance",
              strategy: "rules-only" as const,
              strategyExplanation: {
                requestedStrategy: "auto" as const,
                resolvedStrategy: "rules-only" as const,
                summary: "auto routing stayed rules-only",
                hardFloor: "lexical_runtime_procedural_priors" as const,
                semanticTieBreaking: false,
                llmRefinement: false,
              },
              sourcePriorities: ["profile", "feedback", "fact"],
              requestedSlots: [],
              supportSlots: [],
              actionDriving: false,
              referenceSeeking: false,
              continuation: false,
            },
            tokenCount: 0,
            latencyMs: 0,
            hits: [],
            candidateTraces: [],
            verificationHints: [],
            policyApplied: [],
          },
        };
      },
      async buildContext() {
        return {
          output: "markdown" as const,
          content: "memory context",
          estimatedTokens: 3,
          omittedSections: [],
        };
      },
      async forget() {
        return { forgotten: false };
      },
      async exportMemory() {
        throw new Error("not used");
      },
      async deleteAllMemory() {
        return {
          scope: { userId: persona.persona_id },
          deleted: {
            profiles: 0,
            preferences: 0,
            references: 0,
            facts: 0,
            feedback: 0,
            episodes: 0,
            archives: 0,
            evidence: 0,
            experiences: 0,
            workingMemory: 0,
            journal: 0,
            artifactSpills: 0,
          },
        };
      },
    };

    const result = await runGoodMemoryScenario({
      memory: memory as never,
      persona,
      scenario,
      rememberExtractionStrategy: "auto",
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    expect(result.trace.rememberEvents[0]?.metadata).toEqual({
      locale: "en-US",
      localeSource: "default",
      adapterId: "english",
      analysisMode: "rules-only",
      requestedExtractionStrategy: "auto",
      resolvedExtractionStrategy: "llm-assisted",
    });
  });

  it("isolates eval replay scopes with a case namespace across user and workspace ids", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const rememberedScopes: Array<{
      userId: string;
      workspaceId?: string;
      sessionId?: string;
    }> = [];
    const recalledScopes: Array<{
      userId: string;
      workspaceId?: string;
      sessionId?: string;
    }> = [];

    const result = await runGoodMemoryScenario({
      memory: {
        async remember(input: {
          scope: { userId: string; workspaceId?: string; sessionId?: string };
        }) {
          rememberedScopes.push(input.scope);
          return {
            accepted: 0,
            rejected: 0,
            events: [],
            metadata: {
              locale: "en-US",
              localeSource: "default" as const,
              adapterId: "english",
              analysisMode: "rules-only" as const,
              requestedExtractionStrategy: "auto" as const,
              resolvedExtractionStrategy: "rules-only" as const,
            },
          };
        },
        async feedback() {
          return { accepted: false };
        },
        async recall(input: {
          scope: { userId: string; workspaceId?: string; sessionId?: string };
        }) {
          recalledScopes.push(input.scope);
          return {
            profile: null,
            preferences: [],
            references: [],
            facts: [],
            feedback: [],
            archives: [],
            evidence: [],
            episodes: [],
            workingMemory: null,
            journal: null,
            packet: {
              locale: "en-US",
              profile: null,
              preferences: [],
              references: [],
              facts: [],
              feedback: [],
              archives: [],
              evidence: [],
              episodes: [],
              workingMemory: null,
              journal: null,
              routingDecision: {
                retrievalProfile: "general_chat",
                intent: "general_assistance",
                strategy: "rules-only" as const,
                strategyExplanation: {
                  requestedStrategy: "auto" as const,
                  resolvedStrategy: "rules-only" as const,
                  summary: "auto routing stayed rules-only",
                  hardFloor: "lexical_runtime_procedural_priors" as const,
                  semanticTieBreaking: false,
                  llmRefinement: false,
                },
                sourcePriorities: ["profile", "feedback", "fact"],
                requestedSlots: [],
                supportSlots: [],
                actionDriving: false,
                referenceSeeking: false,
                continuation: false,
              },
            },
            metadata: {
              routingDecision: {
                retrievalProfile: "general_chat",
                intent: "general_assistance",
                strategy: "rules-only" as const,
                strategyExplanation: {
                  requestedStrategy: "auto" as const,
                  resolvedStrategy: "rules-only" as const,
                  summary: "auto routing stayed rules-only",
                  hardFloor: "lexical_runtime_procedural_priors" as const,
                  semanticTieBreaking: false,
                  llmRefinement: false,
                },
                sourcePriorities: ["profile", "feedback", "fact"],
                requestedSlots: [],
                supportSlots: [],
                actionDriving: false,
                referenceSeeking: false,
                continuation: false,
              },
              tokenCount: 0,
              latencyMs: 0,
              hits: [],
              candidateTraces: [],
              verificationHints: [],
              policyApplied: [],
            },
          };
        },
        async buildContext() {
          return {
            output: "markdown" as const,
            content: "memory context",
            estimatedTokens: 3,
            omittedSections: [],
          };
        },
        async forget() {
          return { forgotten: false };
        },
        async exportMemory() {
          throw new Error("not used");
        },
        async deleteAllMemory() {
          return {
            scope: { userId: persona.persona_id },
            deleted: {
              profiles: 0,
              preferences: 0,
              references: 0,
              facts: 0,
              feedback: 0,
              episodes: 0,
              archives: 0,
              evidence: 0,
              experiences: 0,
              workingMemory: 0,
              journal: 0,
              artifactSpills: 0,
            },
          };
        },
      } as never,
      persona,
      scenario,
      scopeNamespace: "run-live-memory-scenario-medium-01__hybrid",
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    const usedScopes = [...rememberedScopes, ...recalledScopes];

    expect(result.answer).toBe("memory context");
    expect(usedScopes.length).toBeGreaterThan(0);
    expect(new Set(usedScopes.map((scope) => scope.userId)).size).toBe(1);
    expect(usedScopes[0]?.userId).not.toBe(persona.persona_id);
    expect(
      usedScopes.every((scope) =>
        scope.workspaceId?.includes("run-live-memory-scenario-medium-01__hybrid"),
      ),
    ).toBe(true);
  });

  it("records render-time context tokens separately from packet tokens in eval traces", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-13.json"),
    );
    const scenario = await loadScenarioFixture(
      join(
        import.meta.dir,
        "../../fixtures/scenarios/eval/scenario-medium-13-reference-next-step.json",
      ),
    );
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createInMemoryDocumentStore(),
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    const contextBuild = result.trace.contextBuild as Record<string, unknown> | null;

    expect(contextBuild).not.toBeNull();
    expect(contextBuild?.contextEstimatedTokens).toBe(
      Math.ceil((result.memoryContext?.length ?? 0) / 4),
    );
    expect(contextBuild?.packetTokenCountBeforeRender).toBeGreaterThan(0);
    expect(contextBuild?.recallTokenCount).toBeUndefined();
  });

  it("can force ignore-memory during eval replay and still produce a valid answer package", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      ignoreMemory: true,
      answerGenerator: async () => ({
        content: "answer-without-memory",
      }),
    });

    expect(result.answer).toBe("answer-without-memory");
    expect(result.retrieved?.facts).toHaveLength(0);
    expect(result.retrieved?.candidateTraces).toHaveLength(0);
    expect(result.retrieved?.policyApplied).toContain("ignore_memory");
  });

  it("replays complex profile context so role and location survive into retrieved memory", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/complex-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-complex-01.json"),
    );
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createInMemoryDocumentStore(),
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    expect(result.retrieved?.profile?.identity.name).toBe("Felix");
    expect(result.retrieved?.profile?.identity.role).toBe("climate policy advisor");
    expect(result.retrieved?.profile?.identity.location).toBe("Austin, USA");
    expect(result.retrieved?.profile?.activeContext.currentProjects).toContain(
      "incident playbook refresh",
    );
    expect(result.retrieved?.renderedMemoryContext).toContain(
      "Felix - climate policy advisor - Austin, USA",
    );
    expect(result.retrieved?.renderedMemoryContext).toContain("## Active Context");
    expect(result.retrieved?.renderedMemoryContext).toContain(
      "Current projects: incident playbook refresh",
    );
    expect(
      result.trace.rememberEvents
        .flatMap((session) => session.events)
        .some((event) => event.reason === "explicit_profile_role"),
    ).toBe(true);
    expect(
      result.trace.rememberEvents
        .flatMap((session) => session.events)
        .some((event) => event.reason === "explicit_profile_location"),
    ).toBe(true);
    expect(
      result.trace.rememberEvents
        .flatMap((session) => session.events)
        .some((event) => event.reason === "explicit_profile_current_project"),
    ).toBe(true);
  });

  it("surfaces explicit current-role updates in long-lifecycle eval context", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/long-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-long-01.json"),
    );
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createInMemoryDocumentStore(),
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    expect(
      result.retrieved?.facts.some((fact) =>
        fact.content ===
          "my current role is staff platform engineer leading release quality program.",
      ) ?? false,
    ).toBe(true);
    expect(result.memoryContext).toContain(
      "my current role is staff platform engineer leading release quality program.",
    );
    expect(result.memoryContext).toContain(
      "my current focus is runtime reliability and platform migration for release quality program, not the old backlog cleanup.",
    );
  });

  it("does not surface scoped carry-over avoidance rules in cross-domain eval context", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-11.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-11.json"),
    );
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: {
        documentStore: createInMemoryDocumentStore(),
        sessionStore: createInMemorySessionStore(),
      },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    expect(result.memoryContext).not.toContain(
      "avoid irrelevant carry-over from hobby preferences",
    );
  });

  it("can surface archive-backed continuity in eval answer packages", async () => {
    const persona = await loadPersonaSpec(
      join(import.meta.dir, "../../fixtures/personas/eval/medium-01.json"),
    );
    const scenario = await loadScenarioFixture(
      join(import.meta.dir, "../../fixtures/scenarios/eval/scenario-medium-01.json"),
    );
    const documentStore = createInMemoryDocumentStore();
    const sessionStore = createInMemorySessionStore();
    const repositories = createMemoryRepositories({
      documentStore,
      sessionStore,
    });
    await repositories.archives.add(
      createSessionArchive({
        id: "archive-eval-1",
        userId: persona.persona_id,
        workspaceId: `eval-${persona.lifecycle_bucket}`,
        sessionId: "archive-s1",
        summary: "Previous session paused after step 2 and still needs final verification.",
        unresolvedItems: ["final verification for migration rollout"],
        keyDecisions: ["Resume from the final verification checklist."],
        createdAt: "2026-03-31T00:00:00.000Z",
        archivedAt: "2026-03-31T00:00:00.000Z",
      }),
    );
    const memory = createGoodMemory({
      storage: { provider: "memory" },
      adapters: { documentStore, sessionStore },
    });

    const result = await runGoodMemoryScenario({
      memory,
      persona,
      scenario,
      retrievalProfile: "coding_agent",
      answerGenerator: async (input) => ({
        content: input.memoryContext ?? "missing-context",
      }),
    });

    expect(result.retrieved?.archives.length).toBeGreaterThan(0);
    expect(result.retrieved?.hits.some((hit) => hit.type === "session_archive")).toBe(true);
    expect(result.retrieved?.archives[0]?.summary).toContain(
      "Previous session paused after step 2",
    );
    expect(result.retrieved?.archives[0]?.unresolvedItems).toContain(
      "final verification for migration rollout",
    );
  });
});
