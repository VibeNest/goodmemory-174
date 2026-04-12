import { anthropic } from "@ai-sdk/anthropic";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { embedMany } from "ai";
import { z } from "zod";
import type { EmbeddingAdapter } from "../embedding/contracts";
import { isModelProviderId } from "../provider/model-provider";
import type { ModelProviderId } from "../provider/model-provider";

export interface AISDKModelConfig {
  provider: ModelProviderId;
  model: string;
  apiKey?: string;
  baseURL?: string;
}

interface EmbeddingAdapterDependencies {
  embedMany?: typeof embedMany;
  resolveEmbeddingModel?: typeof resolveAISDKEmbeddingModel;
}

type FetchInput = Parameters<FetchFunction>[0];
type FetchInit = Parameters<FetchFunction>[1];
export type FetchLike = (input: FetchInput, init?: FetchInit) => Promise<Response>;
const DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS = 45_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isJsonContentType(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized.includes("application/json") || normalized.includes("+json");
}

function isMalformedOpenAICompatiblePayload(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  const error = payload.error;

  return payload.choices === null && (!error || typeof error !== "object");
}

function resolveFetchUrl(input: Parameters<FetchFunction>[0]): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

export function createOpenAICompatibleFetch(
  baseFetch: FetchLike = globalThis.fetch.bind(globalThis) as FetchLike,
): FetchFunction {
  const wrappedFetch = (async (input: FetchInput, init?: FetchInit) => {
    const response = await baseFetch(input, init);

    if (!response.ok || !isJsonContentType(response.headers.get("content-type"))) {
      return response;
    }

    let payload: unknown;

    try {
      payload = await response.clone().json();
    } catch {
      return response;
    }

    if (!isMalformedOpenAICompatiblePayload(payload)) {
      return response;
    }

    throw new Error(
      [
        "Malformed openai-compatible gateway response: expected choices array or error object.",
        `Received choices=null from ${resolveFetchUrl(input)}.`,
      ].join(" "),
    );
  }) as FetchFunction;

  wrappedFetch.preconnect = (globalThis.fetch as FetchFunction).preconnect;

  return wrappedFetch;
}

function shouldRetryAISDKError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();

  return (
    message.includes("malformed openai-compatible gateway response") ||
    message.includes("empty model response") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("temporarily unavailable") ||
    message.includes("connection reset") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("choices") && message.includes("received null") ||
    message.includes("type validation failed") ||
    message.includes("invalid input: expected array") ||
    message.includes("structured model response did not contain a json object") ||
    message.includes("structured model response was not valid json") ||
    message.includes("structured model response schema validation failed")
  );
}

export async function withAISDKRetries<T>(
  operation: () => Promise<T>,
  retryLimit = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= retryLimit || !shouldRetryAISDKError(error)) {
        throw error;
      }

      await sleep(250 * attempt);
    }
  }

  throw lastError;
}

export function stripThinkingBlocks(value: string): string {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function buildOpenAICompatibleUrl(baseURL: string): string {
  return `${baseURL.replace(/\/+$/, "")}/chat/completions`;
}

function buildOpenAICompatibleHeaders(config: AISDKModelConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };

  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }

  return headers;
}

function extractOpenAICompatibleErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return null;
  }

  const message = (error as Record<string, unknown>).message;
  return typeof message === "string" && message.trim().length > 0 ? message.trim() : null;
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (!part || typeof part !== "object" || Array.isArray(part)) {
        return "";
      }

      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

function extractOpenAICompatibleCompletionText(payload: unknown): string {
  const gatewayError = extractOpenAICompatibleErrorMessage(payload);
  if (gatewayError) {
    throw new Error(`OpenAI-compatible gateway error: ${gatewayError}`);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Malformed openai-compatible gateway response: expected a JSON object.");
  }

  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Malformed openai-compatible gateway response: missing choices array.");
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object" || Array.isArray(firstChoice)) {
    throw new Error("Malformed openai-compatible gateway response: invalid first choice.");
  }

  const choice = firstChoice as Record<string, unknown>;
  const message = choice.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const content = extractMessageText((message as Record<string, unknown>).content);
    if (content.trim().length > 0) {
      return content;
    }
  }

  const text = choice.text;
  if (typeof text === "string" && text.trim().length > 0) {
    return text;
  }

  throw new Error("Empty model response");
}

