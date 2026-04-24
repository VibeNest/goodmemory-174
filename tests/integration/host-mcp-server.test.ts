import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createFactMemory,
  createFeedbackMemory,
  createGoodMemory,
  createReferenceMemory,
  createSQLiteDocumentStore,
  createSQLiteSessionStore,
  createUserProfile,
} from "../../src";
import { createHostAdapter } from "../../src/host";
import { createMemorySource } from "../../src/domain/provenance";
import { createInMemoryVectorStore } from "../../src/storage/memory";
import { createMemoryRepositories } from "../../src/storage/repositories";
import { createTempWorkspace } from "../../src/testing/utils";

function createChildEnv(
  overrides: Record<string, string | undefined>,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return env;
}

async function seedSQLiteMemory(sqlitePath: string) {
  await mkdir(dirname(sqlitePath), { recursive: true });
  const documentStore = createSQLiteDocumentStore(sqlitePath);
  const sessionStore = createSQLiteSessionStore(sqlitePath);
  const vectorStore = createInMemoryVectorStore();
  const memory = createGoodMemory({
    adapters: {
      documentStore,
      sessionStore,
      vectorStore,
    },
    storage: {
      provider: "sqlite",
      url: sqlitePath,
    },
  });
  const repositories = createMemoryRepositories({
    documentStore,
    sessionStore,
    vectorStore,
  });
  const scope = {
    agentId: "codex",
    sessionId: "session-1",
    userId: "cli-user",
    workspaceId: "workspace-a",
  };
  const timestamp = "2026-01-01T00:00:00.000Z";
  const source = createMemorySource({
    extractedAt: timestamp,
    method: "explicit",
    sessionId: scope.sessionId,
  });

  await repositories.profiles.upsert(
    createUserProfile({
      activeContext: {
        currentProjects: ["release quality program"],
        goals: [],
      },
      createdAt: timestamp,
      identity: {
        location: "Austin, USA",
        name: "Felix",
        role: "climate policy advisor",
      },
      updatedAt: timestamp,
      userId: scope.userId,
    }),
  );
  await repositories.facts.add(
    createFactMemory({
      category: "project",
      content:
        "The current blocker is vendor approval for release quality program.",
      agentId: scope.agentId,
      createdAt: timestamp,
      id: "fact-blocker",
      sessionId: scope.sessionId,
      source,
      updatedAt: timestamp,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    }),
  );
  await repositories.references.add(
    createReferenceMemory({
      createdAt: timestamp,
      id: "ref-runbook",
      agentId: scope.agentId,
      pointer: "docs/release-quality-runbook.md",
      sessionId: scope.sessionId,
      source,
      title: "release-quality-runbook.md",
      updatedAt: timestamp,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    }),
  );
  await repositories.feedback.upsert(
    createFeedbackMemory({
      id: "feedback-style",
      agentId: scope.agentId,
      kind: "do",
      rule: "Use concise bullet points in summaries.",
      sessionId: scope.sessionId,
      source,
      updatedAt: timestamp,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    }),
  );

  return {
    memory,
    scope,
  };
}

