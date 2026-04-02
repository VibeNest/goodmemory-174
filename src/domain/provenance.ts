export type MemorySourceMethod =
  | "explicit"
  | "inferred"
  | "import"
  | "confirmed";

export interface MemorySource {
  method: MemorySourceMethod;
  extractedAt: string;
  sessionId?: string;
}

export type MemoryLifecycleState = "active" | "superseded" | "inactive";

export function createMemorySource(source: MemorySource): MemorySource {
  return { ...source };
}

const ALLOWED_LIFECYCLE_TRANSITIONS: Record<
  MemoryLifecycleState,
  MemoryLifecycleState[]
> = {
  active: ["active", "superseded", "inactive"],
  superseded: ["superseded", "inactive"],
  inactive: ["inactive", "active"],
};

export function transitionLifecycle(
  current: MemoryLifecycleState,
  next: MemoryLifecycleState,
): MemoryLifecycleState {
  if (!ALLOWED_LIFECYCLE_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid lifecycle transition: ${current} -> ${next}`);
  }

  return next;
}
