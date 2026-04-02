export interface DreamMaintenanceGateInput {
  sessionCountSinceLastRun: number;
  minSessionCount: number;
  lastRunAt?: string;
  now: string;
  minHoursBetweenRuns: number;
}

function hoursBetween(left: string, right: string): number {
  const delta = Math.abs(new Date(left).getTime() - new Date(right).getTime());
  return delta / (1000 * 60 * 60);
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

  return hoursBetween(input.now, input.lastRunAt) >= input.minHoursBetweenRuns;
}

export function createDreamMaintenanceGate() {
  const activeScopes = new Set<string>();

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
