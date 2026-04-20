import {
  createTextStreamResponse,
  createUIMessageStreamResponse,
  generateText as aiGenerateText,
  pipeTextStreamToResponse as aiPipeTextStreamToResponse,
  pipeUIMessageStreamToResponse as aiPipeUIMessageStreamToResponse,
  streamText as aiStreamText,
  type ToolSet,
} from "ai";
import type {
  ModelMessage,
  SystemModelMessage,
} from "@ai-sdk/provider-utils";

import type {
  AISDKGenerateTextResult,
  AISDKStreamTextResult,
  CreateGoodMemoryAISDKInput,
  GoodMemoryAISDK,
  GoodMemoryAISDKErrorEvent,
  GoodMemoryAISDKEvent,
  GoodMemoryAISDKRetrievalProfile,
  GoodMemoryGenerateTextInput,
  GoodMemoryRememberSkipReason,
  GoodMemoryRecallSkipReason,
  GoodMemoryStreamTextInput,
} from "./contracts";

const DEFAULT_MEMORY_FRAGMENT_MAX_TOKENS = 160;

type AsyncIterableStreamLike<T> = ReadableStream<T> & AsyncIterable<T>;

interface PreparedMemoryContext {
  retrievalProfile: GoodMemoryAISDKRetrievalProfile;
  system?: string | SystemModelMessage | Array<SystemModelMessage>;
}

function createSystemMessage(content: string): SystemModelMessage {
  return {
    role: "system",
    content,
  };
}

function mergeSystemPrompt(input: {
  fragment: string;
  system?: string | SystemModelMessage | Array<SystemModelMessage>;
}): string | SystemModelMessage | Array<SystemModelMessage> {
  const { fragment, system } = input;
  if (!system) {
    return fragment;
  }

  if (typeof system === "string") {
    return `${system}\n\n${fragment}`;
  }

  if (Array.isArray(system)) {
    return [...system, createSystemMessage(fragment)];
  }

  return [system, createSystemMessage(fragment)];
}

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractTextFromMessageContent(content: ModelMessage["content"]): string | null {
  if (typeof content === "string") {
    return normalizeText(content);
  }

  const parts: string[] = [];

  for (const part of content) {
    if (part.type === "text") {
      const text = normalizeText(part.text);
      if (text) {
        parts.push(text);
      }
    }
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

function deriveRecallQuery(messages: ModelMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") {
      continue;
    }

    const text = extractTextFromMessageContent(message.content);
    if (text) {
      return text;
    }
  }

  return null;
}

function buildRememberMessages(input: {
  assistantText: string;
  messages: ModelMessage[];
}): Array<{ content: string; role: "assistant" | "user" }> {
  const currentUserText = deriveRecallQuery(input.messages);
  if (!currentUserText) {
    return [];
  }

  return [
    {
      role: "user",
      content: currentUserText,
    },
    {
      role: "assistant",
      content: input.assistantText,
    },
  ];
}

async function invokeEventCallback<T>(
  callback: ((event: T) => Promise<void> | void) | undefined,
  event: T,
): Promise<void> {
  if (!callback) {
    return;
  }

  try {
    await callback(event);
  } catch (error) {
    console.error("GoodMemory ai-sdk callback failed.", error);
  }
}

function createRecallSkipEvent(input: {
  reason: GoodMemoryRecallSkipReason;
  retrievalProfile: GoodMemoryAISDKRetrievalProfile;
  scope: GoodMemoryGenerateTextInput["scope"];
}): GoodMemoryAISDKEvent {
  return {
    phase: "recall",
    status: "skipped",
    reason: input.reason,
    scope: input.scope,
    retrievalProfile: input.retrievalProfile,
  };
}

function createRememberSkipEvent(input: {
  reason: GoodMemoryRememberSkipReason;
  scope: GoodMemoryGenerateTextInput["scope"];
}): GoodMemoryAISDKEvent {
  return {
    phase: "remember",
    status: "skipped",
    reason: input.reason,
    scope: input.scope,
  };
}

