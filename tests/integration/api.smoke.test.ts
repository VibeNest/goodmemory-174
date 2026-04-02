import { describe, expect, it } from "bun:test";
import { createGoodMemory } from "../../src/index";

describe("public API smoke", () => {
  it("creates a memory instance with the minimum public API", () => {
    const memory = createGoodMemory({
      storage: { provider: "memory" },
    });

    expect(typeof memory.recall).toBe("function");
    expect(typeof memory.buildContext).toBe("function");
    expect(typeof memory.remember).toBe("function");
    expect(typeof memory.forget).toBe("function");
    expect(typeof memory.feedback).toBe("function");
  });

  it("creates a postgres-backed memory instance lazily", () => {
    const memory = createGoodMemory({
      storage: {
        provider: "postgres",
        url: "postgres://localhost:5432/goodmemory",
      },
    });

    expect(typeof memory.recall).toBe("function");
    expect(typeof memory.buildContext).toBe("function");
    expect(typeof memory.remember).toBe("function");
    expect(typeof memory.forget).toBe("function");
    expect(typeof memory.feedback).toBe("function");
  });

  it("requires a storage url for postgres mode", () => {
    expect(() =>
      createGoodMemory({
        storage: {
          provider: "postgres",
        },
      }),
    ).toThrow("Postgres storage provider requires storage.url");
  });
});
