import { describe, expect, it } from "bun:test";
import type { GoodMemory } from "../../src";
import { createGoodMemory } from "../../src";
import {
  createGoodMemoryHttpMemoryBridge,
  createLifeCoachHttpRememberConfig,
  toOneLifeMemoryContextResponse,
} from "../../src/http";

const AUTH_HEADERS = {
  "x-goodmemory-user-id": "python-user",
  "x-goodmemory-workspace-id": "life-workspace",
  "x-goodmemory-operations": "recall-context,remember,feedback,export,forget,revise",
};

function scopedBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scope: {
      userId: "python-user",
      workspaceId: "life-workspace",
      agentId: "life-coach",
      sessionId: "session-1",
    },
    ...extra,
  };
}

async function runGoodMemoryHttpBridgeRequest(input: {
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  memory: GoodMemory;
  path: string;
}) {
  const bridge = createGoodMemoryHttpMemoryBridge({ memory: input.memory });
  const request = new Request(`http://localhost${input.path}`, {
    body: JSON.stringify(input.body),
    headers: {
      "content-type": "application/json",
      ...input.headers,
    },
    method: "POST",
  });

  return bridge.handle(request);
}

function allocateBridgePort(): number {
  const server = Bun.serve({
    fetch: () => new Response("ok"),
    port: 0,
  });
  const port = server.port;
  server.stop(true);
  if (port === undefined) {
    throw new Error("Bun did not allocate a bridge test port.");
  }

  return port;
}

