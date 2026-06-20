import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import * as z from "zod/v4";
import type {
  BuildContextInput,
  GoodMemory,
  GoodMemoryConfig,
  RecallResult,
} from "../api/contracts";
import { scopeToKey, type MemoryScope } from "../domain/scope";
import { createHostAdapter } from "../host";
import {
  parseGoodMemoryRecordRef,
  type ProgressiveRecallService,
} from "../progressive/recall";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
  type InstalledHostContextDependencies,
  type InstalledHostContextInput,
  type InstalledHostResolvedContext,
} from "./hostExecutionContext";
import type { InstalledHostKind } from "./hostInstall";
import {
  createInstalledHostProgressiveRecallService,
  readInstalledHostProgressiveRecordCache,
  resolveInstalledHostProgressiveScopeDigest,
} from "./hostProgressiveRecall";

const DEFAULT_CONTEXT_OUTPUT: BuildContextInput["output"] =
  "developer_prompt_fragment";
const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);

let packageVersionCache: string | undefined;

function readPackageVersion(): string {
  if (packageVersionCache) {
    return packageVersionCache;
  }

  const packageJson = JSON.parse(
    readFileSync(PACKAGE_JSON_URL, "utf8"),
  ) as { version?: unknown };
  if (
    typeof packageJson.version !== "string" ||
    packageJson.version.length === 0
  ) {
    throw new Error("Unable to read GoodMemory package version.");
  }

  packageVersionCache = packageJson.version;
  return packageVersionCache;
}

export interface GoodMemoryMcpServerDependencies
  extends InstalledHostContextDependencies {
  createMemory?: (config: GoodMemoryConfig) => GoodMemory;
}

const TOOL_SCOPE_SCHEMA = {
  cwd: z.string().optional().describe("Workspace root. Defaults to the current working directory."),
  sessionId: z.string().optional().describe("Optional host session id for session-scoped recall."),
};

