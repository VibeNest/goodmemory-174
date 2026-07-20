import type {
  EvalRunJsonObject,
  EvalRunJsonValue,
} from "./runIdentity";

export const PHASE74_EXPERIMENT_ARMS = {
  E1: ["fact-only", "raw-only", "atomic-contextual-raw-pointer"],
  E2: ["claim-temporal-off", "claim-temporal-on"],
  E3: ["recall-plan-off", "recall-plan-deterministic", "recall-plan-assisted"],
  E4: ["prose", "chronology", "compact_json", "json_locale_note"],
} as const;

export type Phase74ExperimentStage = keyof typeof PHASE74_EXPERIMENT_ARMS;

const ALLOWED_CONFIGURATION_PATHS: Record<
  Phase74ExperimentStage,
  readonly string[]
> = {
  E1: ["representation"],
  E2: ["retrieval.generalizedFusionChannels"],
  E3: ["planner", "retrieval.recallPlanExecution"],
  E4: ["evidenceLedger.format"],
};

function isJsonObject(value: EvalRunJsonValue | undefined): value is EvalRunJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectChangedPaths(input: {
  baseline: EvalRunJsonValue | undefined;
  candidate: EvalRunJsonValue | undefined;
  path: string;
  paths: string[];
}): void {
  if (Object.is(input.baseline, input.candidate)) {
    return;
  }
  if (Array.isArray(input.baseline) && Array.isArray(input.candidate)) {
    if (JSON.stringify(input.baseline) !== JSON.stringify(input.candidate)) {
      input.paths.push(input.path);
    }
    return;
  }
  if (isJsonObject(input.baseline) && isJsonObject(input.candidate)) {
    const keys = [...new Set([
      ...Object.keys(input.baseline),
      ...Object.keys(input.candidate),
    ])].sort();
    for (const key of keys) {
      collectChangedPaths({
        baseline: input.baseline[key],
        candidate: input.candidate[key],
        path: input.path ? `${input.path}.${key}` : key,
        paths: input.paths,
      });
    }
    return;
  }
  input.paths.push(input.path);
}

function pathIsAllowed(path: string, allowed: readonly string[]): boolean {
  return allowed.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}.`),
  );
}

export function assertPhase74StageIsolation(input: {
  baselineConfiguration: EvalRunJsonObject;
  candidateConfiguration: EvalRunJsonObject;
  stage: Phase74ExperimentStage;
}): string[] {
  const paths: string[] = [];
  collectChangedPaths({
    baseline: input.baselineConfiguration,
    candidate: input.candidateConfiguration,
    path: "",
    paths,
  });
  const changedPaths = [...new Set(paths)].sort();
  const forbidden = changedPaths.find(
    (path) => !pathIsAllowed(path, ALLOWED_CONFIGURATION_PATHS[input.stage]),
  );
  if (forbidden) {
    throw new Error(
      `${input.stage} changed frozen configuration path ${forbidden}`,
    );
  }
  return changedPaths;
}
