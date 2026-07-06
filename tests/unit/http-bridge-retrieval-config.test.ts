import { describe, expect, it } from "bun:test";
import {
  createMemoryConfig,
  parseArgs,
} from "../../scripts/goodmemory-http-bridge";

const EMPTY_ENV = {} as NodeJS.ProcessEnv;

describe("http bridge retrieval preset wiring", () => {
  it("defaults to no retrieval preset (byte-parity with today)", () => {
    const parsed = parseArgs([], EMPTY_ENV);
    expect(parsed.retrievalPreset).toBeUndefined();
    expect(createMemoryConfig({ profile: "default" })).toEqual({});
  });

  it("reads GOODMEMORY_HTTP_BRIDGE_RETRIEVAL_PRESET from env", () => {
    const parsed = parseArgs([], {
      GOODMEMORY_HTTP_BRIDGE_RETRIEVAL_PRESET: "recommended",
    } as NodeJS.ProcessEnv);
    expect(parsed.retrievalPreset).toBe("recommended");
  });

  it("reads --retrieval-preset flag (overrides env-less default)", () => {
    const parsed = parseArgs(["--retrieval-preset", "recommended"], EMPTY_ENV);
    expect(parsed.retrievalPreset).toBe("recommended");
  });

  it("rejects an unsupported retrieval preset", () => {
    expect(() =>
      parseArgs([], {
        GOODMEMORY_HTTP_BRIDGE_RETRIEVAL_PRESET: "aggressive",
      } as NodeJS.ProcessEnv),
    ).toThrow(/recommended/);
    expect(() => parseArgs(["--retrieval-preset", "nope"], EMPTY_ENV)).toThrow(
      /recommended/,
    );
  });

  it("threads the preset into the memory config", () => {
    expect(
      createMemoryConfig({ profile: "default", retrievalPreset: "recommended" }),
    ).toEqual({ retrieval: { preset: "recommended" } });
  });

  it("keeps the life-coach remember profile alongside a retrieval preset", () => {
    const config = createMemoryConfig({
      profile: "life-coach",
      retrievalPreset: "recommended",
    });
    expect(config.retrieval).toEqual({ preset: "recommended" });
    expect(config.remember).toBeDefined();
  });
});
