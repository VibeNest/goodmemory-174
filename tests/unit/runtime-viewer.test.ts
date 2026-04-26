import { describe, expect, it } from "bun:test";
import type {
  ExportMemoryResult,
  RecallInput,
  RecallResult,
} from "../../src/api/contracts";
import type { MemoryScope } from "../../src/domain/scope";
import type { InstalledHostWritebackAuditInspection } from "../../src/install/hostWritebackAuditRuntime";
import {
  buildProgressiveScopeDigest,
  createProgressiveRecallService,
  encodeGoodMemoryRecordRef,
} from "../../src/progressive/recall";
import {
  createRuntimeViewerApp,
  createRuntimeViewerToken,
  normalizeRuntimeViewerBindHost,
} from "../../src/runtime-viewer/public";
import type { RuntimeWorkerStatusResult } from "../../src/runtime-worker/contracts";

const scope: MemoryScope = {
  agentId: "codex",
  sessionId: "viewer-session-secret",
  tenantId: "viewer-tenant-secret",
  userId: "viewer-user-secret",
  workspaceId: "viewer-workspace-secret",
};

const scopeDigestSecret = "runtime-viewer-progressive-secret";
const scopeDigest = buildProgressiveScopeDigest({
  scope,
  secret: scopeDigestSecret,
});

function createExportedMemory(): ExportMemoryResult {
  return {
    artifacts: {
      files: [],
      rootPath: ".",
    },
    durable: {
      archives: [
        {
          archivedAt: "2026-04-26T15:00:00.000Z",
          createdAt: "2026-04-26T14:50:00.000Z",
          id: "archive-viewer-1",
          keyDecisions: ["Keep viewer local and read-only."],
          normalizedTranscript: "raw user transcript must stay hidden",
          referencedArtifacts: [],
          scopeLineage: [],
          sessionId: scope.sessionId!,
          sourceSessionIds: [scope.sessionId!],
          summary: "Viewer design closure.",
          unresolvedItems: [],
          userId: scope.userId,
          workspaceId: scope.workspaceId,
        },
      ],
      episodes: [],
      evidence: [],
      experiences: [],
      facts: [
        {
          accessCount: 0,
          category: "project",
          confidence: 1,
          content: "The local viewer owner is Mira.",
          createdAt: "2026-04-26T14:00:00.000Z",
          id: "fact-viewer-1",
          importance: 1,
          isActive: true,
          lifecycle: "active",
          source: {
            extractedAt: "2026-04-26T14:00:00.000Z",
            method: "explicit",
          },
          updatedAt: "2026-04-26T14:00:00.000Z",
          userId: scope.userId,
          workspaceId: scope.workspaceId,
        },
      ],
      feedback: [],
      preferences: [],
      profile: null,
      promotions: [],
      proposals: [],
      references: [],
    },
    exportedAt: "2026-04-26T15:05:00.000Z",
    runtime: {
      journal: {
        currentState:
          "Inspect viewer-session-secret without persisting raw transcript.",
        errorsAndCorrections: [],
        filesAndFunctions: [],
        keyResults: [],
        learnings: ["Static viewer can poll read-only JSON."],
        sessionId: scope.sessionId!,
        systemDocumentation: [],
        title: "Viewer local session",
        updatedAt: "2026-04-26T15:05:00.000Z",
        userId: scope.userId,
        workflow: [],
        worklog: ["Opened local viewer."],
      },
      spills: [],
      workingMemory: null,
    },
    scope,
  };
}

