export const LONGMEMEVAL_OFFICIAL_SCORER_IDENTITY = {
  commit: "9e0b455f4ef0e2ab8f2e582289761153549043fc",
  fileSha256:
    "ecce9c4c79dc89d99534ac17b383a5cbb5b9f0c69ee98adaf0684742e3d95251",
  metric: "longmemeval-official-qa-accuracy-v1",
  path: "src/evaluation/evaluate_qa.py",
  repository: "https://github.com/xiaowu0162/LongMemEval",
} as const;

export const LONGMEMEVAL_OFFICIAL_METRIC_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "llama-3.1-70b-instruct",
] as const;

const DEFAULT_TEMPLATE =
  "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. \n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const TEMPORAL_TEMPLATE =
  "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response is equivalent to the correct answer or contains all the intermediate steps to get the correct answer, you should also answer yes. If the response only contains a subset of the information required by the answer, answer no. In addition, do not penalize off-by-one errors for the number of days. If the question asks for the number of days/weeks/months, etc., and the model makes off-by-one errors (e.g., predicting 19 days when the answer is 18), the model's response is still correct. \n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const KNOWLEDGE_UPDATE_TEMPLATE =
  "I will give you a question, a correct answer, and a response from a model. Please answer yes if the response contains the correct answer. Otherwise, answer no. If the response contains some previous information along with an updated answer, the response should be considered as correct as long as the updated answer is the required answer.\n\nQuestion: {q}\n\nCorrect Answer: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const PREFERENCE_TEMPLATE =
  "I will give you a question, a rubric for desired personalized response, and a response from a model. Please answer yes if the response satisfies the desired response. Otherwise, answer no. The model does not need to reflect all the points in the rubric. The response is correct as long as it recalls and utilizes the user's personal information correctly.\n\nQuestion: {q}\n\nRubric: {a}\n\nModel Response: {r}\n\nIs the model response correct? Answer yes or no only.";
const ABSTENTION_TEMPLATE =
  "I will give you an unanswerable question, an explanation, and a response from a model. Please answer yes if the model correctly identifies the question as unanswerable. The model could say that the information is incomplete, or some other information is given but the asked information is not.\n\nQuestion: {q}\n\nExplanation: {a}\n\nModel Response: {r}\n\nDoes the model correctly identify the question as unanswerable? Answer yes or no only.";

const DEFAULT_QUESTION_TYPES = new Set([
  "multi-session",
  "single-session-assistant",
  "single-session-user",
]);

function fillTemplate(input: {
  candidateAnswer: string;
  expectedAnswer: string;
  question: string;
  template: string;
}): string {
  const fields = {
    a: input.expectedAnswer,
    q: input.question,
    r: input.candidateAnswer,
  };
  return input.template.replace(
    /\{([aqr])\}/gu,
    (_, field: keyof typeof fields) => fields[field],
  );
}

export function isLongMemEvalOfficialAbstentionCase(caseId: string): boolean {
  return caseId.includes("_abs");
}

export function buildLongMemEvalOfficialJudgePrompt(input: {
  abstention?: boolean;
  candidateAnswer: string;
  expectedAnswer: string;
  question: string;
  questionType: string;
}): string {
  let template: string;
  if (input.abstention) {
    template = ABSTENTION_TEMPLATE;
  } else if (DEFAULT_QUESTION_TYPES.has(input.questionType)) {
    template = DEFAULT_TEMPLATE;
  } else if (input.questionType === "temporal-reasoning") {
    template = TEMPORAL_TEMPLATE;
  } else if (input.questionType === "knowledge-update") {
    template = KNOWLEDGE_UPDATE_TEMPLATE;
  } else if (input.questionType === "single-session-preference") {
    template = PREFERENCE_TEMPLATE;
  } else {
    throw new Error(
      `Unsupported LongMemEval question type: ${input.questionType}.`,
    );
  }
  return fillTemplate({ ...input, template });
}

export function parseLongMemEvalOfficialJudgeVerdict(raw: string): boolean {
  return raw.toLowerCase().includes("yes");
}
