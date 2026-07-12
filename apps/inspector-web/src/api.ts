import type {
  AuditEvent,
  CandidateItem,
  InspectorDescriptor,
  MemoryItem,
  Page,
  ScopeItem,
} from "./types";

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function createAdminClient(token: string) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (init.body) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(path, { ...init, headers });
    const payload = (await response.json()) as {
      data?: T;
      error?: { code: string; message: string };
    };
    if (!response.ok || payload.data === undefined) {
      throw new AdminApiError(
        payload.error?.message ?? `Request failed with HTTP ${response.status}.`,
        payload.error?.code ?? "request_failed",
        response.status,
      );
    }
    return payload.data;
  }

  function mutationHeaders(etag: string): HeadersInit {
    return {
      "idempotency-key": crypto.randomUUID(),
      "if-match": etag,
    };
  }

  return {
    auditEvents: (scopeKey?: string, cursor?: string) =>
      request<Page<AuditEvent>>(
        withQuery("/admin/v1/audit-events", { cursor, scopeKey }),
      ),
    candidates: (scopeKey?: string, cursor?: string) =>
      request<Page<CandidateItem>>(
        withQuery("/admin/v1/candidates", { cursor, scopeKey }),
      ),
    descriptor: () => request<InspectorDescriptor>("/admin/v1/descriptor"),
    deleteMemory: (scopeKey: string, memory: MemoryItem) =>
      request<{ deleted: boolean; memoryId: string }>(
        `/admin/v1/scopes/${encodeURIComponent(scopeKey)}/memories/${encodeURIComponent(memory.id)}`,
        { headers: mutationHeaders(memory.etag), method: "DELETE" },
      ),
    deleteScope: (scope: ScopeItem) =>
      request<unknown>(`/admin/v1/scopes/${encodeURIComponent(scope.scopeKey)}`, {
        body: JSON.stringify({
          cascadeAware: true,
          confirmScopeKey: scope.scopeKey,
        }),
        headers: mutationHeaders(scope.etag),
        method: "DELETE",
      }),
    memories: (scopeKey: string, collection?: string, cursor?: string) =>
      request<Page<MemoryItem>>(
        withQuery(
          `/admin/v1/scopes/${encodeURIComponent(scopeKey)}/memories`,
          { collection, cursor },
        ),
      ),
    recallTrace: (scopeKey: string, query: string) =>
      request<Record<string, unknown>>("/admin/v1/recall-traces", {
        body: JSON.stringify({ query, scopeKey }),
        method: "POST",
      }),
    reviseMemory: (
      scopeKey: string,
      memory: MemoryItem,
      content: string,
      reason: string,
    ) =>
      request<unknown>(
        `/admin/v1/scopes/${encodeURIComponent(scopeKey)}/memories/${encodeURIComponent(memory.id)}/revisions`,
        {
          body: JSON.stringify({ content, reason }),
          headers: mutationHeaders(memory.etag),
          method: "POST",
        },
      ),
    scopes: (cursor?: string) =>
      request<Page<ScopeItem>>(withQuery("/admin/v1/scopes", { cursor })),
    transitionCandidate: (candidate: CandidateItem, status: string) =>
      request<unknown>(`/admin/v1/candidates/${encodeURIComponent(candidate.id)}`, {
        body: JSON.stringify({ scopeKey: candidate.scopeKey, status }),
        headers: mutationHeaders(candidate.etag),
        method: "PATCH",
      }),
  };
}

function withQuery(
  path: string,
  values: Record<string, string | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      query.set(key, value);
    }
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export type AdminClient = ReturnType<typeof createAdminClient>;
