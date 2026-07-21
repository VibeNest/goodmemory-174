import { describe, expect, it } from "bun:test";
import {
  estimateTextTokens,
  truncateTextToEstimatedTokens,
} from "../../src/tokenEstimator";

describe("token estimator", () => {
  it("preserves the existing four-ASCII-characters approximation", () => {
    expect(estimateTextTokens("")).toBe(0);
    expect(estimateTextTokens("abcde")).toBe(2);
    expect(estimateTextTokens("abcdefghijklmnop")).toBe(4);
  });

  it("counts CJK script characters conservatively", () => {
    expect(estimateTextTokens("记忆")).toBe(2);
    expect(estimateTextTokens("きおく")).toBe(3);
    expect(estimateTextTokens("メモリー")).toBe(4);
    expect(estimateTextTokens("기억")).toBe(2);
    expect(estimateTextTokens("abc记忆")).toBe(3);
    expect(estimateTextTokens("𠀀")).toBe(1);
  });

  it("truncates on code-point boundaries without exceeding the estimate", () => {
    expect(truncateTextToEstimatedTokens("记忆偏好", 2)).toBe("记忆");
    expect(truncateTextToEstimatedTokens("abcdefghijklmnop", 2)).toBe("abcdefgh");
    expect(truncateTextToEstimatedTokens("记忆", 0)).toBe("");
  });
});