export async function serveGoodMemoryMcp(input: {
  dependencies?: GoodMemoryMcpServerDependencies;
  host: InstalledHostKind;
}): Promise<void> {
  const server = createGoodMemoryMcpServer({
    dependencies: input.dependencies,
    host: input.host,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await waitForTransportShutdown();
}

export function createGoodMemoryMcpServer(input: {
  dependencies?: GoodMemoryMcpServerDependencies;
  host: InstalledHostKind;
}): McpServer {
  const server = new McpServer({
    name: "goodmemory-mcp",
    version: readPackageVersion(),
  });
  const dependencies = input.dependencies ?? {};
  const progressiveServices = new Map<string, ProgressiveRecallService>();

  server.registerTool(
    "goodmemory_get_context",
    {
      description:
        "Use this when you need a compact GoodMemory context fragment for the current workspace and prompt.",
      inputSchema: {
        ...TOOL_SCOPE_SCHEMA,
        maxTokens: z.number().int().positive().optional(),
        output: z
          .enum(["json", "markdown", "system_prompt_fragment", "developer_prompt_fragment"])
          .optional(),
        query: z.string().min(1),
        retrievalProfile: z.enum(["coding_agent", "general_chat"]).optional(),
      },
    },
    async (args) => {
      const context = await loadInstalledHostExecutionContext(
        {
          cwd: args.cwd,
          host: input.host,
          maxTokens: args.maxTokens,
          retrievalProfile: args.retrievalProfile,
          sessionId: args.sessionId,
        },
        dependencies,
      );
      if ("error" in context) {
        return buildMcpErrorResult(context.error);
      }

      const recall = await context.memory.recall({
        query: args.query,
        retrievalProfile: context.retrievalProfile,
        scope: context.scope,
      });
      const built = await context.memory.buildContext({
        maxTokens: context.maxTokens,
        output: args.output ?? DEFAULT_CONTEXT_OUTPUT,
        recall,
      });
      return buildMcpStructuredResult({
        content: built.content,
        estimatedTokens: built.estimatedTokens,
        maxTokens: context.maxTokens,
        omittedSections: built.omittedSections,
        output: built.output,
        query: args.query,
        retrievalProfile: context.retrievalProfile,
        scope: context.scope,
      });
    },
  );

  server.registerTool(
    "goodmemory_inspect_memory",
    {
      description:
        "Use this when you need a read-only snapshot of durable and runtime GoodMemory state for the current workspace.",
      inputSchema: {
        ...TOOL_SCOPE_SCHEMA,
        includeRuntime: z.boolean().optional(),
      },
    },
    async (args) => {
      const context = await loadInstalledHostExecutionContext(
        {
          cwd: args.cwd,
          host: input.host,
          sessionId: args.sessionId,
        },
        dependencies,
      );
      if ("error" in context) {
        return buildMcpErrorResult(context.error);
      }

      const exported = await context.memory.exportMemory({
        includeRuntime: args.includeRuntime === true,
        scope: context.scope,
      });
      const structured = {
        durable: exported.durable,
        runtime: exported.runtime,
        scope: exported.scope,
      };
      return buildMcpStructuredResult(structured);
    },
  );

  server.registerTool(
    "goodmemory_trace_recall",
    {
      description:
        "Use this when you need the raw recall routing, hit, candidate, and verification trace for a prompt.",
      inputSchema: {
        ...TOOL_SCOPE_SCHEMA,
        query: z.string().min(1),
        retrievalProfile: z.enum(["coding_agent", "general_chat"]).optional(),
        strategy: z.enum(["auto", "rules-only", "hybrid", "llm-assisted"]).optional(),
      },
    },
    async (args) => {
      const context = await loadInstalledHostExecutionContext(
        {
          cwd: args.cwd,
          host: input.host,
          retrievalProfile: args.retrievalProfile,
          sessionId: args.sessionId,
        },
        dependencies,
      );
      if ("error" in context) {
        return buildMcpErrorResult(context.error);
      }

      const recall = await context.memory.recall({
        query: args.query,
        retrievalProfile: context.retrievalProfile,
        scope: context.scope,
        strategy: args.strategy,
      });
      return buildMcpStructuredResult(
        buildTraceRecallResult({
          query: args.query,
          recall,
          scope: context.scope,
        }),
      );
    },
  );

  server.registerTool(
    "goodmemory_search_index",
    {
      description:
        "Use this for progressive GoodMemory recall: first fetch a compact recordRef index before requesting details.",
      inputSchema: {
        ...TOOL_SCOPE_SCHEMA,
        includeRuntime: z.boolean().optional(),
        limit: z.number().int().positive().max(50).optional(),
        query: z.string().min(1),
        retrievalProfile: z.enum(["coding_agent", "general_chat"]).optional(),
      },
    },
    async (args) => {
      const context = await loadInstalledHostExecutionContext(
        {
          cwd: args.cwd,
          host: input.host,
          retrievalProfile: args.retrievalProfile,
          sessionId: args.sessionId,
        },
        dependencies,
      );
      if ("error" in context) {
        return buildMcpErrorResult(context.error);
      }

      const service = await getProgressiveRecallService(
        context,
        dependencies,
        progressiveServices,
      );
      const index = await service.searchRecallIndex({
        includeRuntime: args.includeRuntime === true,
        limit: args.limit,
        query: args.query,
        retrievalProfile: context.retrievalProfile,
        scope: context.scope,
      });
      return buildMcpStructuredResult({ ...index });
    },
  );

  server.registerTool(
    "goodmemory_timeline",
    {
      description:
        "Use this for progressive GoodMemory recall when you need compact chronological context before drilling into recordRefs.",
      inputSchema: {
        ...TOOL_SCOPE_SCHEMA,
        includeRuntime: z.boolean().optional(),
        limit: z.number().int().positive().max(50).optional(),
        query: z.string().min(1),
        recordsPerBucket: z.number().int().positive().max(20).optional(),
        retrievalProfile: z.enum(["coding_agent", "general_chat"]).optional(),
      },
    },
    async (args) => {
      const context = await loadInstalledHostExecutionContext(
        {
          cwd: args.cwd,
          host: input.host,
          retrievalProfile: args.retrievalProfile,
          sessionId: args.sessionId,
        },
        dependencies,
      );
      if ("error" in context) {
        return buildMcpErrorResult(context.error);
      }

      const service = await getProgressiveRecallService(
        context,
        dependencies,
        progressiveServices,
      );
      const timeline = await service.buildRecallTimeline({
        includeRuntime: args.includeRuntime === true,
        limit: args.limit,
        query: args.query,
        recordsPerBucket: args.recordsPerBucket,
        retrievalProfile: context.retrievalProfile,
        scope: context.scope,
      });
      return buildMcpStructuredResult({ ...timeline });
    },
  );

  server.registerTool(
    "goodmemory_get_records",
    {
      description:
        "Use this for progressive GoodMemory recall after search_index or timeline returns recordRefs that need detail.",
      inputSchema: {
        ...TOOL_SCOPE_SCHEMA,
        recordRefs: z.array(z.string().min(1)).min(1).max(20),
      },
    },
    async (args) => {
      const context = await loadInstalledHostExecutionContext(
        {
          cwd: args.cwd,
          host: input.host,
          sessionId: args.sessionId,
        },
        dependencies,
      );
      if ("error" in context) {
        return buildMcpErrorResult(context.error);
      }

      const service = await getProgressiveRecallService(
        context,
        dependencies,
        progressiveServices,
      );
      try {
        const records = await service.getProgressiveRecords({
          recordRefs: args.recordRefs,
          scope: context.scope,
        });
        return buildMcpStructuredResult({ ...records });
      } catch (error) {
        const fallbackScopeDigest = await resolveCacheFallbackScopeDigest({
          context,
          error,
          recordRefs: args.recordRefs,
        });
        if (fallbackScopeDigest) {
          const cachedRecords = await readInstalledHostProgressiveRecordCache({
            host: input.host,
            recordRefs: args.recordRefs,
            scopeDigest: fallbackScopeDigest,
          }).catch(() => []);
          if (cachedRecords.length === args.recordRefs.length) {
            return buildMcpStructuredResult({
              records: cachedRecords,
              scopeDigest: fallbackScopeDigest,
            });
          }
        }
        return buildMcpErrorResult(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  );

  server.registerTool(
    "goodmemory_read_artifacts",
    {
      description:
        "Use this when you need the accepted host-adapter artifact projection for the current workspace.",
      inputSchema: {
        ...TOOL_SCOPE_SCHEMA,
        includeRuntime: z.boolean().optional(),
      },
    },
    async (args) => {
      const context = await loadInstalledHostExecutionContext(
        {
          cwd: args.cwd,
          host: input.host,
          sessionId: args.sessionId,
        },
        dependencies,
      );
      if ("error" in context) {
        return buildMcpErrorResult(context.error);
      }

      const adapter = createHostAdapter({
        hostKind: input.host,
        id: "goodmemory-mcp",
        memory: context.memory,
      });
      const artifacts = await adapter.readArtifacts({
        includeRuntime: args.includeRuntime === true,
        scope: context.scope,
      });
      return buildMcpStructuredResult({
        artifacts: artifacts.artifacts,
        exportedAt: artifacts.exportedAt,
        rootPath: artifacts.rootPath,
        scope: artifacts.scope,
      });
    },
  );

  server.registerTool(
    "goodmemory_stats",
    {
      description:
        "Use this when you need stable record counts and runtime metadata for the current installed GoodMemory scope.",
      inputSchema: {
        ...TOOL_SCOPE_SCHEMA,
        includeRuntime: z.boolean().optional(),
      },
    },
    async (args) => {
      const context = await loadInstalledHostExecutionContext(
        {
          cwd: args.cwd,
          host: input.host,
          sessionId: args.sessionId,
        },
        dependencies,
      );
      if ("error" in context) {
        return buildMcpErrorResult(context.error);
      }

      const exported = await context.memory.exportMemory({
        includeRuntime: args.includeRuntime === true,
        scope: context.scope,
      });
      return buildMcpStructuredResult({
        counts: {
          archives: exported.durable.archives.length,
          episodes: exported.durable.episodes.length,
          evidence: exported.durable.evidence.length,
          experiences: exported.durable.experiences.length,
          facts: exported.durable.facts.length,
          feedback: exported.durable.feedback.length,
          preferences: exported.durable.preferences.length,
          profile: exported.durable.profile ? 1 : 0,
          promotions: exported.durable.promotions.length,
          proposals: exported.durable.proposals.length,
          references: exported.durable.references.length,
        },
        runtime: exported.runtime
          ? {
              journal: exported.runtime.journal ? 1 : 0,
              spills: exported.runtime.spills.length,
              workingMemory: exported.runtime.workingMemory ? 1 : 0,
            }
          : null,
        scope: exported.scope,
      });
    },
  );

  return server;
}

async function getProgressiveRecallService(
  context: InstalledHostResolvedContext,
  dependencies: InstalledHostContextDependencies,
  cache: Map<string, ProgressiveRecallService>,
): Promise<ProgressiveRecallService> {
  const cacheKey = [
    context.host,
    context.workspaceRoot,
    context.storage?.provider ?? "",
    context.storage?.url ?? "",
    scopeToKey(context.scope),
  ].join("\n");
  const existing = cache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const service = await createInstalledHostProgressiveRecallService({
    context,
    dependencies,
  });
  cache.set(cacheKey, service);
  return service;
}

async function resolveCacheFallbackScopeDigest(input: {
  context: InstalledHostResolvedContext;
  error: unknown;
  recordRefs: string[];
}): Promise<string | null> {
  if (!isProgressiveVisibilityMissError(input.error)) {
    return null;
  }

  const parsedRefs = input.recordRefs.map((recordRef) =>
    parseGoodMemoryRecordRef(recordRef),
  );
  if (parsedRefs.some((parsed) => parsed === null)) {
    return null;
  }

  const scopeDigests = new Set(parsedRefs.map((parsed) => parsed!.scopeDigest));
  if (scopeDigests.size !== 1) {
    return null;
  }

  const expectedScopeDigest = await resolveInstalledHostProgressiveScopeDigest({
    context: input.context,
  });
  const requestedScopeDigest = Array.from(scopeDigests)[0]!;
  return requestedScopeDigest === expectedScopeDigest
    ? requestedScopeDigest
    : null;
}

function isProgressiveVisibilityMissError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(
      "is not available in the current progressive recall visibility set",
    )
  );
}

async function loadInstalledHostExecutionContext(
  input: InstalledHostContextInput,
  dependencies: InstalledHostContextDependencies,
): Promise<
  | (InstalledHostResolvedContext & { memory: GoodMemory })
  | { error: string }
> {
  const resolved = await resolveInstalledHostContext(
    input,
    dependencies,
  );
  if (resolved.status !== "ok") {
    return {
      error: `GoodMemory ${input.host} context is unavailable: ${resolved.status}.`,
    };
  }
  return {
    ...resolved.context,
    memory: createInstalledHostMemory(resolved.context, dependencies),
  };
}

function buildTraceRecallResult(input: {
  query: string;
  recall: RecallResult;
  scope: MemoryScope;
}): Record<string, unknown> {
  return {
    candidateTraceCount: input.recall.metadata.candidateTraces.length,
    candidateTraces: input.recall.metadata.candidateTraces,
    hits: input.recall.metadata.hits,
    policyApplied: input.recall.metadata.policyApplied,
    query: input.query,
    routingDecision: input.recall.metadata.routingDecision,
    scope: input.scope,
    verificationHints: input.recall.metadata.verificationHints,
  };
}

function buildMcpStructuredResult<T extends object>(
  structuredContent: T,
): {
  content: Array<{ text: string; type: "text" }>;
  structuredContent: T;
} {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

function buildMcpErrorResult(error: string): {
  content: Array<{ text: string; type: "text" }>;
  isError: true;
  structuredContent: { error: string };
} {
  return {
    content: [
      {
        type: "text",
        text: error,
      },
    ],
    isError: true,
    structuredContent: {
      error,
    },
  };
}

function waitForTransportShutdown(): Promise<void> {
  if (process.stdin.destroyed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    process.stdin.once("close", finish);
    process.stdin.once("end", finish);
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
  });
}
