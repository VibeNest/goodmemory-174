import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import type { ImplicitBehaviorFixture } from "../../src/eval/implicit-behavior";
import {
  extractFirstAction,
  listImplicitBehaviorFixtures,
  runImplicitBehaviorEvaluation,
  scoreImplicitBehaviorCase,
} from "../../src/eval/implicit-behavior";

function buildProceduralFixture(): ImplicitBehaviorFixture {
  return {
    case_id: "procedural-reversed-copy",
    paradigm: "procedural",
    task_name: "Reversed copy_file parameter order",
    learning_phase: [
      {
        role: "user",
        content: "How does copy_file work in this environment?",
      },
      {
        role: "assistant",
        content: "Use destination path first, then source path.",
      },
    ],
    interference_phase: [
      {
        role: "user",
        content: "How do I view a log?",
      },
      {
        role: "assistant",
        content: "Use tail -f app.log.",
      },
    ],
    test_probe: {
      role: "user",
      content: "Copy /data/report.txt into /backup/report.txt.",
    },
    expected_first_action: "copy_file('/backup/report.txt', '/data/report.txt')",
    forbidden_first_action: "copy_file('/data/report.txt', '/backup/report.txt')",
    feedback_signal:
      "When using copy_file, answer with destination path first and source path second.",
    scoring_mode: "exact_action",
  };
}

function buildConditioningFixture(): ImplicitBehaviorFixture {
  return {
    ...buildProceduralFixture(),
    case_id: "conditioning-api-aversion",
    paradigm: "conditioning" as const,
    expected_first_action: "QuickCheck",
    forbidden_first_action: "DeepAnalyzer",
    feedback_signal:
      "When detailed analysis previously caused DeepAnalyzer timeouts, avoid DeepAnalyzer on the first action and use QuickCheck or warn before proceeding.",
    learning_phase: [
      {
        role: "user",
        content: "I need a detailed analysis of our server performance.",
      },
      {
        role: "assistant",
        content: "Running detailed analysis with DeepAnalyzer...",
      },
      {
        role: "system",
        content: "Error: Timeout Error. DeepAnalyzer failed due to computational complexity.",
      },
      {
        role: "user",
        content: "Can you check system health?",
      },
      {
        role: "assistant",
        content: "Using QuickCheck completed successfully.",
      },
    ],
    scoring_mode: "avoid_forbidden" as const,
  };
}

function buildPrimingFixture(): ImplicitBehaviorFixture {
  return {
    ...buildProceduralFixture(),
    case_id: "priming-volcanic-naming",
    paradigm: "priming" as const,
    task_name: "Volcanic theme creative naming",
    learning_phase: [
      {
        role: "user",
        content: "Please read this theme and write an evocative paragraph.",
      },
      {
        role: "assistant",
        content:
          "A swollen cone holds its breath beneath gray light. Pressure climbs in the dark until ash, pumice, and molten glow spill into black rivers. After the surge, cooled fields slowly become fertile ground.",
      },
    ],
    interference_phase: [
      {
        role: "user",
        content: "Draft a neutral note on color management for print workflows.",
      },
      {
        role: "assistant",
        content: "Calibrate displays at 6500 K and validate proof-to-press color tolerances.",
      },
    ],
    test_probe: {
      role: "user",
      content: "Propose three codenames for a next-generation data compression library.",
    },
    expected_first_action: "volcanic thematic influence",
    forbidden_first_action: "literal reuse of the priming paragraph",
    feedback_signal:
      "Creative naming may carry subtle volcanic imagery without quoting the prompt.",
    priming_keywords: ["ember", "pressure", "magma", "eruption"],
    scoring_mode: "priming_delta" as const,
  };
}

