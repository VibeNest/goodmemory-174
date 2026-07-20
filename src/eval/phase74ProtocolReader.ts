import { buildAnswerEvidencePack } from "./protocol-reader/evidencePack";
import {
  PHASE74_CONTEXT_TOKEN_BUDGET,
  truncateRenderedContext,
} from "./oracleMatrix";
import type {
  OracleMatrixProtocolReader,
  OracleMatrixProtocolReaderInput,
  OracleMatrixReader,
  RenderedTokenCounter,
} from "./oracleMatrix";
import type { EvidenceTurn } from "./protocol-reader/evidencePack";

export const PHASE74_PROTOCOL_READER_SYSTEM_PROMPT = [
  "Follow the evaluation protocol framing below using only the visible evidence.",
  "Preserve source order, distinguish historical from current facts, and abstain when the requested detail is unsupported.",
  "Do not use benchmark labels as answer evidence.",
].join(" ");

function metadataString(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function protocolQuestionType(
  metadata: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (metadataString(metadata, "matchMode") === "adversarial_abstention") {
    return "abstention";
  }
  return metadataString(metadata, "questionType") ??
    metadataString(metadata, "question_type") ??
    metadataString(metadata, "category");
}

function evidenceTurns(
  input: OracleMatrixProtocolReaderInput,
): EvidenceTurn[] {
  if (input.contextItems && input.contextItems.length > 0) {
    return input.contextItems.map((item, index) => ({
      content: item.content,
      orderKey: index,
      role: item.role ?? "memory",
      sourceId: item.id,
      timeAnchor: item.observedAt ?? `source-order-${index + 1}`,
    }));
  }
  if (input.context.trim() === "") {
    return [];
  }
  return [{
    content: input.context,
    orderKey: 0,
    role: "memory",
    sourceId: "rendered-context",
    timeAnchor: "source-order-1",
  }];
}

export function buildPhase74ProtocolReaderContext(
  input: OracleMatrixProtocolReaderInput,
): string {
  const evidencePack = buildAnswerEvidencePack({
    question: input.question,
    questionType: protocolQuestionType(input.protocolMetadata),
    turns: evidenceTurns(input),
  });
  return [PHASE74_PROTOCOL_READER_SYSTEM_PROMPT, evidencePack].join("\n\n");
}

export function createPhase74ProtocolReader(input: {
  contextTokenBudget?: number;
  countRenderedTokens: RenderedTokenCounter;
  reader: OracleMatrixReader;
}): OracleMatrixProtocolReader {
  return async (payload) => {
    const context = truncateRenderedContext({
      content: buildPhase74ProtocolReaderContext(payload),
      contextTokenBudget:
        input.contextTokenBudget ?? PHASE74_CONTEXT_TOKEN_BUDGET,
      countRenderedTokens: input.countRenderedTokens,
    }).content;
    const purpose = payload.purpose?.startsWith("protocol:") === true
      ? payload.purpose
      : `protocol:${payload.purpose ?? "phase74"}`;
    return input.reader({
      ...(payload.caseId === undefined ? {} : { caseId: payload.caseId }),
      context,
      purpose,
      question: payload.question,
    });
  };
}
