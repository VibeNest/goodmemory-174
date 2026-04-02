import { expect } from "bun:test";
import { createGoodMemory, type MemoryScope } from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import { replayScenarioWithMemory } from "../../src/testing/scenarioReplay";
import type {
  BehaviorScenarioFixture,
  RecallExpectation,
  StoredExpectation,
} from "./behavior-fixtures";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stringifyValue(value: unknown): string {
  return normalize(JSON.stringify(value));
}

function buildScopeFilter(
  personaId: string,
  expectationScope?: Partial<MemoryScope>,
): Record<string, string> {
  const filter: Record<string, string> = {
    userId: personaId,
  };

  if (expectationScope?.workspaceId) {
    filter.workspaceId = expectationScope.workspaceId;
  }

  if (expectationScope?.sessionId) {
    filter.sessionId = expectationScope.sessionId;
  }

  if (expectationScope?.agentId) {
    filter.agentId = expectationScope.agentId;
  }

  if (expectationScope?.tenantId) {
    filter.tenantId = expectationScope.tenantId;
  }

  return filter;
}

async function assertStoredExpectation(
  documentStore: ReturnType<typeof createInMemoryDocumentStore>,
  personaId: string,
  expectation: StoredExpectation,
): Promise<void> {
  const filter = buildScopeFilter(personaId, expectation.scope);
  const records = await documentStore.query<Record<string, unknown>>(
    expectation.collection,
    filter,
  );

  const matched = records.some((record) => {
    if (
      expectation.lifecycle &&
      record.lifecycle !== expectation.lifecycle
    ) {
      return false;
    }

    return stringifyValue(record).includes(normalize(expectation.includes));
  });

  expect(matched).toBe(true);
}

function matchRecallExpectation(
  recall: Awaited<ReturnType<typeof replayScenarioWithMemory>>["recall"],
  expectation: RecallExpectation,
): boolean {
  switch (expectation.collection) {
    case "profile":
      return stringifyValue(recall.profile).includes(normalize(expectation.includes));
    case "workingMemory":
      return stringifyValue(recall.workingMemory).includes(normalize(expectation.includes));
    case "journal":
      return stringifyValue(recall.journal).includes(normalize(expectation.includes));
    default:
      return recall[expectation.collection].some((record) =>
        stringifyValue(record).includes(normalize(expectation.includes)),
      );
  }
}

export async function assertBehaviorScenario(
  fixture: BehaviorScenarioFixture,
): Promise<void> {
  const documentStore = createInMemoryDocumentStore();
  const memory = createGoodMemory({
    storage: { provider: "memory" },
    adapters: {
      documentStore,
      sessionStore: createInMemorySessionStore(),
    },
  });

  const result = await replayScenarioWithMemory({
    memory,
    personaId: fixture.personaId,
    workspaceId: fixture.workspaceId,
    sessions: fixture.sessions,
    prompt: fixture.prompt,
    retrievalProfile: fixture.retrievalProfile,
    feedbackSignals: fixture.feedbackSignals,
    finalScope: fixture.finalScope,
    answerGenerator: ({ prompt, memoryContext }) => ({
      content: `Prompt: ${prompt}\n${memoryContext}`,
    }),
  });

  for (const expectation of fixture.expectedRemembered) {
    await assertStoredExpectation(documentStore, fixture.personaId, expectation);
  }

  for (const expectation of fixture.expectedRecalled) {
    expect(matchRecallExpectation(result.recall, expectation)).toBe(true);
  }

  for (const snippet of fixture.expectedContextSnippets) {
    expect(normalize(result.context.content)).toContain(normalize(snippet));
  }

  for (const snippet of fixture.forbiddenContextSnippets ?? []) {
    expect(normalize(result.context.content)).not.toContain(normalize(snippet));
  }

  const answer = result.answer?.content ?? "";
  for (const snippet of fixture.expectedAnswer.includes) {
    expect(normalize(answer)).toContain(normalize(snippet));
  }

  for (const snippet of fixture.expectedAnswer.excludes ?? []) {
    expect(normalize(answer)).not.toContain(normalize(snippet));
  }

  expect(result.rememberResults.length).toBe(fixture.sessions.length);
  if (fixture.feedbackSignals?.length) {
    expect(result.feedbackResults).toHaveLength(fixture.feedbackSignals.length);
  }
}
