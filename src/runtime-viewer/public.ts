import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { ExportMemoryResult } from "../api/contracts";
import {
  createInstalledHostMemory,
  resolveInstalledHostContext,
} from "../install/hostExecutionContext";
import {
  createInstalledHostProgressiveRecallService,
  resolveInstalledHostProgressiveScopeDigest,
} from "../install/hostProgressiveRecall";
import { resolveInstallRoot } from "../install/hostRuntimeConfig";
import { inspectInstalledHostWritebackAudit } from "../install/hostWritebackAuditRuntime";
import {
  parseGoodMemoryRecordRef,
} from "../progressive/recall";
import {
  createRuntimeWorkerQueue,
} from "../runtime-worker/public";
import type {
  CreateInstalledHostRuntimeViewerAppInput,
  CreateRuntimeViewerAppInput,
  RuntimeViewerApp,
  RuntimeViewerBindHost,
  RuntimeViewerHandoff,
  RuntimeViewerMemoryCounts,
  RuntimeViewerServerHandle,
  RuntimeViewerSessionSummary,
  RuntimeViewerSummary,
  RuntimeViewerTraceSummary,
  RuntimeViewerWorkerSummary,
  RuntimeViewerWritebackAuditSummary,
} from "./contracts";

const DEFAULT_VIEWER_LIMIT = 12;
const DEFAULT_VIEWER_PORT = 0;
const VIEWER_TOKEN_BYTES = 32;
const MAX_VIEWER_TEXT_CHARS = 600;

export function createRuntimeViewerToken(): string {
  return `gmviewer_${randomBytes(VIEWER_TOKEN_BYTES).toString("base64url")}`;
}

export function normalizeRuntimeViewerBindHost(
  value: string | undefined,
): RuntimeViewerBindHost {
  if (value === undefined || value === "" || value === "127.0.0.1") {
    return "127.0.0.1";
  }

  throw new Error("GoodMemory runtime viewer v1 only binds 127.0.0.1.");
}

