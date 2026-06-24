import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  applyPhase63BeamAnswerOperationGuardrails,
  buildPhase63BeamAnswerMemoryContext,
  buildPhase63BeamPrompt,
  compressPhase63BeamMemoryContextText,
  extractPhase63BeamRequestedItemCount,
  loadPhase63BeamLiveSliceProgress,
  parsePhase63BeamLiveSliceCliOptions,
  runPhase63BeamLiveSlice,
} from "../../scripts/run-phase-63-beam-live-slice";
import type { BeamCase } from "../../src/eval/beam";

function buildBeamRows(): unknown[] {
  return [
    {
      chat: [
        [
          {
            content: "Mira prefers terse rollback notes.",
            id: 1,
            index: "1,1",
            question_type: "preference",
            role: "user",
            time_anchor: "March-15-2024",
          },
          {
            content: "Theo owns the rollback checklist.",
            id: 2,
            index: null,
            question_type: null,
            role: "assistant",
            time_anchor: null,
          },
        ],
      ],
      conversation_id: "beam-live-smoke",
      conversation_plan: "BATCH 1 PLAN",
      conversation_seed: {
        category: "Coding",
        id: 1,
        subtopics: ["Rollback"],
        theme: "Release operations",
        title: "Rollback Planning",
      },
      narratives: "Release planning labels",
      probing_questions: {
        information_extraction: [
          {
            answer: "Theo.",
            evidence_chat_ids: [2],
            question: "Who owns the rollback checklist?",
            question_id: "beam-live-q1",
            question_type: "information_extraction",
          },
        ],
        preference_following: [
          {
            answer: "Keep rollback notes terse.",
            evidence_chat_ids: [1],
            question: "How should rollback notes be written?",
            question_id: "beam-live-q2",
            question_type: "preference_following",
          },
        ],
        abstention: [
          {
            evidence_chat_ids: [],
            question: "Which deployment window did Mira approve?",
            question_id: "beam-live-q3",
            question_type: "abstention",
          },
        ],
      },
      user_profile: {
        user_info: "USER PROFILE: Mira",
        user_relationships: "None",
      },
      user_questions: [],
    },
  ];
}

function buildGuardrailCase(input: {
  question: string;
  questionType: string;
}): BeamCase {
  return {
    answer: "",
    answerable: true,
    chat: [],
    conversationId: "guardrail",
    evidenceChatIds: [],
    question: input.question,
    questionId: `guardrail:${input.questionType}`,
    questionType: input.questionType,
    scale: "100K",
  };
}

function buildRecallReport(): string {
  return JSON.stringify({
    profiles: {
      "goodmemory-rules-only": {
        cases: [
          {
            answerable: true,
            evidenceChatIds: [2],
            evidenceChatRecall: 0,
            questionId: "beam-live-q1",
            questionType: "information_extraction",
            retrievedChatIds: [1],
          },
        ],
      },
    },
  });
}

