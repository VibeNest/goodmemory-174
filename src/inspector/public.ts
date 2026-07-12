import { randomBytes } from "node:crypto";

import type { GoodMemory } from "../api/contracts";
import type { DocumentStore } from "../storage/contracts";
import { createAdminApi } from "./adminApi";
import { serveInspectorWeb } from "./webAssets";

export type InspectorBindHost = "127.0.0.1";

export interface InspectorServerDescriptor {
  audited: true;
  bindHost: InspectorBindHost;
  cors: false;
  gated: true;
  mutationRoutes: boolean;
  rawTranscript: false;
  readOnly: boolean;
  tokenRequired: true;
}

export interface CreateInspectorAppInput {
  allowedScopeKey?: string;
  bindHost?: string;
  documentStore: DocumentStore;
  homeRoot?: string;
  memory: GoodMemory;
  newActionId?: () => string;
  newRequestId?: () => string;
  now?: () => Date;
  readOnly?: boolean;
  token?: string;
  webRoot?: string;
}

export interface InspectorApp {
  fetch(request: Request): Promise<Response>;
  token: string;
}

export interface InspectorServerHandle {
  bindHost: InspectorBindHost;
  port: number;
  stop(): void;
  token: string;
  url: string;
}

export function normalizeInspectorBindHost(
  value: string | undefined,
): InspectorBindHost {
  if (value === undefined || value === "" || value === "127.0.0.1") {
    return "127.0.0.1";
  }
  throw new Error("GoodMemory Inspector only binds 127.0.0.1.");
}

export function createInspectorToken(): string {
  return `gminspector_${randomBytes(32).toString("base64url")}`;
}

export function createInspectorApp(input: CreateInspectorAppInput): InspectorApp {
  normalizeInspectorBindHost(input.bindHost);
  const token = input.token ?? createInspectorToken();
  if (token !== token.trim()) {
    throw new Error("GoodMemory Inspector token must not contain surrounding whitespace.");
  }
  if (token.trim().length < 12) {
    throw new Error("GoodMemory Inspector requires a local token of at least 12 characters.");
  }
  const adminApi = createAdminApi({
    allowedScopeKey: input.allowedScopeKey,
    documentStore: input.documentStore,
    homeRoot: input.homeRoot,
    memory: input.memory,
    newActionId: input.newActionId,
    newRequestId: input.newRequestId,
    now: input.now,
    readOnly: input.readOnly,
    token,
  });

  return {
    token,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/admin/v1" || url.pathname.startsWith("/admin/v1/")) {
        return adminApi.fetch(request);
      }
      const method = request.method.toUpperCase();
      if (method === "GET" || method === "HEAD") {
        return serveInspectorWeb(request, input.webRoot);
      }
      return new Response(
        `${JSON.stringify({
          error: {
            code: "method_not_allowed",
            message: "Only the Admin API accepts non-GET requests.",
          },
        })}\n`,
        {
          headers: { "content-type": "application/json; charset=utf-8" },
          status: 405,
        },
      );
    },
  };
}

export function serveInspector(
  input: CreateInspectorAppInput & { port?: number },
): InspectorServerHandle {
  const bindHost = normalizeInspectorBindHost(input.bindHost);
  const app = createInspectorApp({ ...input, bindHost });
  const server = Bun.serve({
    fetch: app.fetch,
    hostname: bindHost,
    port: input.port ?? 0,
  });
  const port = server.port ?? input.port ?? 0;
  return {
    bindHost,
    port,
    stop() {
      server.stop(true);
    },
    token: app.token,
    url: `http://${bindHost}:${port}/#token=${encodeURIComponent(app.token)}`,
  };
}

export function buildDescriptor(
  bindHost: InspectorBindHost,
  readOnly = false,
): InspectorServerDescriptor {
  return {
    audited: true,
    bindHost,
    cors: false,
    gated: true,
    mutationRoutes: !readOnly,
    rawTranscript: false,
    readOnly,
    tokenRequired: true,
  };
}
