export interface RawCarryoverRerankerModel {
  bias: number;
  featureNames: string[];
  weights: number[];
}

export interface RawCarryoverTrainingSample {
  features: number[];
  label: 0 | 1;
}

export interface TrainRawCarryoverRerankerInput {
  baseModel: RawCarryoverRerankerModel;
  epochs?: number;
  learningRate?: number;
  samples: readonly RawCarryoverTrainingSample[];
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export function scoreRawCarryoverReranker(input: {
  features: readonly number[];
  model: RawCarryoverRerankerModel;
}): { probability: number; score: number } {
  const score =
    input.model.bias +
    input.features.reduce((total, feature, index) => {
      return total + feature * (input.model.weights[index] ?? 0);
    }, 0);

  return {
    probability: sigmoid(score),
    score,
  };
}

export function trainRawCarryoverReranker(
  input: TrainRawCarryoverRerankerInput,
): RawCarryoverRerankerModel {
  if (input.samples.length < 4) {
    return input.baseModel;
  }

  const weights = [...input.baseModel.weights];
  let bias = input.baseModel.bias;
  const learningRate = input.learningRate ?? 0.18;
  const epochs = input.epochs ?? 60;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const sample of input.samples) {
      const prediction = scoreRawCarryoverReranker({
        features: sample.features,
        model: {
          bias,
          featureNames: input.baseModel.featureNames,
          weights,
        },
      }).probability;
      const error = sample.label - prediction;
      bias += learningRate * error;

      for (let index = 0; index < weights.length; index += 1) {
        weights[index] =
          (weights[index] ?? 0) +
          learningRate * error * (sample.features[index] ?? 0);
      }
    }
  }

  return {
    bias,
    featureNames: [...input.baseModel.featureNames],
    weights,
  };
}