export function createRuntimeViewerApp(
  input: CreateRuntimeViewerAppInput,
): RuntimeViewerApp {
  const bindHost = normalizeRuntimeViewerBindHost(input.bindHost);
  const token = input.token ?? createRuntimeViewerToken();
  if (token.trim().length < 12) {
    throw new Error("GoodMemory runtime viewer requires a local token.");
  }
  const now = input.now ?? (() => new Date());

  async function buildSummary(query: string | undefined): Promise<RuntimeViewerSummary> {
    const exported = await input.memory.exportMemory({
      includeRuntime: true,
      scope: input.scope,
    });
    const recall = await input.memory.recall({
      query: query ?? "",
      retrievalProfile: "coding_agent",
      scope: input.scope,
    });
    const writebackAudit = input.loadWritebackAudit
      ? summarizeWritebackAudit(await input.loadWritebackAudit(), input.scope)
      : undefined;
    const worker = input.loadRuntimeWorkerStatus
      ? summarizeWorkerStatus(await input.loadRuntimeWorkerStatus())
      : undefined;

    return sanitizeViewerValue({
      generatedAt: now().toISOString(),
      host: input.host,
      memoryCounts: countExportedMemory(exported),
      readOnly: true,
      runtimeSessions: summarizeRuntimeSessions({
        exported,
        scope: input.scope,
        scopeDigest: input.scopeDigest,
      }),
      scopeDigest: input.scopeDigest,
      traceSummaries: summarizeTraces({
        recall,
        scopeDigest: input.scopeDigest,
      }),
      viewer: {
        bindHost,
        cors: false,
        mutationRoutes: false,
        rawTranscript: false,
        tokenRequired: true,
      },
      ...(worker ? { worker } : {}),
      ...(writebackAudit ? { writebackAudit } : {}),
    }, input.scope) as RuntimeViewerSummary;
  }

  async function handleGet(url: URL): Promise<Response> {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return htmlResponse(renderRuntimeViewerShell());
    }

    if (url.pathname === "/api/summary") {
      return jsonResponse(await buildSummary(readOptionalQuery(url, "query")));
    }

    if (url.pathname === "/api/recall-index") {
      const index = await input.progressiveRecall.searchRecallIndex({
        includeRuntime: true,
        limit: readPositiveIntegerQuery(url, "limit") ?? DEFAULT_VIEWER_LIMIT,
        query: readOptionalQuery(url, "query") ?? "",
        retrievalProfile: "coding_agent",
        scope: input.scope,
      });
      return jsonResponse(sanitizeViewerValue(index, input.scope));
    }

    if (url.pathname === "/api/timeline") {
      const timeline = await input.progressiveRecall.buildRecallTimeline({
        includeRuntime: true,
        limit: readPositiveIntegerQuery(url, "limit") ?? DEFAULT_VIEWER_LIMIT,
        query: readOptionalQuery(url, "query") ?? "",
        retrievalProfile: "coding_agent",
        scope: input.scope,
      });
      return jsonResponse(sanitizeViewerValue(timeline, input.scope));
    }

    if (url.pathname === "/api/records") {
      const recordRefs = readRecordRefs(url);
      if (recordRefs.length === 0) {
        return jsonError("At least one recordRef is required.", 400);
      }
      try {
        const records = await input.progressiveRecall.getProgressiveRecords({
          recordRefs,
          scope: input.scope,
        });
        return jsonResponse(sanitizeViewerValue(records, input.scope));
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : String(error), 403);
      }
    }

    if (url.pathname === "/api/writeback-audit") {
      if (!input.loadWritebackAudit) {
        return jsonResponse({
          available: false,
          events: [],
        });
      }
      return jsonResponse(
        sanitizeViewerValue(
          summarizeWritebackAudit(await input.loadWritebackAudit(), input.scope),
          input.scope,
        ),
      );
    }

    if (url.pathname === "/api/runtime-sessions") {
      const exported = await input.memory.exportMemory({
        includeRuntime: true,
        scope: input.scope,
      });
      return jsonResponse(
        sanitizeViewerValue(
          {
            sessions: summarizeRuntimeSessions({
              exported,
              scope: input.scope,
              scopeDigest: input.scopeDigest,
            }),
          },
          input.scope,
        ),
      );
    }

    if (url.pathname === "/api/traces") {
      const recall = await input.memory.recall({
        query: readOptionalQuery(url, "query") ?? "",
        retrievalProfile: "coding_agent",
        scope: input.scope,
      });
      return jsonResponse(
        sanitizeViewerValue(
          {
            traces: summarizeTraces({
              recall,
              scopeDigest: input.scopeDigest,
            }),
          },
          input.scope,
        ),
      );
    }

    if (url.pathname === "/api/handoff") {
      const handoff = createHandoff({
        action: readHandoffAction(url),
        host: input.host,
        recordRef: readRequiredQuery(url, "recordRef"),
        scopeDigest: input.scopeDigest,
      });
      return jsonResponse(handoff);
    }

    return jsonError("Not found.", 404);
  }

  return {
    token,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (isMutationMethod(request.method)) {
        return jsonError("GoodMemory runtime viewer is read-only.", 405);
      }
      if (!isAuthorized(request, url, token)) {
        return jsonError("GoodMemory runtime viewer token is required.", 401);
      }

      try {
        return await handleGet(url);
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : String(error), 400);
      }
    },
  };
}