function extractOpenAICompatibleStreamText(payload: unknown): string {
  const gatewayError = extractOpenAICompatibleErrorMessage(payload);
  if (gatewayError) {
    throw new Error(`OpenAI-compatible gateway error: ${gatewayError}`);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Malformed openai-compatible gateway response: expected a JSON object.");
  }

  const choices = (payload as Record<string, unknown>).choices;
  if (choices === null) {
    throw new Error(
      "Malformed openai-compatible gateway response: expected choices array or error object.",
    );
  }

  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  let content = "";
  for (const item of choices) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const choice = item as Record<string, unknown>;
    const delta = choice.delta;
    if (delta && typeof delta === "object" && !Array.isArray(delta)) {
      content += extractMessageText((delta as Record<string, unknown>).content);
    }

    const message = choice.message;
    if (message && typeof message === "object" && !Array.isArray(message)) {
      content += extractMessageText((message as Record<string, unknown>).content);
    }

    const text = choice.text;
    if (typeof text === "string") {
      content += text;
    }
  }

  return content;
}

function extractStructuredJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Structured model response did not contain a JSON object.");
  }

  return raw.slice(start, end + 1);
}

function summarizeZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

function parseStructuredModelObject<T>(
  content: string,
  schema: z.ZodType<T>,
  normalizePayload?: (payload: unknown) => unknown,
): T {
  const normalized = stripThinkingBlocks(content);
  if (!normalized) {
    throw new Error("Empty model response");
  }

  let payload: unknown;

  try {
    payload = JSON.parse(extractStructuredJsonObject(normalized));
  } catch (error) {
    throw new Error(
      `Structured model response was not valid JSON: ${extractErrorMessage(error)}`,
    );
  }

  const parsed = schema.safeParse(normalizePayload ? normalizePayload(payload) : payload);
  if (!parsed.success) {
    throw new Error(
      `Structured model response schema validation failed: ${summarizeZodIssues(parsed.error)}`,
    );
  }

  return parsed.data;
}

