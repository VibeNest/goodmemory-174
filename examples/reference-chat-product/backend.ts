#!/usr/bin/env bun
import {
  AsyncLocalStorage,
} from "node:async_hooks";
import {
  createGoodMemory,
} from "goodmemory";
import type {
  ExportMemoryResult,
  GoodMemory,
  GoodMemoryRuntimeAppendMessageInput,
  MemoryScope,
  RecallInput,
  RememberInput,
} from "goodmemory";
import {
  createGoodMemoryHttpMemoryBridge,
  createLifeCoachHttpRememberConfig,
} from "goodmemory/http";
import type {
  GoodMemoryHttpBridgeBody,
  GoodMemoryHttpBridgeOperation,
  GoodMemoryHttpMemoryItem,
  GoodMemoryHttpRecallRoutingDiagnostics,
} from "goodmemory/http";

export const REFERENCE_PRODUCT_COMMANDS = {
  bridge:
    "goodmemory-http-bridge --host 127.0.0.1 --port 8739 --profile life-coach --token <token>",
  fastapi:
    "GOODMEMORY_BRIDGE_URL=http://127.0.0.1:8739 GOODMEMORY_BRIDGE_TOKEN=<token> uvicorn fastapi_backend:app --reload",
  smoke: "bun run example:reference-product",
} as const;

export const REFERENCE_PRODUCT_BRIDGE_PATHS = {
  exportMemory: "/memory/export",
  feedback: "/memory/feedback",
  forget: "/memory/forget",
  recallContext: "/memory/recall-context",
  remember: "/memory/remember",
  revise: "/memory/revise",
} as const;

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8739";
const DEFAULT_BRIDGE_TOKEN = "phase45-reference-product-token";
const DEFAULT_SCOPE: MemoryScope = {
  agentId: "life-coach",
  sessionId: "phase45-reference-session",
  tenantId: "phase45-reference-tenant",
  userId: "phase45-reference-user",
  workspaceId: "phase45-reference-workspace",
};
const CHAT_REMEMBER_KEY_PREFIX = "chat:";
const EXPLICIT_REMEMBER_KEY_PREFIX = "explicit:";

export interface ReferenceProductBridgeRequest {
  body: Record<string, unknown>;
  operation: GoodMemoryHttpBridgeOperation;
  path: (typeof REFERENCE_PRODUCT_BRIDGE_PATHS)[keyof typeof REFERENCE_PRODUCT_BRIDGE_PATHS];
}

export interface ReferenceProductBackend {
  chat(input: ReferenceProductChatInput): Promise<ReferenceProductChatResult>;
  exportMemory(input?: ReferenceProductExportInput): Promise<ReferenceProductExportResult>;
  fetchBridge(input: ReferenceProductBridgeRequest): Promise<GoodMemoryHttpBridgeBody>;
  feedback(input: ReferenceProductFeedbackInput): Promise<ReferenceProductMutationResult>;
  forget(input: ReferenceProductForgetInput): Promise<ReferenceProductMutationResult>;
  recallContext(
    query: string,
    options?: ReferenceProductRecallOptions,
  ): Promise<ReferenceProductRecallResult>;
  remember(input: ReferenceProductRememberInput): Promise<ReferenceProductMutationResult>;
  revise(input: ReferenceProductReviseInput): Promise<ReferenceProductMutationResult>;
  scope: MemoryScope;
}

export interface ReferenceProductMutationResult {
  accepted: boolean;
}

interface ReferenceProductIdempotencyEntry<TResult> {
  digest: string;
  guardToken: string;
  promise: Promise<TResult>;
}

const idempotencyContext = new AsyncLocalStorage<ReadonlySet<string>>();

export interface ReferenceProductChatInput {
  message: string;
  remember?: boolean;
  turnId: string;
}

export interface ReferenceProductChatResult {
  contextIncluded: boolean;
  itemCount: number;
  memoryIds: string[];
  rememberAccepted: boolean;
  text: string;
  traceId?: string;
}

export interface ReferenceProductRecallResult {
  contextIncluded: boolean;
  contextText: string;
  itemCount: number;
  items: GoodMemoryHttpMemoryItem[];
  memoryIds: string[];
  routing?: GoodMemoryHttpRecallRoutingDiagnostics;
  traceId?: string;
}

export interface ReferenceProductRecallOptions {
  strategy?: Exclude<NonNullable<RecallInput["strategy"]>, "llm-assisted">;
}

export interface ReferenceProductRememberInput {
  annotations?: RememberInput["annotations"];
  idempotencyKey: string;
  message: string;
}

export interface ReferenceProductFeedbackInput {
  idempotencyKey: string;
  signal: string;
}

export interface ReferenceProductForgetInput {
  memoryId: string;
}