describe("goodmemory mcp server", () => {
  it("exposes the documented read-only tools and matches public API output", async () => {
    const home = await createTempWorkspace("goodmemory-mcp-home");
    const workspace = await createTempWorkspace("goodmemory-mcp-workspace");
    const sqlitePath = join(home.root, ".goodmemory", "memory.sqlite");
    const mcpScript = join(import.meta.dir, "../../scripts/goodmemory-mcp.ts");
    let transport: StdioClientTransport | null = null;

    try {
      await mkdir(join(home.root, ".goodmemory"), { recursive: true });
      await mkdir(join(workspace.root, ".goodmemory"), { recursive: true });
      await writeFile(
        join(home.root, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            debug: false,
            host: "codex",
            maxTokens: 96,
            retrievalProfile: "coding_agent",
            storage: {
              path: sqlitePath,
              provider: "sqlite",
            },
            userId: "cli-user",
            version: 1,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      await writeFile(
        join(workspace.root, ".goodmemory/codex.json"),
        JSON.stringify(
          {
            enabled: true,
            host: "codex",
            version: 1,
            workspaceId: "workspace-a",
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );

      const seeded = await seedSQLiteMemory(sqlitePath);
      const installedScope = seeded.scope;
      const directRecall = await seeded.memory.recall({
        query: "Check the release runbook before editing files.",
        retrievalProfile: "coding_agent",
        scope: installedScope,
      });
      const directContext = await seeded.memory.buildContext({
        maxTokens: 96,
        output: "developer_prompt_fragment",
        recall: directRecall,
      });

      transport = new StdioClientTransport({
        args: [mcpScript, "--host", "codex"],
        command: "bun",
        cwd: workspace.root,
        env: createChildEnv({
          GOODMEMORY_HOME: home.root,
        }),
        stderr: "pipe",
      });

      const client = new Client(
        {
          name: "goodmemory-mcp-test-client",
          version: "0.0.0",
        },
        {
          capabilities: {},
        },
      );
      await client.connect(transport);
      const packageJson = JSON.parse(
        await readFile(join(import.meta.dir, "../../package.json"), "utf8"),
      ) as { version?: string };
      if (
        typeof packageJson.version !== "string" ||
        packageJson.version.length === 0
      ) {
        throw new Error("package.json must define a non-empty version.");
      }

      expect(client.getServerVersion()).toEqual({
        name: "goodmemory-mcp",
        version: packageJson.version,
      });

      const listedTools = await client.listTools();
      expect(listedTools.tools.map((tool) => tool.name).sort()).toEqual([
        "goodmemory_get_context",
        "goodmemory_inspect_memory",
        "goodmemory_read_artifacts",
        "goodmemory_stats",
        "goodmemory_trace_recall",
      ]);

      const contextResult = await client.callTool({
        arguments: {
          cwd: workspace.root,
          query: "Check the release runbook before editing files.",
          sessionId: "session-1",
        },
        name: "goodmemory_get_context",
      });
      expect(contextResult.structuredContent).toMatchObject({
        content: directContext.content,
        maxTokens: 96,
        omittedSections: directContext.omittedSections,
        output: directContext.output,
        query: "Check the release runbook before editing files.",
        retrievalProfile: "coding_agent",
        scope: installedScope,
      });
      expect(contextResult.structuredContent).toHaveProperty("estimatedTokens");

      const inspectResult = await client.callTool({
        arguments: {
          cwd: workspace.root,
          sessionId: "session-1",
        },
        name: "goodmemory_inspect_memory",
      });
      expect(inspectResult.structuredContent).toMatchObject({
        durable: {
          facts: [expect.objectContaining({ id: "fact-blocker" })],
          feedback: [expect.objectContaining({ id: "feedback-style" })],
          references: [expect.objectContaining({ id: "ref-runbook" })],
        },
        scope: installedScope,
      });

      const traceResult = await client.callTool({
        arguments: {
          cwd: workspace.root,
          query: "Check the release runbook before editing files.",
          sessionId: "session-1",
        },
        name: "goodmemory_trace_recall",
      });
      expect(traceResult.structuredContent).toMatchObject({
        query: "Check the release runbook before editing files.",
        scope: installedScope,
      });

      const artifactsResult = await client.callTool({
        arguments: {
          cwd: workspace.root,
          sessionId: "session-1",
        },
        name: "goodmemory_read_artifacts",
      });
      const directArtifacts = await createHostAdapter({
        hostKind: "codex",
        id: "goodmemory-mcp-test",
        memory: seeded.memory,
      }).readArtifacts({
        scope: installedScope,
      });
      expect(artifactsResult.structuredContent).toMatchObject({
        artifacts: directArtifacts.artifacts,
        rootPath: directArtifacts.rootPath,
        scope: directArtifacts.scope,
      });
      expect(artifactsResult.structuredContent).toHaveProperty("exportedAt");

      const statsResult = await client.callTool({
        arguments: {
          cwd: workspace.root,
          sessionId: "session-1",
        },
        name: "goodmemory_stats",
      });
      expect(statsResult.structuredContent).toMatchObject({
        runtime: null,
        scope: installedScope,
      });
      expect(statsResult.structuredContent).toHaveProperty("counts.facts", 1);
      expect(statsResult.structuredContent).toHaveProperty("counts.feedback", 1);
      expect(statsResult.structuredContent).toHaveProperty("counts.references", 1);
    } finally {
      if (transport) {
        await transport.close();
      }
      await workspace.cleanup();
      await home.cleanup();
    }
  });
});
