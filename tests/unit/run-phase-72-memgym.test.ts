import { describe, expect, it } from "bun:test";

import {
  buildMemGymAnswerPrompt,
  buildMemGymFactJudgePrompt,
  parsePhase72MemGymOptions,
  resolvePhase72MemGymLiveConfig,
} from "../../scripts/run-phase-72-memgym";

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

describe("Phase 72 MemGym live runner", () => {
  it("parses the generated-slice paths and bounded concurrency", () => {
    expect(parsePhase72MemGymOptions([
      "bun",
      "run-phase-72-memgym.ts",
      "--instances",
      "/bench/verified.jsonl",
      "--upstream-root",
      "/bench/MemGym",
      "--output-dir",
      "/reports/memgym",
      "--work-dir",
      "/tmp/memgym",
      "--run-id",
      "run-test",
      "--max-concurrency",
      "3",
    ])).toEqual({
      instances: "/bench/verified.jsonl",
      maxConcurrency: 3,
      outputDir: "/reports/memgym",
      runId: "run-test",
      upstreamRoot: "/bench/MemGym",
      workDir: "/tmp/memgym",
    });
  });

  it("pins answer, extraction, and judge roles", () => {
    expect(resolvePhase72MemGymLiveConfig(ENV)).toMatchObject({
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
    expect(() => resolvePhase72MemGymLiveConfig({
      ...ENV,
      GOODMEMORY_EVAL_MODEL: "gpt-5.5",
    })).toThrow("gpt-5.6-terra");
  });

  it("keeps GoodMemory and no-memory on the same upstream answer contract", () => {
    const prompt = buildMemGymAnswerPrompt({
      notes: "[debug.md] The parser rejects empty state.",
      question: "What does the parser reject?",
      repoContext: "parser.py",
      taskPrompt: "Fix parser validation.",
    });

    expect(prompt).toContain("Earlier documents have been removed");
    expect(prompt).toContain("[debug.md] The parser rejects empty state.");
    expect(prompt).toContain("Fix parser validation.");
    expect(prompt).toContain("sources_used");
  });

  it("uses the upstream fact-judge meaning rather than token overlap", () => {
    const prompt = buildMemGymFactJudgePrompt({
      answer: "Empty state is rejected.",
      fact: "The parser rejects empty state.",
      question: "What does the parser reject?",
    });

    expect(prompt).toContain("does not need to be word-for-word");
    expect(prompt).toContain("contains_fact=false");
    expect(prompt).toContain("The parser rejects empty state.");
  });
});