export interface ReferenceProductReviseInput {
  content: string;
  idempotencyKey: string;
  memoryId: string;
}

export interface ReferenceProductExportInput {
  includeRuntime?: boolean;
}

export interface ReferenceProductExportResult {
  factCount: number;
  feedbackCount: number;
  preferenceCount: number;
  profileCount: number;
  rawTranscriptPersisted: false;
  referenceCount: number;
}

export interface CreateReferenceProductBackendInput {
  bridgeFetch?: (request: Request) => Promise<Response>;
  bridgeToken?: string;
  bridgeUrl?: string;
  runtimeRecorder?: Pick<GoodMemory["runtime"], "appendMessage">;
  scope?: MemoryScope;
}

export interface InMemoryReferenceProductBackend {
  memory: GoodMemory;
  product: ReferenceProductBackend;
}

function withScope(
  body: Record<string, unknown>,
  scope: MemoryScope,
): Record<string, unknown> {
  return {
    ...body,
    scope,
  };
}

function stableDigest(value: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 16);
}

function ensureBridgeOk(
  body: GoodMemoryHttpBridgeBody,
  operation: GoodMemoryHttpBridgeOperation,
): asserts body is GoodMemoryHttpBridgeBody & { ok: true } {
  if (body.ok !== true) {
    throw new Error(`Reference product ${operation} bridge call failed.`);
  }
}

function bridgeItems(body: GoodMemoryHttpBridgeBody): GoodMemoryHttpMemoryItem[] {
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item): item is GoodMemoryHttpMemoryItem => (
    Boolean(item) &&
    typeof item === "object" &&
    typeof (item as GoodMemoryHttpMemoryItem).memoryId === "string" &&
    typeof (item as GoodMemoryHttpMemoryItem).content === "string"
  ));
}

function bridgeAccepted(body: GoodMemoryHttpBridgeBody): boolean {
  const result = (body as { result?: unknown }).result;
  if (!result || typeof result !== "object") {
    return body.ok === true;
  }

  const accepted = (result as { accepted?: unknown }).accepted;
  if (typeof accepted === "boolean") {
    return accepted;
  }

  const forgotten = (result as { forgotten?: unknown }).forgotten;
  if (typeof forgotten === "boolean") {
    return forgotten;
  }

  return body.ok === true;
}

async function runIdempotent<TResult>(input: {
  conflictMessage: string;
  digest: string;
  entries: Map<string, ReferenceProductIdempotencyEntry<TResult>>;
  guardNamespace: string;
  key: string;
  run(): Promise<TResult>;
}): Promise<TResult> {
  const activeKeys = idempotencyContext.getStore();
  const existing = input.entries.get(input.key);
  if (existing) {
    if (existing.digest !== input.digest) {
      throw new Error(input.conflictMessage);
    }
    if (activeKeys?.has(existing.guardToken)) {
      throw new Error(
        `${input.conflictMessage} The operation is already running in this execution context.`,
      );
    }

    return await existing.promise;
  }

  let resolvePromise: (value: TResult) => void = () => undefined;
  let rejectPromise: (reason: unknown) => void = () => undefined;
  const promise = new Promise<TResult>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const guardToken = `${input.guardNamespace}:${input.key}`;
  input.entries.set(input.key, {
    digest: input.digest,
    guardToken,
    promise,
  });

  const nextActiveKeys = new Set(activeKeys ?? []);
  nextActiveKeys.add(guardToken);
  void idempotencyContext.run(nextActiveKeys, async () => {
    try {
      resolvePromise(await input.run());
    } catch (error) {
      rejectPromise(error);
    }
  });

  return await promise;
}

function referenceAnswer(input: ReferenceProductRecallResult): string {
  const normalized = input.contextText.toLowerCase();
  if (normalized.includes("wind-down")) {
    return "Your quarterly priority is rebuilding your sleep routine with a consistent wind-down.";
  }
  if (normalized.includes("sleep routine")) {
    return "Your quarterly priority is rebuilding your sleep routine.";
  }
  if (input.contextIncluded) {
    return "I found relevant memory and will use it in this answer.";
  }

  return "Noted. I will carry that forward.";
}

async function appendRuntimeMessage(input: {
  content: string;
  recorder: CreateReferenceProductBackendInput["runtimeRecorder"];
  role: GoodMemoryRuntimeAppendMessageInput["message"]["role"];
  scope: MemoryScope;
}): Promise<void> {
  if (!input.recorder) {
    return;
  }

  await input.recorder.appendMessage({
    message: {
      content: input.content,
      role: input.role,
    },
    scope: input.scope,
  });
}

