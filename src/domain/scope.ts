export interface MemoryScope {
  userId: string;
  tenantId?: string;
  workspaceId?: string;
  agentId?: string;
  sessionId?: string;
}

function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeScope(scope: MemoryScope): MemoryScope {
  const userId = scope.userId.trim();

  if (userId.length === 0) {
    throw new Error("MemoryScope requires a non-empty userId");
  }

  return {
    userId,
    tenantId: normalizeOptional(scope.tenantId),
    workspaceId: normalizeOptional(scope.workspaceId),
    agentId: normalizeOptional(scope.agentId),
    sessionId: normalizeOptional(scope.sessionId),
  };
}

export function scopeToKey(scope: MemoryScope): string {
  const normalized = normalizeScope(scope);

  return [
    normalized.userId,
    normalized.tenantId ?? "",
    normalized.workspaceId ?? "",
    normalized.agentId ?? "",
    normalized.sessionId ?? "",
  ].join("::");
}

export function isSameScope(left: MemoryScope, right: MemoryScope): boolean {
  return scopeToKey(left) === scopeToKey(right);
}
