import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GoodMemory } from "../../src/api/contracts";
import { scopeToKey } from "../../src/domain/scope";
import { readInspectorAuditLedger } from "../../src/inspector/auditLog";
import {
  createInspectorApp,
  type CreateInspectorAppInput,
  type InspectorApp,
  serveInspector,
} from "../../src/inspector/public";
import {
  buildReviewCandidateId,
  getReviewCandidate,
  persistReviewCandidates,
  updateReviewCandidateStatus,
} from "../../src/install/hostReviewQueue";
import {
  createNoopGoodMemoryJobsFacade,
  createNoopGoodMemoryRuntimeFacade,
} from "../../src/testing/fakes";
import { createInMemoryDocumentStore } from "../../src/storage/memory";

const TOKEN = "tok-abcdefghijkl";
const SCOPE = { userId: "userA" } as const;
const KEY = scopeToKey(SCOPE);
const FIXED_NOW = (): Date => new Date("2026-07-07T00:00:00.000Z");

interface Calls {
  recall: number;
  remember: number;
  forget: number;
  revise: number;
  deleteAll: number;
  export: number;
}

function buildMemory(): { memory: GoodMemory; calls: Calls } {
  const calls: Calls = { recall: 0, remember: 0, forget: 0, revise: 0, deleteAll: 0, export: 0 };
  const memory = {
    jobs: createNoopGoodMemoryJobsFacade(),
    runtime: createNoopGoodMemoryRuntimeFacade(),
    async buildContext() {
      throw new Error("not used");
    },
    async recall() {
      calls.recall += 1;
      return {
        metadata: {
          routingDecision: { strategy: "lexical" },
          policyApplied: [],
          tokenCount: 0,
          latencyMs: 1,
          hits: [],
          candidateTraces: [
            {
              memoryId: "f1",
              memoryType: "fact",
              returned: true,
              whyReturned: "lexical match for userA",
              intentScore: 0.5,
              lexicalScore: 0.9,
              freshnessScore: 0.1,
              semanticScore: 0,
              fallback: "none",
            },
          ],
        },
      };
    },
    async remember() {
      calls.remember += 1;
      return { accepted: 1, events: [{ memoryId: "m1" }] };
    },
    async forget() {
      calls.forget += 1;
      return { forgotten: true, traceId: "t1" };
    },
    async exportMemory() {
      calls.export += 1;
      return {
        durable: {
          archives: [],
          episodes: [],
          evidence: [],
          experiences: [],
          facts: [
            {
              id: "f1",
              content: "userA prefers dark mode",
              factKind: "generic_project",
              lifecycle: "active",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          feedback: [],
          preferences: [],
          profile: null,
          promotions: [],
          proposals: [],
          references: [],
        },
      };
    },
    async deleteAllMemory() {
      calls.deleteAll += 1;
      return { scope: SCOPE, deleted: {} };
    },
    async feedback() {
      throw new Error("not used");
    },
    async reviseMemory() {
      calls.revise += 1;
      return { outcome: "superseded" };
    },
    async runMaintenance() {
      throw new Error("not used");
    },
  } as unknown as GoodMemory;
  return { memory, calls };
}

let dirs: string[] = [];
let app: InspectorApp;
let calls: Calls;
let home: string;
let store: ReturnType<typeof createInMemoryDocumentStore>;
let memory: GoodMemory;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "gm-inspector-server-"));
  dirs.push(home);
  store = createInMemoryDocumentStore();
  await store.set("facts", "f1", {
    id: "f1",
    userId: "userA",
    content: "userA prefers dark mode",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const built = buildMemory();
  calls = built.calls;
  memory = built.memory;
  app = createInspectorApp({
    documentStore: store,
    memory,
    homeRoot: home,
    token: TOKEN,
    now: FIXED_NOW,
    newActionId: () => "insp_test",
  });
});

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

function get(path: string, auth: "query" | "header" | "none"): Promise<Response> {
  const suffix = auth === "query" ? `${path.includes("?") ? "&" : "?"}token=${TOKEN}` : "";
  const headers: Record<string, string> =
    auth === "header" ? { authorization: `Bearer ${TOKEN}` } : {};
  return app.fetch(new Request(`http://localhost${path}${suffix}`, { headers }));
}

