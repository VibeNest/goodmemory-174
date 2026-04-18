import type {
  EvalPublicSurfaceDecision,
  EvalSuiteSummary,
} from "./contracts";

function hasCleanAcceptedPromotion(summary: EvalSuiteSummary): boolean {
  return (
    summary.promotionGate?.decision === "accepted" &&
    summary.promotionGate.outcome === "passed" &&
    (summary.regressionDashboardSummary?.totalBlockingCases ?? 0) === 0 &&
    (summary.regressionDashboardSummary?.executionFailureCount ??
      summary.executionFailures ??
      0) === 0
  );
}

export function evaluatePublicSurfaceDecision(
  summary: EvalSuiteSummary,
): EvalPublicSurfaceDecision {
  const rolloutReadyForBroaderExposure = hasCleanAcceptedPromotion(summary);
  const totalRegressionCases =
    summary.regressionDashboardSummary?.totalRegressionCases ??
    summary.regressionDashboardSummary?.totalBlockingCases ??
    0;
  const executionFailureCount =
    summary.regressionDashboardSummary?.executionFailureCount ??
    summary.executionFailures ??
    0;

  return {
    officialCliShape: {
      evalSubcommandsNested: true,
      memoryCommandsAtRoot: true,
      publicEvolutionNamespace: false,
    },
    surfaces: [
      {
        surface: "core_config",
        exposure: "public",
        decision: "accepted",
        rationale:
          "GoodMemory core stays public through the minimal library config: storage, policy, language, adapters, and testing hooks.",
      },
      {
        surface: "eval_artifact_cli",
        exposure: "public",
        decision: "accepted",
        rationale:
          "Read-only eval inspection is supported because report, shadow, promotion-gate, and regression-dashboard artifacts are now deterministic and inspectable.",
      },
      {
        surface: "official_memory_cli",
        exposure: rolloutReadyForBroaderExposure ? "public" : "advanced",
        decision: rolloutReadyForBroaderExposure ? "accepted" : "delayed",
        rationale: rolloutReadyForBroaderExposure
          ? "The official CLI shape is now memory-facing commands at the root with eval nested underneath, and release-facing rollout evidence keeps that surface aligned."
          : "The official CLI shape is memory-facing commands at the root with eval nested underneath, but current rollout evidence only proves the eval artifact inspector path.",
      },
      {
        surface: "strategy_rollout_config",
        exposure: "internal",
        decision: "delayed",
        rationale: rolloutReadyForBroaderExposure
          ? "Strategy rollout controls remain internal even after a clean gate because release/operator guidance and public CLI convergence are not finished yet."
          : "Strategy rollout controls stay internal because rollout evidence is not yet strong enough to justify public config exposure.",
      },
      {
        surface: "promotion_gate_runtime",
        exposure: "internal",
        decision: "delayed",
        rationale:
          "Promotion gate runtime controls are evidence and governance machinery, not public application config.",
      },
      {
        surface: "evolution_namespace",
        exposure: "internal",
        decision: "delayed",
        rationale: rolloutReadyForBroaderExposure
          ? "A public evolution namespace is still premature; successful rollout evidence does not by itself justify exposing proposal and promotion internals."
          : "A public evolution namespace is not warranted while rollout evidence is incomplete or still blocking.",
      },
    ],
    evidence: {
      totalRegressionCases,
      executionFailureCount,
      promotionGateDecision: summary.promotionGate?.decision,
      promotionGateOutcome: summary.promotionGate?.outcome,
    },
  };
}
