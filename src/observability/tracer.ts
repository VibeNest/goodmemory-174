import { createHmac, randomBytes } from "node:crypto";
import type { MemoryScope } from "../domain/scope";
import type {
  GoodMemoryObservabilityConfig,
  GoodMemoryScopeDigest,
  GoodMemoryTraceAttributeValue,
  GoodMemoryTraceLink,
  GoodMemoryTraceSpan,
  GoodMemoryTraceSpanName,
} from "./contracts";

const MIN_SCOPE_DIGEST_SECRET_LENGTH = 16;
const UNKNOWN_SCOPE_HASH =
  "hmac-sha256:0000000000000000000000000000000000000000000000000000000000000000";

export interface TraceSpanCompletionInput {
  attributes?: Record<string, GoodMemoryTraceAttributeValue>;
  links?: GoodMemoryTraceLink[];
}

export interface TraceSpanFailureInput extends TraceSpanCompletionInput {
  error: unknown;
}

export interface GoodMemoryTraceHandle {
  traceId?: string;
  scopeDigest: GoodMemoryScopeDigest;
  succeeded(input?: TraceSpanCompletionInput): Promise<void>;
  failed(input: TraceSpanFailureInput): Promise<void>;
  blocked(input?: TraceSpanCompletionInput): Promise<void>;
}

export interface GoodMemoryTracer {
  enabled: boolean;
  digestScope(scope: MemoryScope): GoodMemoryScopeDigest;
  start(input: {
    attributes?: Record<string, GoodMemoryTraceAttributeValue>;
    name: GoodMemoryTraceSpanName;
    scope?: MemoryScope;
    scopeDigest?: GoodMemoryScopeDigest;
  }): Promise<GoodMemoryTraceHandle>;
}

function hashScopeValue(
  field: keyof GoodMemoryScopeDigest,
  value: string | undefined,
  secret: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return `hmac-sha256:${createHmac("sha256", secret)
    .update(field)
    .update(":")
    .update(value)
    .digest("hex")}`;
}

function buildUnknownScopeDigest(): GoodMemoryScopeDigest {
  return {
    userIdHash: UNKNOWN_SCOPE_HASH,
  };
}

function digestScope(scope: MemoryScope, secret: string): GoodMemoryScopeDigest {
  return {
    userIdHash: hashScopeValue("userIdHash", scope.userId, secret) ?? UNKNOWN_SCOPE_HASH,
    tenantIdHash: hashScopeValue("tenantIdHash", scope.tenantId, secret),
    workspaceIdHash: hashScopeValue("workspaceIdHash", scope.workspaceId, secret),
    agentIdHash: hashScopeValue("agentIdHash", scope.agentId, secret),
    sessionIdHash: hashScopeValue("sessionIdHash", scope.sessionId, secret),
  };
}

