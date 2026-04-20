import type { UserProfile } from "../domain/records";
import type { MemoryScope } from "../domain/scope";
import type {
  GoodMemoryPolicyHooks,
  PolicyContext,
} from "../policy/hooks";
import {
  passesDefaultScopeGuard,
  toPolicyMemoryRecord,
} from "../policy/hooks";
import type { RecallCandidateTrace } from "./engine";
import type { RetrievalProfile } from "./router";

export async function applyRecallPolicyToRecords<TRecord extends {
  workspaceId?: string;
  agentId?: string;
}>(
  records: TRecord[],
  memoryType:
    | "profile"
    | "preference"
    | "reference"
    | "fact"
    | "feedback"
    | "evidence"
    | "archive"
    | "episode",
  input: {
    scope: MemoryScope;
    query: string;
    retrievalProfile: RetrievalProfile;
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    policy?: Pick<GoodMemoryPolicyHooks, "shouldRecall">;
    policyApplied: Set<string>;
  },
): Promise<TRecord[]> {
  const policyContext: PolicyContext = {
    scope: input.scope,
    query: input.query,
    retrievalProfile: input.retrievalProfile,
    phase: "recall",
    locale: input.locale,
    localeSource: input.localeSource,
  };

  const visible: TRecord[] = [];

  for (const record of records) {
    if (!passesDefaultScopeGuard(input.scope, record)) {
      input.policyApplied.add("default_scope_guard");
      continue;
    }

    if (
      input.policy?.shouldRecall &&
      !(await input.policy.shouldRecall(
        toPolicyMemoryRecord(record as never, memoryType),
        policyContext,
      ))
    ) {
      input.policyApplied.add("custom_shouldRecall");
      continue;
    }

    visible.push(record);
  }

  return visible;
}

export async function applyRecallPolicyToProfile(
  profile: UserProfile | null,
  input: {
    scope: MemoryScope;
    query: string;
    retrievalProfile: RetrievalProfile;
    locale: string;
    localeSource: "explicit" | "detected" | "default";
    policy?: Pick<GoodMemoryPolicyHooks, "shouldRecall">;
    policyApplied: Set<string>;
  },
): Promise<UserProfile | null> {
  if (!profile) {
    return null;
  }

  if (!input.policy?.shouldRecall) {
    return profile;
  }

  const allowed = await input.policy.shouldRecall(
    toPolicyMemoryRecord(profile, "profile"),
    {
      scope: input.scope,
      query: input.query,
      retrievalProfile: input.retrievalProfile,
      phase: "recall",
      locale: input.locale,
      localeSource: input.localeSource,
    },
  );

  if (!allowed) {
    input.policyApplied.add("custom_shouldRecall");
    return null;
  }

  return profile;
}

export function reconcileCandidateTraces(
  traces: RecallCandidateTrace[],
  finalSelectedIds: Set<string>,
  reason: string | ((trace: RecallCandidateTrace) => string) = "policy filtered",
): RecallCandidateTrace[] {
  return traces.map((trace) => {
    if (!trace.returned) {
      return trace;
    }
    if (finalSelectedIds.has(trace.memoryId)) {
      return trace;
    }

    return {
      ...trace,
      returned: false,
      whyReturned: undefined,
      whySuppressed: typeof reason === "function" ? reason(trace) : reason,
      fallback: "none",
    };
  });
}