function post(path: string, body: object, auth: "header" | "query" | "none"): Promise<Response> {
  const suffix = auth === "query" ? `?token=${TOKEN}` : "";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth === "header") {
    headers.authorization = `Bearer ${TOKEN}`;
  }
  return app.fetch(
    new Request(`http://localhost${path}${suffix}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

describe("inspector server", () => {
  it("requires a token for reads", async () => {
    const res = await get("/api/scopes", "none");
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serves the scope index with coverage and an honest descriptor", async () => {
    const res = await get("/api/scopes", "query");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      scopes: unknown[];
      coverage: { blindSpots: string[] };
      descriptor: { mutationRoutes: boolean; readOnly: boolean; tokenRequired: boolean };
    };
    expect(body.scopes).toHaveLength(1);
    expect(body.coverage.blindSpots.length).toBeGreaterThan(0);
    expect(body.descriptor).toMatchObject({
      mutationRoutes: true,
      readOnly: false,
      tokenRequired: true,
    });
  });

  it("rejects mutations authorized only by the query token, accepts the bearer header", async () => {
    const viaQuery = await post("/api/memory/forget", { scopeKey: KEY, memoryId: "f1" }, "query");
    expect(viaQuery.status).toBe(401);
    expect(calls.forget).toBe(0);

    const viaHeader = await post("/api/memory/forget", { scopeKey: KEY, memoryId: "f1" }, "header");
    expect(viaHeader.status).toBe(200);
    expect(((await viaHeader.json()) as { forgotten: boolean }).forgotten).toBe(true);
    expect(calls.forget).toBe(1);

    const ledger = await readInspectorAuditLedger(home);
    expect(ledger.events.at(-1)).toMatchObject({ action: "forget", targetId: "f1", resultStatus: "ok" });
  });

  it("returns 405 for non-GET/POST methods", async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/scopes`, {
        method: "PUT",
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    );
    expect(res.status).toBe(405);
  });

  it("redacts the scope owner's ids from summary output", async () => {
    const res = await get(`/api/summary?scopeKey=${encodeURIComponent(KEY)}`, "header");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("userA");
    expect(text).toContain("[user]");
  });

  it("returns full candidate traces from the recall debugger, redacted", async () => {
    const res = await get(
      `/api/recall-trace?scopeKey=${encodeURIComponent(KEY)}&query=dark`,
      "header",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidateTraces: Array<{ lexicalScore: number }> };
    expect(body.candidateTraces).toHaveLength(1);
    expect(body.candidateTraces[0]?.lexicalScore).toBe(0.9);
    expect(JSON.stringify(body)).not.toContain("userA");
  });

  it("404s an unknown scope", async () => {
    const res = await get(`/api/summary?scopeKey=${encodeURIComponent("ghost::::")}`, "header");
    expect(res.status).toBe(404);
  });

  it("requires the echoed scopeKey to delete a scope", async () => {
    const missing = await post("/api/scope/delete", { scopeKey: KEY }, "header");
    expect(missing.status).toBe(400);
    expect(calls.deleteAll).toBe(0);

    const unaware = await post("/api/scope/delete", { scopeKey: KEY, confirm: KEY }, "header");
    expect(unaware.status).toBe(400);
    expect(await unaware.text()).toContain("cascade");
    expect(calls.deleteAll).toBe(0);

    const confirmed = await post(
      "/api/scope/delete",
      { scopeKey: KEY, confirm: KEY, cascadeAware: true },
      "header",
    );
    expect(confirmed.status).toBe(200);
    expect(calls.deleteAll).toBe(1);
    const ledger = await readInspectorAuditLedger(home);
    expect(ledger.events.at(-1)).toMatchObject({ action: "delete-scope", resultStatus: "ok" });
  });

  it("revises a memory and audits it", async () => {
    const res = await post(
      "/api/memory/revise",
      { scopeKey: KEY, memoryId: "f1", content: "prefers light mode" },
      "header",
    );
    expect(res.status).toBe(200);
    expect(calls.revise).toBe(1);
    const ledger = await readInspectorAuditLedger(home);
    expect(ledger.events.at(-1)).toMatchObject({ action: "revise", targetId: "f1", resultStatus: "ok" });
  });

  it("approves a pending review candidate through the server", async () => {
    await persistReviewCandidates({
      homeRoot: home,
      now: FIXED_NOW,
      candidates: [
        {
          host: "claude",
          scope: SCOPE,
          candidateKey: "k1",
          kind: "preference",
          content: "prefers dark mode",
          reason: "stated",
          source: "user",
          confidence: 0.9,
        },
      ],
    });
    const candidateId = buildReviewCandidateId({ scope: SCOPE, candidateKey: "k1" });

    const res = await post(
      "/api/candidates/approve",
      { scopeKey: KEY, candidateId },
      "header",
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("approved");
    expect(calls.remember).toBe(1);
  });

  it("surfaces and resets stale interrupted approvals through the server", async () => {
    await persistReviewCandidates({
      homeRoot: home,
      now: FIXED_NOW,
      candidates: [
        {
          host: "claude",
          scope: SCOPE,
          candidateKey: "stale",
          kind: "preference",
          content: "prefers explicit recovery",
          reason: "stated",
          source: "user",
          confidence: 0.9,
        },
      ],
    });
    const candidateId = buildReviewCandidateId({ scope: SCOPE, candidateKey: "stale" });
    await updateReviewCandidateStatus({
      homeRoot: home,
      id: candidateId,
      status: "approving",
      now: () => new Date("2000-01-01T00:00:00.000Z"),
    });

    const listed = await get(`/api/candidates?scopeKey=${encodeURIComponent(KEY)}`, "header");
    const listBody = (await listed.json()) as {
      candidates: Array<{ approvable: boolean; recoverable?: boolean; status: string }>;
    };
    expect(listBody.candidates[0]).toMatchObject({
      approvable: false,
      recoverable: true,
      status: "approval_interrupted",
    });

    const approved = await post(
      "/api/candidates/approve",
      { scopeKey: KEY, candidateId },
      "header",
    );
    expect(approved.status).toBe(409);
    expect(calls.remember).toBe(0);

    const recovered = await post(
      "/api/candidates/recover",
      { scopeKey: KEY, candidateId },
      "header",
    );
    expect(recovered.status).toBe(200);
    expect(((await recovered.json()) as { status: string }).status).toBe("released");
    expect((await getReviewCandidate({ homeRoot: home, id: candidateId }))?.status).toBe("pending");
  });

  it("serves a self-contained shell with no external URLs or raw transcript", async () => {
    const res = await get("/", "query");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    const html = await res.text();
    expect(html).toContain("GoodMemory Inspector");
    expect(html).toContain("cascadeAware: true");
    expect(html).toContain("matching this scope filter");
    expect(html).toContain("data-candidate-id");
    expect(html).toContain("recoverFromButton");
    expect(html).not.toContain("approve('\" + esc(cand.id)");
    expect(html).not.toContain("revise('\" + esc(r.id)");
    expect(html).not.toContain("https://");
    expect(html.toLowerCase()).not.toContain("rawtranscript");
  });

  it("rejects unsupported observed-ledger hosts before loader paths are resolved", async () => {
    let loadedHost = false;
    let forgotHost = false;
    const guarded = createInspectorApp({
      documentStore: store,
      memory,
      homeRoot: home,
      token: TOKEN,
      now: FIXED_NOW,
      loadObservedAudit: async () => {
        loadedHost = true;
        return {
          events: [],
          host: "codex",
          legacyEventCount: 0,
          legacyUnscopedEventCount: 0,
          pendingCount: 0,
          scope: SCOPE,
        };
      },
      forgetObservedEvent: async () => {
        forgotHost = true;
        return { status: "dismissed" };
      },
    });

    const listed = await guarded.fetch(
      new Request(
        `http://localhost/api/candidates?scopeKey=${encodeURIComponent(KEY)}&host=../codex`,
        { headers: { authorization: `Bearer ${TOKEN}` } },
      ),
    );
    expect(listed.status).toBe(400);
    expect(loadedHost).toBe(false);

    const dismissed = await guarded.fetch(
      new Request("http://localhost/api/candidates/reject", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({
          scopeKey: KEY,
          source: "observed-ledger",
          host: "../codex",
          candidateId: "wb_1",
        }),
      }),
    );
    expect(dismissed.status).toBe(400);
    expect(forgotHost).toBe(false);
  });

  it("surfaces observed-ledger candidates and dismisses them via injected loaders", async () => {
    let forgotten: string | undefined;
    const withLoaders = createInspectorApp({
      documentStore: store,
      memory,
      homeRoot: home,
      token: TOKEN,
      now: FIXED_NOW,
      newActionId: () => "insp_obs",
      loadObservedAudit: (async () => ({
        events: [
          {
            eventId: "wb_1",
            status: "observed",
            kind: "preference",
            contentPreview: "observed preview",
            reason: "observe",
            occurredAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
            source: "user",
          },
        ],
      })) as unknown as CreateInspectorAppInput["loadObservedAudit"],
      forgetObservedEvent: async ({ eventId }) => {
        forgotten = eventId;
        return { status: "dismissed" };
      },
    });

    const listed = await withLoaders.fetch(
      new Request(
        `http://localhost/api/candidates?scopeKey=${encodeURIComponent(KEY)}&host=claude`,
        { headers: { authorization: `Bearer ${TOKEN}` } },
      ),
    );
    const listBody = (await listed.json()) as {
      candidates: Array<{ source: string; approvable: boolean }>;
      notes: string[];
    };
    expect(
      listBody.candidates.some((c) => c.source === "observed-ledger" && !c.approvable),
    ).toBe(true);
    expect(listBody.notes.length).toBeGreaterThan(0);

    const dismissed = await withLoaders.fetch(
      new Request("http://localhost/api/candidates/reject", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({
          scopeKey: KEY,
          source: "observed-ledger",
          host: "claude",
          candidateId: "wb_1",
        }),
      }),
    );
    expect(dismissed.status).toBe(200);
    expect(forgotten).toBe("wb_1");
  });

  it("serves over a loopback socket via serveInspector", async () => {
    const handle = serveInspector({ documentStore: store, memory, homeRoot: home, token: TOKEN });
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/api/descriptor`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { descriptor: { mutationRoutes: boolean } };
      expect(body.descriptor.mutationRoutes).toBe(true);
      expect(handle.bindHost).toBe("127.0.0.1");
    } finally {
      handle.stop();
    }
  });

  it("rejects an invalid JSON mutation body", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/memory/forget", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("404s an unknown POST route", async () => {
    const res = await post("/api/nope", { scopeKey: KEY }, "header");
    expect(res.status).toBe(404);
  });
});
