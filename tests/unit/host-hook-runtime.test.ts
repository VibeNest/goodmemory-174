import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  GoodMemory,
  GoodMemoryConfig,
  RecallResult,
} from "../../src/api/contracts";
import { executeInstalledHostHook } from "../../src/install/hostHookRuntime";
import {
  createNoopGoodMemoryJobsFacade,
  createNoopGoodMemoryRuntimeFacade,
} from "../../src/testing/fakes";

async function createWorkspace(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function createRecallResult(): RecallResult {
  return {
    archives: [],
    episodes: [],
    evidence: [],
    facts: [],
    feedback: [],
    journal: null,
    packet: {
      debug: {
        estimatedTokens: 0,
        omittedSections: [],
      },
      renderingProfile: "coding_agent",
    },
    preferences: [],
    profile: null,
    references: [],
    workingMemory: null,
    metadata: {
      adapterId: "rules",
      analysisMode: "rules-only",
      candidateTraces: [],
      hits: [],
      latencyMs: 1,
      policyApplied: [],
      routingDecision: {
        actionDriving: false,
        continuation: false,
        intent: "general_assistance",
        referenceSeeking: false,
        requestedSlots: [],
        retrievalProfile: "coding_agent",
        sourcePriorities: [],
        strategy: "rules-only",
        strategyExplanation: {
          hardFloor: "lexical_runtime_procedural_priors",
          llmRefinement: false,
          requestedStrategy: "rules-only",
          resolvedStrategy: "rules-only",
          semanticTieBreaking: false,
          summary: "test",
        },
        supportSlots: [],
      },
      tokenCount: 1,
      verificationHints: [],
    },
  };
}

describe("installed host hook runtime", () => {
  it("derives scope and emits additionalContext for user prompt submit", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hook-workspace-");
    const calls: {
      buildContext?: {
        maxTokens?: number;
        output?: string;
      };
      recall?: {
        query?: string;
        retrievalProfile?: string;
        scope?: {
          agentId?: string;
          sessionId?: string;
          userId?: string;
          workspaceId?: string;
        };
      };
      storage?: GoodMemoryConfig["storage"];
    } = {};

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await mkdir(join(workspaceRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            debug: false,
            host: "codex",
            maxTokens: 320,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(workspaceRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            enabled: true,
            host: "codex",
            maxTokens: 96,
            version: 1,
            workspaceId: "workspace-hook",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostHook(
        {
          command: "user-prompt-submit",
          host: "codex",
          homeRoot,
          payload: {
            cwd: workspaceRoot,
            prompt: "Check the release runbook before editing files.",
            session_id: "session-42",
          },
        },
        {
          createMemory: ((config: GoodMemoryConfig) => {
            calls.storage = config.storage;
            return {
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext(input) {
                calls.buildContext = {
                  maxTokens: input.maxTokens,
                  output: input.output,
                };
                return {
                  content: "Developer memory notes:\nRunbook: docs/release-quality-runbook.md",
                  estimatedTokens: 12,
                  omittedSections: [],
                  output: "developer_prompt_fragment",
                };
              },
              async recall(input) {
                calls.recall = {
                  query: input.query,
                  retrievalProfile: input.retrievalProfile,
                  scope: input.scope,
                };
                return createRecallResult();
              },
              async remember() {
                throw new Error("not used");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            } satisfies GoodMemory;
          }) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.applied).toBe(true);
      expect(result.reason).toBe("applied");
      expect(result.context).toContain("Developer memory notes");
      expect(result.output).toEqual({
        hookSpecificOutput: {
          additionalContext:
            "Developer memory notes:\nRunbook: docs/release-quality-runbook.md",
          hookEventName: "UserPromptSubmit",
        },
      });
      expect(calls.storage).toEqual({
        provider: "sqlite",
        url: join(homeRoot, ".goodmemory/memory.sqlite"),
      });
      expect(calls.recall).toEqual({
        query: "Check the release runbook before editing files.",
        retrievalProfile: "coding_agent",
        scope: {
          agentId: "codex",
          sessionId: "session-42",
          userId: "hook-user",
          workspaceId: "workspace-hook",
        },
      });
      expect(calls.buildContext).toEqual({
        maxTokens: 96,
        output: "developer_prompt_fragment",
      });
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("creates GoodMemory with installed provider adapters from host config", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-provider-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hook-provider-workspace-");
    const calls: {
      assistedExtractorConfigured?: boolean;
      embeddingAdapterConfigured?: boolean;
      storage?: GoodMemoryConfig["storage"];
    } = {};

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await mkdir(join(workspaceRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            debug: false,
            host: "codex",
            maxTokens: 320,
            providers: {
              assistedExtractor: {
                apiKey: "llm-secret",
                model: "claude-3-5-haiku-latest",
                provider: "anthropic",
              },
              embedding: {
                apiKey: "embedding-secret",
                model: "text-embedding-3-small",
                provider: "openai",
              },
            },
            retrievalProfile: "coding_agent",
            storage: {
              provider: "postgres",
              url: "postgres://postgres:secret@localhost:5432/goodmemory",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(workspaceRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            enabled: true,
            host: "codex",
            version: 1,
            workspaceId: "workspace-hook",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostHook(
        {
          command: "user-prompt-submit",
          host: "codex",
          homeRoot,
          payload: {
            cwd: workspaceRoot,
            prompt: "Check project memory.",
            session_id: "session-42",
          },
        },
        {
          createMemory: ((config: GoodMemoryConfig) => {
            calls.storage = config.storage;
            calls.assistedExtractorConfigured = Boolean(
              config.adapters?.assistedExtractor,
            );
            calls.embeddingAdapterConfigured = Boolean(
              config.adapters?.embeddingAdapter,
            );
            return {
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                return {
                  content: "Developer memory notes:\nProvider-backed memory is configured.",
                  estimatedTokens: 10,
                  omittedSections: [],
                  output: "developer_prompt_fragment",
                };
              },
              async recall() {
                return createRecallResult();
              },
              async remember() {
                throw new Error("not used");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            } satisfies GoodMemory;
          }) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.applied).toBe(true);
      expect(calls.storage).toEqual({
        provider: "postgres",
        url: "postgres://postgres:secret@localhost:5432/goodmemory",
      });
      expect(calls.assistedExtractorConfigured).toBe(true);
      expect(calls.embeddingAdapterConfigured).toBe(true);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("fails open with a debug systemMessage when the workspace is disabled", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-disabled-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hook-disabled-workspace-");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await mkdir(join(workspaceRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            debug: true,
            host: "codex",
            maxTokens: 320,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(workspaceRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            debug: true,
            enabled: false,
            host: "codex",
            version: 1,
            workspaceId: "workspace-hook",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostHook({
        command: "user-prompt-submit",
        host: "codex",
        homeRoot,
        payload: {
          cwd: workspaceRoot,
          prompt: "Check the release runbook before editing files.",
          session_id: "session-42",
        },
      });

      expect(result.applied).toBe(false);
      expect(result.reason).toBe("disabled");
      expect(result.context).toBeNull();
      expect(result.output).toEqual({
        systemMessage: "GoodMemory codex user-prompt-submit hook skipped: disabled.",
      });
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("uses global activation mode without a repo config and keeps prompt-submit recall read-only", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-global-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hook-global-workspace-");
    const rememberCalls: Array<{
      extractionStrategy?: string;
      message: string;
      scope: {
        agentId?: string;
        sessionId?: string;
        userId?: string;
        workspaceId?: string;
      };
    }> = [];

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            activationMode: "global",
            writeback: {
              mode: "selective",
            },
            debug: false,
            host: "codex",
            maxTokens: 320,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostHook(
        {
          command: "user-prompt-submit",
          host: "codex",
          homeRoot,
          payload: {
            cwd: workspaceRoot,
            prompt: "Always check the release runbook before editing files.",
            session_id: "session-42",
            turn_id: "turn-1",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                return {
                  content: "Developer memory notes:\nRelease runbook is canonical.",
                  estimatedTokens: 9,
                  omittedSections: [],
                  output: "developer_prompt_fragment",
                };
              },
              async recall() {
                return createRecallResult();
              },
              async remember(input) {
                rememberCalls.push({
                  extractionStrategy: input.extractionStrategy,
                  message: input.messages[0]?.content ?? "",
                  scope: input.scope,
                });
                return {
                  accepted: 1,
                  events: [],
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.applied).toBe(true);
      expect(result.writeback).toEqual({
        attempted: false,
        candidateCount: 0,
        reason: "source_disabled",
        wrote: false,
      });
      expect(rememberCalls).toHaveLength(0);
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("runs selective writeback for bounded stop-hook session signals without blocking output", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-stop-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hook-stop-workspace-");
    const rememberMessages: string[] = [];

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/claude.json"),
        JSON.stringify(
          {
            activationMode: "global",
            writeback: {
              mode: "selective",
            },
            debug: false,
            host: "claude",
            maxTokens: 128,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostHook(
        {
          command: "session-stop",
          host: "claude",
          homeRoot,
          payload: {
            cwd: workspaceRoot,
            messages: [
              { role: "user", content: "Remember to keep summaries short." },
              { role: "assistant", content: "I will keep coding summaries short." },
            ],
            session_id: "session-77",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember(input) {
                rememberMessages.push(input.messages[0]?.content ?? "");
                return {
                  accepted: 1,
                  events: [],
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.applied).toBe(false);
      expect(result.reason).toBe("writeback_written");
      expect(result.output).toBeNull();
      expect(result.writeback).toEqual({
        attempted: true,
        candidateCount: 1,
        mode: "selective",
        reason: "written",
        wrote: true,
      });
      expect(rememberMessages).toHaveLength(1);
      expect(rememberMessages[0]).toBe("Remember to keep summaries short.");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("dedupes concurrent writeback events under the ledger lock", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-stop-lock-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hook-stop-lock-workspace-");
    let rememberCallCount = 0;
    let releaseRemember: (() => void) | undefined;
    let markRememberEntered: (() => void) | undefined;
    const rememberEntered = new Promise<void>((resolve) => {
      markRememberEntered = resolve;
    });
    const rememberRelease = new Promise<void>((resolve) => {
      releaseRemember = resolve;
    });

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/claude.json"),
        JSON.stringify(
          {
            activationMode: "global",
            writeback: {
              mode: "selective",
            },
            debug: false,
            host: "claude",
            maxTokens: 128,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const dependencies = {
        createMemory: ((_: GoodMemoryConfig) =>
          ({
            jobs: createNoopGoodMemoryJobsFacade(),
            runtime: createNoopGoodMemoryRuntimeFacade(),
            async buildContext() {
              throw new Error("not used");
            },
            async recall() {
              throw new Error("not used");
            },
            async remember() {
              rememberCallCount += 1;
              markRememberEntered?.();
              await rememberRelease;
              return {
                accepted: 1,
                events: [],
                rejected: 0,
              };
            },
            async forget() {
              throw new Error("not used");
            },
            async exportMemory() {
              throw new Error("not used");
            },
            async deleteAllMemory() {
              throw new Error("not used");
            },
            async feedback() {
              throw new Error("not used");
            },
            async reviseMemory() {
              throw new Error("not used");
            },
            async runMaintenance() {
              throw new Error("not used");
            },
          }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
      };

      const firstRun = executeInstalledHostHook(
        {
          command: "session-stop",
          host: "claude",
          homeRoot,
          payload: {
            cwd: workspaceRoot,
            event_id: "stop-1",
            session_id: "session-77",
            summary: "Always keep summaries short.",
            summary_confirmed: true,
          },
        },
        dependencies,
      );
      await rememberEntered;

      const secondRun = executeInstalledHostHook(
        {
          command: "session-stop",
          host: "claude",
          homeRoot,
          payload: {
            cwd: workspaceRoot,
            event_id: "stop-1",
            session_id: "session-77",
            summary: "Always keep summaries short.",
            summary_confirmed: true,
          },
        },
        dependencies,
      );

      releaseRemember?.();

      const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);

      expect(rememberCallCount).toBe(1);
      expect([firstResult.writeback.reason, secondResult.writeback.reason].sort()).toEqual([
        "no_candidates",
        "written",
      ]);
    } finally {
      releaseRemember?.();
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("reports observe audit persistence failures as writeback failures", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-observe-audit-fail-home-");
    const workspaceRoot = await createWorkspace(
      "goodmemory-hook-observe-audit-fail-workspace-",
    );

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            activationMode: "global",
            writeback: {
              mode: "observe",
            },
            debug: false,
            host: "codex",
            maxTokens: 128,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await mkdir(join(homeRoot, ".goodmemory/codex-writeback-events.json"), {
        recursive: true,
      });

      const result = await executeInstalledHostHook({
        command: "session-stop",
        host: "codex",
        homeRoot,
        payload: {
          cwd: workspaceRoot,
          messages: [
            {
              content: "Always run typecheck before closing the phase.",
              role: "user",
            },
          ],
          session_id: "session-78",
        },
      });

      expect(result.reason).toBe("writeback_failed");
      expect(result.writeback).toEqual({
        attempted: true,
        candidateCount: 1,
        mode: "observe",
        reason: "failed",
        wrote: false,
      });
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("fails writeback closed when the ledger file is malformed", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-stop-ledger-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hook-stop-ledger-workspace-");
    let rememberCalled = false;

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/claude.json"),
        JSON.stringify(
          {
            activationMode: "global",
            writeback: {
              mode: "selective",
            },
            debug: false,
            host: "claude",
            maxTokens: 128,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(homeRoot, ".goodmemory/claude-writeback-events.json"),
        JSON.stringify({ events: "bad-ledger" }, null, 2) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostHook(
        {
          command: "session-stop",
          host: "claude",
          homeRoot,
          payload: {
            cwd: workspaceRoot,
            event_id: "stop-2",
            session_id: "session-78",
            summary: "Always keep summaries short.",
            summary_confirmed: true,
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                throw new Error("not used");
              },
              async recall() {
                throw new Error("not used");
              },
              async remember() {
                rememberCalled = true;
                return {
                  accepted: 1,
                  events: [],
                  rejected: 0,
                };
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(rememberCalled).toBe(false);
      expect(result.reason).toBe("writeback_failed");
      expect(result.writeback).toEqual({
        attempted: true,
        candidateCount: 1,
        mode: "selective",
        reason: "failed",
        wrote: false,
      });
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("uses a continuity query for session start", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-session-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hook-session-workspace-");
    let capturedQuery: string | undefined;

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await mkdir(join(workspaceRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/claude.json"),
        JSON.stringify(
          {
            debug: false,
            host: "claude",
            maxTokens: 128,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(workspaceRoot, ".goodmemory/claude.json"),
        JSON.stringify(
          {
            enabled: true,
            host: "claude",
            version: 1,
            workspaceId: "workspace-hook",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostHook(
        {
          command: "session-start",
          host: "claude",
          homeRoot,
          payload: {
            cwd: workspaceRoot,
            session_id: "session-99",
            source: "resume",
          },
        },
        {
          createMemory: ((_: GoodMemoryConfig) =>
            ({
              jobs: createNoopGoodMemoryJobsFacade(),
              runtime: createNoopGoodMemoryRuntimeFacade(),
              async buildContext() {
                return {
                  content: "Developer memory notes:\nResume active coding guidance.",
                  estimatedTokens: 10,
                  omittedSections: [],
                  output: "developer_prompt_fragment",
                };
              },
              async recall(input) {
                capturedQuery = input.query;
                return createRecallResult();
              },
              async remember() {
                throw new Error("not used");
              },
              async forget() {
                throw new Error("not used");
              },
              async exportMemory() {
                throw new Error("not used");
              },
              async deleteAllMemory() {
                throw new Error("not used");
              },
              async feedback() {
                throw new Error("not used");
              },
              async reviseMemory() {
                throw new Error("not used");
              },
              async runMaintenance() {
                throw new Error("not used");
              },
            }) satisfies GoodMemory) as (config: GoodMemoryConfig) => GoodMemory,
        },
      );

      expect(result.applied).toBe(true);
      expect(result.output).toEqual({
        hookSpecificOutput: {
          additionalContext:
            "Developer memory notes:\nResume active coding guidance.",
          hookEventName: "SessionStart",
        },
      });
      expect(capturedQuery).toContain("resume");
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("fails open when the repo opt-in config has malformed field types", async () => {
    const homeRoot = await createWorkspace("goodmemory-hook-invalid-home-");
    const workspaceRoot = await createWorkspace("goodmemory-hook-invalid-workspace-");

    try {
      await mkdir(join(homeRoot, ".goodmemory"), { recursive: true });
      await mkdir(join(workspaceRoot, ".goodmemory"), { recursive: true });
      await writeFile(
        join(homeRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            debug: true,
            host: "codex",
            maxTokens: 128,
            retrievalProfile: "coding_agent",
            storage: {
              path: join(homeRoot, ".goodmemory/memory.sqlite"),
              provider: "sqlite",
            },
            userId: "hook-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(workspaceRoot, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            enabled: "false",
            host: "codex",
            version: 1,
            workspaceId: "workspace-hook",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const result = await executeInstalledHostHook({
        command: "user-prompt-submit",
        host: "codex",
        homeRoot,
        payload: {
          cwd: workspaceRoot,
          prompt: "Check the release runbook before editing files.",
          session_id: "session-42",
        },
      });

      expect(result.applied).toBe(false);
      expect(result.reason).toBe("invalid_repo_config");
      expect(result.context).toBeNull();
      expect(result.output).toEqual({
        systemMessage: "GoodMemory codex user-prompt-submit hook skipped: invalid_repo_config.",
      });
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});
