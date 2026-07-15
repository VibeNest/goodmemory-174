import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import {
  buildHaluMemAnswerPrompt,
  buildHaluMemUpdateProjectionPrompt,
  describeHaluMemEmbedding,
  extractHaluMemUserName,
  HALUMEM_ANSWER_SYSTEM_PROMPT,
  HALUMEM_ANSWER_PROMPT_SHA256,
  HALUMEM_APPLICATION_ANSWER_REQUIREMENT,
  HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT,
  isolateHaluMemEmbeddingEnvironment,
  parsePhase72HaluMemOptions,
  resolveHaluMemProjectedUpdate,
  resolvePhase72HaluMemLiveConfig,
  selectHaluMemSourceEvidence,
} from "../../scripts/run-phase-72-halumem";

const ENV = {
  GOODMEMORY_ASSISTED_EXTRACTOR_API_KEY: "extract-key",
  GOODMEMORY_ASSISTED_EXTRACTOR_BASE_URL: "https://ai.gurkiai.com/v1",
  GOODMEMORY_ASSISTED_EXTRACTOR_MODEL: "gpt-5.6-terra",
  GOODMEMORY_EMBEDDING_API_KEY: "embedding-key",
  GOODMEMORY_EMBEDDING_BASE_URL: "https://openrouter.ai/api/v1",
  GOODMEMORY_EMBEDDING_MODEL: "text-embedding-3-small",
  GOODMEMORY_EMBEDDING_PROVIDER: "openai",
  GOODMEMORY_EVAL_API_KEY: "eval-key",
  GOODMEMORY_EVAL_BASE_URL: "https://ai.gurkiai.com/v1",
  GOODMEMORY_EVAL_MODEL: "gpt-5.6-terra",
  GOODMEMORY_EVAL_PROVIDER: "openai",
  GOODMEMORY_JUDGE_API_KEY: "judge-key",
  GOODMEMORY_JUDGE_BASE_URL: "https://ai.gurkiai.com/v1",
} as const;