function createMemory(exported = createExportedMemory()) {
  return {
    async exportMemory(input: { includeRuntime?: boolean; scope: MemoryScope }) {
      return {
        ...exported,
        runtime: input.includeRuntime === true ? exported.runtime : undefined,
        scope: input.scope,
      };
    },
    async recall(input: RecallInput): Promise<RecallResult> {
      return {
        archives: exported.durable.archives,
        episodes: exported.durable.episodes,
        evidence: exported.durable.evidence,
        facts: exported.durable.facts,
        feedback: exported.durable.feedback,
        journal: exported.runtime?.journal ?? null,
        metadata: {
          candidateTraces: [
            {
              explicitnessScore: 1,
              fallback: "none",
              freshnessScore: 1,
              intentScore: 1,
              lexicalScore: 1,
              memoryId: "fact-viewer-1",
              memoryType: "fact",
              returned: true,
              slot: "generic",
            },
          ],
          hits: [
            {
              id: "fact-viewer-1",
              reason: "viewer test",
              type: "fact",
            },
          ],
          latencyMs: 1,
          policyApplied: ["viewer-read-only"],
          routingDecision: {
            actionDriving: false,
            continuation: false,
            intent: "general_assistance",
            referenceSeeking: false,
            requestedSlots: [],
            retrievalProfile: input.retrievalProfile ?? "coding_agent",
            sourcePriorities: [],
            strategy: "rules-only",
            strategyExplanation: {
              hardFloor: "lexical_runtime_procedural_priors",
              llmRefinement: false,
              requestedStrategy: "rules-only",
              resolvedStrategy: "rules-only",
              semanticTieBreaking: false,
              summary: "viewer unit test",
            },
            supportSlots: [],
          },
          tokenCount: 12,
          traceId: "viewer-trace-1",
          verificationHints: [],
        },
        packet: {},
        preferences: exported.durable.preferences,
        profile: exported.durable.profile,
        references: exported.durable.references,
        workingMemory: exported.runtime?.workingMemory ?? null,
      };
    },
  };
}

function createApp() {
  const memory = createMemory();
  return createRuntimeViewerApp({
    host: "codex",
    loadRuntimeWorkerStatus: async () => createWorkerStatus(),
    loadWritebackAudit: async () => createAudit(),
    memory,
    now: () => new Date("2026-04-26T15:10:00.000Z"),
    progressiveRecall: createProgressiveRecallService({
      memory,
      scopeDigestSecret,
    }),
    scope,
    scopeDigest,
    token: "viewer-local-token",
  });
}

function createAudit(): InstalledHostWritebackAuditInspection {
  return {
    events: [
      {
        candidateKey: "candidate-viewer",
        command: "turn-end",
        contentPreview: "viewer@example.com token sk-viewersecret",
        eventId: "wb-viewer-1",
        forgottenLinkedRecordIds: [],
        forgottenMemoryIds: [],
        host: "codex",
        kind: "fact",
        linkedRecordExistsCount: 1,
        linkedRecordIds: [{ id: "fact-viewer-1", type: "memory" }],
        memoryExistsCount: 1,
        memoryIds: ["fact-viewer-1"],
        mode: "observe",
        occurredAt: "2026-04-26T15:01:00.000Z",
        reason: "token sk-viewersecret",
        recallHitCount: 0,
        recalledBy: [],
        scopeDigest: "scope:viewer-safe",
        source: "user",
        status: "observed",
        updatedAt: "2026-04-26T15:01:00.000Z",
      },
    ],
    host: "codex",
    legacyEventCount: 0,
    legacyUnscopedEventCount: 0,
    pendingCount: 0,
    scope,
  };
}

