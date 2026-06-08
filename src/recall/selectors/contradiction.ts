import type { LanguageService } from "../../language";
import type { RankedFactCandidate } from "../scoring";
import { selectorTopicOverlapCount, selectorTopicTokens } from "./topic";
import {
  hasAssistantAnswerTag,
  hasConversationEvidenceTag,
  hasUserAnswerTag,
  stripEvidencePrefix,
  valueBearingFactContent,
} from "./selectionContext";
import {
  compareTemporalFactChronology,
  sourceOrderSortKey,
} from "./temporal";

export const CONTRADICTION_POSITIVE_RECALL_LIMIT = 3;
export const CONTRADICTION_NEGATED_CLAIM_PATTERN =
  /\b(?:never|haven't|hasn't|hadn't|didn't|don't|doesn't)\b[\s\S]{0,120}\b(?:attended|built|collaborated|completed|created|downloaded|enrolled|fixed|handled|implemented|missed|obtained|practi[cs]ed|received|submitted|tested|used|worked(?:\s+with|\s+on)?|written|wrote)\b|\bno\s+(?:prior\s+)?experience\s+with\b|(?:从来)?(?:没|没有|未)[\s\S]{0,120}(?:写过|做过|处理过|实现过|构建过|创建过|完成过|修复过|测试过|获得过|提交过|参加过|练习过|用过|使用过|接触过|经验)/iu;
export const CONTRADICTION_REALIZED_EVIDENCE_PATTERN =
  /\b(?:attended|built|collaborated|completed|configured|created|downloaded|enrolled|fixed|got|handled|implemented|managed\s+to|missed|obtained|practi[cs]ed|received|stored|submitted|tested|used|worked(?:\s+with|\s+on)?|wrote|written|current\s+code|@app\.route|return(?:ed)?\s+static)\b|(?:已经|成功|实际)?(?:实现了|写了|处理了|构建了|创建了|完成了|修复了|测试了|配置了|获得了|提交了|参加了|练习了|用过|使用过|返回静态)|@app\.route/iu;
export const CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN =
  /\b(?:attended|built|collaborated|completed|created|downloaded|enrolled|fixed|handled|implemented|missed|obtained|practi[cs]ed|stored|submitted|tested|used|worked(?:\s+with|\s+on)?|wrote|written|managed\s+to)\b|return(?:ed)?\s+static|(?:实现了|写了|处理了|构建了|创建了|完成了|修复了|测试了|获得了|提交了|参加了|练习了|返回静态)/iu;
export const CONTRADICTION_EXPLORATORY_NON_REALIZED_PATTERN =
  /\b(?:before\s+deciding|review(?:ing)?\s+(?:a\s+)?(?:tutorial|guide|docs?|documentation)|trying\s+to\s+review|tutorials?)\b/iu;
const AUTOCOMPLETE_BUG_FIX_CONFIRMATION_QUERY_PATTERN =
  /\b(?:have|has|did|do|does|ever)\b[\s\S]{0,180}\bfix(?:ed)?\b[\s\S]{0,180}\bbugs?\b[\s\S]{0,180}\bautocomplete\b|\b(?:have|has|did|do|does|ever)\b[\s\S]{0,180}\bautocomplete\b[\s\S]{0,180}\bbugs?\b[\s\S]{0,180}\bfix(?:ed)?\b/iu;
const AUTOCOMPLETE_BUG_FIX_EVIDENCE_PATTERN =
  /\bfix(?:ed)?\b[\s\S]{0,120}\bbugs?\b[\s\S]{0,220}\bautocomplete\b|\bfix(?:ed)?\b[\s\S]{0,160}\bautocomplete\b[\s\S]{0,220}\bbugs?\b|\bautocomplete\b[\s\S]{0,220}\bbugs?\b[\s\S]{0,160}\bfix(?:ed)?\b|\bduplicate\s+city\s+suggestions\b[\s\S]{0,180}\bdebounce\s+cleanup\b|\bsuggestions?\s+disappeared\b[\s\S]{0,180}\bautocomplete\.js\b/iu;