export async function createInstalledHostRuntimeViewerApp(
  input: CreateInstalledHostRuntimeViewerAppInput,
): Promise<RuntimeViewerApp> {
  const resolved = await resolveInstalledHostContext({
    cwd: input.cwd,
    homeRoot: input.homeRoot,
    host: input.host,
  });
  if (resolved.status !== "ok") {
    throw new Error(`Cannot start GoodMemory runtime viewer: ${resolved.status}.`);
  }

  const memory = createInstalledHostMemory(resolved.context);
  const progressiveRecall = await createInstalledHostProgressiveRecallService({
    context: resolved.context,
    homeRoot: input.homeRoot,
  });
  const scopeDigest = await resolveInstalledHostProgressiveScopeDigest({
    context: resolved.context,
    homeRoot: input.homeRoot,
  });
  const queueFile =
    input.queueFile ?? join(resolveInstallRoot(input.homeRoot), "runtime-worker.json");
  const queue = createRuntimeWorkerQueue({ queueFile });

  return createRuntimeViewerApp({
    bindHost: input.bindHost,
    host: input.host,
    loadRuntimeWorkerStatus: () => queue.status(),
    loadWritebackAudit: () => inspectInstalledHostWritebackAudit({
      cwd: input.cwd,
      homeRoot: input.homeRoot,
      host: input.host,
    }),
    memory,
    progressiveRecall,
    scope: resolved.context.scope,
    scopeDigest,
    token: input.token,
  });
}

export async function serveRuntimeViewer(
  input: CreateInstalledHostRuntimeViewerAppInput,
): Promise<RuntimeViewerServerHandle> {
  const bindHost = normalizeRuntimeViewerBindHost(input.bindHost);
  const token = input.token ?? createRuntimeViewerToken();
  const app = await createInstalledHostRuntimeViewerApp({
    ...input,
    bindHost,
    token,
  });
  const server = Bun.serve({
    fetch: app.fetch,
    hostname: bindHost,
    port: input.port ?? DEFAULT_VIEWER_PORT,
  });
  const url = `http://${bindHost}:${server.port}/?token=${encodeURIComponent(token)}`;

  return {
    bindHost,
    port: server.port ?? input.port ?? DEFAULT_VIEWER_PORT,
    stop() {
      server.stop(true);
    },
    token,
    url,
  };
}

function isMutationMethod(method: string): boolean {
  return ["DELETE", "PATCH", "POST", "PUT"].includes(method.toUpperCase());
}