async function waitForBridgeReady(input: {
  token: string;
  url: string;
}): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${input.url}/memory/recall-context`, {
        body: JSON.stringify(
          scopedBody({
            query: "health check",
          }),
        ),
        headers: {
          ...AUTH_HEADERS,
          authorization: `Bearer ${input.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (response.status === 200) {
        await response.arrayBuffer();
        return;
      }

      lastError = new Error(`Bridge returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await Bun.sleep(50);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("GoodMemory HTTP bridge did not become ready.");
}

describe("Phase 39 Python HTTP memory bridge", () => {
  it("validates scope, caller authorization, and targeted-only revise requests at the HTTP boundary", async () => {
    const memory = createGoodMemory({ storage: { provider: "memory" } });

    const malformed = await runGoodMemoryHttpBridgeRequest({
      body: {
        scope: { workspaceId: "life-workspace" },
        query: "What should I remember?",
      },
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/recall-context",
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).toMatchObject({
      error: {
        code: "invalid_scope",
      },
      ok: false,
    });

    const unauthorizedExport = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody(),
      headers: {
        "x-goodmemory-user-id": "python-user",
        "x-goodmemory-workspace-id": "life-workspace",
      },
      memory,
      path: "/memory/export",
    });
    expect(unauthorizedExport.statusCode).toBe(403);
    expect(unauthorizedExport.body).toMatchObject({
      error: {
        code: "operation_not_authorized",
      },
      ok: false,
    });

    await memory.remember({
      messages: [
        {
          content: "Remember that workspace-b private goal must stay scoped.",
          role: "user",
        },
      ],
      scope: {
        userId: "python-user",
        workspaceId: "workspace-b",
      },
    });
    const workspaceBExport = await memory.exportMemory({
      scope: {
        userId: "python-user",
        workspaceId: "workspace-b",
      },
    });
    const workspaceBMemoryId = workspaceBExport.durable.facts[0]?.id;
    expect(workspaceBMemoryId).toBeString();

    const broadenedExport = await runGoodMemoryHttpBridgeRequest({
      body: {
        scope: { userId: "python-user" },
      },
      headers: {
        "x-goodmemory-user-id": "python-user",
        "x-goodmemory-workspace-id": "workspace-a",
        "x-goodmemory-operations": "export",
      },
      memory,
      path: "/memory/export",
    });
    expect(broadenedExport.statusCode).toBe(403);
    expect(broadenedExport.body).toMatchObject({
      error: {
        code: "scope_not_authorized",
      },
      ok: false,
    });

    const broadenedForget = await runGoodMemoryHttpBridgeRequest({
      body: {
        memoryId: workspaceBMemoryId,
        scope: { userId: "python-user" },
      },
      headers: {
        "x-goodmemory-user-id": "python-user",
        "x-goodmemory-workspace-id": "workspace-a",
        "x-goodmemory-operations": "forget",
      },
      memory,
      path: "/memory/forget",
    });
    expect(broadenedForget.statusCode).toBe(403);
    expect(broadenedForget.body).toMatchObject({
      error: {
        code: "scope_not_authorized",
      },
      ok: false,
    });

    const malformedOptionalScope = await runGoodMemoryHttpBridgeRequest({
      body: {
        scope: {
          userId: "python-user",
          workspaceId: 123,
        },
      },
      headers: {
        "x-goodmemory-user-id": "python-user",
        "x-goodmemory-operations": "export",
      },
      memory,
      path: "/memory/export",
    });
    expect(malformedOptionalScope.statusCode).toBe(400);
    expect(malformedOptionalScope.body).toMatchObject({
      error: {
        code: "invalid_scope",
      },
      ok: false,
    });

    const malformedAnnotation = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody({
        annotations: [
          {
            messageIndex: "0",
            remember: "always",
          },
        ],
        messages: [
          {
            content: "Remember that malformed annotations should be rejected.",
            role: "user",
          },
        ],
        mode: "sync",
      }),
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/remember",
    });
    expect(malformedAnnotation.statusCode).toBe(400);
    expect(malformedAnnotation.body).toMatchObject({
      error: {
        code: "invalid_annotations",
      },
      ok: false,
    });

    const queryResolvedRevise = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody({
        evidence: {
          message: "Actually, correct the sleep goal.",
          source: "user_message",
        },
        idempotencyKey: "revise-query-target",
        reason: "user_correction",
        revision: { content: "The visible goal is rebuilding my sleep routine." },
        target: { query: "sleep goal" },
      }),
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/revise",
    });
    expect(queryResolvedRevise.statusCode).toBe(400);
    expect(queryResolvedRevise.body).toMatchObject({
      error: {
        code: "target_memory_id_required",
      },
      ok: false,
    });
  });

  it("serves prompt-ready recall context plus compact structured items for a OneLife-style backend", async () => {
    const memory = createGoodMemory({
      remember: createLifeCoachHttpRememberConfig(),
      storage: { provider: "memory" },
    });

    const remember = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody({
        idempotencyKey: "turn-1",
        messages: [
          {
            content:
              "My top priority this quarter is rebuilding my sleep routine.",
            role: "user",
          },
        ],
        annotations: [
          {
            confirmed: true,
            messageIndex: 0,
            metadataPatch: {
              category: "project",
              tags: ["coach"],
            },
            remember: "always",
          },
        ],
        mode: "sync",
      }),
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/remember",
    });
    expect(remember.statusCode).toBe(200);
    expect(remember.body).toMatchObject({
      idempotency: {
        handledBy: "consumer_provenance_only",
        key: "turn-1",
      },
      mode: "sync",
      ok: true,
    });

    const recall = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody({
        query: "What is my quarterly priority?",
      }),
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/recall-context",
    });

    expect(recall.statusCode).toBe(200);
    expect(recall.body).toMatchObject({
      hasContext: true,
      ok: true,
      operation: "recall-context",
    });
    expect(recall.body.contextText).toContain("rebuilding my sleep routine");
    expect(recall.body.itemCount).toBeGreaterThanOrEqual(1);
    expect(recall.body.items).toBeArray();
    const oneLife = toOneLifeMemoryContextResponse(recall.body);
    const recallItems = recall.body.items ?? [];

    expect(recallItems[0]).toMatchObject({
      memoryId: expect.any(String),
      source: "goodmemory",
      type: "fact",
    });
    expect(oneLife.context).toContain("rebuilding my sleep routine");
    expect(oneLife.memories[0]).toMatchObject({
      id: expect.any(String),
      source: "goodmemory-http-bridge",
    });
    expect(oneLife.metadata).toMatchObject({
      hasContext: true,
      itemCount: recall.body.itemCount,
      policyBoundary: "product_owned",
    });
  });

  it("routes async remember through memory.jobs without widening the root remember input", async () => {
    const memory = createGoodMemory({ storage: { provider: "memory" } });

    const asyncRemember = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody({
        idempotencyKey: "async-turn-1",
        messages: [
          {
            content:
              "Remember that the next coaching session should revisit the sleep experiment.",
            role: "user",
          },
        ],
        mode: "async",
      }),
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/remember",
    });

    expect(asyncRemember.statusCode).toBe(200);
    expect(asyncRemember.body).toMatchObject({
      idempotency: {
        handledBy: "goodmemory_jobs",
        key: "async-turn-1",
      },
      mode: "async",
      ok: true,
    });
    expect(asyncRemember.body.job).toMatchObject({
      idempotencyKey: "async-turn-1",
      operation: "remember",
      status: "queued",
    });

    const drained = await memory.jobs.drain({ maxJobs: 1 });
    expect(drained.jobs[0]?.status).toBe("succeeded");
  });

  it("keeps feedback procedural, export runtime off by default, forget scoped, and revise targeted by memoryId", async () => {
    const memory = createGoodMemory({ storage: { provider: "memory" } });
    const seed = await memory.remember({
      messages: [
        {
          content: "Remember that I prefer weekly planning prompts.",
          role: "user",
        },
      ],
      scope: {
        userId: "python-user",
        workspaceId: "life-workspace",
        agentId: "life-coach",
        sessionId: "session-1",
      },
    });
    const targetMemoryId = seed.events.find(
      (event) => event.memoryType === "preference",
    )?.memoryId;
    expect(targetMemoryId).toBeString();

    const feedback = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody({
        idempotencyKey: "feedback-1",
        signal: "Use checklist summaries after coaching sessions.",
        source: {
          eventId: "coach-review-1",
          system: "onelife",
        },
      }),
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/feedback",
    });
    expect(feedback.statusCode).toBe(200);
    expect(feedback.body).toMatchObject({
      idempotency: {
        handledBy: "consumer_provenance_only",
        key: "feedback-1",
      },
      ok: true,
      provenance: {
        eventId: "coach-review-1",
        system: "onelife",
      },
    });

    const exported = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody(),
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/export",
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.body.includeRuntime).toBe(false);
    expect(exported.body.exported).toBeDefined();
    expect(exported.body.exported?.runtime).toBeUndefined();

    const revised = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody({
        evidence: {
          message: "Actually, weekly planning prompts should be short.",
          source: "user_message",
        },
        idempotencyKey: "revise-1",
        reason: "user_correction",
        revision: {
          content: "I prefer short weekly planning prompts.",
        },
        target: {
          memoryId: targetMemoryId,
        },
      }),
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/revise",
    });
    expect(revised.statusCode).toBe(200);
    expect(revised.body).toMatchObject({
      idempotency: {
        handledBy: "goodmemory_revision",
        key: "revise-1",
      },
    });
    expect(revised.body.result).toMatchObject({
      accepted: true,
      outcome: "superseded",
      previousMemoryId: targetMemoryId,
    });
    const revisedResult = revised.body.result as { newMemoryId?: string };
    expect(revisedResult.newMemoryId).toBeString();

    const forgotten = await runGoodMemoryHttpBridgeRequest({
      body: scopedBody({ memoryId: revisedResult.newMemoryId }),
      headers: AUTH_HEADERS,
      memory,
      path: "/memory/forget",
    });
    expect(forgotten.statusCode).toBe(200);
    expect(forgotten.body.result).toMatchObject({
      forgotten: true,
    });
  });

  it("is consumable from a Python backend process over HTTP", async () => {
    const memory = createGoodMemory({
      remember: createLifeCoachHttpRememberConfig(),
      storage: { provider: "memory" },
    });
    const bridge = createGoodMemoryHttpMemoryBridge({ memory });
    const server = Bun.serve({
      fetch: bridge.fetch,
      port: 0,
    });

    try {
      const child = Bun.spawn({
        cmd: ["python3", "examples/python-fastapi-memory-consumer.py"],
        env: {
          ...process.env,
          GOODMEMORY_BRIDGE_URL: `http://127.0.0.1:${server.port}`,
        },
        stderr: "pipe",
        stdout: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);

      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      const payload = JSON.parse(stdout) as {
        feedbackAccepted: boolean;
        hasContext: boolean;
        itemCount: number;
        revised: boolean;
      };

      expect(payload.hasContext).toBe(true);
      expect(payload.itemCount).toBeGreaterThanOrEqual(1);
      expect(payload.feedbackAccepted).toBe(true);
      expect(payload.revised).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  it("starts the packaged HTTP bridge entrypoint with bearer auth for a Python backend", async () => {
    const port = allocateBridgePort();
    const token = "phase-39-http-bridge-test-token";
    const url = `http://127.0.0.1:${port}`;
    const serverProcess = Bun.spawn({
      cmd: [
        "bun",
        "run",
        "scripts/goodmemory-http-bridge.ts",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--profile",
        "life-coach",
        "--token",
        token,
      ],
      env: {
        ...process.env,
        GOODMEMORY_STORAGE_PROVIDER: "memory",
      },
      stderr: "pipe",
      stdout: "pipe",
    });
    const stdoutPromise = new Response(serverProcess.stdout).text();
    const stderrPromise = new Response(serverProcess.stderr).text();

    try {
      await waitForBridgeReady({ token, url });

      const python = Bun.spawn({
        cmd: ["python3", "examples/python-fastapi-memory-consumer.py"],
        env: {
          ...process.env,
          GOODMEMORY_BRIDGE_TOKEN: token,
          GOODMEMORY_BRIDGE_URL: url,
        },
        stderr: "pipe",
        stdout: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(python.stdout).text(),
        new Response(python.stderr).text(),
        python.exited,
      ]);

      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      const payload = JSON.parse(stdout) as {
        feedbackAccepted: boolean;
        hasContext: boolean;
        itemCount: number;
        revised: boolean;
      };

      expect(payload.hasContext).toBe(true);
      expect(payload.itemCount).toBeGreaterThanOrEqual(1);
      expect(payload.feedbackAccepted).toBe(true);
      expect(payload.revised).toBe(true);
    } finally {
      serverProcess.kill("SIGTERM");
      await serverProcess.exited;
    }

    const [serverStdout, serverStderr] = await Promise.all([
      stdoutPromise,
      stderrPromise,
    ]);
    expect(serverStderr).toBe("");
    expect(serverStdout).toContain('"event":"ready"');
    expect(serverStdout).toContain('"auth":"bearer"');
  });
});
