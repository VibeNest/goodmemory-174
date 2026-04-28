export type ProviderBackedRecallStage = "semantic_search";

export class ProviderBackedRecallError extends Error {
  readonly stage: ProviderBackedRecallStage;

  constructor(input: {
    cause: unknown;
    stage: ProviderBackedRecallStage;
  }) {
    super(`Provider-backed recall failed during ${input.stage}.`, {
      cause: input.cause,
    });
    this.name = "ProviderBackedRecallError";
    this.stage = input.stage;
  }
}

export function isProviderBackedRecallError(
  error: unknown,
): error is ProviderBackedRecallError {
  return error instanceof ProviderBackedRecallError;
}
