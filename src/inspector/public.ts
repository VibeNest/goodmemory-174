import { createHash, randomBytes } from "node:crypto";
import type {
  ExportMemoryResult,
  GoodMemory,
  RecallResult,
} from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import type { InstalledHostKind } from "../install/hostInstall";
import { buildWritebackScopeDigest } from "../install/hostWritebackAuditLedger";
import type { InstalledHostWritebackAuditInspection } from "../install/hostWritebackAuditRuntime";
import { getReviewCandidate } from "../install/hostReviewQueue";
import {
  normalizeRuntimeViewerBindHost,
  redactViewerText,
  sanitizeViewerValue,
} from "../runtime-viewer/public";
import type { DocumentStore } from "../storage/contracts";
import {
  appendInspectorAuditEvent,
  type InspectorAuditEvent,
  readInspectorAuditLedger,
} from "./auditLog";
import {
  approveCandidate,
  type InspectorCandidateView,
  listReviewCandidateViews,
  recoverCandidateApproval,
  rejectCandidate,
} from "./candidateReview";
import { listScopes } from "./scopeIndex";

// The Inspector is a local admin surface: read-only browse/recall-debug plus a
// SMALL set of gated, audited mutation routes (approve/reject/forget/revise/
// delete-scope). It reuses the runtime viewer's redaction + loopback-lock but,
// unlike the viewer, is NOT read-only — every mutation is audit-logged and
// requires the token in the Authorization header (never via ?token= query).

const RECORD_SAMPLE_LIMIT = 25;
const OBSERVED_STATUS = "observed";

export interface InspectorServerDescriptor {
  audited: true;
  bindHost: "127.0.0.1";
  cors: false;
  gated: true;
  mutationRoutes: true;
  rawTranscript: false;
  readOnly: false;
  tokenRequired: true;
}

export type LoadObservedAudit = (input: {
  host: InstalledHostKind;
}) => Promise<InstalledHostWritebackAuditInspection>;

export type ForgetObservedEvent = (input: {
  host: InstalledHostKind;
  eventId: string;
  reviewOutcome?: "valid_write" | "false_write" | "uncertain";
  reviewReason?: string;
}) => Promise<Record<string, unknown>>;

export interface CreateInspectorAppInput {
  documentStore: DocumentStore;
  memory: GoodMemory;
  homeRoot?: string;
  token?: string;
  bindHost?: string;
  now?: () => Date;
  newActionId?: () => string;
  /** Optional: surface installed-host observe candidates alongside the queue. */
  loadObservedAudit?: LoadObservedAudit;
  forgetObservedEvent?: ForgetObservedEvent;
}

export interface InspectorApp {
  fetch(request: Request): Promise<Response>;
  token: string;
}

export interface InspectorServerHandle {
  bindHost: "127.0.0.1";
  port: number;
  stop(): void;
  token: string;
  url: string;
}

export function createInspectorToken(): string {
  return `gminspector_${randomBytes(32).toString("base64url")}`;
}

