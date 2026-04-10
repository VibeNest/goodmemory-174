import { describe, expect, it } from "bun:test";
import {
  findAffirmedSignals,
  findConflictedSignals,
  findNegatedSignals,
} from "../../src/eval/signalMatching";

describe("eval signal matching", () => {
  it("treats 'not a <signal>' identity denials as negated instead of affirmed", () => {
    const text = "You are not a robotics engineer.";

    expect(findAffirmedSignals(["robotics engineer"], text)).toEqual([]);
    expect(findNegatedSignals(["robotics engineer"], text)).toEqual([
      "robotics engineer",
    ]);
  });

  it("treats article-based contractions as negated identity signals", () => {
    const text = "You aren't a robotics engineer anymore.";

    expect(findAffirmedSignals(["robotics engineer"], text)).toEqual([]);
    expect(findNegatedSignals(["robotics engineer"], text)).toEqual([
      "robotics engineer",
    ]);
  });

  it("treats contraction-based lifecycle denials as negated identity signals", () => {
    const text = "You're no longer a robotics engineer.";

    expect(findAffirmedSignals(["robotics engineer"], text)).toEqual([]);
    expect(findNegatedSignals(["robotics engineer"], text)).toEqual([
      "robotics engineer",
    ]);
  });

  it("treats 'is now outdated' stale-reference phrasing as negated", () => {
    const text = "docs/runbook-v1.md is now outdated.";

    expect(findAffirmedSignals(["docs/runbook-v1.md"], text)).toEqual([]);
    expect(findNegatedSignals(["docs/runbook-v1.md"], text)).toEqual([
      "docs/runbook-v1.md",
    ]);
  });

  it("does not negate the current reference just because a following bullet names a superseded reference", () => {
    const text = [
      "Current source of truth: docs/migration-rollout-runbook-v2.md",
      "Superseded reference: docs/migration-rollout-runbook-v1.md is no longer the source of truth.",
    ].join("\n");

    expect(
      findAffirmedSignals(["docs/migration-rollout-runbook-v2.md"], text),
    ).toEqual(["docs/migration-rollout-runbook-v2.md"]);
    expect(
      findNegatedSignals(["docs/migration-rollout-runbook-v2.md"], text),
    ).toEqual([]);
    expect(
      findConflictedSignals(["docs/migration-rollout-runbook-v2.md"], text),
    ).toEqual([]);
  });

  it("treats Chinese '不再以 ... 为准' stale-reference phrasing as negated", () => {
    const text =
      "现在以 docs/migration-rollout-runbook-v2.md 为准，不再以 docs/migration-rollout-runbook-v1.md 为准。";

    expect(
      findAffirmedSignals(["docs/migration-rollout-runbook-v1.md"], text),
    ).toEqual([]);
    expect(
      findNegatedSignals(["docs/migration-rollout-runbook-v1.md"], text),
    ).toEqual(["docs/migration-rollout-runbook-v1.md"]);
  });

  it("treats Chinese '不再作为当前依据' stale-reference phrasing as negated", () => {
    const text =
      "docs/migration-rollout-runbook-v1.md 不再作为当前依据，请改用 docs/migration-rollout-runbook-v2.md。";

    expect(
      findAffirmedSignals(["docs/migration-rollout-runbook-v1.md"], text),
    ).toEqual([]);
    expect(
      findNegatedSignals(["docs/migration-rollout-runbook-v1.md"], text),
    ).toEqual(["docs/migration-rollout-runbook-v1.md"]);
  });
});
