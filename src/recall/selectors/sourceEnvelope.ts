import type { RankedFactCandidate } from "../scoring";

const SOURCE_ENVELOPE_PATTERN = /^\[BEAM\s+chat_id=\d+\b/u;
const SOURCE_ENVELOPE_ROLE_PATTERN = /\[BEAM\s+chat_id=\d+\s+role=/u;
const SOURCE_CHAT_ID_PATTERN = /\bchat_id=(\d+)\b/u;
const SOURCE_CHAT_ID_ATTRIBUTES = ["chatId", "chat_id"] as const;
const SOURCE_ENVELOPE_CATEGORY = "external_benchmark";

export function isSourceEnvelopeContent(content: string): boolean {
  return SOURCE_ENVELOPE_PATTERN.test(content);
}

export function hasSourceEnvelopeRoleContent(content: string): boolean {
  return SOURCE_ENVELOPE_ROLE_PATTERN.test(content);
}

export function isSourceEnvelopeAcronym(token: string): boolean {
  return token === "BEAM";
}

export function isSourceEnvelopeCandidate(entry: RankedFactCandidate): boolean {
  return entry.fact.category === SOURCE_ENVELOPE_CATEGORY ||
    isSourceEnvelopeContent(entry.fact.content);
}

export function sourceEnvelopeCompletenessPriority(
  entry: RankedFactCandidate,
): number {
  return isSourceEnvelopeContent(entry.fact.content) ? 1 : 0;
}

export function sourceEnvelopeChatId(
  entry: RankedFactCandidate,
  rawContent: string,
): number | undefined {
  const chatIdMatch = rawContent.match(SOURCE_CHAT_ID_PATTERN);
  if (chatIdMatch?.[1]) {
    const parsed = Number(chatIdMatch[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  for (const key of SOURCE_CHAT_ID_ATTRIBUTES) {
    const value = entry.fact.attributes?.[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}