async function prepareMemoryContext(
  config: CreateGoodMemoryAISDKInput,
  input: Pick<
    GoodMemoryGenerateTextInput | GoodMemoryStreamTextInput,
    | "ignoreMemory"
    | "locale"
    | "maxMemoryTokens"
    | "messages"
    | "query"
    | "retrievalProfile"
    | "scope"
    | "system"
  >,
): Promise<PreparedMemoryContext> {
  const retrievalProfile =
    input.retrievalProfile ??
    config.defaultRetrievalProfile ??
    "general_chat";

  if (input.ignoreMemory) {
    await invokeEventCallback(config.onMemoryEvent, createRecallSkipEvent({
      reason: "ignore_memory",
      retrievalProfile,
      scope: input.scope,
    }));
    return {
      retrievalProfile,
      system: input.system,
    };
  }

  const query = normalizeText(input.query ?? "") ?? deriveRecallQuery(input.messages);
  if (!query) {
    await invokeEventCallback(config.onMemoryEvent, createRecallSkipEvent({
      reason: "no_query",
      retrievalProfile,
      scope: input.scope,
    }));
    return {
      retrievalProfile,
      system: input.system,
    };
  }

  try {
    const recall = await config.memory.recall({
      scope: input.scope,
      query,
      locale: input.locale,
      ignoreMemory: false,
      retrievalProfile,
    });
    const builtContext = await config.memory.buildContext({
      recall,
      output: "system_prompt_fragment",
      maxTokens:
        input.maxMemoryTokens ??
        config.defaultMaxMemoryTokens ??
        DEFAULT_MEMORY_FRAGMENT_MAX_TOKENS,
    });
    const fragment = normalizeText(builtContext.content);
    if (!fragment) {
      await invokeEventCallback(config.onMemoryEvent, createRecallSkipEvent({
        reason: "empty_context",
        retrievalProfile,
        scope: input.scope,
      }));
      return {
        retrievalProfile,
        system: input.system,
      };
    }

    await invokeEventCallback(config.onMemoryEvent, {
      phase: "recall",
      status: "applied",
      scope: input.scope,
      retrievalProfile,
    });

    return {
      retrievalProfile,
      system: mergeSystemPrompt({
        system: input.system,
        fragment,
      }),
    };
  } catch (error) {
    await invokeEventCallback<GoodMemoryAISDKErrorEvent>(config.onMemoryError, {
      phase: "recall",
      scope: input.scope,
      error,
    });

    return {
      retrievalProfile,
      system: input.system,
    };
  }
}

async function rememberCompletedGeneration(
  config: CreateGoodMemoryAISDKInput,
  input: Pick<
    GoodMemoryGenerateTextInput | GoodMemoryStreamTextInput,
    "ignoreMemory" | "locale" | "messages" | "scope"
  >,
  assistantText: string,
): Promise<void> {
  if (input.ignoreMemory) {
    await invokeEventCallback(config.onMemoryEvent, createRememberSkipEvent({
      reason: "ignore_memory",
      scope: input.scope,
    }));
    return;
  }

  const normalizedAssistantText = normalizeText(assistantText);
  if (!normalizedAssistantText) {
    await invokeEventCallback(config.onMemoryEvent, createRememberSkipEvent({
      reason: "no_final_assistant_text",
      scope: input.scope,
    }));
    return;
  }

  const rememberedMessages = buildRememberMessages({
    messages: input.messages,
    assistantText: normalizedAssistantText,
  });

  if (rememberedMessages.length === 0) {
    await invokeEventCallback(config.onMemoryEvent, createRememberSkipEvent({
      reason: "no_text_messages",
      scope: input.scope,
    }));
    return;
  }

  try {
    const result = await config.memory.remember({
      scope: input.scope,
      locale: input.locale,
      messages: rememberedMessages,
    });

    await invokeEventCallback(config.onMemoryEvent, {
      phase: "remember",
      status: "succeeded",
      scope: input.scope,
      accepted: result.accepted,
      rejected: result.rejected,
    });
  } catch (error) {
    await invokeEventCallback<GoodMemoryAISDKErrorEvent>(config.onMemoryError, {
      phase: "remember",
      scope: input.scope,
      error,
    });
  }
}

