import {
  requestOpenAICompatibleTextResult,
  stripThinkingBlocks,
  withAISDKRetries,
} from "../provider/ai-sdk-runtime";
import type {
  AISDKModelConfig,
  FetchLike,
} from "../provider/ai-sdk-runtime";
import {
  normalizeAISDKLanguageModelUsage,
  runWithModelUsageAttempt,
} from "../provider/model-usage";
import {
  LOCOMO_OFFICIAL_QA_SCORER_V1,
  LOCOMO_QA_CATEGORIES,
  scoreLocomoOfficialQaV1,
} from "./locomo";
import type { LocomoQaCategory } from "./locomo";
import {
  buildLongMemEvalOfficialJudgePrompt,
  isLongMemEvalOfficialAbstentionCase,
  LONGMEMEVAL_OFFICIAL_SCORER_IDENTITY,
  parseLongMemEvalOfficialJudgeVerdict,
} from "./longmemevalOfficialScorer";
import { createAttributedModelUsageSink } from "./modelUsage";
import type { AttributedModelUsageAttempt } from "./modelUsage";
import type {
  Phase74AnswerAssessment,
  Phase74GeneralizationCase,
} from "./phase74Generalization";
import type { Phase74BenchmarkFamily } from "./phase74Datasets";
import type { EvalRunJsonObject } from "./runIdentity";

export type Phase74OfficialAnswerAssessor = (input: {
  answer: string;
  purpose: string;
  testCase: Phase74GeneralizationCase;
}) => Promise<Phase74AnswerAssessment>;

export function buildPhase74OfficialScoringIdentity(
  benchmark: Phase74BenchmarkFamily,
): EvalRunJsonObject {
  return benchmark === "longmemeval"
    ? {
        binaryCorrectRule: "official-yes-no",
        primaryMetric: "accuracy",
        scorer: LONGMEMEVAL_OFFICIAL_SCORER_IDENTITY.metric,
        scorerCommit: LONGMEMEVAL_OFFICIAL_SCORER_IDENTITY.commit,
        scorerFileSha256: LONGMEMEVAL_OFFICIAL_SCORER_IDENTITY.fileSha256,
      }
    : {
        binaryCorrectRule: "official-score-equals-one",
        primaryMetric: "macro-mean-category-aware-f1",
        scorer: LOCOMO_OFFICIAL_QA_SCORER_V1,
      };
}

function locomoCategory(testCase: Phase74GeneralizationCase): LocomoQaCategory {
  const category = testCase.protocolMetadata?.category;
  if (
    typeof category !== "string" ||
    !LOCOMO_QA_CATEGORIES.includes(category as LocomoQaCategory)
  ) {
    throw new Error(
      `Phase 74 LoCoMo case ${testCase.caseId} has no valid official category.`,
    );
  }
  return category as LocomoQaCategory;
}

function longMemEvalQuestionType(testCase: Phase74GeneralizationCase): string {
  const questionType = testCase.protocolMetadata?.questionType;
  if (typeof questionType !== "string" || questionType.length === 0) {
    throw new Error(
      `Phase 74 LongMemEval case ${testCase.caseId} has no question type.`,
    );
  }
  return questionType;
}

export function createPhase74OfficialAnswerAssessor(input: {
  benchmark: Phase74BenchmarkFamily;
  events: AttributedModelUsageAttempt[];
  fetch?: FetchLike;
  model: AISDKModelConfig;
  onUsageEvent?: (event: AttributedModelUsageAttempt) => void;
}): Phase74OfficialAnswerAssessor {
  if (input.benchmark === "locomo") {
    return async ({ answer, testCase }) => {
      const score = scoreLocomoOfficialQaV1({
        answer,
        category: locomoCategory(testCase),
        goldAnswer: testCase.expectedAnswer,
      }).score;
      return { correct: score === 1, score };
    };
  }

  return async ({ answer, testCase }) => {
    const sink = createAttributedModelUsageSink({
      branch: "judge",
      caseId: testCase.caseId,
      events: input.events,
      onEvent: input.onUsageEvent,
    });
    const prompt = buildLongMemEvalOfficialJudgePrompt({
      abstention: isLongMemEvalOfficialAbstentionCase(testCase.caseId),
      candidateAnswer: answer,
      expectedAnswer: testCase.expectedAnswer,
      question: testCase.question,
      questionType: longMemEvalQuestionType(testCase),
    });
    let attempt = 0;
    const correct = await withAISDKRetries(async () => {
      attempt += 1;
      return runWithModelUsageAttempt({
        attempt,
        modelId: input.model.model,
        operation: "judge",
        providerId: input.model.provider,
        sink,
        run: async (report) => {
          const result = await requestOpenAICompatibleTextResult({
            fetch: input.fetch,
            maxOutputTokens: 10,
            model: input.model,
            prompt,
            temperature: 0,
          });
          report(result.usage ?? normalizeAISDKLanguageModelUsage(undefined));
          const verdict = stripThinkingBlocks(result.text);
          if (verdict === "") {
            throw new Error("Phase 74 official LongMemEval judge returned empty output.");
          }
          return parseLongMemEvalOfficialJudgeVerdict(verdict);
        },
      });
    }, { retryLimit: 3 });
    return { correct, score: Number(correct) };
  };
}
