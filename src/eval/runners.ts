import type {
  FeedbackResult,
  GoodMemory,
  RecallResult,
  RememberResult as PublicRememberResult,
} from "../index";
import type {
  PersonaSpec,
  ScenarioFeedbackSignal,
  ScenarioFixture,
  ScenarioTurn,
} from "./dataset";

export interface EvalAnswerGeneratorInput {
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  prompt: string;
  transcript: string;
  memoryContext?: string;
}

export interface EvalAnswerGeneratorOutput {
  content: string;
}

export type EvalAnswerGenerator = (
  input: EvalAnswerGeneratorInput,
) => Promise<EvalAnswerGeneratorOutput>;

export interface EvalAnswerPackage {
  mode: "baseline" | "goodmemory";
  personaId: string;
  scenarioId: string;
  prompt: string;
  transcript: string;
  memoryContext?: string;
  answer: string;
  retrieved?: {
    profile: RecallResult["profile"];
    preferences: RecallResult["preferences"];
    references: RecallResult["references"];
    facts: RecallResult["facts"];
    feedback: RecallResult["feedback"];
    episodes: RecallResult["episodes"];
    workingMemory: RecallResult["workingMemory"];
    journal: RecallResult["journal"];
    hits: RecallResult["metadata"]["hits"];
    verificationHints: RecallResult["metadata"]["verificationHints"];
    renderedMemoryContext: string;
  };
  trace: {
    sessionsReplayed: number;
    rememberEvents: Array<{
      sessionId: string;
      replayedTurns: number;
      accepted: number;
      rejected: number;
      events: PublicRememberResult["events"];
    }>;
    feedbackEvents: Array<{
      sessionId: string;
      signal: string;
      accepted: boolean;
      outcome?: FeedbackResult["outcome"];
      memoryId?: string;
      kind?: FeedbackResult["kind"];
    }>;
    recallHitCount: number;
    verificationHintCount: number;
    contextBuild:
      | null
      | {
          output: "json" | "markdown" | "system_prompt_fragment" | "developer_prompt_fragment";
          maxTokens: number;
          contentLength: number;
          recallTokenCount: number;
        };
  };
}

function renderTranscript(turns: ScenarioTurn[]): string {
  return turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
}

function getEvaluationPrompt(scenario: ScenarioFixture): string {
  return scenario.evaluation.prompt;
}

function buildEvaluationPlan(scenario: ScenarioFixture): {
  replaySessions: ScenarioFixture["sessions"];
  visibleTranscriptTurns: ScenarioTurn[];
} {
  const lastSession = scenario.sessions.at(-1);
  if (!lastSession) {
    return {
      replaySessions: [],
      visibleTranscriptTurns: [],
    };
  }

  const promptIndex = lastSession.turns.findIndex(
    (turn) => turn.role === "user" && turn.content === scenario.evaluation.prompt,
  );

  if (promptIndex === -1) {
    return {
      replaySessions: scenario.sessions,
      visibleTranscriptTurns: lastSession.turns,
    };
  }

  const replaySessions = scenario.sessions.slice(0, -1);
  const historicalTurns = lastSession.turns.slice(0, promptIndex);
  if (historicalTurns.length > 0) {
    replaySessions.push({
      ...lastSession,
      turns: historicalTurns,
    });
  }

  return {
    replaySessions,
    visibleTranscriptTurns: lastSession.turns.slice(0, promptIndex + 1),
  };
}

export async function runBaselineScenario(input: {
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  answerGenerator: EvalAnswerGenerator;
}): Promise<EvalAnswerPackage> {
  const prompt = getEvaluationPrompt(input.scenario);
  const evaluationPlan = buildEvaluationPlan(input.scenario);
  const transcript = renderTranscript(evaluationPlan.visibleTranscriptTurns);
  const answer = await input.answerGenerator({
    persona: input.persona,
    scenario: input.scenario,
    prompt,
    transcript,
  });

  return {
    mode: "baseline",
    personaId: input.persona.persona_id,
    scenarioId: input.scenario.scenario_id,
    prompt,
    transcript,
    answer: answer.content,
    trace: {
      sessionsReplayed: 0,
      rememberEvents: [],
      feedbackEvents: [],
      recallHitCount: 0,
      verificationHintCount: 0,
      contextBuild: null,
    },
  };
}

