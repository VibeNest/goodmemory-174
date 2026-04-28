import { describe, expect, it } from "bun:test";
import type {
  BuildContextInput,
  ExportMemoryInput,
  ExportMemoryResult,
  GoodMemory,
  RecallInput,
  RecallResult,
} from "../../src/api/contracts";
import type { GoodMemoryMcpServerDependencies } from "../../src/install/hostMcpServer";
import { createGoodMemoryMcpServer } from "../../src/install/hostMcpServer";

interface RegisteredMcpTool {
  description?: string;
  handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
  inputSchema?: Record<string, unknown>;
}

interface InspectableMcpServer {
  _registeredTools: Record<string, RegisteredMcpTool>;
  server: {
    _serverInfo: {
      name: string;
      version: string;
    };
  };
}

interface McpToolResult {
  content: Array<{ text: string; type: "text" }>;
  isError?: true;
  structuredContent?: Record<string, unknown>;
}

const WORKSPACE_ROOT = "/tmp/goodmemory-mcp-direct-workspace";

function inspectServer(server: object): InspectableMcpServer {
  return server as unknown as InspectableMcpServer;
}

function missingFile(path: string): Error & { code: "ENOENT" } {
  return Object.assign(new Error(`missing ${path}`), { code: "ENOENT" as const });
}

function createRuntimeConfig(): string {
  return JSON.stringify({
    activationMode: "global",
    host: "codex",
    maxTokens: 64,
    retrievalProfile: "coding_agent",
    storage: {
      provider: "memory",
      url: "memory://mcp-direct",
    },
    userId: "mcp-user",
    version: 1,
    writeback: {
      allowAssistantOutput: "confirmed_or_verified",
      dryRun: false,
      maxChars: 12_000,
      maxMessages: 12,
      minConfidence: 0.7,
      mode: "off",
      persistRawTranscript: false,
    },
  });
}

function createWorkspaceConfig(): string {
  return JSON.stringify({
    enabled: true,
    host: "codex",
    workspaceId: "mcp-workspace",
  });
}

function createFakeMemory(): GoodMemory {
  const scope = {
    agentId: "codex",
    sessionId: "session-1",
    userId: "mcp-user",
    workspaceId: "mcp-workspace",
  };
  const recall = {
    metadata: {
      candidateTraces: [
        {
          candidateId: "fact-1",
          reasons: ["keyword_overlap"],
          score: 1,
          selected: true,
        },
      ],
      hits: [],
      policyApplied: ["allow"],
      routingDecision: {
        profile: "coding_agent",
        strategy: "rules-only",
      },
      verificationHints: [],
    },
    memories: [],
  } as unknown as RecallResult;
  const exported: ExportMemoryResult = {
    artifacts: {
      files: [
        {
          content: "# Memory\n\n- Release runbook is current.",
          kind: "memory",
          relativePath: "MEMORY.md",
        },
      ],
      rootPath: WORKSPACE_ROOT,
    },
    durable: {
      archives: [],
      episodes: [],
      evidence: [],
      experiences: [],
      facts: [],
      feedback: [],
      preferences: [],
      profile: null,
      promotions: [],
      proposals: [],
      references: [],
    },
    exportedAt: "2026-04-27T00:00:00.000Z",
    runtime: {
      journal: null,
      spills: [],
      workingMemory: null,
    },
    scope,
  };

  return {
    buildContext: async (input: BuildContextInput) => ({
      content: "Developer memory notes:\n- Release runbook is current.",
      estimatedTokens: 9,
      omittedSections: [],
      output: input.output ?? "developer_prompt_fragment",
    }),
    exportMemory: async (input: ExportMemoryInput) => ({
      ...exported,
      runtime: input.includeRuntime === true ? exported.runtime : undefined,
      scope: input.scope,
    }),
    recall: async (input: RecallInput) => ({
      ...recall,
      metadata: {
        ...recall.metadata,
        routingDecision: {
          profile: input.retrievalProfile ?? "coding_agent",
          strategy: input.strategy ?? "rules-only",
        },
      },
    }),
  } as unknown as GoodMemory;
}

