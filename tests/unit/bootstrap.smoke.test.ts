import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  type GoodMemory,
  type GoodMemoryConfig,
} from "../../src/index";

describe("bootstrap smoke", () => {
  it("exports the public factory and public types", () => {
    expect(typeof createGoodMemory).toBe("function");

    const config: GoodMemoryConfig = {
      storage: { provider: "memory" },
    };

    const memory: GoodMemory = createGoodMemory(config);
    expect(memory).toBeDefined();
  });
});
