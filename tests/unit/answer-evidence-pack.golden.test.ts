/**
 * Golden-output gate for src/answer/evidencePack.ts.
 *
 * The pack's prompt strings ARE measured benchmark behavior (single guide
 * lines have moved BEAM families by +-10pt), so a STRUCTURAL refactor of the
 * module (e.g. splitting per-operation guides into src/answer/operations/*)
 * must reproduce these snapshots byte-for-byte.
 *
 * Policy:
 * - Structure-only refactor: snapshots must NOT change. A refactor PR that
 *   touches this snapshot file is not structure-only.
 * - Deliberate semantic change to a guide: regenerate with `bun test -u`,
 *   review the snapshot diff as part of the change, and re-validate the
 *   affected benchmark family (see benchmark-claims/beam.json for the
 *   slice-validation precedent).
 */
import { describe, expect, it } from "bun:test";
import type {
  AnswerOperation,
  EvidenceTurn,
} from "../../src/answer/evidencePack";
import {
  buildAnswerEvidencePack,
  inferAnswerOperation,
} from "../../src/answer/evidencePack";

function turn(input: {
  content: string;
  orderKey: number;
  role?: string;
  sourceId: number | string;
  timeAnchor?: string;
}): EvidenceTurn {
  return {
    content: input.content,
    orderKey: input.orderKey,
    role: input.role ?? "user",
    sourceId: input.sourceId,
    timeAnchor: input.timeAnchor ?? `2024-03-${String(input.orderKey).padStart(2, "0")}`,
  };
}

interface GoldenFixture {
  expectedOperation: AnswerOperation;
  name: string;
  question: string;
  questionType?: string;
  turns: EvidenceTurn[];
}

const FIXTURES: GoldenFixture[] = [
  {
    expectedOperation: "abstention",
    name: "abstention",
    question: "Which deployment window did I approve for the rollout?",
    questionType: "abstention",
    turns: [
      turn({ content: "I set up the staging cluster with three nodes.", orderKey: 1, sourceId: 11 }),
      turn({ content: "The rollback checklist lives in the operations wiki.", orderKey: 2, sourceId: 12 }),
    ],
  },
  {
    expectedOperation: "contradiction",
    name: "contradiction",
    question: "Have I integrated Flask-Login for session management?",
    questionType: "contradiction_resolution",
    turns: [
      turn({
        content:
          "I have never integrated Flask-Login or managed user sessions in this project.",
        orderKey: 1,
        sourceId: 21,
      }),
      turn({
        content:
          "I integrated Flask-Login v0.6.2 for session management and it works well.",
        orderKey: 2,
        sourceId: 22,
      }),
      turn({
        content: "I also fixed a UNIQUE constraint error in the transactions table.",
        orderKey: 3,
        sourceId: 23,
      }),
    ],
  },
  {
    expectedOperation: "conflict_update",
    name: "conflict-update",
    question: "What is the current test coverage for the API module?",
    questionType: "knowledge_update",
    turns: [
      turn({ content: "Test coverage for the API module is 62% today.", orderKey: 1, sourceId: 31 }),
      turn({ content: "After the new suite landed, API module coverage rose to 78%.", orderKey: 2, sourceId: 32 }),
      turn({ content: "Core module coverage is a separate 85%.", orderKey: 3, sourceId: 33 }),
    ],
  },
  {
    expectedOperation: "count",
    name: "count",
    question: "How many classification problems did I complete in total?",
    turns: [
      turn({ content: "I completed 10 triangle classification problems on Monday.", orderKey: 1, sourceId: 41 }),
      turn({ content: "I completed 5 more classification problems on Wednesday.", orderKey: 2, sourceId: 42 }),
    ],
  },
  {
    expectedOperation: "instruction",
    name: "instruction",
    question: "List the libraries I asked you to always mention with version numbers.",
    questionType: "instruction_following",
    turns: [
      turn({
        content: "Always mention version numbers when you list my dependencies.",
        orderKey: 1,
        sourceId: 51,
      }),
      turn({ content: "Also include the license for each library.", orderKey: 2, sourceId: 52 }),
      turn({ content: "I installed Flask 2.3.1 and SQLite 3.39 last week.", orderKey: 3, sourceId: 53 }),
    ],
  },
  {
    expectedOperation: "multi_session",
    name: "multi-session",
    question: "How did my publishing plan evolve across our conversations?",
    questionType: "multi_session_reasoning",
    turns: [
      turn({ content: "I started with an outline and a modest B- target.", orderKey: 1, sourceId: 61 }),
      turn({ content: "Later I hired an editor and moved the deadline to June.", orderKey: 2, sourceId: 62 }),
      turn({ content: "Finally I submitted the manuscript to two journals.", orderKey: 3, sourceId: 63 }),
    ],
  },
  {
    expectedOperation: "order",
    name: "order",
    question: "In what order did I build the budget tracker features?",
    questionType: "event_ordering",
    turns: [
      turn({ content: "First I set up user authentication with hashed passwords.", orderKey: 1, sourceId: 71 }),
      turn({ content: "Then I implemented transaction creation with error handling.", orderKey: 2, sourceId: 72 }),
      turn({ content: "Last I added the analytics dashboard with monthly charts.", orderKey: 3, sourceId: 73 }),
    ],
  },
  {
    expectedOperation: "preference",
    name: "preference",
    question: "How should rollback notes be written for my team?",
    questionType: "preference_following",
    turns: [
      turn({ content: "I prefer terse rollback notes with one line per step.", orderKey: 1, sourceId: 81 }),
      turn({ content: "Theo owns the rollback checklist for the release train.", orderKey: 2, sourceId: 82 }),
    ],
  },
  {
    expectedOperation: "summary",
    name: "summary",
    question: "Summarize how my weather app project progressed.",
    questionType: "summarization",
    turns: [
      turn({ content: "I began with a basic JavaScript app calling the OpenWeather API.", orderKey: 1, sourceId: 91 }),
      turn({ content: "Next I added city autocomplete with a 300ms debounce.", orderKey: 2, sourceId: 92 }),
      turn({ content: "Then I cached responses in localStorage with a 10 minute expiry.", orderKey: 3, sourceId: 93 }),
    ],
  },
  {
    expectedOperation: "general",
    name: "general",
    question: "Who owns the rollback checklist?",
    turns: [
      turn({ content: "Theo owns the rollback checklist.", orderKey: 1, role: "assistant", sourceId: 101 }),
      turn({ content: "Mira prefers terse rollback notes.", orderKey: 2, sourceId: 102 }),
    ],
  },
  {
    expectedOperation: "general",
    name: "duplicate-source-ids-and-unsorted-turns",
    question: "Who owns the rollback checklist?",
    turns: [
      turn({ content: "Mira prefers terse rollback notes.", orderKey: 2, sourceId: 112 }),
      turn({ content: "Theo owns the rollback checklist.", orderKey: 1, sourceId: 111 }),
      turn({ content: "Duplicate of the first note.", orderKey: 3, sourceId: 112 }),
    ],
  },
  {
    expectedOperation: "general",
    name: "empty-turns",
    question: "What did we decide about the deploy window?",
    turns: [],
  },
];

describe("answer evidence pack golden outputs", () => {
  for (const fixture of FIXTURES) {
    it(`locks the ${fixture.name} pack output`, () => {
      expect(
        inferAnswerOperation(fixture.question, fixture.questionType),
      ).toBe(fixture.expectedOperation);
      const pack = buildAnswerEvidencePack({
        question: fixture.question,
        questionType: fixture.questionType,
        turns: fixture.turns,
      });
      expect(pack).toMatchSnapshot();
    });
  }
});
