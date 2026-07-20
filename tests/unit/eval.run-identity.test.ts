import { describe, expect, it } from "bun:test";

import {
  buildEvalRunIdentity,
  canonicalEvalExperimentIdentityJson,
  canonicalEvalRunIdentityJson,
  createOrMatchEvalRunIdentity,
  hashEvalExperimentIdentity,
  hashEvalRunIdentity,
} from "../../src/eval/runIdentity";
import type {
  EvalRunIdentity,
  EvalRunIdentityPersistence,
} from "../../src/eval/runIdentity";

function createIdentity(
  overrides: Partial<EvalRunIdentity> = {},
): EvalRunIdentity {
  return buildEvalRunIdentity({
    answerModel: {
      gateway: "https://ai.gurkiai.com/v1",
      model: "gpt-5.6-terra",
      provider: "openai",
    },
    benchmark: "fixture",
    configuration: {
      concurrency: 4,
      contextTokenBudget: 6_000,
      maxOutputTokens: 512,
      seed: 7,
      temperature: 0,
      timeoutMs: 180_000,
    },
    datasetSha256: "dataset-sha",
    generatedAt: "2026-07-16T00:00:00.000Z",
    generatedBy: "tests/unit/eval.run-identity.test.ts",
    judgeModel: {
      gateway: "https://judge.example/v1",
      model: "independent-judge",
      provider: "openai",
    },
    promptSha256s: {
      genericReader: "reader-prompt-sha",
      judge: "judge-prompt-sha",
    },
    runId: "run-1",
    ...overrides,
  });
}

function createPersistence(initial?: string): {
  created: string[];
  persistence: EvalRunIdentityPersistence;
} {
  let value = initial ?? null;
  const created: string[] = [];
  return {
    created,
    persistence: {
      async create(_path, content) {
        created.push(content);
        value = content;
      },
      async read() {
        return value;
      },
    },
  };
}

describe("eval run identity", () => {
  it("canonicalizes object keys and excludes generatedAt from comparison and hashing", () => {
    const first = createIdentity();
    const second = createIdentity({
      configuration: {
        timeoutMs: 180_000,
        temperature: 0,
        seed: 7,
        maxOutputTokens: 512,
        contextTokenBudget: 6_000,
        concurrency: 4,
      },
      generatedAt: "2026-07-17T00:00:00.000Z",
      promptSha256s: {
        judge: "judge-prompt-sha",
        genericReader: "reader-prompt-sha",
      },
    });

    expect(canonicalEvalRunIdentityJson(first)).toBe(
      canonicalEvalRunIdentityJson(second),
    );
    expect(hashEvalRunIdentity(first)).toBe(hashEvalRunIdentity(second));
    expect(canonicalEvalRunIdentityJson(first)).not.toContain("generatedAt");
  });

  it("keeps run hashes unique while sharing one experiment hash across replicates", () => {
    const first = createIdentity({
      configuration: { replicate: 1, selectedLimit: 12 },
      generatedAt: "2026-07-16T00:00:00.000Z",
      runId: "experiment-r1",
    });
    const second = createIdentity({
      configuration: { replicate: 2, selectedLimit: 12 },
      generatedAt: "2026-07-17T00:00:00.000Z",
      runId: "experiment-r2",
    });
    const changedExperiment = createIdentity({
      configuration: { replicate: 3, selectedLimit: 10 },
      runId: "experiment-r3",
    });

    expect(hashEvalRunIdentity(first)).not.toBe(hashEvalRunIdentity(second));
    expect(hashEvalExperimentIdentity(first)).toBe(
      hashEvalExperimentIdentity(second),
    );
    expect(hashEvalExperimentIdentity(first)).not.toBe(
      hashEvalExperimentIdentity(changedExperiment),
    );
    expect(canonicalEvalExperimentIdentityJson(first)).not.toContain(
      "experiment-r1",
    );
    expect(canonicalEvalExperimentIdentityJson(first)).not.toContain(
      "replicate",
    );
  });

  it("creates a missing identity with generatedAt preserved in the audit artifact", async () => {
    const { created, persistence } = createPersistence();
    const result = await createOrMatchEvalRunIdentity({
      identity: createIdentity(),
      path: "/tmp/run-1/run-identity.json",
      persistence,
    });

    expect(result).toEqual({
      hash: hashEvalRunIdentity(createIdentity()),
      status: "created",
    });
    expect(created).toHaveLength(1);
    expect(JSON.parse(created[0] ?? "{}").generatedAt).toBe(
      "2026-07-16T00:00:00.000Z",
    );
  });

  it("matches an existing identity whose only difference is generatedAt", async () => {
    const existing = createIdentity({
      generatedAt: "2026-07-15T00:00:00.000Z",
    });
    const { created, persistence } = createPersistence(
      `${JSON.stringify(existing, null, 2)}\n`,
    );

    const result = await createOrMatchEvalRunIdentity({
      identity: createIdentity(),
      path: "/tmp/run-1/run-identity.json",
      persistence,
    });

    expect(result.status).toBe("matched");
    expect(created).toEqual([]);
  });

  it("rejects identity drift instead of overwriting an existing run", async () => {
    const existing = createIdentity({
      datasetSha256: "different-dataset-sha",
    });
    const { created, persistence } = createPersistence(
      `${JSON.stringify(existing)}\n`,
    );

    await expect(
      createOrMatchEvalRunIdentity({
        identity: createIdentity(),
        path: "/tmp/run-1/run-identity.json",
        persistence,
      }),
    ).rejects.toThrow(
      "Eval run identity drift at /tmp/run-1/run-identity.json",
    );
    expect(created).toEqual([]);
  });

  it("rejects answer and judge configurations that use the same model", () => {
    expect(() =>
      createIdentity({
        judgeModel: {
          gateway: "https://judge.example/v1",
          model: "GPT-5.6-TERRA",
          provider: "openai",
        },
      })
    ).toThrow("Eval answer and judge models must be independent");
  });

  it("rejects API keys anywhere in identity metadata", () => {
    expect(() =>
      createIdentity({
        configuration: {
          apiKey: "secret",
          concurrency: 4,
        },
      })
    ).toThrow("Eval run identity must not contain API keys");
    expect(() =>
      createIdentity({
        configuration: {
          environment: { OPENAI_API_KEY: "secret" },
        },
      })
    ).toThrow("Eval run identity must not contain API keys");
  });
});