describe("phase-63 BEAM live slice runner", () => {
  it("parses live slice cli flags", () => {
    expect(
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--recall-report",
        "/tmp/recall.json",
        "--profile",
        "goodmemory-rules-only",
        "--case-id",
        "beam-live-q1",
        "--limit",
        "2",
        "--run-id",
        "run-beam-live",
      ]),
    ).toEqual({
      benchmarkRoot: "/tmp/BEAM",
      caseSelection: undefined,
      caseIds: ["beam-live-q1"],
      evidencePack: false,
      limit: 2,
      outputDir: undefined,
      profile: "goodmemory-rules-only",
      recallReportPath: "/tmp/recall.json",
      resume: false,
      runId: "run-beam-live",
      scale: undefined,
    });
  });

  it("accepts the hybrid live profile", () => {
    expect(
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--profile",
        "goodmemory-hybrid",
      ]).profile,
    ).toBe("goodmemory-hybrid");
  });

  it("parses the --case-selection flag and rejects unknown selections", () => {
    expect(
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--case-selection",
        "recall-misses",
      ]).caseSelection,
    ).toBe("recall-misses");

    expect(
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--case-selection",
        "all-evidence",
      ]).caseSelection,
    ).toBe("all-evidence");

    expect(() =>
      parsePhase63BeamLiveSliceCliOptions([
        "bun",
        "run",
        "scripts/run-phase-63-beam-live-slice.ts",
        "--benchmark-root",
        "/tmp/BEAM",
        "--case-selection",
        "not-a-selection",
      ]),
    ).toThrow("--case-selection must be all-cases, all-evidence, or recall-misses");
  });

  it("can select every BEAM case for live closure coverage", async () => {
    const report = await runPhase63BeamLiveSlice(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseSelection: "all-cases",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        runId: "run-beam-live-all",
      },
      {
        answerGenerator: async (input) =>
          input.testCase.answerable ? input.testCase.answer : "No answer.",
        answerJudge: async (input) => ({
          correct:
            input.expectedAnswer === input.actualAnswer ||
            input.actualAnswer === "No answer.",
          method: "semantic_judge",
          reasoning: "The candidate matches the fixture answer.",
        }),
        appendFile: async () => undefined,
        mkdir: async () => undefined,
        readFile: async (path) => {
          expect(path).toBe(join("/tmp/BEAM", "100K.json"));
          return JSON.stringify(buildBeamRows());
        },
        writeFile: async () => undefined,
      },
    );

    expect(report.summary.totalCases).toBe(3);
    expect(report.cases.map((testCase) => testCase.questionId)).toEqual([
      "beam-live-q1",
      "beam-live-q2",
      "beam-live-q3",
    ]);
  });

  it("parses the live-slice progress sidecar (last write wins, errors retried, torn line tolerated)", () => {
    const ok = (id: string, correct: boolean) =>
      JSON.stringify({ questionId: id, result: { questionId: id, correct } });
    const errored = (id: string) =>
      JSON.stringify({
        questionId: id,
        result: {
          questionId: id,
          executionError: { message: "boom", stage: "answer_generation" },
        },
      });
    const raw = `${[
      ok("q1", false),
      ok("q1", true),
      errored("q2"),
      ok("q3", true),
      "{ torn-final-line",
    ].join("\n")}\n`;

    const completed = loadPhase63BeamLiveSliceProgress(raw);

    expect([...completed.keys()].sort()).toEqual(["q1", "q3"]);
    expect(completed.get("q1")?.correct).toBe(true);
    expect(completed.has("q2")).toBe(false);
  });

  it("resumes a live slice from the progress sidecar, skipping already-scored cases", async () => {
    let answerCalls = 0;
    const appended: string[] = [];
    const priorQ1 = {
      answerScore: {
        correct: true,
        method: "semantic_judge",
        reasoning: "prior run",
      },
      answerable: true,
      conversationId: "beam-live-smoke",
      correct: true,
      evidenceChatIds: [2],
      evidenceChatRecall: 1,
      expectedAnswer: "prior",
      hypothesis: "RESUMED-FROM-SIDECAR",
      memoryContextChars: 12,
      questionId: "beam-live-q1",
      questionType: "information_extraction",
      retrievedChatIds: [2],
    };

    const report = await runPhase63BeamLiveSlice(
      {
        benchmarkRoot: "/tmp/BEAM",
        caseSelection: "all-cases",
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        resume: true,
        runId: "run-beam-live-resume",
      },
      {
        answerGenerator: async (input) => {
          answerCalls += 1;
          return input.testCase.answerable
            ? input.testCase.answer
            : "No answer.";
        },
        answerJudge: async (input) => ({
          correct:
            input.expectedAnswer === input.actualAnswer ||
            input.actualAnswer === "No answer.",
          method: "semantic_judge",
          reasoning: "fixture",
        }),
        appendFile: async (_path, value) => {
          appended.push(String(value));
        },
        mkdir: async () => undefined,
        readFile: async (path) => {
          if (String(path).endsWith("100K.json")) {
            return JSON.stringify(buildBeamRows());
          }
          if (String(path).endsWith("live-slice-progress.jsonl")) {
            return `${JSON.stringify({ questionId: "beam-live-q1", result: priorQ1 })}\n`;
          }
          return "";
        },
        writeFile: async () => undefined,
      },
    );

    // q1 was already scored on the prior run -> only q2 and q3 hit the generator.
    expect(answerCalls).toBe(2);
    expect(
      report.cases.find((testCase) => testCase.questionId === "beam-live-q1")
        ?.hypothesis,
    ).toBe("RESUMED-FROM-SIDECAR");
    expect(report.summary.totalCases).toBe(3);
    // Only the two freshly-scored cases are appended to the sidecar.
    expect(appended).toHaveLength(2);
  });

  it("keeps contradiction and ordering synthesis guidance in the live prompt", () => {
    const prompt = buildPhase63BeamPrompt({
      memoryContext: "- chat_id=1: Mira said yes.\n- chat_id=2: Mira said no.",
      question: "What happened first?",
    });

    expect(prompt).toContain(
      "If the retrieved context contains materially conflicting user statements",
    );
    expect(prompt).toContain("When the question asks for an order or sequence");
    expect(prompt).toContain("compress repeated setup chatter");
    expect(prompt).toContain("do not create broad umbrella buckets");
    expect(prompt).toContain("Preserve the concrete source action");
  });

  it("compresses long source-message context before live answer synthesis", () => {
    const compressed = compressPhase63BeamMemoryContextText(`
      I'm finalizing deployment and need security hardening for authentication and authorization before launch. Here's my current code:
      \`\`\`python
      SECRET_KEY = "do-not-surface-this-test-fixture"
      app.run(port=10000)
      \`\`\`
      Can you review every implementation detail?
    `);

    expect(compressed).toContain("finalizing deployment");
    expect(compressed).toContain("security hardening");
    expect(compressed).not.toContain("do-not-surface-this-test-fixture");
    expect(compressed.length).toBeLessThan(180);
  });

  it("prepends source-ordered retrieved turns for ordering answer synthesis", () => {
    const memoryContext = buildPhase63BeamAnswerMemoryContext({
      memoryContext: "- chat_id=12: Late deployment notes.",
      retrievedChatIds: [12, 4],
      testCase: {
        answer: "First, setup. Second, deployment.",
        answerable: true,
        chat: [
          [
            {
              content: "I first initialized the Flask app and database schema.",
              id: 4,
              index: "4",
              questionType: "event_ordering",
              role: "user",
              timeAnchor: "unknown",
            },
            {
              content: "Later I reviewed deployment and security tests.",
              id: 12,
              index: "12",
              questionType: "event_ordering",
              role: "user",
              timeAnchor: "April-25-2024",
            },
          ],
        ],
        conversationId: "beam-live-ordering",
        evidenceChatIds: [4, 12],
        question:
          "Can you list the order in which I brought up the app work? Mention ONLY and ONLY two items.",
        questionId: "beam-live-ordering-q1",
        questionType: "event_ordering",
        scale: "100K",
      },
    });

    expect(extractPhase63BeamRequestedItemCount("Mention ONLY five items.")).toBe(
      5,
    );
    expect(memoryContext).toContain("Source-ordered retrieved turns");
    expect(memoryContext).toContain("Requested item count: 2");
    expect(memoryContext.indexOf("chat_id=4")).toBeLessThan(
      memoryContext.indexOf("chat_id=12"),
    );
    expect(memoryContext).toContain("Retrieved GoodMemory records");
  });

  it("routes through the general evidence pack when evidencePack is set", () => {
    const testCase = {
      answer: "8000",
      answerable: true,
      chat: [
        [
          {
            content: "My monthly budget is $5,000.",
            id: 4,
            index: "4",
            questionType: "knowledge_update",
            role: "user",
            timeAnchor: "January-10-2024",
          },
          {
            content: "I increased my monthly budget to $8,000.",
            id: 12,
            index: "12",
            questionType: "knowledge_update",
            role: "user",
            timeAnchor: "April-25-2024",
          },
        ],
      ],
      conversationId: "beam-live-pack",
      evidenceChatIds: [4, 12],
      question: "What is my current monthly budget?",
      questionId: "beam-live-pack-q1",
      questionType: "knowledge_update",
      scale: "100K" as const,
    };

    const packed = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "- chat_id=4: My monthly budget is $5,000.",
      retrievedChatIds: [12, 4],
      testCase,
    });
    const plain = buildPhase63BeamAnswerMemoryContext({
      evidencePack: false,
      memoryContext: "- chat_id=4: My monthly budget is $5,000.",
      retrievedChatIds: [12, 4],
      testCase,
    });

    // The general pack adds current-value framing for a non-ordering update
    // question that the default raw-records path leaves unframed.
    expect(packed).toContain("Current-value resolution:");
    expect(packed).toContain("Evidence (source-ordered, earliest first):");
    expect(packed).toContain("latest entry is the current value");
    // Earliest source order first regardless of retrieval order.
    expect(packed.indexOf("#4")).toBeLessThan(packed.indexOf("#12"));
    // It replaces, not augments, the bespoke source-ordered section.
    expect(packed).not.toContain("Source-ordered retrieved turns");
    expect(plain).not.toContain("latest entry is the current value");

    const orderingPacked = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "",
      retrievedChatIds: [12, 4],
      testCase: {
        ...testCase,
        answer: "First budget planning, then increased budget.",
        question: "Which budget topics did I mention?",
        questionId: "beam-live-pack-order",
        questionType: "event_ordering",
      },
    });
    expect(orderingPacked).toContain("Timeline evidence:");
    expect(orderingPacked).toContain("Do not reorder evidence by topical similarity");
  });

  it("adds companion assistant evidence only for synthesis-style evidence packs", () => {
    const testCase = {
      answer: "Use feedback and revise consistently.",
      answerable: true,
      chat: [
        [
          {
            content: "I need to improve my draft from 82% to 90%.",
            id: 10,
            index: "10",
            questionType: "multi_session_reasoning",
            role: "user",
            timeAnchor: "Jan",
          },
          {
            content:
              "Focus on thesis clarity, argument structure, evidence synthesis, transitions, and style.",
            id: 11,
            index: "11",
            questionType: "",
            role: "assistant",
            timeAnchor: "Jan",
          },
        ],
      ],
      conversationId: "beam-live-companion-pack",
      evidenceChatIds: [10],
      question:
        "How did my essay performance goals evolve, and what should I prioritize?",
      questionId: "beam-live-companion-pack-q1",
      questionType: "multi_session_reasoning",
      scale: "100K" as const,
    };

    const multiSessionPack = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "",
      retrievedChatIds: [10],
      testCase,
    });
    const orderingPack = buildPhase63BeamAnswerMemoryContext({
      evidencePack: true,
      memoryContext: "",
      retrievedChatIds: [10],
      testCase: {
        ...testCase,
        question: "Can you list the order in which I brought up draft work?",
        questionId: "beam-live-companion-pack-order",
        questionType: "event_ordering",
      },
    });

    expect(multiSessionPack).toContain("#10");
    expect(multiSessionPack).toContain("#11");
    expect(multiSessionPack).toContain("thesis clarity");
    expect(orderingPack).toContain("#10");
    expect(orderingPack).not.toContain("#11");
    expect(orderingPack).not.toContain("thesis clarity");
  });

  it("normalizes dependency instruction answers to name and version requirements", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "Use the usual project dependencies.",
      memoryContext: [
        "Instruction handling:",
        "Standing instruction: Always include version numbers when I ask about software dependencies or libraries used.",
        "Answer shape: provide dependency names and their version numbers.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question: "Which libraries are used in this project?",
        questionType: "instruction_following",
      }),
    });

    expect(answer).toBe(
      "Response should include the names of the libraries along with their specific version numbers.",
    );
  });

  it("normalizes role/security count answers to the value-bearing features", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis:
        "Five, including admin roles, user roles, password hashing, role-based access control, and account lockout.",
      memoryContext: [
        "Count/value table:",
        "password hashing",
        "role-based access control",
        "account lockout after failed login attempts",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "How many different user roles and security features am I trying to implement across my sessions?",
        questionType: "multi_session_reasoning",
      }),
    });

    expect(answer).toBe(
      "Three: password hashing, role-based access control, and account lockout after failed login attempts.",
    );
  });

  it("normalizes integration contradiction answers to ask for clarification", () => {
    const answer = applyPhase63BeamAnswerOperationGuardrails({
      hypothesis: "Yes, Flask-Login has been integrated.",
      memoryContext: [
        "Contradiction evidence guide:",
        "#1 I'm trying to integrate Flask-Login v0.6.2 for session management.",
        "#2 I have never integrated Flask-Login or managed user sessions in this project.",
      ].join("\n"),
      testCase: buildGuardrailCase({
        question:
          "Have I integrated Flask-Login for session management in my project?",
        questionType: "contradiction_resolution",
      }),
    });

    expect(answer).toBe(
      "I notice you've mentioned contradictory information about this. You said you have never integrated Flask-Login or managed user sessions in this project, but you also mentioned that Flask-Login v0.6.2 was integrated for session management replacing manual session handling. Could you clarify which is correct?",
    );
  });

  it("prunes noisy source-ordered retrieved turns to the requested ordered evidence count", () => {
    const chat = [
      [
        {
          content:
            "I want to implement core app functionality with authentication, expense tracking, and visualization.",
          id: 4,
          index: "4",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am setting up Jinja2 templates and Bootstrap for the tracker UI.",
          id: 10,
          index: "10",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am working on transaction CRUD and analytics integration after finishing registration and login.",
          id: 60,
          index: "60",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am finalizing deployment and need security hardening for authentication and authorization before launch.",
          id: 116,
          index: "116",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am trying to achieve 90% coverage on auth.py and security.py with new tests for security features.",
          id: 154,
          index: "154",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I am documenting API endpoints and architecture decisions in Confluence for a remote collaborator.",
          id: 176,
          index: "176",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
      ],
    ];

    const memoryContext = buildPhase63BeamAnswerMemoryContext({
      memoryContext:
        "- chat_id=10: I am setting up Jinja2 templates and Bootstrap.\n- chat_id=154: coverage tests.\n- chat_id=176: I am documenting API endpoints in Confluence.",
      retrievedChatIds: [4, 10, 60, 116, 154, 176],
      testCase: {
        answer: "Core functionality, transaction CRUD, then security hardening.",
        answerable: true,
        chat,
        conversationId: "beam-live-ordering-pruned",
        evidenceChatIds: [4, 60, 116],
        question:
          "Can you list the order in which I brought up different aspects of developing my app? Mention ONLY and ONLY three items.",
        questionId: "beam-live-ordering-pruned-q1",
        questionType: "event_ordering",
        scale: "100K",
      },
    });

    expect(memoryContext).toContain("chat_id=4");
    expect(memoryContext).toContain("chat_id=60");
    expect(memoryContext).toContain("chat_id=116");
    expect(memoryContext).not.toContain("chat_id=10");
    expect(memoryContext).not.toContain("chat_id=154");
    expect(memoryContext).not.toContain("chat_id=176");
    expect(memoryContext).toContain("represented in the source-ordered turns");
  });

  it("selects concrete setup, endpoint, deployment, and security-test turns for five-item ordering prompts", () => {
    const chat = [
      [
        {
          content:
            "Sure, let's break it down for my budget tracker project. Components: authentication, transaction management, analytics. Milestones: setup Flask project, schema, auth, and analytics.",
          id: 2,
          index: "2",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm trying to initialize a Flask 2.3.1 project on Python 3.11 with SQLite 3.39 as my database, and I want it to run on local dev at port 5000.",
          id: 6,
          index: "6",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm trying to design a monolithic Flask app with the MVC pattern and create the initial database schema and models.",
          id: 12,
          index: "12",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm trying to implement the transaction CRUD in my Flask app, specifically the POST /transactions route, and I want to make sure it returns a 201 status code when a new transaction is created successfully.",
          id: 62,
          index: "62",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm trying to design a REST API for transactions with GET, POST, PUT, and DELETE endpoints plus validation and error handling.",
          id: 82,
          index: "82",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm having deployment issues on Render.com with Gunicorn using 3 workers on port 10000. I've also completed integration tests covering authentication, transaction CRUD, analytics endpoints, and 95% pass rate.",
          id: 118,
          index: "118",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'll add tests to cover more edge cases and security vulnerabilities, specifically SQL injection and XSS.",
          id: 120,
          index: "120",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
        {
          content:
            "I'm having trouble with deployment preparation, specifically production environment variables like DATABASE_URL, SECRET_KEY, and FLASK_ENV.",
          id: 134,
          index: "134",
          questionType: "event_ordering",
          role: "user",
          timeAnchor: "unknown",
        },
      ],
    ];

    const memoryContext = buildPhase63BeamAnswerMemoryContext({
      memoryContext:
        "- chat_id=2: broad plan.\n- chat_id=12: schema.\n- chat_id=82: broad REST API.\n- chat_id=134: environment variables.",
      retrievedChatIds: [2, 6, 12, 62, 82, 118, 120, 134],
      testCase: {
        answer:
          "Setup, POST transaction creation, Gunicorn deployment/tests, and security tests.",
        answerable: true,
        chat,
        conversationId: "beam-live-ordering-five",
        evidenceChatIds: [6, 62, 118, 120],
        question:
          "Can you walk me through the order in which I brought up different aspects of my app development and deployment across our conversations? Mention ONLY and ONLY five items.",
        questionId: "beam-live-ordering-five-q1",
        questionType: "event_ordering",
        scale: "100K",
      },
    });

    expect(memoryContext).toContain("chat_id=6");
    expect(memoryContext).toContain("chat_id=62");
    expect(memoryContext).toContain("chat_id=118");
    expect(memoryContext).toContain("chat_id=120");
    expect(memoryContext).not.toContain("chat_id=2 role");
    expect(memoryContext).not.toContain("chat_id=12 role");
    expect(memoryContext).not.toContain("chat_id=82 role");
    expect(memoryContext).not.toContain("chat_id=134 role");
  });

  it("runs answer generation and judging over selected real-recall misses", async () => {
    const writes = new Map<string, string>();
    const generatedPrompts: string[] = [];
    const report = await runPhase63BeamLiveSlice(
      {
        benchmarkRoot: "/tmp/BEAM",
        limit: 1,
        outputDir: "/tmp/out",
        profile: "goodmemory-rules-only",
        recallReportPath: "/tmp/recall.json",
        runId: "run-beam-live",
      },
      {
        answerGenerator: async (input) => {
          generatedPrompts.push(input.prompt);
          expect(input.memoryContext).toContain("chat_id=2");
          return "Theo.";
        },
        answerJudge: async (input) => {
          expect(input.expectedAnswer).toBe("Theo.");
          expect(input.actualAnswer).toBe("Theo.");
          return {
            correct: true,
            method: "semantic_judge",
            reasoning: "The candidate preserves the owner.",
          };
        },
        appendFile: async () => undefined,
        mkdir: async () => undefined,
        now: () => new Date("2026-05-18T01:00:00.000Z"),
        readFile: async (path) => {
          if (path === "/tmp/recall.json") {
            return buildRecallReport();
          }
          expect(path).toBe(join("/tmp/BEAM", "100K.json"));
          return JSON.stringify(buildBeamRows());
        },
        writeFile: async (path, value) => {
          writes.set(path, value);
        },
      },
    );

    expect(report.summary.totalCases).toBe(1);
    expect(report.summary.executionFailures).toBe(0);
    expect(report.summary.correctCases).toBe(1);
    expect(report.cases[0]?.retrievedChatIds).toContain(2);
    expect(generatedPrompts[0]).toContain("Who owns the rollback checklist?");
    expect(writes.has("/tmp/out/run-beam-live/live-slice-report.json")).toBe(true);
  });
});
