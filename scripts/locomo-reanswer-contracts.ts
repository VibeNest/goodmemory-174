export const LOCOMO_REANSWER_JOB_BUCKETS = [
  "answerImprovements",
  "answerRegressions",
  "answerTokenF1NearMiss",
  "noisyFullRecallWrong",
  "residualLiveAnswerChanges",
  "topUnconvertedRetrievalGains",
] as const;

export type LocomoReanswerJobBucket =
  (typeof LOCOMO_REANSWER_JOB_BUCKETS)[number];

export const LOCOMO_REANSWER_JOB_BUCKET_SET: ReadonlySet<string> = new Set(
  LOCOMO_REANSWER_JOB_BUCKETS,
);