describe("implicit behavioral eval", () => {
  it("loads valid fixtures and rejects incomplete cases", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-implicit-"));
    await writeFile(
      join(root, "valid.json"),
      `${JSON.stringify(buildProceduralFixture(), null, 2)}\n`,
    );
    await expect(listImplicitBehaviorFixtures(root)).resolves.toHaveLength(1);

    await writeFile(
      join(root, "invalid.json"),
      `${JSON.stringify({ ...buildProceduralFixture(), expected_first_action: "" })}\n`,
    );
    await expect(listImplicitBehaviorFixtures(root)).rejects.toThrow(
      "expected_first_action",
    );
  });

  it("scores only the first actionable line, not later self-corrections", () => {
    const fixture = buildProceduralFixture();
    const answer = [
      "copy_file('/data/report.txt', '/backup/report.txt')",
      "Actually, copy_file('/backup/report.txt', '/data/report.txt')",
    ].join("\n");

    expect(extractFirstAction(answer)).toBe(
      "copy_file('/data/report.txt', '/backup/report.txt')",
    );
    expect(scoreImplicitBehaviorCase(fixture, answer)).toMatchObject({
      passed: false,
      reason: "first_action_matched_forbidden",
    });
  });

  it("preserves negation context when extracting a first action line", () => {
    const answer = "Do not use copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')";

    expect(extractFirstAction(answer)).toBe(answer);
  });

  it("accepts exact procedural first actions and rejects reversed order", () => {
    const fixture = buildProceduralFixture();

    expect(
      scoreImplicitBehaviorCase(
        fixture,
        "copy_file('/backup/report.txt', '/data/report.txt')",
      ),
    ).toMatchObject({
      passed: true,
      reason: "expected_first_action_matched",
    });
    expect(
      scoreImplicitBehaviorCase(
        fixture,
        "copy_file('/data/report.txt', '/backup/report.txt')",
      ),
    ).toMatchObject({
      passed: false,
      reason: "first_action_matched_forbidden",
    });
    expect(
      scoreImplicitBehaviorCase(
        {
          ...fixture,
          expected_first_action:
            "copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')",
          forbidden_first_action:
            "copy_file('/data/reports/report.txt', '/var/backup/reports/report.txt')",
        },
        "Do not use copy_file('/var/backup/reports/report.txt', '/data/reports/report.txt')",
      ),
    ).toMatchObject({
      passed: false,
      reason: "expected_first_action_missing",
    });
  });

  it("scores conditioning as first-action avoidance instead of explicit recall", () => {
    const fixture = buildConditioningFixture();

    expect(scoreImplicitBehaviorCase(fixture, "DeepAnalyzer --detailed")).toMatchObject({
      passed: false,
      reason: "first_action_matched_forbidden",
    });
    expect(scoreImplicitBehaviorCase(fixture, "QuickCheck --network")).toMatchObject({
      passed: true,
      reason: "safe_first_action_matched",
    });
    expect(
      scoreImplicitBehaviorCase(
        fixture,
        "Warning: DeepAnalyzer timed out before; use a safer quick check first.",
      ),
    ).toMatchObject({
      passed: true,
      reason: "conditioned_warning_first_action",
    });
    expect(
      scoreImplicitBehaviorCase(
        fixture,
        "Warning: inspect the request before proceeding.",
      ),
    ).toMatchObject({
      passed: false,
      reason: "avoidance_first_action_missing",
    });
    expect(
      scoreImplicitBehaviorCase(
        fixture,
        "Do not proceed until approval arrives.",
      ),
    ).toMatchObject({
      passed: false,
      reason: "avoidance_first_action_missing",
    });
    expect(
      scoreImplicitBehaviorCase(
        fixture,
        "Do not use QuickCheck first.",
      ),
    ).toMatchObject({
      passed: false,
      reason: "avoidance_first_action_missing",
    });
    expect(
      scoreImplicitBehaviorCase(
        fixture,
        "Instead of DeepAnalyzer, use QuickCheck.",
      ),
    ).toMatchObject({
      passed: true,
      reason: "safe_first_action_matched",
    });
    expect(
      scoreImplicitBehaviorCase(
        fixture,
        "Rather than DeepAnalyzer, use QuickCheck first.",
      ),
    ).toMatchObject({
      passed: true,
      reason: "safe_first_action_matched",
    });
  });

  it("keeps priming as non-blocking report-only scoring", () => {
    const fixture = buildPrimingFixture();

    const result = scoreImplicitBehaviorCase(
      fixture,
      "EmberVault\nPressureFold\nMagmaThread",
    );
    expect(result.blocking).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.primingInfluenceScore).toBeGreaterThan(0);
  });

  it("rejects priming answers that directly reuse the learned paragraph", () => {
    const fixture = buildPrimingFixture();

    const result = scoreImplicitBehaviorCase(
      fixture,
      [
        "A swollen cone holds its breath beneath gray light. Pressure climbs in the dark until ash, pumice, and molten glow spill into black rivers. After the surge, cooled fields slowly become fertile ground.",
        "EmberVault",
        "PressureFold",
        "BasaltThread",
      ].join("\n"),
    );

    expect(result.blocking).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.primingInfluenceScore).toBe(0);
    expect(result.reason).toBe("priming_forbidden_reuse_detected");
  });

  it("reports fixture-derived references instead of synthetic baseline answers", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-implicit-run-"));
    const fixture = buildProceduralFixture();
    await writeFile(
      join(root, "cases.json"),
      `${JSON.stringify([fixture], null, 2)}\n`,
    );

    const report = await runImplicitBehaviorEvaluation({
      answerGenerator: async () => fixture.expected_first_action,
      fixtureDir: root,
      generatedBy: "tests",
      mode: "fallback",
      outputDir: join(root, "reports"),
      runId: "run-test",
    });

    const result = report.profiles["raw-experience"].cases[0];
    expect(result?.fixtureReferenceAnswer).toBe(fixture.forbidden_first_action);
    expect(result).not.toHaveProperty("baselineAnswer");
  });

  it("counts execution failures per case without aborting the full report", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodmemory-implicit-failures-"));
    const proceduralFixture = buildProceduralFixture();
    const conditioningFixture = buildConditioningFixture();
    await writeFile(
      join(root, "cases.json"),
      `${JSON.stringify([proceduralFixture, conditioningFixture], null, 2)}\n`,
    );

    const report = await runImplicitBehaviorEvaluation({
      answerGenerator: async ({ case: fixture }) => {
        if (fixture.case_id === conditioningFixture.case_id) {
          throw new Error("conditioning generator failure");
        }

        return fixture.expected_first_action;
      },
      fixtureDir: root,
      generatedBy: "tests",
      mode: "fallback",
      outputDir: join(root, "reports"),
      runId: "run-with-failures",
    });

    expect(report.profiles["raw-experience"].executionFailures).toBe(1);
    expect(report.profiles["distilled-feedback"].executionFailures).toBe(1);
    expect(report.summary.executionFailures).toBe(2);
    expect(report.profiles["raw-experience"].cases).toHaveLength(1);
    expect(report.profiles["raw-experience"].totalCases).toBe(2);
    expect(report.profiles["raw-experience"].firstAttemptPassRate).toBe(0.5);
    expect(report.profiles["raw-experience"].failureAvoidanceRate).toBe(0);
    expect(report.summary.totalCases).toBe(4);
  });
});
