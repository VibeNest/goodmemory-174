import { describe, expect, it } from "bun:test";

import {
  assertPhase74IngestionRememberResult,
  assertPhase74RecallProviderIntegrity,
  assertPhase74RetrievedProvenance,
  buildPhase74IngestionKey,
  buildPhase74LabelFreeScope,
  phase74ExecutionBranch,
} from "../../src/eval/phase74FullRuntime";

const base = {
  datasetSha256: "dataset-sha",
  embedding: {
    adapterVersion: "openai-compatible-embedding-v1",
    gateway: "https://ai.gurkiai.com/v1",
    model: "embedding-v1",
    provider: "openai",
  },
  evaluatorSourceSha256:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  extraction: {
    contextualDescriptors: true,
    extractorVersion: "provider-memory-extractor-v1",
    gateway: "https://ai.gurkiai.com/v1",
    maxOutputTokens: 4_096,
    model: "gpt-5.6-terra",
    promptSha256:
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    provider: "openai",
    temperature: 0,
  },
  memoryGroupId: "conversation-1",
  rawEvidence: [{
    content: "Caroline adopted Pepper.",
    id: "conversation-1/D1:1",
    observedAt: "2023-05-08",
    role: "user",
    sourceIds: ["D1:1"],
  }],
  representation: "atomic-contextual-raw-pointer",
} as const;

describe("Phase 74 full ingestion identity", () => {
  it("fails closed when a retrieved memory loses its immutable source pointer", () => {
    expect(() => assertPhase74RetrievedProvenance([{
      id: "fact-1",
      sourceIds: ["D1:1"],
    }])).not.toThrow();

    expect(() => assertPhase74RetrievedProvenance([{
      id: "fact-1",
      sourceIds: [],
    }])).toThrow("missing immutable source ids");
  });

  it("fails closed when a paid retrieval arm falls back from its provider", () => {
    expect(() => assertPhase74RecallProviderIntegrity({
      plannerMode: "deterministic",
      policyApplied: [],
      reranker: {
        fallbackReason: "provider_error",
        status: "fallback",
      },
    })).toThrow("provider reranker fell back");

    expect(() => assertPhase74RecallProviderIntegrity({
      plannerMode: "assisted",
      policyApplied: ["recall_plan_assistant_fallback"],
      reranker: { status: "applied" },
    })).toThrow("assisted recall plan fell back");

    expect(() => assertPhase74RecallProviderIntegrity({
      plannerMode: "deterministic",
      policyApplied: [],
      reranker: { status: "skipped" },
    })).not.toThrow();
  });

  it("fails closed when assisted extraction silently degrades to rules-only", () => {
    expect(() => assertPhase74IngestionRememberResult({
      extractionStrategy: "llm-assisted",
      result: {
        accepted: 1,
        events: [],
        rejected: 0,
        warnings: ["assisted_extraction_failed"],
      },
    })).toThrow("assisted extraction failed");

    expect(() => assertPhase74IngestionRememberResult({
      extractionStrategy: "rules-only",
      result: {
        accepted: 1,
        events: [],
        rejected: 0,
        warnings: ["assisted_extraction_failed"],
      },
    })).not.toThrow();
  });

  it("uses an opaque stable scope that cannot reveal family, run, or case labels", () => {
    const scope = buildPhase74LabelFreeScope({
      caseId: "locomo/conversation-1/q1",
      memoryGroupId: "conversation-1",
      question: "What happened?",
      rawEvidence: [],
    });

    expect(scope.workspaceId).toMatch(/^workspace-[0-9a-f]{32}$/u);
    expect(scope.userId).toMatch(/^user-[0-9a-f]{32}$/u);
    expect(JSON.stringify(scope)).not.toContain("locomo");
    expect(JSON.stringify(scope)).not.toContain("conversation-1");
    expect(JSON.stringify(scope).toLowerCase()).not.toContain("phase74");
  });

  it("attributes only frozen baseline and candidate arms to promotion cost branches", () => {
    expect(phase74ExecutionBranch("E1", "fact-only")).toBe("baseline");
    expect(phase74ExecutionBranch("E1", "atomic-contextual-raw-pointer")).toBe(
      "candidate",
    );
    expect(phase74ExecutionBranch("E1", "raw-only")).toBe("shadow");
    expect(phase74ExecutionBranch("E2", "claim-temporal-off")).toBe("baseline");
    expect(phase74ExecutionBranch("E2", "claim-temporal-on")).toBe("candidate");
    expect(phase74ExecutionBranch("E3", "recall-plan-off")).toBe("baseline");
    expect(phase74ExecutionBranch("E3", "recall-plan-deterministic")).toBe(
      "candidate",
    );
    expect(phase74ExecutionBranch("E3", "recall-plan-assisted")).toBe("shadow");
  });

  it("reuses one group/representation snapshot across queries and retrieval arms", () => {
    const first = buildPhase74IngestionKey(base);
    const second = buildPhase74IngestionKey({ ...base });
    expect(second).toBe(first);
  });

  it("misses when evidence, representation, model, prompt, evaluator source, or descriptors change", () => {
    const key = buildPhase74IngestionKey(base);
    expect(buildPhase74IngestionKey({
      ...base,
      rawEvidence: [{ ...base.rawEvidence[0], content: "changed" }],
    })).not.toBe(key);
    expect(buildPhase74IngestionKey({
      ...base,
      representation: "fact-only",
    })).not.toBe(key);
    expect(buildPhase74IngestionKey({
      ...base,
      extraction: { ...base.extraction, model: "other-model" },
    })).not.toBe(key);
    expect(buildPhase74IngestionKey({
      ...base,
      embedding: { ...base.embedding, gateway: "https://other.example/v1" },
    })).not.toBe(key);
    expect(buildPhase74IngestionKey({
      ...base,
      extraction: { ...base.extraction, contextualDescriptors: false },
    })).not.toBe(key);
    expect(buildPhase74IngestionKey({
      ...base,
      extraction: { ...base.extraction, promptSha256: "changed-prompt" },
    })).not.toBe(key);
    expect(buildPhase74IngestionKey({
      ...base,
      extraction: { ...base.extraction, maxOutputTokens: 2_048 },
    })).not.toBe(key);
    expect(buildPhase74IngestionKey({
      ...base,
      extraction: { ...base.extraction, temperature: 0.2 },
    })).not.toBe(key);
    expect(buildPhase74IngestionKey({
      ...base,
      evaluatorSourceSha256: "changed-source",
    })).not.toBe(key);
  });
});
