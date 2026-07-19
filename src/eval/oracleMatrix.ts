export const ORACLE_MATRIX_ARMS = [
  "no-memory",
  "oracle-raw",
  "oracle-memory",
  "retrieved-gold-only",
  "retrieved-full",
  "retrieved-full+protocol-reader",
] as const;

export type OracleMatrixArm = (typeof ORACLE_MATRIX_ARMS)[number];

export interface OracleMatrixContextItem {
  content: string;
  id: string;
  sourceIds: readonly string[];
}

export interface OracleMatrixCase {
  caseId: string;
  expectedAnswer: string;
  goldEvidenceIds: readonly string[];
  protocolMetadata?: Readonly<Record<string, unknown>>;
  question: string;
  rawEvidence: readonly OracleMatrixContextItem[];
  retrievedMemories: readonly OracleMatrixContextItem[];
  storedMemories: readonly OracleMatrixContextItem[];
}

export interface OracleMatrixReaderInput {
  context: string;
  question: string;
}

export interface OracleMatrixProtocolReaderInput extends OracleMatrixReaderInput {
  protocolMetadata?: Readonly<Record<string, unknown>>;
}

export interface OracleMatrixJudgeInput {
  answer: string;
  expectedAnswer: string;
  question: string;
}

export interface OracleMatrixJudgment {
  correct: boolean;
}

export type OracleMatrixReader = (
  input: OracleMatrixReaderInput,
) => Promise<string>;

export type OracleMatrixProtocolReader = (
  input: OracleMatrixProtocolReaderInput,
) => Promise<string>;

export type OracleMatrixJudge = (
  input: OracleMatrixJudgeInput,
) => Promise<OracleMatrixJudgment>;

export interface OracleMatrixCaseResult {
  answer: string | null;
  arm: OracleMatrixArm;
  contextChars: number;
  contextItemIds: string[];
  correct: boolean;
  executionError?: string;
}

export interface OracleMatrixCoverage {
  goldEvidenceCount: number;
  retrievedEvidenceRecall: number;
  retrievedGoldEvidenceCount: number;
  retrievalRecallGivenStorage: number | null;
  storageCoverage: number;
  storedGoldEvidenceCount: number;
}

export interface OracleMatrixModelIdentity {
  gateway: string;
  model: string;
  provider: string;
}

export interface OracleMatrixReaderIdentity extends OracleMatrixModelIdentity {
  maxOutputTokens: number;
  promptSha256: string;
  temperature: number;
}

export interface OracleMatrixJudgeIdentity extends OracleMatrixModelIdentity {
  promptSha256: string;
}

export interface OracleMatrixRunIdentityInput {
  benchmark: string;
  concurrency: number;
  contextTokenBudget: number;
  datasetSha256: string;
  generatedBy: string;
  genericReader: OracleMatrixReaderIdentity;
  judge: OracleMatrixJudgeIdentity;
  protocolReaderPromptSha256: string;
  retrievalConfigSha256: string;
  seed: number;
  selectedCaseIdsSha256: string;
  timeoutMs: number;
}

export interface OracleMatrixRunIdentity extends OracleMatrixRunIdentityInput {
  arms: typeof ORACLE_MATRIX_ARMS;
  schemaVersion: 1;
}

