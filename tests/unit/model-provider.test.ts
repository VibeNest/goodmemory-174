import { describe, expect, it } from "bun:test";

import {
  MODEL_PROVIDER_IDS,
  isModelProviderId,
} from "../../src/provider/model-provider";

describe("model provider registry", () => {
  it("defines one shared set of supported providers", () => {
    expect(MODEL_PROVIDER_IDS).toEqual(["openai", "anthropic"]);
    expect(isModelProviderId("openai")).toBe(true);
    expect(isModelProviderId("anthropic")).toBe(true);
    expect(isModelProviderId("unsupported")).toBe(false);
  });
});
