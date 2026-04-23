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
      expect(result.output).toBeNull();
    } finally {
      await rm(homeRoot, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});