function uniqueContextItems(
  items: readonly OracleMatrixContextItem[],
): OracleMatrixContextItem[] {
  const seen = new Set<string>();
  const unique: OracleMatrixContextItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

function itemSupportsGold(
  item: OracleMatrixContextItem,
  goldEvidenceIds: ReadonlySet<string>,
): boolean {
  return item.sourceIds.some((sourceId) => goldEvidenceIds.has(sourceId));
}

export function selectOracleMatrixContextItems(input: {
  arm: OracleMatrixArm;
  testCase: OracleMatrixCase;
}): OracleMatrixContextItem[] {
  const goldEvidenceIds = new Set(input.testCase.goldEvidenceIds);
  switch (input.arm) {
    case "no-memory":
      return [];
    case "oracle-raw":
      return uniqueContextItems(
        input.testCase.rawEvidence.filter((item) =>
          itemSupportsGold(item, goldEvidenceIds)
        ),
      );
    case "oracle-memory":
      return uniqueContextItems(
        input.testCase.storedMemories.filter((item) =>
          itemSupportsGold(item, goldEvidenceIds)
        ),
      );
    case "retrieved-gold-only":
      return uniqueContextItems(
        input.testCase.retrievedMemories.filter((item) =>
          itemSupportsGold(item, goldEvidenceIds)
        ),
      );
    case "retrieved-full":
    case "retrieved-full+protocol-reader":
      return uniqueContextItems(input.testCase.retrievedMemories);
  }
}

export function renderOracleMatrixContext(
  items: readonly OracleMatrixContextItem[],
): string {
  return items
    .map(
      (item) =>
        `- [id=${item.id} | sources=${item.sourceIds.join(",")}] ${item.content}`,
    )
    .join("\n");
}

function collectSupportedGoldEvidenceIds(
  items: readonly OracleMatrixContextItem[],
  goldEvidenceIds: ReadonlySet<string>,
): Set<string> {
  const supported = new Set<string>();
  for (const item of items) {
    for (const sourceId of item.sourceIds) {
      if (goldEvidenceIds.has(sourceId)) {
        supported.add(sourceId);
      }
    }
  }
  return supported;
}

export function measureOracleMatrixCoverage(
  testCase: OracleMatrixCase,
): OracleMatrixCoverage {
  const goldEvidenceIds = new Set(testCase.goldEvidenceIds);
  const storedGoldEvidenceIds = collectSupportedGoldEvidenceIds(
    testCase.storedMemories,
    goldEvidenceIds,
  );
  const retrievedGoldEvidenceIds = collectSupportedGoldEvidenceIds(
    testCase.retrievedMemories,
    goldEvidenceIds,
  );
  let retrievedStoredEvidenceCount = 0;
  for (const sourceId of retrievedGoldEvidenceIds) {
    if (storedGoldEvidenceIds.has(sourceId)) {
      retrievedStoredEvidenceCount += 1;
    }
  }
  const goldEvidenceCount = goldEvidenceIds.size;

  return {
    goldEvidenceCount,
    retrievedEvidenceRecall:
      goldEvidenceCount === 0
        ? 1
        : retrievedGoldEvidenceIds.size / goldEvidenceCount,
    retrievedGoldEvidenceCount: retrievedGoldEvidenceIds.size,
    retrievalRecallGivenStorage:
      storedGoldEvidenceIds.size === 0
        ? null
        : retrievedStoredEvidenceCount / storedGoldEvidenceIds.size,
    storageCoverage:
      goldEvidenceCount === 0 ? 1 : storedGoldEvidenceIds.size / goldEvidenceCount,
    storedGoldEvidenceCount: storedGoldEvidenceIds.size,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runOracleMatrixCase(input: {
  genericReader: OracleMatrixReader;
  judge: OracleMatrixJudge;
  protocolReader: OracleMatrixProtocolReader;
  testCase: OracleMatrixCase;
}): Promise<OracleMatrixCaseResult[]> {
  const results: OracleMatrixCaseResult[] = [];
  for (const arm of ORACLE_MATRIX_ARMS) {
    const contextItems = selectOracleMatrixContextItems({
      arm,
      testCase: input.testCase,
    });
    const context = renderOracleMatrixContext(contextItems);
    const base = {
      arm,
      contextChars: context.length,
      contextItemIds: contextItems.map(({ id }) => id),
    };

    try {
      const answer = arm === "retrieved-full+protocol-reader"
        ? await input.protocolReader({
            context,
            protocolMetadata: input.testCase.protocolMetadata,
            question: input.testCase.question,
          })
        : await input.genericReader({
            context,
            question: input.testCase.question,
          });
      const judgment = await input.judge({
        answer,
        expectedAnswer: input.testCase.expectedAnswer,
        question: input.testCase.question,
      });
      results.push({
        ...base,
        answer,
        correct: judgment.correct,
      });
    } catch (error) {
      results.push({
        ...base,
        answer: null,
        correct: false,
        executionError: errorMessage(error),
      });
    }
  }
  return results;
}

export function buildOracleMatrixRunIdentity(
  input: OracleMatrixRunIdentityInput,
): OracleMatrixRunIdentity {
  return {
    ...input,
    arms: ORACLE_MATRIX_ARMS,
    genericReader: { ...input.genericReader },
    judge: { ...input.judge },
    schemaVersion: 1,
  };
}