export function createReferenceProductBackend(
  input: CreateReferenceProductBackendInput = {},
): ReferenceProductBackend {
  const bridgeUrl = input.bridgeUrl ?? DEFAULT_BRIDGE_URL;
  const bridgeToken = input.bridgeToken ?? DEFAULT_BRIDGE_TOKEN;
  const bridgeFetch = input.bridgeFetch ?? fetch;
  const chatIdempotency = new Map<string, ReferenceProductIdempotencyEntry<ReferenceProductChatResult>>();
  const feedbackIdempotency = new Map<string, ReferenceProductIdempotencyEntry<ReferenceProductMutationResult>>();
  const rememberIdempotency = new Map<string, ReferenceProductIdempotencyEntry<ReferenceProductMutationResult>>();
  const runtimeRecorder = input.runtimeRecorder;
  const scope = input.scope ?? DEFAULT_SCOPE;

  const rememberWithProductKey = async (
    rememberInput: ReferenceProductRememberInput,
    productKey: string,
  ): Promise<ReferenceProductMutationResult> => {
    const digest = stableDigest(JSON.stringify({
      annotations: rememberInput.annotations ?? [],
      message: rememberInput.message,
    }));
    return await runIdempotent({
      conflictMessage:
        "Reference product remember idempotency key was reused for different content.",
      digest,
      entries: rememberIdempotency,
      guardNamespace: "remember",
      key: productKey,
      run: async () => {
        const body = await backend.fetchBridge({
          body: {
            ...(rememberInput.annotations
              ? { annotations: rememberInput.annotations }
              : {}),
            idempotencyKey: rememberInput.idempotencyKey,
            messages: [
              {
                content: rememberInput.message,
                role: "user",
              },
            ],
            mode: "sync",
          },
          operation: "remember",
          path: REFERENCE_PRODUCT_BRIDGE_PATHS.remember,
        });
        ensureBridgeOk(body, "remember");
        return { accepted: bridgeAccepted(body) };
      },
    });
  };

  const backend: ReferenceProductBackend = {
    async chat(chatInput) {
      const digest = stableDigest(JSON.stringify({
        message: chatInput.message,
        remember: chatInput.remember === true,
      }));
      return await runIdempotent({
        conflictMessage:
          "Reference product chat turnId was reused for different content.",
        digest,
        entries: chatIdempotency,
        guardNamespace: "chat",
        key: chatInput.turnId,
        run: async () => {
          await appendRuntimeMessage({
            content: chatInput.message,
            recorder: runtimeRecorder,
            role: "user",
            scope,
          });
          const recall = await backend.recallContext(chatInput.message);
          const text = referenceAnswer(recall);
          await appendRuntimeMessage({
            content: text,
            recorder: runtimeRecorder,
            role: "assistant",
            scope,
          });
          const remember = chatInput.remember
            ? await rememberWithProductKey(
                {
                  idempotencyKey: `${CHAT_REMEMBER_KEY_PREFIX}${chatInput.turnId}`,
                  message: chatInput.message,
                },
                `${CHAT_REMEMBER_KEY_PREFIX}${chatInput.turnId}`,
              )
            : { accepted: false };

          return {
            contextIncluded: recall.contextIncluded,
            itemCount: recall.itemCount,
            memoryIds: recall.memoryIds,
            rememberAccepted: remember.accepted,
            text,
            ...(recall.traceId ? { traceId: recall.traceId } : {}),
          };
        },
      });
    },
    async exportMemory(exportInput = {}) {
      const body = await backend.fetchBridge({
        body: {
          includeRuntime: exportInput.includeRuntime === true,
        },
        operation: "export",
        path: REFERENCE_PRODUCT_BRIDGE_PATHS.exportMemory,
      });
      ensureBridgeOk(body, "export");
      const exported = (body as { exported?: ExportMemoryResult }).exported;

      return {
        factCount: exported?.durable?.facts?.length ?? 0,
        feedbackCount: exported?.durable?.feedback?.length ?? 0,
        preferenceCount: exported?.durable?.preferences?.length ?? 0,
        profileCount: exported?.durable?.profile ? 1 : 0,
        rawTranscriptPersisted: false,
        referenceCount: exported?.durable?.references?.length ?? 0,
      };
    },
    async fetchBridge(requestInput) {
      const response = await bridgeFetch(new Request(`${bridgeUrl}${requestInput.path}`, {
        body: JSON.stringify(withScope(requestInput.body, scope)),
        headers: {
          authorization: `Bearer ${bridgeToken}`,
          "content-type": "application/json",
          "x-goodmemory-operations": "recall-context,remember,feedback,export,forget,revise",
          "x-goodmemory-tenant-id": scope.tenantId ?? "",
          "x-goodmemory-user-id": scope.userId,
          "x-goodmemory-workspace-id": scope.workspaceId ?? "",
        },
        method: "POST",
      }));
      return await response.json() as GoodMemoryHttpBridgeBody;
    },
    async feedback(feedbackInput) {
      const digest = stableDigest(feedbackInput.signal);
      return await runIdempotent({
        conflictMessage:
          "Reference product feedback idempotency key was reused for different content.",
        digest,
        entries: feedbackIdempotency,
        guardNamespace: "feedback",
        key: feedbackInput.idempotencyKey,
        run: async () => {
          const body = await backend.fetchBridge({
            body: {
              idempotencyKey: feedbackInput.idempotencyKey,
              signal: feedbackInput.signal,
              source: {
                system: "phase45-reference-product",
              },
            },
            operation: "feedback",
            path: REFERENCE_PRODUCT_BRIDGE_PATHS.feedback,
          });
          ensureBridgeOk(body, "feedback");
          return { accepted: bridgeAccepted(body) };
        },
      });
    },
    async forget(forgetInput) {
      const body = await backend.fetchBridge({
        body: {
          memoryId: forgetInput.memoryId,
        },
        operation: "forget",
        path: REFERENCE_PRODUCT_BRIDGE_PATHS.forget,
      });
      ensureBridgeOk(body, "forget");
      return { accepted: bridgeAccepted(body) };
    },
    async recallContext(query, options = {}) {
      const body = await backend.fetchBridge({
        body: {
          query,
          ...(options.strategy ? { strategy: options.strategy } : {}),
        },
        operation: "recall-context",
        path: REFERENCE_PRODUCT_BRIDGE_PATHS.recallContext,
      });
      ensureBridgeOk(body, "recall-context");
      const items = bridgeItems(body);

      return {
        contextIncluded: body.hasContext === true,
        contextText: typeof body.contextText === "string" ? body.contextText : "",
        itemCount: typeof body.itemCount === "number" ? body.itemCount : items.length,
        items,
        memoryIds: items.map((item) => item.memoryId),
        ...(body.routing ? { routing: body.routing } : {}),
        ...(typeof body.traceId === "string" ? { traceId: body.traceId } : {}),
      };
    },
    async remember(rememberInput) {
      return await rememberWithProductKey(
        rememberInput,
        `${EXPLICIT_REMEMBER_KEY_PREFIX}${rememberInput.idempotencyKey}`,
      );
    },
    async revise(reviseInput) {
      const body = await backend.fetchBridge({
        body: {
          evidence: {
            message: "User corrected this reference product memory.",
            source: "user_message",
          },
          idempotencyKey: reviseInput.idempotencyKey,
          reason: "user_correction",
          revision: {
            content: reviseInput.content,
          },
          target: {
            memoryId: reviseInput.memoryId,
          },
        },
        operation: "revise",
        path: REFERENCE_PRODUCT_BRIDGE_PATHS.revise,
      });
      ensureBridgeOk(body, "revise");
      return { accepted: bridgeAccepted(body) };
    },
    scope,
  };

  return backend;
}

