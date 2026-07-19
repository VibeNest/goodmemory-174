import { describe, expect, it } from "bun:test";

import {
  parseC5LiveCanaryOptions,
  runC5LiveCanaryCommand,
} from "../../scripts/run-codex-coding-effect-c5-canary";
import type {
  C5NativeLongitudinalCanaryInput,
} from "../../scripts/codex-coding-effect/c5-live-pilot";

describe("Codex coding-effect C5 live canary CLI", () => {
  it("requires one frozen cluster and forwards the unchanged live pilot inputs", async () => {
    const args = [
      "--cluster-id",
      "episode-1/repetition-1",
      "--package-tarball",
      "dist/goodmemory.tgz",
      "--run-id",
      "c5-canary-001",
      "--codex-model",
      "gpt-test",
      "--reasoning-effort",
      "xhigh",
      "--material-effect-pp",
      "10",
      "--order-seed",
      "73",
    ];
    const defaults = {
      bunExecutable: "/tooling/bun",
      cwd: "/repo/goodmemory",
      homeDir: "/users/eval",
      now: () => "2026-07-16T01:02:03.000Z",
    };
    expect(parseC5LiveCanaryOptions(args, defaults)).toMatchObject({
      clusterId: "episode-1/repetition-1",
      materialEffectPercentagePoints: 10,
      orderSeed: 73,
      runId: "c5-canary-001",
    });
    const calls: unknown[] = [];
    const result = await runC5LiveCanaryCommand(args, {
      defaults,
      run: async (
        input: Omit<C5NativeLongitudinalCanaryInput, "dependencies">,
      ) => {
        calls.push(input);
        return { marker: "canary-complete" };
      },
    });
    expect(result).toEqual({ marker: "canary-complete" });
    expect(calls).toHaveLength(1);
    expect(() => parseC5LiveCanaryOptions(
      args.filter((value) => value !== "--cluster-id" &&
        value !== "episode-1/repetition-1"),
      defaults,
    )).toThrow("--cluster-id is required");
  });
});