function normalizeAttributes(
  attributes: Record<string, GoodMemoryTraceAttributeValue> | undefined,
): Record<string, GoodMemoryTraceAttributeValue> | undefined {
  if (!attributes) {
    return undefined;
  }

  const entries = Object.entries(attributes).filter(
    ([, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean",
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function mergeAttributes(
  base: Record<string, GoodMemoryTraceAttributeValue> | undefined,
  next: Record<string, GoodMemoryTraceAttributeValue> | undefined,
): Record<string, GoodMemoryTraceAttributeValue> | undefined {
  return normalizeAttributes({
    ...(base ?? {}),
    ...(next ?? {}),
  });
}

function dedupeLinks(links: GoodMemoryTraceLink[] | undefined): GoodMemoryTraceLink[] | undefined {
  if (!links || links.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  const deduped: GoodMemoryTraceLink[] = [];
  for (const link of links) {
    const key = `${link.type}:${link.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(link);
  }

  return deduped;
}

function resolveErrorAttributes(error: unknown): Record<string, GoodMemoryTraceAttributeValue> {
  if (error instanceof Error) {
    return {
      errorType: error.name,
    };
  }

  return {
    errorType: typeof error,
  };
}

function resolveScopeDigestSecret(
  config: GoodMemoryObservabilityConfig | undefined,
): string {
  if (config?.scopeDigestSecret !== undefined) {
    if (config.scopeDigestSecret.length < MIN_SCOPE_DIGEST_SECRET_LENGTH) {
      throw new Error(
        "GoodMemory observability scopeDigestSecret must be at least 16 characters.",
      );
    }

    return config.scopeDigestSecret;
  }

  return randomBytes(32).toString("base64url");
}

function logSinkError(error: unknown): void {
  console.error(
    "GoodMemory trace sink failed",
    error instanceof Error ? error.name : typeof error,
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

export function createGoodMemoryTracer(
  config: GoodMemoryObservabilityConfig | undefined,
  now: () => Date,
): GoodMemoryTracer {
  const sink = config?.traceSink;
  const scopeDigestSecret = resolveScopeDigestSecret(config);

  async function emit(span: GoodMemoryTraceSpan): Promise<void> {
    if (!sink) {
      return;
    }

    try {
      const result = sink.emit(span);
      if (isPromiseLike(result)) {
        void Promise.resolve(result).catch(logSinkError);
      }
    } catch (error) {
      logSinkError(error);
    }
  }

  function buildSpan(input: {
    attributes?: Record<string, GoodMemoryTraceAttributeValue>;
    links?: GoodMemoryTraceLink[];
    name: GoodMemoryTraceSpanName;
    scopeDigest: GoodMemoryScopeDigest;
    spanId: string;
    status: GoodMemoryTraceSpan["status"];
    traceId: string;
  }): GoodMemoryTraceSpan {
    return {
      traceId: input.traceId,
      spanId: input.spanId,
      name: input.name,
      status: input.status,
      scopeDigest: input.scopeDigest,
      attributes: normalizeAttributes(input.attributes),
      links: dedupeLinks(input.links),
      redaction: {
        containsRawUserText: false,
      },
      occurredAt: now().toISOString(),
    };
  }

  return {
    enabled: Boolean(sink),
    digestScope: (scope) => digestScope(scope, scopeDigestSecret),
    async start(input) {
      const scopeDigest =
        input.scopeDigest ??
        (input.scope ? digestScope(input.scope, scopeDigestSecret) : buildUnknownScopeDigest());

      if (!sink) {
        return {
          scopeDigest,
          async succeeded() {},
          async failed() {},
          async blocked() {},
        };
      }

      const traceId = crypto.randomUUID();
      const spanId = crypto.randomUUID();
      const startedAttributes = normalizeAttributes(input.attributes);
      void emit(
        buildSpan({
          attributes: startedAttributes,
          name: input.name,
          scopeDigest,
          spanId,
          status: "started",
          traceId,
        }),
      );

      return {
        traceId,
        scopeDigest,
        succeeded: (completion) =>
          emit(
            buildSpan({
              attributes: mergeAttributes(startedAttributes, completion?.attributes),
              links: completion?.links,
              name: input.name,
              scopeDigest,
              spanId,
              status: "succeeded",
              traceId,
            }),
          ),
        failed: (failure) =>
          emit(
            buildSpan({
              attributes: mergeAttributes(
                mergeAttributes(startedAttributes, failure.attributes),
                resolveErrorAttributes(failure.error),
              ),
              links: failure.links,
              name: input.name,
              scopeDigest,
              spanId,
              status: "failed",
              traceId,
            }),
          ),
        blocked: (completion) =>
          emit(
            buildSpan({
              attributes: mergeAttributes(startedAttributes, completion?.attributes),
              links: completion?.links,
              name: input.name,
              scopeDigest,
              spanId,
              status: "blocked",
              traceId,
            }),
          ),
      };
    },
  };
}