describe("Phase 72 HaluMem live runner", () => {
  it("parses the frozen slice and execution paths", () => {
    expect(parsePhase72HaluMemOptions([
      "bun",
      "run-phase-72-halumem.ts",
      "--benchmark-file",
      "/bench/HaluMem-Medium.jsonl",
      "--upstream-root",
      "/bench/HaluMem",
      "--work-dir",
      "/tmp/halumem-work",
      "--output-dir",
      "/tmp/halumem-report",
      "--run-id",
      "run-test",
      "--embedding-mode",
      "local",
      "--user-index",
      "2",
      "--session-indexes",
      "0,1,3,4",
      "--skip-official-eval",
    ])).toEqual({
      answerOnly: false,
      benchmarkFile: "/bench/HaluMem-Medium.jsonl",
      embeddingMode: "local",
      officialEvalOnly: false,
      outputDir: "/tmp/halumem-report",
      runId: "run-test",
      sessionIndexes: [0, 1, 3, 4],
      skipOfficialEval: true,
      upstreamRoot: "/bench/HaluMem",
      userIndex: 2,
      workDir: "/tmp/halumem-work",
    });
  });

  it("rejects contradictory execution modes", () => {
    expect(() => parsePhase72HaluMemOptions([
      "bun",
      "run-phase-72-halumem.ts",
      "--official-eval-only",
      "--skip-official-eval",
    ])).toThrow("cannot be combined");
    expect(() => parsePhase72HaluMemOptions([
      "bun",
      "run-phase-72-halumem.ts",
      "--answer-only",
      "--official-eval-only",
    ])).toThrow("cannot be combined");
  });

  it("pins generation to gpt-5.6-terra and a different judge", () => {
    expect(resolvePhase72HaluMemLiveConfig(ENV)).toMatchObject({
      answer: {
        baseURL: "https://ai.gurkiai.com/v1",
        model: "gpt-5.6-terra",
      },
      extraction: {
        baseURL: "https://ai.gurkiai.com/v1",
        model: "gpt-5.6-terra",
      },
      judge: {
        baseURL: "https://ai.gurkiai.com/v1",
        model: "gpt-5.5",
      },
    });
    expect(() => resolvePhase72HaluMemLiveConfig({
      ...ENV,
      GOODMEMORY_EVAL_MODEL: "gpt-5.5",
    })).toThrow("gpt-5.6-terra");
  });

  it("supports a disclosed local embedding baseline without provider credentials", () => {
    const {
      GOODMEMORY_EMBEDDING_API_KEY: _apiKey,
      GOODMEMORY_EMBEDDING_BASE_URL: _baseURL,
      GOODMEMORY_EMBEDDING_MODEL: _model,
      GOODMEMORY_EMBEDDING_PROVIDER: _provider,
      ...env
    } = ENV;

    const local = resolvePhase72HaluMemLiveConfig(env, "local");
    expect(local).toMatchObject({
      embedding: {
        dimensions: 256,
        mode: "local",
        model: "goodmemory-local-hashed-token-char3gram-v1",
      },
    });
    expect(describeHaluMemEmbedding(local.embedding)).toEqual({
      appliedTo: ["vector-baseline"],
      dimensions: 256,
      gateway: null,
      mode: "local",
      model: "goodmemory-local-hashed-token-char3gram-v1",
      provider: "local",
      role: "hashed-lexical-vector-baseline",
    });
    expect(() => resolvePhase72HaluMemLiveConfig(env, "provider")).toThrow(
      "GOODMEMORY_EMBEDDING_API_KEY",
    );
  });

  it("discloses provider embeddings as shared by both HaluMem profiles", () => {
    const config = resolvePhase72HaluMemLiveConfig(ENV, "provider");

    expect(describeHaluMemEmbedding(config.embedding)).toMatchObject({
      appliedTo: ["goodmemory", "vector-baseline"],
      gateway: "https://openrouter.ai/api/v1",
      mode: "provider",
      model: "text-embedding-3-small",
      provider: "openai",
      role: "embedding",
    });
  });

  it("rejects unknown HaluMem embedding modes", () => {
    expect(() => parsePhase72HaluMemOptions([
      "bun",
      "run-phase-72-halumem.ts",
      "--embedding-mode",
      "neural-ish",
    ])).toThrow("--embedding-mode must be provider or local");
  });

  it("isolates local GoodMemory runs from ambient embedding credentials", () => {
    const isolated = isolateHaluMemEmbeddingEnvironment({
      GOODMEMORY_EMBEDDING_API_KEY: "ambient-key",
      GOODMEMORY_EMBEDDING_BASE_URL: "https://ambient.invalid/v1",
      GOODMEMORY_EMBEDDING_MODEL: "ambient-model",
      GOODMEMORY_EMBEDDING_PROVIDER: "openai",
      GOODMEMORY_EVAL_MODEL: "gpt-5.6-terra",
    }, "local");

    expect(isolated).toEqual({
      GOODMEMORY_EVAL_MODEL: "gpt-5.6-terra",
    });
    expect(isolateHaluMemEmbeddingEnvironment(ENV, "provider")).toBe(ENV);
  });

  it("extracts the upstream persona name field", () => {
    expect(extractHaluMemUserName(
      "[Recorded on Oct 04, 2025] Name: Martin Mark; Gender: Male;",
    )).toBe("Martin Mark");
    expect(() => extractHaluMemUserName("Gender: Male;")).toThrow(
      "persona Name field",
    );
  });

  it("answers contradicted yes-no premises instead of abstaining", () => {
    expect(HALUMEM_ANSWER_SYSTEM_PROMPT).toContain(
      'answer "No" when the context contradicts any required premise',
    );
    expect(HALUMEM_ANSWER_SYSTEM_PROMPT).toContain(
      "planned or intended actions from completed actions",
    );
    expect(HALUMEM_ANSWER_SYSTEM_PROMPT).toContain(
      "neither supports nor contradicts",
    );
    expect(HALUMEM_ANSWER_SYSTEM_PROMPT).toContain(
      "require an explicit link between that identity and the event",
    );
    expect(HALUMEM_ANSWER_SYSTEM_PROMPT).toContain(
      "preference traits",
    );
    expect(HALUMEM_ANSWER_SYSTEM_PROMPT).toContain(
      "practical benefit",
    );
    expect(HALUMEM_ANSWER_SYSTEM_PROMPT).toContain(
      "preserve that explicit benefit wording",
    );
    expect(HALUMEM_ANSWER_SYSTEM_PROMPT).toContain(
      "every directly relevant concrete benefit",
    );
    expect(HALUMEM_ANSWER_SYSTEM_PROMPT).toContain(
      "broader outcome",
    );
  });

  it("places application-question coverage requirements next to the question", () => {
    const applicationPrompt = buildHaluMemAnswerPrompt({
      context: "A remembered preference has several practical benefits.",
      question: "How might that preference affect a later choice?",
    });
    const factualPrompt = buildHaluMemAnswerPrompt({
      context: "The user works as a director.",
      question: "What is the user's job title?",
    });

    expect(applicationPrompt).toContain(
      "Explicitly include every distinct concrete benefit",
    );
    expect(applicationPrompt.lastIndexOf("Explicitly include")).toBeGreaterThan(
      applicationPrompt.lastIndexOf("How might"),
    );
    expect(factualPrompt).not.toContain("Explicitly include every");
    expect(HALUMEM_ANSWER_PROMPT_SHA256).toBe(
      createHash("sha256").update([
        HALUMEM_ANSWER_SYSTEM_PROMPT,
        HALUMEM_APPLICATION_ANSWER_REQUIREMENT,
      ].join("\n")).digest("hex"),
    );
  });

  it("keeps update projection grounded in numbered recalled evidence", () => {
    const prompt = buildHaluMemUpdateProjectionPrompt({
      candidateUpdate: "Martin changed a durable preference.",
      memories: ["Prior preference was A.", "Current preference is B."],
    });

    expect(prompt).toContain("[0] Prior preference was A.");
    expect(prompt).toContain("[1] Current preference is B.");
    expect(prompt).toContain("Candidate update retrieval intent");
    expect(HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT).toContain(
      "never evidence",
    );
    expect(HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT).toContain(
      "cited memory lines",
    );
    expect(HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT).toContain(
      "coverage checklist",
    );
    expect(HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT).toContain(
      "every distinct supported relationship",
    );
    expect(HALUMEM_UPDATE_PROJECTION_SYSTEM_PROMPT).toContain(
      "checklist's own relation and facet wording",
    );
  });

  it("recovers protocol source provenance for update transitions", () => {
    const selected = selectHaluMemSourceEvidence({
      entries: [
        {
          id: "old-preference",
          text: "The user shifted from Labradors after meeting a friend's Golden Retriever.",
        },
        {
          id: "current-reason",
          text: "The Golden Retriever was gentle, and the user valued its adaptability.",
        },
        {
          id: "noise",
          text: "The quarterly budget review is next Tuesday.",
        },
      ],
      limit: 4,
      query:
        "The user changed a pet preference from Labradors to Golden Retrievers because of their gentle nature and adaptability.",
    });

    expect(selected).toContain(
      "The user shifted from Labradors after meeting a friend's Golden Retriever.",
    );
    expect(selected).toContain(
      "The Golden Retriever was gentle, and the user valued its adaptability.",
    );
    expect(selected).not.toContain("The quarterly budget review is next Tuesday.");
  });

  it("selects source evidence for application questions", () => {
    const selected = selectHaluMemSourceEvidence({
      entries: [
        {
          id: "support",
          text: "Pets can provide relaxation and emotional support during stressful work periods.",
        },
        {
          id: "unrelated",
          text: "The user works in healthcare consulting.",
        },
      ],
      limit: 1,
      query: "How might a pet preference influence stressful work periods?",
    });

    expect(selected).toEqual([
      "Pets can provide relaxation and emotional support during stressful work periods.",
    ]);
  });

  it("preserves candidate wording only when every clause is supported", () => {
    expect(
      resolveHaluMemProjectedUpdate({
        candidateUpdate:
          "Martin is committed to access while maintaining health and creativity.",
        fullySupported: true,
        memory: "Martin measures success by access, health, and creativity.",
      }),
    ).toBe(
      "Martin is committed to access while maintaining health and creativity.",
    );
    expect(
      resolveHaluMemProjectedUpdate({
        candidateUpdate: "unsupported candidate",
        fullySupported: false,
        memory: "supported subset",
      }),
    ).toBe("supported subset");
  });

});