function createDependencies(memory = createFakeMemory()): GoodMemoryMcpServerDependencies {
  return {
    createMemory: () => memory,
    readFile: async (path) => {
      if (path === `${WORKSPACE_ROOT}/.goodmemory/codex.json`) {
        return createWorkspaceConfig();
      }
      if (path.endsWith("/.goodmemory/codex.json")) {
        return createRuntimeConfig();
      }
      throw missingFile(path);
    },
  };
}

describe("goodmemory mcp server direct handlers", () => {
  it("registers the stable read-only tool surface in-process", () => {
    const server = inspectServer(
      createGoodMemoryMcpServer({
        dependencies: createDependencies(),
        host: "codex",
      }),
    );

    expect(server.server._serverInfo.name).toBe("goodmemory-mcp");
    expect(server.server._serverInfo.version).toBe("0.2.2");
    expect(Object.keys(server._registeredTools).sort()).toEqual([
      "goodmemory_get_context",
      "goodmemory_get_records",
      "goodmemory_inspect_memory",
      "goodmemory_read_artifacts",
      "goodmemory_search_index",
      "goodmemory_stats",
      "goodmemory_timeline",
      "goodmemory_trace_recall",
    ]);
    expect(server._registeredTools.goodmemory_get_records?.description).toContain(
      "progressive GoodMemory recall",
    );
  });

  it("serves non-mutating context, trace, artifact, and stats results from installed host memory", async () => {
    const server = inspectServer(
      createGoodMemoryMcpServer({
        dependencies: createDependencies(),
        host: "codex",
      }),
    );

    const context = await server._registeredTools.goodmemory_get_context!.handler({
      cwd: WORKSPACE_ROOT,
      query: "release runbook",
    });
    expect(context.structuredContent?.content).toContain("Release runbook");
    expect(context.structuredContent?.maxTokens).toBe(64);

    const trace = await server._registeredTools.goodmemory_trace_recall!.handler({
      cwd: WORKSPACE_ROOT,
      query: "release runbook",
      strategy: "rules-only",
    });
    expect(trace.structuredContent?.candidateTraceCount).toBe(1);
    expect(trace.structuredContent?.policyApplied).toEqual(["allow"]);

    const inspected = await server._registeredTools.goodmemory_inspect_memory!.handler({
      cwd: WORKSPACE_ROOT,
      includeRuntime: true,
    });
    expect(inspected.structuredContent?.runtime).toEqual({
      journal: null,
      spills: [],
      workingMemory: null,
    });

    const artifacts = await server._registeredTools.goodmemory_read_artifacts!.handler({
      cwd: WORKSPACE_ROOT,
    });
    expect(artifacts.structuredContent?.rootPath).toBe(WORKSPACE_ROOT);
    expect(JSON.stringify(artifacts.structuredContent?.artifacts)).toContain(
      "MEMORY.md",
    );

    const stats = await server._registeredTools.goodmemory_stats!.handler({
      cwd: WORKSPACE_ROOT,
      includeRuntime: true,
    });
    expect(stats.structuredContent?.counts).toMatchObject({
      facts: 0,
      profile: 0,
    });
    expect(stats.structuredContent?.runtime).toEqual({
      journal: 0,
      spills: 0,
      workingMemory: 0,
    });
  });

  it("returns structured errors instead of throwing when installed context is unavailable", async () => {
    const server = inspectServer(
      createGoodMemoryMcpServer({
        dependencies: {
          readFile: async (path) => {
            throw missingFile(path);
          },
        },
        host: "codex",
      }),
    );

    const result = await server._registeredTools.goodmemory_search_index!.handler({
      cwd: WORKSPACE_ROOT,
      query: "release runbook",
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toBe(
      "GoodMemory codex context is unavailable: missing_global_config.",
    );
  });
});
