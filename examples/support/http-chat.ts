import type {
  GoodMemory,
  MemoryScope,
  MemoryWriteJobStatus,
} from "goodmemory";

export const THIN_CHAT_REQUEST_ERROR =
  "Expected userId, sessionId, message, and turnId string fields in the request body.";

export interface ThinChatRequestBody {
  userId: string;
  sessionId: string;
  message: string;
  turnId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  retrievalProfile?: "general_chat" | "coding_agent";
}

export interface ThinChatResponseBody {
  text: string;
  contextIncluded: boolean;
  writeJobId: string;
  writeJobStatus: MemoryWriteJobStatus;
}

export interface ThinChatErrorBody {
  error: string;
}

export type ThinChatTurnResult =
  | {
      statusCode: 200;
      body: ThinChatResponseBody;
    }
  | {
      statusCode: 400;
      body: ThinChatErrorBody;
    };

export interface ThinChatAssistantInput {
  context: string;
  message: string;
  scope: MemoryScope;
}

export interface RunGoodMemoryThinChatTurnInput {
  body: unknown;
  drainJobs?: boolean;
  generateAssistantText?(
    input: ThinChatAssistantInput,
  ): Promise<string> | string;
  memory: GoodMemory;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonEmptyString(
  value: unknown,
): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isRetrievalProfile(
  value: unknown,
): value is ThinChatRequestBody["retrievalProfile"] {
  return (
    value === undefined ||
    value === "general_chat" ||
    value === "coding_agent"
  );
}

function isThinChatRequestBody(
  value: unknown,
): value is ThinChatRequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.userId) &&
    isNonEmptyString(candidate.sessionId) &&
    isNonEmptyString(candidate.message) &&
    isNonEmptyString(candidate.turnId) &&
    isOptionalNonEmptyString(candidate.tenantId) &&
    isOptionalNonEmptyString(candidate.workspaceId) &&
    isOptionalNonEmptyString(candidate.agentId) &&
    isRetrievalProfile(candidate.retrievalProfile)
  );
}

function toScope(body: ThinChatRequestBody): MemoryScope {
  return {
    userId: body.userId,
    sessionId: body.sessionId,
    ...(body.tenantId ? { tenantId: body.tenantId } : {}),
    ...(body.workspaceId ? { workspaceId: body.workspaceId } : {}),
    ...(body.agentId ? { agentId: body.agentId } : {}),
  };
}

function recallHasContext(
  recall: Awaited<ReturnType<GoodMemory["recall"]>>,
): boolean {
  return Boolean(
    recall.profile ||
      recall.preferences.length > 0 ||
      recall.references.length > 0 ||
      recall.facts.length > 0 ||
      recall.feedback.length > 0 ||
      recall.archives.length > 0 ||
      recall.episodes.length > 0 ||
      recall.workingMemory ||
      recall.journal,
  );
}

function defaultGenerateAssistantText(input: ThinChatAssistantInput): string {
  if (input.context.toLowerCase().includes("staging smoke verification")) {
    return "The migration rollout is blocked on staging smoke verification.";
  }

  return "Noted. I will carry that forward.";
}

export async function runGoodMemoryThinChatTurn(
  input: RunGoodMemoryThinChatTurnInput,
): Promise<ThinChatTurnResult> {
  if (!isThinChatRequestBody(input.body)) {
    return {
      statusCode: 400,
      body: {
        error: THIN_CHAT_REQUEST_ERROR,
      },
    };
  }

  const body = input.body;
  const scope = toScope(body);

  await input.memory.runtime.appendMessage({
    scope,
    message: {
      role: "user",
      content: body.message,
    },
  });

  const recall = await input.memory.recall({
    scope,
    query: body.message,
    retrievalProfile: body.retrievalProfile ?? "general_chat",
  });
  const context = await input.memory.buildContext({
    recall,
    output: "system_prompt_fragment",
  });
  const text = await (input.generateAssistantText ?? defaultGenerateAssistantText)({
    context: context.content,
    message: body.message,
    scope,
  });

  await input.memory.runtime.appendMessage({
    scope,
    message: {
      role: "assistant",
      content: text,
    },
  });

  const job = await input.memory.jobs.enqueueRemember({
    scope,
    messages: [
      {
        role: "user",
        content: body.message,
      },
      {
        role: "assistant",
        content: text,
      },
    ],
    idempotencyKey: body.turnId,
    reason: "post_response_memory_write",
  });
  let writeJobStatus = job.status;

  if (input.drainJobs) {
    const drained = await input.memory.jobs.drain({ maxJobs: 1 });
    writeJobStatus =
      drained.jobs.find((drainedJob) => drainedJob.jobId === job.jobId)
        ?.status ?? writeJobStatus;
  }

  return {
    statusCode: 200,
    body: {
      text,
      contextIncluded: recallHasContext(recall),
      writeJobId: job.jobId,
      writeJobStatus,
    },
  };
}
