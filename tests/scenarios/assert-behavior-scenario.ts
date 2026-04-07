import { expect } from "bun:test";
import { createGoodMemory, type MemoryScope, type RecallResult } from "../../src";
import {
  createInMemoryDocumentStore,
  createInMemorySessionStore,
} from "../../src/storage/memory";
import { replayScenarioWithMemory } from "../../src/testing/scenarioReplay";
import type {
  BehaviorScenarioFixture,
  PathExpectation,
  RecallExpectation,
  StoredExpectation,
} from "./behavior-fixtures";

type StructuredAnswer = {
  prompt: string;
  profileName: string | null;
  preferences: string[];
  referencePointers: string[];
  factEntries: string[];
  feedbackRules: string[];
  contextSections: Record<string, string[]>;
};

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

function getPathValue(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function parseContextSections(content: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let currentSection: string | null = null;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim();
      sections[currentSection] = [];
      continue;
    }

    if (!currentSection) {
      continue;
    }

    sections[currentSection].push(line.startsWith("- ") ? line.slice(2) : line);
  }

  return sections;
}

function matchesPathExpectation(source: unknown, expectation: PathExpectation): boolean {
  const value = getPathValue(source, expectation.path);

  if (expectation.equals !== undefined && value !== expectation.equals) {
    return false;
  }

  if (expectation.hasEntries) {
    if (!Array.isArray(value)) {
      return false;
    }

    for (const entry of expectation.hasEntries) {
      if (!value.includes(entry)) {
        return false;
      }
    }
  }

  if (expectation.lacksEntries) {
    if (!Array.isArray(value)) {
      return false;
    }

    for (const entry of expectation.lacksEntries) {
      if (value.includes(entry)) {
        return false;
      }
    }
  }

  return true;
}

function assertPathExpectations(
  source: unknown,
  expectations: PathExpectation[],
): void {
  for (const expectation of expectations) {
    const value = getPathValue(source, expectation.path);

    if (expectation.equals !== undefined) {
      expect(value).toEqual(expectation.equals);
    }

    if (expectation.hasEntries) {
      expect(Array.isArray(value)).toBe(true);
      for (const entry of expectation.hasEntries) {
        expect(value).toContain(entry);
      }
    }

    if (expectation.lacksEntries) {
      expect(Array.isArray(value)).toBe(true);
      for (const entry of expectation.lacksEntries) {
        expect(value).not.toContain(entry);
      }
    }
  }
}

function resolveRecallRecords(
  recall: Awaited<ReturnType<typeof replayScenarioWithMemory>>["recall"],
  collection: RecallExpectation["collection"],
): unknown[] {
  switch (collection) {
    case "profile":
      return recall.profile ? [recall.profile] : [];
    case "workingMemory":
      return recall.workingMemory ? [recall.workingMemory] : [];
    case "journal":
      return recall.journal ? [recall.journal] : [];
    default:
      return recall[collection];
  }
}

function buildStructuredAnswer(
  prompt: string,
  recall: RecallResult,
  memoryContext: string,
): StructuredAnswer {
  return {
    prompt,
    profileName: recall.profile?.identity.name ?? null,
    preferences: recall.preferences.map((item) => String(item.value)),
    referencePointers: recall.references.map((item) => item.pointer),
    factEntries: recall.facts.map((item) => item.content),
    feedbackRules: recall.feedback.map((item) => item.rule),
    contextSections: parseContextSections(memoryContext),
  };
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

  const matched = records.some((record) =>
    expectation.fields.every((field) => matchesPathExpectation(record, field)),
  );

  expect(matched).toBe(true);
}

function assertRecallExpectation(
  recall: Awaited<ReturnType<typeof replayScenarioWithMemory>>["recall"],
  expectation: RecallExpectation,
): void {
  const records = resolveRecallRecords(recall, expectation.collection);
  const matched = records.some((record) =>
    expectation.fields.every((field) => matchesPathExpectation(record, field)),
  );

  expect(matched).toBe(true);
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
    answerGenerator: ({ prompt, memoryContext, recall }) => ({
      content: JSON.stringify(buildStructuredAnswer(prompt, recall, memoryContext), null, 2),
    }),
  });

  for (const expectation of fixture.expectedRemembered) {
    await assertStoredExpectation(documentStore, fixture.personaId, expectation);
  }

  for (const expectation of fixture.expectedRecalled) {
    assertRecallExpectation(result.recall, expectation);
  }

  const contextSections = parseContextSections(result.context.content);
  assertPathExpectations(contextSections, fixture.expectedContext);

  expect(result.answer).not.toBeNull();
  const answer = JSON.parse(result.answer?.content ?? "{}") as StructuredAnswer;
  assertPathExpectations(answer, fixture.expectedAnswer);

  expect(result.rememberResults.length).toBe(fixture.sessions.length);
  expect(
    result.rememberResults.some((session) => session.result.events.length > 0),
  ).toBe(true);

  if (fixture.feedbackSignals?.length) {
    expect(result.feedbackResults).toHaveLength(fixture.feedbackSignals.length);
  }
}
