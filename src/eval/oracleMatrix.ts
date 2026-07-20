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
  observedAt?: string;
  role?: string;
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
  unresolvedGoldEvidenceIds?: readonly string[];
}

export interface OracleMatrixReaderInput {
  caseId?: string;
  context: string;
  purpose?: string;
  question: string;
}

export interface OracleMatrixProtocolReaderInput extends OracleMatrixReaderInput {
  contextItems?: readonly OracleMatrixContextItem[];
  protocolMetadata?: Readonly<Record<string, unknown>>;
}

export interface OracleMatrixJudgeInput {
  answer: string;
  caseId?: string;
  expectedAnswer: string;
  purpose?: string;
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

export type RenderedTokenCounter = (content: string) => number;

export const PHASE74_CONTEXT_TOKEN_BUDGET = 6_000;

const CONTEXT_TRUNCATION_SUFFIX = " …[truncated]";

export interface OracleMatrixCaseResult {
  answer: string | null;
  arm: OracleMatrixArm;
  contextChars: number;
  contextCharsBeforeTruncation: number;
  contextItemIds: string[];
  contextTruncated: boolean;
  correct: boolean | null;
  evaluable: boolean;
  executionError?: string;
  notEvaluableReason?: string;
  renderedContextTokens: number;
  renderedContextTokensBeforeTruncation: number;
}

export interface OracleMatrixCoverage {
  evaluable: boolean;
  goldEvidenceCount: number;
  retrievedEvidenceRecall: number | null;
  retrievedGoldEvidenceCount: number;
  retrievalRecallGivenStorage: number | null;
  storageCoverage: number | null;
  storedGoldEvidenceCount: number;
  unresolvedGoldEvidenceIds: string[];
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

export interface TruncatedRenderedContext {
  content: string;
  contextCharsBeforeTruncation: number;
  contextTruncated: boolean;
  renderedContextTokens: number;
  renderedContextTokensBeforeTruncation: number;
}

export function truncateRenderedContext(input: {
  content: string;
  contextTokenBudget?: number;
  countRenderedTokens: RenderedTokenCounter;
}): TruncatedRenderedContext {
  const contextTokenBudget =
    input.contextTokenBudget ?? PHASE74_CONTEXT_TOKEN_BUDGET;
  const renderedContextTokensBeforeTruncation = input.countRenderedTokens(
    input.content,
  );
  if (renderedContextTokensBeforeTruncation <= contextTokenBudget) {
    return {
      content: input.content,
      contextCharsBeforeTruncation: input.content.length,
      contextTruncated: false,
      renderedContextTokens: renderedContextTokensBeforeTruncation,
      renderedContextTokensBeforeTruncation,
    };
  }

  const codePoints = Array.from(input.content);
  let lower = 0;
  let upper = codePoints.length;
  let content = "";
  while (lower <= upper) {
    const midpoint = Math.floor((lower + upper) / 2);
    const candidate = `${
      codePoints.slice(0, midpoint).join("")
    }${CONTEXT_TRUNCATION_SUFFIX}`;
    if (input.countRenderedTokens(candidate) <= contextTokenBudget) {
      content = candidate;
      lower = midpoint + 1;
    } else {
      upper = midpoint - 1;
    }
  }
  if (content === "" && input.countRenderedTokens("") > contextTokenBudget) {
    throw new Error(
      "The rendered-token counter reports an empty context above the context budget.",
    );
  }

  return {
    content,
    contextCharsBeforeTruncation: input.content.length,
    contextTruncated: true,
    renderedContextTokens: input.countRenderedTokens(content),
    renderedContextTokensBeforeTruncation,
  };
}

interface BudgetedOracleMatrixContext extends TruncatedRenderedContext {
  contextItems: OracleMatrixContextItem[];
}

function renderOracleMatrixContextItem(
  item: OracleMatrixContextItem,
  content = item.content,
  truncated = false,
): string {
  return `- [id=${item.id} | sources=${item.sourceIds.join(",")}] ${content}${
    truncated ? CONTEXT_TRUNCATION_SUFFIX : ""
  }`;
}

function renderOracleMatrixContextWithinBudget(input: {
  contextTokenBudget: number;
  countRenderedTokens: RenderedTokenCounter;
  items: readonly OracleMatrixContextItem[];
}): BudgetedOracleMatrixContext {
  const completeContext = renderOracleMatrixContext(input.items);
  const renderedContextTokensBeforeTruncation = input.countRenderedTokens(
    completeContext,
  );
  if (renderedContextTokensBeforeTruncation <= input.contextTokenBudget) {
    return {
      content: completeContext,
      contextCharsBeforeTruncation: completeContext.length,
      contextItems: [...input.items],
      contextTruncated: false,
      renderedContextTokens: renderedContextTokensBeforeTruncation,
      renderedContextTokensBeforeTruncation,
    };
  }

  const contextItems: OracleMatrixContextItem[] = [];
  let context = "";
  for (const item of input.items) {
    const separator = context === "" ? "" : "\n";
    const completeCandidate = `${context}${separator}${
      renderOracleMatrixContextItem(item)
    }`;
    if (
      input.countRenderedTokens(completeCandidate) <= input.contextTokenBudget
    ) {
      context = completeCandidate;
      contextItems.push(item);
      continue;
    }

    const codePoints = Array.from(item.content);
    let lower = 0;
    let upper = codePoints.length;
    let truncatedContext: string | null = null;
    let truncatedContent = "";
    while (lower <= upper) {
      const midpoint = Math.floor((lower + upper) / 2);
      const content = codePoints.slice(0, midpoint).join("");
      const candidate = `${context}${separator}${
        renderOracleMatrixContextItem(item, content, true)
      }`;
      if (input.countRenderedTokens(candidate) <= input.contextTokenBudget) {
        truncatedContent = content;
        truncatedContext = candidate;
        lower = midpoint + 1;
      } else {
        upper = midpoint - 1;
      }
    }
    if (truncatedContext !== null) {
      context = truncatedContext;
      contextItems.push({
        ...item,
        content: `${truncatedContent}${CONTEXT_TRUNCATION_SUFFIX}`,
      });
    }
    break;
  }

  return {
    content: context,
    contextCharsBeforeTruncation: completeContext.length,
    contextItems,
    contextTruncated: true,
    renderedContextTokens: input.countRenderedTokens(context),
    renderedContextTokensBeforeTruncation,
  };
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
  const unresolvedGoldEvidenceIds = [...new Set(
    testCase.unresolvedGoldEvidenceIds ?? [],
  )];
  const evaluable = unresolvedGoldEvidenceIds.length === 0;

  return {
    evaluable,
    goldEvidenceCount,
    retrievedEvidenceRecall:
      !evaluable
        ? null
        : goldEvidenceCount === 0
        ? 1
        : retrievedGoldEvidenceIds.size / goldEvidenceCount,
    retrievedGoldEvidenceCount: retrievedGoldEvidenceIds.size,
    retrievalRecallGivenStorage:
      !evaluable || storedGoldEvidenceIds.size === 0
        ? null
        : retrievedStoredEvidenceCount / storedGoldEvidenceIds.size,
    storageCoverage:
      !evaluable
        ? null
        : goldEvidenceCount === 0
          ? 1
          : storedGoldEvidenceIds.size / goldEvidenceCount,
    storedGoldEvidenceCount: storedGoldEvidenceIds.size,
    unresolvedGoldEvidenceIds,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runOracleMatrixCase(input: {
  contextTokenBudget?: number;
  countRenderedTokens: RenderedTokenCounter;
  genericReader: OracleMatrixReader;
  judge: OracleMatrixJudge;
  protocolReader: OracleMatrixProtocolReader;
  testCase: OracleMatrixCase;
}): Promise<OracleMatrixCaseResult[]> {
  const results: OracleMatrixCaseResult[] = [];
  const unresolvedGoldEvidenceIds = [...new Set(
    input.testCase.unresolvedGoldEvidenceIds ?? [],
  )];
  for (const arm of ORACLE_MATRIX_ARMS) {
    const contextItems = selectOracleMatrixContextItems({
      arm,
      testCase: input.testCase,
    });
    const budgetedContext = renderOracleMatrixContextWithinBudget({
      contextTokenBudget:
        input.contextTokenBudget ?? PHASE74_CONTEXT_TOKEN_BUDGET,
      countRenderedTokens: input.countRenderedTokens,
      items: contextItems,
    });
    const context = budgetedContext.content;
    const base = {
      arm,
      contextChars: context.length,
      contextCharsBeforeTruncation:
        budgetedContext.contextCharsBeforeTruncation,
      contextItemIds: budgetedContext.contextItems.map(({ id }) => id),
      contextTruncated: budgetedContext.contextTruncated,
      evaluable: true,
      renderedContextTokens: budgetedContext.renderedContextTokens,
      renderedContextTokensBeforeTruncation:
        budgetedContext.renderedContextTokensBeforeTruncation,
    };

    if (
      unresolvedGoldEvidenceIds.length > 0 &&
      (arm === "oracle-raw" ||
        arm === "oracle-memory" ||
        arm === "retrieved-gold-only")
    ) {
      results.push({
        ...base,
        answer: null,
        correct: null,
        evaluable: false,
        notEvaluableReason:
          `Upstream gold evidence is unavailable: ${unresolvedGoldEvidenceIds.join(", ")}`,
      });
      continue;
    }

    try {
      const answer = arm === "retrieved-full+protocol-reader"
        ? await input.protocolReader({
            caseId: input.testCase.caseId,
            context,
            contextItems: budgetedContext.contextItems,
            purpose: `oracle:${arm}`,
            protocolMetadata: input.testCase.protocolMetadata,
            question: input.testCase.question,
          })
        : await input.genericReader({
            caseId: input.testCase.caseId,
            context,
            purpose: `oracle:${arm}`,
            question: input.testCase.question,
          });
      const judgment = await input.judge({
        answer,
        caseId: input.testCase.caseId,
        expectedAnswer: input.testCase.expectedAnswer,
        purpose: `oracle:${arm}`,
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