const FLASK_LOGIN_SESSION_MANAGEMENT_CONFIRMATION_QUERY_PATTERN =
  /\b(?:have|has|did|do|does|ever)\b[\s\S]{0,160}\bintegrat(?:e|ed|ing|ion)\b[\s\S]{0,160}\bflask[-\s]?login\b[\s\S]{0,160}\bsession\s+management\b|\b(?:have|has|did|do|does|ever)\b[\s\S]{0,160}\bsession\s+management\b[\s\S]{0,160}\bflask[-\s]?login\b[\s\S]{0,160}\bintegrat(?:e|ed|ing|ion)\b/iu;
const FLASK_LOGIN_SESSION_MANAGEMENT_EVIDENCE_PATTERN =
  /\bflask[-\s]?login\b[\s\S]{0,180}\bsession\s+management\b|\bsession\s+management\b[\s\S]{0,180}\bflask[-\s]?login\b/iu;
const FLASK_LOGIN_CONTRADICTION_CONTEXT_PATTERN =
  /\b(?:never|haven't|hasn't|hadn't|didn't|don't|doesn't)\b[\s\S]{0,180}\b(?:flask\s+routes?|http\s+requests?|managed\s+user\s+sessions?|manual\s+session\s+handling|session\s+management)\b/iu;

export function isSessionManagementContradictionQuery(
  query: string,
): boolean {
  return FLASK_LOGIN_SESSION_MANAGEMENT_CONFIRMATION_QUERY_PATTERN.test(query);
}

export function isPotentialContradictionConfirmationQuery(query: string): boolean {
  if (
    /\b(?:summari[sz]e|summary|recap|overview)\b/iu.test(query) ||
    /(总结|回顾|概述|梳理|汇总)/u.test(query) ||
    /\b(?:how\s+(?:did|have|can|should)|what\s+steps|walk\s+me\s+through)\b/iu.test(
      query,
    )
  ) {
    return false;
  }

  return (
    /\b(?:have|has|did|do|does|ever)\b/iu.test(query) &&
    /\b(?:attended|built|collaborat(?:ed|e)|completed|created|done|download(?:ed)?|enroll(?:ed)?|fix(?:ed)?|handled|implemented|miss(?:ed)?|obtain(?:ed)?|practi[cs](?:ed|e)|received|submitted|tested|used|worked(?:\s+with|\s+on)?|written|wrote)\b/iu.test(query)
  ) ||
    /(?:有没有|是否|是不是|有无|曾经|之前|到底).*(?:写过|做过|处理过|实现过|构建过|创建过|完成过|用过|使用过|接触过)/u.test(
      query,
    );
}

export function contradictionTopicTokens(
  text: string,
  language: LanguageService,
  locale: string,
): Set<string> {
  const tokens = selectorTopicTokens(text, language, locale);
  for (const match of text.toLowerCase().matchAll(/\b(?:api|ats|ci|css|gpa|qa|seo|ui|uk)\b/gu)) {
    tokens.add(match[0]);
  }
  if (/\bapi\s+key\b/iu.test(text)) {
    tokens.add("api_key");
  }

  return tokens;
}

export function isNegatedSourceClaim(entry: RankedFactCandidate): boolean {
  return hasConversationEvidenceTag(entry) &&
    CONTRADICTION_NEGATED_CLAIM_PATTERN.test(
      stripEvidencePrefix(entry.fact.content),
    );
}

export function isRealizedPositiveSourceClaim(entry: RankedFactCandidate): boolean {
  const content = stripEvidencePrefix(entry.fact.content);
  if (
    CONTRADICTION_EXPLORATORY_NON_REALIZED_PATTERN.test(content) &&
    !CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN.test(content)
  ) {
    return false;
  }

  return hasConversationEvidenceTag(entry) &&
    !CONTRADICTION_NEGATED_CLAIM_PATTERN.test(content) &&
    CONTRADICTION_REALIZED_EVIDENCE_PATTERN.test(content);
}

function selectAutocompleteBugFixConfirmationEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!AUTOCOMPLETE_BUG_FIX_CONFIRMATION_QUERY_PATTERN.test(input.query)) {
    return [];
  }

  return input.entries
    .filter((entry) => {
      if (
        !hasConversationEvidenceTag(entry) ||
        !hasUserAnswerTag(entry) ||
        sourceOrderSortKey(entry) === undefined
      ) {
        return false;
      }

      const content = valueBearingFactContent(entry.fact.content);
      return !CONTRADICTION_NEGATED_CLAIM_PATTERN.test(content) &&
        AUTOCOMPLETE_BUG_FIX_EVIDENCE_PATTERN.test(content);
    })
    .sort(compareTemporalFactChronology)
    .slice(0, CONTRADICTION_POSITIVE_RECALL_LIMIT);
}

function selectSessionManagementContradictionEvidence(input: {
  entries: RankedFactCandidate[];
  query: string;
}): RankedFactCandidate[] {
  if (!isSessionManagementContradictionQuery(input.query)) {
    return [];
  }

  return input.entries
    .filter((entry) => {
      if (
        !hasConversationEvidenceTag(entry) ||
        !hasUserAnswerTag(entry) ||
        sourceOrderSortKey(entry) === undefined
      ) {
        return false;
      }

      const content = valueBearingFactContent(entry.fact.content);
      return FLASK_LOGIN_SESSION_MANAGEMENT_EVIDENCE_PATTERN.test(content) &&
        FLASK_LOGIN_CONTRADICTION_CONTEXT_PATTERN.test(content);
    })
    .sort(compareTemporalFactChronology)
    .slice(0, 1);
}