export function createInspectorApp(input: CreateInspectorAppInput): InspectorApp {
  const bindHost = normalizeRuntimeViewerBindHost(input.bindHost);
  const token = input.token ?? createInspectorToken();
  if (token.trim().length < 12) {
    throw new Error("GoodMemory inspector requires a local token of at least 12 characters.");
  }
  const now = input.now ?? (() => new Date());
  const newActionId = input.newActionId ?? defaultActionId;
  const scopeCache = new Map<string, MemoryScope>();

  async function refreshScopeCache(): Promise<Awaited<ReturnType<typeof listScopes>>> {
    const index = await listScopes({ documentStore: input.documentStore, now });
    scopeCache.clear();
    for (const summary of index.scopes) {
      scopeCache.set(summary.scopeKey, summary.scope);
    }
    return index;
  }

  async function resolveScope(scopeKey: string): Promise<MemoryScope | undefined> {
    if (scopeCache.has(scopeKey)) {
      return scopeCache.get(scopeKey);
    }
    await refreshScopeCache();
    return scopeCache.get(scopeKey);
  }

  async function auditMutation(event: Omit<InspectorAuditEvent, "actionId" | "occurredAt">): Promise<void> {
    await appendInspectorAuditEvent({
      homeRoot: input.homeRoot,
      event: { ...event, actionId: newActionId(), occurredAt: now().toISOString() },
    });
  }

  async function handleGet(url: URL): Promise<Response> {
    const path = url.pathname;
    if (path === "/" || path === "/index.html") {
      return htmlResponse(renderInspectorShell());
    }
    if (path === "/api/descriptor") {
      return jsonResponse({ descriptor: buildDescriptor(bindHost) });
    }
    if (path === "/api/scopes") {
      const index = await refreshScopeCache();
      return jsonResponse({ ...index, descriptor: buildDescriptor(bindHost) });
    }
    if (path === "/api/summary") {
      const scope = await resolveScope(readRequiredQuery(url, "scopeKey"));
      if (!scope) {
        return jsonError("Unknown scope; refresh the scope list.", 404);
      }
      const exported = await input.memory.exportMemory({ includeRuntime: true, scope });
      return jsonResponse(sanitizeViewerValue(buildScopeOverview(exported), scope));
    }
    if (path === "/api/recall-trace") {
      const scope = await resolveScope(readRequiredQuery(url, "scopeKey"));
      if (!scope) {
        return jsonError("Unknown scope; refresh the scope list.", 404);
      }
      const query = readOptionalQuery(url, "query") ?? "";
      const recall = await input.memory.recall({
        query,
        retrievalProfile: "coding_agent",
        scope,
      });
      return jsonResponse(sanitizeViewerValue(buildRecallTrace(query, recall), scope));
    }
    if (path === "/api/candidates") {
      return handleCandidates(url);
    }
    if (path === "/api/audit") {
      const ledger = await readInspectorAuditLedger(input.homeRoot);
      return jsonResponse({ events: ledger.events.slice(-100).reverse() });
    }
    return jsonError("Not found.", 404);
  }

  async function handleCandidates(url: URL): Promise<Response> {
    const scopeKey = readRequiredQuery(url, "scopeKey");
    const notes: string[] = [];
    const candidates: InspectorCandidateView[] = await listReviewCandidateViews({
      homeRoot: input.homeRoot,
      scopeKey,
    });

    const host = readOptionalQuery(url, "host");
    if (host) {
      const hostKind = readInstalledHostKind(host);
      if (!hostKind) {
        return jsonError("Unsupported host. Expected codex or claude.", 400);
      }
      if (!input.loadObservedAudit) {
        return jsonResponse({ scopeKey, candidates, notes });
      }
      try {
        const inspection = await input.loadObservedAudit({ host: hostKind });
        for (const event of inspection.events) {
          if (event.status !== OBSERVED_STATUS) {
            continue;
          }
          candidates.push({
            id: event.eventId,
            source: "observed-ledger",
            approvable: false,
            kind: String(event.kind),
            contentPreview: event.contentPreview,
            reason: event.reason,
            status: event.status,
            createdAt: event.occurredAt,
            updatedAt: event.updatedAt,
            host: hostKind,
            origin: String(event.source),
          });
        }
        notes.push(
          "Observed-ledger candidates are preview-only: they can be rejected (dismissed) but not faithfully approved. Use writeback `review` mode to capture approvable candidates.",
        );
      } catch (error) {
        notes.push(`Observed-ledger unavailable: ${describeError(error)}`);
      }
    }

    return jsonResponse({ scopeKey, candidates, notes });
  }

  async function handlePost(url: URL, request: Request): Promise<Response> {
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(request);
    } catch {
      return jsonError("Request body must be valid JSON.", 400);
    }
    if (!isAuthorizedMutation(request, body, token)) {
      return jsonError(
        "Inspector mutations require the token in the Authorization: Bearer header (or JSON body), not the ?token= query.",
        401,
      );
    }

    switch (url.pathname) {
      case "/api/candidates/approve":
        return handleApprove(body);
      case "/api/candidates/reject":
        return handleReject(body);
      case "/api/candidates/recover":
        return handleRecover(body);
      case "/api/memory/forget":
        return handleForget(body);
      case "/api/memory/revise":
        return handleRevise(body);
      case "/api/scope/delete":
        return handleDeleteScope(body);
      default:
        return jsonError("Not found.", 404);
    }
  }

  async function handleApprove(body: Record<string, unknown>): Promise<Response> {
    const candidateId = readStringField(body, "candidateId");
    const scopeKey = readStringField(body, "scopeKey");
    if (!candidateId || !scopeKey) {
      return jsonError("candidateId and scopeKey are required.", 400);
    }
    const candidate = await getReviewCandidate({ homeRoot: input.homeRoot, id: candidateId });
    if (!candidate) {
      return jsonError("Unknown candidate.", 404);
    }
    if (candidate.scopeKey !== scopeKey) {
      return jsonError("scopeKey does not match the candidate's scope.", 400);
    }
    const result = await approveCandidate({
      candidateId,
      scope: candidate.scope,
      reviewReason: readOptionalStringField(body, "reviewReason"),
      deps: {
        memory: input.memory,
        homeRoot: input.homeRoot,
        now,
        newActionId,
      },
    });
    return jsonResponse(result, result.status === "approved" ? 200 : 409);
  }

  async function handleReject(body: Record<string, unknown>): Promise<Response> {
    const scopeKey = readStringField(body, "scopeKey");
    if (!scopeKey) {
      return jsonError("scopeKey is required.", 400);
    }
    if (readOptionalStringField(body, "source") === "observed-ledger") {
      return handleObservedReject(body);
    }
    const candidateId = readStringField(body, "candidateId");
    if (!candidateId) {
      return jsonError("candidateId is required.", 400);
    }
    const candidate = await getReviewCandidate({ homeRoot: input.homeRoot, id: candidateId });
    if (!candidate) {
      return jsonError("Unknown candidate.", 404);
    }
    if (candidate.scopeKey !== scopeKey) {
      return jsonError("scopeKey does not match the candidate's scope.", 400);
    }
    const result = await rejectCandidate({
      candidateId,
      scope: candidate.scope,
      reviewReason: readOptionalStringField(body, "reviewReason"),
      deps: { memory: input.memory, homeRoot: input.homeRoot, now, newActionId },
    });
    return jsonResponse(result, result.status === "rejected" ? 200 : 409);
  }

  async function handleRecover(body: Record<string, unknown>): Promise<Response> {
    const candidateId = readStringField(body, "candidateId");
    const scopeKey = readStringField(body, "scopeKey");
    if (!candidateId || !scopeKey) {
      return jsonError("candidateId and scopeKey are required.", 400);
    }
    const candidate = await getReviewCandidate({ homeRoot: input.homeRoot, id: candidateId });
    if (!candidate) {
      return jsonError("Unknown candidate.", 404);
    }
    if (candidate.scopeKey !== scopeKey) {
      return jsonError("scopeKey does not match the candidate's scope.", 400);
    }
    const result = await recoverCandidateApproval({
      candidateId,
      scope: candidate.scope,
      reviewReason: readOptionalStringField(body, "reviewReason"),
      deps: { memory: input.memory, homeRoot: input.homeRoot, now, newActionId },
    });
    return jsonResponse(result, result.status === "released" ? 200 : 409);
  }

  async function handleObservedReject(body: Record<string, unknown>): Promise<Response> {
    if (!input.forgetObservedEvent) {
      return jsonError("Observed-ledger actions are not enabled on this server.", 400);
    }
    const hostRaw = readStringField(body, "host");
    const eventId = readStringField(body, "candidateId") ?? readStringField(body, "eventId");
    if (!hostRaw || !eventId) {
      return jsonError("host and candidateId are required for observed-ledger rejection.", 400);
    }
    const host = readInstalledHostKind(hostRaw);
    if (!host) {
      return jsonError("Unsupported host. Expected codex or claude.", 400);
    }
    const result = await input.forgetObservedEvent({
      host,
      eventId,
      reviewOutcome: "false_write",
      reviewReason: readOptionalStringField(body, "reviewReason"),
    });
    await auditMutation({
      action: "reject",
      scopeDigest: "observed-ledger",
      targetId: eventId,
      resultStatus: "ok",
    });
    return jsonResponse({ status: "dismissed", result });
  }

  async function handleForget(body: Record<string, unknown>): Promise<Response> {
    const scopeKey = readStringField(body, "scopeKey");
    const memoryId = readStringField(body, "memoryId");
    if (!scopeKey || !memoryId) {
      return jsonError("scopeKey and memoryId are required.", 400);
    }
    const scope = await resolveScope(scopeKey);
    if (!scope) {
      return jsonError("Unknown scope; refresh the scope list.", 404);
    }
    const result = await input.memory.forget({ scope, memoryId });
    await auditMutation({
      action: "forget",
      scopeDigest: buildWritebackScopeDigest(scope),
      targetId: memoryId,
      resultStatus: result.forgotten ? "ok" : "error",
      ...(result.forgotten ? {} : { errorMessage: "no matching memory in scope" }),
    });
    return jsonResponse(result);
  }

  async function handleRevise(body: Record<string, unknown>): Promise<Response> {
    const scopeKey = readStringField(body, "scopeKey");
    const memoryId = readStringField(body, "memoryId");
    const content = readStringField(body, "content");
    if (!scopeKey || !memoryId || !content) {
      return jsonError("scopeKey, memoryId, and content are required.", 400);
    }
    const scope = await resolveScope(scopeKey);
    if (!scope) {
      return jsonError("Unknown scope; refresh the scope list.", 404);
    }
    const reason = readOptionalStringField(body, "reason") ?? "Inspector revision";
    const result = await input.memory.reviseMemory({
      scope,
      target: { memoryId },
      revision: { content },
      reason,
      idempotencyKey: `insp_rev_${hashText(`${memoryId}\n${content}`)}`,
    });
    const ok = result.outcome === "superseded";
    await auditMutation({
      action: "revise",
      scopeDigest: buildWritebackScopeDigest(scope),
      targetId: memoryId,
      resultStatus: ok ? "ok" : "error",
      contentPreview: content,
      ...(ok ? {} : { errorMessage: `revision ${result.outcome}` }),
    });
    return jsonResponse(result, ok ? 200 : 409);
  }

  async function handleDeleteScope(body: Record<string, unknown>): Promise<Response> {
    const scopeKey = readStringField(body, "scopeKey");
    const confirm = readStringField(body, "confirm");
    if (!scopeKey) {
      return jsonError("scopeKey is required.", 400);
    }
    if (confirm !== scopeKey) {
      return jsonError("`confirm` must echo the exact scopeKey to delete a scope.", 400);
    }
    if (body.cascadeAware !== true) {
      return jsonError(
        "Scope delete can cascade to narrower stored scopes when tenant/workspace/agent/session keys are omitted; set cascadeAware true after showing that warning.",
        400,
      );
    }
    const scope = await resolveScope(scopeKey);
    if (!scope) {
      return jsonError("Unknown scope; refresh the scope list.", 404);
    }
    const result = await input.memory.deleteAllMemory({ scope });
    await auditMutation({
      action: "delete-scope",
      scopeDigest: buildWritebackScopeDigest(scope),
      targetId: scopeKey,
      resultStatus: "ok",
    });
    scopeCache.delete(scopeKey);
    return jsonResponse(result);
  }

  return {
    token,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      try {
        if (method === "GET") {
          if (!isAuthorizedRead(request, url, token)) {
            return jsonError("Inspector token is required.", 401);
          }
          return await handleGet(url);
        }
        if (method === "POST") {
          return await handlePost(url, request);
        }
        return jsonError("Method not allowed.", 405);
      } catch (error) {
        return jsonError(describeError(error), 400);
      }
    },
  };
}