async function withOpenAICompatibleTimeout<T>(input: {
  timeoutMs: number;
  message: string;
  onTimeout?: () => void;
  operation: () => Promise<T>;
}): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;

      try {
        input.onTimeout?.();
      } catch {
        // Best effort cleanup only.
      }

      reject(new Error(input.message));
    }, input.timeoutMs);

    input.operation().then(
      (value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export async function requestOpenAICompatibleText(input: {
  model: AISDKModelConfig;
  system?: string;
  prompt: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}): Promise<string> {
  if (!input.model.baseURL) {
    throw new Error("OpenAI-compatible requests require a baseURL.");
  }

  const baseURL = input.model.baseURL;
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? DEFAULT_OPENAI_COMPATIBLE_REQUEST_TIMEOUT_MS;
  const timeoutMessage = `OpenAI-compatible gateway timeout after ${timeoutMs}ms.`;
  const abortRequest = () => {
    controller.abort(new Error(timeoutMessage));
  };
  let response: Response;

  try {
    response = await withOpenAICompatibleTimeout({
      timeoutMs,
      message: timeoutMessage,
      onTimeout: abortRequest,
      operation: () =>
        createOpenAICompatibleFetch(input.fetch)(
          buildOpenAICompatibleUrl(baseURL),
          {
            method: "POST",
            headers: {
              ...buildOpenAICompatibleHeaders(input.model),
              accept: "text/event-stream",
            },
            body: JSON.stringify({
              model: input.model.model,
              messages: [
                input.system
                  ? {
                      role: "system",
                      content: input.system,
                    }
                  : null,
                {
                  role: "user",
                  content: input.prompt,
                },
              ].filter(Boolean),
              stream: true,
              reasoning_effort: "medium",
            }),
            signal: controller.signal,
          },
        ),
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new Error(timeoutMessage);
    }

    throw error;
  }

  const contentType = response.headers.get("content-type");
  if (isJsonContentType(contentType)) {
    const body = await withOpenAICompatibleTimeout({
      timeoutMs,
      message: timeoutMessage,
      onTimeout: abortRequest,
      operation: () => response.text(),
    });
    let payload: unknown = null;

    if (body.trim().length > 0) {
      try {
        payload = JSON.parse(body);
      } catch {
        if (!response.ok) {
          throw new Error(
            `OpenAI-compatible gateway error ${response.status}: ${response.statusText || "Invalid JSON response"}`,
          );
        }

        throw new Error("Malformed openai-compatible gateway response: expected a JSON body.");
      }
    }

    const gatewayError = extractOpenAICompatibleErrorMessage(payload);
    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible gateway error ${response.status}: ${gatewayError ?? (response.statusText || "Request failed")}`,
      );
    }

    return extractOpenAICompatibleCompletionText(payload);
  }

  if (!response.ok) {
    const body = await withOpenAICompatibleTimeout({
      timeoutMs,
      message: timeoutMessage,
      onTimeout: abortRequest,
      operation: () => response.text(),
    });
    throw new Error(
      `OpenAI-compatible gateway error ${response.status}: ${body.trim() || response.statusText || "Request failed"}`,
    );
  }

  if (!response.body) {
    throw new Error("Malformed openai-compatible gateway response: missing response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let sawDone = false;

  while (true) {
    const { value, done } = await withOpenAICompatibleTimeout({
      timeoutMs,
      message: timeoutMessage,
      onTimeout: () => {
        abortRequest();
        void reader.cancel(controller.signal.reason).catch(() => undefined);
      },
      operation: () => reader.read(),
    });
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const data = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim();

      if (!data) {
        continue;
      }

      if (data === "[DONE]") {
        sawDone = true;
        return content;
      }

      let payload: unknown;

      try {
        payload = JSON.parse(data);
      } catch {
        throw new Error(
          "Malformed openai-compatible gateway response: invalid JSON stream event.",
        );
      }

      content += extractOpenAICompatibleStreamText(payload);
    }
  }

  if (buffer.trim().length > 0) {
    throw new Error(
      "Malformed openai-compatible gateway response: truncated stream event.",
    );
  }

  if (!sawDone) {
    throw new Error("Malformed openai-compatible gateway response: stream ended before [DONE].");
  }

  return content;
}

export async function requestOpenAICompatibleObject<T>(input: {
  model: AISDKModelConfig;
  schema: z.ZodType<T>;
  system?: string;
  prompt: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  normalizePayload?: (payload: unknown) => unknown;
}): Promise<T> {
  return parseStructuredModelObject(
    await requestOpenAICompatibleText({
      model: input.model,
      system: input.system,
      prompt: input.prompt,
      fetch: input.fetch,
      timeoutMs: input.timeoutMs,
    }),
    input.schema,
    input.normalizePayload,
  );
}

export function parseAISDKModelConfigFromEnv(
  prefix: string,
): AISDKModelConfig | null {
  const provider = process.env[`${prefix}_PROVIDER`];
  const model = process.env[`${prefix}_MODEL`];

  if (!provider || !model) {
    return null;
  }

  if (!isModelProviderId(provider)) {
    throw new Error(`Unsupported Vercel AI SDK provider: ${provider}`);
  }

  return {
    provider,
    model,
    apiKey: process.env[`${prefix}_API_KEY`],
    baseURL: process.env[`${prefix}_BASE_URL`],
  };
}

export function resolveAISDKModel(config: AISDKModelConfig) {
  if (config.provider === "openai") {
    if (config.baseURL) {
      const provider = createOpenAICompatible({
        name: "openai-compatible",
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        fetch: createOpenAICompatibleFetch(),
      });

      return provider.chatModel(config.model);
    }

    if (config.apiKey) {
      const provider = createOpenAI({
        apiKey: config.apiKey,
      });
      return provider(config.model);
    }

    return openai(config.model);
  }

  if (config.provider === "anthropic") {
    if (config.baseURL || config.apiKey) {
      const provider = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
      return provider(config.model);
    }

    return anthropic(config.model);
  }

  throw new Error(`Unsupported Vercel AI SDK provider: ${config.provider}`);
}

export function resolveAISDKEmbeddingModel(config: AISDKModelConfig) {
  if (config.provider === "openai") {
    if (config.baseURL) {
      const provider = createOpenAICompatible({
        name: "openai-compatible",
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        fetch: createOpenAICompatibleFetch(),
      });

      return provider.embeddingModel(config.model);
    }

    if (config.apiKey) {
      const provider = createOpenAI({
        apiKey: config.apiKey,
      });
      return provider.embeddingModel(config.model);
    }

    return openai.embeddingModel(config.model);
  }

  if (config.provider === "anthropic") {
    throw new Error(
      "Anthropic via Vercel AI SDK does not currently support text embeddings.",
    );
  }

  throw new Error(`Unsupported Vercel AI SDK provider: ${config.provider}`);
}

export function createAISDKEmbeddingAdapter(input: {
  model: AISDKModelConfig;
  dependencies?: EmbeddingAdapterDependencies;
}): EmbeddingAdapter {
  return {
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return [];
      }

      const embeddings = await withAISDKRetries(async () => {
        const result = await (input.dependencies?.embedMany ?? embedMany)({
          model: (
            input.dependencies?.resolveEmbeddingModel ?? resolveAISDKEmbeddingModel
          )(input.model),
          values: texts,
        });

        return result.embeddings;
      });

      if (embeddings.some((embedding) => embedding.length === 0)) {
        throw new Error("Empty embedding response");
      }

      return embeddings.map((embedding) => embedding.map((value) => Number(value)));
    },
  };
}
