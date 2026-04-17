import type { MemoryScope } from "../domain/scope";
import type {
  LearningProposal,
  PromotionDecision,
} from "../evolution/contracts";
import type {
  MaintenanceJobName,
  MaintenanceRunReport,
} from "./runner";

export interface DreamMaintenanceGateInput {
  sessionCountSinceLastRun: number;
  minSessionCount: number;
  lastRunAt?: string;
  now: string;
  minHoursBetweenRuns: number;
}

export interface DreamMaintenanceRunner {
  run(
    scope: MemoryScope,
    jobs?: MaintenanceJobName[],
  ): Promise<MaintenanceRunReport>;
}

export interface DreamMaintenanceScopeGate {
  release(scopeKey: string): void;
  tryAcquire(scopeKey: string): boolean;
}

export interface DreamProposalReviewer {
  review(input: { scope: MemoryScope }): Promise<LearningProposal[]>;
}

export interface DreamProposalGateDecision {
  decision: PromotionDecision;
}

export interface DreamProposalGate {
  process(input: {
    scope: MemoryScope;
    proposals: LearningProposal[];
  }): Promise<DreamProposalGateDecision[]>;
}

export interface DreamProceduralPatternCompiler {
  compile(scope: MemoryScope): Promise<{ compiledCount: number }>;
}

export interface DreamMaintenanceOrchestratorConfig {
  compiler: DreamProceduralPatternCompiler;
  gate?: DreamMaintenanceScopeGate;
  maintenanceRunner: DreamMaintenanceRunner;
  proposalGate: DreamProposalGate;
  reviewer: DreamProposalReviewer;
}

export interface DreamMaintenanceRunInput extends DreamMaintenanceGateInput {
  maintenanceJobs?: MaintenanceJobName[];
  scope: MemoryScope;
  scopeKey: string;
}

export interface DreamMaintenanceRunSummary {
  compiledCount: number;
  maintenance: MaintenanceRunReport | null;
  promotionDecisionCounts: Partial<Record<PromotionDecision, number>>;
  proposalCount: number;
  ran: boolean;
  reason: "completed" | "cooldown" | "scope_busy" | "threshold";
}

const HOUR_IN_MS = 1000 * 60 * 60;

function hoursSince(lastRunAt: string, now: string): number | null {
  const lastRunMs = new Date(lastRunAt).getTime();
  const nowMs = new Date(now).getTime();

  if (!Number.isFinite(lastRunMs) || !Number.isFinite(nowMs)) {
    return null;
  }

  const elapsedMs = nowMs - lastRunMs;
  if (elapsedMs < 0) {
    return 0;
  }

  return elapsedMs / HOUR_IN_MS;
}

export function shouldRunDreamMaintenance(
  input: DreamMaintenanceGateInput,
): boolean {
  if (input.sessionCountSinceLastRun < input.minSessionCount) {
    return false;
  }

  if (!input.lastRunAt) {
    return true;
  }

  const elapsedHours = hoursSince(input.lastRunAt, input.now);
  return elapsedHours !== null && elapsedHours >= input.minHoursBetweenRuns;
}

export function createDreamMaintenanceGate(
  activeScopes: Set<string> = new Set<string>(),
): DreamMaintenanceScopeGate {
  return {
    tryAcquire(scopeKey: string): boolean {
      if (activeScopes.has(scopeKey)) {
        return false;
      }

      activeScopes.add(scopeKey);
      return true;
    },

    release(scopeKey: string): void {
      activeScopes.delete(scopeKey);
    },
  };
}

function incrementDecisionCount(
  counts: Partial<Record<PromotionDecision, number>>,
  decision: PromotionDecision,
): void {
  counts[decision] = (counts[decision] ?? 0) + 1;
}

export function createDreamMaintenanceOrchestrator(
  config: DreamMaintenanceOrchestratorConfig,
) {
  const gate = config.gate ?? createDreamMaintenanceGate();

  return {
    async run(input: DreamMaintenanceRunInput): Promise<DreamMaintenanceRunSummary> {
      if (input.sessionCountSinceLastRun < input.minSessionCount) {
        return {
          ran: false,
          reason: "threshold",
          maintenance: null,
          proposalCount: 0,
          promotionDecisionCounts: {},
          compiledCount: 0,
        };
      }

      if (
        input.lastRunAt &&
        !shouldRunDreamMaintenance(input)
      ) {
        return {
          ran: false,
          reason: "cooldown",
          maintenance: null,
          proposalCount: 0,
          promotionDecisionCounts: {},
          compiledCount: 0,
        };
      }

      if (!gate.tryAcquire(input.scopeKey)) {
        return {
          ran: false,
          reason: "scope_busy",
          maintenance: null,
          proposalCount: 0,
          promotionDecisionCounts: {},
          compiledCount: 0,
        };
      }

      try {
        const maintenance = await config.maintenanceRunner.run(
          input.scope,
          input.maintenanceJobs,
        );
        const proposals = await config.reviewer.review({
          scope: input.scope,
        });
        const decisions =
          proposals.length > 0
            ? await config.proposalGate.process({
                scope: input.scope,
                proposals,
              })
            : [];
        const promotionDecisionCounts: Partial<Record<PromotionDecision, number>> = {};
        for (const decision of decisions) {
          incrementDecisionCount(promotionDecisionCounts, decision.decision);
        }
        const compiled = await config.compiler.compile(input.scope);

        return {
          ran: true,
          reason: "completed",
          maintenance,
          proposalCount: proposals.length,
          promotionDecisionCounts,
          compiledCount: compiled.compiledCount,
        };
      } finally {
        gate.release(input.scopeKey);
      }
    },
  };
}