function buildScenarioScope(persona: PersonaSpec, sessionId: string) {
  return {
    userId: persona.persona_id,
    workspaceId: `eval-${persona.lifecycle_bucket}`,
    sessionId,
  };
}

async function runScenarioFeedbackSignals(input: {
  memory: GoodMemory;
  persona: PersonaSpec;
  signals: ScenarioFeedbackSignal[];
}): Promise<EvalAnswerPackage["trace"]["feedbackEvents"]> {
  const events: EvalAnswerPackage["trace"]["feedbackEvents"] = [];

  for (const signal of input.signals) {
    const result = await input.memory.feedback({
      scope: buildScenarioScope(input.persona, signal.session_id),
      signal: signal.signal,
    });
    events.push({
      sessionId: signal.session_id,
      signal: signal.signal,
      accepted: result.accepted,
      outcome: result.outcome,
      memoryId: result.memoryId,
      kind: result.kind,
    });
  }

  return events;
}

export async function runGoodMemoryScenario(input: {
  memory: GoodMemory;
  persona: PersonaSpec;
  scenario: ScenarioFixture;
  answerGenerator: EvalAnswerGenerator;
  retrievalProfile?: "general_chat" | "coding_agent";
}): Promise<EvalAnswerPackage> {
  const rememberEvents: EvalAnswerPackage["trace"]["rememberEvents"] = [];
  const evaluationPlan = buildEvaluationPlan(input.scenario);

  for (const session of evaluationPlan.replaySessions) {
    const result = await input.memory.remember({
      scope: buildScenarioScope(input.persona, session.session_id),
      messages: session.turns,
    });

    rememberEvents.push({
      sessionId: session.session_id,
      replayedTurns: session.turns.length,
      accepted: result.accepted,
      rejected: result.rejected,
      events: result.events,
    });
  }

  const feedbackEvents = await runScenarioFeedbackSignals({
    memory: input.memory,
    persona: input.persona,
    signals: input.scenario.feedback_signals ?? [],
  });

  const recall = await input.memory.recall({
    scope: buildScenarioScope(
      input.persona,
      input.scenario.sessions.at(-1)!.session_id,
    ),
    query: getEvaluationPrompt(input.scenario),
    retrievalProfile: input.retrievalProfile ?? "general_chat",
  });
  const context = await input.memory.buildContext({
    recall,
    output: "markdown",
    maxTokens: 160,
  });
  const prompt = getEvaluationPrompt(input.scenario);
  const transcript = renderTranscript(evaluationPlan.visibleTranscriptTurns);
  const answer = await input.answerGenerator({
    persona: input.persona,
    scenario: input.scenario,
    prompt,
    transcript,
    memoryContext: context.content,
  });

  return {
    mode: "goodmemory",
    personaId: input.persona.persona_id,
    scenarioId: input.scenario.scenario_id,
    prompt,
    transcript,
    memoryContext: context.content,
    answer: answer.content,
    retrieved: {
      profile: recall.profile,
      preferences: recall.preferences,
      references: recall.references,
      facts: recall.facts,
      feedback: recall.feedback,
      episodes: recall.episodes,
      workingMemory: recall.workingMemory,
      journal: recall.journal,
      hits: recall.metadata.hits,
      verificationHints: recall.metadata.verificationHints,
      renderedMemoryContext: context.content,
    },
    trace: buildGoodMemoryTrace(rememberEvents, feedbackEvents, recall, context),
  };
}

function buildGoodMemoryTrace(
  rememberEvents: EvalAnswerPackage["trace"]["rememberEvents"],
  feedbackEvents: EvalAnswerPackage["trace"]["feedbackEvents"],
  recall: RecallResult,
  context: {
    output: "json" | "markdown" | "system_prompt_fragment" | "developer_prompt_fragment";
    content: string;
  },
): EvalAnswerPackage["trace"] {
  return {
    sessionsReplayed: rememberEvents.length,
    rememberEvents,
    feedbackEvents,
    recallHitCount: recall.metadata.hits.length,
    verificationHintCount: recall.metadata.verificationHints.length,
    contextBuild: {
      output: context.output,
      maxTokens: 160,
      contentLength: context.content.length,
      recallTokenCount: recall.metadata.tokenCount,
    },
  };
}
