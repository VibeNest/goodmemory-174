import type { MemoryScope } from "../domain/scope";
import type { HostBehavioralTrace } from "./behavioralTrace";
import type { HostAdapter } from "./contracts";

export const GOODMEMORY_HOST_EVAL_SUPPORT = Symbol.for("goodmemory.host.eval.support");

export interface HostEvalSupport {
  recordBehavioralTrace?: (input: {
    scope: MemoryScope;
    trace: HostBehavioralTrace;
  }) => Promise<{ recorded: boolean }>;
}

type EvalAwareHostAdapter = HostAdapter & {
  [GOODMEMORY_HOST_EVAL_SUPPORT]?: HostEvalSupport;
};

export function attachHostEvalSupport(
  adapter: HostAdapter,
  support: HostEvalSupport,
): HostAdapter {
  (adapter as EvalAwareHostAdapter)[GOODMEMORY_HOST_EVAL_SUPPORT] = support;
  return adapter;
}

export function readHostEvalSupport(
  adapter: HostAdapter,
): HostEvalSupport | undefined {
  return (adapter as EvalAwareHostAdapter)[GOODMEMORY_HOST_EVAL_SUPPORT];
}
