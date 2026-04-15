import { describe, expect, it } from "bun:test";
import {
  createGoodMemory,
  createRuntimeContextService,
  createRuntimeSalvageHooks,
  type GoodMemory,
  type GoodMemoryConfig,
} from "../../src/index";

describe("bootstrap smoke", () => {
  it("exports the public factory and public types", () => {
    expect(typeof createGoodMemory).toBe("function");
    expect(typeof createRuntimeContextService).toBe("function");
    expect(typeof createRuntimeSalvageHooks).toBe("function");

    const config: GoodMemoryConfig = {
      storage: { provider: "memory" },
    };

    const memory: GoodMemory = createGoodMemory(config);
    expect(memory).toBeDefined();
  });
});