function createWorkerStatus(): RuntimeWorkerStatusResult {
  return {
    audits: [
      {
        action: "job_failed",
        at: "2026-04-26T15:02:00.000Z",
        jobId: "job-viewer",
        reason: "token sk-workersecret",
      },
    ],
    counts: {
      coalesced: 0,
      failed: 0,
      queued: 0,
      running: 0,
      stuck: 0,
      succeeded: 0,
      total: 0,
    },
    daemon: {
      enabled: false,
      updatedAt: "2026-04-26T15:02:00.000Z",
    },
    jobs: [],
    jobsJson: "[]",
    queueFile: "/tmp/goodmemory-runtime-worker.json",
    stuckJobs: [],
  };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function auth(path: string): Request {
  return new Request(`http://127.0.0.1${path}`, {
    headers: {
      authorization: "Bearer viewer-local-token",
    },
  });
}

describe("runtime viewer", () => {
  it("requires a local token and emits no CORS headers", async () => {
    const app = createApp();

    const blocked = await app.fetch(new Request("http://127.0.0.1/api/summary"));
    const allowed = await app.fetch(auth("/api/summary"));

    expect(blocked.status).toBe(401);
    expect(blocked.headers.has("access-control-allow-origin")).toBe(false);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("rejects mutation methods instead of exposing write routes", async () => {
    const app = createApp();

    const response = await app.fetch(new Request("http://127.0.0.1/api/records", {
      headers: { authorization: "Bearer viewer-local-token" },
      method: "POST",
    }));
    const body = await json(response);

    expect(response.status).toBe(405);
    expect(body).toMatchObject({
      readOnly: true,
    });
  });

  it("serves a packageable static shell without external network references", async () => {
    const app = createApp();

    const response = await app.fetch(auth("/?token=viewer-local-token"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("GoodMemory Local Viewer");
    expect(html).toContain("/api/summary");
    expect(html).toContain("function html(value)");
    expect(html).not.toContain("https://");
    expect(html).not.toContain("raw user transcript must stay hidden");
  });

  it("returns redacted summary data with counts, audit, worker, sessions, and traces", async () => {
    const app = createApp();

    const response = await app.fetch(auth("/api/summary?query=viewer"));
    const body = await json(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      host: "codex",
      readOnly: true,
      scopeDigest,
      viewer: {
        bindHost: "127.0.0.1",
        cors: false,
        mutationRoutes: false,
        rawTranscript: false,
        tokenRequired: true,
      },
    });
    expect(serialized).toContain("\"facts\":1");
    expect(serialized).toContain("viewer-trace-1");
    expect(serialized).not.toContain(scope.userId);
    expect(serialized).not.toContain(scope.sessionId);
    expect(serialized).not.toContain("raw user transcript must stay hidden");
    expect(serialized).not.toContain("viewer@example.com");
    expect(serialized).not.toContain("sk-viewersecret");
    expect(serialized).not.toContain("sk-workersecret");
  });

  it("uses progressive recordRefs for drill-down and denies cross-scope refs", async () => {
    const app = createApp();
    const indexResponse = await app.fetch(auth("/api/recall-index?query=viewer"));
    const index = await indexResponse.json() as {
      records: Array<{ recordKind: string; recordRef: string }>;
    };
    const factRef = index.records.find((record) => record.recordKind === "fact")
      ?.recordRef;
    if (!factRef) {
      throw new Error("Expected fact recordRef.");
    }

    const detailResponse = await app.fetch(
      auth(`/api/records?recordRef=${encodeURIComponent(factRef)}`),
    );
    const deniedRef = encodeGoodMemoryRecordRef({
      id: "fact-viewer-1",
      recordKind: "fact",
      scopeDigest: "scope_other",
    });
    const deniedResponse = await app.fetch(
      auth(`/api/records?recordRef=${encodeURIComponent(deniedRef)}`),
    );
    const detailSerialized = JSON.stringify(await detailResponse.json());

    expect(detailResponse.status).toBe(200);
    expect(detailSerialized).toContain("The local viewer owner is Mira.");
    expect(detailSerialized).not.toContain("raw user transcript must stay hidden");
    expect(deniedResponse.status).toBe(403);
  });

  it("generates forget and revise CLI handoff without executing mutations", async () => {
    const app = createApp();
    const recordRef = encodeGoodMemoryRecordRef({
      id: "fact-viewer-1",
      recordKind: "fact",
      scopeDigest,
    });
    const crossScopeRef = encodeGoodMemoryRecordRef({
      id: "fact-viewer-1",
      recordKind: "fact",
      scopeDigest: "scope_other",
    });

    const forget = await json(await app.fetch(
      auth(`/api/handoff?action=forget&recordRef=${encodeURIComponent(recordRef)}`),
    ));
    const revise = await json(await app.fetch(
      auth(`/api/handoff?action=revise&recordRef=${encodeURIComponent(recordRef)}`),
    ));
    const denied = await app.fetch(
      auth(`/api/handoff?action=forget&recordRef=${encodeURIComponent(crossScopeRef)}`),
    );

    expect(forget).toMatchObject({
      action: "forget",
      executed: false,
      recordId: "fact-viewer-1",
      recordKind: "fact",
      recordRef,
    });
    expect(String(forget.command)).toContain("goodmemory forget");
    expect(revise).toMatchObject({
      action: "revise",
      executed: false,
      recordRef,
    });
    expect(String(revise.command)).toContain("goodmemory feedback");
    expect(denied.status).toBe(400);
    expect(JSON.stringify(await denied.json())).toContain(
      "current viewer scope",
    );
  });

  it("keeps viewer binding local-only and creates random local tokens", () => {
    expect(normalizeRuntimeViewerBindHost(undefined)).toBe("127.0.0.1");
    expect(normalizeRuntimeViewerBindHost("127.0.0.1")).toBe("127.0.0.1");
    expect(() => normalizeRuntimeViewerBindHost("0.0.0.0")).toThrow(
      "only binds 127.0.0.1",
    );

    const first = createRuntimeViewerToken();
    const second = createRuntimeViewerToken();
    expect(first).toStartWith("gmviewer_");
    expect(second).toStartWith("gmviewer_");
    expect(first).not.toBe(second);
  });
});
