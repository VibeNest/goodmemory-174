import type {
  BuildContextResult,
  FeedbackResult,
  GoodMemory,
  RecallResult,
} from "../api/contracts";
import type { MemoryScope } from "../domain/scope";
import type { RecallRouterStrategy } from "../recall/router";
import type { RememberResult } from "../remember/contracts";

export interface ReplayTurn {
  role: string;
  content: string;
}

export interface ReplaySession {
  sessionId: string;
  turns: ReplayTurn[];
}

export interface ScenarioReplayInput {
  personaId: string;
  sessions: ReplaySession[];
}

export interface ReplayEvent extends ReplayTurn {
  personaId: string;
  sessionId: string;
  turnIndex: number;
}

export interface ReplayFeedbackSignal {
  sessionId: string;
  signal: string;
  scope?: Partial<MemoryScope>;
}

export interface ReplayMemorySession extends ReplaySession {
  scope?: Partial<MemoryScope>;
}

export interface ReplayScenarioWithMemoryInput {
  memory: GoodMemory;
  personaId: string;
  workspaceId?: string;
  agentId?: string;
  tenantId?: string;
  sessions: ReplayMemorySession[];
  prompt: string;
  retrievalProfile?: "general_chat" | "coding_agent";
  strategy?: RecallRouterStrategy;
  output?: "json" | "markdown" | "system_prompt_fragment" | "developer_prompt_fragment";
  maxTokens?: number;
  feedbackSignals?: ReplayFeedbackSignal[];
  finalScope?: Partial<MemoryScope>;
  answerGenerator?: (input: {
    prompt: string;
    memoryContext: string;
    recall: RecallResult;
  }) => Promise<{ content: string }> | { content: string };
}

export interface ScenarioReplayWithMemoryResult {
  rememberResults: Array<{
    sessionId: string;
    scope: MemoryScope;
    result: RememberResult;
  }>;
  feedbackResults: Array<{
    sessionId: string;
    scope: MemoryScope;
    result: FeedbackResult;
  }>;
  recall: RecallResult;
  context: BuildContextResult;
  answer: { content: string } | null;
}

class ScenarioReplayHarness {
  constructor(private readonly input: ScenarioReplayInput) {}

  async *replay(): AsyncGenerator<ReplayEvent> {
    for (const session of this.input.sessions) {
      for (const [turnIndex, turn] of session.turns.entries()) {
        yield {
          personaId: this.input.personaId,
          sessionId: session.sessionId,
          turnIndex,
          role: turn.role,
          content: turn.content
        };
      }
    }
  }
}

export function createScenarioReplayHarness(
  input: ScenarioReplayInput
): ScenarioReplayHarness {
  return new ScenarioReplayHarness(input);
}

function resolveScope(
  personaId: string,
  sessionId: string,
  defaults: {
    workspaceId?: string;
    agentId?: string;
    tenantId?: string;
  },
  overrides?: Partial<MemoryScope>,
): MemoryScope {
  return {
    userId: personaId,
    sessionId,
    workspaceId: overrides?.workspaceId ?? defaults.workspaceId,
    agentId: overrides?.agentId ?? defaults.agentId,
    tenantId: overrides?.tenantId ?? defaults.tenantId,
  };
}

export async function replayScenarioWithMemory(
  input: ReplayScenarioWithMemoryInput,
): Promise<ScenarioReplayWithMemoryResult> {
  const rememberResults: ScenarioReplayWithMemoryResult["rememberResults"] = [];
  const feedbackResults: ScenarioReplayWithMemoryResult["feedbackResults"] = [];

  for (const session of input.sessions) {
    const scope = resolveScope(
      input.personaId,
      session.sessionId,
      {
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        tenantId: input.tenantId,
      },
      session.scope,
    );
    const result = await input.memory.remember({
      scope,
      messages: session.turns,
    });

    rememberResults.push({
      sessionId: session.sessionId,
      scope,
      result,
    });
  }

  for (const signal of input.feedbackSignals ?? []) {
    const scope = resolveScope(
      input.personaId,
      signal.sessionId,
      {
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        tenantId: input.tenantId,
      },
      signal.scope,
    );
    const result = await input.memory.feedback({
      scope,
      signal: signal.signal,
    });
    feedbackResults.push({
      sessionId: signal.sessionId,
      scope,
      result,
    });
  }

  const finalSessionId = input.finalScope?.sessionId ?? input.sessions.at(-1)?.sessionId;
  if (!finalSessionId) {
    throw new Error("Scenario replay requires at least one session");
  }

  const recallScope = resolveScope(
    input.personaId,
    finalSessionId,
    {
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      tenantId: input.tenantId,
    },
    input.finalScope,
  );
  const recall = await input.memory.recall({
    scope: recallScope,
    query: input.prompt,
    retrievalProfile: input.retrievalProfile ?? "general_chat",
    strategy: input.strategy,
  });
  const context = await input.memory.buildContext({
    recall,
    output: input.output ?? "markdown",
    maxTokens: input.maxTokens,
  });
  const answer = input.answerGenerator
    ? await input.answerGenerator({
        prompt: input.prompt,
        memoryContext: context.content,
        recall,
      })
    : null;

  return {
    rememberResults,
    feedbackResults,
    recall,
    context,
    answer,
  };
}