const promiseResultProperties = new Set<PropertyKey>([
  "content",
  "text",
  "reasoning",
  "reasoningText",
  "files",
  "sources",
  "toolCalls",
  "staticToolCalls",
  "dynamicToolCalls",
  "staticToolResults",
  "dynamicToolResults",
  "toolResults",
  "finishReason",
  "rawFinishReason",
  "usage",
  "totalUsage",
  "warnings",
  "steps",
  "request",
  "response",
  "providerMetadata",
  "output",
]);

const streamResultProperties = new Set<PropertyKey>([
  "textStream",
  "fullStream",
  "experimental_partialOutputStream",
  "partialOutputStream",
  "elementStream",
]);

function createDeferredPromiseProperty<T>(
  getResult: () => Promise<AISDKStreamTextResult>,
  key: string,
): Promise<T> {
  return getResult().then(
    (result) => result[key as keyof AISDKStreamTextResult] as PromiseLike<T> | T,
  );
}

async function getStreamSource<T>(
  sourceFactory: () => Promise<AsyncIterable<T> | ReadableStream<T>>,
): Promise<
  | { reader: ReadableStreamDefaultReader<T>; iterator?: never }
  | { iterator: AsyncIterator<T>; reader?: never }
> {
  const source = await sourceFactory();
  if (typeof (source as ReadableStream<T>).getReader === "function") {
    return {
      reader: (source as ReadableStream<T>).getReader(),
    };
  }

  return {
    iterator: (source as AsyncIterable<T>)[Symbol.asyncIterator](),
  };
}