export function createInMemoryReferenceProductBackend(
  input: { memory?: GoodMemory; scope?: MemoryScope } = {},
): InMemoryReferenceProductBackend {
  const scope = input.scope ?? DEFAULT_SCOPE;
  const memory = input.memory ?? createGoodMemory({
    remember: createLifeCoachHttpRememberConfig(),
    storage: { provider: "memory" },
  });
  const bridge = createGoodMemoryHttpMemoryBridge({
    memory,
    resolveCaller: () => ({
      authorizedOperations: "*",
      tenantId: scope.tenantId,
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    }),
  });
  const product = createReferenceProductBackend({
    bridgeFetch: bridge.fetch,
    bridgeUrl: "http://reference-product.local",
    runtimeRecorder: memory.runtime,
    scope,
  });

  return { memory, product };
}

export async function runReferenceProductSmoke(): Promise<{
  hasContext: boolean;
  itemCount: number;
  rememberAccepted: boolean;
}> {
  const { product } = createInMemoryReferenceProductBackend();
  const remember = await product.remember({
    idempotencyKey: "phase45-reference-product-smoke-remember",
    message: "My top priority this quarter is rebuilding my sleep routine.",
  });
  const recall = await product.recallContext("What is my quarterly priority?");

  return {
    hasContext: recall.contextIncluded,
    itemCount: recall.itemCount,
    rememberAccepted: remember.accepted,
  };
}

if (import.meta.main) {
  const mode = Bun.argv.at(2);
  if (mode !== "smoke") {
    console.error("Usage: bun run examples/reference-chat-product/backend.ts smoke");
    process.exit(1);
  }

  const result = await runReferenceProductSmoke();
  console.log(JSON.stringify(result, null, 2));
}