export function serveInspector(
  input: CreateInspectorAppInput & { port?: number },
): InspectorServerHandle {
  const bindHost = normalizeRuntimeViewerBindHost(input.bindHost);
  const app = createInspectorApp({ ...input, bindHost });
  const server = Bun.serve({
    fetch: app.fetch,
    hostname: bindHost,
    port: input.port ?? 0,
  });
  return {
    bindHost,
    port: server.port ?? input.port ?? 0,
    stop() {
      server.stop(true);
    },
    token: app.token,
    url: `http://${bindHost}:${server.port}/?token=${encodeURIComponent(app.token)}`,
  };
}

export function buildDescriptor(bindHost: "127.0.0.1"): InspectorServerDescriptor {
  return {
    audited: true,
    bindHost,
    cors: false,
    gated: true,
    mutationRoutes: true,
    rawTranscript: false,
    readOnly: false,
    tokenRequired: true,
  };
}

function buildScopeOverview(exported: ExportMemoryResult): unknown {
  const durable = exported.durable;
  const counts = {
    archives: durable.archives.length,
    episodes: durable.episodes.length,
    evidence: durable.evidence.length,
    experiences: durable.experiences.length,
    facts: durable.facts.length,
    feedback: durable.feedback.length,
    preferences: durable.preferences.length,
    profile: durable.profile ? 1 : 0,
    promotions: durable.promotions.length,
    proposals: durable.proposals.length,
    references: durable.references.length,
  };
  return {
    counts: {
      ...counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    },
    records: {
      facts: durable.facts.slice(0, RECORD_SAMPLE_LIMIT).map((fact) => ({
        id: fact.id,
        content: fact.content,
        kind: fact.factKind,
        lifecycle: fact.lifecycle,
        updatedAt: fact.updatedAt,
      })),
      preferences: durable.preferences.slice(0, RECORD_SAMPLE_LIMIT).map((preference) => ({
        id: preference.id,
        category: preference.category,
        value: preference.value,
        updatedAt: preference.updatedAt,
      })),
      references: durable.references.slice(0, RECORD_SAMPLE_LIMIT).map((reference) => ({
        id: reference.id,
        title: reference.title,
        pointer: reference.pointer,
        updatedAt: reference.updatedAt,
      })),
      feedback: durable.feedback.slice(0, RECORD_SAMPLE_LIMIT).map((feedback) => ({
        id: feedback.id,
        rule: feedback.rule,
        kind: feedback.kind,
        updatedAt: feedback.updatedAt,
      })),
    },
  };
}