function createLazyAsyncIterableStream<T>(
  sourceFactory: () => Promise<AsyncIterable<T> | ReadableStream<T>>,
): AsyncIterableStreamLike<T> {
  let sourcePromise:
    | Promise<
      | { reader: ReadableStreamDefaultReader<T>; iterator?: never }
      | { iterator: AsyncIterator<T>; reader?: never }
    >
    | null = null;

  const getSource = () => {
    sourcePromise ??= getStreamSource(sourceFactory);
    return sourcePromise;
  };

  const stream = new ReadableStream<T>({
    async pull(controller) {
      try {
        const source = await getSource();
        const next = source.reader
          ? await source.reader.read()
          : await source.iterator.next();

        if (next.done) {
          source.reader?.releaseLock();
          controller.close();
          return;
        }

        controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      const source = await sourcePromise;
      await source?.reader?.cancel(reason);
      await source?.iterator?.return?.();
      source?.reader?.releaseLock();
    },
  });

  return Object.assign(stream, {
    async *[Symbol.asyncIterator]() {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

function createDeferredStreamProperty<T>(
  getResult: () => Promise<AISDKStreamTextResult>,
  key: string,
): AsyncIterableStreamLike<T> {
  return createLazyAsyncIterableStream(async () => {
    const result = await getResult();
    return result[key as keyof AISDKStreamTextResult] as
      | AsyncIterable<T>
      | ReadableStream<T>;
  });
}

function createDeferredMethod<TArgs extends unknown[], TResult>(
  getResult: () => Promise<AISDKStreamTextResult>,
  key: string,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const result = await getResult();
    const method = result[key as keyof AISDKStreamTextResult] as unknown as (
      ...methodArgs: TArgs
    ) => TResult | PromiseLike<TResult>;
    return method.apply(result, args);
  };
}

function splitUIMessageStreamResponseOptions(options: unknown): {
  responseInit: Record<string, unknown>;
  streamOptions: Record<string, unknown>;
} {
  const {
    originalMessages,
    generateMessageId,
    onFinish,
    messageMetadata,
    sendReasoning,
    sendSources,
    sendFinish,
    sendStart,
    onError,
    ...responseInit
  } = options && typeof options === "object"
    ? options as Record<string, unknown>
    : {};

  return {
    responseInit,
    streamOptions: {
      originalMessages,
      generateMessageId,
      onFinish,
      messageMetadata,
      sendReasoning,
      sendSources,
      sendFinish,
      sendStart,
      onError,
    },
  };
}

function createDeferredUIMessageStream(
  getResult: () => Promise<AISDKStreamTextResult>,
  options: unknown,
): AsyncIterableStreamLike<unknown> {
  return createLazyAsyncIterableStream(async () => {
    const result = await getResult();
    return result.toUIMessageStream(options as never) as AsyncIterable<unknown>;
  });
}

function createDeferredStreamTextResult(
  resultFactory: () => Promise<AISDKStreamTextResult>,
): AISDKStreamTextResult {
  let resultPromise: Promise<AISDKStreamTextResult> | null = null;
  const getResult = () => {
    resultPromise ??= resultFactory();
    return resultPromise;
  };

  return new Proxy({}, {
    get(_target, property) {
      if (promiseResultProperties.has(property)) {
        return createDeferredPromiseProperty(getResult, property as string);
      }

      if (streamResultProperties.has(property)) {
        return createDeferredStreamProperty(getResult, property as string);
      }

      if (property === "consumeStream") {
        return createDeferredMethod(getResult, "consumeStream");
      }

      if (property === "toUIMessageStream") {
        return (options?: unknown) =>
          createDeferredUIMessageStream(getResult, options);
      }

      if (property === "pipeUIMessageStreamToResponse") {
        return (response: unknown, options?: unknown) => {
          const { responseInit, streamOptions } =
            splitUIMessageStreamResponseOptions(options);
          aiPipeUIMessageStreamToResponse({
            response,
            stream: createDeferredUIMessageStream(getResult, streamOptions),
            ...responseInit,
          } as never);
        };
      }

      if (property === "pipeTextStreamToResponse") {
        return (response: unknown, init?: ResponseInit) => {
          aiPipeTextStreamToResponse({
            response,
            textStream: createDeferredStreamProperty<string>(
              getResult,
              "textStream",
            ),
            ...init,
          } as never);
        };
      }

      if (property === "toUIMessageStreamResponse") {
        return (options?: unknown) => {
          const { responseInit, streamOptions } =
            splitUIMessageStreamResponseOptions(options);
          return createUIMessageStreamResponse({
            stream: createDeferredUIMessageStream(getResult, streamOptions),
            ...responseInit,
          } as never);
        };
      }

      if (property === "toTextStreamResponse") {
        return (init?: ResponseInit) =>
          createTextStreamResponse({
            textStream: createDeferredStreamProperty<string>(
              getResult,
              "textStream",
            ),
            ...init,
          });
      }

      return undefined;
    },
  }) as AISDKStreamTextResult;
}

export function createGoodMemoryAISDK(
  input: CreateGoodMemoryAISDKInput,
): GoodMemoryAISDK {
  const generateTextDependency =
    input.dependencies?.generateText ?? aiGenerateText;
  const streamTextDependency =
    input.dependencies?.streamText ?? aiStreamText;

  return {
    async generateText<TOOLS extends ToolSet = ToolSet>(
      callInput: GoodMemoryGenerateTextInput<TOOLS>,
    ): Promise<AISDKGenerateTextResult> {
      const prepared = await prepareMemoryContext(input, callInput);
      const onFinish = callInput.onFinish;

      return generateTextDependency({
        ...callInput,
        system: prepared.system,
        messages: callInput.messages,
        onFinish: async (event) => {
          await rememberCompletedGeneration(input, callInput, event.text);
          if (onFinish) {
            await onFinish(event as never);
          }
        },
      });
    },
    streamText<TOOLS extends ToolSet = ToolSet>(
      callInput: GoodMemoryStreamTextInput<TOOLS>,
    ): AISDKStreamTextResult {
      return createDeferredStreamTextResult(async () => {
        const prepared = await prepareMemoryContext(input, callInput);
        const onFinish = callInput.onFinish;

        return streamTextDependency({
          ...callInput,
          system: prepared.system,
          messages: callInput.messages,
          onFinish: async (event) => {
            await rememberCompletedGeneration(input, callInput, event.text);
            if (onFinish) {
              await onFinish(event as never);
            }
          },
        });
      });
    },
  };
}