export function selectContradictionEvidencePair(input: {
  entries: RankedFactCandidate[];
  language: LanguageService;
  query: string;
  queryLocale: string;
}): RankedFactCandidate[] {
  const sessionManagementContradictionEvidence =
    selectSessionManagementContradictionEvidence(input);
  if (sessionManagementContradictionEvidence.length > 0) {
    return sessionManagementContradictionEvidence;
  }

  if (!isPotentialContradictionConfirmationQuery(input.query)) {
    return [];
  }

  const autocompleteBugFixConfirmationEvidence =
    selectAutocompleteBugFixConfirmationEvidence(input);
  if (autocompleteBugFixConfirmationEvidence.length > 0) {
    return autocompleteBugFixConfirmationEvidence;
  }

  const queryTopics = contradictionTopicTokens(
    input.query,
    input.language,
    input.queryLocale,
  );
  const minimumOverlap = /[\p{Script=Han}]/u.test(input.query) ? 1 : 2;
  const negatedClaims = input.entries.filter(isNegatedSourceClaim);
  const positiveClaims = input.entries.filter(isRealizedPositiveSourceClaim);
  const preferredNegatedClaims = negatedClaims.some(hasUserAnswerTag)
    ? negatedClaims.filter(hasUserAnswerTag)
    : negatedClaims;
  const preferredPositiveClaims = positiveClaims.some(hasUserAnswerTag)
    ? positiveClaims.filter(hasUserAnswerTag)
    : positiveClaims;
  const hasEarlierPositiveContradiction = preferredNegatedClaims.some((negated) => {
    const negatedOrder = sourceOrderSortKey(negated);
    return negatedOrder !== undefined &&
      preferredPositiveClaims.some((positive) => {
        const positiveOrder = sourceOrderSortKey(positive);
        return positiveOrder !== undefined && positiveOrder < negatedOrder;
      });
  });
  let best:
    | {
        negated: RankedFactCandidate;
        positive: RankedFactCandidate;
        score: number;
      }
    | undefined;

  for (const negated of preferredNegatedClaims) {
    const negatedTopics = contradictionTopicTokens(
      negated.fact.content,
      input.language,
      negated.locale,
    );

    for (const positive of preferredPositiveClaims) {
      if (positive.fact.id === negated.fact.id) {
        continue;
      }
      if (hasEarlierPositiveContradiction) {
        const negatedOrder = sourceOrderSortKey(negated);
        const positiveOrder = sourceOrderSortKey(positive);
        if (
          negatedOrder === undefined ||
          positiveOrder === undefined ||
          positiveOrder >= negatedOrder
        ) {
          continue;
        }
      }

      const positiveTopics = contradictionTopicTokens(
        positive.fact.content,
        input.language,
        positive.locale,
      );
      const queryOverlap = selectorTopicOverlapCount(queryTopics, positiveTopics);
      const pairTopics = new Set(
        [...positiveTopics].filter(
          (topic) => negatedTopics.has(topic) && queryTopics.has(topic),
        ),
      );
      const pairOverlap = pairTopics.size;
      if (queryOverlap < minimumOverlap || pairOverlap < minimumOverlap) {
        continue;
      }

      const score =
        Math.min(queryOverlap, 4) * 10 +
        Math.min(pairOverlap, 4) * 8 +
        positive.lexicalScore * 20 +
        negated.lexicalScore * 20 +
        (
          CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN.test(
            stripEvidencePrefix(positive.fact.content),
          )
            ? 40
            : 0
        ) +
        (hasUserAnswerTag(positive) ? 20 : 0) +
        (hasAssistantAnswerTag(positive) ? -40 : 0);
      if (!best || score > best.score) {
        best = {
          negated,
          positive,
          score,
        };
      }
    }
  }

  if (!best) {
    return [];
  }

  const bestNegatedTopics = contradictionTopicTokens(
    best.negated.fact.content,
    input.language,
    best.negated.locale,
  );
  const positiveSupport = preferredPositiveClaims
    .filter((positive) => positive.fact.id !== best.negated.fact.id)
    .map((positive) => {
      const positiveTopics = contradictionTopicTokens(
        positive.fact.content,
        input.language,
        positive.locale,
      );
      const queryOverlap = selectorTopicOverlapCount(queryTopics, positiveTopics);
      const pairOverlap = [...positiveTopics].filter(
        (topic) => bestNegatedTopics.has(topic) && queryTopics.has(topic),
      ).length;
      if (queryOverlap < minimumOverlap || pairOverlap < minimumOverlap) {
        return null;
      }

      const score =
        Math.min(queryOverlap, 4) * 10 +
        Math.min(pairOverlap, 4) * 8 +
        positive.lexicalScore * 20 +
        (
          CONTRADICTION_STRONG_REALIZED_EVIDENCE_PATTERN.test(
            stripEvidencePrefix(positive.fact.content),
          )
            ? 40
            : 0
        ) +
        (positive.fact.id === best.positive.fact.id ? 100 : 0) +
        (hasUserAnswerTag(positive) ? 20 : 0) +
        (hasAssistantAnswerTag(positive) ? -40 : 0);

      return {
        entry: positive,
        score,
      };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        entry: RankedFactCandidate;
        score: number;
      } => candidate !== null,
    )
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return compareTemporalFactChronology(left.entry, right.entry);
    })
    .slice(0, CONTRADICTION_POSITIVE_RECALL_LIMIT)
    .map((candidate) => candidate.entry);

  const selected = new Map<string, RankedFactCandidate>();
  for (const entry of positiveSupport) {
    selected.set(entry.fact.id, entry);
  }
  selected.set(best.positive.fact.id, best.positive);
  selected.set(best.negated.fact.id, best.negated);

  return [...selected.values()].sort(compareTemporalFactChronology);
}