function isAuthorized(request: Request, url: URL, token: string): boolean {
  const authorization = request.headers.get("authorization");
  if (authorization === `Bearer ${token}`) {
    return true;
  }

  return url.searchParams.get("token") === token;
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

function readPositiveIntegerQuery(url: URL, name: string): number | undefined {
  const value = readOptionalQuery(url, name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function readRecordRefs(url: URL): string[] {
  return [
    ...url.searchParams.getAll("recordRef"),
    ...(url.searchParams.get("recordRefs") ?? "").split(","),
  ]
    .map((value) => value.trim())
    .filter(Boolean);
}

function readHandoffAction(url: URL): RuntimeViewerHandoff["action"] {
  const value = readOptionalQuery(url, "action") ?? "forget";
  if (value === "forget" || value === "revise") {
    return value;
  }
  throw new Error("Unsupported handoff action.");
}

function createHandoff(input: {
  action: RuntimeViewerHandoff["action"];
  host: string;
  recordRef: string;
  scopeDigest: string;
}): RuntimeViewerHandoff {
  const parsed = parseGoodMemoryRecordRef(input.recordRef);
  if (!parsed) {
    throw new Error("Handoff requires a valid gmrec:v1 recordRef.");
  }
  if (parsed.scopeDigest !== input.scopeDigest) {
    throw new Error("Handoff recordRef does not belong to the current viewer scope.");
  }
  const recordId = parsed.id;
  const command = input.action === "forget"
    ? [
        "goodmemory",
        "forget",
        "--host",
        shellEscape(input.host),
        "--memory-id",
        shellEscape(recordId),
      ].join(" ")
    : [
        "goodmemory",
        "feedback",
        "--host",
        shellEscape(input.host),
        "--signal",
        shellEscape(`Revise ${input.recordRef}: <write revised memory>`),
      ].join(" ");

  return {
    action: input.action,
    command,
    executed: false,
    recordId,
    recordKind: parsed.recordKind,
    recordRef: input.recordRef,
  };
}

function countExportedMemory(exported: ExportMemoryResult): RuntimeViewerMemoryCounts {
  const durable = {
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
  };

  return {
    durable: {
      ...durable,
      total: Object.values(durable).reduce((sum, count) => sum + count, 0),
    },
    runtime: {
      artifactSpills: exported.runtime?.spills.length ?? 0,
      journal: exported.runtime?.journal ? 1 : 0,
      workingMemory: exported.runtime?.workingMemory ? 1 : 0,
    },
  };
}

function summarizeRuntimeSessions(input: {
  exported: ExportMemoryResult;
  scope: ExportMemoryResult["scope"];
  scopeDigest: string;
}): RuntimeViewerSessionSummary[] {
  const journal = input.exported.runtime?.journal;
  if (!journal) {
    return [];
  }

  return [
    {
      ...(journal.currentState
        ? { currentState: redactScopeText(journal.currentState, input.scope) }
        : {}),
      learningsCount: journal.learnings?.length ?? 0,
      rawTranscriptPersisted: false,
      scopeDigest: input.scopeDigest,
      ...(journal.title
        ? { title: redactScopeText(journal.title, input.scope) }
        : {}),
      updatedAt: journal.updatedAt,
      worklogCount: journal.worklog.length,
    },
  ];
}

function summarizeTraces(input: {
  recall: Awaited<ReturnType<CreateRuntimeViewerAppInput["memory"]["recall"]>>;
  scopeDigest: string;
}): RuntimeViewerTraceSummary[] {
  return [
    {
      candidateTraceCount: input.recall.metadata.candidateTraces.length,
      hitCount: input.recall.metadata.hits.length,
      latencyMs: input.recall.metadata.latencyMs,
      policyApplied: input.recall.metadata.policyApplied,
      scopeDigest: input.scopeDigest,
      tokenCount: input.recall.metadata.tokenCount,
      ...(input.recall.metadata.traceId
        ? { traceId: input.recall.metadata.traceId }
        : {}),
    },
  ];
}

function summarizeWritebackAudit(
  audit: Awaited<ReturnType<NonNullable<CreateRuntimeViewerAppInput["loadWritebackAudit"]>>>,
  scope: ExportMemoryResult["scope"],
): RuntimeViewerWritebackAuditSummary {
  return {
    events: audit.events.map((event) => ({
      contentPreview: redactScopeText(event.contentPreview, scope),
      eventId: event.eventId,
      kind: event.kind,
      linkedRecordExistsCount: event.linkedRecordExistsCount,
      memoryExistsCount: event.memoryExistsCount,
      mode: event.mode,
      occurredAt: event.occurredAt,
      reason: redactScopeText(event.reason, scope),
      recallHitCount: event.recallHitCount,
      scopeDigest: event.scopeDigest,
      ...(event.sessionDigest ? { sessionDigest: event.sessionDigest } : {}),
      source: event.source,
      status: event.status,
      updatedAt: event.updatedAt,
    })),
    host: audit.host,
    legacyEventCount: audit.legacyEventCount,
    legacyUnscopedEventCount: audit.legacyUnscopedEventCount,
    pendingCount: audit.pendingCount,
  };
}

function summarizeWorkerStatus(
  status: Awaited<ReturnType<NonNullable<CreateRuntimeViewerAppInput["loadRuntimeWorkerStatus"]>>>,
): RuntimeViewerWorkerSummary {
  return {
    audits: status.audits.slice(-20).map((audit) => ({
      action: audit.action,
      at: audit.at,
      ...(audit.jobId ? { jobId: audit.jobId } : {}),
      ...(audit.reason ? { reason: redactViewerText(audit.reason) } : {}),
    })),
    counts: status.counts,
    daemon: status.daemon,
    queueFile: status.queueFile,
    stuckJobs: status.stuckJobs.map((job) => ({
      attempts: job.attempts,
      jobId: job.jobId,
      kind: job.kind,
      status: job.status,
      updatedAt: job.updatedAt,
    })),
  };
}

export function sanitizeViewerValue(
  value: unknown,
  scope: ExportMemoryResult["scope"],
  parentKey?: string,
): unknown {
  if (typeof value === "string") {
    if (parentKey === "host") {
      return redactViewerText(value);
    }
    return redactScopeText(redactViewerText(value), scope);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeViewerValue(item, scope, parentKey));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if ((isRawTranscriptKey(key) && nested !== false) || isRawScopeKey(key)) {
        continue;
      }
      result[key] = sanitizeViewerValue(nested, scope, key);
    }
    return result;
  }
  return value;
}

function isRawTranscriptKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === "normalizedtranscript" ||
    normalized === "rawtranscript" ||
    normalized === "rawtranscriptcontent";
}

