import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DeterministicClock,
  createDeterministicIdGenerator,
  createTempWorkspace,
} from "../../src/testing/utils";

describe("testing utilities", () => {
  it("creates a deterministic clock", () => {
    const clock = new DeterministicClock("2026-01-01T00:00:00.000Z");

    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    clock.advanceMs(5000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:05.000Z");
  });

  it("creates deterministic ids", () => {
    const nextId = createDeterministicIdGenerator("mem");

    expect(nextId()).toBe("mem-0001");
    expect(nextId()).toBe("mem-0002");
  });

  it("creates a clean temp workspace", async () => {
    const workspace = await createTempWorkspace("goodmemory");

    expect(existsSync(workspace.root)).toBe(true);
    expect(existsSync(join(workspace.root, "fixtures"))).toBe(true);

    await workspace.cleanup();
    expect(existsSync(workspace.root)).toBe(false);
  });
});