function buildRecallTrace(query: string, recall: RecallResult): unknown {
  const metadata = recall.metadata;
  return {
    query,
    routingDecision: metadata.routingDecision,
    policyApplied: metadata.policyApplied,
    tokenCount: metadata.tokenCount,
    latencyMs: metadata.latencyMs,
    hitCount: metadata.hits.length,
    candidateTraces: metadata.candidateTraces.map((trace) => ({
      memoryId: trace.memoryId,
      memoryType: trace.memoryType,
      returned: trace.returned,
      whyReturned: trace.whyReturned,
      whySuppressed: trace.whySuppressed,
      intentScore: trace.intentScore,
      lexicalScore: trace.lexicalScore,
      freshnessScore: trace.freshnessScore,
      semanticScore: trace.semanticScore,
      fallback: trace.fallback,
    })),
  };
}

function isAuthorizedRead(request: Request, url: URL, token: string): boolean {
  if (bearerMatches(request, token)) {
    return true;
  }
  return url.searchParams.get("token") === token;
}

function isAuthorizedMutation(
  request: Request,
  body: Record<string, unknown>,
  token: string,
): boolean {
  // Deliberately excludes the ?token= query so a leaked URL cannot mutate.
  return bearerMatches(request, token) || readStringField(body, "token") === token;
}

