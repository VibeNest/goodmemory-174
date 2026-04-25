import type {
  GoodMemory,
  MarkdownArtifactBundle,
} from "goodmemory";
import { createGoodMemory } from "goodmemory";

import {
  runGoodMemoryThinChatTurn,
} from "./support/http-chat";
import type {
  ThinChatAssistantInput,
  ThinChatErrorBody,
  ThinChatResponseBody,
  ThinChatTurnResult,
} from "./support/http-chat";
import { withLocalDefaultRuntime } from "./support/local-default-runtime";

type ThinChatErrorResult = Extract<ThinChatTurnResult, { statusCode: 400 }>;
type ThinChatSuccessResult = Extract<ThinChatTurnResult, { statusCode: 200 }>;

export interface FastifyChatRequest {
  body?: unknown;
}

export interface FastifyChatReply {
  code(statusCode: number): FastifyChatReply;
  send(body: ThinChatResponseBody | ThinChatErrorBody): unknown;
}

export type FastifyChatHandler = (
  request: FastifyChatRequest,
  reply: FastifyChatReply,
) => Promise<void> | void;

export interface FastifyLikeInstance {
  post(path: string, handler: FastifyChatHandler): unknown;
}

export interface RegisterFastifyGoodMemoryChatRouteInput {
  drainJobs?: boolean;
  generateAssistantText?(
    input: ThinChatAssistantInput,
  ): Promise<string> | string;
  memory?: GoodMemory;
  path?: string;
}

export interface RegisteredFastifyGoodMemoryChatRoute {
  memory: GoodMemory;
  path: string;
}

class CapturedFastifyReply implements FastifyChatReply {
  body: ThinChatResponseBody | ThinChatErrorBody | undefined;
  statusCode = 200;

  code(statusCode: number): FastifyChatReply {
    this.statusCode = statusCode;
    return this;
  }

  send(body: ThinChatResponseBody | ThinChatErrorBody): unknown {
    this.body = body;
    return body;
  }
}

class CapturedFastifyInstance implements FastifyLikeInstance {
  readonly routes = new Map<string, FastifyChatHandler>();

  post(path: string, handler: FastifyChatHandler): unknown {
    this.routes.set(path, handler);
    return undefined;
  }

  async inject(path: string, body: unknown): Promise<ThinChatTurnResult> {
    const handler = this.routes.get(path);
    if (!handler) {
      throw new Error(`No Fastify route registered for ${path}.`);
    }

    const reply = new CapturedFastifyReply();
    await handler({ body }, reply);

    return {
      statusCode: reply.statusCode as ThinChatTurnResult["statusCode"],
      body: reply.body ?? { error: "No response body was sent." },
    } as ThinChatTurnResult;
  }
}

function requireErrorResult(result: ThinChatTurnResult): ThinChatErrorResult {
  if (result.statusCode !== 400) {
    throw new Error(`Expected a validation error from the Fastify example.`);
  }

  return result;
}

function requireSuccessResult(result: ThinChatTurnResult): ThinChatSuccessResult {
  if (result.statusCode !== 200) {
    throw new Error(`Expected a successful Fastify example response.`);
  }

  return result;
}

export function registerFastifyGoodMemoryChatRoute(
  app: FastifyLikeInstance,
  input: RegisterFastifyGoodMemoryChatRouteInput = {},
): RegisteredFastifyGoodMemoryChatRoute {
  const memory = input.memory ?? createGoodMemory({});
  const path = input.path ?? "/chat";

  app.post(path, async (request, reply) => {
    const result = await runGoodMemoryThinChatTurn({
      body: request.body,
      drainJobs: input.drainJobs,
      generateAssistantText: input.generateAssistantText,
      memory,
    });

    reply.code(result.statusCode).send(result.body);
  });

  return { memory, path };
}

export async function runFastifyChatServerExample(): Promise<{
  artifacts: MarkdownArtifactBundle;
  firstResponse: ThinChatSuccessResult;
  malformedResponse: ThinChatErrorResult;
  routePath: string;
  secondResponse: ThinChatSuccessResult;
}> {
  return withLocalDefaultRuntime("goodmemory-example-fastify-chat", async () => {
    const app = new CapturedFastifyInstance();
    const memory = createGoodMemory({});
    const registered = registerFastifyGoodMemoryChatRoute(app, {
      drainJobs: true,
      memory,
    });
    const malformedResponse = requireErrorResult(
      await app.inject(registered.path, {
        userId: "fastify-user",
        message: "Missing session and turn id.",
      }),
    );
    const firstResponse = requireSuccessResult(
      await app.inject(registered.path, {
        userId: "fastify-user",
        workspaceId: "fastify-workspace",
        sessionId: "fastify-s1",
        turnId: "fastify-turn-1",
        message:
          "Remember that the migration rollout is blocked on staging smoke verification.",
      }),
    );
    const secondResponse = requireSuccessResult(
      await app.inject(registered.path, {
        userId: "fastify-user",
        workspaceId: "fastify-workspace",
        sessionId: "fastify-s2",
        turnId: "fastify-turn-2",
        message: "What is blocking the migration rollout?",
      }),
    );
    const exported = await memory.exportMemory({
      scope: {
        userId: "fastify-user",
        workspaceId: "fastify-workspace",
      },
    });

    return {
      artifacts: exported.artifacts,
      firstResponse,
      malformedResponse,
      routePath: registered.path,
      secondResponse,
    };
  });
}

if (import.meta.main) {
  const result = await runFastifyChatServerExample();
  console.log(JSON.stringify(result, null, 2));
}
