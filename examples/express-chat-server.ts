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

type ThinChatSuccessResult = Extract<ThinChatTurnResult, { statusCode: 200 }>;

export interface ExpressChatRequest {
  body?: unknown;
}

export interface ExpressChatResponse {
  status(code: number): ExpressChatResponse;
  json(body: ThinChatResponseBody | ThinChatErrorBody): unknown;
}

export type ExpressChatHandler = (
  request: ExpressChatRequest,
  response: ExpressChatResponse,
) => Promise<void> | void;

export interface ExpressLikeApp {
  post(path: string, handler: ExpressChatHandler): unknown;
}

export interface RegisterExpressGoodMemoryChatRouteInput {
  drainJobs?: boolean;
  generateAssistantText?(
    input: ThinChatAssistantInput,
  ): Promise<string> | string;
  memory?: GoodMemory;
  path?: string;
}

export interface RegisteredExpressGoodMemoryChatRoute {
  memory: GoodMemory;
  path: string;
}

class CapturedExpressResponse implements ExpressChatResponse {
  body: ThinChatResponseBody | ThinChatErrorBody | undefined;
  statusCode = 200;

  status(code: number): ExpressChatResponse {
    this.statusCode = code;
    return this;
  }

  json(body: ThinChatResponseBody | ThinChatErrorBody): unknown {
    this.body = body;
    return body;
  }
}

class CapturedExpressApp implements ExpressLikeApp {
  readonly routes = new Map<string, ExpressChatHandler>();

  post(path: string, handler: ExpressChatHandler): unknown {
    this.routes.set(path, handler);
    return undefined;
  }

  async inject(path: string, body: unknown): Promise<ThinChatTurnResult> {
    const handler = this.routes.get(path);
    if (!handler) {
      throw new Error(`No Express route registered for ${path}.`);
    }

    const response = new CapturedExpressResponse();
    await handler({ body }, response);

    return {
      statusCode: response.statusCode as ThinChatTurnResult["statusCode"],
      body: response.body ?? { error: "No response body was sent." },
    } as ThinChatTurnResult;
  }
}

function requireSuccessResult(result: ThinChatTurnResult): ThinChatSuccessResult {
  if (result.statusCode !== 200) {
    throw new Error(`Expected a successful Express example response.`);
  }

  return result;
}

export function registerExpressGoodMemoryChatRoute(
  app: ExpressLikeApp,
  input: RegisterExpressGoodMemoryChatRouteInput = {},
): RegisteredExpressGoodMemoryChatRoute {
  const memory = input.memory ?? createGoodMemory({});
  const path = input.path ?? "/chat";

  app.post(path, async (request, response) => {
    const result = await runGoodMemoryThinChatTurn({
      body: request.body,
      drainJobs: input.drainJobs,
      generateAssistantText: input.generateAssistantText,
      memory,
    });

    response.status(result.statusCode).json(result.body);
  });

  return { memory, path };
}

export async function runExpressChatServerExample(): Promise<{
  artifacts: MarkdownArtifactBundle;
  firstResponse: ThinChatSuccessResult;
  routePath: string;
  secondResponse: ThinChatSuccessResult;
}> {
  return withLocalDefaultRuntime("goodmemory-example-express-chat", async () => {
    const app = new CapturedExpressApp();
    const memory = createGoodMemory({});
    const registered = registerExpressGoodMemoryChatRoute(app, {
      drainJobs: true,
      memory,
    });

    const firstResponse = requireSuccessResult(
      await app.inject(registered.path, {
        userId: "express-user",
        workspaceId: "express-workspace",
        sessionId: "express-s1",
        turnId: "express-turn-1",
        message:
          "Remember that the migration rollout is blocked on staging smoke verification.",
      }),
    );
    const secondResponse = requireSuccessResult(
      await app.inject(registered.path, {
        userId: "express-user",
        workspaceId: "express-workspace",
        sessionId: "express-s2",
        turnId: "express-turn-2",
        message: "What is blocking the migration rollout?",
      }),
    );
    const exported = await memory.exportMemory({
      scope: {
        userId: "express-user",
        workspaceId: "express-workspace",
      },
    });

    return {
      artifacts: exported.artifacts,
      firstResponse,
      routePath: registered.path,
      secondResponse,
    };
  });
}

if (import.meta.main) {
  const result = await runExpressChatServerExample();
  console.log(JSON.stringify(result, null, 2));
}