function bearerMatches(request: Request, token: string): boolean {
  return request.headers.get("authorization") === `Bearer ${token}`;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function readStringField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readOptionalStringField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalQuery(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value ? value : undefined;
}

function readRequiredQuery(url: URL, name: string): string {
  const value = readOptionalQuery(url, name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readInstalledHostKind(value: string): InstalledHostKind | undefined {
  return value === "codex" || value === "claude" ? value : undefined;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: new Headers({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    }),
    status,
  });
}

function jsonError(error: string, status: number): Response {
  return jsonResponse({ error }, status);
}

function htmlResponse(content: string): Response {
  return new Response(content, {
    headers: new Headers({
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    }),
  });
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactViewerText(message);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function defaultActionId(): string {
  return `insp_${randomBytes(9).toString("hex")}`;
}

export function renderInspectorShell(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GoodMemory Inspector</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    body { margin: 0; display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }
    aside { border-right: 1px solid #8883; padding: 12px; overflow-y: auto; }
    main { padding: 16px 20px; overflow-y: auto; }
    h1 { font-size: 15px; margin: 0 0 4px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; opacity: .7; margin: 18px 0 6px; }
    .banner { background: #f0a5; border: 1px solid #b806; border-radius: 6px; padding: 6px 8px; font-size: 12px; margin-bottom: 10px; }
    .scope { display: block; width: 100%; text-align: left; border: 1px solid #8883; border-radius: 6px; padding: 6px 8px; margin: 4px 0; background: none; color: inherit; cursor: pointer; font: inherit; }
    .scope.active { border-color: #4a90d9; background: #4a90d922; }
    .scope small { opacity: .7; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    td, th { border-bottom: 1px solid #8882; padding: 3px 6px; text-align: left; vertical-align: top; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    button.act { font: inherit; font-size: 11px; border: 1px solid #8886; border-radius: 5px; padding: 2px 8px; margin-right: 4px; cursor: pointer; background: none; color: inherit; }
    button.danger { border-color: #d5525288; color: #d55; }
    input, textarea { font: inherit; font-size: 12px; width: 100%; box-sizing: border-box; margin: 2px 0; }
    .muted { opacity: .6; font-size: 11px; }
    .counts span { display: inline-block; margin-right: 10px; font-size: 12px; }
  </style>
</head>
<body>
  <aside>
    <h1>GoodMemory Inspector</h1>
    <div class="muted" id="descriptor">local · 127.0.0.1 · token-gated</div>
    <div class="banner" id="coverage"></div>
    <h2>Scopes</h2>
    <div id="scopes">loading…</div>
  </aside>
  <main>
    <div id="detail"><p class="muted">Select a scope to inspect its memory, review candidates, and act on it.</p></div>
  </main>
  <script>
    const token = new URLSearchParams(location.search).get("token") || "";
    const H = { "authorization": "Bearer " + token };
    let current = null;
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const attr = esc;

    async function api(path) {
      const res = await fetch(path, { headers: H });
      if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()));
      return res.json();
    }
    async function mutate(path, body) {
      const res = await fetch(path, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
      return data;
    }

    async function loadScopes() {
      const data = await api("/api/scopes");
      document.getElementById("coverage").textContent = "Coverage: durable records only. " + (data.coverage.blindSpots[0] || "");
      const host = document.getElementById("scopes");
      host.innerHTML = "";
      for (const s of data.scopes) {
        const b = document.createElement("button");
        b.className = "scope" + (current === s.scopeKey ? " active" : "");
        b.innerHTML = esc(s.scope.userId) + "<br><small>" + esc(s.scopeKey) + " · " + s.totalRecords + " records</small>";
        b.onclick = () => selectScope(s.scopeKey);
        host.appendChild(b);
      }
      if (!data.scopes.length) host.innerHTML = '<p class="muted">No durable scopes found.</p>';
    }

    async function selectScope(scopeKey) {
      current = scopeKey;
      await loadScopes();
      const detail = document.getElementById("detail");
      detail.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const [summary, candidates, audit] = await Promise.all([
          api("/api/summary?scopeKey=" + encodeURIComponent(scopeKey)),
          api("/api/candidates?scopeKey=" + encodeURIComponent(scopeKey)),
          api("/api/audit"),
        ]);
        detail.innerHTML = renderDetail(scopeKey, summary, candidates, audit);
      } catch (e) {
        detail.innerHTML = '<p class="banner">' + esc(e.message) + "</p>";
      }
    }

    function renderDetail(scopeKey, summary, candidates, audit) {
      const c = summary.counts || {};
      let html = "<h2>Scope " + esc(scopeKey) + "</h2><div class='counts'>";
      for (const k of Object.keys(c)) html += "<span>" + esc(k) + ": <b>" + c[k] + "</b></span>";
      html += "</div>";

      html += "<h2>Review candidates</h2>";
      if (!candidates.candidates.length) html += "<p class='muted'>None.</p>";
      else {
        html += "<table><tr><th>kind</th><th>preview</th><th>status</th><th></th></tr>";
        for (const cand of candidates.candidates) {
          html += "<tr><td>" + esc(cand.kind) + "</td><td>" + esc(cand.contentPreview) + "</td><td>" + esc(cand.status) + "</td><td>";
          if (cand.approvable) html += '<button class="act" data-candidate-id="' + attr(cand.id) + '" onclick="approveFromButton(this)">approve</button><button class="act danger" data-candidate-id="' + attr(cand.id) + '" onclick="rejectFromButton(this)">reject</button>';
          else if (cand.recoverable) html += '<button class="act" data-candidate-id="' + attr(cand.id) + '" onclick="recoverFromButton(this)">reset</button>';
          else html += "<span class='muted'>preview-only</span>";
          html += "</td></tr>";
        }
        html += "</table>";
      }
      for (const n of (candidates.notes || [])) html += "<p class='muted'>" + esc(n) + "</p>";

      html += "<h2>Facts</h2>" + recordsTable((summary.records || {}).facts, "content");
      html += "<h2>Preferences</h2>" + recordsTable((summary.records || {}).preferences, "value");
      html += "<h2>References</h2>" + recordsTable((summary.records || {}).references, "title");
      html += "<h2>Feedback</h2>" + recordsTable((summary.records || {}).feedback, "rule");

      html += "<h2>Recall debugger</h2><input id='q' placeholder='query'><button class='act' onclick='trace()'>trace</button><div id='traceout'></div>";

      html += "<h2>Danger zone</h2>";
      html += "<p class='muted'>Delete every durable record matching this scope filter. If tenant, workspace, agent, or session keys are omitted, this can cascade to narrower stored scopes. Type the scopeKey to confirm.</p>";
      html += '<input id="delconfirm" placeholder="' + attr(scopeKey) + '"><button class="act danger" onclick="deleteScope()">delete scope</button>';

      html += "<h2>Recent inspector actions</h2>";
      if (!audit.events.length) html += "<p class='muted'>None.</p>";
      else { html += "<table><tr><th>action</th><th>target</th><th>result</th><th>at</th></tr>"; for (const e of audit.events.slice(0, 12)) html += "<tr><td>" + esc(e.action) + "</td><td><code>" + esc(e.targetId || "") + "</code></td><td>" + esc(e.resultStatus) + "</td><td class='muted'>" + esc(e.occurredAt) + "</td></tr>"; html += "</table>"; }
      return html;
    }

    function recordsTable(rows, field) {
      rows = rows || [];
      if (!rows.length) return "<p class='muted'>None.</p>";
      let h = "<table><tr><th>id</th><th>" + esc(field) + "</th><th></th></tr>";
      for (const r of rows) {
        h += "<tr><td><code>" + esc(r.id) + "</code></td><td>" + esc(typeof r[field] === "object" ? JSON.stringify(r[field]) : r[field]) + "</td><td>";
        h += '<button class="act" data-memory-id="' + attr(r.id) + '" onclick="reviseFromButton(this)">revise</button><button class="act danger" data-memory-id="' + attr(r.id) + '" onclick="forgetFromButton(this)">forget</button></td></tr>';
      }
      return h + "</table>";
    }

    async function withReload(fn) { try { await fn(); await selectScope(current); } catch (e) { alert(e.message); } }
    window.approveFromButton = (button) => withReload(() => mutate("/api/candidates/approve", { scopeKey: current, candidateId: button.dataset.candidateId || "" }));
    window.rejectFromButton = (button) => withReload(() => mutate("/api/candidates/reject", { scopeKey: current, candidateId: button.dataset.candidateId || "" }));
    window.recoverFromButton = (button) => withReload(() => mutate("/api/candidates/recover", { scopeKey: current, candidateId: button.dataset.candidateId || "" }));
    window.forgetFromButton = (button) => withReload(() => mutate("/api/memory/forget", { scopeKey: current, memoryId: button.dataset.memoryId || "" }));
    window.reviseFromButton = (button) => { const id = button.dataset.memoryId || ""; const content = prompt("New content for " + id + ":"); if (content) withReload(() => mutate("/api/memory/revise", { scopeKey: current, memoryId: id, content })); };
    window.deleteScope = () => { const v = document.getElementById("delconfirm").value; withReload(() => mutate("/api/scope/delete", { scopeKey: current, confirm: v, cascadeAware: true })); };
    window.trace = async () => {
      const q = document.getElementById("q").value;
      try {
        const t = await api("/api/recall-trace?scopeKey=" + encodeURIComponent(current) + "&query=" + encodeURIComponent(q));
        let h = "<table><tr><th>memoryId</th><th>returned</th><th>why</th><th>scores</th></tr>";
        for (const tr of t.candidateTraces) h += "<tr><td><code>" + esc(tr.memoryId) + "</code></td><td>" + esc(tr.returned) + "</td><td>" + esc(tr.whyReturned || tr.whySuppressed || "") + "</td><td class='muted'>i:" + esc(tr.intentScore) + " l:" + esc(tr.lexicalScore) + " s:" + esc(tr.semanticScore) + "</td></tr>";
        document.getElementById("traceout").innerHTML = h + "</table>";
      } catch (e) { document.getElementById("traceout").innerHTML = '<p class="banner">' + esc(e.message) + "</p>"; }
    };

    loadScopes().catch((e) => { document.getElementById("scopes").textContent = e.message; });
  </script>
</body>
</html>`;
}