function isRawScopeKey(key: string): boolean {
  return [
    "agentId",
    "scope",
    "scopeLineage",
    "sessionId",
    "sourceSessionIds",
    "tenantId",
    "userId",
    "workspaceId",
  ].includes(key);
}

export function redactScopeText(value: string, scope: ExportMemoryResult["scope"]): string {
  const replacements: Array<[string | undefined, string]> = [
    [scope.userId, "[user]"],
    [scope.tenantId, "[tenant]"],
    [scope.workspaceId, "[workspace]"],
    [scope.agentId, "[agent]"],
    [scope.sessionId, "[session]"],
  ];
  let result = value;
  for (const [raw, replacement] of replacements) {
    if (raw) {
      result = result.split(raw).join(replacement);
    }
  }
  return result;
}

export function redactViewerText(value: string): string {
  const redacted = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[redacted-email]")
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/gu, "[redacted-secret]")
    .replace(
      /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^:\s/@]+:[^\s/@]+@/gu,
      "[redacted-url-auth]@",
    )
    .replace(
      /\b(?:api[_-]?key|password|secret|token)\s*[:=]\s*[^\s,;]+/giu,
      "[redacted-secret]",
    );

  if (redacted.length <= MAX_VIEWER_TEXT_CHARS) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_VIEWER_TEXT_CHARS - 3).trimEnd()}...`;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: noCorsHeaders({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    }),
    status,
  });
}

function jsonError(error: string, status: number): Response {
  return jsonResponse({
    error,
    readOnly: true,
  }, status);
}

function htmlResponse(content: string): Response {
  return new Response(content, {
    headers: noCorsHeaders({
      "cache-control": "no-store",
      "content-security-policy": "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
    }),
  });
}

function noCorsHeaders(values: Record<string, string>): Headers {
  return new Headers(values);
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

function renderRuntimeViewerShell(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GoodMemory Local Viewer</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f7f7f4;
      color: #171717;
    }
    body {
      margin: 0;
      min-height: 100vh;
    }
    main {
      margin: 0 auto;
      max-width: 1160px;
      padding: 28px;
    }
    header {
      align-items: end;
      border-bottom: 1px solid #d9d7cf;
      display: flex;
      gap: 18px;
      justify-content: space-between;
      padding-bottom: 18px;
    }
    h1 {
      font-size: 24px;
      font-weight: 650;
      letter-spacing: 0;
      margin: 0;
    }
    h2 {
      font-size: 15px;
      margin: 0 0 10px;
    }
    .scope {
      color: #5f6159;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .toolbar {
      align-items: center;
      display: flex;
      gap: 8px;
    }
    input {
      border: 1px solid #c8c5bd;
      border-radius: 6px;
      font: inherit;
      min-width: 240px;
      padding: 8px 10px;
    }
    button {
      border: 1px solid #222;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
      padding: 8px 11px;
    }
    .grid {
      display: grid;
      gap: 18px;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
      margin-top: 20px;
    }
    section {
      border-top: 1px solid #d9d7cf;
      padding-top: 14px;
    }
    .metrics {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    }
    .metric {
      border: 1px solid #d9d7cf;
      border-radius: 8px;
      padding: 10px;
    }
    .metric strong {
      display: block;
      font-size: 22px;
    }
    .list {
      display: grid;
      gap: 8px;
    }
    .row {
      border: 1px solid #d9d7cf;
      border-radius: 8px;
      padding: 10px;
    }
    .row code {
      display: block;
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    pre {
      background: #1f2520;
      border-radius: 8px;
      color: #edf3ed;
      overflow: auto;
      padding: 12px;
      white-space: pre-wrap;
    }
    @media (max-width: 820px) {
      main {
        padding: 18px;
      }
      header,
      .toolbar {
        align-items: stretch;
        flex-direction: column;
      }
      input,
      button {
        width: 100%;
      }
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>GoodMemory Local Viewer</h1>
        <div class="scope" id="scope"></div>
      </div>
      <div class="toolbar">
        <input id="query" placeholder="Search memory" autocomplete="off">
        <button id="refresh" type="button">Refresh</button>
      </div>
    </header>
    <div class="grid">
      <div>
        <section>
          <h2>Memory Counts</h2>
          <div class="metrics" id="counts"></div>
        </section>
        <section>
          <h2>Recall Index</h2>
          <div class="list" id="records"></div>
        </section>
      </div>
      <div>
        <section>
          <h2>Audit</h2>
          <div class="list" id="audit"></div>
        </section>
        <section>
          <h2>Trace</h2>
          <pre id="trace">{}</pre>
        </section>
        <section>
          <h2>Detail</h2>
          <pre id="detail">{}</pre>
        </section>
      </div>
    </div>
  </main>
  <script>
    const token = new URLSearchParams(location.search).get("token") || "";
    const headers = { authorization: "Bearer " + token };
    const queryInput = document.getElementById("query");
    const scope = document.getElementById("scope");
    const counts = document.getElementById("counts");
    const records = document.getElementById("records");
    const audit = document.getElementById("audit");
    const trace = document.getElementById("trace");
    const detail = document.getElementById("detail");
    async function get(path) {
      const response = await fetch(path, { headers });
      if (!response.ok) throw new Error(await response.text());
      return await response.json();
    }
    function text(value) {
      return value === undefined || value === null ? "" : String(value);
    }
    function html(value) {
      return text(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    async function load() {
      const query = encodeURIComponent(queryInput.value || "");
      const summary = await get("/api/summary?query=" + query);
      const index = await get("/api/recall-index?query=" + query);
      scope.textContent = summary.scopeDigest;
      counts.innerHTML = Object.entries(summary.memoryCounts.durable).map(([key, value]) =>
        '<div class="metric"><strong>' + value + '</strong><span>' + key + '</span></div>'
      ).join("");
      audit.innerHTML = (summary.writebackAudit?.events || []).map((event) =>
        '<div class="row"><strong>' + html(event.status) + '</strong><div>' + html(event.contentPreview) + '</div><code>' + html(event.eventId) + '</code></div>'
      ).join("") || '<div class="row">No audit events</div>';
      trace.textContent = JSON.stringify(summary.traceSummaries, null, 2);
      records.innerHTML = index.records.map((record) =>
        '<button class="row" data-ref="' + html(record.recordRef) + '" type="button"><strong>' + html(record.title) + '</strong><div>' + html(record.summary) + '</div><code>' + html(record.recordRef) + '</code></button>'
      ).join("") || '<div class="row">No records</div>';
      for (const item of records.querySelectorAll("[data-ref]")) {
        item.addEventListener("click", async () => {
          const recordRef = item.getAttribute("data-ref");
          const data = await get("/api/records?recordRef=" + encodeURIComponent(recordRef));
          detail.textContent = JSON.stringify(data, null, 2);
        });
      }
    }
    document.getElementById("refresh").addEventListener("click", load);
    load().catch((error) => { detail.textContent = String(error); });
  </script>
</body>
</html>`;
}
