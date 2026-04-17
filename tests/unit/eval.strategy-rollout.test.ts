import { describe, expect, it } from "bun:test";
import { resolveRetrievalStrategyRollout } from "../../src/eval/strategy-rollout";

describe("eval strategy rollout", () => {
  it("does not rewrite router semantics when no rollout is configured", () => {
    const plan = resolveRetrievalStrategyRollout({});

    expect(plan.family).toBeUndefined();
    expect(plan.mode).toBeUndefined();
    expect(plan.requestedStrategyLabel).toBe("auto");
    expect(plan.promotedStrategyLabel).toBeUndefined();
    expect(plan.executedStrategy).toBe("auto");
    expect(plan.candidateStrategyLabel).toBeUndefined();
    expect(plan.candidateInfluencedExecution).toBeUndefined();
  });

  it("keeps promoted rules-only execution in observe mode while recording the candidate strategy", () => {
    const plan = resolveRetrievalStrategyRollout({
      requestedStrategy: "hybrid",
      rollout: {
        mode: "observe",
      },
    });

    expect(plan.family).toBe("retrieval");
    expect(plan.mode).toBe("observe");
    expect(plan.requestedStrategyLabel).toBe("hybrid");
    expect(plan.promotedStrategyLabel).toBe("rules-only");
    expect(plan.executedStrategy).toBe("rules-only");
    expect(plan.candidateStrategyLabel).toBe("hybrid");
    expect(plan.candidateInfluencedExecution).toBe(false);
  });

  it("lets the candidate retrieval strategy execute in assist mode", () => {
    const plan = resolveRetrievalStrategyRollout({
      requestedStrategy: "hybrid",
      rollout: {
        mode: "assist",
      },
    });

    expect(plan.mode).toBe("assist");
    expect(plan.requestedStrategyLabel).toBe("hybrid");
    expect(plan.executedStrategy).toBe("hybrid");
    expect(plan.candidateStrategyLabel).toBe("hybrid");
    expect(plan.candidateInfluencedExecution).toBe(true);
  });

  it("locks execution to the promoted strategy in promote mode even when a candidate is requested", () => {
    const plan = resolveRetrievalStrategyRollout({
      requestedStrategy: "hybrid",
      rollout: {
        mode: "promote",
        promotedStrategy: "rules-only",
      },
    });

    expect(plan.mode).toBe("promote");
    expect(plan.requestedStrategyLabel).toBe("hybrid");
    expect(plan.promotedStrategyLabel).toBe("rules-only");
    expect(plan.executedStrategy).toBe("rules-only");
    expect(plan.candidateStrategyLabel).toBe("hybrid");
    expect(plan.candidateInfluencedExecution).toBe(false);
  });
});
