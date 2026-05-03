import {
  executeRawTaskHypothesis,
  renderRawTaskHypothesisSketch,
  type RawTaskHypothesis,
} from "./rawTaskHypothesis";

export interface RawTransientExecutionResult {
  computedResponse?: string;
  hypothesisSketch?: string;
  lines: string[];
  mode: "computed" | "hint" | "none";
}

export function executeProbeConditionedRawCarryover(input: {
  hypothesis: RawTaskHypothesis | undefined;
  query: string;
}): RawTransientExecutionResult {
  const execution = executeRawTaskHypothesis({
    hypothesis: input.hypothesis,
    query: input.query,
  });

  return {
    ...execution,
    hypothesisSketch: renderRawTaskHypothesisSketch({
      execution,
      hypothesis: input.hypothesis,
    }),
  };
}
